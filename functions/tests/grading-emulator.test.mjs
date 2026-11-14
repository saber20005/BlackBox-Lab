import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { allocateGradingSession } from '../session-store.js';
import { submitVerifiedGrading } from '../grading-submission.js';
import { MAX_SESSIONS_PER_WINDOW } from '../rate-limit.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  test('grading integration requires local Firestore emulator', { skip: true }, () => {});
} else {
  const host = process.env.FIRESTORE_EMULATOR_HOST.split(':')[0];
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(host), 'Production Firestore forbidden');
  const root = process.env.BLACKBOX_FIREBASE_TEST_DEPS;
  assert.ok(root, 'Emulator dependency directory required');
  const require = createRequire(`${root}/package.json`);
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  let app, db;
  before(() => {
    app = initializeApp({ projectId: 'demo-blackbox-account-tests' }, 'grading-emulator-tests');
    db = getFirestore(app);
  });
  after(async () => { if (app) await deleteApp(app); });

  test('parallel requests cannot exceed per-user quota; another UID is independent', async () => {
    const uid = `quota-${Date.now()}`;
    const attempts = await Promise.allSettled(
      Array.from({ length: MAX_SESSIONS_PER_WINDOW + 8 }, () =>
        allocateGradingSession(db, FieldValue, uid, 'INC-0417'))
    );
    const successes = attempts.filter(item => item.status === 'fulfilled');
    assert.ok(successes.length > 0 && successes.length <= MAX_SESSIONS_PER_WINDOW);
    // Contention may abort some requests; fill remaining slots sequentially.
    for (let i = successes.length; i < MAX_SESSIONS_PER_WINDOW; i++) {
      successes.push({ status: 'fulfilled', value: await allocateGradingSession(db, FieldValue, uid, 'INC-0417') });
    }
    await assert.rejects(allocateGradingSession(db, FieldValue, uid, 'INC-0417'), /quota-exceeded/);
    const ids = successes.map(item => item.value.sessionId);
    assert.equal(new Set(ids).size, MAX_SESSIONS_PER_WINDOW);
    const quota = (await db.doc(`gradingQuotas/${uid}`).get()).data();
    assert.equal(quota.count, MAX_SESSIONS_PER_WINDOW);
    for (const id of ids) {
      const session = (await db.doc(`gradingSessions/${id}`).get()).data();
      assert.equal(session.uid, uid);
      assert.equal(session.status, 'open');
    }
    const other = await allocateGradingSession(db, FieldValue, uid + '-other', 'INC-0417');
    assert.ok(other.sessionId);
  });
  test('grading transaction rejects cross-user, replay, expiry, and preserves best score', async () => {
    const uid = `grading-${Date.now()}`;
    const caseId = 'INC-0456';
    await db.doc(`gradingRubrics/${caseId}`).set({ enabled: true, version: 1, acceptedAnswers: ['correct'], maxScore: 70 });
    const first = await allocateGradingSession(db, FieldValue, uid, caseId);
    const payload = { uid, caseId, sessionId: first.sessionId, answer: 'correct' };
    await assert.rejects(submitVerifiedGrading(db, FieldValue, { ...payload, uid: uid + '-attacker' }), /invalid-session/);
    await assert.rejects(submitVerifiedGrading(db, FieldValue, { ...payload, caseId: 'INC-0457' }), /invalid-session/);
    const results = await Promise.allSettled([
      submitVerifiedGrading(db, FieldValue, payload),
      submitVerifiedGrading(db, FieldValue, payload)
    ]);
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1, 'single-use transaction must have one winner');
    assert.equal(results.find(x => x.status === 'fulfilled').value.score, 70);
    await assert.rejects(submitVerifiedGrading(db, FieldValue, payload), /invalid-session/);
    const second = await allocateGradingSession(db, FieldValue, uid, caseId);
    const lower = await submitVerifiedGrading(db, FieldValue, { ...payload, sessionId: second.sessionId, answer: 'wrong' });
    assert.equal(lower.score, 0);
    assert.equal(lower.bestScore, 70);
    const saved = (await db.doc(`blackboxUsers/${uid}/verifiedCybertrace/${caseId}`).get()).data();
    assert.equal(saved.bestScore, 70);
    assert.equal(saved.source, 'server-grading');
    const expired = await allocateGradingSession(db, FieldValue, uid, caseId, () => 1);
    await assert.rejects(submitVerifiedGrading(db, FieldValue, { ...payload, sessionId: expired.sessionId }), /invalid-session/);
  });

}
