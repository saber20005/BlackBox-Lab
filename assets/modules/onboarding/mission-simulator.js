// Browser-only Mission Zero. Every record and command output is synthetic.
// No network, shell, Firebase, account, grading, or persistence APIs.
export const BB_DEMO_TARGET = "192.168.56.10";
export const BB_DEMO_COMMAND = "nmap -sV " + BB_DEMO_TARGET;
export const BB_MISSION_SCENARIOS = Object.freeze([
 {id:"web",label:"خادم تدريب الويب",note:"SSH و HTTP متاحان للتحقق من التهيئة.",ports:Object.freeze(["22/tcp","80/tcp"])},
 {id:"hardened",label:"خادم HTTPS مقيّد",note:"SSH و HTTPS؛ خدمة HTTP ليست معروضة في هذه الحالة.",ports:Object.freeze(["22/tcp","443/tcp"])}
]);
const ADAPTERS = Object.freeze(["bridged","nat","host-only"]);
const PORT_DETAILS = Object.freeze({
 "22/tcp":{name:"SSH",version:"OpenSSH (DEMO)",next:"راجع إعدادات الوصول والمفاتيح"},
 "80/tcp":{name:"HTTP",version:"Apache (DEMO)",next:"تحقق من التعرض لطلبات HTTP"},
 "443/tcp":{name:"HTTPS",version:"TLS web service (DEMO)",next:"راجع إعداد TLS والشهادة"}
});
export const bbMissionScenario = s => BB_MISSION_SCENARIOS.find(x=>x.id===s.scenario) || BB_MISSION_SCENARIOS[0];
export const bbMissionPorts = s => bbMissionScenario(s).ports;
const clearedScan = s => ({...s,scanned:false,evidence:[],documented:false,terminal:[],finding:""});
export function createBbMission(){
 return {adapter:"nat",snapshot:false,scenario:"web",terminal:[],scanned:false,evidence:[],finding:"",documented:false,feedback:""};
}
export function bbMissionReady(s){return s.adapter==="host-only"&&s.snapshot===true;}
export function bbMissionChecks(s){return {isolated:bbMissionReady(s),scanned:s.scanned===true,documented:s.documented===true};}
export function bbMissionScore(s){return Object.values(bbMissionChecks(s)).filter(Boolean).length;}
export function bbMissionReview(s){
 const checks=bbMissionChecks(s),ports=bbMissionPorts(s);
 return {
  status:checks.documented?"اكتملت المحاكاة مع تقرير":checks.scanned?"نتيجة الفحص تحتاج تفسيرًا":checks.isolated?"المختبر جاهز لإنتاج دليل":"تحقق من إعدادات العزل أولًا",
  next:!checks.isolated?"عد إلى إعداد الشبكة واختر Host-only وأكّد Snapshot.":!checks.scanned?"نفّذ أمر الفحص المسموح على الهدف الاصطناعي.":!s.evidence.length?"التقط منفذًا واحدًا على الأقل من المخرجات.":!checks.documented?"اكتب تفسيرًا وخطوة تحقق قبل اعتماد التقرير التجريبي.":"انتقل إلى مختبر حقيقي وتحقق من العزل والصلاحيات يدويًا.",
  summary:ports.join(" · "),
  evidence:s.evidence.filter(p=>ports.includes(p))
 };
}
export function bbConfigureAdapter(s,adapter){
 if(!ADAPTERS.includes(adapter))return {...s,feedback:"هذه الشبكة غير متاحة في المحاكاة."};
 const a=clearedScan(s);
 return {...a,adapter,feedback:adapter==="bridged"?"تحذير: Bridged قد يربط الهدف بالشبكة المحيطة؛ اختر Host-only.":adapter==="nat"?"NAT قد يوفر اتصالًا خارج المختبر؛ اختر Host-only لهذا التمرين.":"اخترت Host-only في المحاكاة. راجع جميع المحولات فعليًا قبل أي اختبار حقيقي."};
}
export function bbToggleSnapshot(s,checked){
 return {...clearedScan(s),snapshot:Boolean(checked),feedback:checked?"تم تأكيد Snapshot في المحاكاة فقط.":"تم إلغاء تأكيد Snapshot."};
}
export function bbSelectScenario(s,id){
 if(!BB_MISSION_SCENARIOS.some(x=>x.id===id))return {...s,feedback:"هدف تجريبي غير معروف؛ لا شيء تغير."};
 return {...clearedScan(s),scenario:id,feedback:id==="web"?"هدف الويب التجريبي محدد: 22 و80. أعد الفحص للحصول على الدليل.":"تم تغيير الهدف إلى وضع HTTPS المقيّد: 22 و443. تم إبطال نتائج الفحص السابقة."};
}
export function bbSimulateCommand(s,raw){
 const input=String(raw??"").trim().replace(/\s+/g," ");
 if(!input)return {...s,feedback:"اكتب أمرًا في الطرفية التدريبية."};
 const command=input.slice(0,120),lower=command.toLowerCase();
 if(lower==="clear")return {...s,terminal:[],feedback:"تم مسح شاشة المحاكاة فقط؛ البيانات السابقة لم تتغير."};
 let output,scanned=s.scanned;
 if(lower==="help")output="AVAILABLE: help | ip a | nmap -sV 192.168.56.10 | report | clear\nAll output is synthetic. No command executes.";
 else if(lower==="ip a")output="2: lab0: <UP> mtu 1500\n    inet 192.168.56.20/24 scope global lab0\n    link/ether 02:00:00:00:00:20 [SIMULATED]";
 else if(lower===BB_DEMO_COMMAND.toLowerCase()){
   if(!bbMissionReady(s))output="[BLOCKED] Safety check incomplete. Select Host-only and confirm the Snapshot. No scan performed.";
   else{
     const scenario=bbMissionScenario(s);
     const lines=scenario.ports.map(port=>port.padEnd(8)+" open  "+PORT_DETAILS[port].name.toLowerCase().padEnd(7)+" "+PORT_DETAILS[port].version).join("\n");
     output="Starting Nmap [SIMULATION ONLY]\nScenario: "+scenario.label+"\nNmap scan report for "+BB_DEMO_TARGET+"\nHost is up (synthetic).\nPORT     STATE SERVICE VERSION\n"+lines+"\n\nNmap done: 1 IP address (1 host up) · FAKE DATA";
     scanned=true;
   }
 }else if(lower==="report"){
   output=scanned?"SAMPLE REPORT: "+bbMissionPorts(s).map(p=>p+" "+PORT_DETAILS[p].name).join(", ")+". Capture evidence in step 05.":"No scan data yet. Use the allowlisted command after the safety checks.";
 }else output="[NOT EXECUTED] Unknown command. This terminal only simulates five allowlisted commands. No shell or network access.";
 const terminal=[...s.terminal,{command,output}].slice(-7);
 return {...s,scanned,terminal,feedback:output.startsWith("[BLOCKED]")?"الفحص موقوف إلى أن تكمل شروط المحاكاة.":lower===BB_DEMO_COMMAND.toLowerCase()&&scanned?"تغير تقرير الهدف بحسب الحالة المختارة. حدد دليلًا وسجل استنتاجك.":"هذه طرفية اصطناعية بالكامل."};
}
export function bbCaptureEvidence(s,port){
 if(!s.scanned)return {...s,feedback:"شغّل محاكاة Nmap أولًا قبل التقاط الدليل."};
 if(!bbMissionPorts(s).includes(port))return {...s,feedback:"هذا المنفذ ليس ضمن نتائج الهدف الحالي."};
 if(s.evidence.includes(port))return {...s,feedback:"الدليل مضاف بالفعل."};
 return {...s,evidence:[...s.evidence,port],documented:false,feedback:"أضفت "+port+" إلى الأدلة. "+PORT_DETAILS[port].next+"."};
}
export function bbSubmitFinding(s,raw){
 const finding=String(raw??"").trim().slice(0,600);
 if(!s.scanned||!s.evidence.length)return {...s,feedback:"التقط دليلًا من تقرير الفحص التجريبي أولًا."};
 if(finding.length<18)return {...s,finding,documented:false,feedback:"اكتب استنتاجًا من 18 حرفًا على الأقل، يوضح الدليل والخطوة القادمة."};
 return {...s,finding,documented:true,feedback:"اكتمل التقرير التدريبي. هذه ليست درجة أو شهادة؛ البيانات لا تغادر المتصفح."};
}
