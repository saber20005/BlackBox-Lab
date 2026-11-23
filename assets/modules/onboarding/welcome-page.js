// Lightweight, self-contained 5-step tour matching the CyberTrace experience pattern.
// Mock decisions are not training progress, proof of lab isolation or verified certificates.
export const BB_TOUR_STEPS = Object.freeze([
 {id:"welcome",tag:"WELCOME / 01",title:"ابدأ رحلتك داخل BLACKBOX",lead:"تدرّب على الأمن السيبراني بمهمات قصيرة وأدلة موثّقة. تعرف أولًا على المسارات والمهارات، ثم اختر ما تستطيع تطبيقه بأمان على جهازك.",label:"البداية"},
 {id:"tracks",tag:"LEARNING PATHS / 02",title:"اختر المسار المناسب",lead:"تضم BLACKBOX عشرة مسارات وثلاثين مرحلة. بعض الأنشطة تعتمد على ملفات وأدلة داخل المتصفح، وأخرى تتطلب مختبرًا محليًا من إعدادك.",label:"المسارات"},
 {id:"isolation",tag:"SAFE LAB / 03",title:"الأمان قبل تشغيل أي أداة",lead:"عند التدريب باستخدام Windows وKali Linux داخل VirtualBox، تأكد من تحديد الآلات المصرح لك باختبارها، وعزل الشبكة، وإنشاء Snapshot قبل التجربة.",label:"بيئة المختبر"},
 {id:"evidence",tag:"EVIDENCE / 04",title:"وثّق نتيجة، لا مجرّد علامة صح",lead:"دوّن الأدلة والاستنتاجات داخل المرحلة، ثم راجعها في سجل المختبر. الإنجاز الذي تؤكده يدويًا لا يعني اجتياز تقييم أمني موثّق.",label:"التوثيق"},
 {id:"start",tag:"YOUR NEXT MOVE / 05",title:"اختر المهمة الأولى",lead:"يمكنك البدء بملفات تدريب داخل المتصفح دون تثبيت أدوات، أو تجهيز VirtualBox وKali في دليل مستقل. التخصيص والمزامنة اختياريان.",label:"ابدأ الآن"}
]);
export const BB_TOUR_DEMOS=Object.freeze({
 tracks:[
 {id:"logs",label:"تحليل سجلات تدريبية داخل المتصفح",correct:true,reply:"مناسب للبدء الآن: تستطيع تحليل ملف تدريبي دون استخدام آلة افتراضية أو إرسال فحوص إلى الشبكة."},
 {id:"nmap",label:"فحص منافذ أي عنوان على الإنترنت",correct:false,reply:"هذه ليست بداية آمنة. أدوات الفحص تتطلب نطاقًا محددًا وتصريحًا وهدفًا داخل مختبرك."},
 {id:"vm",label:"تشغيل Kali على هدف لم أتحقق من ملكيته",correct:false,reply:"لا تبدأ قبل إثبات التصريح وتحديد الهدف وحدود الشبكة. يمكنك الاكتفاء بالتدريبات داخل المتصفح."}
 ],
 isolation:[
 {id:"hostonly",label:"Host-only مع فحص محولات كل VM ووجود Snapshot",correct:true,reply:"اختيار جيد للتجربة المحددة، لكن Host-only وحده لا يضمن العزل إذا بقي محول NAT أو Bridged مفعّلًا. افحص جميع المحولات أولًا."},
 {id:"bridged",label:"Bridged مباشرة إلى الشبكة المنزلية",correct:false,reply:"لا تستخدم Bridged مع هدف ضعيف دون ضوابط صريحة. هذه الحالة قد تعرّض الأجهزة الأخرى في شبكتك للنشاط."},
 {id:"guess",label:"أفترض أن المختبر معزول لأن Kali يعمل",correct:false,reply:"تشغيل Kali لا يثبت العزل. تحقق من إعدادات VirtualBox، النطاق، والواجهات الفعلية قبل أي فحص."}
 ],
 evidence:[
 {id:"evidence",label:"أسجّل المخرجات والتفسير والخطوة التالية",correct:true,reply:"هذا توثيق مفيد: سجّل الدليل، ما يعنيه، وما الذي تحتاج التحقق منه لاحقًا. يُحفظ فقط عندما تكتبه داخل المرحلة الحقيقية."},
 {id:"finish",label:"أعلّم المرحلة مكتملة دون دليل",correct:false,reply:"إشارة الإكمال اليدوية وحدها لا تثبت المهارة ولا تمنح تقييمًا خادميًا أو شهادة موثقة."},
 {id:"publish",label:"أنشر سجلات الحساب الحقيقية علنًا",correct:false,reply:"أزل المعلومات الحساسة أولًا. تصدير التقارير والمشاركة قرار يجب اتخاذه بحذر."}
 ]
});
const fmt=text=>String(text).replace(/[&<>"]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]));
const examples={
 tracks:"SIMULATED / TRAINING FILE",isolation:"VIRTUALBOX / SAFETY CHECK",evidence:"TRAINING JOURNAL / DEMO"
};
function mockTask(step){
 if(step===0)return `<div class="bb-tour-fake-steps"><div><span>01</span><strong>تعلّم</strong><small>مسار تدريبي واضح</small></div><div><span>02</span><strong>طبّق</strong><small>داخل بيئة آمنة</small></div><div><span>03</span><strong>وثّق</strong><small>واحتفظ باستنتاجك</small></div></div>`;
 if(step===4)return `<div class="bb-tour-links"><button type="button" data-bb-tour-go="logs">▦ <strong>ابدأ بتحليل السجلات</strong><small>تدريب من المتصفح</small></button><button type="button" data-bb-tour-go="tracks">◇ <strong>استكشف المسارات</strong><small>10 مسارات / 30 مرحلة</small></button><button type="button" data-bb-tour-go="lab">⌘ <strong>جهّز VirtualBox وKali</strong><small>دليل خطوة بخطوة</small></button><button type="button" data-bb-tour-go="settings">◈ <strong>خصّص واجهتك</strong><small>اللون، النص، التباين</small></button><button type="button" data-bb-tour-go="progress">↗ <strong>تابع تقدّمك</strong><small>سجل وتقارير التدريب</small></button></div>`;
 const label=step===1?"ما البداية الأكثر أمانًا لتجربة BLACKBOX؟":step===2?"كيف تتحقق من عزل مختبر VirtualBox؟":"ماذا تكتب بعد انتهاء المرحلة؟";
 const choices=BB_TOUR_DEMOS[BB_TOUR_STEPS[step].id];
 return `<div class="bb-tour-demo"><p class="bb-tour-demo-eyebrow">${examples[BB_TOUR_STEPS[step].id]} • مثال تدريبي فقط</p><h2>${label}</h2><div class="bb-tour-demo-choices" role="group" aria-label="${label}">${choices.map((x,i)=>`<button type="button" data-bb-tour-answer="${x.id}" aria-pressed="false"><span>${i+1}</span>${fmt(x.label)}</button>`).join("")}</div><p role="status" aria-live="polite" data-bb-tour-feedback>اختر قرارًا لتظهر لك أسبابه. لن تُسجّل نتيجة ولا يتغير تقدمك.</p></div>`;
}
export function renderBbWelcome(step=0) {
 const index=Number.isInteger(step)&&step>=0&&step<BB_TOUR_STEPS.length?step:0;
 const item=BB_TOUR_STEPS[index];
 return `<div class="bb-first-visit" data-bb-first-visit dir="rtl">
 <header class="bb-tour-header"><div class="bb-tour-logo"><span>B.</span><div><strong>BLACKBOX</strong><small>LAB / INTERACTIVE ORIENTATION</small></div></div>
 <button type="button" class="bb-tour-skip" data-bb-tour-skip>تخطي الجولة ↗</button></header>
 <div class="bb-tour-shell"><div class="bb-tour-overview"><span>دليلك إلى مساحة التدريب</span><b dir="ltr">${String(index+1).padStart(2,"0")} / 05</b></div>
 <nav class="bb-tour-progress" aria-label="خطوات الجولة">${BB_TOUR_STEPS.map((x,i)=>`<button type="button" data-bb-tour-step="${i}" class="${i===index?"selected":i<index?"visited":""}" aria-current="${i===index?"step":"false"}" aria-label="الخطوة ${i+1}: ${x.label}"><span></span><small>${x.label}</small></button>`).join("")}</nav>
 <div class="bb-tour-stage"><section class="bb-tour-copy"><span class="bb-tour-kicker">${item.tag}</span><h1 id="bb-tour-main-title" tabindex="-1">${item.title}</h1><p class="bb-tour-lead">${item.lead}</p>${mockTask(index)}</section>
 <aside class="bb-tour-simulator" aria-label="واجهة تدريبية توضيحية"><div class="bb-tour-screen"><div class="bb-tour-screen-top"><span>● ● ●</span><b>BLACKBOX / LAB SIMULATION</b><small>DEMO</small></div>
 <div class="bb-tour-screen-body"><span class="bb-tour-screen-kicker">● ISOLATED / SAMPLE ONLY</span><h2>${["تدريب عملي خطوة بخطوة","مهمتك تبدأ باختيار آمن","افحص إعدادات الشبكة","احتفظ بالدليل","جاهز لبدء التعلم"][index]}</h2>
 <div class="bb-tour-signal" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
 <div class="bb-tour-metrics"><div><small>المسارات</small><strong>10</strong></div><div><small>المراحل</small><strong>30</strong></div><div><small>الحالة</small><strong>DEMO</strong></div></div>
 <div class="bb-tour-log"><span>◇</span><div><strong>${["تعرف على المنصة","سجلات تجريبية","Host-only / Snapshot","سجل الملاحظات","خطوتك التالية"][index]}</strong><small>مثال بصري · لم يتم تشغيل أي أداة على جهازك</small></div></div></div>
 <div class="bb-tour-screen-bottom"><span>LEARN</span><span>PRACTICE</span><span>DOCUMENT</span></div></div>
 <p>الجولة معلوماتية وآمنة؛ لا تحفظ إجابات تجاربها في الحساب.</p></aside></div>
 <footer class="bb-tour-footer"><div class="bb-tour-buttons"><button type="button" class="bb-tour-previous" data-bb-tour-prev ${index===0?"disabled":""}>السابق</button><button type="button" class="bb-tour-next" ${index===4?'data-bb-tour-go="logs"':'data-bb-tour-next'}>${index===4?"ابدأ أول تدريب":"التالي"} ←</button></div><p>${index===4?'يمكنك أيضًا فتح أي قسم من الأزرار أعلاه.':'يمكنك التخطي الآن أو إعادة الجولة لاحقًا من «أدوات ومساعدة».'}</p></footer></div></div>`;
}
