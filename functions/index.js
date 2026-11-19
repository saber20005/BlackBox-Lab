import { allocateGradingSession } from './session-store.js';
import { submitVerifiedGrading } from './grading-submission.js';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireCaseId } from './grading-core.js';
import { membershipForClient } from './suite-membership.js';
import { startVerifiedSocSession, submitVerifiedSocSession } from './soc-verified-service.js';
import { requireVerifiedSocId } from './soc-verified-core.js';

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
  try {
    return await allocateGradingSession(db, FieldValue, uid, caseId);
  } catch (error) {
    if (error?.message === 'quota-exceeded') throw new HttpsError('resource-exhausted', 'Hourly session limit reached.');
    throw new HttpsError('internal', 'Unable to start a grading session.');
  }
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
  try {
    return await submitVerifiedGrading(db, FieldValue, { uid, caseId, sessionId, answer });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw invalid();
  }
});

// Read-only membership endpoint. This cannot grant Pro access or process payments.
// Requires BLACKBOX Firebase Auth and App Check; the UID is taken exclusively
// from the verified caller, never from submitted data or CyberTrace email.
export const getSuiteMembership = onCall({ region: REGION, enforceAppCheck: true, maxInstances: 10 }, async request => {
  const uid = authUid(request);
  try {
    const snap = await db.doc(`suiteMemberships/${uid}`).get();
    return membershipForClient(snap.exists ? snap.data() : null);
  } catch {
    throw new HttpsError('unavailable', 'Membership status is temporarily unavailable.');
  }
});

// New server-verified SOC pilot. Disabled in production until the admin
// publishes BOTH a public catalog document and private rubric document.
// The existing free browser-scored SOC shifts and CyberTrace XP are untouched.
const socRequest = (data, names) => data && typeof data === 'object' && !Array.isArray(data) &&
  Object.keys(data).length === names.length && names.every(key => Object.hasOwn(data, key));

export const startVerifiedSocShift = onCall({ region: REGION, enforceAppCheck: true, maxInstances: 10 }, async request => {
  const uid = authUid(request);
  if (!socRequest(request.data, ['shiftId'])) throw new HttpsError('invalid-argument', 'Invalid challenge request.');
  let shiftId;
  try { shiftId = requireVerifiedSocId(request.data.shiftId); }
  catch { throw new HttpsError('invalid-argument', 'Unsupported challenge.'); }
  try {
    return await startVerifiedSocSession(db, FieldValue, uid, shiftId);
  } catch (error) {
    if (error?.message === 'quota-exceeded') throw new HttpsError('resource-exhausted', 'Session limit reached. Try again later.');
    if (error?.message === 'challenge-unavailable' || error?.message === 'invalid-private-rubric' || error?.message === 'invalid-public-challenge') {
      throw new HttpsError('failed-precondition', 'Verified SOC training is not enabled yet.');
    }
    throw new HttpsError('unavailable', 'Unable to start verified assessment.');
  }
});

export const submitVerifiedSocShift = onCall({ region: REGION, enforceAppCheck: true, maxInstances: 10 }, async request => {
  const uid = authUid(request);
  if (!socRequest(request.data, ['shiftId', 'sessionId', 'responses', 'correlationId'])) {
    throw new HttpsError('invalid-argument', 'Unexpected submission fields.');
  }
  let shiftId;
  try { shiftId = requireVerifiedSocId(request.data.shiftId); }
  catch { throw new HttpsError('invalid-argument', 'Unsupported challenge.'); }
  try {
    return await submitVerifiedSocSession(db, FieldValue, { ...request.data, uid, shiftId });
  } catch (error) {
    if (error?.message === 'invalid-submission' || error?.message === 'invalid-session-id') {
      throw new HttpsError('invalid-argument', 'Invalid answer format.');
    }
    if (['invalid-or-expired-session', 'rubric-version-mismatch'].includes(error?.message)) {
      throw new HttpsError('failed-precondition', 'Session expired or already used. Start a new challenge.');
    }
    throw new HttpsError('failed-precondition', 'Verified submission could not be accepted.');
  }
});
