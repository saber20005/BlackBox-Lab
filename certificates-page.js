import { createProgressSession } from './progress-session.js';
import { trainingCertificateGroups, completedTrainingGroups, validLearnerName } from './certificates.js';

const source = document.getElementById('bb-cert-source-status');
const refresh = document.getElementById('bb-cert-refresh');
const select = document.getElementById('bb-cert-track');
const trackHelp = document.getElementById('bb-cert-track-help');
const name = document.getElementById('bb-cert-name');
const count = document.getElementById('bb-cert-count');
const print = document.getElementById('bb-cert-print');
const paper = document.getElementById('bb-cert-paper');
const empty = document.getElementById('bb-cert-empty');
const nameText = document.getElementById('bb-cert-learner-name');
const titleText = document.getElementById('bb-cert-track-title');
const details = document.getElementById('bb-cert-details');
const date = document.getElementById('bb-cert-date');
let snapshot = null, activeScope = undefined, activeOwner = undefined;
const fmt = value => new Intl.DateTimeFormat('ar', { dateStyle: 'long' }).format(new Date(value));

function eligible() {
  // A failed cloud read or an unsynced/cached account draft must not look confirmed.
  return snapshot?.phase === 'ready' && snapshot.progress && !snapshot.fromCache && !snapshot.pending &&
    ['guest', 'account'].includes(snapshot.scope);
}

function renderPreview() {
  const groups = eligible() ? trainingCertificateGroups(snapshot.progress) : [];
  const selected = groups.find(group => group.id === select.value);
  const chosen = selected?.complete ? selected : null;
  trackHelp.textContent = !eligible()
    ? 'مصدر التقدم لم يجهز بعد؛ يمكنك استعراض أسماء المجموعات دون إصدار إفادات.'
    : !selected
      ? 'اختر مجموعة تدريبية لمعرفة تقدمك؛ إفادة واحدة عند إكمال جميع مسارات المجموعة.'
      : chosen
        ? 'المجموعة مكتملة بتأكيدك اليدوي. أدخل اسمًا صالحًا لتفعيل طباعة الإفادة.'
        : `المجموعة غير مكتملة: ${selected.completedStages} من ${selected.stageCount} مرحلة عبر ${selected.trackCount} مسارات.`;
  const ready = Boolean(chosen && validLearnerName(name.value));
  paper.hidden = !ready;
  empty.hidden = ready;
  print.disabled = !ready;
  if (!ready) {
    empty.textContent = !eligible()
      ? 'انتظر قراءة تقدمك من المصدر الصحيح قبل معاينة الإفادة.'
      : selected && !chosen
        ? `اخترت «${selected.title}»؛ أكملت ${selected.completedStages} من ${selected.stageCount} مرحلة. لا تتوفر إفادة حتى اكتمال المجموعة.`
        : chosen
          ? 'أدخل اسمًا صالحًا لمعاينة إفادة المجموعة المكتملة.'
          : 'اختر مجموعة تدريبية؛ لا تتوفر الطباعة إلا بعد إكمال جميع مساراتها.';
    return;
  }
  nameText.textContent = name.value.trim();
  titleText.textContent = chosen.title;
  details.textContent = chosen.trackCount + ' مسارات · ' + chosen.stageCount + ' / ' + chosen.stageCount + ' مرحلة';
  date.textContent = fmt(chosen.completedAt);
}

function render(next) {
  if (next.scope !== activeScope || next.ownerUid !== activeOwner) {
    activeScope = next.scope;
    activeOwner = next.ownerUid;
    select.value = '';
    name.value = '';
  }
  const previousSelection = select.value;
  snapshot = next;
  source.textContent = next.message;
  source.dataset.scope = next.scope;
  source.dataset.phase = next.phase;
  refresh.disabled = ['loading', 'restoring'].includes(next.phase);
  const groups = eligible() ? trainingCertificateGroups(next.progress) : trainingCertificateGroups(null);
  select.replaceChildren(new Option('— اختر المجموعة —', ''));
  // Browsing group titles never implies an award while account scope is unresolved.
  for (const group of groups) {
    const status = eligible() ? `${group.completedStages} / ${group.stageCount} مرحلة` : 'بانتظار التقدم';
    select.add(new Option(`${group.title} — ${status}`, group.id));
  }
  if (groups.some(group => group.id === previousSelection)) select.value = previousSelection;
  select.disabled = false;
  name.disabled = !eligible();
  count.textContent = eligible() ? groups.filter(group => group.complete).length + ' من ' + groups.length + ' مجموعات مكتملة بالتأكيد اليدوي.'
    : 'المجموعات معروضة للاطلاع فقط حتى يجهز مصدر التقدم؛ لا يمكن طباعة إفادة الآن.';
  renderPreview();
}

const session = createProgressSession({ onChange: render });
render(session.getSnapshot());
select.addEventListener('change', renderPreview);
name.addEventListener('input', renderPreview);
refresh.addEventListener('click', () => { void session.refresh(); });
print.addEventListener('click', () => {
  if (!eligible() || print.disabled) return;
  const chosen = completedTrainingGroups(snapshot.progress).find(group => group.id === select.value);
  if (!chosen || !validLearnerName(name.value)) return;
  window.print();
});
window.addEventListener('pageshow', event => { if (event.persisted) void session.refresh(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void session.refresh();
});
window.addEventListener('pagehide', event => { if (!event.persisted) session.dispose(); });
void session.start();
