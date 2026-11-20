import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VERIFIED_SOC_ID, publicSocChallenge, assertSocRubric, requireSocSubmission,
  scoreVerifiedSoc, nextSocQuota, VERIFIED_SOC_MAX_STARTS,
} from '../soc-verified-core.js';
import { startVerifiedSocSession, submitVerifiedSocSession } from '../soc-verified-service.js';

const SHIFT = VERIFIED_SOC_ID;
const UID = 'blackbox-user-1';
const UUID = 'a531fe84-5209-4b3f-af44-c14e2eb5ed61';
const timestamp = { serverTimestamp: () => 'SERVER_TIMESTAMP' };
const now = Date.parse('2026-11-19T10:00:00.000Z');
const challengeDoc = () => ({
  enabled: true, id: SHIFT, schemaVersion: 1, version: 1,
  title: 'تحقيق آمن في أربع حوادث', description: 'أربعة تنبيهات للتحليل واتخاذ القرار.',
  alerts: ['A','B','C','D'].map(letter => ({
    id: 'a-' + letter, title: 'الإنذار ' + letter, description: 'تفاصيل سجل سري غير متاح للمتصفح إلا بعد البدء',
    evidence: ['10:00 event=one','10:01 event=two','10:02 event=three'],
    actions: ['one','two','three'].map(id => ({ id, label: 'إجراء تدريبي ' + id })),
    injectedScore: 100, secretRubric: 'DO_NOT_EXPOSE',
  })),
  correlations: ['link-one','link-two','link-three'].map(id => ({ id, label: 'ربط تدريبي ' + id })),
  adminNotes: 'PRIVATE_ONLY', correctAnswers: 'MUST_NOT_LEAK',
});
const rubric = () => ({
  enabled: true, version: 1,
  answers: Object.fromEntries(['A','B','C','D'].map(letter => [
    'a-' + letter, { priorityId: letter === 'A' ? 'p1' : letter === 'B' ? 'p2' : letter === 'C' ? 'p3' : 'p4', actionId: 'two' },
  ])),
  correlationId: 'link-two',
});
const perfect = () => ({
  responses: ['A','B','C','D'].map((letter,i) => ({
    alertId: 'a-' + letter, priorityId: ['p1','p2','p3','p4'][i], actionId: 'two',
  })),
  correlationId: 'link-two',
});

class MemoryFirestore {
  constructor() { this.rows = new Map(); }
  doc(path) { return { path }; }
  seed(path, value) { this.rows.set(path, structuredClone(value)); }
  async runTransaction(fn) {
    const writes = [];
    const tx = {
      get: async ref => ({ exists: this.rows.has(ref.path), data: () => structuredClone(this.rows.get(ref.path)) }),
      set: (ref, data) => writes.push(['set',ref.path,structuredClone(data)]),
      create: (ref, data) => { if (this.rows.has(ref.path)) throw Error('already-exists'); writes.push(['set',ref.path,structuredClone(data)]); },
      update: (ref, data) => { if (!this.rows.has(ref.path)) throw Error('not-found'); writes.push(['update',ref.path,structuredClone(data)]); },
    };
    const result = await fn(tx);
    for (const [kind, path, data] of writes) this.rows.set(path, kind==='update' ? { ...this.rows.get(path),...data } : data);
    return result;
  }
}
function database() {
  const db = new MemoryFirestore();
  db.seed('socVerifiedCatalog/'+SHIFT,challengeDoc());
  db.seed('socVerifiedRubrics/'+SHIFT,rubric());
  return db;
}
const start = db => startVerifiedSocSession(db,timestamp,UID,SHIFT,()=>now,()=>UUID);
const submit = (db,partial={}) => submitVerifiedSocSession(db,timestamp,{
  uid:UID, shiftId:SHIFT, sessionId:UUID, ...perfect(), ...partial,
},()=>now+5000);

test('public payload is a strict allowlist with zero rubric/key or score leakage', () => {
  const publicPayload = publicSocChallenge(challengeDoc());
  assert.equal(publicPayload.id,SHIFT);
  assert.equal(publicPayload.alerts.length,4);
  assert.equal(publicPayload.alerts[0].actions.length,3);
  const printed = JSON.stringify(publicPayload);
  for (const secret of ['PRIVATE_ONLY','DO_NOT_EXPOSE','MUST_NOT_LEAK','secretRubric','injectedScore','correctAnswers','priorityPoints','bestScore','priorityId']) {
    assert(!printed.includes(secret),secret);
  }
  assert.doesNotThrow(()=>assertSocRubric(rubric(),publicPayload));
});
test('perfect server grading gives 100 and rejects fake score fields and unknown choices',()=>{
  const publicPayload = publicSocChallenge(challengeDoc());
  assert.equal(scoreVerifiedSoc(perfect(),publicPayload,rubric()).score,100);
  assert.equal(scoreVerifiedSoc(perfect(),publicPayload,rubric()).priorityScore,32);
  assert.equal(scoreVerifiedSoc(perfect(),publicPayload,rubric()).responseScore,48);
  assert.equal(scoreVerifiedSoc(perfect(),publicPayload,rubric()).correlationScore,20);
  assert.throws(()=>requireSocSubmission({...perfect(),score:100},publicPayload),/invalid-submission/);
  assert.throws(()=>requireSocSubmission({...perfect(),responses:[...perfect().responses,...perfect().responses.slice(0,1)]},publicPayload),/invalid-submission/);
  assert.throws(()=>requireSocSubmission({...perfect(),responses:[...perfect().responses.slice(0,3),{alertId:'a-D',priorityId:'p4',actionId:'hacked'}]},publicPayload),/invalid-submission/);
  assert.throws(()=>requireSocSubmission({...perfect(),correlationId:'bogus'},publicPayload),/invalid-submission/);
  const altered={...perfect(),responses:perfect().responses.map(row => ({...row,priorityId:'p4',actionId:'one'})),correlationId:'link-one'};
  const result=scoreVerifiedSoc(altered,publicPayload,rubric());
  assert.equal(result.score,8);
});
test('rubric mismatches or malformed challenges fail closed',()=>{
  const publicPayload=publicSocChallenge(challengeDoc());
  assert.throws(()=>assertSocRubric({...rubric(),version:2},publicPayload),/invalid-private-rubric/);
  assert.throws(()=>assertSocRubric({...rubric(),answers:{'a-A':rubric().answers['a-A']}},publicPayload),/invalid-private-rubric/);
  assert.throws(()=>publicSocChallenge({...challengeDoc(),alerts:[...challengeDoc().alerts.slice(0,3)]}),/invalid-public-challenge/);
  assert.throws(()=>publicSocChallenge({...challengeDoc(),alerts:[...challengeDoc().alerts.slice(0,3),{...challengeDoc().alerts[0]}]}),/invalid-public-challenge/);
});
test('start requires enabled private rubric and catalog and atomically limits starts',async()=>{
  const db=database();
  const a=await start(db);
  assert.equal(a.sessionId,UUID);
  assert.equal(a.shiftId,SHIFT);
  assert.equal(a.expiresAtMs,now+20*60*1000);
  assert.equal(JSON.stringify(a).includes('DO_NOT_EXPOSE'),false);
  assert.equal(db.rows.get('socVerifiedSessions/'+UUID).uid,UID);
  assert.equal(db.rows.get('socVerifiedQuotas/'+UID).count,1);
  const disabled=database();
  disabled.seed('socVerifiedCatalog/'+SHIFT,{...challengeDoc(),enabled:false});
  await assert.rejects(()=>start(disabled),/challenge-unavailable/);
  assert.equal(disabled.rows.has('socVerifiedSessions/'+UUID),false);
  const missing=database();
  missing.rows.delete('socVerifiedRubrics/'+SHIFT);
  await assert.rejects(()=>start(missing),/challenge-unavailable/);
  assert.equal(missing.rows.has('socVerifiedQuotas/'+UID),false);
  assert.throws(()=>nextSocQuota({windowStartMs:now,count:VERIFIED_SOC_MAX_STARTS},now+100),/quota-exceeded/);
});
test('submitting changes ONLY server-owned receipt and consumes session once',async()=>{
  const db=database();
  await start(db);
  const res=await submit(db);
  assert.deepEqual(res,{shiftId:SHIFT,verifiedByServer:true,score:100,bestScore:100,maxScore:100,priorityScore:32,responseScore:48,correlationScore:20});
  assert.equal(db.rows.get('socVerifiedSessions/'+UUID).status,'consumed');
  assert.equal(db.rows.get('socVerifiedSessions/'+UUID).attempts,1);
  const receipt=db.rows.get('blackboxUsers/'+UID+'/verifiedSocShifts/'+SHIFT);
  assert.equal(receipt.bestScore,100);
  assert.equal(receipt.source,'server-grading');
  assert.equal(db.rows.has('blackboxUsers/'+UID+'/state/progress'),false);
  assert.equal(db.rows.has('blackboxUsers/'+UID+'/cybertrace/INC-0417'),false);
  await assert.rejects(()=>submit(db),/invalid-or-expired-session/);
  assert.equal(db.rows.get('blackboxUsers/'+UID+'/verifiedSocShifts/'+SHIFT).bestScore,100);
});
test('foreign user, expired session, version change and malformed request do not write a grade',async()=>{
  for(const patch of [{uid:'attacker'},{sessionId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}]) {
    const db=database();await start(db);
    await assert.rejects(()=>submit(db,patch),/invalid-or-expired-session/);
    assert.equal(db.rows.has('blackboxUsers/'+UID+'/verifiedSocShifts/'+SHIFT),false);
  }
  const expired=database();await start(expired);
  await assert.rejects(()=>submitVerifiedSocSession(expired,timestamp,{uid:UID,shiftId:SHIFT,sessionId:UUID,...perfect()},()=>now+21*60*1000),/invalid-or-expired-session/);
  const changed=database();await start(changed);
  changed.seed('socVerifiedCatalog/'+SHIFT,{...challengeDoc(),version:2});
  changed.seed('socVerifiedRubrics/'+SHIFT,{...rubric(),version:2});
  await assert.rejects(()=>submit(changed),/rubric-version-mismatch/);
  assert.equal(changed.rows.get('socVerifiedSessions/'+UUID).status,'open');
  const forged=database();await start(forged);
  await assert.rejects(()=>submit(forged,{responses:perfect().responses.map(row=>({...row,score:100}))}),/invalid-submission/);
  assert.equal(forged.rows.get('socVerifiedSessions/'+UUID).status,'open');
  assert.equal(forged.rows.has('blackboxUsers/'+UID+'/verifiedSocShifts/'+SHIFT),false);
});
test('private SOC documents cannot be accessed through Firestore client rules',()=>{
  const rules=readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8');
  for(const collection of ['socVerifiedCatalog','socVerifiedRubrics','socVerifiedSessions','socVerifiedQuotas']){
    assert.match(rules,new RegExp('match /'+collection+'/{[^}]+}\\s*\\{\\s*allow read, write: if false;'));
  }
  assert.match(rules,/match \/blackboxUsers\/\{uid\}\/verifiedSocShifts\/\{shiftId\}/);
  assert.match(rules,/allow create, update, delete: if false;/);
});
test('callable contract uses authenticated uid, App Check, no client supplied grade',()=>{
  const source=readFileSync(new URL('../index.js',import.meta.url),'utf8');
  assert.match(source,/startVerifiedSocShift = onCall\(\{ region: REGION, enforceAppCheck: true/);
  assert.match(source,/submitVerifiedSocShift = onCall\(\{ region: REGION, enforceAppCheck: true/);
  assert.match(source,/const uid = authUid\(request\);/);
  assert.match(source,/Object.keys\(data\).length === names.length/);
  assert(!source.includes('request.data.score'));
  assert(!source.includes('request.data.uid'));
});
