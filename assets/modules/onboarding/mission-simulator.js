// A deliberately closed, in-memory training simulator. No shell, network, account or progress APIs.
export const BB_DEMO_TARGET = "192.168.56.10";
export const BB_DEMO_COMMAND = "nmap -sV "+BB_DEMO_TARGET;
const ALLOWED_ADAPTERS = ["bridged","nat","host-only"];
const PORTS = Object.freeze(["22/tcp","80/tcp"]);
export function createBbMission(){
 return {adapter:"nat",snapshot:false,terminal:[],scanned:false,evidence:[],finding:"",documented:false,feedback:""};
}
export function bbMissionReady(s){return s.adapter==="host-only"&&s.snapshot===true;}
export function bbMissionChecks(s){return {isolated:bbMissionReady(s),scanned:s.scanned===true,documented:s.documented===true};}
export function bbMissionScore(s){return Object.values(bbMissionChecks(s)).filter(Boolean).length;}
export function bbConfigureAdapter(s,adapter){
 if(!ALLOWED_ADAPTERS.includes(adapter))return {...s,feedback:"هذه الشبكة غير متاحة في المحاكاة."};
 return {...s,adapter,snapshot:s.snapshot,feedback:adapter==="bridged"?"تحذير: Bridged يصل المختبر بالشبكة المحيطة؛ غيّره إلى Host-only.":adapter==="nat"?"NAT قد يتيح اتصالًا خارجيًا. اختر Host-only لهذا السيناريو.":"تم اختيار Host-only. أنشئ Snapshot للتحقق من الجاهزية.",scanned:false,evidence:[],documented:false,terminal:[]};
}
export function bbToggleSnapshot(s,checked){return {...s,snapshot:Boolean(checked),scanned:false,evidence:[],documented:false,terminal:[],feedback:checked?"تم تسجيل تأكيد Snapshot في تجربة المتصفح فقط.":"تم إلغاء تأكيد Snapshot."};}
export function bbSimulateCommand(s,raw){
 const input=String(raw??"").trim().replace(/\s+/g," ");
 if(!input)return {...s,feedback:"اكتب أمرًا في الطرفية التجريبية."};
 const command=input.slice(0,120),lower=command.toLowerCase();
 if(lower==="clear")return {...s,terminal:[],feedback:"تم مسح شاشة المحاكاة فقط."};
 let output,scanned=s.scanned;
 if(lower==="help")output="AVAILABLE: help | ip a | nmap -sV 192.168.56.10 | report | clear\nAll output is synthetic. Other commands are not executed.";
 else if(lower==="ip a")output="2: lab0: <UP> mtu 1500\n    inet 192.168.56.20/24 scope global lab0\n    link/ether 02:00:00:00:00:20 [SIMULATED]";
 else if(lower===BB_DEMO_COMMAND.toLowerCase()){
   if(!bbMissionReady(s)){
     output="[BLOCKED] Lab safety check incomplete. Choose Host-only and confirm a Snapshot on step 03. No scan performed.";
   } else {
     output="Starting Nmap [SIMULATION ONLY]\nNmap scan report for 192.168.56.10\nHost is up (synthetic).\nPORT     STATE SERVICE VERSION\n22/tcp   open  ssh     OpenSSH (DEMO)\n80/tcp   open  http    Apache  (DEMO)\n\nNmap done: 1 IP address (1 host up) · FAKE DATA";
     scanned=true;
   }
 }else if(lower==="report"){
   output=scanned?"SAMPLE REPORT: 22/tcp ssh, 80/tcp http. Collect a port as evidence in step 05.":"No simulated scan results yet. Run the allowlisted example after safety checks.";
 }else{
   output="[NOT EXECUTED] This terminal accepts only the five training commands shown in help. Nothing was sent to a shell or network.";
 }
 const logs=[...s.terminal,{command,output}].slice(-7);
 return {...s,scanned,terminal:logs,feedback:scanned?"مخرجات اصطناعية ظهرت في الطرفية. انتقل إلى التوثيق وحدد دليلًا.":output.startsWith("[BLOCKED]")?"لن نعرض نتائج حتى تتحقق من إعدادات المحاكاة.":"هذه طرفية تدريب محدودة؛ لا تنفّذ أوامر على الجهاز."};
}
export function bbCaptureEvidence(s,port){
 if(!s.scanned)return {...s,feedback:"شغّل محاكاة Nmap أولًا قبل التقاط الدليل."};
 if(!PORTS.includes(port))return {...s,feedback:"الدليل غير معروف في هذا السيناريو."};
 if(s.evidence.includes(port))return {...s,feedback:"هذا الدليل موجود بالفعل."};
 return {...s,evidence:[...s.evidence,port],documented:false,feedback:"أضيف "+port+" إلى ملف الأدلة التجريبي."};
}
export function bbSubmitFinding(s,raw){
 const finding=String(raw??"").trim().slice(0,600);
 if(!s.scanned||!s.evidence.length)return {...s,feedback:"أضف دليلًا من نتيجة Nmap الاصطناعية أولًا."};
 if(finding.length<18)return {...s,finding,documented:false,feedback:"اكتب استنتاجًا من 18 حرفًا على الأقل يفسّر الدليل وما ستتحقق منه."};
 return {...s,finding,documented:true,feedback:"اكتمل تقرير المهمة التجريبي. لن يُحفظ في سجل المختبر أو حسابك."};
}
