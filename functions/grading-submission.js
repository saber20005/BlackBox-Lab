import { gradeAnswer, validateSession } from './grading-core.js';

// All authorization-sensitive reads and the single-use state transition share one transaction.
export async function submitVerifiedGrading(db, FieldValue, { uid, caseId, sessionId, answer }, now = () => Date.now()) {
  const sessionRef = db.doc(`gradingSessions/${sessionId}`);
  const rubricRef = db.doc(`gradingRubrics/${caseId}`);
  const resultRef = db.doc(`blackboxUsers/${uid}/verifiedCybertrace/${caseId}`);
  return db.runTransaction(async transaction => {
    const [sessionSnap, rubricSnap, previousSnap] = await Promise.all([
      transaction.get(sessionRef), transaction.get(rubricRef), transaction.get(resultRef)
    ]);
    validateSession(sessionSnap.data(), uid, caseId, now());
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
}
