import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startVerifiedSocSession, submitVerifiedSocSession } from '../soc-verified-service.js';
import { VERIFIED_SOC_ID, VERIFIED_SOC_MAX_STARTS } from '../soc-verified-core.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  test('SOC verified integration requires an explicit local Firestore emulator', { skip: true }, () => {});
} else {
  const host = process.env.FIRESTORE_EMULATOR_HOST.split(':')[0];
  assert(['localhost','127.0.0.1','::1'].includes(host),'Tests may never hit a production Firestore');
  const path = process.env.BLACKBOX_FIREBASE_TEST_DEPS;
  assert(path,'Missing emulator test dependencies');
  const require = createRequire(`${path}/package.json`);
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  let app, db;
  const shiftId = VERIFIED_SOC_ID;
  const template = {
    enabled: true, id: shiftId, schemaVersion: 1, version: 1,
    title: 'مناوبة تقييم الموثوقية', description: 'تدريب اصطناعي لا يحتوي على بيانات حساسة حقيقية.',
    alerts: ['A','B','C','D'].map(id => ({
      id: 'alert'+id, title: 'تنبيه '+id, description: 'تحقق من السجلات قبل إغلاق الحالة.',
      evidence: ['10:01 simulated=1','10:02 simulated=2','10:03 simulated=3'],
      actions: ['x','y','z'].map(code => ({ id: code, label: 'تدخل تدريبي '+code })),
    })),
    correlations: ['linked','unrelated','unknown'].map(code => ({ id: code, label: 'ربط محتمل '+code })),
  };
  const rubric = {
    enabled: true, version: 1,
    answers: Object.fromEntries(['A','B','C','D'].map((id,index) => ['alert'+id,{ priorityId: ['p1','p2','p3','p4'][index], actionId: 'y' }])),
    correlationId: 'linked',
  };
  const correct = {
    responses: ['A','B','C','D'].map((id,index) => ({ alertId:'alert'+id, priorityId:['p1','p2','p3','p4'][index],actionId:'y' })),
    correlationId: 'linked',
  };
  before(() => {
    app=initializeApp({projectId:'demo-blackbox-account-tests'},'soc-verified-emulator-tests');
    db=getFirestore(app);
  });
  after(async () => {if(app) await deleteApp(app);});

  test('SOC start exposes only public options; submitting is atomic, owner-bound, single use',async () => {
    const uid='soc-integration-'+Date.now();
    await db.doc('socVerifiedCatalog/'+shiftId).set(template);
    await db.doc('socVerifiedRubrics/'+shiftId).set(rubric);
    const started=await startVerifiedSocSession(db,FieldValue,uid,shiftId);
    assert.equal(started.challenge.alerts.length,4);
    assert.equal(JSON.stringify(started.challenge).includes('priorityId'),false);
    assert.equal(JSON.stringify(started.challenge).includes('enabled'),false);
    await assert.rejects(
      submitVerifiedSocSession(db,FieldValue,{uid:uid+'-other',shiftId,sessionId:started.sessionId,...correct}),
      /invalid-or-expired-session/);
    const calls=await Promise.allSettled([
      submitVerifiedSocSession(db,FieldValue,{uid,shiftId,sessionId:started.sessionId,...correct}),
      submitVerifiedSocSession(db,FieldValue,{uid,shiftId,sessionId:started.sessionId,...correct}),
    ]);
    assert.equal(calls.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(calls.find(x=>x.status==='fulfilled').value.score,100);
    const stored=(await db.doc(`blackboxUsers/${uid}/verifiedSocShifts/${shiftId}`).get()).data();
    assert.equal(stored.bestScore,100);
    assert.equal(stored.source,'server-grading');
    assert.equal((await db.doc('socVerifiedSessions/'+started.sessionId).get()).data().status,'consumed');
    assert.equal((await db.doc(`blackboxUsers/${uid}/cybertrace/INC-0417`).get()).exists,false);
    assert.equal((await db.doc(`blackboxUsers/${uid}/state/progress`).get()).exists,false);
    await assert.rejects(
      submitVerifiedSocSession(db,FieldValue,{uid,shiftId,sessionId:started.sessionId,...correct}),
      /invalid-or-expired-session/);
  });

  test('SOC quota is transactional and independent across UIDs',async () => {
    await db.doc('socVerifiedCatalog/'+shiftId).set(template);
    await db.doc('socVerifiedRubrics/'+shiftId).set(rubric);
    const uid='soc-rate-'+Date.now();
    for(let i=0;i<VERIFIED_SOC_MAX_STARTS;i++){
      const item=await startVerifiedSocSession(db,FieldValue,uid,shiftId);
      assert.ok(item.sessionId);
    }
    await assert.rejects(()=>startVerifiedSocSession(db,FieldValue,uid,shiftId),/quota-exceeded/);
    assert.equal((await db.doc('socVerifiedQuotas/'+uid).get()).data().count,VERIFIED_SOC_MAX_STARTS);
    const next=await startVerifiedSocSession(db,FieldValue,uid+'-other',shiftId);
    assert.ok(next.sessionId);
  });
}
