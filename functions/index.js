import { allocateGradingSession } from './session-store.js';
import { submitVerifiedGrading } from './grading-submission.js';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { lookupPublicCertificate, requireCertificateId } from './certificate-registry.js';
import { issueVerifiedGroupCertificate } from './certificate-issuance-service.js';
import { requireCaseId } from './grading-core.js';
import { membershipForClient } from './suite-membership.js';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp as initializeSecondaryApp } from 'firebase-admin/app';
import { linkCyberTraceIdentity, currentCyberTraceLink, unlinkCyberTraceIdentity } from './cybertrace-identity-service.js';
import { requireLabStageKey, beginLabStageAssessment, submitLabStageAssessment } from './lab-stage-assessment.js';
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

// Additional server-side assessment of BLACKBOX stage KNOWLEDGE (not sufficient
// for a practical credential without independently verified lab evidence).
// Only reviewed, administrator-installed public/private challenge pairs run.
export const beginVerifiedLabStage = onCall({
  region: REGION, enforceAppCheck: true, maxInstances: 5,
}, async request => {
  const uid=authUid(request);
  if(!request.data||Object.keys(request.data).length!==1)throw new HttpsError('invalid-argument','Only stageKey is accepted.');
  let stageKey;
  try{stageKey=requireLabStageKey(request.data.stageKey);}
  catch{throw new HttpsError('invalid-argument','Invalid stage.');}
  try{return await beginLabStageAssessment(db,FieldValue,{uid,stageKey});}
  catch(error){
    if(error.message==='lab-stage-quota-exceeded')throw new HttpsError('resource-exhausted','Assessment rate limit reached.');
    throw new HttpsError('failed-precondition','Trusted stage assessment not available for this stage.');
  }
});

export const submitVerifiedLabStage = onCall({
  region: REGION, enforceAppCheck: true, maxInstances: 5,
}, async request => {
  const uid=authUid(request);
  if(!request.data||Object.keys(request.data).length!==3||
    !Object.hasOwn(request.data,'stageKey')||!Object.hasOwn(request.data,'sessionId')||
    !Object.hasOwn(request.data,'responses'))throw new HttpsError('invalid-argument','Invalid assessment submission.');
  let stageKey;
  try{stageKey=requireLabStageKey(request.data.stageKey);}
  catch{throw new HttpsError('invalid-argument','Invalid stage.');}
  try{return await submitLabStageAssessment(db,FieldValue,{
    uid,stageKey,sessionId:request.data.sessionId,responses:request.data.responses,
  });}
  catch{throw new HttpsError('failed-precondition','Session expired, already used, or invalid.');}
});

// Cross-project identity proof: BLACKBOX Auth and App Check authenticate this
// call; a second, independently verified CyberTrace ID token proves possession
// of the other account. No email matching or client-provided UID is trusted.
const CYBERTRACE_PROJECT_ID = 'cybertrace-48ab0';
const cybertraceVerifier = () => {
  const app = getApps().find(value => value.name === 'cybertrace-token-verifier') ??
    initializeSecondaryApp({projectId:CYBERTRACE_PROJECT_ID},'cybertrace-token-verifier');
  return getAuth(app);
};
export const linkVerifiedCyberTraceAccount = onCall({
  region: REGION, enforceAppCheck: true, maxInstances: 5,
}, async request => {
  const uid=authUid(request), data=request.data;
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).length !== 2 || typeof data.cybertraceIdToken !== 'string' ||
      data.cybertraceIdToken.length > 8192 || data.consent !== true) {
    throw new HttpsError('invalid-argument','Explicit dual-account consent and a CyberTrace token are required.');
  }
  let claims;
  try {
    claims = await cybertraceVerifier().verifyIdToken(data.cybertraceIdToken,true);
  } catch {
    throw new HttpsError('unauthenticated','CyberTrace authentication must be refreshed.');
  }
  try {
    return await linkCyberTraceIdentity(db,FieldValue,{
      blackboxUid:uid,blackboxClaims:request.auth.token,cybertraceClaims:claims,consent:true,
    });
  } catch (error) {
    if (error.message === 'recent-login-required') {
      throw new HttpsError('failed-precondition','Sign in again to both accounts before linking.');
    }
    if (error.message === 'identity-already-linked') {
      throw new HttpsError('already-exists','One of these accounts is already linked to a different identity.');
    }
    throw new HttpsError('failed-precondition','Unable to verify account ownership.');
  }
});

export const getVerifiedCyberTraceLink = onCall({
  region: REGION, enforceAppCheck: true, maxInstances: 5,
}, async request => {
  const uid=authUid(request);
  if (request.data && Object.keys(request.data).length) throw new HttpsError('invalid-argument','Unexpected parameters.');
  try { return await currentCyberTraceLink(db,uid); }
  catch { throw new HttpsError('unavailable','Cannot read account link right now.'); }
});

export const unlinkVerifiedCyberTraceAccount = onCall({
  region: REGION, enforceAppCheck: true, maxInstances: 5,
}, async request => {
  const uid=authUid(request);
  if (!request.data || Object.keys(request.data).length !== 1 || request.data.consent !== true) {
    throw new HttpsError('invalid-argument','Explicit unlink confirmation is required.');
  }
  try { return await unlinkCyberTraceIdentity(db,uid); }
  catch { throw new HttpsError('failed-precondition','Unable to unlink; contact support.'); }
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

// Public verification reads ONLY server-issued records. The registry cannot be
// populated from this endpoint or from user-controlled Firestore progress.
// Legacy PDF training records deliberately have no valid certificate ID.
export const verifyIssuedCertificate = onRequest({
  region: REGION, maxInstances: 10,
  cors: [
    'https://blackboxlab.dev', 'https://www.blackboxlab.dev',
    'https://cybertracelab.dev', 'https://www.cybertracelab.dev',
  ],
}, async (request, response) => {
  response.set('Cache-Control', 'no-store');
  response.set('X-Content-Type-Options', 'nosniff');
  response.set('Referrer-Policy', 'no-referrer');
  if (request.method !== 'GET') {
    response.set('Allow', 'GET');
    response.status(405).json({ error: 'method-not-allowed' });
    return;
  }
  let certificateId;
  try { certificateId = requireCertificateId(request.query?.id); }
  catch { response.status(400).json({ error: 'invalid-certificate-id', valid: false }); return; }
  try {
    const record = await lookupPublicCertificate(db, certificateId);
    if (!record) {
      response.status(404).json({ status: 'not-found', valid: false });
      return;
    }
    response.status(200).json(record);
  } catch {
    response.status(503).json({ status: 'unavailable', valid: false });
  }
});

// No group certificate may be issued from production before per-group verified
// rubrics, review, Auth/App Check configuration, and owner approval are complete.
// Changing this gate is a SEPARATE security-reviewed release, not a database toggle.
const CERTIFICATE_ISSUANCE_ENABLED = false;
export const issueGroupCertificate = onCall({
  region: REGION, enforceAppCheck: true, maxInstances: 5,
}, async request => {
  const uid=authUid(request);
  if (!CERTIFICATE_ISSUANCE_ENABLED) {
    throw new HttpsError('failed-precondition', 'Verified certificate issuance is not enabled.');
  }
  const data=request.data;
  if (!data || typeof data!=='object' || Array.isArray(data) ||
      Object.keys(data).length!==3 ||
      !Object.hasOwn(data,'issuer') || !Object.hasOwn(data,'groupId') ||
      data.consent!==true) {
    throw new HttpsError('invalid-argument','Invalid certificate request.');
  }
  try {
    return await issueVerifiedGroupCertificate(db,FieldValue,{
      uid,issuer:data.issuer,groupId:data.groupId,consent:true,
    });
  } catch (error) {
    if (['unsupported-certificate-group','consent-required'].includes(error?.message)) {
      throw new HttpsError('invalid-argument','Unsupported request.');
    }
    if (['group-assessments-not-available','certificate-policy-disabled',
        'verified-assessments-incomplete','identity-link-required'].includes(error?.message)) {
      throw new HttpsError('failed-precondition','Server-graded requirements are not yet met.');
    }
    throw new HttpsError('unavailable','Certificate issuance could not be completed.');
  }
});
