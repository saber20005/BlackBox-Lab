import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireCaseId, gradeAnswer, validateSession, SESSION_LIFETIME_MS } from './grading-core.js';

initializeApp();
const db = getFirestore();
const REGION = 'us-central1';
// Server-owned rubrics are deliberately NOT provided by the client.
// No case is enabled until a trusted rubric is provisioned by an administrator
// in server-only /gradingRubrics/{caseId} (client Firestore rules deny access).
const authUid = request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  return request.auth.uid;
};
const invalid = () => new HttpsError('failed-precondition', 'Challenge unavailable or invalid.');
export const startGradingSession = onCall({ region: REGION, enforceAppCheck: true, maxInstances: 10 }, async request => {
  const uid = authUid(request);
  let caseId;
  try { caseId = requireCaseId(request.data?.caseId); } catch { throw new HttpsError('invalid-argument', 'Invalid case ID.'); }
  const rubricSnap = await db.doc(`gradingRubrics/${caseId}`).get();
  if (!rubricSnap.exists || rubricSnap.data()?.enabled !== true) throw invalid();
  const sessionId = randomUUID();
  const now = Date.now();
  await db.doc(`gradingSessions/${sessionId}`).create({
    uid, caseId, status: 'open', createdAt: FieldValue.serverTimestamp(),
    expiresAtMs: now + SESSION_LIFETIME_MS, attempts: 0
  });
  return { sessionId, caseId, expiresAtMs: now + SESSION_LIFETIME_MS };
});
export const submitGradingAnswer = onCall({ region: REGION, enforceAppCheck: true, maxInstances: 10 }, async request => {
  const uid = authUid(request);
  const { sessionId, answer } = request.data ?? {};
  let caseId;
  try {
    caseId = requireCaseId(request.data?.caseId);
    if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/.test(sessionId)) throw new Error('invalid-session-id');
    if (typeof answer !== 'string' || answer.length > 256) throw new Error('invalid-answer');
  } catch { throw new HttpsError('invalid-argument', 'Invalid submission.'); }
  const sessionRef = db.doc(`gradingSessions/${sessionId}`);
  const rubricRef = db.doc(`gradingRubrics/${caseId}`);
  const resultRef = db.doc(`blackboxUsers/${uid}/verifiedCybertrace/${caseId}`);
  try {
    return await db.runTransaction(async transaction => {
      const [sessionSnap, rubricSnap, previousSnap] = await Promise.all([
        transaction.get(sessionRef), transaction.get(rubricRef), transaction.get(resultRef)
      ]);
      validateSession(sessionSnap.data(), uid, caseId, Date.now());
      const rubric = rubricSnap.data();
      if (!rubricSnap.exists || rubric.enabled !== true) throw new Error('invalid-rubric');
      const score = gradeAnswer(answer, rubric);
      const oldScore = previousSnap.exists ? previousSnap.data()?.bestScore : -1;
      if (!Number.isSafeInteger(oldScore) || oldScore < -1 || oldScore > 70) throw new Error('invalid-previous-result');
      transaction.update(sessionRef, { status: 'consumed', attempts: 1, consumedAt: FieldValue.serverTimestamp() });
      if (score > oldScore) {
        transaction.set(resultRef, {
          schemaVersion: 1, source: 'server-grading', caseId,
          bestScore: score, rubricVersion: rubric.version ?? 1,
          updatedAt: FieldValue.serverTimestamp(),
          firstVerifiedAt: previousSnap.exists ? previousSnap.data().firstVerifiedAt : FieldValue.serverTimestamp()
        });
      }
      return { caseId, score, bestScore: Math.max(score, oldScore), verifiedByServer: true };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw invalid();
  }
});
