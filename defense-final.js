import {verifiedAssessmentConfigured,caller} from './lab-assessment-client.js';

const byId=id=>document.getElementById(id);
const labels={logs:'تحليل السجلات',integrity:'سلامة الملفات',headers:'ترويسات الويب',email:'البريد المشبوه'};
const domains=Object.keys(labels);
const config=verifiedAssessmentConfigured;
const examStart=byId('exam-start'),examStatus=byId('exam-status'),form=byId('exam-form'),
  tasks=byId('exam-tasks'),submit=byId('exam-submit'),deadline=byId('exam-deadline'),
  result=byId('exam-result'),readinessButton=byId('refresh-readiness'),
  readiness=byId('readiness-status'),portfolioForm=byId('portfolio-form'),
  portfolioStatus=byId('portfolio-status'),fields=byId('portfolio-fields');
let session=null,answers={},inFlight=false,used=false,revision=0,latestUid=null;
const node=(name,value)=>{const e=document.createElement(name);if(value!==undefined)e.textContent=value;return e;};
const status=(target,message)=>{target.textContent=message;};
function optionsReady(){return Boolean(session)&&session.challenge.tasks.every(task=>
  task.options.some(o=>o.id===answers[task.id]));}
function examReset(){
  session=null;answers={};used=false;form.hidden=true;tasks.replaceChildren();result.hidden=true;
  submit.disabled=true;
}
function drawExam(challenge){
  tasks.replaceChildren();
  for(const question of challenge.tasks){
    const field=node('fieldset'),legend=node('legend',question.prompt);
    field.append(legend,node('p','المجال: '+labels[question.domain]));
    for(const line of question.evidence){
      const evidence=node('div',line);evidence.className='evidence-line';field.append(evidence);
    }
    for(const option of question.options){
      const label=node('label');label.className='option';const input=node('input');
      input.type='radio';input.name='task-'+question.id;input.value=option.id;
      input.addEventListener('change',()=>{
        answers[question.id]=option.id;submit.disabled=inFlight||used||!optionsReady();
      });
      label.append(input,node('span',option.label));field.append(label);
    }
    tasks.append(field);
  }
  submit.disabled=true;
}
function validateChallenge(opened){
  if(!opened||typeof opened.sessionId!=='string'||!/^[0-9a-f-]{36}$/.test(opened.sessionId)||
    !Number.isSafeInteger(opened.expiresAtMs)||opened.expiresAtMs<=Date.now()||
    opened.challenge?.groupId!=='defensive-analysis'||opened.challenge?.version!==1||
    !Array.isArray(opened.challenge.tasks)||opened.challenge.tasks.length!==12||
    opened.challenge.maxScore!==100)throw Error('رد الأسئلة غير متوافق مع نموذج الامتحان.');
  const ids=new Set(),tally=Object.fromEntries(domains.map(d=>[d,0]));
  for(const q of opened.challenge.tasks){
    if(typeof q.id!=='string'||ids.has(q.id)||!domains.includes(q.domain)||
      typeof q.prompt!=='string'||q.prompt.length<25||!Array.isArray(q.evidence)||
      q.evidence.length<2||!q.evidence.every(s=>typeof s==='string'&&s.length<=320)||
      !Array.isArray(q.options)||q.options.length!==4||
      !q.options.every(o=>typeof o.id==='string'&&typeof o.label==='string'))
      throw Error('محتوى الامتحان غير صالح.');
    ids.add(q.id);tally[q.domain]++;
  }
  if(domains.some(d=>tally[d]!==3))throw Error('توزيع مجالات الامتحان غير صالح.');
  return opened;
}
async function invoke(name,data){
  const send=await caller(name);
  return send(data);
}
function portfolioFields(){
  fields.replaceChildren();
  for(const [index,domain] of domains.entries()){
    const field=node('fieldset');field.className='portfolio-domain';
    field.append(node('legend',labels[domain]));
    const hint=node('p','الملف لا يُرفع إلى الخادم. تُحسب بصمته محليًا وتُرسل البصمة والملخص فقط.');field.append(hint);
    const fileLabel=node('label','اختيار ملف التقرير المحلي لحساب SHA-256');
    const file=node('input');file.type='file';file.accept='.txt,.json,.csv,.md,text/plain,application/json';
    const hashLabel=node('label','بصمة SHA-256 لملف التقرير');
    const hash=node('input');hash.type='text';hash.inputMode='text';hash.readOnly=true;hash.required=true;
    hash.maxLength=64;hash.placeholder='تُحسب بعد اختيار الملف';hash.className='hash';hash.dataset.domain=domain;
    const summaryLabel=node('label','ملاحظات عملية مدعومة بالدليل (80–1000 حرف)');
    const summary=node('textarea');summary.required=true;summary.minLength=80;summary.maxLength=1000;summary.rows=5;
    summary.dataset.field='summary';summary.dataset.domain=domain;
    const limitLabel=node('label','ما الذي لا يمكن إثباته من هذه البيانات؟ (30–500 حرف)');
    const limits=node('textarea');limits.required=true;limits.minLength=30;limits.maxLength=500;limits.rows=3;
    limits.dataset.field='limitations';limits.dataset.domain=domain;
    const compute=async()=>{hash.value='';const blob=file.files?.[0];
      if(!blob)return;
      if(blob.size>1024*1024){status(portfolioStatus,'الحد الأقصى للملف المحلي 1 MB.');file.value='';return;}
      try{
        const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
        if(file.files?.[0]!==blob)return;
        hash.value=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
      }catch{status(portfolioStatus,'تعذر حساب بصمة الملف محليًا.');}
    };
    file.addEventListener('change',()=>void compute());
    for(const [label,input] of [[fileLabel,file],[hashLabel,hash],[summaryLabel,summary],[limitLabel,limits]]){
      label.append(input);field.append(label);
    }
    fields.append(field);
  }
}
async function reloadReadiness(){
  if(!config)return;
  readinessButton.disabled=true;
  try{
    const state=await invoke('getMyDefenseFinalReadiness',{});
    if(state?.groupId!=='defensive-analysis'||state.credentialEligible!==false||
      state.certificateIssuanceEnabled!==false)throw Error('استجابة غير متوقعة.');
    status(readiness,'حالة المعرفة: '+(state.knowledgeExamPassed?'اجتزت الامتحان الخادمي':'لم يُسجل اجتياز')+
      ' · حالة ملف الأدلة: '+(state.evidenceStatus||'غير معروف')+' · لم تصدر شهادة.');
    portfolioForm.hidden=!state.knowledgeExamPassed||!['not-submitted','needs-revision'].includes(state.evidenceStatus);
    if(!portfolioForm.hidden)portfolioFields();
  }catch{status(readiness,'تعذر التحقق من حالة ملف الأدلة. لا توجد نتيجة معتمدة محليًا.');portfolioForm.hidden=true;}
  finally{readinessButton.disabled=false;}
}
examStart.disabled=!config;readinessButton.disabled=!config;
status(examStatus,config?
  'الواجهة مهيأة، لكن تشغيل الامتحان يتطلب كتالوجًا ومفتاح تصحيح معتمدين على Firebase.':
  'الامتحان النهائي غير مفعّل بعد: خدمات التقييم الخادمي وApp Check لم تُعتمد للإنتاج. يمكنك التدريب على الورش الأربع.');
examStart.addEventListener('click',async()=>{
  if(!config||inFlight)return;
  inFlight=true;examStart.disabled=true;examReset();status(examStatus,'طلب جلسة نهائية من الخادم…');
  try{
    const opened=validateChallenge(await invoke('beginDefenseFinalCapstone',{}));
    session=opened;drawExam(opened.challenge);form.hidden=false;
    status(deadline,'الجلسة تنتهي في: '+new Date(opened.expiresAtMs).toLocaleString('ar'));
    status(examStatus,'تم تحميل امتحان مستقل، ولن ترى مفاتيح التصحيح داخل المتصفح.');
  }catch(error){status(examStatus,error?.message||'تعذر فتح الامتحان. راجع تسجيل الدخول أو اعتماد الأسئلة.');}
  finally{inFlight=false;examStart.disabled=!config;}
});
form.addEventListener('submit',async event=>{
  event.preventDefault();if(inFlight||used||!session||!optionsReady())return;
  const current=session;used=true;inFlight=true;submit.disabled=true;
  status(examStatus,'تُصحّح إجاباتك الآن بواسطة الخادم…');
  try{
    const responses=current.challenge.tasks.map(q=>({taskId:q.id,choiceId:answers[q.id]}));
    const reply=await invoke('submitDefenseFinalCapstone',{sessionId:current.sessionId,responses});
    if(reply?.groupId!=='defensive-analysis'||reply.verifiedByServer!==true||
      reply.credentialEligible!==false||reply.practicalEvidenceVerified!==false||
      !Number.isSafeInteger(reply.score)||reply.score<0||reply.score>100||
      typeof reply.passed!=='boolean')throw Error('نتيجة غير صالحة من الخادم.');
    result.replaceChildren(node('p','نتيجة الامتحان: '+reply.score+'/100 — '+(reply.passed?'اجتياز معرفي':'لم يتحقق حد الاجتياز')),
      node('p','لا توجد شهادة موثّقة. يُراجع ملف الأدلة بصورة منفصلة، ويحتاج إثباتًا مستقلاً للتنفيذ العملي.'));
    result.hidden=false;
    status(examStatus,'سُجلت محاولة المعرفة على الخادم، ولا يمكن إعادة إرسال الجلسة نفسها.');
    await reloadReadiness();
  }catch(error){status(examStatus,error?.message||'لم يؤكد الخادم النتيجة؛ لا تُحتسب درجة محلية.');}
  finally{inFlight=false;submit.disabled=true;}
});
readinessButton.addEventListener('click',()=>void reloadReadiness());
byId('portfolio-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!config||inFlight)return;
  const items=domains.map(domain=>({domain,
    sha256:fields.querySelector('[data-domain="'+domain+'"].hash')?.value||'',
    summary:fields.querySelector('textarea[data-field="summary"][data-domain="'+domain+'"]')?.value||'',
    limitations:fields.querySelector('textarea[data-field="limitations"][data-domain="'+domain+'"]')?.value||'',
  }));
  if(!byId('portfolio-consent').checked||items.some(x=>!/^[0-9a-f]{64}$/.test(x.sha256)||
    x.summary.trim().length<80||x.limitations.trim().length<30))return;
  inFlight=true;byId('portfolio-submit').disabled=true;
  status(portfolioStatus,'إرسال ملخصات التدريب والبصمات للمراجعة، دون رفع الملفات…');
  try{
    const reply=await invoke('submitDefensePracticalPortfolio',{artifacts:items,consent:true});
    if(reply?.status!=='pending-review'||reply.credentialEligible!==false)throw Error('رد غير صالح.');
    status(portfolioStatus,'تم استلام ملف الأدلة للمراجعة فقط. لا توجد شهادة أو إثبات تنفيذ عملي معتمد.');
    portfolioForm.hidden=true;
    await reloadReadiness();
  }catch{status(portfolioStatus,'لم يؤكد الخادم استلام الملف. يمكنك مراجعته ثم إعادة المحاولة.');}
  finally{inFlight=false;byId('portfolio-submit').disabled=false;}
});
// Review controls are hidden without an administrator-issued custom claim;
// backend ALWAYS checks the claim again, independent of visible UI.
async function maybeShowReviewer(){
  if(!config||new URLSearchParams(location.search).get('reviewer')!=='1')return;
  try{
    const sdk=await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js');
    const authSDK=await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js');
    const app=sdk.getApps().find(a=>a.name==='blackbox-accounts') ??
      sdk.initializeApp((await import('./account-config.js')).accountConfig.firebase,'blackbox-accounts');
    const a=authSDK.getAuth(app);await a.authStateReady();
    const user=a.currentUser;if(!user)return;
    const token=await authSDK.getIdTokenResult(user,true);
    if(token.claims.certificateReviewer===true)byId('reviewer-console').hidden=false;
  }catch{/* No review UI on missing, stale or untrusted claim. */}
}
void maybeShowReviewer();
const reviewForm=byId('reviewer-lookup'),reviewerStatus=byId('reviewer-status');
reviewForm.addEventListener('submit',async event=>{
  event.preventDefault();const candidate=byId('candidate-uid').value.trim();
  byId('reviewer-decision').hidden=true;byId('reviewer-record').textContent='';
  if(!candidate||candidate.includes('/'))return;
  status(reviewerStatus,'قراءة سجل الأدلة بواسطة صلاحية مراجعة خادمية…');
  try{
    const r=await invoke('getDefensePortfolioForReview',{candidateUid:candidate});
    if(r?.candidateUid!==candidate||!Array.isArray(r.artifacts)||r.practicalEvidenceVerified!==false)
      throw Error('رد غير صالح.');
    const rows=r.artifacts.map(x=>labels[x.domain]+':\nبصمة الملف: '+x.sha256+
      '\nالتحليل: '+x.summary+'\nالقيود: '+x.limitations);
    byId('reviewer-record').textContent='الحالة: '+r.reviewStatus+'\n'+rows.join('\n\n');
    byId('reviewer-decision').hidden=r.reviewStatus!=='pending-review';
    status(reviewerStatus,'هذه مراجعة تفسير وتحقيق، وليست اعتمادًا لتنفيذ جهاز المستخدم.');
  }catch{status(reviewerStatus,'لا يمكن فتح السجل أو أنك لا تملك صلاحية المراجعة.');}
});
byId('reviewer-decision').addEventListener('submit',async event=>{
  event.preventDefault();const candidateUid=byId('candidate-uid').value.trim();
  const decision=byId('review-decision').value,reviewNote=byId('review-note').value;
  if(reviewNote.trim().length<30)return;
  status(reviewerStatus,'حفظ القرار لدى الخادم…');
  try{
    const r=await invoke('reviewDefensePracticalPortfolio',{candidateUid,decision,reviewNote});
    if(r?.candidateUid!==candidateUid||r.credentialEligible!==false||
      r.practicalEvidenceVerified!==false)throw Error('invalid response');
    byId('reviewer-decision').hidden=true;
    status(reviewerStatus,'تم حفظ قرار «'+r.status+'» في سجل التدقيق؛ لا يجيز إصدار شهادة.');
  }catch{status(reviewerStatus,'تعذّر حفظ القرار؛ تحقق من الصلاحيات وحالة السجل.');}
});
