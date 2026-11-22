import {randomUUID,randomInt} from 'node:crypto';
import {
  DEFENSE_GROUP,DEFENSE_DOMAINS,FINAL_EXAM_VERSION,FINAL_EXAM_TTL_MS,
  validateFinalCatalog,validateFinalRubric,finalCatalogDigest,finalRubricDigest,selectFinalTasks,
  publicFinalChallenge,gradeFinalExam,nextDefenseExamQuota,validateDefensePortfolio,
  validDefenseUid,validDefenseSession,
} from './defense-final-core.js';
const catalogRef=db=>db.doc('defenseFinalCatalog/'+DEFENSE_GROUP);
const rubricRef=db=>db.doc('defenseFinalRubrics/'+DEFENSE_GROUP);
const quotaRef=(db,uid)=>db.doc('defenseFinalQuota/'+uid);
const sessionRef=(db,id)=>db.doc('defenseFinalSessions/'+id);
const resultRef=(db,uid)=>db.doc('blackboxUsers/'+uid+'/defenseFinalResults/'+DEFENSE_GROUP+'_v1');
const evidenceRef=(db,uid)=>db.doc('blackboxUsers/'+uid+'/defenseFinalEvidence/'+DEFENSE_GROUP+'_v1');
const reviewRef=(db,id)=>db.doc('defenseFinalReviewAudit/'+id);

export async function beginDefenseFinalExam(db,FieldValue,uid,now=()=>Date.now(),uuid=randomUUID,rng=randomInt){
  if(!validDefenseUid(uid))throw Error('unauthenticated');
  const sessionId=uuid();
  if(!validDefenseSession(sessionId))throw Error('invalid-session-id');
  return db.runTransaction(async tx=>{
    const [catSnap,rubSnap,quotaSnap]=await Promise.all([
      tx.get(catalogRef(db)),tx.get(rubricRef(db)),tx.get(quotaRef(db,uid)),
    ]);
    if(!catSnap.exists||!rubSnap.exists)throw Error('exam-catalog-unavailable');
    const catalog=validateFinalCatalog(catSnap.data());
    validateFinalRubric(rubSnap.data(),catalog);
    const current=now();
    const quota=nextDefenseExamQuota(quotaSnap.exists?quotaSnap.data():null,current);
    const selected=selectFinalTasks(catalog,rng);
    const expiresAtMs=current+FINAL_EXAM_TTL_MS;
    tx.set(quotaRef(db,uid),quota);
    tx.create(sessionRef(db,sessionId),{
      schemaVersion:1,uid,groupId:DEFENSE_GROUP,version:FINAL_EXAM_VERSION,
      catalogDigest:finalCatalogDigest(catalog),
      rubricDigest:finalRubricDigest(rubSnap.data(),catalog),
      selectedIds:selected.map(t=>t.id),
      status:'open',createdAt:FieldValue.serverTimestamp(),expiresAtMs,
    });
    return {sessionId,expiresAtMs,challenge:publicFinalChallenge(catalog,selected)};
  });
}

export async function submitDefenseFinalExam(db,FieldValue,{uid,sessionId,responses},now=()=>Date.now()){
  if(!validDefenseUid(uid))throw Error('unauthenticated');
  if(!validDefenseSession(sessionId))throw Error('invalid-session-id');
  return db.runTransaction(async tx=>{
    const [ss,cs,rs,previous]=await Promise.all([
      tx.get(sessionRef(db,sessionId)),tx.get(catalogRef(db)),tx.get(rubricRef(db)),
      tx.get(resultRef(db,uid)),
    ]);
    const session=ss.exists?ss.data():null,current=now();
    if(!session||session.uid!==uid||session.groupId!==DEFENSE_GROUP||
      session.version!==FINAL_EXAM_VERSION||session.status!=='open'||
      !Number.isSafeInteger(session.expiresAtMs)||current>=session.expiresAtMs||
      !Array.isArray(session.selectedIds)||session.selectedIds.length!==12||
      !cs.exists||!rs.exists)throw Error('exam-session-expired-or-used');
    const catalog=validateFinalCatalog(cs.data());
    if(finalCatalogDigest(catalog)!==session.catalogDigest)throw Error('exam-catalog-changed');
    validateFinalRubric(rs.data(),catalog);
    if(finalRubricDigest(rs.data(),catalog)!==session.rubricDigest)
      throw Error('exam-rubric-changed');
    const pool=new Map(catalog.tasks.map(t=>[t.id,t]));
    const selected=session.selectedIds.map(id=>pool.get(id));
    if(selected.some(t=>!t)||new Set(session.selectedIds).size!==12||
      DEFENSE_DOMAINS.some(d=>selected.filter(t=>t.domain===d).length!==3))
      throw Error('invalid-final-session');
    const score=gradeFinalExam(responses,selected,rs.data());
    const prior=previous.exists?previous.data():null;
    if(prior&&(!Number.isSafeInteger(prior.bestScore)||prior.bestScore<0||prior.bestScore>100||
      typeof prior.passed!=='boolean'||prior.groupId!==DEFENSE_GROUP||
      prior.version!==FINAL_EXAM_VERSION||typeof prior.catalogDigest!=='string'))
      throw Error('invalid-final-history');
    // A changed catalog invalidates the old score and pass, even when its
    // version was accidentally not bumped. A stale pass must never survive.
    const sameExam=prior?.catalogDigest===session.catalogDigest &&
      prior?.rubricDigest===session.rubricDigest;
    const priorScore=sameExam?prior.bestScore:-1;
    const keepPass=Boolean(sameExam&&prior.passed===true);
    const finalScore=Math.max(score.score,priorScore);
    const finalPassed=score.passed||keepPass;
    tx.update(sessionRef(db,sessionId),{status:'consumed',consumedAt:FieldValue.serverTimestamp()});
    if(!sameExam||score.score>priorScore||(finalPassed&&!keepPass)){
      tx.set(resultRef(db,uid),{
        schemaVersion:1,source:'server-final-knowledge-exam',uid,groupId:DEFENSE_GROUP,
        version:FINAL_EXAM_VERSION,catalogDigest:session.catalogDigest,
        rubricDigest:session.rubricDigest,
        bestScore:finalScore,
        passed:finalPassed,sessionId,
        firstVerifiedAt:sameExam?prior.firstVerifiedAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),credentialEligible:false,
      });
    }
    return {groupId:DEFENSE_GROUP,verifiedByServer:true,
      score:score.score,maxScore:100,passed:score.passed,
      bestScore:finalScore,
      credentialEligible:false,practicalEvidenceVerified:false};
  });
}

export async function submitDefensePortfolio(db,FieldValue,{uid,artifacts,consent}){
  if(!validDefenseUid(uid))throw Error('unauthenticated');
  const normalized=validateDefensePortfolio({artifacts,consent});
  return db.runTransaction(async tx=>{
    const [exam,old,catalogSnap,rubricSnap]=await Promise.all([
      tx.get(resultRef(db,uid)),tx.get(evidenceRef(db,uid)),
      tx.get(catalogRef(db)),tx.get(rubricRef(db)),
    ]);
    const verified=exam.exists?exam.data():null;
    if(!catalogSnap.exists||!rubricSnap.exists)throw Error('final-exam-required');
    const catalog=validateFinalCatalog(catalogSnap.data());
    validateFinalRubric(rubricSnap.data(),catalog);
    if(!verified||verified.source!=='server-final-knowledge-exam'||verified.uid!==uid||
       verified.version!==FINAL_EXAM_VERSION||verified.passed!==true||
       verified.catalogDigest!==finalCatalogDigest(catalog)||
       verified.rubricDigest!==finalRubricDigest(rubricSnap.data(),catalog)||
       verified.credentialEligible!==false)throw Error('final-exam-required');
    const existing=old.exists?old.data():null;
    if(existing&&(!['needs-revision'].includes(existing.reviewStatus)||
      !Number.isSafeInteger(existing.revision)||existing.revision>=2))throw Error('portfolio-already-submitted');
    const revision=existing?existing.revision+1:1;
    const saved={
      schemaVersion:1,uid,groupId:DEFENSE_GROUP,examSessionId:verified.sessionId,
      examVersion:verified.version,catalogDigest:verified.catalogDigest,
      revision,reviewStatus:'pending-review',credentialEligible:false,
      practicalEvidenceVerified:false,artifacts:normalized,
      submittedAt:FieldValue.serverTimestamp(),
    };
    if(existing)tx.set(evidenceRef(db,uid),saved);
    else tx.create(evidenceRef(db,uid),saved);
    return {groupId:DEFENSE_GROUP,revision,status:'pending-review',
      credentialEligible:false,practicalEvidenceVerified:false};
  });
}

export async function getMyDefenseReadiness(db,uid){
  if(!validDefenseUid(uid))throw Error('unauthenticated');
  const [exam,evidence,catalogSnap,rubricSnap]=await Promise.all([
    resultRef(db,uid).get(),evidenceRef(db,uid).get(),
    catalogRef(db).get(),rubricRef(db).get(),
  ]);
  const e=exam.exists?exam.data():null;
  const p=evidence.exists?evidence.data():null;
  let catalogCurrent=false;
  try{
    if(catalogSnap.exists&&rubricSnap.exists){
      const catalog=validateFinalCatalog(catalogSnap.data());
      validateFinalRubric(rubricSnap.data(),catalog);
      catalogCurrent=e?.catalogDigest===finalCatalogDigest(catalog)&&
        e?.rubricDigest===finalRubricDigest(rubricSnap.data(),catalog);
    }
  }catch{/* A disabled or changed rubric invalidates the pass display. */}
  const hasVerifiedFinal=Boolean(catalogCurrent&&e&&e.uid===uid&&
    e.source==='server-final-knowledge-exam'&&e.version===FINAL_EXAM_VERSION&&e.passed===true);
  return {groupId:DEFENSE_GROUP,knowledgeExamPassed:hasVerifiedFinal,
    knowledgeBestScore:catalogCurrent&&Number.isSafeInteger(e?.bestScore)?e.bestScore:null,
    evidenceStatus:p&&p.uid===uid?p.reviewStatus:'not-submitted',
    credentialEligible:false,practicalEvidenceVerified:false,
    certificateIssuanceEnabled:false};
}
export async function readDefensePortfolioForReview(db,candidateUid){
  if(!validDefenseUid(candidateUid))throw Error('invalid-candidate-uid');
  const [exam,port]=await Promise.all([
    resultRef(db,candidateUid).get(),evidenceRef(db,candidateUid).get(),
  ]);
  if(!port.exists||port.data()?.uid!==candidateUid)throw Error('portfolio-not-found');
  const record=port.data();
  return {candidateUid,knowledgeExamPassed:exam.exists&&exam.data()?.passed===true,
    reviewStatus:record.reviewStatus,revision:record.revision,
    artifacts:record.artifacts,practicalEvidenceVerified:false};
}
export async function reviewDefensePortfolio(db,FieldValue,{
  candidateUid,decision,reviewNote,reviewerUid,
},uuid=randomUUID){
  if(!validDefenseUid(candidateUid)||!validDefenseUid(reviewerUid)||
    reviewerUid===candidateUid||!['needs-revision','reviewed-unverified'].includes(decision)||
    typeof reviewNote!=='string'||reviewNote.trim().length<30||reviewNote.length>800)
    throw Error('invalid-review');
  const auditId=uuid();
  if(!validDefenseSession(auditId))throw Error('invalid-review-id');
  return db.runTransaction(async tx=>{
    const ref=evidenceRef(db,candidateUid),snap=await tx.get(ref);
    const record=snap.exists?snap.data():null;
    if(!record||record.uid!==candidateUid||record.reviewStatus!=='pending-review'||
      record.credentialEligible!==false||record.practicalEvidenceVerified!==false)
      throw Error('review-not-pending');
    tx.update(ref,{reviewStatus:decision,reviewerUid,reviewedAt:FieldValue.serverTimestamp(),
      reviewNote:reviewNote.trim(),practicalEvidenceVerified:false,credentialEligible:false});
    tx.create(reviewRef(db,auditId),{
      schemaVersion:1,candidateUid,reviewerUid,decision,note:reviewNote.trim(),
      revision:record.revision,at:FieldValue.serverTimestamp(),
    });
    return {candidateUid,status:decision,practicalEvidenceVerified:false,
      credentialEligible:false};
  });
}
