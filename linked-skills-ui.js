import { CASE_META, MAX_CASE_SCORE, aggregateSkillProgress, normalizeReceipt } from './cybertrace-catalog.js';

const esc = (value = '') => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const number = value => Number.isFinite(value) ? String(Math.round(value)) : '0';
const trackNames = { recon: 'تجهيز المختبر', nmap: 'Nmap', network: 'تحليل الشبكات', webgoat: 'WebGoat', proxy: 'تحليل طلبات الويب', metasploit: 'Metasploit' };

function caseURL(caseId) {
  const url = new URL('https://cybertracelab.dev/');
  if (caseId && Object.hasOwn(CASE_META, caseId)) url.searchParams.set('case', caseId);
  else url.searchParams.set('view', 'library');
  url.searchParams.set('utm_source', 'blackbox');
  url.searchParams.set('utm_medium', 'referral');
  url.searchParams.set('utm_campaign', 'linked_skills');
  return url.href;
}

function visibleReceipts(state, user) {
  if (!user || !state.enabled || ['disabled', 'guest'].includes(state.phase)) return {};
  return Object.fromEntries(Object.entries(state.receipts || {}).flatMap(([id, raw]) => {
    const receipt = normalizeReceipt(raw, id);
    return receipt ? [[id, receipt]] : [];
  }));
}

function receiptStatus(state) {
  if (state.phase === 'loading' && !Object.keys(state.receipts || {}).length) {
    return '<p class="linked-status" role="status">جارٍ تحميل إنجازات CyberTrace المرتبطة بهذا الحساب…</p>';
  }
  if (state.phase === 'error') {
    const cached = Object.keys(state.receipts || {}).length ? ' تظهر آخر نسخة متاحة لهذا الحساب إلى أن يعود الاتصال.' : '';
    return `<div class="linked-status error" role="status"><span>تعذّر تحديث إنجازات CyberTrace.${cached}</span><button type="button" class="link-btn" data-retry-skills>إعادة المحاولة</button></div>`;
  }
  if (state.fromCache) return '<p class="linked-status" role="status">تظهر نسخة محلية من الإنجازات؛ ننتظر تأكيد آخر تحديث من الحساب.</p>';
  return '<p class="linked-status" role="status">أفضل نتائج التحقيقات المحفوظة في حسابك.</p>';
}

export function linkedSkillsSummary(state, user) {
  if (!state.enabled) return '';
  if (!user) {
    return `<section class="card section linked-summary" aria-labelledby="linkedSummaryTitle"><div><span class="eyebrow">CYBERTRACE / BLACKBOX</span><h2 id="linkedSummaryTitle">تحقيقاتك تبني مهاراتك هنا</h2><p>اربط CyberTrace بحساب BlackBox لتظهر أفضل نتائجك في سجل المهارات المترابطة.</p></div><div class="button-row"><button type="button" class="secondary" data-open-account>سجّل لعرض مهاراتك</button><button type="button" class="link-btn" data-nav="skills">كيف يتقدّم سجل المهارات؟ ←</button></div></section>`;
  }
  const receipts = visibleReceipts(state, user);
  const summary = aggregateSkillProgress(receipts);
  const known = state.phase === 'ready' || Object.keys(receipts).length > 0;
  return `<section class="card section linked-summary" aria-labelledby="linkedSummaryTitle"><div><span class="eyebrow">CYBERTRACE / BLACKBOX</span><h2 id="linkedSummaryTitle">نتائج التحقيق، ضمن رحلتك</h2><p>${known ? `${number(summary.points)} نقطة تعلّم من ${number(summary.completedCount)} تحقيقات مرتبطة بحسابك.` : 'تظهر إنجازات التحقيق بعد تحميل سجل حسابك.'}</p>${receiptStatus({ ...state, receipts })}</div><button type="button" class="secondary" data-nav="skills">المهارات المترابطة ←</button></section>`;
}

export function linkedSkillsPage(state, user) {
  if (!state.enabled) return '<section class="card empty"><h2>المهارات المترابطة قيد الإعداد</h2><p>سيظهر سجل إنجازات CyberTrace هنا بعد اكتمال الربط.</p><button type="button" class="secondary" data-nav="home">العودة إلى لوحة التحكم</button></section>';
  if (!user) return `<section class="card linked-intro"><span class="eyebrow">CYBERTRACE / BLACKBOX</span><h2>سجل واحد لنتائج التحقيق</h2><p>سجّل بحساب BlackBox، ثم اربط الحساب نفسه من داخل CyberTrace. كل تحقيق تنهيه يضيف أفضل نتيجته إلى المهارة المرتبطة به.</p><p class="muted">يمكن تحسين النتيجة بإعادة التحقيق. تُحتسب أفضل نتيجة لكل قضية مرة واحدة، وتأكيد مراحل المختبر العملي يتم من داخل تمارينه.</p><div class="button-row"><button type="button" class="primary" data-open-account>الدخول إلى حساب BlackBox</button><a class="secondary partner-link" href="${esc(caseURL())}" target="_blank" rel="noopener" data-linked-case-link>افتح CyberTrace ↗</a></div></section>`;
  const receipts = visibleReceipts(state, user);
  const summary = aggregateSkillProgress(receipts);
  const known = state.phase === 'ready' || Object.keys(receipts).length > 0;
  const value = value => known ? number(value) : '—';
  const explored = summary.skills.filter(skill => skill.completedCount > 0).length;
  return `<section class="card linked-intro"><div class="section-head"><div><span class="eyebrow">CYBERTRACE / BLACKBOX</span><h2>نتائج حسابك، حسب المهارة</h2></div><a class="secondary partner-link" href="${esc(caseURL())}" target="_blank" rel="noopener" data-linked-case-link>تابع تحقيقاتك ↗</a></div><p>اربط CyberTrace بحساب BlackBox الذي تستخدمه هنا. تُضاف أفضل نتيجة لكل تحقيق إلى مهارته، وتزيد النقاط عند تحسين النتيجة.</p><p class="muted">نقاط التعلّم تجمع نتائجك المحفوظة. نسبة التغطية تتبع تحقيقات المكتبة المتاحة حاليًا، وتأكيد المراحل العملية يتم من داخل تمارين المختبر.</p>${receiptStatus(state)}</section><section class="grid linked-totals" aria-label="ملخص إنجازات التحقيق"><article class="card stat"><span class="stat-label">نقاط التعلّم</span><strong class="stat-value" id="linkedSkillPoints">${value(summary.points)}</strong><span class="stat-foot">أفضل نتائجك المسجّلة</span></article><article class="card stat"><span class="stat-label">تحقيقات مرتبطة</span><strong class="stat-value" id="linkedCaseCount">${value(summary.completedCount)}<span> / ${number(summary.totalCases)}</span></strong><span class="stat-foot">مصدر الإنجاز: CyberTrace</span></article><article class="card stat"><span class="stat-label">مهارات تدرّبت عليها</span><strong class="stat-value">${value(explored)}<span> / ${number(summary.skills.length)}</span></strong><span class="stat-foot">تتقدّم مع نتائج التحقيق</span></article></section><section class="linked-skill-grid" aria-label="تقدّم مهارات التحقيق">${summary.skills.map(skill => skillCard(skill, receipts, known)).join('')}</section>`;
}

function skillCard(skill, receipts, known) {
  const percentage = known ? number(skill.percent) : '—';
  const points = known ? number(skill.points) : '—';
  const followUps = [...new Set(skill.caseIds.flatMap(id => CASE_META[id]?.trackIds || []))].filter(id => Object.hasOwn(trackNames, id));
  return `<article class="card linked-skill-card" data-skill-id="${esc(skill.id)}"><div class="section-head"><h2>${esc(skill.label)}</h2><span class="badge">${points} نقطة</span></div><div class="linked-meter-label"><span>تغطية تحقيقات المكتبة الحالية</span><strong>${percentage}${known ? '%' : ''}</strong></div><progress class="native-progress" max="100"${known ? ` value="${number(skill.percent)}"` : ''} aria-label="تغطية تحقيقات ${esc(skill.label)}">${percentage}${known ? '%' : ''}</progress><p class="linked-skill-caption">${known ? `${number(skill.completedCount)} / ${number(skill.totalCases)} تحقيقات مسجّلة · ${number(skill.points)} / ${number(skill.maxPoints)} نقطة` : 'بانتظار تحميل سجل الحساب'}</p><ul class="linked-case-list">${skill.caseIds.map(id => {
    const receipt = receipts[id];
    return `<li data-linked-case-id="${esc(id)}"><div><strong>${esc(CASE_META[id]?.title || id)}</strong><small>${receipt ? `<span class="linked-case-score">${number(receipt.bestScore)} / ${MAX_CASE_SCORE}</span> · أفضل نتيجة` : 'متاح للتدريب في CyberTrace'}</small></div><a class="link-btn" href="${esc(caseURL(id))}" target="_blank" rel="noopener" data-linked-case-link>${receipt ? 'حسّن نتيجتك' : 'ابدأ التحقيق'} ↗</a></li>`;
  }).join('')}</ul>${followUps.length ? `<div class="linked-follow-ups"><span>تطبيقات عملية مكمّلة</span><div>${followUps.map(id => `<button type="button" class="link-btn" data-track="${esc(id)}">${esc(trackNames[id])} ←</button>`).join('')}</div></div>` : ''}</article>`;
}
