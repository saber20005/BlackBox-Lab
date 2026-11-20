(() => {
'use strict';
// Keep guide bindings local: this file is loaded alongside other classic scripts.
const key='blackbox-whats-new-seen-v2';
const dialog=document.getElementById('bb-whats-new');
const openButton=document.getElementById('bb-whats-new-open');
const closeButton=document.getElementById('bb-whats-new-close');
const steps=[
  ['تدريب دفاعي بأدلة محلية','أضفنا مسارات لتحليل سجلات المصادقة وسلامة الملفات وترويسات الويب والبريد المشبوه، مع حزمة ملفات تدريبية محلية للتطبيق والتوثيق.'],
  ['مختبرات BLACKBOX الجديدة','أضفنا دليلًا للمختبرات العملية يتضمن أهداف WebGoat وWireshark والمتطلبات والمستوى. افتح الدليل من الزر أدناه؛ التشغيل ما زال يدويًا.'],
  ['دليل إعداد المختبر للمستخدم الجديد','عند دخول دليل المختبرات لأول مرة تظهر جولة من خمس خطوات، ويمكن إعادة فتحها من زر «كيف أبدأ؟».'],
  ['فحص VirtualBox المحلي','أضفنا أداة Python للقراءة فقط تعرض الأجهزة وحالاتها وأنواع الشبكات. تحتاج إلى تشغيلها بنفسك على Windows؛ لا يوجد ربط مباشر أو تشغيل للآلات من الموقع.']
];
let step=0;
let previousFocus=null;
function focusVisible(element){
  if(!element||element.isConnected===false||element.disabled||!element.getClientRects().length)return false;
  const style=getComputedStyle(element);
  if(style.display==='none'||style.visibility==='hidden')return false;
  element.focus({preventScroll:true});
  return true;
}
function restoreFocus(){
  try{localStorage.setItem(key,'1');}catch{}
  const previous=previousFocus;previousFocus=null;
  if(!focusVisible(previous))focusVisible(document.getElementById('main-content'));
}
function render(){
  document.getElementById('bb-whats-new-step').textContent='الجديد '+(step+1)+' / '+steps.length;
  document.getElementById('bb-whats-new-title').textContent=steps[step][0];
  document.getElementById('bb-whats-new-description').textContent=steps[step][1];
  document.getElementById('bb-whats-new-prev').disabled=step===0;
  document.getElementById('bb-whats-new-next').textContent=step===steps.length-1?'إنهاء':'التالي ←';
}
function show(){
  if(!dialog||dialog.open||dialog.isConnected===false)return;
  // An account/import dialog owns its state and must not be dismissed by this guide.
  if(document.querySelector('dialog[open]:not(#bb-whats-new)'))return;
  const opener=document.activeElement;
  document.dispatchEvent(new Event('blackbox:stop-tour'));
  previousFocus=opener;step=0;render();
  try{dialog.showModal();document.getElementById('bb-whats-new-next')?.focus();}
  catch{previousFocus=null;if(!focusVisible(opener))focusVisible(document.getElementById('main-content'));}
}
function close(){if(dialog?.open)dialog.close();}
openButton?.addEventListener('click',show);
closeButton?.addEventListener('click',close);
document.getElementById('bb-whats-new-prev')?.addEventListener('click',()=>{if(step){step--;render();}});
document.getElementById('bb-whats-new-next')?.addEventListener('click',()=>{if(step<steps.length-1){step++;render();}else close();});
dialog?.addEventListener('cancel',event=>{event.preventDefault();close();});
dialog?.addEventListener('close',restoreFocus);
// The prominent workspace button is the only launch; landing and tours stay uninterrupted.
})();
