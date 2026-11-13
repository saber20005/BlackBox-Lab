(() => {
const landing=document.getElementById('landing-page');
const overlay=document.getElementById('bb-tour-overlay');
const spotlight=document.getElementById('bb-tour-spotlight');
const bubble=document.getElementById('bb-tour-bubble');
const title=document.getElementById('bb-tour-heading');
const description=document.getElementById('bb-tour-description');
const count=document.getElementById('bb-tour-count');
const next=document.getElementById('bb-tour-next');
const prev=document.getElementById('bb-tour-prev');
const steps=[
  {selector:'[data-view="home"]',title:'لوحة التحكم',description:'هنا ترى ملخص تقدمك وتستكمل التدريب من آخر مرحلة.'},
  {selector:'[data-view="tracks"]',title:'اختر مسار التدريب',description:'اضغط هنا لاستعراض المسارات الستة واختيار المرحلة المناسبة لك.'},
  {selector:'[data-view="plan"]',title:'جهّز خطة جلستك',description:'اختر الوقت والمجال للحصول على اقتراح تدريبي يناسب تقدمك.'},
  {selector:'[data-view="journal"]',title:'دوّن ما تعلمته',description:'استخدم سجل المختبر لمراجعة الملاحظات والنتائج التي وثّقتها.'},
  {selector:'[data-view="backups"]',title:'احفظ نسخة من تقدمك',description:'نزّل نسخة احتياطية وتقارير التدريب حتى لا تفقد نتائجك.'},
  {selector:'[data-view="troubleshoot"]',title:'حلول الأعطال',description:'إذا واجهت مشكلة في المختبر، ابدأ من هنا لقراءة إرشادات التشخيص.'}
];
let index=0,active=false,priorFocus=null;
function isHome(){return !new URL(location.href).searchParams.has('view')&&!new URL(location.href).searchParams.has('track')&&!new URL(location.href).searchParams.has('stage');}
function enter(){document.body.classList.remove('bb-landing-active');landing.hidden=true;document.getElementById('main-content')?.scrollIntoView({block:'start'});}
function showLanding(){if(!isHome())return;landing.hidden=false;document.body.classList.add('bb-landing-active');}
function position(){
 const element=document.querySelector(steps[index].selector);if(!element){end();return;}
 element.scrollIntoView({block:'nearest',behavior:'instant'});
 const rect=element.getBoundingClientRect(),pad=5;
 spotlight.style.top=Math.max(0,rect.top-pad)+'px';spotlight.style.left=Math.max(0,rect.left-pad)+'px';spotlight.style.width=rect.width+pad*2+'px';spotlight.style.height=rect.height+pad*2+'px';
 title.textContent=steps[index].title;description.textContent=steps[index].description;count.textContent=(index+1)+' / '+steps.length;
 prev.disabled=index===0;next.textContent=index===steps.length-1?'إنهاء الجولة ✓':'التالي ←';
 const width=Math.min(340,innerWidth-32);let left=Math.max(16,Math.min(innerWidth-width-16,rect.right+14));if(rect.right+width+25>innerWidth)left=Math.max(16,rect.left-width-14);
 let top=Math.max(16,Math.min(innerHeight-240,rect.top));if(innerWidth<700){left=16;top=Math.max(16,innerHeight-255);}
 bubble.style.left=left+'px';bubble.style.top=top+'px';
}
function end(){active=false;overlay.hidden=true;window.removeEventListener('resize',position);priorFocus?.focus?.();}
function begin(){priorFocus=document.activeElement;enter();index=0;active=true;overlay.hidden=false;window.addEventListener('resize',position);position();next.focus();}
for(const id of ['landing-enter','landing-enter-top'])document.getElementById(id)?.addEventListener('click',enter);
for(const id of ['landing-start-tour','landing-start-tour-bottom'])document.getElementById(id)?.addEventListener('click',begin);
next?.addEventListener('click',()=>{if(index===steps.length-1){end();return;}index++;position();});
prev?.addEventListener('click',()=>{if(index>0){index--;position();}});
document.getElementById('bb-tour-skip')?.addEventListener('click',end);
document.addEventListener('keydown',e=>{if(active&&e.key==='Escape')end();});
window.addEventListener('popstate',()=>{end();if(isHome())showLanding();else enter();});
showLanding();
})();
