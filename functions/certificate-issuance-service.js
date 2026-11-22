import { randomBytes } from 'node:crypto';
import { requireCertificateId, publicCertificateView } from './certificate-registry.js';
import { requireCertificateGroup } from './certificate-manifests.js';

const validUid = uid => typeof uid === 'string' && uid.length>0 && uid.length<=128 && !uid.includes('/');
const dateOf = value => value instanceof Date ? value : value?.toDate?.();
const realDate = value => { const d=dateOf(value); return d instanceof Date && Number.isFinite(d.getTime()) && d.getTime()>0; };
export const opaqueCertificateId = () => randomBytes(16).toString('hex');
export const policyIdFor = manifest => manifest.issuer+'_'+manifest.groupId+'_v'+manifest.version;
const proofRefFor = (uid, manifest, caseId) => 'blackboxUsers/'+uid+'/verifiedCybertrace/'+caseId;

// An administrator must explicitly publish a reviewed private policy. This
// is IN ADDITION to the disabled runtime feature gate in functions/index.js.
export function validIssuancePolicy(policy, manifest) {
  return Boolean(policy && !Array.isArray(policy) &&
    policy.schemaVersion===1 && policy.enabled===true &&
    policy.reviewed===true && policy.issuer===manifest.issuer &&
    policy.groupId===manifest.groupId && policy.version===manifest.version &&
    policy.proofKind===manifest.proofKind &&
    policy.rubricVersion===1 && policy.minimumScore===70 &&
    policy.requireAll===true && policy.requiredCount===manifest.requiredIds.length);
}

export function validServerGradedCase(record,caseId,policy) {
  return Boolean(record && !Array.isArray(record) && record.schemaVersion===1 &&
    record.source==='server-grading' && record.caseId===caseId &&
    record.rubricVersion===policy.rubricVersion &&
    Number.isSafeInteger(record.bestScore) &&
    record.bestScore>=policy.minimumScore && record.bestScore<=70 &&
    realDate(record.firstVerifiedAt) && realDate(record.updatedAt));
}

// Called only from a trusted callable endpoint with BLACKBOX Firebase Auth +
// App Check. No owner UID, score, case receipts or award ID is accepted from a
// caller. Only server-owned grading documents are read.
export async function issueVerifiedGroupCertificate(db, FieldValue,
  {uid, issuer, groupId, consent}, createId=opaqueCertificateId) {
  if (!validUid(uid)) throw new Error('unauthenticated');
  if (consent!==true) throw new Error('consent-required');
  const manifest=requireCertificateGroup(issuer,groupId);
  if (!manifest.issuableByGradingService || manifest.proofKind!=='verifiedCybertrace') {
    throw new Error('group-assessments-not-available');
  }
  const key=policyIdFor(manifest);
  const awardRef=db.doc('blackboxUsers/'+uid+'/certificateAwards/'+key);
  const policyRef=db.doc('certificatePolicies/'+key);
  return db.runTransaction(async tx=>{
    const awardSnap=await tx.get(awardRef);
    if (awardSnap.exists) {
      // Idempotency also protects revoked awards from being reissued.
      const award=awardSnap.data();
      const existingId=requireCertificateId(award?.certificateId);
      const current=await tx.get(db.doc('certificateRegistry/'+existingId));
      const record=current.exists?current.data():null;
      if (!record || record.uid!==uid || record.issuer!==issuer ||
          record.groupId!==groupId || record.version!==manifest.version ||
          !['active','revoked'].includes(record.status) ||
          record.status!==award.status ||
          !publicCertificateView(existingId,record)) throw new Error('invalid-existing-award');
      return {certificateId:existingId,issuer,groupId,
        status:record.status==='active'?'verified':'revoked', newlyIssued:false};
    }
    const policySnap=await tx.get(policyRef);
    if (!policySnap.exists || !validIssuancePolicy(policySnap.data(),manifest)) {
      throw new Error('certificate-policy-disabled');
    }
    const policy=policySnap.data();
    const proofRefs=manifest.requiredIds.map(caseId=>db.doc(proofRefFor(uid,manifest,caseId)));
    const proofs=await Promise.all(proofRefs.map(ref=>tx.get(ref)));
    if (!proofs.every((snap,i)=>snap.exists &&
        validServerGradedCase(snap.data(),manifest.requiredIds[i],policy))) {
      throw new Error('verified-assessments-incomplete');
    }
    const id=createId();
    requireCertificateId(id);
    const issuedAt=FieldValue.serverTimestamp();
    const registryRef=db.doc('certificateRegistry/'+id);
    // Both docs created atomically; Firestore retries conflicting concurrent
    // requests against the same award pointer. A random ID collision fails closed.
    tx.create(registryRef,{
      schemaVersion:1,issuer,groupId,groupTitle:manifest.title,version:manifest.version,
      status:'active',proofType:'server-assessment',issuerAuthority:'trusted-backend',
      uid,proofKind:manifest.proofKind,policyVersion:policy.version,
      requiredCount:manifest.requiredIds.length,issuedAt,
    });
    tx.create(awardRef,{
      schemaVersion:1,uid,issuer,groupId,version:manifest.version,
      certificateId:id,status:'active',issuedAt,
    });
    return {certificateId:id,issuer,groupId,status:'verified',newlyIssued:true};
  });
}

// Admin SDK ONLY; do not export this as an HTTP/callable action. The caller is
// a trusted owner-run administrative process, never a browser supplied admin UID.
export async function revokeIssuedGroupCertificate(db,FieldValue,
  {certificateId,actor,reason}) {
  requireCertificateId(certificateId);
  if (!validUid(actor) || typeof reason!=='string' || reason.trim().length<10 ||
      reason.length>240) throw new Error('invalid-revocation-request');
  const recordRef=db.doc('certificateRegistry/'+certificateId);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(recordRef);
    const record=snap.exists?snap.data():null;
    if (!record || !validUid(record.uid)) throw new Error('unknown-issued-certificate');
    const manifest=requireCertificateGroup(record.issuer,record.groupId);
    if (manifest.version!==record.version ||
        !publicCertificateView(certificateId,record)) throw new Error('invalid-issued-record');
    const awardRef=db.doc('blackboxUsers/'+record.uid+'/certificateAwards/'+policyIdFor(manifest));
    const awardSnap=await tx.get(awardRef);
    const award=awardSnap.exists?awardSnap.data():null;
    if (!award || award.certificateId!==certificateId || award.uid!==record.uid ||
        award.status!==record.status) throw new Error('invalid-award-pointer');
    if (record.status==='revoked') return {certificateId,status:'revoked',changed:false};
    const when=FieldValue.serverTimestamp();
    tx.update(recordRef,{status:'revoked',revokedAt:when});
    tx.update(awardRef,{status:'revoked',revokedAt:when});
    tx.create(db.doc('certificateRevocationAudit/'+certificateId),{
      schemaVersion:1,certificateId,actor,reason:reason.trim(),at:when,
    });
    return {certificateId,status:'revoked',changed:true};
  });
}
