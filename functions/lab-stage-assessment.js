import { randomUUID } from 'node:crypto';

// Only server-curated evaluation items, never browser checkboxes or notes,
// may generate verified evidence. A knowledge check is NOT by itself a valid
// practical skill demonstration; group issuance remains hard-disabled.
const TRACKS=new Set(['recon','nmap','network','webgoat','proxy','metasploit','logs','integrity','headers','email']);
export function requireLabStageKey(value) {
  if (typeof value!=='string') throw Error('invalid-stage-key');
  const parts=value.split('-');
  if(parts.length!==2 || !TRACKS.has(parts[0]) || !['0','1','2'].includes(parts[1])) throw Error('invalid-stage-key');
  return value;
}
const uidOK=uid=>typeof uid==='string'&&uid.length>0&&uid.length<=128&&!uid.includes('/');
const slug=id=>typeof id==='string'&&/^[a-z][a-z0-9-]{0,40}$/.test(id);
const prompt=text=>typeof text==='string'&&text.trim().length>=12&&text.length<=800;
export const LAB_STAGE_TTL_MS=15*60*1000;
export const LAB_STAGE_STARTS_PER_HOUR=5;
export const LAB_STAGE_TASK_COUNT=5;
const validChoices=rows=>Array.isArray(rows)&&rows.length>=3&&rows.length<=6&&
  rows.every(x=>x&&slug(x.id)&&typeof x.label==='string'&&x.label.length>=2&&x.label.length<=150)&&
  new Set(rows.map(x=>x.id)).size===rows.length;
const exactKeys=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
  Object.keys(obj).length===keys.length&&keys.every(k=>Object.hasOwn(obj,k));
export function publicStageChallenge(raw,key) {
  requireLabStageKey(key);
  if(!raw||raw.enabled!==true||raw.reviewed!==true||raw.schemaVersion!==1||
    raw.stageKey!==key||raw.version!==1||!prompt(raw.description)||
    !Array.isArray(raw.tasks)||raw.tasks.length!==LAB_STAGE_TASK_COUNT)throw Error('stage-catalog-unavailable');
  if(!raw.tasks.every(t=>t&&slug(t.id)&&prompt(t.prompt)&&validChoices(t.options)))throw Error('invalid-stage-catalog');
  if(new Set(raw.tasks.map(t=>t.id)).size!==raw.tasks.length)throw Error('invalid-stage-catalog');
  return {stageKey:key,version:1,description:raw.description,tasks:raw.tasks.map(t=>({
    id:t.id,prompt:t.prompt,options:t.options.map(o=>({id:o.id,label:o.label})),
  }))};
}
export function assertStageRubric(raw,challenge){
  if(!raw||raw.schemaVersion!==1||raw.enabled!==true||raw.reviewed!==true||
    raw.stageKey!==challenge.stageKey||raw.version!==challenge.version||
    !exactKeys(raw.answers,challenge.tasks.map(t=>t.id)))throw Error('invalid-private-stage-rubric');
  for(const task of challenge.tasks){
    if(!task.options.some(o=>o.id===raw.answers[task.id]))throw Error('invalid-private-stage-rubric');
  }
}
export function gradeStageResponses(responses,challenge,rubric){
  assertStageRubric(rubric,challenge);
  if(!Array.isArray(responses)||responses.length!==LAB_STAGE_TASK_COUNT)throw Error('invalid-stage-submission');
  const seen=new Set(), byId={};
  for(const r of responses) {
    if(!exactKeys(r,['taskId','choiceId'])||!slug(r.taskId)||!slug(r.choiceId)||
      seen.has(r.taskId))throw Error('invalid-stage-submission');
    const task=challenge.tasks.find(t=>t.id===r.taskId);
    if(!task||!task.options.some(x=>x.id===r.choiceId))throw Error('invalid-stage-submission');
    seen.add(r.taskId);byId[r.taskId]=r.choiceId;
  }
  return challenge.tasks.reduce((score,t)=>score+(byId[t.id]===rubric.answers[t.id]?14:0),0);
}
function nextQuota(data,now) {
  const start=data?.windowStartMs,count=data?.count;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(count)||now<start||now-start>=3600000) {
    return {windowStartMs:now,count:1};
  }
  if(count<0||count>=LAB_STAGE_STARTS_PER_HOUR)throw Error('lab-stage-quota-exceeded');
  return {windowStartMs:start,count:count+1};
}
const validUuid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
export async function beginLabStageAssessment(db,FieldValue,{uid,stageKey},now=()=>Date.now(),uuid=randomUUID) {
  if(!uidOK(uid))throw Error('unauthenticated');
  requireLabStageKey(stageKey);
  const sessionId=uuid();
  if(!validUuid(sessionId))throw Error('invalid-session-id');
  const cat=db.doc('labStageCatalog/'+stageKey),rub=db.doc('labStageRubrics/'+stageKey);
  const quota=db.doc('labStageQuotas/'+uid),session=db.doc('labStageSessions/'+sessionId);
  return db.runTransaction(async tx=>{
    const [c,r,q]=await Promise.all([tx.get(cat),tx.get(rub),tx.get(quota)]);
    if(!c.exists||!r.exists)throw Error('stage-catalog-unavailable');
    const challenge=publicStageChallenge(c.data(),stageKey);
    assertStageRubric(r.data(),challenge);
    const current=now();
    const next=nextQuota(q.exists?q.data():null,current);
    tx.set(quota,next);
    tx.create(session,{uid,stageKey,status:'open',rubricVersion:1,attempts:0,
      expiresAtMs:current+LAB_STAGE_TTL_MS,createdAt:FieldValue.serverTimestamp()});
    return {sessionId,expiresAtMs:current+LAB_STAGE_TTL_MS,challenge};
  });
}
export async function submitLabStageAssessment(db,FieldValue,{uid,stageKey,sessionId,responses},now=()=>Date.now()){
  if(!uidOK(uid))throw Error('unauthenticated');
  requireLabStageKey(stageKey);
  if(!validUuid(sessionId))throw Error('invalid-session-id');
  const session=db.doc('labStageSessions/'+sessionId),cat=db.doc('labStageCatalog/'+stageKey);
  const rubric=db.doc('labStageRubrics/'+stageKey);
  const receipt=db.doc('blackboxUsers/'+uid+'/verifiedLabStages/'+stageKey);
  return db.runTransaction(async tx=>{
    const [ss,cs,rs,previous]=await Promise.all([tx.get(session),tx.get(cat),tx.get(rubric),tx.get(receipt)]);
    const s=ss.exists?ss.data():null,current=now();
    if(!s||s.uid!==uid||s.stageKey!==stageKey||s.status!=='open'||s.attempts!==0||
       s.rubricVersion!==1||!Number.isSafeInteger(s.expiresAtMs)||current>=s.expiresAtMs)throw Error('expired-stage-session');
    if(!cs.exists||!rs.exists)throw Error('stage-catalog-unavailable');
    const challenge=publicStageChallenge(cs.data(),stageKey);
    const score=gradeStageResponses(responses,challenge,rs.data());
    const prior=previous.exists?previous.data():null;
    const priorScore=prior?prior.bestScore:-1;
    if(!Number.isSafeInteger(priorScore)||priorScore< -1||priorScore>70)throw Error('invalid-stage-history');
    tx.update(session,{status:'consumed',attempts:1,consumedAt:FieldValue.serverTimestamp()});
    if(score>priorScore)tx.set(receipt,{schemaVersion:1,source:'server-grading',
       stageKey,bestScore:score,rubricVersion:1,
       firstVerifiedAt:prior?prior.firstVerifiedAt:FieldValue.serverTimestamp(),
       updatedAt:FieldValue.serverTimestamp()});
    return {stageKey,score,maxScore:70,bestScore:Math.max(score,priorScore),
      verifiedByServer:true,credentialEligible:false};
  });
}
