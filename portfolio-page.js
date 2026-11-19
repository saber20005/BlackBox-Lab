import { createProgressSession } from './progress-session.js';
import { portfolioEntries, buildPortfolio, PORTFOLIO_SOURCE_LABELS } from './portfolio.js';

const statusNode = document.getElementById('progress-session-status');
const stageOptions = document.getElementById('portfolio-stage-options');
const reportNode = document.getElementById('portfolio-report');
const emptyPreview = document.getElementById('portfolio-empty-preview');
const selectionSummary = document.getElementById('portfolio-selection-summary');
const refreshButton = document.querySelector('[data-progress-refresh]');
const selectButton = document.querySelector('[data-portfolio-select-completed]');
const clearButton = document.querySelector('[data-portfolio-clear]');
const printButton = document.querySelector('[data-portfolio-print]');
const notesOption = document.querySelector('[data-portfolio-include-notes]');
const resultsOption = document.querySelector('[data-portfolio-include-results]');
const selected = new Set();
let activeScope, activeOwner, snapshot;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
const dateLabel = value => new Intl.DateTimeFormat('ar', { dateStyle: 'long' }).format(new Date(value));
const usable = () => snapshot?.progress && snapshot.scope !== 'unknown' && !['restoring', 'loading'].includes(snapshot.phase);

function sourceLabel() {
  if (snapshot.scope === 'guest') return PORTFOLIO_SOURCE_LABELS.guest;
  if (snapshot.scope !== 'account') return PORTFOLIO_SOURCE_LABELS.unknown;
  return snapshot.pending ? PORTFOLIO_SOURCE_LABELS.pending :
    snapshot.fromCache ? PORTFOLIO_SOURCE_LABELS.cache : PORTFOLIO_SOURCE_LABELS.account;
}

function appendDocumentation(card, heading, text) {
  if (!text) return;
  const section = element('section');
  const content = element('p', text, 'portfolio-text');
  content.dir = 'auto';
  section.append(element('h4', heading), content);
  card.append(section);
}

function renderPreview() {
  reportNode.replaceChildren();
  const report = buildPortfolio(usable() ? snapshot.progress : null, {
    selectedKeys: [...selected], includeNotes: notesOption.checked,
    includeResults: resultsOption.checked, sourceLabel: sourceLabel(),
  });
  const hasEntries = report.entries.length > 0;
  reportNode.hidden = !hasEntries;
  emptyPreview.hidden = hasEntries;
  printButton.disabled = !usable() || !hasEntries;
  clearButton.disabled = selected.size === 0 && !notesOption.checked && !resultsOption.checked;
  selectionSummary.textContent = hasEntries ? `${report.entries.length} مراحل مختارة في المعاينة.` : 'لا توجد مراحل مختارة في المعاينة.';
  if (!hasEntries) {
    emptyPreview.textContent = !usable() ? 'ستظهر خيارات المراحل بعد قراءة تقدمك. راجع حالة المصدر أعلاه.' :
      portfolioEntries(snapshot.progress).length ? 'اختر مرحلة مكتملة لبدء المعاينة.' : 'لا توجد مراحل مكتملة بتأكيدك اليدوي في مصدر التقدم المعروض بعد.';
    return;
  }
  const title = element('h2', 'ملف التدريب المختار — BLACKBOX', 'report-title');
  title.id = 'portfolio-report-title';
  reportNode.append(title, element('p', report.sourceLabel, 'report-source'),
    element('p', report.disclaimer, 'report-disclaimer'),
    element('p', `عدد المراحل المختارة: ${report.entries.length}`, 'report-summary'));
  for (const entry of report.entries) {
    const card = element('section', undefined, 'portfolio-entry');
    card.dataset.portfolioEntry = entry.key;
    const heading = element('div', undefined, 'entry-heading');
    heading.append(element('p', entry.trackName, 'entry-track'), element('h3', entry.title));
    const completed = element('p', 'الحالة: مكتملة بتأكيد المتعلم يدويًا.', 'entry-meta');
    const date = element('p', 'تاريخ التأكيد اليدوي: ', 'entry-meta');
    const time = element('time', dateLabel(entry.completedAt));
    time.dateTime = entry.completedAt;
    date.append(time);
    card.append(heading, completed, date, element('p', entry.goal),
      element('p', `بنود تحقق مؤشّرة يدويًا: ${entry.checkedCount} / ${entry.checkCount}`, 'entry-meta'));
    appendDocumentation(card, 'ملاحظات اختار المتعلم مشاركتها', entry.notes);
    appendDocumentation(card, 'نتائج اختار المتعلم مشاركتها', entry.results);
    reportNode.append(card);
  }
}

function render(next) {
  if (next.scope !== activeScope || next.ownerUid !== activeOwner) {
    selected.clear(); notesOption.checked = false; resultsOption.checked = false;
    activeScope = next.scope; activeOwner = next.ownerUid;
  }
  snapshot = next;
  statusNode.textContent = next.message;
  statusNode.dataset.phase = next.phase;
  statusNode.dataset.scope = next.scope;
  statusNode.dataset.fromCache = String(next.fromCache);
  statusNode.dataset.pending = String(next.pending);
  const loading = ['restoring', 'loading'].includes(next.phase);
  refreshButton.disabled = loading;
  notesOption.disabled = !usable(); resultsOption.disabled = !usable();
  stageOptions.replaceChildren();
  stageOptions.setAttribute('aria-busy', String(loading));
  const available = usable() ? portfolioEntries(next.progress) : [];
  if (usable()) {
    const validKeys = new Set(available.map(entry => entry.key));
    for (const key of selected) if (!validKeys.has(key)) selected.delete(key);
  }
  selectButton.disabled = !usable() || available.length === 0;
  for (const entry of available) {
    const label = element('label', undefined, 'check-option stage-choice');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.portfolioStage = entry.key;
    checkbox.checked = selected.has(entry.key);
    const caption = element('span');
    caption.append(element('strong', entry.title), element('small', entry.trackName),
      element('small', 'تأكيد يدوي: ' + dateLabel(entry.completedAt)));
    label.append(checkbox, caption);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selected.add(entry.key);
      else selected.delete(entry.key);
      renderPreview();
    });
    stageOptions.append(label);
  }
  renderPreview();
}

const session = createProgressSession({ onChange: render });
render(session.getSnapshot());
refreshButton.addEventListener('click', () => { void session.refresh(); });
selectButton.addEventListener('click', () => {
  if (!usable()) return;
  for (const entry of portfolioEntries(snapshot.progress)) selected.add(entry.key);
  render(snapshot);
});
clearButton.addEventListener('click', () => {
  selected.clear(); notesOption.checked = false; resultsOption.checked = false;
  render(snapshot);
});
notesOption.addEventListener('change', renderPreview);
resultsOption.addEventListener('change', renderPreview);
printButton.addEventListener('click', () => { if (usable() && !printButton.disabled) window.print(); });
window.addEventListener('pageshow', event => { if (event.persisted) void session.refresh(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void session.refresh();
});
window.addEventListener('pagehide', event => { if (!event.persisted) session.dispose(); });
void session.start();
