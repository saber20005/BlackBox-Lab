import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {beginLabStageAssessment,submitLabStageAssessment,publicStageChallenge,
  gradeStageResponses,requireLabStageKey} from '../lab-stage-assessment.js';
const key='recon-0',ID='12345678-1234-1234-1234-123456789abc',now=Date.parse('2026-11-22T12:00:00Z');
const c={schemaVersion:1,enabled:true,reviewed:true,stageKey:key,version:1,
  description:'Analyze five distinct evidence points within a controlled simulated lab.',
  tasks:Array.from({length:5},(_,i)=>({id:'task-'+i,prompt:'Identify the correct network indicator in evidence item '+i,
    options:[{id:'a',label:'First evidence source'},{id:'b',label:'Second evidence source'},{id:'c',label:'Third evidence source'}]}))};
const r={schemaVersion:1,enabled:true,reviewed:true,stageKey:key,version:1,
  answers:Object.fromEntries(c.tasks.map(t=>[t.id,'b']))};
const choice=(choiceId='b')=>c.tasks.map(t=>({taskId:t.id,choiceId}));
const F={serverTimestamp:()=>new Date(now)};
class DB {
  constructor(){this.docs=new Map([['labStageCatalog/'+key,c],['labStageRubrics/'+key,r]]);this.operations=[];}
  doc(path){return {path};}
  async runTransaction(task){const changes=[];let wrote=false;
    const tx={get:async doc=>{if(wrote)throw Error('read-after-write');return {exists:this.docs.has(doc.path),data:()=>this.docs.get(doc.path)};},
      set:(doc,data)=>{wrote=true;changes.push(['set',doc.path,data]);},
      update:(doc,data)=>{wrote=true;changes.push(['update',doc.path,data]);},
      create:(doc,data)=>{wrote=true;changes.push(['create',doc.path,data]);}};
    const response=await task(tx);
    for(const [action,path,value] of changes){if(action==='create'&&this.docs.has(path))throw Error('duplicate');this.docs.set(path,action==='update'?{...this.docs.get(path),...value}:value);this.operations.push([action,path]);}
    return response;
  }
}
test('only existing 30 lab stage keys accepted, not arbitrary paths or case IDs',()=>{
  assert.equal(requireLabStageKey(key),key);
  for(const input of ['INC-0512','../recon-0','recon-3','unknown-1','recon-0/../admin',null]){
    assert.throws(()=>requireLabStageKey(input),/invalid-stage-key/);
  }
});
test('public catalog discloses ONLY scenarios and choices, never answer keys',()=>{
  const publicData=publicStageChallenge(c,key);
  assert.equal(publicData.tasks.length,5);
  assert.equal(JSON.stringify(publicData).includes('answers'),false);
  assert.equal(JSON.stringify(publicData).includes('reviewed'),false);
  assert.equal(gradeStageResponses(choice(),publicData,r),70);
  assert.equal(gradeStageResponses(choice('a'),publicData,r),0);
  assert.equal(gradeStageResponses([...choice().slice(1),choice()[0]],publicData,r),70);
  assert.throws(()=>gradeStageResponses([...choice().slice(1),choice()[1]],publicData,r),/invalid-stage-submission/);
  assert.throws(()=>publicStageChallenge({...c,reviewed:false},key),/stage-catalog-unavailable/);
});
test('server opens a session and consumes it exactly once in one transaction',async()=>{
  const db=new DB(),opening=await beginLabStageAssessment(db,F,{uid:'alice',stageKey:key},()=>now,()=>ID);
  assert.equal(opening.sessionId,ID);
  assert.equal(opening.challenge.tasks.length,5);
  const result=await submitLabStageAssessment(db,F,{uid:'alice',stageKey:key,sessionId:ID,responses:choice()},()=>now+1000);
  assert.equal(result.score,70);
  assert.equal(result.credentialEligible,false);
  assert.equal(db.docs.get('blackboxUsers/alice/verifiedLabStages/recon-0').bestScore,70);
  await assert.rejects(()=>submitLabStageAssessment(db,F,{uid:'alice',stageKey:key,sessionId:ID,responses:choice()},()=>now+1000),/expired-stage-session/);
  assert.equal(db.operations.filter(x=>x[1].includes('verifiedLabStages')).length,1);
  const fake=new DB();
  await beginLabStageAssessment(fake,F,{uid:'alice',stageKey:key},()=>now,()=>ID);
  await assert.rejects(()=>submitLabStageAssessment(fake,F,{uid:'bob',stageKey:key,sessionId:ID,responses:choice()},()=>now+1000),/expired-stage-session/);
});
test('no rubric, missing review, expired sessions or malformed answers produce proof',async()=>{
  const db=new DB();db.docs.delete('labStageRubrics/'+key);
  await assert.rejects(()=>beginLabStageAssessment(db,F,{uid:'alice',stageKey:key},()=>now,()=>ID),/stage-catalog-unavailable/);
  assert.deepEqual(db.operations,[]);
  db.docs.set('labStageRubrics/'+key,r);
  await beginLabStageAssessment(db,F,{uid:'alice',stageKey:key},()=>now,()=>ID);
  await assert.rejects(()=>submitLabStageAssessment(db,F,{uid:'alice',stageKey:key,sessionId:ID,responses:choice()},()=>now+16*60*1000),/expired-stage-session/);
  await assert.rejects(()=>submitLabStageAssessment(db,F,{uid:'alice',stageKey:key,sessionId:ID,responses:[...choice().slice(0,4)]},()=>now+1),/invalid-stage-submission/);
  assert.equal(db.docs.has('blackboxUsers/alice/verifiedLabStages/recon-0'),false);
});
test('client Firestore write blocked, App Check and Auth required, certificate gate unchanged',()=>{
  const src=readFileSync(new URL('../index.js',import.meta.url),'utf8');
  const rules=readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8');
  assert.match(src,/beginVerifiedLabStage = onCall/);
  assert.match(src,/submitVerifiedLabStage = onCall/);
  assert.match(src,/const CERTIFICATE_ISSUANCE_ENABLED = false/);
  assert.match(rules,/match \/blackboxUsers\/\{uid\}\/verifiedLabStages\/\{stageKey\}/);
  assert.match(rules,/allow create, update, delete: if false/);
});
