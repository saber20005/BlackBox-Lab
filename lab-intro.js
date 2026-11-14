// Accessible first-visit introduction for the labs directory; no tracking or external calls.
const steps = Object.freeze([
  {title:'مرحبًا في مختبرات BLACKBOX',body:'هنا تجد مختبرات تدريب فعلية تنفذها على أجهزتك المصرّح بها. الفهرس يعرض المتطلبات والأهداف، لكنه لا يشغّل الأجهزة من المتصفح.'},
  {title:'جهّز بيئة معزولة',body:'ثبّت VirtualBox وشغّل Kali Linux وآلة الهدف في شبكة Host-Only أو Internal Network. افحص جميع محولات الشبكة؛ لا تعتبر NAT أو Bridged معزولين.'},
  {title:'اختر المختبر وراجع المتطلبات',body:'صفِّ المختبرات حسب المجال والمستوى، ثم افتح تفاصيل المختبر لقراءة المتطلبات والأهداف. أنشئ Snapshot قبل أي تجربة.'},
  {title:'افحص إعدادات VirtualBox محليًا',body:'يوجد برنامج Python اختياري للقراءة فقط يفحص أسماء الأجهزة وحالاتها وأنواع الشبكات. شغّله على جهازك بنفسك. الموقع لا يتصل بالبرنامج ولا ينفّذ أوامر على Windows.'},
  {title:'نفّذ ووثّق',body:'نفّذ التدريب على آلاتك المعزولة، ثم عد إلى مسارات BLACKBOX وسجل الملاحظات والنتائج. التقييم الخادمي الآلي لم يُفعّل بعد.'}
]);
const storageKey='blackbox-labs-guide-seen-v1';
const dialog=document.getElementById('lab-intro');
const heading=document.getElementById('lab-intro-title');
const body=document.getElementById('lab-intro-body');
const progress=document.getElementById('lab-intro-progress');
const back=document.getElementById('lab-intro-back');
const next=document.getElementById('lab-intro-next');
const close=document.getElementById('lab-intro-close');
const open=document.getElementById('lab-intro-open');
let step=0;
let lastFocus=null;
function render(){
  const item=steps[step];
  heading.textContent=item.title;
  body.textContent=item.body;
  progress.textContent='الخطوة '+(step+1)+' من '+steps.length;
  back.disabled=step===0;
  next.textContent=step===steps.length-1?'إنهاء':'التالي ←';
}
function markSeen(){try{localStorage.setItem(storageKey,'1');}catch{}}
function dismiss(){
  markSeen();
  if(dialog.open)dialog.close();
  lastFocus?.focus?.();
}
function show(){lastFocus=document.activeElement;step=0;render();if(!dialog.open)dialog.showModal();}
back.addEventListener('click',()=>{if(step){step--;render();}});
next.addEventListener('click',()=>{if(step<steps.length-1){step++;render();}else dismiss();});
close.addEventListener('click',dismiss);
open.addEventListener('click',show);
dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
dialog.addEventListener('click',event=>{if(event.target===dialog)dismiss();});
try{if(localStorage.getItem(storageKey)!=='1')show();}catch{show();}
