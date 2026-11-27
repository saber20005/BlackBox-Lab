import { SUITE_PATHWAYS, suiteStepURL } from './suite-learning-pathways.js';
import { suiteJourneyProgress } from './suite-learning-progress.js';

const esc = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const target = step => step.site === 'cybertrace' ? ' target="_blank" rel="noopener noreferrer"' : '';

function receiptMessage(phase) {
  return ({
    guest: 'سجّل دخولك إلى BLACKBOX لعرض نتائج CyberTrace التي وصلت إلى حسابك. حالة التحقيقات غير معروفة للضيف.',
    disabled: 'سجل تحقيقات CyberTrace غير متاح الآن؛ يبقى تقدم مختبراتك ظاهرًا.',
    loading: 'جارٍ تحميل نتائج تحقيقات حسابك؛ لا نعدّ التحقيقات المجهولة غير منجزة.',
    cached: 'تظهر آخر نسخة مخبأة من نتائج التحقيقات؛ ننتظر تأكيد التحديث من الحساب.',
    error: 'تعذّر تحديث نتائج التحقيقات. نعرض ما نعرفه من آخر نسخة صالحة، وتبقى الحالات الأخرى غير معروفة.',
    ready: 'نتائج التحقيقات من سجل حساب BLACKBOX، والمختبرات من تقدمك الحالي.',
  })[phase];
}

function stepMessage(step) {
  if (step.site === 'blackbox') return step.status === 'complete' ? 'BLACKBOX · أكّدت إكمال جميع المراحل'
    : step.status === 'unknown' ? 'BLACKBOX · تعذّر تحديد حالة المسار' : 'BLACKBOX · لم تؤكّد إكمال جميع المراحل بعد';
  return step.status === 'complete' ? 'CyberTrace · نتيجة تحقيق محفوظة' + (step.cached ? ' في آخر نسخة مخبأة' : ' في حساب BLACKBOX')
    : step.status === 'unknown' ? 'CyberTrace · حالة الإنجاز غير معروفة الآن' : 'CyberTrace · لم تصل نتيجة إلى هذا الحساب';
}

export function suiteJourneysPage(state, tracks, options = {}) {
  const summaries = SUITE_PATHWAYS.map(path => suiteJourneyProgress(path, state, tracks, options));
  const phase = summaries[0].receiptPhase;
  const cards = SUITE_PATHWAYS.map((path, index) => {
    const summary = summaries[index];
    const next = summary.nextStep;
    const nextLabel = summary.allComplete ? 'راجع هذه الرحلة' : next.site === 'blackbox' ? 'تابع التدريب العملي' : next.status === 'unknown' ? 'افتح التحقيق وراجع إنجازه' : 'ابدأ التحقيق التالي';
    const note = summary.allComplete ? 'أكملت خطوات هذه الرحلة وفق السجلات المتاحة.'
      : next.status === 'unknown' ? 'حالة هذه الخطوة غير معروفة حاليًا؛ افتحها للمراجعة، ويمكنك اختيار أي خطوة من القائمة.'
      : 'هذه أول خطوة لم يظهر إكمالها في ترتيب الرحلة المقترح.';
    const steps = summary.steps.map((step, position) => '<li class="suite-step" data-step-state="' + step.status + '"><strong>' + (position + 1) + '. ' + esc(step.title) + '</strong><small>' + esc(stepMessage(step)) + '</small><a href="' + esc(suiteStepURL(step)) + '"' + target(step) + '>فتح التدريب ←</a></li>').join('');
    const status = [summary.unknown ? 'حالة غير معروفة: ' + summary.unknown : '', summary.cachedDone ? 'نتائج من نسخة مخبأة: ' + summary.cachedDone : ''].filter(Boolean).join(' · ');
    return '<details class="suite-card" data-journey="' + esc(path.id) + '" ' + (index === 0 ? 'open' : '') + '><summary class="suite-card-summary"><span class="suite-label">الخطوات ذات الإنجاز المعروف: <bdi dir="ltr">' + summary.done + ' / ' + summary.total + '</bdi></span><h2>' + esc(path.title) + '</h2><progress max="' + summary.total + '" value="' + summary.done + '" aria-label="' + esc('الخطوات ذات الإنجاز المعروف في ' + path.title) + '"></progress><span class="suite-local-progress">تأكيدات BLACKBOX: <bdi dir="ltr">' + summary.practicalDone + ' / ' + summary.practicalTotal + '</bdi></span>' + (status ? '<small class="suite-path-status">' + esc(status) + '</small>' : '') + '<span class="suite-expand" aria-hidden="true">⌄ عرض الخطوات</span></summary><div class="suite-card-body"><p>' + esc(path.description) + '</p><section class="suite-next-action" aria-label="الخطوة المقترحة"><h3>' + (summary.allComplete ? 'رحلتك جاهزة للمراجعة' : 'خطوتك المقترحة') + '</h3><strong>' + esc(next.title) + '</strong><p>' + esc(note) + '</p><a class="primary" data-journey-next href="' + esc(suiteStepURL(next)) + '"' + target(next) + '>' + esc(nextLabel) + ' ←</a></section><ol>' + steps + '</ol></div></details>';
  }).join('');
  const accountAction = phase === 'guest' ? '<button type="button" class="link-btn" data-open-account>الدخول لعرض نتائج التحقيق</button>'
    : phase === 'error' ? '<button type="button" class="link-btn" data-retry-skills>إعادة تحميل نتائج التحقيق</button>' : '';
  return '<section class="suite-page" aria-labelledby="suite-title"><h1 id="suite-title" tabindex="-1">المسارات التعليمية المشتركة</h1><p>أربع رحلات تجمع التحقيق والتطبيق العملي. تابع خطوتك المقترحة، أو افتح أي خطوة بالترتيب الذي يناسبك.</p><p class="suite-connection" role="status">' + esc(receiptMessage(phase)) + '</p>' + accountAction + '<details class="suite-provenance"><summary>كيف يُحسب تقدم الرحلة؟</summary><p>يُجمع إكمال مراحل BLACKBOX الذي تؤكّده مع نتائج التحقيقات المرسلة إلى حساب BLACKBOX. قد يكون سجل التحقيق من جهاز أو جلسة ربط سابقة؛ وجوده لا يثبت إكمال التحقيق في حساب CyberTrace المفتوح الآن. التحقيقات غير المعروفة تبقى معلّمة بذلك، ونتائج التحقيق لا تُكمل مراحل المختبر تلقائيًا. هذا تقدم تدريب ولا يمنح شهادة موثّقة.</p></details><div class="suite-grid">' + cards + '</div></section>';
}
