import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  DEFENSE_GROUP,DEFENSE_DOMAINS,FINAL_EXAM_COUNT,FINAL_EXAM_TTL_MS,
  validateFinalCatalog,validateFinalRubric,finalCatalogDigest,finalRubricDigest,selectFinalTasks,
  publicFinalChallenge,gradeFinalExam,nextDefenseExamQuota,validateDefensePortfolio,
} from '../defense-final-core.js';
import {
  beginDefenseFinalExam,submitDefenseFinalExam,submitDefensePortfolio,
  getMyDefenseReadiness,readDefensePortfolioForReview,reviewDefensePortfolio,
} from '../defense-final-service.js';

const NOW=Date.parse('2026-11-22T09:15:00Z'),FieldValue={serverTimestamp:()=>new Date(NOW)};
const UID='learner-01',OTHER='learner-02';
const ID='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const UUID2='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OPTIONS=['a','b','c','d'].map(id=>({id,label:'Plausible action '+id}));
const catalog=()=>({
  schemaVersion:1,groupId:DEFENSE_GROUP,version:1,reviewed:true,enabled:true,
  title:'Independent practical case-analysis knowledge final',
  description:'Four unrelated and admin-reviewed synthetic evidence scenarios with newly composed exam items.',
  tasks:DEFENSE_DOMAINS.flatMap(domain=>Array.from({length:4},(_,i)=>({
    id:domain+'-'+i,domain,
    prompt:'Assess the probable cause from these independently curated evidence lines '+domain+' '+i,
    evidence:['2026-11-22T01:00:00Z event=sample evidence_type='+domain,
      '2026-11-22T01:01:00Z change_ticket=none correlation=demo'],
    options:OPTIONS,
    accidentallyPublishedAnswer:'MUST_NOT_LEAK',
  }))),
});
const rubric=()=>({
  schemaVersion:1,groupId:DEFENSE_GROUP,version:1,reviewed:true,enabled:true,
  answers:Object.fromEntries(catalog().tasks.map(t=>[t.id,'b'])),
});
const rng=max=>max-1;
const select=()=>selectFinalTasks(validateFinalCatalog(catalog()),rng);
const answers=(selected,wrong=new Set())=>selected.map(t=>({taskId:t.id,
  choiceId:wrong.has(t.id)?'a':'b'}));
const data=()=>({
  ['defenseFinalCatalog/'+DEFENSE_GROUP]:catalog(),
  ['defenseFinalRubrics/'+DEFENSE_GROUP]:rubric(),
});
const evidence=()=>DEFENSE_DOMAINS.map(domain=>({
  domain,sha256:'a'.repeat(64),
  summary:'Evidence reviewed in a synthetic isolated training exercise. '+('A'.repeat(115)),
  limitations:'Local artifacts can be edited; this report does not independently prove execution.',
}));
class MemoryDB{
  constructor(init={}){this.docs=new Map(Object.entries(init));this.operations=[];}
  snap(path){return {exists:this.docs.has(path),data:()=>this.docs.get(path)};}
  doc(path){return {path,get:async()=>this.snap(path)};}
  async runTransaction(job){
    const writes=[];let beganWriting=false;
    const tx={
      get:async ref=>{if(beganWriting)throw Error('read-after-write');return this.snap(ref.path);},
      set:(ref,value)=>{beganWriting=true;writes.push(['set',ref.path,value]);},
      create:(ref,value)=>{beganWriting=true;writes.push(['create',ref.path,value]);},
      update:(ref,value)=>{beganWriting=true;writes.push(['update',ref.path,value]);},
    };
    const result=await job(tx);
    for(const [op,path] of writes){
      if(op==='create'&&this.docs.has(path))throw Error('duplicate-doc');
      if(op==='update'&&!this.docs.has(path))throw Error('missing-doc');
    }
    for(const [op,path,value] of writes){
      const stored=op==='update'?{...this.docs.get(path),...value}:value;
      this.docs.set(path,stored);this.operations.push([op,path]);
    }
    return result;
  }
}
const start=(db,uid=UID,id=ID,time=NOW)=>
  beginDefenseFinalExam(db,FieldValue,uid,()=>time,()=>id,rng);
const submit=(db,opened,responses,uid=UID,time=NOW+3000)=>
  submitDefenseFinalExam(db,FieldValue,{uid,sessionId:opened.sessionId,responses},()=>time);

test('public independent exam has 4 distinct domains, random selected subset, 12 tasks and NEVER answer keys',()=>{
  const c=validateFinalCatalog(catalog()),selected=selectFinalTasks(c,rng);
  assert.equal(selected.length,FINAL_EXAM_COUNT);
  assert.equal(new Set(selected.map(x=>x.id)).size,12);
  for(const domain of DEFENSE_DOMAINS)assert.equal(selected.filter(t=>t.domain===domain).length,3);
  assert(validateFinalRubric(rubric(),c));
  const pub=publicFinalChallenge(c,selected),serialized=JSON.stringify(pub);
  assert.equal(pub.questionCount,12);
  assert.equal(pub.maxScore,100);
  assert(!serialized.includes('MUST_NOT_LEAK'));
  assert(!serialized.includes('accidentallyPublishedAnswer'));
  assert(!serialized.includes('answers'));
  assert.equal(Object.hasOwn(pub,'reviewed'),false);
  assert.equal(Object.hasOwn(pub.tasks[0],'reviewed'),false);
  assert(!serialized.includes('answerKey'));
  assert.match(finalCatalogDigest(c),/^[a-f0-9]{64}$/);
  assert.match(finalRubricDigest(rubric(),c),/^[a-f0-9]{64}$/);
  assert.throws(()=>validateFinalCatalog({...catalog(),reviewed:false}),/exam-catalog-unavailable/);
  assert.throws(()=>validateFinalRubric({...rubric(),answers:{...rubric().answers,extra:'a'}},c),/invalid-final-rubric/);
});
test('scoring requires at least 10 of 12 AND at least two of three in EVERY domain',()=>{
  const selected=select();
  const perfect=gradeFinalExam(answers(selected),selected,rubric());
  assert.equal(perfect.score,100);assert.equal(perfect.passed,true);
  assert.equal(perfect.credentialEligible,false);
  const twoDomains=new Set([selected[0].id,selected[3].id]);
  const ten=gradeFinalExam(answers(selected,twoDomains),selected,rubric());
  assert.equal(ten.correctCount,10);assert.equal(ten.passed,true);
  const oneDomain=new Set([selected[0].id,selected[1].id]);
  const lowArea=gradeFinalExam(answers(selected,oneDomain),selected,rubric());
  assert.equal(lowArea.correctCount,10);assert.equal(lowArea.passed,false);
  assert.equal(gradeFinalExam(answers(selected,new Set([selected[0].id,selected[1].id,selected[2].id])),selected,rubric()).passed,false);
  for(const invalid of [answers(selected).slice(1),[...answers(selected).slice(1),answers(selected)[1]],
     answers(selected).map((r,i)=>i===0?{...r,choiceId:'evil'}:r),
     answers(selected).map((r,i)=>i===0?{...r,score:100}:r)])
    assert.throws(()=>gradeFinalExam(invalid,selected,rubric()),/invalid-final-submission/);
});
test('one-time session, ownership, timed expiry and private rubric are enforced atomically',async()=>{
  const db=new MemoryDB(data()),opened=await start(db);
  assert.equal(opened.sessionId,ID);
  assert.equal(opened.expiresAtMs,NOW+FINAL_EXAM_TTL_MS);
  assert.equal(JSON.stringify(opened).includes('answers'),false);
  await assert.rejects(()=>submit(db,opened,answers(opened.challenge.tasks),OTHER),/exam-session-expired-or-used/);
  await assert.rejects(()=>submit(db,opened,answers(opened.challenge.tasks),UID,NOW+FINAL_EXAM_TTL_MS),/exam-session-expired-or-used/);
  const good=await submit(db,opened,answers(opened.challenge.tasks));
  assert.equal(good.score,100);assert.equal(good.passed,true);
  assert.equal(good.practicalEvidenceVerified,false);
  assert.equal(db.docs.get('defenseFinalSessions/'+ID).status,'consumed');
  assert.equal(db.docs.get('blackboxUsers/'+UID+'/defenseFinalResults/defensive-analysis_v1').passed,true);
  await assert.rejects(()=>submit(db,opened,answers(opened.challenge.tasks)),/exam-session-expired-or-used/);
  assert.equal(db.operations.filter(([op,path])=>path.includes('defenseFinalResults/')).length,1);
});
test('missing and disabled private rubrics, invalid quotas or catalog changes fail closed',async()=>{
  const db=new MemoryDB(data());
  db.docs.delete('defenseFinalRubrics/'+DEFENSE_GROUP);
  await assert.rejects(()=>start(db),/exam-catalog-unavailable/);
  assert.equal(db.operations.length,0);
  db.docs.set('defenseFinalRubrics/'+DEFENSE_GROUP,{...rubric(),reviewed:false});
  await assert.rejects(()=>start(db),/invalid-final-rubric/);
  db.docs.set('defenseFinalRubrics/'+DEFENSE_GROUP,rubric());
  const opened=await start(db);
  const original=db.docs.get('defenseFinalCatalog/'+DEFENSE_GROUP);
  db.docs.set('defenseFinalCatalog/'+DEFENSE_GROUP,{...original,title:'Admin updated question bank after session start'});
  await assert.rejects(()=>submit(db,opened,answers(opened.challenge.tasks)),/exam-catalog-changed/);
  assert.equal(db.docs.get('defenseFinalSessions/'+ID).status,'open');
  assert.equal(db.docs.has('blackboxUsers/'+UID+'/defenseFinalResults/defensive-analysis_v1'),false);
  assert.deepEqual(nextDefenseExamQuota({windowStartMs:NOW,count:2},NOW+1000),
    {windowStartMs:NOW,count:3});
  assert.throws(()=>nextDefenseExamQuota({windowStartMs:NOW,count:3},NOW+1000),/exam-quota-exceeded/);
  assert.deepEqual(nextDefenseExamQuota({windowStartMs:NOW,count:3},NOW+86400000),
    {windowStartMs:NOW+86400000,count:1});
});
test('a private rubric edited during an open exam invalidates the session without awarding any result',async()=>{
  const db=new MemoryDB(data()),opened=await start(db);
  const old=db.docs.get('defenseFinalRubrics/'+DEFENSE_GROUP);
  db.docs.set('defenseFinalRubrics/'+DEFENSE_GROUP,{
    ...old,answers:{...old.answers,[opened.challenge.tasks[0].id]:'c'},
  });
  await assert.rejects(()=>submit(db,opened,answers(opened.challenge.tasks)),/exam-rubric-changed/);
  assert.equal(db.docs.get('defenseFinalSessions/'+ID).status,'open');
  assert.equal(db.docs.has('blackboxUsers/'+UID+'/defenseFinalResults/defensive-analysis_v1'),false);
});
test('a previously passing exam cannot qualify a portfolio after private rubric rotation',async()=>{
  const db=new MemoryDB(data()),opened=await start(db);
  await submit(db,opened,answers(opened.challenge.tasks));
  assert.equal((await getMyDefenseReadiness(db,UID)).knowledgeExamPassed,true);
  const old=db.docs.get('defenseFinalRubrics/'+DEFENSE_GROUP);
  db.docs.set('defenseFinalRubrics/'+DEFENSE_GROUP,{
    ...old,answers:{...old.answers,[opened.challenge.tasks[0].id]:'c'},
  });
  const readiness=await getMyDefenseReadiness(db,UID);
  assert.equal(readiness.knowledgeExamPassed,false);
  assert.equal(readiness.knowledgeBestScore,null);
  await assert.rejects(()=>submitDefensePortfolio(db,FieldValue,{
    uid:UID,consent:true,artifacts:evidence(),
  }),/final-exam-required/);
});
test('stale previously passed exam is NOT used for portfolio, even if catalog changes without version bump',async()=>{
  const db=new MemoryDB(data()),opened=await start(db);
  await submit(db,opened,answers(opened.challenge.tasks));
  let state=await getMyDefenseReadiness(db,UID);
  assert.equal(state.knowledgeExamPassed,true);
  const old=db.docs.get('defenseFinalCatalog/'+DEFENSE_GROUP);
  db.docs.set('defenseFinalCatalog/'+DEFENSE_GROUP,{...old,title:'Updated final questions without a version bump'});
  state=await getMyDefenseReadiness(db,UID);
  assert.equal(state.knowledgeExamPassed,false);
  await assert.rejects(()=>submitDefensePortfolio(db,FieldValue,{
    uid:UID,consent:true,artifacts:evidence(),
  }),/final-exam-required/);
});
test('portfolio submits checksums and brief synthetic reports ONLY after server pass, never counts as practical proof',async()=>{
  const db=new MemoryDB(data());
  await assert.rejects(()=>submitDefensePortfolio(db,FieldValue,{
    uid:UID,consent:true,artifacts:evidence(),
  }),/final-exam-required/);
  const opened=await start(db);await submit(db,opened,answers(opened.challenge.tasks));
  const port=await submitDefensePortfolio(db,FieldValue,{uid:UID,consent:true,artifacts:evidence()});
  assert.deepEqual(port,{groupId:DEFENSE_GROUP,revision:1,status:'pending-review',
    credentialEligible:false,practicalEvidenceVerified:false});
  const record=db.docs.get('blackboxUsers/'+UID+'/defenseFinalEvidence/defensive-analysis_v1');
  assert.equal(record.artifacts.length,4);assert.equal(record.reviewStatus,'pending-review');
  assert.equal(record.credentialEligible,false);
  await assert.rejects(()=>submitDefensePortfolio(db,FieldValue,{
    uid:UID,consent:true,artifacts:evidence(),
  }),/portfolio-already-submitted/);
  assert.throws(()=>validateDefensePortfolio({consent:true,artifacts:evidence().map((x,i)=>i?x:{...x,sha256:'bad'})}),/invalid-portfolio/);
  assert.throws(()=>validateDefensePortfolio({consent:true,artifacts:[...evidence().slice(1),evidence()[1]]}),/invalid-portfolio/);
});
test('reviewer can only request revision or mark reviewed-UNVERIFIED; privileged audit is immutable',async()=>{
  const db=new MemoryDB(data());const opened=await start(db);
  await submit(db,opened,answers(opened.challenge.tasks));
  await submitDefensePortfolio(db,FieldValue,{uid:UID,consent:true,artifacts:evidence()});
  const record=await readDefensePortfolioForReview(db,UID);
  assert.equal(record.knowledgeExamPassed,true);
  assert.equal(record.reviewStatus,'pending-review');
  assert.equal(record.practicalEvidenceVerified,false);
  await assert.rejects(()=>reviewDefensePortfolio(db,FieldValue,{
    candidateUid:UID,reviewerUid:UID,decision:'reviewed-unverified',
    reviewNote:'Reviewer cannot self-review this record.',
  }),/invalid-review/);
  await assert.rejects(()=>reviewDefensePortfolio(db,FieldValue,{
    candidateUid:UID,reviewerUid:'reviewer-01',decision:'approved',
    reviewNote:'Not permitted to approve the execution without independent proof.',
  }),/invalid-review/);
  const reviewed=await reviewDefensePortfolio(db,FieldValue,{
    candidateUid:UID,reviewerUid:'reviewer-01',decision:'needs-revision',
    reviewNote:'Please document the missing evidence limitations and test environment.',
  },()=>UUID2);
  assert.equal(reviewed.credentialEligible,false);
  const saved=db.docs.get('blackboxUsers/'+UID+'/defenseFinalEvidence/defensive-analysis_v1');
  assert.equal(saved.reviewStatus,'needs-revision');
  assert.equal(db.docs.get('defenseFinalReviewAudit/'+UUID2).reviewerUid,'reviewer-01');
  const revision=await submitDefensePortfolio(db,FieldValue,{uid:UID,consent:true,artifacts:evidence()});
  assert.equal(revision.revision,2);
  const second=await reviewDefensePortfolio(db,FieldValue,{
    candidateUid:UID,reviewerUid:'reviewer-02',decision:'reviewed-unverified',
    reviewNote:'Artifacts were read; independent evidence of virtual machine execution is still missing.',
  },()=>ID);
  assert.equal(second.practicalEvidenceVerified,false);
  await assert.rejects(()=>submitDefensePortfolio(db,FieldValue,{uid:UID,consent:true,artifacts:evidence()}),/portfolio-already-submitted/);
  assert.equal(db.docs.has('certificateRegistry/'+ID),false);
});
test('Firestore clients cannot edit score, bank, sessions, reviewer report or audit; certificate hard gate stays OFF',()=>{
  const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
  const rules=read('../../firestore.rules'),functions=read('../index.js');
  for(const collection of ['defenseFinalCatalog','defenseFinalRubrics','defenseFinalSessions',
    'defenseFinalQuota','defenseFinalReviewAudit'])assert(rules.includes('match /'+collection+'/'));
  assert.match(rules,/match \/blackboxUsers\/\{uid\}\/defenseFinalResults\/\{groupId\}/);
  assert.match(rules,/match \/blackboxUsers\/\{uid\}\/defenseFinalEvidence\/\{groupId\}/);
  for(const name of ['beginDefenseFinalCapstone','submitDefenseFinalCapstone',
    'submitDefensePracticalPortfolio','getMyDefenseFinalReadiness',
    'getDefensePortfolioForReview','reviewDefensePracticalPortfolio']){
    assert(functions.includes('export const '+name+' = onCall'));
  }
  assert.match(functions,/request\.auth\?\.token\?\.certificateReviewer!==true/);
  assert.match(functions,/enforceAppCheck:true/);
  assert.match(functions,/const CERTIFICATE_ISSUANCE_ENABLED = false/);
  const manifests=read('../certificate-manifests.js');
  assert.match(manifests,/issuableByGradingService:false/);
});
