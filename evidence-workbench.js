// A read-only view of the synthetic training artifact. Selection is UI state;
// only the caller can append a citation to an existing progress field.
export const AUTH_EVENT_FIELDS = Object.freeze(['time', 'user', 'src_ip', 'event', 'session_id', 'device', 'result', 'resource']);
export const MAX_EVIDENCE_BYTES = 65536;
export const MAX_EVIDENCE_ROWS = 500;
const SOURCE_NAME = 'auth-events.csv';
const SOURCE_URL = new URL('./training-kit/blackbox-defense/auth-events.csv', import.meta.url);
const labels = Object.freeze({ time: 'الوقت UTC', user: 'المستخدم', src_ip: 'عنوان المصدر', event: 'الحدث', session_id: 'الجلسة', device: 'الجهاز', result: 'النتيجة', resource: 'المورد' });

/** Parse CSV without dropping quoted newlines or changing original line numbers. */
export function parseAuthEventsCSV(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_EVIDENCE_BYTES) throw new Error('حجم ملف السجلات أكبر من الحد المسموح (64 كيلوبايت).');
  if (text.includes('\0')) throw new Error('ملف السجلات يحتوي محارف غير صالحة.');
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const records = [];
  let fields = [], value = '', quoted = false, closedQuote = false, line = 1, startLine = 1, started = false;
  function field() {
    if (value.length > 4096) throw new Error('أحد حقول السجل أطول من الحد المسموح.');
    fields.push(value); value = ''; closedQuote = false; started = false;
  }
  function record() {
    const blankLine = fields.length === 0 && value === '' && !started && !closedQuote;
    field();
    if (!blankLine) records.push({ values: fields, line: startLine, endLine: line });
    fields = [];
    if (records.length > MAX_EVIDENCE_ROWS + 1) throw new Error('عدد سجلات التدريب أكبر من الحد المسموح.');
  }
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') { value += '"'; index++; }
        else { quoted = false; closedQuote = true; }
      } else if (character === '\r' || character === '\n') {
        if (character === '\r' && source[index + 1] === '\n') index++;
        value += '\n'; line++;
      } else value += character;
      continue;
    }
    if (character === ',') { field(); continue; }
    if (character === '\r' || character === '\n') {
      record();
      if (character === '\r' && source[index + 1] === '\n') index++;
      line++; startLine = line; continue;
    }
    if (closedQuote) throw new Error('صيغة CSV غير صالحة بعد إغلاق حقل مقتبس.');
    if (character === '"') {
      if (started || value) throw new Error('صيغة الاقتباس داخل CSV غير صالحة.');
      quoted = true; started = true;
    } else { value += character; started = true; }
  }
  if (quoted) throw new Error('حقل مقتبس في CSV لم يُغلق.');
  if (fields.length || value || started || closedQuote) record();
  const header = records.shift();
  if (!header || header.values.length !== AUTH_EVENT_FIELDS.length || header.values.some((name, index) => name !== AUTH_EVENT_FIELDS[index])) throw new Error('حقول ملف السجلات لا تطابق نموذج التدريب.');
  if (!records.length) throw new Error('ملف السجلات لا يحتوي أحداثًا للتحليل.');
  return Object.freeze(records.map(record => {
    if (record.values.length !== AUTH_EVENT_FIELDS.length || record.values.some(item => !item.trim())) throw new Error(`السجل عند السطر ${record.line} ناقص أو غير صالح.`);
    const time = record.values[0], [seconds, fraction = ''] = time.slice(0, -1).split('.');
    const expectedTime = `${seconds}.${fraction.padEnd(3, '0')}Z`;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(time) || !Number.isFinite(Date.parse(time)) || new Date(time).toISOString() !== expectedTime) throw new Error(`وقت غير صالح عند السطر ${record.line}.`);
    return Object.freeze({ line: record.line, endLine: record.endLine, ...Object.fromEntries(AUTH_EVENT_FIELDS.map((key, index) => [key, record.values[index]])) });
  }));
}

export function filterAuthEvents(rows, filters = {}) {
  const query = typeof filters.query === 'string' ? filters.query.slice(0, 256).trim().toLocaleLowerCase('ar') : '';
  const terms = query.split(/\s+/).filter(Boolean);
  return rows.filter(row => {
    if (filters.session && row.session_id !== filters.session) return false;
    if (filters.event && row.event !== filters.event) return false;
    if (filters.result && row.result !== filters.result) return false;
    const searchable = [row.line, ...AUTH_EVENT_FIELDS.map(key => row[key])].join(' ').toLocaleLowerCase('ar');
    return terms.every(term => searchable.includes(term));
  });
}

export function formatEvidenceCitation(rows) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const unique = [...new Map(rows.map(row => [row.line, row])).values()].sort((a, b) => a.line - b.line);
  if (unique.length > MAX_EVIDENCE_ROWS || unique.some(row => !Number.isSafeInteger(row.line) || row.line < 2 || !Number.isSafeInteger(row.endLine) || row.endLine < row.line || AUTH_EVENT_FIELDS.some(key => typeof row[key] !== 'string'))) throw new Error('قرائن السجل غير صالحة.');
  return ['[قرائن من ملف التدريب auth-events.csv]', ...unique.map(row => {
    const reference = row.endLine === row.line ? `السطر ${row.line}` : `السطور ${row.line}–${row.endLine}`;
    return `${reference} | ${AUTH_EVENT_FIELDS.map(key => `${key}: ${row[key]}`).join(' | ')}`;
  })].join('\n');
}

export function createEvidenceViewState() {
  return { query: '', session: '', event: '', result: '', selected: new Set() };
}

async function readBoundedResponse(response) {
  if (!response.ok) throw new Error('تعذّر تحميل ملف التدريب. أعد المحاولة عند الاتصال.');
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_EVIDENCE_BYTES) throw new Error('ملف السجلات أكبر من الحد المسموح.');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_EVIDENCE_BYTES) throw new Error('ملف السجلات أكبر من الحد المسموح.');
    return text;
  }
  const reader = response.body.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_EVIDENCE_BYTES) { await reader.cancel(); throw new Error('ملف السجلات أكبر من الحد المسموح.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

let cachedRows;

/** Mount only within the current owner/stage; call the disposer before replacing it. */
export function mountEvidenceWorkbench(container, { viewState = createEvidenceViewState(), onAppend = () => false } = {}) {
  const document = container.ownerDocument;
  let disposed = false, request = 0, controller, rows = [];
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const section = element('section', undefined, 'evidence-workbench');
  section.setAttribute('aria-label', 'قارئ سجلات التدريب');
  const title = element('h2', 'حلّل السجلات داخل المتصفح');
  const intro = element('p', 'اقرأ ملف التدريب الاصطناعي، وابحث عن الأحداث، ثم حدّد القرائن التي تدعم استنتاجك. يمكنك إضافة النص المحدد إلى نتائج هذه المرحلة وكتابة تفسيرك بجانبه.', 'evidence-intro');
  const source = element('a', 'فتح الملف الأصلي auth-events.csv ↗');
  source.href = SOURCE_URL.href; source.target = '_blank'; source.rel = 'noopener';
  const controls = element('div', undefined, 'evidence-controls');
  const searchLabel = element('label', 'ابحث في حقول السجل');
  const search = element('input');
  search.type = 'search'; search.maxLength = 256; search.placeholder = 'المستخدم، الجلسة، الجهاز أو عنوان المصدر…';
  search.dataset.evidenceSearch = ''; search.value = viewState.query;
  searchLabel.append(search); controls.append(searchLabel);
  const selectors = {};
  for (const [key, label] of [['session', 'الجلسة'], ['event', 'نوع الحدث'], ['result', 'نتيجة الحدث']]) {
    const wrapper = element('label', label), select = element('select');
    select.setAttribute(`data-evidence-filter-${key}`, '');
    wrapper.append(select); controls.append(wrapper); selectors[key] = select;
    select.addEventListener('change', () => { if (disposed) return; viewState[key] = select.value; renderRows(); });
  }
  const status = element('p', 'جارٍ تحميل سجلات التدريب…', 'evidence-status');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.dataset.evidenceStatus = '';
  const retry = element('button', 'إعادة تحميل السجلات', 'secondary');
  retry.type = 'button'; retry.hidden = true; retry.dataset.evidenceRetry = '';
  const list = element('div', undefined, 'evidence-events'); list.dataset.evidenceEvents = '';
  list.setAttribute('role', 'region'); list.setAttribute('aria-label', 'أحداث السجل؛ قائمة قابلة للتمرير'); list.tabIndex = 0;
  const actions = element('div', undefined, 'evidence-actions');
  const append = element('button', 'إضافة القرائن المحددة إلى النتائج', 'primary');
  append.type = 'button'; append.disabled = true; append.dataset.evidenceAppend = '';
  const clear = element('button', 'مسح الاختيار', 'secondary');
  clear.type = 'button'; clear.disabled = true; clear.dataset.evidenceClear = '';
  const selected = element('span', 'لم تُحدّد قرائن بعد.', 'evidence-selected'); selected.dataset.evidenceSelected = '';
  const feedback = element('p', '', 'evidence-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.dataset.evidenceFeedback = '';
  actions.append(append, clear, selected);
  section.append(title, intro, source, controls, status, retry, list, actions, feedback);
  container.replaceChildren(section);

  function updateSelected() {
    const count = rows.filter(row => viewState.selected.has(row.line)).length;
    selected.textContent = count ? `${count} قرائن محددة؛ يشمل العدد الصفوف المخفية بالمرشحات.` : 'لم تُحدّد قرائن بعد.';
    append.disabled = count === 0; clear.disabled = count === 0;
  }
  function renderRows() {
    if (disposed) return;
    const filtered = filterAuthEvents(rows, viewState);
    status.textContent = `عرض ${filtered.length} من ${rows.length} أحداث. الأوقات بتوقيت UTC، وترقيم السطور من الملف الأصلي.`;
    list.replaceChildren();
    if (!filtered.length) list.append(element('p', 'لا توجد أحداث تطابق البحث والمرشحات. جرّب تعديل البحث أو اختر «الكل».', 'evidence-empty'));
    for (const row of filtered) {
      const card = element('article', undefined, 'evidence-event'); card.dataset.evidenceLine = String(row.line);
      const choose = element('label', undefined, 'evidence-choose'), checkbox = element('input');
      checkbox.type = 'checkbox'; checkbox.dataset.evidenceSelect = String(row.line); checkbox.checked = viewState.selected.has(row.line);
      const line = row.line === row.endLine ? `السطر ${row.line}` : `السطور ${row.line}–${row.endLine}`;
      choose.append(checkbox, element('strong', `${line} · تحديد كقرينة`));
      checkbox.addEventListener('change', () => {
        if (disposed) return;
        if (checkbox.checked) viewState.selected.add(row.line); else viewState.selected.delete(row.line);
        updateSelected(); feedback.textContent = '';
      });
      const fields = element('dl', undefined, 'evidence-fields');
      for (const key of AUTH_EVENT_FIELDS) {
        const pair = element('div'), label = element('dt', labels[key]), value = element('dd', row[key]);
        value.dir = 'ltr'; pair.append(label, value); fields.append(pair);
      }
      card.append(choose, fields); list.append(card);
    }
    updateSelected();
  }
  function configureFilters() {
    for (const [key, field] of [['session', 'session_id'], ['event', 'event'], ['result', 'result']]) {
      const select = selectors[key]; select.replaceChildren();
      const all = element('option', 'الكل'); all.value = ''; select.append(all);
      for (const value of [...new Set(rows.map(row => row[field]))].sort()) {
        const option = element('option', value); option.value = value; select.append(option);
      }
      if (!rows.some(row => row[field] === viewState[key])) viewState[key] = '';
      select.value = viewState[key]; select.disabled = false;
    }
    search.disabled = false;
  }
  async function load() {
    const generation = ++request;
    controller?.abort(); controller = new AbortController();
    retry.hidden = true; status.textContent = 'جارٍ تحميل سجلات التدريب…';
    section.setAttribute('aria-busy', 'true');
    search.disabled = true; Object.values(selectors).forEach(select => { select.disabled = true; });
    append.disabled = true; clear.disabled = true;
    try {
      const loaded = cachedRows || parseAuthEventsCSV(await readBoundedResponse(await fetch(SOURCE_URL, { signal: controller.signal, credentials: 'omit' })));
      if (disposed || generation !== request) return;
      cachedRows = loaded; rows = loaded;
      const allowed = new Set(rows.map(row => row.line));
      for (const line of viewState.selected) if (!allowed.has(line)) viewState.selected.delete(line);
      configureFilters(); renderRows();
    } catch (error) {
      if (disposed || generation !== request || error?.name === 'AbortError') return;
      status.textContent = 'تعذّر تحميل سجلات التدريب. يمكنك إعادة المحاولة أو تنزيل الحزمة وقراءتها محليًا.';
      retry.hidden = false;
    } finally {
      if (!disposed && generation === request) section.setAttribute('aria-busy', 'false');
    }
  }
  search.addEventListener('input', () => { if (disposed) return; viewState.query = search.value; renderRows(); });
  clear.addEventListener('click', () => { if (disposed) return; viewState.selected.clear(); feedback.textContent = ''; renderRows(); });
  retry.addEventListener('click', () => { if (!disposed) void load(); });
  append.addEventListener('click', async () => {
    if (disposed) return;
    const citation = formatEvidenceCitation(rows.filter(row => viewState.selected.has(row.line)));
    if (!citation) return;
    append.disabled = true;
    try {
      const added = await onAppend(citation);
      if (!disposed) feedback.textContent = added === false ? 'راجع نتائج المرحلة قبل إضافة هذه القرائن مرة أخرى.' : 'أُضيفت القرائن إلى نتائج المرحلة. اكتب تفسيرك وحدود استنتاجك بجانبها.';
    } catch {
      if (!disposed) feedback.textContent = 'تعذّرت إضافة القرائن. بقي اختيارك متاحًا؛ راجع حالة الحفظ وحاول مجددًا.';
    } finally {
      if (!disposed) updateSelected();
    }
  });
  void load();
  return () => { disposed = true; request++; controller?.abort(); };
}
