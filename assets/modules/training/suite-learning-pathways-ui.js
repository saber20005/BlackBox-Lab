import {SUITE_PATHWAYS,suiteStepURL,localJourneyProgress} from './suite-learning-pathways.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function suiteJourneysPage(state,tracks){
 const done=id=>{const t=tracks.find(x=>x.id===id);return Boolean(t?.stages?.length)&&t.stages.every((_,i)=>Boolean(state?.completed?.[id+'-'+i]));};
 const cards=SUITE_PATHWAYS.map(path=>{
  const summary=localJourneyProgress(path,'blackbox',done);
  const steps=path.steps.map((step,i)=>{
   const own=step.site==='blackbox',finished=own&&done(step.id);
   return '<li class="suite-step"><strong>'+(i+1)+'. '+esc(step.title)+'</strong><small>'+esc(step.site==='blackbox'?'BLACKBOX · '+(finished?'جميع المراحل مؤكدة محليًا':'لم تؤكد جميع المراحل بعد'):'CyberTrace · الحالة غير معروضة هنا')+'</small><a href="'+esc(suiteStepURL(step))+'"'+(own?'':' target="_blank" rel="noopener noreferrer"')+'>فتح التدريب ←</a></li>';
  }).join('');
  return '<article class="suite-card"><span class="suite-label">BLACKBOX: '+summary.done+' / '+summary.total+' محليًا</span><h2>'+esc(path.title)+'</h2><p>'+esc(path.description)+'</p><progress max="'+summary.total+'" value="'+summary.done+'"></progress><ol>'+steps+'</ol></article>';
 }).join('');
 return '<section class="suite-page" aria-labelledby="suite-title"><h1 id="suite-title" tabindex="-1">المسارات التعليمية المشتركة</h1><p>أربع رحلات ترتب تحقيقات CyberTrace وتدريبات BLACKBOX في خطوات متتابعة. ترتيبها إرشادي ولا يقفل التدريب.</p><p class="suite-warning" role="note">تقدم BLACKBOX المعروض تأكيد تدريب محلي فقط. إنجاز CyberTrace غير معروف هنا؛ لا ننقل حسابات أو نقاطًا أو رموزًا بين الموقعين، ولا يمنح هذا المركز شهادة موثّقة.</p><div class="suite-grid">'+cards+'</div><p class="suite-footer">راجع نتائج التحقيقات في <a href="https://www.cybertracelab.dev/?view=journeys" target="_blank" rel="noopener noreferrer">مركز CyberTrace المقابل</a>.</p></section>';
}
