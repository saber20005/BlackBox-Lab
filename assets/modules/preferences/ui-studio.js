import {BB_UI_PRESETS} from './ui-preferences.js';

const themes=[['dark','Midnight Blue','الأزرق الأصلي'],['stealth','Stealth','وضع العمليات'],['light','Daylight','قراءة فاتحة']];
const accents=[['brand','الأزرق','#3988ff'],['cyan','السيان','#35c5e8'],['violet','البنفسجي','#a994fb']];
const controls=[
 ['textSize','حجم النص',[['normal','عادي'],['large','كبير'],['xlarge','كبير جدًا']]],
 ['density','كثافة الواجهة',[['comfortable','مريحة'],['compact','مدمجة']]],
 ['contrast','التباين',[['standard','قياسي'],['high','مرتفع']]],
 ['motion','الحركة',[['system','حسب الجهاز'],['reduce','تقليل الحركة']]]
];
const levels=[['unset','غير محدد'],['beginner','مبتدئ'],['hobbyist','هاوٍ'],['intermediate','متوسط'],['advanced','متقدم']];
// All values originate from fixed arrays above or the normalized allowlisted preferences.
export function renderBbStudio(p){
 const presetId=BB_UI_PRESETS.find(row=>['theme','accent','textSize','density','contrast','motion'].every(k=>row[k]===p[k]))?.id;
 const presetCards=BB_UI_PRESETS.map(x=>`<button type="button" class="bb-studio-preset" aria-pressed="${x.id===presetId}" data-bb-preset="${x.id}"><span class="bb-studio-visual ${x.id}" aria-hidden="true"><i></i><i></i><i></i></span><strong>${x.title}</strong><small>${x.id==='signature'?'الأزرق الأصلي مع عرض مريح':x.id==='focus'?'التركيز مع تقليل الحركة':'خط أكبر وتباين مرتفع'}</small></button>`).join('');
 const themeCards=themes.map(([id,title,hint])=>`<button type="button" class="bb-studio-theme" aria-pressed="${p.theme===id}" data-bb-choice-key="theme" data-bb-choice-value="${id}"><span class="bb-studio-visual ${id}" aria-hidden="true"><i></i><i></i><i></i></span><strong>${title}</strong><small>${hint}</small></button>`).join('');
 const colorButtons=accents.map(([id,name,color])=>`<button type="button" class="bb-studio-swatch" aria-pressed="${p.accent===id}" data-bb-choice-key="accent" data-bb-choice-value="${id}"><span style="background:${color}" aria-hidden="true"></span>${name}</button>`).join('');
 const optionRows=controls.map(([key,title,items])=>`<div class="bb-studio-option"><span>${title}</span><div class="bb-studio-choice" role="group" aria-label="${title}">${items.map(([id,label])=>`<button type="button" data-bb-choice-key="${key}" data-bb-choice-value="${id}" aria-pressed="${p[key]===id}">${label}</button>`).join('')}</div></div>`).join('');
 const levelOptions=levels.map(([id,title])=>`<option value="${id}"${p.level===id?' selected':''}>${title}</option>`).join('');
 return `<section class="bb-studio" aria-label="استوديو تخصيص BLACKBOX">
 <header class="bb-studio-header"><div><span class="bb-studio-kicker">BLACKBOX / EXPERIENCE CONTROL</span><h1>استوديو تخصيص مساحة التدريب</h1><p>هوية واجهتك، التحكم في القراءة، وكثافة العناصر. الإعدادات تتغير أمامك مباشرة دون التأثير على تقدمك.</p></div><span class="bb-studio-tag">● تخصيص محلي آمن</span></header>
 <div class="bb-studio-layout"><div class="bb-studio-sections">
 <section class="bb-studio-panel" aria-labelledby="bb-studio-quick"><span class="bb-studio-label">01 / QUICK PRESETS</span><h2 id="bb-studio-quick">أنماط جاهزة بضغطة واحدة</h2><div class="bb-studio-presets">${presetCards}</div></section>
 <section class="bb-studio-panel" aria-labelledby="bb-studio-identity"><span class="bb-studio-label">02 / VISUAL IDENTITY</span><h2 id="bb-studio-identity">هوية واجهتك</h2><div class="bb-studio-themes" role="group" aria-label="أنماط المظهر">${themeCards}</div><p class="bb-studio-accent-title" id="bb-accent-label">لون الإبراز</p><div class="bb-studio-swatches" role="group" aria-labelledby="bb-accent-label">${colorButtons}</div></section>
 <section class="bb-studio-panel" aria-labelledby="bb-studio-accessibility"><span class="bb-studio-label">03 / READING AND FOCUS</span><h2 id="bb-studio-accessibility">القراءة والتركيز</h2><div class="bb-studio-options">${optionRows}</div></section>
 <section class="bb-studio-panel" aria-labelledby="bb-studio-learning"><span class="bb-studio-label">04 / TRAINING SPACE</span><h2 id="bb-studio-learning">مستواك التدريبي — اختياري</h2><label class="bb-studio-level"><span>المستوى الذي تختاره لنفسك</span><select data-bb-ui-key="level">${levelOptions}</select></label><p class="bb-studio-note">هذا ليس تقييمًا لمهارتك، ولا يمنح شهادات أو صلاحيات جديدة.</p><p class="bb-studio-note">التفضيلات تُحفظ محليًا في هذا الجهاز فقط؛ لا تُغيّر نتائج المختبر أو مزامنة Firebase.</p></section>
 </div>
 <aside class="bb-studio-preview-wrap" aria-label="معاينة المظهر"><div class="bb-studio-preview-stick"><div class="bb-studio-preview-head"><div><span class="bb-studio-label">LIVE PREVIEW</span><h2>معاينة مباشرة</h2></div><small>● مباشر</small></div>
 <div class="bb-studio-preview"><div class="bb-studio-preview-top"><strong>BLACKBOX ◈</strong><small>SAMPLE / DEMO</small></div><div class="bb-studio-preview-content"><span class="bb-studio-label">ISOLATED LAB / SAMPLE</span><h3>مساحة التدريب التفاعلي</h3><p>بيانات للمعاينة فقط. لا يُقرأ أو يُغيّر أي تقدم حقيقي.</p><div class="bb-studio-preview-kpis"><div><small>المهام</small><strong>03</strong></div><div><small>الشبكة</small><strong>SAFE</strong></div><div><small>الوضع</small><strong>LAB</strong></div></div><div class="bb-studio-preview-task"><span aria-hidden="true">◇</span><div><strong>استكشاف الشبكة</strong><small>مثال بصري دون تنفيذ أوامر</small></div></div><div class="bb-studio-preview-buttons"><span>فتح المسار</span><span>التفاصيل</span></div></div></div>
 <div class="bb-studio-footer"><p role="status" aria-live="polite" data-bb-ui-feedback>جرّب أحد الخيارات لمشاهدة تأثيره.</p><button type="button" data-bb-ui-reset>استعادة الإعدادات الأصلية</button></div>
 </div></aside></div></section>`;
}
