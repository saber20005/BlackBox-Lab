// Lightweight, self-contained 6-step preview tour matching the CyberTrace experience pattern.
// Mock decisions are not training progress, proof of lab isolation or verified certificates.
export const BB_TOUR_STEPS = Object.freeze([
 {id:"welcome",tag:"MISSION ZERO / 01",title:"ابدأ رحلتك داخل BLACKBOX",lead:"ليس مجرد شرح للموقع. أمامك ست خطوات قصيرة لتختار مهمة، تميّز بيئة التدريب الآمنة، وتتعلّم كيف توثّق نتائجك.",label:"البداية"},
 {id:"tracks",tag:"CHOOSE A PATH / 02",title:"أي طريق ستبدأ به؟",lead:"يمكنك تحليل ملفات تدريب من المتصفح فورًا، أو الانتقال لاحقًا إلى Kali وVirtualBox. اختر البداية التي لا تتطلب صلاحيات أو أدوات غير جاهزة.",label:"المسارات"},
 {id:"isolation",tag:"VERIFY THE LAB / 03",title:"هل مختبرك معزول فعلًا؟",lead:"Kali داخل VirtualBox لا يعني تلقائيًا أن الشبكة آمنة. افحص المحولات، حدّد الأهداف المصرح بها، وأنشئ Snapshot قبل تنفيذ أي تجربة.",label:"العزل"},
 {id:"nmap",tag:"FIRST TOOL / 04",title:"أول قرار باستخدام Nmap",lead:"هذا سيناريو افتراضي على Host-only. اختر أمرًا مناسبًا لهدف مختبري مصرح به، ثم شاهد مخرجات اصطناعية تشرح ما ستقرأه.",label:"Nmap"},
 {id:"evidence",tag:"FIELD NOTES / 05",title:"الإنجاز وحده لا يثبت المهارة",lead:"العمل الجيد يحتاج دليلًا وتفسيرًا وخطوة تالية. تعلّم ماذا توثّق في سجل المختبر؛ الإكمال اليدوي ليس تقييمًا موثّقًا.",label:"التوثيق"},
 {id:"start",tag:"YOUR MISSION / 06",title:"جاهز لتجربتك الأولى؟",lead:"ابدأ بتحليل سجلات دون إعداد إضافي، أو افتح دليل البيئة المحلية. هذه الجولة لا تحفظ درجات؛ التدريب الفعلي يبدأ بعد اختيارك.",label:"انطلق"}
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
 nmap:[
 {id:"safe",label:"nmap -sV 192.168.56.10 بعد التأكد من ملكية الهدف والعزل",correct:true,reply:"اختيار مناسب لمختبر مصرح به. شاهد المخرجات الاصطناعية في شاشة المختبر. هذا لم يشغّل Nmap."},
 {id:"public",label:"nmap -sV 8.8.8.8 دون تصريح",correct:false,reply:"هذا هدف عام وليس آلة تدريب تملك تصريحًا لفحصها. لا تفترض أن توفر عنوان على الإنترنت يعني السماح بفحصه."},
 {id:"wide",label:"nmap -A 0.0.0.0/0 لفحص كل الإنترنت",correct:false,reply:"نطاق فحص غير منضبط وغير مقبول للتدريب. اختر عنوانًا واحدًا مصرحًا به داخل الشبكة المعزولة."}
 ],
 evidence:[
 {id:"evidence",label:"أسجّل المخرجات والتفسير والخطوة التالية",correct:true,reply:"هذا توثيق مفيد: سجّل الدليل، ما يعنيه، وما الذي تحتاج التحقق منه لاحقًا. يُحفظ فقط عندما تكتبه داخل المرحلة الحقيقية."},
 {id:"finish",label:"أعلّم المرحلة مكتملة دون دليل",correct:false,reply:"إشارة الإكمال اليدوية وحدها لا تثبت المهارة ولا تمنح تقييمًا خادميًا أو شهادة موثقة."},
 {id:"publish",label:"أنشر سجلات الحساب الحقيقية علنًا",correct:false,reply:"أزل المعلومات الحساسة أولًا. تصدير التقارير والمشاركة قرار يجب اتخاذه بحذر."}
 ]
});
const BB_TOUR_TERMINAL = Object.freeze(["BLACKBOX / FIRST MISSION\n> training_mode: READY\n> environment: BROWSER\n> active_scan: NONE\n\n[01] اقرأ المهمة\n[02] اختر بيئة التدريب\n[03] وثّق ما تعلّمته","BLACKBOX / PATH SELECTOR\n\n[01] LOG ANALYSIS         AVAILABLE\n[02] NETWORK LAB          SETUP\n[03] WEB SECURITY         SETUP\n\n> 10 learning tracks\n> 30 guided stages","VIRTUALBOX / SAFETY CHECK\n\nWINDOWS HOST\n  |\n  +-- HOST-ONLY NETWORK (verify)\n          |\n          +-- KALI VM\n          +-- TARGET VM\n\n[!] Check EVERY adapter\n[!] Snapshot before training","NMAP / SYNTHETIC TRAINING\n\n$ nmap -sV 192.168.56.10\n\n[!] Example command only\n[!] No scan has been executed\n[>] Choose the safe option\n    to reveal sample results","FIELD NOTES / TRAINING\n\nCASE: LAB-001  [DEMO]\n\nEVIDENCE  : source log\nOBSERVATION: unusual activity\nNEXT STEP: verify context\n\n> Notes must be written\n  in the real exercise","BLACKBOX / SELECT MISSION\n\n[01] Browser evidence labs\n[02] Network & Kali lab\n[03] Learning pathways\n[04] Your training record\n\n> Start when ready\n> Every stage needs evidence"]);
const fmt=text=>String(text).replace(/[&<>"]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]));
const examples={
 tracks:"SIMULATED / TRAINING FILE",isolation:"VIRTUALBOX / SAFETY CHECK",nmap:"NMAP / NO NETWORK CALLS",evidence:"TRAINING JOURNAL / DEMO"
};
function mockTask(step){
 if(step===0)return `<div class="bb-tour-entry"><span class="bb-tour-entry-label">اختر نقطة الانطلاق</span><div class="bb-tour-entry-grid"><button type="button" data-bb-tour-step="1"><span aria-hidden="true">01 / ◈</span><strong>أريد البدء من المتصفح</strong><small>ملفات جاهزة · لا حاجة لتثبيت أدوات</small><b aria-hidden="true">←</b></button><button type="button" data-bb-tour-step="2"><span aria-hidden="true">02 / ⌘</span><strong>لديّ Kali وVirtualBox</strong><small>ابدأ بالتحقق من عزل البيئة</small><b aria-hidden="true">←</b></button></div></div>`;
 if(step===5)return `<div class="bb-tour-links"><button type="button" data-bb-tour-go="logs">▦ <strong>ابدأ بتحليل السجلات</strong><small>تدريب من المتصفح</small></button><button type="button" data-bb-tour-go="tracks">◇ <strong>استكشف المسارات</strong><small>10 مسارات / 30 مرحلة</small></button><button type="button" data-bb-tour-go="lab">⌘ <strong>جهّز VirtualBox وKali</strong><small>دليل خطوة بخطوة</small></button><button type="button" data-bb-tour-go="settings">◈ <strong>خصّص واجهتك</strong><small>اللون، النص، التباين</small></button><button type="button" data-bb-tour-go="progress">↗ <strong>تابع تقدّمك</strong><small>سجل وتقارير التدريب</small></button></div>`;
 const label=step===1?"ما البداية الأكثر أمانًا لتجربة BLACKBOX؟":step===2?"كيف تتحقق من عزل مختبر VirtualBox؟":step===3?"لديك هدف تدريبي مصرح به على شبكة Host-only (192.168.56.10). أي أمر تختار؟":"ماذا تكتب بعد انتهاء المرحلة؟";
 const nmapSample=step===3?`<div class="bb-tour-command-example"><span>TRAINING TARGET / 192.168.56.10</span><code dir="ltr">$ nmap -sV 192.168.56.10</code><small>مثال فقط • لا تتصل الصفحة بأي جهاز</small></div>`:"";
 const choices=BB_TOUR_DEMOS[BB_TOUR_STEPS[step].id];
 return `<div class="bb-tour-demo"><p class="bb-tour-demo-eyebrow">${examples[BB_TOUR_STEPS[step].id]} • مثال تدريبي فقط</p><h2>${label}</h2>${nmapSample}<div class="bb-tour-demo-choices" role="group" aria-label="${label}">${choices.map((x,i)=>`<button type="button" data-bb-tour-answer="${x.id}" aria-pressed="false"><span>${i+1}</span>${fmt(x.label)}</button>`).join("")}</div><p role="status" aria-live="polite" data-bb-tour-feedback>اختر قرارًا لتظهر لك أسبابه. لن تُسجّل نتيجة ولا يتغير تقدمك.</p></div>`;
}
export function renderBbWelcome(step=0) {
 const index=Number.isInteger(step)&&step>=0&&step<BB_TOUR_STEPS.length?step:0;
 const item=BB_TOUR_STEPS[index];
 return `<div class="bb-first-visit" data-bb-first-visit dir="rtl">
 <header class="bb-tour-header"><div class="bb-tour-logo"><img src="./favicon.svg" alt="" width="44" height="44"><div><strong>BLACKBOX <em>LAB</em></strong><small>INTERACTIVE / MISSION CONTROL</small></div></div>
 <span class="bb-tour-preview-flag">● DESIGN PREVIEW / V2</span><button type="button" class="bb-tour-skip" data-bb-tour-skip>تخطي الجولة ↗</button></header>
 <div class="bb-tour-shell"><div class="bb-tour-overview"><span><b class="bb-tour-overview-tag">MISSION 00</b>  اكتشف المختبر بطريقتك</span><b dir="ltr">${String(index+1).padStart(2,"0")} / 06</b></div>
 <nav class="bb-tour-progress" aria-label="خطوات الجولة">${BB_TOUR_STEPS.map((x,i)=>`<button type="button" data-bb-tour-step="${i}" class="${i===index?"selected":i<index?"visited":""}" aria-current="${i===index?"step":"false"}" aria-label="الخطوة ${i+1}: ${x.label}"><span class="bb-tour-progress-bar"></span><small><b>${String(i+1).padStart(2,"0")}</b> ${x.label}</small></button>`).join("")}</nav>
 <div class="bb-tour-stage"><section class="bb-tour-copy"><span class="bb-tour-kicker">${item.tag}</span><h1 id="bb-tour-main-title" tabindex="-1">${item.title}</h1><p class="bb-tour-lead">${item.lead}</p>${mockTask(index)}</section>
 <aside class="bb-tour-simulator" aria-label="نافذة تدريبية تجريبية">
 <div class="bb-tour-screen">
 <div class="bb-tour-screen-top"><span class="bb-tour-terminal-dots">● ● ●</span><b>BLACKBOX / SIMULATION</b><small>● DEMO</small></div>
 <div class="bb-tour-screen-body">
 <div class="bb-tour-console-header"><span>◈  LAB CONSOLE</span><span class="bb-tour-console-index">SCENE 0${index+1}</span></div>
 <pre class="bb-tour-console" dir="ltr"><code>${fmt(BB_TOUR_TERMINAL[index])}</code></pre>
 ${index===3?`<div class="bb-tour-nmap-output" data-bb-tour-nmap-output hidden>
   <span>SIMULATED OUTPUT / NO SCAN EXECUTED</span><pre dir="ltr"><code>PORT     STATE SERVICE VERSION
22/tcp   open  ssh     demo
80/tcp   open  http    demo</code></pre>
   <small>قيم اصطناعية لتوضيح صيغة التقرير، وليست نتيجة فحص فعلي.</small>
  </div>`:""}
 <div class="bb-tour-console-foot"><span>● BROWSER-ONLY</span><span>NO NETWORK SCAN</span></div>
 </div></div>
 <p>لم يتم تشغيل أي أداة على جهازك · هذه أمثلة اصطناعية للتعلم فقط</p></aside></div>
 <footer class="bb-tour-footer"><div class="bb-tour-buttons"><button type="button" class="bb-tour-previous" data-bb-tour-prev ${index===0?"disabled":""}>السابق</button><button type="button" class="bb-tour-next" ${index===5?'data-bb-tour-go="logs"':'data-bb-tour-next'}>${index===5?"ابدأ أول تدريب":"التالي"} ←</button></div><p>${index===5?'يمكنك أيضًا فتح أي قسم من الأزرار أعلاه.':'يمكنك التخطي الآن أو إعادة الجولة لاحقًا من «أدوات ومساعدة».'}</p><a class="bb-tour-production-link" href="https://blackboxlab.dev/?view=welcome" target="_blank" rel="noopener noreferrer">شاهد النسخة القديمة ↗</a></footer></div></div>`;
}
