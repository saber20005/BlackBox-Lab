import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PILOT_EVIDENCE_LABS,pilotLabById,certificatePilotCriteria} from '../assets/modules/training/certification-pilot.js';
import {labs,validateLab} from '../assets/modules/training/lab-catalog.js';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('first four documented practical exercises map to actual BLACKBOX training tracks',()=>{
 assert.equal(PILOT_EVIDENCE_LABS.length,4);
 assert.deepEqual(PILOT_EVIDENCE_LABS.map(x=>x.stageKey),['logs-0','integrity-0','headers-0','email-0']);
 assert.equal(new Set(PILOT_EVIDENCE_LABS.map(x=>x.id)).size,4);
 for(const item of PILOT_EVIDENCE_LABS){
   assert.equal(pilotLabById(item.id),item);
   assert.equal(item.trackId+'-0',item.stageKey);
   assert(item.steps.length>=4&&item.deliverables.length>=3);
   const catalog=labs.find(x=>x.id==='defense-'+item.id);
   assert(catalog&&validateLab(catalog));
   assert.equal(catalog.trackId,item.trackId);
   assert.equal(catalog.status,'manual');
   assert.equal(catalog.runtime,'local');
 }
 assert.equal(certificatePilotCriteria.requiresIndependentPracticalEvidence,true);
 assert.equal(certificatePilotCriteria.issuanceEnabled,false);
});
test('labs page is discoverable without falsely claiming completion or certification',()=>{
 const lab=read('../evidence-labs.html'),js=read('../evidence-labs.js');
 for(const p of ['labs.html','certificates.html','training-guide.html'])assert(read('../'+p).includes('evidence-labs.html'));
 assert(lab.includes('ليس إصدارًا لشهادة'));
 assert(lab.includes('assessment-form'));
 assert(js.includes('textContent=lab.title'));
 assert(js.includes('beginVerifiedAssessment(current)'));
 assert(js.includes('submitVerifiedAssessment('));
 assert(js.includes('result.hidden=false'));
 assert(!js.includes('window.localStorage.setItem'));
});
test('the new assessment client hard-fails closed until verified App Check and admin rubrics are available',()=>{
 const api=read('../lab-assessment-client.js');
 assert(api.includes('accountConfig.grading?.enabled === true'));
 assert(api.includes("app.options.projectId!=='black-box-lab'"));
 assert(api.includes("ReCaptchaEnterpriseProvider"));
 assert(api.includes("httpsCallable"));
 assert(api.includes('out.verifiedByServer!==true'));
 assert(api.includes('out.credentialEligible!==false'));
 assert(!api.includes('setDoc('));
 assert(!api.includes('localStorage'));
});
test('all read-only lab resources and safe commands exist in the existing training kit',()=>{
 const base='../training-kit/blackbox-defense/';
 for(const path of ['auth-events.csv','integrity/change-context.json','headers/before.txt','headers/after.txt','email/suspicious.eml','email/legitimate.eml','analyze.py']){
   assert(read(base+path).length>25,path);
 }
 for(const lab of PILOT_EVIDENCE_LABS){
   assert.equal(lab.commands.length,1);
   assert.match(lab.commands[0],/^python3 analyze\.py (logs|integrity|headers|email) --json$/);
 }
});
