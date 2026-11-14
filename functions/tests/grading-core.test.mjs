import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAnswer, validateSession, requireCaseId, SESSION_LIFETIME_MS } from '../grading-core.js';
const rubric = { acceptedAnswers: ['segmented network'], maxScore: 70 };
test('server computes score from answer, not submitted points', () => {
  assert.equal(gradeAnswer(' Segmented Network ', rubric), 70);
  assert.equal(gradeAnswer('wrong', rubric), 0);
});
test('invalid and oversized input fails closed', () => {
  assert.throws(() => gradeAnswer('x'.repeat(257), rubric));
  assert.throws(() => gradeAnswer('anything', { acceptedAnswers: [], maxScore: 70 }));
  assert.throws(() => gradeAnswer('anything', { acceptedAnswers: ['anything'], maxScore: 100 }));
  assert.throws(() => requireCaseId('INC-0000/other'));
});
test('session rejects wrong user, case, replay and expiration', () => {
  const now = Date.now();
  const session = { uid: 'alice', caseId: 'INC-0417', status: 'open', expiresAtMs: now + SESSION_LIFETIME_MS };
  assert.doesNotThrow(() => validateSession(session, 'alice', 'INC-0417', now));
  assert.throws(() => validateSession(session, 'bob', 'INC-0417', now));
  assert.throws(() => validateSession(session, 'alice', 'INC-0512', now));
  assert.throws(() => validateSession({ ...session, status: 'consumed' }, 'alice', 'INC-0417', now));
  assert.throws(() => validateSession(session, 'alice', 'INC-0417', now + SESSION_LIFETIME_MS));
});
