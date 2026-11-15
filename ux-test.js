// Voluntary, self-reported UX pilot. No network, cookies, analytics events, or storage.
import {summarizeUX} from './ux-test-model.js';
const form=document.getElementById('ux-form');
const status=document.getElementById('status');
form.addEventListener('submit',event=>{
 event.preventDefault();
 if(!form.reportValidity())return;
 const answers={tasks:['t1','t2','t3'].map(id=>document.getElementById(id).value),ease:Number(document.getElementById('ease').value),problem:document.getElementById('problem').value.trim(),suggestion:document.getElementById('suggestion').value.trim()};
 const summary=summarizeUX(answers);
 const blob=new Blob([JSON.stringify({schema:'blackbox-ux-pilot-v1',submittedAt:new Date().toISOString(),...answers,summary},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='blackbox-ux-feedback.json';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
 status.textContent='تم تجهيز الملف محليًا. أرسله لفريق التطوير فقط إذا رغبت.';
});
form.addEventListener('reset',()=>{status.textContent='';});
