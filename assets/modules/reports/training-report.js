// Self-contained, printable training export. No Firebase, network or writes.
const stylesheet="\n:root{color-scheme:light;--ink:#142642;--muted:#5f6f88;--line:#dbe5f2;--brand:#2467d3;--panel:#ffffff;--bg:#f1f5fc}\n*{box-sizing:border-box}\nhtml{scroll-behavior:smooth}\nbody{margin:0;color:var(--ink);background:var(--bg);font:15px/1.85 system-ui,\"Noto Sans Arabic\",\"Segoe UI\",Tahoma,sans-serif;overflow-wrap:anywhere}\nbutton{font:inherit;cursor:pointer}\nbutton:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #2273de;outline-offset:3px}\na{color:#235db8}\n.wrap{max-width:1100px;margin:auto;padding:clamp(14px,3vw,28px)}\n.cover{border-radius:24px;background:linear-gradient(130deg,#071c3b,#102f5e 55%,#2155a0);color:white;padding:clamp(22px,4vw,44px);position:relative;overflow:hidden}\n.cover:after{content:\"\";position:absolute;inset-inline-end:-90px;top:-90px;width:270px;height:270px;border:1px solid #8dbcff3d;border-radius:50%;pointer-events:none}\n.brand{font:800 17px/1.3 system-ui,Arial,sans-serif;letter-spacing:.07em;direction:ltr;text-align:right;color:#d8e8ff}\n.overline{font:700 11px/1.5 system-ui,Arial,sans-serif;letter-spacing:.12em;color:#89c5ff}\n.cover h1{font-size:clamp(28px,5vw,42px);line-height:1.5;margin:16px 0 5px}\n.cover p{color:#d4e4ff;max-width:680px;margin:0 0 17px}\n.cover-meta{display:flex;gap:10px;flex-wrap:wrap}\n.chip{border:1px solid #b2d2ff62;border-radius:100px;padding:5px 12px;color:#d7e9ff;background:#ffffff13;font-size:12px}\n.actions{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin:16px 0}\n.actions button{border:0;border-radius:10px;background:#235cbc;color:#fff;padding:10px 15px;font-weight:700;min-height:44px}\n.actions .hint{color:#64748b;font-size:12px;line-height:1.7;margin:0}\n.section-title{font-size:clamp(20px,3vw,26px);margin:34px 0 14px}\n.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:21px}\n.stat{border:1px solid var(--line);border-radius:17px;background:white;padding:18px;box-shadow:0 8px 27px #13274c0a;min-width:0}\n.stat .number{display:block;font:800 clamp(22px,4vw,33px)/1.4 system-ui,Arial,sans-serif;color:#174c9e;direction:ltr;text-align:right;unicode-bidi:isolate}\n.stat .label{display:block;font-size:12px;color:var(--muted)}\n.meter{height:7px;background:#deebfa;border-radius:10px;margin-top:11px;overflow:hidden}\n.meter span{display:block;background:linear-gradient(90deg,#3c84e8,#1461b8);height:100%;border-radius:inherit}\n.panel{background:white;border:1px solid var(--line);border-radius:18px;padding:clamp(16px,2.7vw,25px);margin:14px 0}\n.devices{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}\n.device{border:1px solid #e1e9f4;border-radius:12px;padding:12px;background:#f8faff;min-width:0}\n.device .name{display:block;font-size:12px;color:var(--muted)}\n.device .value{display:block;font-weight:700;font-size:14px}\n.disclaimer{color:#536a87;font-size:12px;line-height:1.9;margin:13px 0 0}\n.contents{display:flex;flex-wrap:wrap;gap:8px}\n.contents a{padding:6px 11px;font-size:12px;background:#e8f1ff;border-radius:9px;text-decoration:none}\n.track{margin-top:27px;break-before:auto}\n.track-head{display:flex;align-items:start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}\n.track-head h2{margin:0;font-size:23px}\n.track-head p{margin:2px 0;color:var(--muted);font-size:13px}\n.track-progress{background:#e8f1ff;color:#2358a1;padding:5px 11px;border-radius:99px;font:700 12px/1.8 system-ui,sans-serif}\n.stage{border:1px solid #dce5f1;background:white;border-radius:14px;margin:10px 0;overflow:hidden;break-inside:avoid-page}\n.stage summary{padding:15px 18px;display:flex;align-items:center;gap:13px;cursor:pointer;list-style:none}\n.stage summary::-webkit-details-marker{display:none}\n.stage summary:before{content:\"＋\";color:#3f74b6;font-size:20px;flex:none}\n.stage[open] summary:before{content:\"−\"}\n.stage-title{flex:1;min-width:0}\n.stage-title strong{display:block;font-size:15px;line-height:1.55}\n.stage-title small{display:block;color:var(--muted);font-size:11px;margin-top:3px}\n.state{font-size:11px;font-weight:700;border:1px solid #bfd2ec;border-radius:99px;padding:4px 10px;background:#edf3fe;white-space:nowrap}\n.state.done{border-color:#9aceb0;background:#e5f7eb;color:#18653e}\n.stage-body{padding:17px 18px 20px;border-top:1px solid var(--line)}\n.stage-body h4{font-size:13px;margin:19px 0 8px}\n.stage-body p{font-size:13px;line-height:1.95;margin:0}\n.dates{display:flex;gap:10px 20px;flex-wrap:wrap;color:var(--muted);font-size:12px;margin:0 0 14px}\n.dates time{display:inline-block;unicode-bidi:isolate;direction:ltr}\n.checks{list-style:none;padding:0;display:grid;gap:9px}\n.checks li{padding:8px 11px;border-radius:9px;background:#f5f8fd;display:flex;align-items:start;gap:9px;font-size:12px}\n.checks .symbol{color:#2e70c0;font-weight:900;font:700 16px/1.5 system-ui}\n.checks .checked .symbol{color:#17834d}\n.user-text{background:#f7f9fe;border:1px solid #dae6f6;border-radius:12px;padding:14px;font:13px/1.9 \"IBM Plex Mono\",ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;unicode-bidi:plaintext;direction:auto;tab-size:2;max-width:100%}\n.empty-note{font-size:12px;color:#8794a7}\n.footer{border-top:1px solid var(--line);padding:23px 0 32px;font-size:12px;color:#6a7990;line-height:1.85}\n@media(max-width:750px){.stats{grid-template-columns:1fr 1fr}.devices{grid-template-columns:1fr 1fr}.wrap{padding:12px}.cover{border-radius:15px}.stat{padding:12px}.stage summary{align-items:start;padding:12px}.stage-body{padding:14px}.track-head h2{font-size:20px}}\n@media(max-width:400px){.stats{grid-template-columns:1fr}.stage summary{gap:6px}.state{padding:3px 8px;font-size:10px}.devices{grid-template-columns:1fr 1fr}}\n@media print{\n @page{size:A4;margin:14mm}\n :root{--bg:#fff;--line:#b8c4d3}\n body{background:white;color:#111}\n .wrap{padding:0;max-width:none}\n .cover{background:#122f59!important;color:white!important;print-color-adjust:exact;-webkit-print-color-adjust:exact;border-radius:8px;padding:18px}\n .actions{display:none}\n .panel,.stat,.stage{box-shadow:none;break-inside:avoid-page}\n .stage:not([open])>.stage-body{display:block!important}\n details{display:block!important}\n details>summary{display:flex!important}\n details>.stage-body{display:block!important}\n .track{break-before:auto}\n a{text-decoration:none;color:inherit}\n .user-text{white-space:pre-wrap!important}\n .footer{page-break-inside:avoid}\n}\n";
function htmlEscape(value){return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function readableDate(value){
 if(!value)return "غير مسجل";
 const d=new Date(value);
 if(!Number.isFinite(d.getTime()))return "غير مسجل";
 return new Intl.DateTimeFormat("ar-JO",{dateStyle:"medium",timeStyle:"short"}).format(d);
}
function cleanValue(value){return typeof value==="string"?value:"";}
function makeStage(state,track,stage,index){
 const key=`${track.id}-${index}`;
 const completed=Boolean(state?.completed?.[key]);
 const last=state?.stageUpdatedAt?.[key];
 const checks=Array.isArray(stage.check)?stage.check:[];
 const checked=Array.isArray(state?.checks?.[key])?state.checks[key]:[];
 const results=cleanValue(state?.results?.[key]);
 const notes=cleanValue(state?.notes?.[key]);
 const checkList=checks.map((item,i)=>`<li class="${checked.includes(i)?"checked":"unchecked"}"><span class="symbol" aria-hidden="true">${checked.includes(i)?"☑":"☐"}</span><span dir="auto">${htmlEscape(item)}</span></li>`).join("");
 return `<details class="stage"${completed||results.trim()||notes.trim()?" open":""}>
 <summary><span class="stage-title"><strong><bdi>${index+1}. ${htmlEscape(stage.name)}</bdi></strong><small>${htmlEscape(checked.filter(n=>Number.isInteger(n)&&n>=0&&n<checks.length).length)} من ${checks.length} بنود تحقق</small></span>
 <span class="state ${completed?"done":"pending"}">${completed?"مكتملة حسب السجل":"غير مكتملة"}</span></summary>
 <div class="stage-body"><div class="dates">${completed?`<span>الإنجاز: <time datetime="${htmlEscape(state.completed[key])}">${htmlEscape(readableDate(state.completed[key]))}</time></span>`:""}${last?`<span>آخر تعديل: <time datetime="${htmlEscape(last)}">${htmlEscape(readableDate(last))}</time></span>`:""}</div>
 <h4>هدف المرحلة</h4><p dir="auto">${htmlEscape(stage.goal)}</p>
 <h4>قائمة التحقق</h4><ul class="checks">${checkList}</ul>
 <h4>النتائج والأدلة</h4>${results.trim()?`<div class="user-text" dir="auto">${htmlEscape(results)}</div>`:'<p class="empty-note">لم تُسجّل نتائج لهذه المرحلة.</p>'}
 <h4>الملاحظات وخطوات المتابعة</h4>${notes.trim()?`<div class="user-text" dir="auto">${htmlEscape(notes)}</div>`:'<p class="empty-note">لم تُسجّل ملاحظات لهذه المرحلة.</p>'}</div></details>`;
}
export function createTrainingReportHtml(state,tracks,options={}){
 const list=Array.isArray(tracks)?tracks:[];
 const total=list.reduce((sum,t)=>sum+(Array.isArray(t.stages)?t.stages.length:0),0);
 const checksTotal=list.reduce((sum,t)=>sum+(t.stages||[]).reduce((count,s)=>count+(s.check||[]).length,0),0);
 const done=list.reduce((n,t)=>n+(t.stages||[]).filter((_,i)=>Boolean(state?.completed?.[`${t.id}-${i}`])).length,0);
 const checkDone=list.reduce((n,t)=>n+(t.stages||[]).reduce((count,s,i)=>{
  const marked=Array.isArray(state?.checks?.[`${t.id}-${i}`])?state.checks[`${t.id}-${i}`]:[];
  return count+(s.check||[]).filter((_,idx)=>marked.includes(idx)).length;
 },0),0);
 const documented=list.reduce((n,t)=>n+(t.stages||[]).filter((_,i)=>{
  const key=`${t.id}-${i}`;return cleanValue(state?.notes?.[key]).trim()||cleanValue(state?.results?.[key]).trim();
 }).length,0);
 const date=options.createdAt||new Date().toISOString();
 const meter=(num,max)=>max?Math.min(100,Math.round(num/max*100)):0;
 const envLabel={on:"مفعّل (إدخال يدوي)",off:"غير مفعّل (إدخال يدوي)",unknown:"غير محدّد",isolated:"معزولة (إدخال يدوي)",notset:"غير محدّدة"};
 const devices=[["kali","Kali Linux"],["windows","Windows Host"],["target","الآلة الهدف"],["network","شبكة المختبر"]].map(([key,label])=>{
 const status=state?.devices?.[key]||"unknown";
 return `<div class="device"><span class="name"><bdi>${htmlEscape(label)}</bdi></span><span class="value">${htmlEscape(envLabel[status]||"غير محدّد")}</span></div>`;
 }).join("");
 const chapters=list.map((track,i)=>{
  const stages=track.stages||[];
  const complete=stages.filter((_,index)=>state?.completed?.[`${track.id}-${index}`]).length;
  return `<section class="track" id="track-${i+1}"><header class="track-head"><div><h2>${htmlEscape(track.name)}</h2><p>${htmlEscape(track.sub)}</p></div><span class="track-progress"><bdi>${complete} / ${stages.length}</bdi> مراحل</span></header>${stages.map((stage,index)=>makeStage(state,track,stage,index)).join("")}</section>`;
 }).join("\n");
 const toc=list.map((track,index)=>`<a href="#track-${index+1}">${htmlEscape(track.name)}</a>`).join("");
 return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; connect-src 'none'">
<title>تقرير التدريب | BLACKBOX</title><style>${stylesheet}</style></head>
<body><main class="wrap"><header class="cover"><div class="brand">▣ BLACKBOX LAB</div><p class="overline">TRAINING PROGRESS REPORT / LOCAL EXPORT</p>
<h1>تقرير التدريب</h1><p>توثيق المسارات العملية وقوائم التحقق والملاحظات كما هي محفوظة في بيانات التدريب المعروضة عند التصدير.</p>
<div class="cover-meta"><span class="chip">تاريخ التقرير: <bdi>${htmlEscape(readableDate(date))}</bdi></span><span class="chip">بيانات شخصية غير موثّقة خادميًا</span></div></header>
<div class="actions"><p class="hint">الملف يعمل دون إنترنت. راجع البيانات قبل المشاركة، فقد تتضمن نتائج وملاحظات حساسة.</p><button type="button" id="printReport">طباعة أو حفظ PDF</button></div>
<div class="stats" aria-label="ملخص التقدم"><article class="stat"><span class="number"><bdi>${done} / ${total}</bdi></span><span class="label">مراحل مكتملة</span><div class="meter" role="img" aria-label="${meter(done,total)} بالمئة من المراحل"><span style="width:${meter(done,total)}%"></span></div></article>
<article class="stat"><span class="number"><bdi>${checkDone} / ${checksTotal}</bdi></span><span class="label">بنود تحقق منجزة</span><div class="meter" role="img" aria-label="${meter(checkDone,checksTotal)} بالمئة من بنود التحقق"><span style="width:${meter(checkDone,checksTotal)}%"></span></div></article>
<article class="stat"><span class="number">${documented}</span><span class="label">مراحل تتضمن نتائج أو ملاحظات</span></article></div>
<section class="panel"><h2 class="section-title" style="margin-top:0">حالة بيئة المختبر</h2><div class="devices">${devices}</div><p class="disclaimer">هذه الحالات أدخلها المستخدم يدويًا، ولا تعني أن BLACKBOX فحص الأجهزة أو الشبكة أو أثبت العزل آليًا.</p></section>
<section class="panel"><h2 class="section-title" style="margin-top:0">فهرس المسارات</h2><nav class="contents" aria-label="المسارات التدريبية">${toc}</nav></section>
${chapters}<footer class="footer"><strong>BLACKBOX LAB • تقرير شخصي</strong><p>هذا التقرير تلخيص للتقدم الذي تم تسجيله، وليس شهادة معتمدة أو نتيجة اختبار أمني موثّق. التوقيت معروض وفق منطقة وقت الجهاز الذي أنشأ التقرير. النسخة الاحتياطية JSON منفصلة وتظل وسيلة استعادة التقدم.</p></footer>
</main><script>
(()=>{const button=document.getElementById('printReport');button?.addEventListener('click',()=>window.print());
let wasOpen=[];window.addEventListener('beforeprint',()=>{wasOpen=[...document.querySelectorAll('details')].map(x=>x.open);document.querySelectorAll('details').forEach(x=>{x.open=true})});
window.addEventListener('afterprint',()=>{document.querySelectorAll('details').forEach((x,i)=>{x.open=wasOpen[i]??x.open})});
})();
</script></body></html>`;
}
