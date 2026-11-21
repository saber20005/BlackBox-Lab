import { createProgressSession } from './progress-session.js';
import { completedTrainingTracks, validLearnerName } from './certificates.js';

const source = document.getElementById('bb-cert-source-status');
const refresh = document.getElementById('bb-cert-refresh');
const select = document.getElementById('bb-cert-track');
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
  const tracks = eligible() ? completedTrainingTracks(snapshot.progress) : [];
  const chosen = tracks.find(item => item.trackId === select.value);
  const ready = Boolean(chosen && validLearnerName(name.value));
  paper.hidden = !ready;
  empty.hidden = ready;
  print.disabled = !ready;
  if (!ready) {
    empty.textContent = !eligible()
      ? 'انتظر قراءة تقدمك من المصدر الصحيح قبل معاينة الإفادة.'
      : 'اختر مسارًا مكتملًا وأدخل اسمًا صالحًا لمعاينة الإفادة.';
    return;
  }
  nameText.textContent = name.value.trim();
  titleText.textContent = chosen.title;
  details.textContent = 'المراحل التي أُكدت يدويًا: ' + chosen.stageCount + ' / ' + chosen.stageCount;
  date.textContent = 'آخر تأكيد إكمال مسجّل: ' + fmt(chosen.completedAt);
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
  const tracks = eligible() ? completedTrainingTracks(next.progress) : [];
  select.replaceChildren(new Option('— اختر المسار —', ''));
  for (const track of tracks) {
    select.add(new Option(track.title + ' — ' + track.stageCount + ' مراحل', track.trackId));
  }
  if (tracks.some(track => track.trackId === previousSelection)) select.value = previousSelection;
  select.disabled = !eligible() || tracks.length === 0;
  name.disabled = !eligible();
  count.textContent = eligible() ? tracks.length + ' مسارات مكتملة بالتأكيد اليدوي في المصدر المعروض.'
    : 'مصدر التقدم لم يجهز أو يتطلب تحديث الحساب؛ لا يمكن إصدار إفادة الآن.';
  renderPreview();
}

const session = createProgressSession({ onChange: render });
render(session.getSnapshot());
select.addEventListener('change', renderPreview);
name.addEventListener('input', renderPreview);
refresh.addEventListener('click', () => { void session.refresh(); });
print.addEventListener('click', () => {
  if (!eligible() || print.disabled) return;
  const chosen = completedTrainingTracks(snapshot.progress).find(track => track.trackId === select.value);
  if (!chosen || !validLearnerName(name.value)) return;
  window.print();
});
window.addEventListener('pageshow', event => { if (event.persisted) void session.refresh(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void session.refresh();
});
window.addEventListener('pagehide', event => { if (!event.persisted) session.dispose(); });
void session.start();
