// Versioned new-features guide, independent of the first-visit landing and lab-directory guides.
const key='blackbox-whats-new-seen-v2';
const dialog=document.getElementById('bb-whats-new');
const openButton=document.getElementById('bb-whats-new-open');
const closeButton=document.getElementById('bb-whats-new-close');
const steps=[
  ['مختبرات BLACKBOX الجديدة','أضفنا دليلًا للمختبرات العملية يتضمن أهداف WebGoat وWireshark والمتطلبات والمستوى. افتح الدليل من الزر أدناه؛ التشغيل ما زال يدويًا.'],
  ['دليل إعداد المختبر للمستخدم الجديد','عند دخول دليل المختبرات لأول مرة تظهر جولة من خمس خطوات، ويمكن إعادة فتحها من زر «كيف أبدأ؟».'],
  ['فحص VirtualBox المحلي','أضفنا أداة Python للقراءة فقط تعرض الأجهزة وحالاتها وأنواع الشبكات. تحتاج إلى تشغيلها بنفسك على Windows؛ لا يوجد ربط مباشر أو تشغيل للآلات من الموقع.']
];
let step=0;
let previousFocus=null;
function seen(){try{return localStorage.getItem(key)==='1';}catch{return false;}}
function markSeen(){try{localStorage.setItem(key,'1');}catch{}}
function render(){
  document.getElementById('bb-whats-new-step').textContent='الجديد '+(step+1)+' / '+steps.length;
  document.getElementById('bb-whats-new-title').textContent=steps[step][0];
  document.getElementById('bb-whats-new-description').textContent=steps[step][1];
  document.getElementById('bb-whats-new-prev').disabled=step===0;
  document.getElementById('bb-whats-new-next').textContent=step===steps.length-1?'إنهاء':'التالي ←';
}
function show(){if(!dialog||dialog.open)return;previousFocus=document.activeElement;step=0;render();dialog.showModal();}
function close(){markSeen();if(dialog.open)dialog.close();previousFocus?.focus?.();}
openButton?.addEventListener('click',show);
closeButton?.addEventListener('click',close);
document.getElementById('bb-whats-new-prev')?.addEventListener('click',()=>{if(step){step--;render();}});
document.getElementById('bb-whats-new-next')?.addEventListener('click',()=>{if(step<steps.length-1){step++;render();}else close();});
dialog?.addEventListener('cancel',event=>{event.preventDefault();close();});
if(!seen())window.addEventListener('DOMContentLoaded',()=>{if(!document.body.classList.contains('bb-landing-active'))show();else {
  const observer=new MutationObserver(()=>{if(!document.body.classList.contains('bb-landing-active')){observer.disconnect();if(!seen())show();}});
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
}});
