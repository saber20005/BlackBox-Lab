/* Preview-only guided spotlight over the existing BLACKBOX workspace.
 * Enabled only by ?spotlight-preview=1. No storage, Firebase, XP, shell, or training writes. */
(() => {
  "use strict";
  let url;
  try { url=new URL(performance.getEntriesByType("navigation")[0]?.name||location.href); }
  catch { url=new URL(location.href); }
  if(url.searchParams.get("spotlight-preview")!=="1")return;
  const query=selector=>document.querySelector(selector);
  const compact=()=>matchMedia("(max-width: 850px)").matches;
  const desktop=[
    {selector:'.sidebar [data-view="tracks"]',title:"افتح المسارات",text:"اضغط «المسارات» بنفسك. سينتقل الكشاف إلى المكان التالي بعد أن تتنقل فعليًا."},
    {selector:'.sidebar [data-view="progress"]',title:"راجع تقدّمك",text:"اضغط «تقدّمي» لترى لوحة الإنجازات. هذه المعاينة لا تعدّل أي مرحلة أو نقطة."},
    {selector:"#workspace-tools > summary",title:"أدوات ومساعدة",text:"افتح أدوات المساعدة من الشريط العلوي. ستجد التقارير ودليل المختبر وإعادة الجولة هنا."}
  ];
  const mobile=[
    {selector:"#bb-quick-dock > summary",title:"افتح اختصاراتك",text:"اضغط زر الاختصارات أسفل الشاشة. الكشاف يوجّهك داخل واجهة BLACKBOX الأصلية."},
    {selector:'#bb-quick-dock [data-bb-dock-view="tracks"]',title:"افتح المسارات",text:"اختر «المسارات» بنفسك؛ هذه الجولة تعتمد على الفعل وليس الإجابات الجاهزة."},
    {selector:"#bb-quick-dock > summary",title:"اختصاراتك موجودة دائمًا",text:"افتح القائمة مرة أخرى للوصول إلى لوحة التقدّم من أي مكان."},
    {selector:'#bb-quick-dock [data-bb-dock-view="progress"]',title:"راجع تقدّمك",text:"اضغط «تقدّمي». لم تتغير أي بيانات محفوظة؛ هذه تجربة توجيه بصري."}
  ];
  let steps=[],index=0,active=false,target=null,lastFocus=null,frame=0;
  const host=document.createElement("div");
  host.className="bb-sp-preview";host.hidden=true;
  host.innerHTML='<div class="bb-sp-hole" aria-hidden="true"></div>'+
    '<section class="bb-sp-panel" role="dialog" aria-modal="false" aria-labelledby="bb-sp-title" dir="rtl">'+
    '<div class="bb-sp-meta"><span>◈ BLACKBOX / INTERACTIVE GUIDE</span><span class="bb-sp-count">01 / 03</span></div>'+
    '<div class="bb-sp-meter"><i></i></div><h2 id="bb-sp-title"></h2><p class="bb-sp-desc"></p>'+
    '<p class="bb-sp-hint">اضغط العنصر المضيء للمتابعة، أو اختر التخطي.</p>'+
    '<div class="bb-sp-actions"><button type="button" class="bb-sp-skip">تخطي الجولة</button>'+
    '<button type="button" class="bb-sp-next" hidden>إنهاء الجولة</button></div>'+
    '<small>معاينة تفاعلية • بدون حفظ بيانات أو تغيير إنجازات</small></section>';
  const hole=host.querySelector(".bb-sp-hole"),panel=host.querySelector(".bb-sp-panel");
  const meter=host.querySelector(".bb-sp-meter i"),counter=host.querySelector(".bb-sp-count");
  const nextButton=host.querySelector(".bb-sp-next"),hint=host.querySelector(".bb-sp-hint");
  const replay=document.createElement("button");
  replay.type="button";replay.className="bb-sp-replay";replay.textContent="◈ إعادة الجولة الضوئية";
  replay.setAttribute("aria-label","إعادة تجربة الكشاف الضوئي");
  document.body.append(host,replay);
  function visible(el){
    if(!el||!el.isConnected)return false;
    const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
    return rect.width>0&&rect.height>0&&style.display!=="none"&&style.visibility!=="hidden";
  }
  function position(){
    if(!active)return;
    if(index>=steps.length){complete();return;}
    const item=steps[index],node=query(item.selector);
    if(!visible(node)){complete();return;}
    target=node;
    const first=node.getBoundingClientRect();
    if(first.bottom<0||first.top>innerHeight)node.scrollIntoView({block:"center",behavior:"instant"});
    const r=node.getBoundingClientRect(),pad=7;
    Object.assign(hole.style,{left:Math.max(3,r.left-pad)+"px",top:Math.max(3,r.top-pad)+"px",
      width:Math.min(innerWidth-6,r.width+pad*2)+"px",height:Math.min(innerHeight-6,r.height+pad*2)+"px"});
    panel.querySelector("#bb-sp-title").textContent=item.title;
    panel.querySelector(".bb-sp-desc").textContent=item.text;
    counter.textContent=String(index+1).padStart(2,"0")+" / "+String(steps.length).padStart(2,"0");
    meter.style.width=((index+1)/steps.length*100)+"%";hint.hidden=false;nextButton.hidden=true;
    panel.style.visibility="hidden";
    requestAnimationFrame(()=>{
      if(!active||index>=steps.length)return;
      const w=panel.getBoundingClientRect().width,h=panel.getBoundingClientRect().height;
      let x=innerWidth<720?Math.max(12,(innerWidth-w)/2):r.left-w-24;
      if(x<12)x=r.right+22;
      x=Math.max(12,Math.min(innerWidth-w-12,x));
      let y=innerWidth<720?Math.max(12,innerHeight-h-12):(r.top+r.height/2-h/2);
      y=Math.max(12,Math.min(innerHeight-h-12,y));
      if(innerWidth<720&&r.top>innerHeight/2)y=12;
      Object.assign(panel.style,{left:x+"px",top:y+"px",visibility:"visible"});
    });
  }
  function complete(){
    if(!active)return;
    index=steps.length;target=null;hole.style.opacity="0";
    panel.querySelector("#bb-sp-title").textContent="عرفت طريقك داخل BLACKBOX";
    panel.querySelector(".bb-sp-desc").textContent="انتقلت بين الأقسام الحقيقية بنفسك. تابع التدريب أو أعد الجولة من الزر الصغير. لم يتغير تقدّمك.";
    counter.textContent="COMPLETE";meter.style.width="100%";
    hint.hidden=true;nextButton.hidden=false;
    Object.assign(panel.style,{visibility:"visible",left:Math.max(12,(innerWidth-panel.offsetWidth)/2)+"px",
      top:Math.max(12,(innerHeight-panel.offsetHeight)/2)+"px"});
    nextButton.focus({preventScroll:true});
  }
  function onClick(event){
    if(!active||panel.contains(event.target))return;
    if(target&&(event.target===target||target.contains(event.target))){
      setTimeout(()=>{if(!active)return;index++;position();},70);
      return;
    }
    event.preventDefault();event.stopImmediatePropagation();
    if(target)hint.textContent="اضغط داخل الإطار المضيء لتكمل الجولة.";
  }
  function onKey(e){if(e.key==="Escape"){e.preventDefault();e.stopPropagation();stop();}}
  function onResize(){if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(position);}
  function stop(){
    if(!active)return;
    active=false;host.hidden=true;target=null;
    document.removeEventListener("click",onClick,true);document.removeEventListener("keydown",onKey,true);
    removeEventListener("resize",onResize);removeEventListener("scroll",onResize,true);
    if(frame)cancelAnimationFrame(frame);
    const restore=lastFocus;lastFocus=null;
    if(restore?.isConnected&&visible(restore))restore.focus({preventScroll:true});
  }
  function start(){
    if(document.querySelector("dialog[open]"))return;
    stop();steps=compact()?mobile:desktop;index=0;target=null;lastFocus=document.activeElement;
    const dock=query("#bb-quick-dock");if(dock)dock.open=false;
    active=true;hole.style.opacity="1";host.hidden=false;
    document.addEventListener("click",onClick,true);document.addEventListener("keydown",onKey,true);
    addEventListener("resize",onResize);addEventListener("scroll",onResize,true);
    position();panel.querySelector(".bb-sp-skip").focus({preventScroll:true});
  }
  replay.addEventListener("click",start);panel.querySelector(".bb-sp-skip").addEventListener("click",stop);
  nextButton.addEventListener("click",stop);addEventListener("pagehide",stop);
  addEventListener("load",()=>{if(!document.querySelector("dialog[open]"))requestAnimationFrame(start);},{once:true});
})();