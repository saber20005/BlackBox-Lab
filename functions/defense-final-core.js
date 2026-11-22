import {createHash,randomInt} from 'node:crypto';

// Server-only policy. The public repository contains NO final exam question bank,
// answers, private evidence scenarios or enabled certification policy.
export const DEFENSE_GROUP='defensive-analysis';
export const DEFENSE_DOMAINS=Object.freeze(['logs','integrity','headers','email']);
export const FINAL_EXAM_VERSION=1;
export const FINAL_EXAM_COUNT=12;
export const FINAL_EXAM_MIN_CORRECT=10;
export const FINAL_EXAM_MIN_PER_DOMAIN=2;
export const FINAL_EXAM_TTL_MS=25*60*1000;
export const FINAL_EXAM_STARTS_PER_DAY=3;
export const FINAL_EXAM_QUOTA_MS=24*60*60*1000;
export const FINAL_EXAM_CREDENTIAL_ELIGIBLE=false;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>obj(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const validId=x=>typeof x==='string'&&/^[a-z][a-z0-9-]{0,39}$/.test(x);
const validText=(x,min,max)=>typeof x==='string'&&x.trim().length>=min&&x.length<=max;
const distinct=arr=>new Set(arr).size===arr.length;

export function validateFinalCatalog(raw){
  if(!obj(raw)||raw.schemaVersion!==1||raw.groupId!==DEFENSE_GROUP||
     raw.enabled!==true||raw.reviewed!==true||raw.version!==FINAL_EXAM_VERSION||
     !validText(raw.title,10,140)||!validText(raw.description,40,1000)||
     !Array.isArray(raw.tasks)||raw.tasks.length<16||raw.tasks.length>48)throw Error('exam-catalog-unavailable');
  const tasks=raw.tasks;
  if(!tasks.every(task=>obj(task)&&validId(task.id)&&DEFENSE_DOMAINS.includes(task.domain)&&
     validText(task.prompt,25,1000)&&Array.isArray(task.evidence)&&task.evidence.length>=2&&
     task.evidence.length<=8&&task.evidence.every(s=>validText(s,8,320))&&
     Array.isArray(task.options)&&task.options.length===4&&
     task.options.every(o=>obj(o)&&validId(o.id)&&validText(o.label,3,240))&&
     distinct(task.options.map(o=>o.id)))||!distinct(tasks.map(t=>t.id))||
     DEFENSE_DOMAINS.some(d=>tasks.filter(t=>t.domain===d).length<4))throw Error('invalid-exam-catalog');
  // Explicit whitelisting prevents an accidentally embedded answer key from
  // crossing the server/client trust boundary.
  return {groupId:DEFENSE_GROUP,version:FINAL_EXAM_VERSION,title:raw.title,
    description:raw.description,tasks:tasks.map(t=>({id:t.id,domain:t.domain,
      prompt:t.prompt,evidence:t.evidence.map(s=>String(s)),
      options:t.options.map(o=>({id:o.id,label:o.label}))}))};
}
export function validateFinalRubric(raw,catalog){
  if(!obj(raw)||raw.schemaVersion!==1||raw.enabled!==true||raw.reviewed!==true||
    raw.groupId!==DEFENSE_GROUP||raw.version!==catalog.version||
    !exact(raw.answers,catalog.tasks.map(t=>t.id)))throw Error('invalid-final-rubric');
  for(const t of catalog.tasks){
    if(!t.options.some(o=>o.id===raw.answers[t.id]))throw Error('invalid-final-rubric');
  }
  return true;
}
export function finalCatalogDigest(catalog){
  return createHash('sha256').update(JSON.stringify(catalog),'utf8').digest('hex');
}
export function selectFinalTasks(catalog,rng=randomInt){
  const selected=[];
  for(const domain of DEFENSE_DOMAINS){
    const candidates=catalog.tasks.filter(t=>t.domain===domain);
    for(let i=candidates.length-1;i>0;i--){
      const n=rng(i+1);
      if(!Number.isSafeInteger(n)||n<0||n>i)throw Error('invalid-rng');
      [candidates[i],candidates[n]]=[candidates[n],candidates[i]];
    }
    selected.push(...candidates.slice(0,3));
  }
  if(selected.length!==FINAL_EXAM_COUNT||!distinct(selected.map(t=>t.id)))throw Error('invalid-final-selection');
  return selected;
}
export function publicFinalChallenge(catalog,selected){
  return {groupId:DEFENSE_GROUP,version:catalog.version,title:catalog.title,
    description:catalog.description,questionCount:FINAL_EXAM_COUNT,
    maxScore:100,topics:DEFENSE_DOMAINS.map(id=>id),
    tasks:selected.map(t=>({id:t.id,domain:t.domain,prompt:t.prompt,
      evidence:t.evidence.map(x=>x),options:t.options.map(o=>({id:o.id,label:o.label}))}))};
}
export function gradeFinalExam(responses,selected,rubric){
  if(!Array.isArray(responses)||responses.length!==FINAL_EXAM_COUNT||!obj(rubric?.answers))throw Error('invalid-final-submission');
  const selectedById=new Map(selected.map(t=>[t.id,t]));
  const observed=new Set(),answers=new Map();
  for(const item of responses){
    if(!exact(item,['taskId','choiceId'])||!validId(item.taskId)||!validId(item.choiceId)||
      !selectedById.has(item.taskId)||observed.has(item.taskId)||
      !selectedById.get(item.taskId).options.some(o=>o.id===item.choiceId))throw Error('invalid-final-submission');
    observed.add(item.taskId);answers.set(item.taskId,item.choiceId);
  }
  const correctByDomain=Object.fromEntries(DEFENSE_DOMAINS.map(d=>[d,0]));
  let correct=0;
  for(const question of selected){
    if(answers.get(question.id)===rubric.answers[question.id]){
      correct++;correctByDomain[question.domain]++;
    }
  }
  const passed=correct>=FINAL_EXAM_MIN_CORRECT &&
    DEFENSE_DOMAINS.every(domain=>correctByDomain[domain]>=FINAL_EXAM_MIN_PER_DOMAIN);
  return {score:Math.round(correct/FINAL_EXAM_COUNT*100),maxScore:100,passed,
    correctCount:correct,credentialEligible:false};
}
export function nextDefenseExamQuota(raw,now){
  if(!Number.isSafeInteger(now)||now<0)throw Error('invalid-clock');
  if(!obj(raw)||!Number.isSafeInteger(raw.windowStartMs)||!Number.isSafeInteger(raw.count)||
    now<raw.windowStartMs||now-raw.windowStartMs>=FINAL_EXAM_QUOTA_MS)
    return {windowStartMs:now,count:1};
  if(raw.count<0||raw.count>=FINAL_EXAM_STARTS_PER_DAY)throw Error('exam-quota-exceeded');
  return {windowStartMs:raw.windowStartMs,count:raw.count+1};
}
export function validateDefensePortfolio(input){
  if(!exact(input,['artifacts','consent'])||input.consent!==true||
    !Array.isArray(input.artifacts)||input.artifacts.length!==DEFENSE_DOMAINS.length)throw Error('invalid-portfolio');
  const seen=new Set();
  const artifacts=input.artifacts.map(row=>{
    if(!exact(row,['domain','sha256','summary','limitations'])||
      !DEFENSE_DOMAINS.includes(row.domain)||seen.has(row.domain)||
      typeof row.sha256!=='string'||!/^[0-9a-f]{64}$/.test(row.sha256)||
      !validText(row.summary,80,1000)||!validText(row.limitations,30,500))throw Error('invalid-portfolio');
    seen.add(row.domain);
    return {domain:row.domain,sha256:row.sha256,summary:row.summary.trim(),
      limitations:row.limitations.trim()};
  });
  if(DEFENSE_DOMAINS.some(x=>!seen.has(x)))throw Error('invalid-portfolio');
  return artifacts;
}
export const validDefenseUid=uid=>typeof uid==='string'&&uid.length>0&&uid.length<=128&&!uid.includes('/');
export const validDefenseSession=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
