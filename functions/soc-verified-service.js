import { randomUUID } from 'node:crypto';
import {
  VERIFIED_SOC_TTL_MS, VERIFIED_SOC_MAX_SCORE, requireVerifiedSocId,
  publicSocChallenge, assertSocRubric, scoreVerifiedSoc, nextSocQuota,
} from './soc-verified-core.js';

const safeUid = uid => typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && !uid.includes('/');
const validSessionId = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
const conditions = (uid, shiftId) => {
  if (!safeUid(uid)) throw new Error('unauthenticated');
  requireVerifiedSocId(shiftId);
};

// Admin-provisioned Firestore collections: client read/write DENIED by explicit rules.
// Catalog exposes only scenario text and options. The independent rubric is never returned.
export async function startVerifiedSocSession(db, FieldValue, uid, shiftId, now = () => Date.now(), uuid = randomUUID) {
  conditions(uid, shiftId);
  const sessionId = uuid();
  if (!validSessionId(sessionId)) throw new Error('invalid-session-id');
  const catalogRef = db.doc(`socVerifiedCatalog/${shiftId}`);
  const rubricRef = db.doc(`socVerifiedRubrics/${shiftId}`);
  const quotaRef = db.doc(`socVerifiedQuotas/${uid}`);
  const sessionRef = db.doc(`socVerifiedSessions/${sessionId}`);

  return db.runTransaction(async tx => {
    const [catalogSnap, rubricSnap, quotaSnap] = await Promise.all([
      tx.get(catalogRef), tx.get(rubricRef), tx.get(quotaRef),
    ]);
    if (!catalogSnap.exists || catalogSnap.data()?.enabled !== true || !rubricSnap.exists) throw new Error('challenge-unavailable');
    const challenge = publicSocChallenge(catalogSnap.data(), shiftId);
    assertSocRubric(rubricSnap.data(), challenge);
    const current = now();
    const quota = nextSocQuota(quotaSnap.exists ? quotaSnap.data() : null, current);
    const expiresAtMs = current + VERIFIED_SOC_TTL_MS;
    tx.set(quotaRef, quota);
    tx.create(sessionRef, {
      uid, shiftId, status: 'open', rubricVersion: challenge.version,
      createdAt: FieldValue.serverTimestamp(), expiresAtMs,
      attempts: 0,
    });
    return { shiftId, sessionId, expiresAtMs, challenge };
  });
}

// Transactional consume+grade+best-score write. Never accept UID, score, maxScore or rubric from request.
export async function submitVerifiedSocSession(db, FieldValue, { uid, shiftId, sessionId, responses, correlationId }, now = () => Date.now()) {
  conditions(uid, shiftId);
  if (!validSessionId(sessionId)) throw new Error('invalid-session-id');
  const sessionRef = db.doc(`socVerifiedSessions/${sessionId}`);
  const catalogRef = db.doc(`socVerifiedCatalog/${shiftId}`);
  const rubricRef = db.doc(`socVerifiedRubrics/${shiftId}`);
  const resultRef = db.doc(`blackboxUsers/${uid}/verifiedSocShifts/${shiftId}`);

  return db.runTransaction(async tx => {
    const [sessionSnap, catalogSnap, rubricSnap, priorSnap] = await Promise.all([
      tx.get(sessionRef), tx.get(catalogRef), tx.get(rubricRef), tx.get(resultRef),
    ]);
    const session = sessionSnap.exists ? sessionSnap.data() : null;
    const current = now();
    if (!session || session.uid !== uid || session.shiftId !== shiftId ||
        session.status !== 'open' || session.attempts !== 0 ||
        !Number.isSafeInteger(session.expiresAtMs) || current >= session.expiresAtMs ||
        !catalogSnap.exists || catalogSnap.data()?.enabled !== true || !rubricSnap.exists) {
      throw new Error('invalid-or-expired-session');
    }
    const challenge = publicSocChallenge(catalogSnap.data(), shiftId);
    if (session.rubricVersion !== challenge.version) throw new Error('rubric-version-mismatch');
    const rubric = rubricSnap.data();
    assertSocRubric(rubric, challenge);
    const assessment = scoreVerifiedSoc({ responses, correlationId }, challenge, rubric);
    const previous = priorSnap.exists ? priorSnap.data() : null;
    const previousScore = previous ? previous.bestScore : -1;
    if (!Number.isSafeInteger(previousScore) || previousScore < -1 || previousScore > VERIFIED_SOC_MAX_SCORE) throw new Error('invalid-existing-result');
    tx.update(sessionRef, { status: 'consumed', attempts: 1, consumedAt: FieldValue.serverTimestamp() });
    if (assessment.score > previousScore) {
      tx.set(resultRef, {
        schemaVersion: 1, source: 'server-grading', shiftId,
        bestScore: assessment.score, rubricVersion: challenge.version,
        updatedAt: FieldValue.serverTimestamp(),
        firstVerifiedAt: previous ? previous.firstVerifiedAt : FieldValue.serverTimestamp(),
      });
    }
    // Breakdown is computed by server; never reveal answer keys or expose UID.
    return {
      shiftId, verifiedByServer: true, score: assessment.score,
      bestScore: Math.max(assessment.score, previousScore),
      maxScore: VERIFIED_SOC_MAX_SCORE, priorityScore: assessment.priorityScore,
      responseScore: assessment.responseScore, correlationScore: assessment.correlationScore,
    };
  });
}
