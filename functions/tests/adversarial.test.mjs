import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAnswer, normalizeAnswer, requireCaseId, validateSession, SESSION_LIFETIME_MS } from '../grading-core.js';
import { nextQuota, MAX_SESSIONS_PER_WINDOW, WINDOW_MS } from '../rate-limit.js';

const rubric = { acceptedAnswers: ['forensic-marker'], maxScore: 70 };
const base = { uid: 'alice', caseId: 'INC-0001', status: 'open', expiresAtMs: 10000 };
test('untrusted score and extra fields cannot affect grading', () => {
  assert.equal(gradeAnswer('wrong', { ...rubric, score: 70, verifiedByServer: true }), 0);
  assert.equal(gradeAnswer(' FORENSIC-MARKER ', rubric), 70);
});
test('rejects wrong owner, case, consumed and expired sessions', () => {
  for (const [session, uid, caseId, now] of [
    [base, 'bob', 'INC-0001', 100],
    [base, 'alice', 'INC-0002', 100],
    [{ ...base, status: 'consumed' }, 'alice', 'INC-0001', 100],
    [base, 'alice', 'INC-0001', 10000],
    [{ ...base, expiresAtMs: '10000' }, 'alice', 'INC-0001', 100]
  ]) assert.throws(() => validateSession(session, uid, caseId, now), /invalid-session/);
});
test('rejects oversized payloads and malformed case IDs', () => {
  assert.throws(() => normalizeAnswer('x'.repeat(257)), /invalid-answer/);
  for (const id of ['INC-1', 'INC-0001/../admin', 'INC-0001 ', null]) {
    assert.throws(() => requireCaseId(id), /invalid-case/);
  }
});
test('rejects malformed or overpowered rubrics', () => {
  for (const invalid of [{ acceptedAnswers: ['x'], maxScore: 71 }, { acceptedAnswers: [], maxScore: 70 },
    { acceptedAnswers: ['x'], maxScore: Infinity }, null]) {
    assert.throws(() => gradeAnswer('x', invalid), /invalid-rubric/);
  }
});
test('quota reset and strict cap are enforced', () => {
  let state = null;
  for (let i = 0; i < MAX_SESSIONS_PER_WINDOW; i++) state = nextQuota(state, 1000);
  assert.throws(() => nextQuota(state, 1000), /quota-exceeded/);
  assert.equal(nextQuota(state, 1000 + WINDOW_MS).count, 1);
  assert.equal(SESSION_LIFETIME_MS, 600000);
});
