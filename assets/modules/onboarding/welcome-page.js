import {BB_DEMO_COMMAND,BB_DEMO_TARGET,BB_MISSION_SCENARIOS,bbMissionScenario,bbMissionPorts,bbMissionChecks,bbMissionReady,bbMissionScore,bbMissionReview,createBbMission} from "./mission-simulator.js";

// Six short stages; user performs actions instead of selecting a multiple-choice answer.
// All terminal and evidence data is generated locally, and discarded on leaving onboarding.
export const BB_TOUR_STEPS=Object.freeze([
 {id:"welcome",tag:"MISSION ZERO / 01",title:"مهمتك الأولى تبدأ هنا",lead:"ستضبط بيئة اختبار افتراضية، تشغّل أوامر محاكاة، ثم تسجل دليلًا. لا حاجة لأي برنامج على جهازك، ولا يُحفظ شيء في حسابك.",label:"ابدأ"},
 {id:"tracks",tag:"MISSION SELECT / 02",title:"اختر طريقك داخل المختبر",lead:"BLACKBOX يضم عشرة مسارات وثلاثين مرحلة. ابدأ الآن بمحاكاة آمنة، أو تعرّف إلى مسارات تحليل الملفات التي تعمل مباشرة في المتصفح.",label:"المسارات"},
 {id:"isolation",tag:"LAB SETUP / 03",title:"اضبط شبكة المختبر",lead:"بدل الإجابة عن سؤال نظري، غيّر محول الشبكة بنفسك إلى Host-only وأكّد إنشاء Snapshot. هذه محاكاة إعدادات وليست اتصالًا بـVirtualBox.",label:"الشبكة"},
 {id:"nmap",tag:"TERMINAL / 04",title:"اكتب الأمر وشاهد ما يحدث",lead:"أنت داخل طرفية تدريبية محدودة. جرّب help ثم ip a ثم أمر Nmap المخصص للهدف الافتراضي. الأوامر الأخرى لن تُنفّذ.",label:"الطرفية"},
 {id:"evidence",tag:"CASE FILE / 05",title:"التقط دليلًا واكتب تقريرك",lead:"نتيجة الفحص وحدها ليست تحليلًا. اختر المنفذ الذي تريد توثيقه، ثم اكتب ما يعنيه وما الذي ستتحقق منه.",label:"الأدلة"},
 {id:"start",tag:"DEBRIEF / 06",title:"ماذا أنجزت في هذه المهمة؟",lead:"هذه نتائج المحاكاة المؤقتة، وليست نقاط XP أو شهادة. اختر الآن قسمًا حقيقيًا لتبدأ التدريب.",label:"انطلق"}
]);
const fmt=t=>String(t).replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const mark=(done,label)=>`<div class="bb-mission-check ${done?"is-done":""}"><span aria-hidden="true">${done?"✓":"○"}</span><span>${label}</span></div>`;
function mockTask(index,s){
 if(index===0)return `<div class="bb-mission-welcome"><span class="bb-mission-eyebrow">OPERATION: BLUE ENTRY</span>
 <div class="bb-mission-start-grid"><button type="button" data-bb-tour-step="2"><strong>◈ ابدأ ضبط المختبر</strong><small>بدّل المحول الافتراضي وجهّز البيئة</small><span>BEGIN MISSION ←</span></button>
 <button type="button" data-bb-tour-step="1"><strong>▦ اكتشف المسارات أولًا</strong><small>تعرف إلى ما يمكنك التدرّب عليه</small><span>EXPLORE ←</span></button></div></div>`;
 if(index===1)return `<div class="bb-mission-route-grid">
 <article><span>01 / BROWSER LAB</span><h2>تحليل السجلات</h2><p>تدرب على أدلة مصطنعة مباشرة داخل BLACKBOX دون تثبيت أدوات.</p><button type="button" data-bb-tour-step="2">جرب المختبر المصغر ←</button></article>
 <article><span>02 / LOCAL LAB</span><h2>الشبكات وKali</h2><p>استخدم VirtualBox مع أهداف مصرح بها، بعد التحقق من عزل الشبكة.</p><button type="button" data-bb-tour-step="2">اضبط شبكة افتراضية ←</button></article></div>`;
 if(index===2)return `<section class="bb-mission-panel" aria-label="مُعدّ شبكة افتراضية">
 <span class="bb-mission-eyebrow">VIRTUALBOX • NETWORK SIMULATOR</span>
 <h2>اختر محوّل الشبكة</h2>
 <div class="bb-mission-adapters" role="group" aria-label="وضع محول الشبكة الافتراضي">
 ${[["bridged","Bridged","مرتبط بالشبكة"],["nat","NAT","اتصال خارجي محتمل"],["host-only","Host-only","شبكة مختبر محلية"]].map(([id,title,sub])=>`<button type="button" data-bb-mission-adapter="${id}" aria-pressed="${s.adapter===id}"><strong>${title}</strong><small>${sub}</small></button>`).join("")}
 </div>
 <label class="bb-mission-snapshot"><input type="checkbox" data-bb-mission-snapshot ${s.snapshot?"checked":""}><span>أؤكد إنشاء Snapshot للآلة الافتراضية (في المحاكاة فقط)</span></label>
 <p class="bb-mission-feedback" role="status" aria-live="polite">${fmt(s.feedback||"حاليًا NAT. لا تفترض أن Kali معزول لمجرد أنه يعمل.")}</p>
 ${mark(bbMissionReady(s),"إعداد المحاكاة آمن للتجربة")} </section>`;
 if(index===3)return `<section class="bb-mission-panel bb-mission-terminal-form">
 <span class="bb-mission-eyebrow">BLACKBOX / RESTRICTED TERMINAL</span>
 <h2>نفّذ محاكاة أمر بنفسك</h2>
 <p class="bb-mission-hint">غيّر حالة الهدف لتغيّر المنافذ التي يعرضها التقرير. جميع النتائج مُولّدة داخل المتصفح فقط.</p>
 <div class="bb-mission-scenarios" role="group" aria-label="سيناريو الهدف التجريبي">
 ${BB_MISSION_SCENARIOS.map(item=>`<button type="button" data-bb-mission-scenario="${item.id}" aria-pressed="${bbMissionScenario(s).id===item.id}"><strong>${fmt(item.label)}</strong><small>${fmt(item.note)}</small></button>`).join("")}
 </div>
 <p class="bb-mission-context" aria-live="polite">الهدف الحالي: <strong>${fmt(bbMissionScenario(s).label)}</strong> · التغيير يبطل الفحص القديم ويستلزم تحليلًا جديدًا.</p>
 <form data-bb-mission-terminal><label for="bb-mission-command">أمر التدريب</label><div class="bb-mission-command-row"><span aria-hidden="true">$</span><input id="bb-mission-command" name="command" dir="ltr" inputmode="text" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="120" placeholder="help" required><button type="submit">تشغيل محاكاة ↵</button></div></form>
 <div class="bb-mission-chips" role="group" aria-label="أمثلة أوامر آمنة">${["help","ip a",BB_DEMO_COMMAND,"report","clear"].map(cmd=>`<button type="button" data-bb-mission-fill="${fmt(cmd)}" dir="ltr">${fmt(cmd)}</button>`).join("")}</div>
 <p class="bb-mission-feedback" role="status" aria-live="polite">${fmt(s.feedback||"ابدأ بـ help. عند جاهزية المحاكاة سيظهر تقرير فحص اصطناعي.")}</p>
 <p class="bb-mission-flag">${s.scanned?"✓ نتيجة اصطناعية جاهزة للتوثيق":bbMissionReady(s)?"✓ الشبكة جاهزة • أدخل أمر Nmap":"! تحقق أولًا من Host-only وSnapshot في الخطوة 03"}</p></section>`;
 if(index===4)return `<section class="bb-mission-panel">
 <span class="bb-mission-eyebrow">CASE FILE / LAB-001</span>
 <h2>ملف الأدلة الافتراضي</h2>
 ${s.scanned?`<div class="bb-mission-evidence-list">${bbMissionPorts(s).map(port=>`<div><div><strong dir="ltr">${port} · ${port==="22/tcp"?"SSH":port==="80/tcp"?"HTTP":"HTTPS"} service</strong><small>${port==="22/tcp"?"مراجعة الوصول":port==="80/tcp"?"تحليل خدمة الويب":"التحقق من TLS"}</small></div><button type="button" data-bb-mission-capture="${port}" ${s.evidence.includes(port)?"disabled":""}>${s.evidence.includes(port)?"✓ ضمن الأدلة":"أضف كدليل +"}</button></div>`).join("")}</div>
 <form data-bb-mission-report><label for="bb-mission-finding">اكتب استنتاجك والخطوة التالية</label>
 <textarea id="bb-mission-finding" name="finding" rows="3" maxlength="600" placeholder="مثال: ظهور SSH وHTTP على الهدف المختبري يستدعي التحقق من تهيئتهما...">${fmt(s.finding)}</textarea>
 <button type="submit">وثّق النتيجة التجريبية ←</button></form>`:
 `<div class="bb-mission-no-evidence"><strong>لا يوجد دليل بعد</strong><p>شغّل محاكاة Nmap في الخطوة الرابعة لتظهر المنافذ الافتراضية.</p><button type="button" data-bb-tour-step="3">افتح الطرفية ←</button></div>`}
 <p class="bb-mission-feedback" role="status" aria-live="polite">${fmt(s.feedback||"اختر دليلًا من التقرير ثم اكتب تفسيرًا. لا تُحفظ هذه البيانات خارج الجولة.")}</p>
 ${mark(s.documented,"تقرير تجريبي مُكتمل")} </section>`;
 return `<div class="bb-mission-debrief"><div class="bb-mission-debrief-score"><strong>${bbMissionScore(s)} / 3</strong><span>مهام تجريبية مُنجزة</span></div>
 <div class="bb-mission-debrief-checks">${mark(bbMissionChecks(s).isolated,"تأكيد العزل وSnapshot")}${mark(s.scanned,"تشغيل أمر Nmap في المحاكاة")}${mark(s.documented,"توثيق أدلة المخرجات")}</div>
 <section class="bb-mission-review" aria-label="مراجعة مهمة التدريب"><strong>${fmt(bbMissionReview(s).status)}</strong>
 <p>${fmt(bbMissionReview(s).next)}</p>
 <dl><div><dt>سيناريو الهدف</dt><dd>${fmt(bbMissionScenario(s).label)}</dd></div><div><dt>نتيجة الفحص الافتراضية</dt><dd dir="ltr">${fmt(s.scanned?bbMissionReview(s).summary:"NOT RUN")}</dd></div><div><dt>الأدلة المسجّلة</dt><dd>${bbMissionReview(s).evidence.length}</dd></div></dl>
 ${s.documented?`<blockquote>${fmt(s.finding)}</blockquote>`:""}
 <small>ملخص المحاكاة فقط — لا يُصدر شهادة، ولا يُحفظ في حسابك.</small></section></div>
 <div class="bb-tour-links">
 <button type="button" data-bb-tour-go="logs"><strong>▦ ابدأ بتحليل سجلات حقيقية التدريب</strong><small>الملفات التدريبية داخل المتصفح</small></button>
 <button type="button" data-bb-tour-go="tracks"><strong>◇ تصفح المسارات</strong><small>10 مسارات / 30 مرحلة</small></button>
 <button type="button" data-bb-tour-go="lab"><strong>⌘ دليل إعداد Kali وVirtualBox</strong><small>تحقق يدوي من شبكتك الحقيقية</small></button>
 <button type="button" data-bb-tour-go="settings"><strong>◈ خصص الواجهة</strong><small>الألوان والحجم والتباين</small></button>
 <button type="button" data-bb-tour-go="progress"><strong>↗ تقدّمك الفعلي</strong><small>السجل والنتائج المحفوظة</small></button></div>`;
}
function liveConsole(index,s){
 if(index===2)return `<div class="bb-mission-topology">
 <div class="bb-mission-node"><span>HOST</span><strong>WINDOWS</strong><small>بيئة المضيف</small></div>
 <div class="bb-mission-connect">${s.adapter==="bridged"?"↓ CONNECTED TO LAN":s.adapter==="nat"?"↓ NETWORK TRANSLATION":"↓ PRIVATE LAB NETWORK"}</div>
 <div class="bb-mission-node ${s.adapter==="host-only"?"is-safe":"is-risk"}"><span>ADAPTER</span><strong>${s.adapter.toUpperCase()}</strong><small>محاكاة إعدادات</small></div>
 <div class="bb-mission-connect">↓ VIRTUAL MACHINE NETWORK</div>
 <div class="bb-mission-node-grid"><div class="bb-mission-node"><span>VM-01</span><strong>KALI</strong><small>192.168.56.20</small></div><div class="bb-mission-node"><span>VM-02</span><strong>TRAINING TARGET</strong><small>${BB_DEMO_TARGET}</small></div></div>
 <p class="bb-mission-readiness">${bbMissionReady(s)?"✓ جاهز للتجربة الاصطناعية":"! يلزم Host-only وتأكيد Snapshot"}</p></div>`;
 if(index===3){
 const intro="blackbox@demo:~$ # Restricted simulated shell\n# Type help to see the allowlisted commands.\n";
 const logs=s.terminal.map(x=>`\n$ ${x.command}\n${x.output}`).join("\n");
 return `<pre class="bb-tour-console bb-mission-command-log" dir="ltr" data-bb-mission-console aria-label="مخرجات الطرفية التدريبية" aria-live="polite"><code>${fmt(intro+logs)}</code></pre>`;
 }
 if(index===4)return `<div class="bb-mission-case-preview">
 <span>INVESTIGATION / TRAINING ONLY</span>
 <pre dir="ltr"><code>${fmt("SCENARIO: "+bbMissionScenario(s).label+"\nPORT    SERVICE   STATE\n"+(s.scanned?bbMissionPorts(s).map(port=>port+"  "+(port==="22/tcp"?"ssh":port==="80/tcp"?"http":"https")+"  open").join("\n"):"NO SCAN DATA")+"\n\nSTATUS: "+(s.scanned?"SIMULATED REPORT READY":"AWAITING SCAN"))}</code></pre>
 <p>الأدلة الملتقطة: <strong>${s.evidence.length}</strong> · تقرير: <strong>${s.documented?"مكتمل":"غير مكتمل"}</strong></p></div>`;
 const scenes=[
 "MISSION_00 / BLUE ENTRY\n\n[+] Learn by doing\n[+] Test a simulated lab\n[+] Record what the evidence means\n\nNEXT: Configure the network",
 "TRAINING PATHS\n\n01 · Browser evidence analysis\n02 · Network & Nmap labs\n03 · Kali & VirtualBox setup\n\nCHOOSE: Start inside the browser",
 "", "", "",
 "MISSION STATUS / DEMO\n\nLAB SETUP: "+(bbMissionReady(s)?"READY":"INCOMPLETE")+"\nSYNTHETIC SCAN: "+(s.scanned?"COMPLETE":"NOT RUN")+"\nANALYST REPORT: "+(s.documented?"COMPLETE":"NOT FILED")+"\n\nNO XP OR CLOUD WRITES"
 ];
 return `<pre class="bb-tour-console" dir="ltr"><code>${fmt(scenes[index])}</code></pre>`;
}
export function renderBbWelcome(step=0,mission){
 const index=Number.isInteger(step)&&step>=0&&step<BB_TOUR_STEPS.length?step:0,s=mission??createBbMission(),item=BB_TOUR_STEPS[index];
 return `<div class="bb-first-visit bb-mission-tour" data-bb-first-visit dir="rtl">
 <header class="bb-tour-header"><div class="bb-tour-logo"><img src="./favicon.svg" alt="" width="44" height="44"><div><strong>BLACKBOX <em>LAB</em></strong><small>INTERACTIVE / MISSION CONTROL</small></div></div>
 <span class="bb-tour-preview-flag">● LIVE SIMULATION / V3</span><button type="button" class="bb-tour-skip" data-bb-tour-skip>تخطي الجولة ↗</button></header>
 <div class="bb-tour-shell"><div class="bb-tour-overview"><span><b class="bb-tour-overview-tag">MISSION 00</b>  مختبر تفاعلي آمن</span><b dir="ltr">${String(index+1).padStart(2,"0")} / 06</b></div>
 <nav class="bb-tour-progress" aria-label="خطوات الجولة">${BB_TOUR_STEPS.map((x,i)=>`<button type="button" data-bb-tour-step="${i}" class="${i===index?"selected":i<index?"visited":""}" aria-current="${i===index?"step":"false"}" aria-label="الخطوة ${i+1}: ${x.label}"><span class="bb-tour-progress-bar"></span><small><b>${String(i+1).padStart(2,"0")}</b> ${x.label}</small></button>`).join("")}</nav>
 <div class="bb-tour-stage"><section class="bb-tour-copy"><span class="bb-tour-kicker">${item.tag}</span><h1 id="bb-tour-main-title" tabindex="-1">${item.title}</h1><p class="bb-tour-lead">${item.lead}</p>${mockTask(index,s)}</section>
 <aside class="bb-tour-simulator" aria-label="مختبر افتراضي غير متصل بالشبكة">
 <div class="bb-tour-screen"><div class="bb-tour-screen-top"><span class="bb-tour-terminal-dots">● ● ●</span><b>BLACKBOX / SIMULATION</b><small>● DEMO</small></div>
 <div class="bb-tour-screen-body"><div class="bb-tour-console-header"><span>◈ LAB CONSOLE</span><span class="bb-tour-console-index">SCENE 0${index+1}</span></div>
 ${liveConsole(index,s)}
 <div class="bb-tour-console-foot"><span>● BROWSER-ONLY</span><span>NO NETWORK SCAN</span></div>
 </div></div>
 <p>لم يتم تشغيل أي أداة على جهازك · هذه أمثلة اصطناعية للتعلم فقط</p></aside></div>
 <footer class="bb-tour-footer"><div class="bb-tour-buttons"><button type="button" class="bb-tour-previous" data-bb-tour-prev ${index===0?"disabled":""}>السابق</button><button type="button" class="bb-tour-next" ${index===5?'data-bb-tour-go="logs"':'data-bb-tour-next'}>${index===5?"ابدأ أول تدريب":"التالي"} ←</button></div><p>${index===5?"نتائج المحاكاة مؤقتة. لا يتم احتساب XP أو إنجاز مراحل.":"يمكنك التنقل بحرية، أو تخطي الجولة، أو إعادة فتحها من «أدوات ومساعدة»."}</p>
 </footer>
 </div></div>`;
}
