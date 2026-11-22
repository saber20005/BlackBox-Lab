import {PILOT_EVIDENCE_LABS,pilotLabById} from './assets/modules/training/certification-pilot.js';
import {verifiedAssessmentConfigured,beginVerifiedAssessment,submitVerifiedAssessment} from './lab-assessment-client.js';

const list=document.getElementById('lab-list'),work=document.getElementById('work-content');
const heading=document.getElementById('work-title'),sub=document.getElementById('work-subtitle');
const category=document.getElementById('work-category');
const state=document.getElementById('assessment-state');
const start=document.getElementById('assessment-start');
const form=document.getElementById('assessment-form');
const questions=document.getElementById('assessment-questions');
const submit=document.getElementById('assessment-submit');
const result=document.getElementById('assessment-result');
let active=null,session=null,choices={},busy=false,issued=false,epoch=0;
function element(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
function listOf(items,tag='ul'){
 const root=element(tag);
 for(const item of items)root.append(element('li',item));
 return root;
}
function selectLab(id){
 const lab=pilotLabById(id);
 if(!lab)return;
 active=lab;epoch++;session=null;choices={};busy=false;issued=false;
 form.hidden=true;questions.replaceChildren();result.hidden=true;result.textContent='';
 start.disabled=!verifiedAssessmentConfigured;
 heading.textContent=lab.title;sub.textContent=lab.subtitle;category.textContent=lab.category+' · '+lab.minutes+' دقيقة';
 work.replaceChildren();
 work.append(element('h3','النتائج التعليمية المستهدفة'),listOf(lab.goals));
 work.append(element('h3','الحزمة المحلية والأمر التجريبي'));
 const intro=element('p','احفظ حزمة blackbox-defense كاملة، ثم افتح الطرفية داخل المجلد الذي يحتوي analyze.py. استخدم Python 3 دون أي اتصال بالشبكة.');work.append(intro);
 work.append(element('code',lab.commands.join('\n'),'lesson-command'));
 const file=element('p','ملفات الأدلة: '+lab.file);work.append(file);
 work.append(element('h3','خطوات المختبر'),listOf(lab.steps,'ol'));
 work.append(element('h3','ما الذي يجب أن توثقه؟'),listOf(lab.deliverables));
 work.append(element('p',lab.caution,'training-caution'));
 const stage=element('a','فتح مرحلة التدريب الأصلية ←');
 stage.href='./?track='+encodeURIComponent(lab.trackId)+'&stage=0';work.append(stage);
 const btns=[...list.querySelectorAll('.lab-choice')];for(const btn of btns)btn.setAttribute('aria-pressed',String(btn.dataset.labId===lab.id));
 state.textContent=verifiedAssessmentConfigured?
  'لتبدأ يجب تسجيل دخولك إلى BLACKBOX وتفعيل الاختبار المعتمد لدى المشرف. لا تُعتمد نتيجة محلية.':
  'التدريب المحلي متاح الآن. التقييم الخادمي لم يُفعّل بعد ولم تُنشر التقييمات الخاصة لهذا المختبر.';
}
for(const lab of PILOT_EVIDENCE_LABS){
 const btn=element('button',undefined,'lab-choice');btn.type='button';btn.dataset.labId=lab.id;
 btn.append(element('strong',lab.title),element('span',lab.category+' · '+lab.minutes+' دقيقة'));
 btn.addEventListener('click',()=>selectLab(lab.id));list.append(btn);
}
function updateSubmit(){
 submit.disabled=busy||!session||issued||session.challenge.tasks.some(t=>!t.options.some(o=>o.id===choices[t.id]));
}
function renderQuestions(){
 questions.replaceChildren();
 for(const task of session.challenge.tasks){
   const field=element('fieldset'),legend=element('legend',task.prompt);field.append(legend);
   for(const option of task.options){
     const label=element('label'),input=element('input');
     input.type='radio';input.name='task-'+task.id;input.value=option.id;
     input.addEventListener('change',()=>{choices[task.id]=option.id;updateSubmit();});
     label.append(input,element('span',option.label));field.append(label);
   }
   questions.append(field);
 }
 updateSubmit();
}
start.addEventListener('click',async()=>{
 if(busy||!active||!verifiedAssessmentConfigured)return;
 const current=active.stageKey,ticket=++epoch;
 busy=true;start.disabled=true;state.textContent='جارٍ طلب جلسة مصادقة وتقييم من الخادم…';
 form.hidden=true;result.hidden=true;choices={};session=null;issued=false;
 try{
   const opened=await beginVerifiedAssessment(current);
   if(ticket!==epoch||active?.stageKey!==current)return;
   session=opened;renderQuestions();form.hidden=false;
   state.textContent='جلسة خادمية محددة المدة. اختر إجابة واحدة لكل مهمة، ثم أرسلها مرة واحدة.';
 }catch(error){
   if(ticket!==epoch)return;
   state.textContent=error?.message||'تعذر تشغيل التقييم. لن تُحتسب درجة.';
 }finally{if(ticket===epoch){busy=false;start.disabled=!verifiedAssessmentConfigured;updateSubmit();}}
});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy||!session||issued)return;
 updateSubmit();if(submit.disabled)return;
 const initial=session,current=active.stageKey,ticket=epoch;
 const responses=initial.challenge.tasks.map(t=>({taskId:t.id,choiceId:choices[t.id]}));
 busy=true;issued=true;submit.disabled=true;state.textContent='جارٍ التحقق من الإجابات على خادم BLACKBOX…';
 try{
   const scored=await submitVerifiedAssessment({stageKey:current,sessionId:initial.sessionId,responses});
   if(ticket!==epoch||active?.stageKey!==current)return;
   const report=element('p','الدرجة المحتسبة خادميًا: '+scored.score+' / '+scored.maxScore+' — أفضل نتيجة: '+scored.bestScore+' / 70.');
   result.replaceChildren(report,element('p','هذا توثيق للتقييم المعرفي فقط، وليس شهادة مهارة عملية.'));
   result.hidden=false;state.textContent='تم تقييم المحاولة على الخادم. يمكنك بدء محاولة جديدة ضمن الحدود المسموحة.';
 }catch(error){
   if(ticket!==epoch)return;
   state.textContent='لم نحصل على تأكيد خادمي صالح: '+(error?.message||'قد تكون الجلسة استُهلكت. ابدأ جلسة جديدة.');
 }finally{if(ticket===epoch){busy=false;start.disabled=!verifiedAssessmentConfigured;updateSubmit();}}
});
const query=new URLSearchParams(location.search).get('lab');
selectLab(pilotLabById(query)?.id||PILOT_EVIDENCE_LABS[0].id);
