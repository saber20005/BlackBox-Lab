import { randomUUID } from 'node:crypto';
import { nextQuota } from './rate-limit.js';
import { SESSION_LIFETIME_MS } from './grading-core.js';

// Firestore transaction is the security boundary; no client-side quota is trusted.
export async function allocateGradingSession(db, FieldValue, uid, caseId, now = () => Date.now()) {
  const sessionId = randomUUID();
  const quotaRef = db.doc(`gradingQuotas/${uid}`);
  const sessionRef = db.doc(`gradingSessions/${sessionId}`);
  const expiresAtMs = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(quotaRef);
    const current = now();
    const quota = nextQuota(snapshot.exists ? snapshot.data() : null, current);
    const expiry = current + SESSION_LIFETIME_MS;
    transaction.set(quotaRef, quota);
    transaction.create(sessionRef, {
      uid, caseId, status: 'open', createdAt: FieldValue.serverTimestamp(),
      expiresAtMs: expiry, attempts: 0
    });
    return expiry;
  });
  return { sessionId, caseId, expiresAtMs };
}
