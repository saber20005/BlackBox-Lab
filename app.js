import { tracks, errors } from './data.js';
import { parseRoute, routeURL, routeMetadata } from './routes.js';
import { trackEvent, trackPageView } from './analytics.js';
import {
  loadProgress, saveProgress, createInitialState, createBackup, parseBackup,
  MAX_BACKUP_BYTES, MAX_TEXT_LENGTH,
} from './progress.js';

let storage;
try { storage = window.localStorage; } catch { storage = undefined; }
const loaded = loadProgress(storage);
let state = loaded.state;
let saveState = { ok: loaded.ok, message: loaded.message };
const recoveryNotice = loaded.recovered ? loaded.message : '';
let currentView = 'home';
let currentTrack = state.lastActivity?.trackId || tracks[0].id;
let currentStage = state.lastActivity?.stageIndex || 0;
let trackQuery = '';
let trackFilter = 'all';
let errorQuery = '';
let saveTimer;
let toastTimer;
let pendingImport = null;
let importRequest = 0;
let importMessage = '';
let importError = false;
let routeNotice = '';
const titles = { home: 'لوحة التحكم', tracks: 'مسارات التدريب', exercise: 'التمرين الحالي', journal: 'سجل المختبر', backups: 'النسخ والتقارير', troubleshoot: 'حلول الأعطال' };
const content = document.getElementById('content');
const stageKey = (trackId, index) => `${trackId}-${index}`;
const trackById = id => tracks.find(track => track.id === id);
const isDone = (id, index) => Boolean(state.completed[stageKey(id, index)]);
const stageOpen = (id, index) => index === 0 || isDone(id, index - 1);
const trackDone = track => track.stages.filter((_, index) => isDone(track.id, index)).length;
const allStages = tracks.reduce((sum, track) => sum + track.stages.length, 0);
const allChecks = tracks.reduce((sum, track) => sum + track.stages.reduce((count, stage) => count + stage.check.length, 0), 0);
const completedCount = () => tracks.reduce((sum, track) => sum + trackDone(track), 0);
const checkedCount = () => Object.values(state.checks).reduce((sum, checks) => sum + checks.length, 0);
const documentedCount = () => new Set([...Object.keys(state.notes), ...Object.keys(state.results)].filter(key => state.notes[key]?.trim() || state.results[key]?.trim())).size;
const esc = (value = '') => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const percentage = (value, total) => total ? Math.round(value / total * 100) : 0;

function dateLabel(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'تاريخ الحفظ غير مسجّل';
  return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
function toast(message) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.add('hidden'), 3500);
}
function updateSaveStatus(pending = false) {
  const status = document.getElementById('saveStatus');
  status.className = `save-status ${pending ? 'pending' : saveState.ok ? 'saved' : 'error'}`;
  status.textContent = pending ? 'جارٍ حفظ التغييرات…' : saveState.ok ? 'محفوظ على هذا المتصفح' : 'التغييرات في ذاكرة التبويب';
  const draft = document.getElementById('draftStatus');
  if (draft) {
    draft.textContent = pending ? 'جارٍ حفظ المسودة…' : saveState.ok ? 'تم الحفظ محليًا' : 'تعذّر الحفظ الدائم؛ نزّل نسخة قبل إغلاق التبويب';
    draft.className = `draft-status ${saveState.ok ? '' : 'error'}`;
  }
  const notice = document.getElementById('storageNotice');
  notice.classList.toggle('hidden', saveState.ok && !recoveryNotice);
  notice.textContent = saveState.ok ? recoveryNotice : `${saveState.message || 'تعذّر الوصول إلى تخزين المتصفح.'} يمكنك متابعة العمل في هذا التبويب وتنزيل نسخة احتياطية من صفحة النسخ والتقارير.`;
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  state.updatedAt = new Date().toISOString();
  saveState = saveProgress(state, storage);
  updateSaveStatus();
  return saveState.ok;
}
function flushDraft() { if (saveTimer) persist(); }
function queueSave(key) {
  state.stageUpdatedAt[key] = new Date().toISOString();
  clearTimeout(saveTimer);
  updateSaveStatus(true);
  saveTimer = setTimeout(persist, 300);
}
function logActivity(message) {
  state.logs = [...state.logs, { msg: message, at: new Date().toISOString() }].slice(-100);
}
function currentRoute() {
  return { view: currentView, trackId: currentTrack, stageIndex: currentStage };
}
function syncRoute(replace = false) {
  const url = routeURL(currentRoute(), window.location.href);
  if (url.href !== window.location.href) window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
}
function updateMetadata() {
  const metadata = routeMetadata(currentRoute());
  document.title = metadata.title;
  document.querySelector('meta[name="description"]').content = metadata.description;
  document.querySelector('link[rel="canonical"]').href = metadata.canonical;
  document.querySelector('meta[name="robots"]').content = metadata.shouldIndex ? 'index,follow' : 'noindex,follow';
  for (const [key, value] of [['title', metadata.title], ['description', metadata.description], ['url', metadata.canonical]]) {
    document.querySelector(`meta[property="og:${key}"]`).content = value;
    const twitter = document.querySelector(`meta[name="twitter:${key}"]`);
    if (twitter) twitter.content = value;
  }
}
function applyLocation() {
  flushDraft();
  const route = parseRoute(window.location.href, currentTrack);
  currentView = route.view;
  currentTrack = route.trackId;
  currentStage = route.stageIndex;
  routeNotice = route.invalid ? 'الرابط غير مكتمل أو غير صالح. يمكنك اختيار مسار متاح من هنا.' : '';
  if (currentView === 'exercise' && !stageOpen(currentTrack, currentStage)) {
    currentView = 'tracks';
    routeNotice = 'المرحلة الموجودة في الرابط مقفلة على هذا المتصفح. أكمل المرحلة السابقة أولًا؛ بقي تقدّمك كما هو.';
  } else if (currentView === 'exercise') {
    state.lastActivity = { trackId: currentTrack, stageIndex: currentStage, at: new Date().toISOString() };
    persist();
    trackEvent('stage_start', { track_id: currentTrack, stage_index: currentStage });
  }
  if (currentView === 'tracks') trackEvent('track_open', { track_id: currentTrack });
  syncRoute(true);
  render(true);
}
function navigate(view, focus = true) {
  flushDraft();
  routeNotice = '';
  currentView = titles[view] ? view : 'home';
  if (currentView === 'tracks') trackEvent('track_open', { track_id: currentTrack });
  syncRoute();
  render(focus);
}
function openTrack(trackId) {
  if (!trackById(trackId)) return;
  flushDraft();
  currentTrack = trackId;
  currentView = 'tracks';
  routeNotice = '';
  syncRoute();
  trackEvent('track_open', { track_id: trackId });
  render();
  document.getElementById('selectedTrack')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function openStage(trackId, index) {
  flushDraft();
  const track = trackById(trackId);
  if (!track || !Number.isInteger(index) || !track.stages[index] || !stageOpen(trackId, index)) return;
  currentTrack = trackId;
  currentStage = index;
  currentView = 'exercise';
  routeNotice = '';
  state.lastActivity = { trackId, stageIndex: index, at: new Date().toISOString() };
  persist();
  syncRoute();
  trackEvent('stage_start', { track_id: trackId, stage_index: index });
  render(true);
}
function resumeActivity() {
  const last = state.lastActivity;
  if (last && trackById(last.trackId)?.stages[last.stageIndex] && stageOpen(last.trackId, last.stageIndex) && !isDone(last.trackId, last.stageIndex)) return { trackId: last.trackId, index: last.stageIndex };
  const preferred = trackById(last?.trackId || currentTrack);
  const ordered = preferred ? [preferred, ...tracks.filter(track => track.id !== preferred.id)] : tracks;
  for (const track of ordered) {
    const index = track.stages.findIndex((_, stageIndex) => !isDone(track.id, stageIndex) && stageOpen(track.id, stageIndex));
    if (index >= 0) return { trackId: track.id, index };
  }
  return { trackId: last?.trackId || tracks[0].id, index: last?.stageIndex || 0 };
}
function hero(title, description, eyebrow = 'YOUR TRAINING WORKSPACE') {
  return `<section class="hero"><div><div class="eyebrow">${eyebrow}</div><h1 tabindex="-1">${esc(title)}</h1><p>${esc(description)}</p></div><span class="workspace-tag"><span class="dot ok" aria-hidden="true"></span>تدريب منظم · حفظ محلي</span></section>`;
}
function progressBar(value, total, label) {
  return `<progress class="native-progress" max="${total}" value="${value}" aria-label="${esc(label)}">${percentage(value, total)}%</progress>`;
}
function partnerURL(caseId = null) {
  const url = new URL('https://cybertracelab.dev/');
  if (caseId) url.searchParams.set('case', caseId);
  url.searchParams.set('utm_source', 'blackbox');
  url.searchParams.set('utm_medium', 'referral');
  url.searchParams.set('utm_campaign', 'training_path');
  return url.href;
}
function relatedInvestigation(track) {
  const related = { webgoat: ['INC-1101', 'حقن SQL وتسريب بيانات العملاء'], proxy: ['INC-1101', 'حقن SQL وتسريب بيانات العملاء'], network: ['INC-1104', 'تسريب بيانات عبر DNS'] }[track.id];
  if (!related) return '';
  return `<aside class="partner-panel section" aria-label="تحقيق مرتبط بالمهارة"><div><span class="eyebrow">CYBERTRACE / طبّق مهارة التحليل</span><h3>${esc(related[1])}</h3><p>حلّل سجلات حادثة مرتبطة بهذا المسار واتخذ قرار الاستجابة من المتصفح.</p></div><a class="secondary partner-link" href="${esc(partnerURL(related[0]))}" data-partner="track">جرّب التحقيق في CyberTrace ←</a></aside>`;
}
function partnerIntroduction() {
  return `<section class="partner-panel section" aria-labelledby="partnerTitle"><div><span class="eyebrow">CYBERTRACE / تحليل الحوادث</span><h2 id="partnerTitle">من المهارة إلى قرار الاستجابة</h2><p>تدرّب على تحقيقات أمنية تفاعلية بالعربية: اقرأ السجلات، واختر الدليل، وراجع قرارك. تبدأ التجربة من المتصفح.</p></div><a class="secondary partner-link" href="${esc(partnerURL())}" data-partner="home">استكشف CyberTrace ←</a></section>`;
}
function home() {
  const done = completedCount();
  const next = resumeActivity();
  const track = trackById(next.trackId);
  const stage = track.stages[next.index];
  const allDone = done === allStages;
  const hasProgress = Boolean(state.lastActivity || done || checkedCount() || documentedCount());
  return `${hero('مساحة تتقدّم معك', 'مسارات عملية واضحة، ملاحظات لا تضيع، وتقرير يجمع ما تعلمته. أكمل من حيث توقفت أو اختر مهارة جديدة.')}<section class="resume-card" aria-labelledby="resumeTitle"><div><span class="eyebrow">${allDone ? 'ALL STAGES COMPLETED' : hasProgress ? 'CONTINUE YOUR PROGRESS' : 'START YOUR FIRST SESSION'}</span><h2 id="resumeTitle">${allDone ? 'أكملت جميع المراحل. حان وقت المراجعة.' : hasProgress ? 'واصل من حيث توقفت' : 'خطوتك الأولى تبدأ هنا'}</h2><p><span>${esc(track.name)}</span><span aria-hidden="true"> / </span>${esc(stage.name)}</p><div class="resume-meta">${state.lastActivity ? `آخر نشاط: ${esc(dateLabel(state.lastActivity.at))}` : `${allStages} مرحلة تدريبية · يمكنك اختيار أي مسار`}</div></div><button type="button" class="primary resume-button" data-open="${track.id}" data-stage="${next.index}">${allDone ? 'مراجعة التدريب' : hasProgress ? 'متابعة التدريب' : 'ابدأ التدريب'} <span aria-hidden="true">←</span></button></section><section class="grid stats" aria-label="تقدمك بالأرقام"><article class="card stat"><span class="stat-label">مراحل أنجزتها</span><strong class="stat-value" data-stat="completed">${done}<span> / ${allStages}</span></strong>${progressBar(done, allStages, 'المراحل المكتملة')}<span class="stat-foot">${percentage(done, allStages)}% من رحلتك</span></article><article class="card stat"><span class="stat-label">بنود تحقّقت منها</span><strong class="stat-value" data-stat="checks">${checkedCount()}<span> / ${allChecks}</span></strong><span class="stat-foot">خطوات نفّذتها وأشّرت عليها</span></article><article class="card stat"><span class="stat-label">مراحل موثّقة</span><strong class="stat-value" data-stat="notes">${documentedCount()}</strong><span class="stat-foot">نتائج أو ملاحظات كتبتها</span></article><article class="card stat"><span class="stat-label">مسارات متاحة</span><strong class="stat-value">${tracks.length}</strong><span class="stat-foot">اختر المهارة المناسبة لك</span></article></section><div class="grid dashboard-columns"><section class="card"><div class="section-head"><div><h2>مساراتك، بنظرة واحدة</h2><small>ثلاث مراحل لكل مهارة، وخطوة واضحة تليها</small></div><button type="button" class="link-btn" data-nav="tracks">استعرض المسارات ←</button></div>${pathCards(tracks)}</section><aside class="card quick-card"><div class="section-head"><h2>عملك يستحق أن تحتفظ به</h2></div><p>اجمع ملاحظاتك ونتائجك في تقرير، أو انقل تقدّمك إلى متصفح آخر بنسخة احتياطية.</p><button type="button" class="secondary full-width" data-nav="backups">النسخ الاحتياطي والتقارير</button><div class="quick-divider"></div><h3>أحدث نشاط</h3>${recentActivity()}<button type="button" class="link-btn" data-nav="journal">افتح سجل المختبر ←</button></aside></div><section class="card section"><div class="section-head"><div><h2>حالة بيئة التدريب</h2><small>سجّل ما تحقّقت منه في بيئتك المحلية</small></div><span class="badge">تأكيد يدوي</span></div>${statusControls()}</section>${partnerIntroduction()}`;
}
function recentActivity() {
  const recent = [...state.logs].reverse().slice(0, 3);
  return recent.length ? `<ol class="activity-list">${recent.map(item => `<li><span>${esc(item.msg)}</span><time datetime="${esc(item.at)}">${esc(dateLabel(item.at))}</time></li>`).join('')}</ol>` : '<p class="muted">ستظهر هنا المراحل التي تؤكّد إنجازها والتغييرات التي تسجّلها.</p>';
}
function pathCards(list) {
  if (!list.length) return '<div class="empty"><strong>لا توجد مسارات مطابقة</strong><p>جرّب كلمة أخرى أو غيّر مرشّح التقدّم.</p><button type="button" class="secondary" id="clearTrackSearch">مسح البحث والمرشّحات</button></div>';
  return `<div class="paths">${list.map(track => { const count = trackDone(track); return `<button type="button" class="path ${currentTrack === track.id ? 'active' : ''}" data-track="${track.id}" aria-label="فتح مسار ${esc(track.name)}"><span class="path-top"><span class="path-icon" aria-hidden="true">${track.icon}</span><span class="path-count">${count}/${track.stages.length} مراحل</span></span><strong>${esc(track.name)}</strong><span class="path-description">${esc(track.sub)}</span>${progressBar(count, track.stages.length, `تقدم مسار ${track.name}`)}<span class="path-footer">${count === track.stages.length ? 'مكتمل · راجع ما تعلمته' : count ? 'قيد التقدم · تابع رحلتك' : 'جاهز للبدء'}<span aria-hidden="true">←</span></span></button>`; }).join('')}</div>`;
}
function filteredTracks() {
  const query = trackQuery.trim().toLocaleLowerCase('ar');
  return tracks.filter(track => {
    const count = trackDone(track);
    const matchesStatus = trackFilter === 'all' || (trackFilter === 'new' && count === 0) || (trackFilter === 'progress' && count > 0 && count < track.stages.length) || (trackFilter === 'done' && count === track.stages.length);
    const searchable = [track.name, track.sub, ...track.stages.flatMap(stage => [stage.name, stage.goal, stage.guide])].join(' ').toLocaleLowerCase('ar');
    return matchesStatus && (!query || searchable.includes(query));
  });
}
function stageRows(track) {
  return `<div class="stages-list">${track.stages.map((stage, index) => { const done = isDone(track.id, index); const open = stageOpen(track.id, index); const key = stageKey(track.id, index); const checked = state.checks[key]?.length || 0; return `<button type="button" class="stage-row ${done ? 'done' : ''} ${open ? '' : 'locked'}" data-open="${track.id}" data-stage="${index}" ${open ? '' : 'disabled'}><span class="stage-num">${done ? '✓' : String(index + 1).padStart(2, '0')}</span><span><strong>${esc(stage.name)}</strong><small>${esc(stage.goal)}</small><span class="stage-detail">${done ? `أُنجزت: ${esc(dateLabel(state.completed[key]))}` : `${checked}/${stage.check.length} بنود تحقّق`}</span></span><span class="badge ${done ? 'done' : open ? 'current' : ''}">${done ? 'مكتملة' : open ? 'متاحة' : 'أكمل السابقة'}</span></button>`; }).join('')}</div>`;
}
function tracksPage() {
  const track = trackById(currentTrack) || tracks[0];
  const matches = filteredTracks();
  return `${hero('اختر مهارتك التالية', 'ابحث في المسارات ومحتواها، وابدأ بما يناسبك. تُفتح مراحل كل مسار بالتتابع بعد تأكيد إنجازها.')}<section class="card"><div class="search-tools"><div class="field search-field"><label for="trackSearch">ابحث في المسارات والمراحل</label><input class="search" id="trackSearch" type="search" placeholder="مثل Nmap، التقاط الحزم، الويب…" value="${esc(trackQuery)}"></div><div class="field filter-field"><label for="trackFilter">حالة التقدّم</label><select id="trackFilter" class="select-control">${[['all', 'كل المسارات'], ['new', 'لم تبدأ بعد'], ['progress', 'قيد التقدم'], ['done', 'مكتملة']].map(([value, label]) => `<option value="${value}" ${trackFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><span class="results-count" role="status">${matches.length} من ${tracks.length} مسارات</span></div>${pathCards(matches)}</section><section class="card section" id="selectedTrack"><div class="track-head"><div><div class="eyebrow">TRAINING PATH / ${track.icon}</div><h2>${esc(track.name)}</h2><p>${esc(track.sub)}</p></div><div class="track-actions"><span class="badge">${trackDone(track)}/${track.stages.length} مراحل مكتملة</span><button type="button" class="secondary compact" data-share-track="${track.id}">نسخ رابط المسار</button></div></div>${stageRows(track)}</section>${relatedInvestigation(track)}`;
}
function exercisePage() {
  const track = trackById(currentTrack);
  if (!track?.stages[currentStage] || !stageOpen(track.id, currentStage)) {
    return `${hero('اختر مرحلة متاحة', 'ابدأ بالمرحلة الأولى أو أكمل المرحلة السابقة داخل هذا المسار.')}<button type="button" class="primary" data-nav="tracks">فتح المسارات</button>`;
  }
  const stage = track.stages[currentStage];
  const key = stageKey(track.id, currentStage);
  const checks = state.checks[key] || [];
  const done = isDone(track.id, currentStage);
  return `<div class="exercise-breadcrumb"><button type="button" class="link-btn" data-nav="tracks">المسارات</button><span aria-hidden="true">/</span><span>${esc(track.name)}</span><span aria-hidden="true">/</span><span>المرحلة ${currentStage + 1} من ${track.stages.length}</span></div><section class="track-head exercise-heading"><div><div class="eyebrow">${done ? 'COMPLETED / REVIEW MODE' : 'FOCUS SESSION'}</div><h1 tabindex="-1">${esc(stage.name)}</h1><p>${esc(stage.goal)}</p></div><div class="track-actions"><span class="badge ${done ? 'done' : 'current'}">${done ? 'مكتملة' : 'قيد التدريب'}</span><button type="button" class="secondary compact" data-share-stage="${track.id}" data-stage-index="${currentStage}">نسخ رابط المرحلة</button></div></section><div class="exercise"><section class="card exercise-main"><div class="box-title first-title">ابدأ بفهم المهمة</div><p class="stage-guide">${esc(stage.guide)}</p><h2 class="box-title">أوامر وعناوين التمرين</h2>${stage.commands.map(([label, command]) => `<div class="field command-field"><span class="command-label">${esc(label)}</span><div class="cmd"><button type="button" class="copy" data-copy="${esc(command)}" aria-label="نسخ: ${esc(label)}">نسخ</button><code>${esc(command)}</code></div></div>`).join('')}<p class="context-note">الموقع يقدّم التعليمات والتوثيق؛ تنفيذ الأوامر والتحقق من النتائج يتمّان في بيئتك المحلية.</p><div class="section-head notes-heading"><h2>دوّن ما توصلت إليه</h2><span class="badge">حفظ تلقائي</span></div><div class="field"><label for="stageResult">النتائج والأدلة</label><textarea id="stageResult" class="notearea" data-result="${key}" maxlength="${MAX_TEXT_LENGTH}" placeholder="المخرجات المهمة، ما الذي لاحظته، وكيف تحقّقت منه…">${esc(state.results[key] || '')}</textarea></div><div class="field"><label for="stageNotes">ملاحظات وخطوات المتابعة</label><textarea id="stageNotes" class="notearea" data-notes="${key}" maxlength="${MAX_TEXT_LENGTH}" placeholder="ما الذي تعلّمته؟ وما الذي ستراجعه في المرة القادمة؟">${esc(state.notes[key] || '')}</textarea></div><div class="save-line"><span id="draftStatus" class="draft-status" role="status" aria-live="polite"></span><button type="button" class="secondary" id="saveDraft">حفظ الآن</button></div></section><aside class="card check-card"><div class="section-head"><div><h2>خطوات إنجازك</h2><small>أشّر على البنود بعد تنفيذها</small></div><span class="badge" id="checkCount">${checks.length}/${stage.check.length}</span></div><div class="steps">${stage.check.map((label, index) => `<label class="step ${checks.includes(index) ? 'done' : ''}"><input type="checkbox" data-check="${key}" data-index="${index}" ${checks.includes(index) ? 'checked' : ''} ${done ? 'disabled' : ''}><span>${esc(label)}</span></label>`).join('')}</div><p class="context-note">التأشير يحفظ الخطوات. تأكيد المرحلة يسجّل إنجازها ويفتح المرحلة التالية.</p><button type="button" class="primary confirm" id="confirmStage" ${done || checks.length < stage.check.length ? 'disabled' : ''}>${done ? '✓ المرحلة مكتملة' : 'تأكيد إكمال المرحلة'}</button>${done ? `<p class="completion-date">أكّدت إنجازها في ${esc(dateLabel(state.completed[key]))}</p>${currentStage + 1 < track.stages.length ? `<button type="button" class="secondary full-width" data-open="${track.id}" data-stage="${currentStage + 1}">الانتقال إلى المرحلة التالية ←</button>` : '<button type="button" class="secondary full-width" data-nav="tracks">اختيار مسار آخر ←</button>'}` : ''}<div class="mini-progress"><span>تقدّم المسار</span><strong>${trackDone(track)}/${track.stages.length}</strong>${progressBar(trackDone(track), track.stages.length, `تقدم مسار ${track.name}`)}</div></aside></div>`;
}
function statusControls() {
  const devices = [['kali', 'Kali Linux'], ['windows', 'Windows Host'], ['target', 'الآلة الهدف'], ['network', 'شبكة المختبر']];
  return `<div class="device-grid">${devices.map(([key, label]) => `<div class="status-row"><label for="device-${key}"><strong>${label}</strong><small>تأكيد يدوي</small></label><select id="device-${key}" class="select-control" data-device="${key}">${(key === 'network' ? [['unknown', 'لم أتحقق بعد'], ['isolated', 'Host-only معزول'], ['notset', 'غير جاهز']] : [['unknown', 'لم أتحقق بعد'], ['on', 'يعمل'], ['off', 'متوقف']]).map(([value, text]) => `<option value="${value}" ${state.devices[key] === value ? 'selected' : ''}>${text}</option>`).join('')}</select></div>`).join('')}</div><p class="context-note">هذه الحالات من إدخالك؛ لا يستطيع المتصفح استشعار VirtualBox أو حالة شبكة المختبر.</p>`;
}
function journalEntries() {
  const entries = [];
  for (const track of tracks) for (let index = 0; index < track.stages.length; index++) {
    const key = stageKey(track.id, index);
    if (state.notes[key] || state.results[key] || isDone(track.id, index)) entries.push({ track, index, key, at: state.stageUpdatedAt[key] || state.completed[key] || null });
  }
  return entries.sort((a, b) => (new Date(b.at || 0).getTime() || 0) - (new Date(a.at || 0).getTime() || 0));
}
function journalPage() {
  const entries = journalEntries();
  return `${hero('من خطوات متفرّقة إلى معرفة موثّقة', 'نتائجك وملاحظاتك محفوظة هنا، بالتاريخ الفعلي عند توفره. عدّل أي مرحلة أو اجمع عملك في تقرير.')}<div class="section-head"><h2>${entries.length} مراحل في سجلك</h2><button type="button" class="secondary" data-report>تنزيل تقرير Markdown</button></div>${entries.length ? `<section class="journal-grid">${entries.map(({ track, index, key, at }) => `<article class="card journal-entry"><div class="section-head"><span class="eyebrow">${esc(track.name)}</span><span class="badge ${isDone(track.id, index) ? 'done' : 'current'}">${isDone(track.id, index) ? 'مكتملة' : 'مسودة'}</span></div><h3>${esc(track.stages[index].name)}</h3><time datetime="${esc(at || '')}">${esc(dateLabel(at))}</time>${state.results[key] ? `<div class="journal-text"><strong>النتائج</strong><p>${esc(state.results[key])}</p></div>` : ''}${state.notes[key] ? `<div class="journal-text"><strong>الملاحظات</strong><p>${esc(state.notes[key])}</p></div>` : ''}<button type="button" class="link-btn" data-open="${track.id}" data-stage="${index}" ${stageOpen(track.id, index) ? '' : 'disabled'}>فتح المرحلة ←</button></article>`).join('')}</section>` : '<section class="card empty"><div class="empty-mark" aria-hidden="true">▧</div><h2>ابدأ أول صفحة في سجلّك</h2><p>اكتب نتيجة أو ملاحظة داخل أي تمرين، وستُحفظ تلقائيًا هنا.</p><button type="button" class="primary" data-nav="tracks">اختيار تمرين</button></section>'}`;
}
function backupsPage() {
  const candidate = pendingImport;
  const importStats = candidate ? { completed: Object.keys(candidate.completed).length, documented: new Set([...Object.keys(candidate.notes), ...Object.keys(candidate.results)].filter(key => candidate.notes[key] || candidate.results[key])).size } : null;
  return `${hero('احتفظ بعملك، أينما تتدرّب', 'نزّل نسخة قابلة للاستعادة أو تقريرًا للقراءة والمشاركة. بياناتك محلية؛ النسخة الاحتياطية تساعدك على نقلها إلى متصفح آخر.')}<div class="grid backup-grid"><section class="card backup-card"><span class="feature-symbol" aria-hidden="true">↓</span><h2>نسخة احتياطية كاملة</h2><p>ملف JSON يحتوي على الخطوات والملاحظات والنتائج والتقدّم وآخر نشاط وحالات بيئتك.</p><dl class="backup-summary"><div><dt>مراحل مكتملة</dt><dd>${completedCount()} / ${allStages}</dd></div><div><dt>مراحل موثّقة</dt><dd>${documentedCount()}</dd></div><div><dt>آخر حفظ</dt><dd>${esc(dateLabel(state.updatedAt))}</dd></div></dl><button type="button" class="primary" data-backup>تنزيل نسخة JSON</button></section><section class="card backup-card"><span class="feature-symbol" aria-hidden="true">↑</span><h2>استعادة نسخة محفوظة</h2><p>اختر نسخة BLACKBOX بصيغة JSON. تُفحص البيانات أولًا، ثم تؤكّد الاستعادة قبل استبدال تقدّمك الحالي.</p><label class="file-label" for="importFile">اختر ملف النسخة الاحتياطية</label><input id="importFile" class="file-input" type="file" accept=".json,application/json" aria-describedby="importHint importStatus"><small id="importHint" class="muted">حتى ${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB · تقبل النسخ القديمة من هذا المختبر أيضًا</small><p id="importStatus" class="import-status ${importError ? 'error' : ''}" role="${importError ? 'alert' : 'status'}">${esc(importMessage)}</p>${candidate ? `<div class="import-preview"><strong>النسخة جاهزة للاستعادة</strong><p>${importStats.completed} مراحل مكتملة · ${importStats.documented} مراحل موثّقة</p><p>ستستبدل هذه النسخة البيانات الحالية. ننصح بتنزيل نسختك الحالية قبل المتابعة.</p><div class="button-row"><button type="button" class="primary" id="confirmImport">استعادة هذه النسخة</button><button type="button" class="secondary" id="cancelImport">إلغاء</button></div></div>` : ''}</section></div><section class="card report-card section"><div><span class="eyebrow">TRAINING REPORT</span><h2>تقرير يروي ما أنجزته</h2><p>ملف Markdown مرتب حسب المسار، ويشمل المراحل وحالتها وبنود التحقّق ونتائجك وملاحظاتك وتواريخ الإنجاز.</p></div><button type="button" class="secondary" data-report>تنزيل التقرير</button></section><section class="card reset-card section"><div><h2>بداية جديدة على هذا المتصفح</h2><p>مسح البيانات يزيل تقدّمك وملاحظاتك هنا. يمكنك الاحتفاظ بها بتنزيل نسخة أولًا.</p></div><button type="button" class="secondary danger" id="resetProgress">مسح البيانات المحلية</button></section>`;
}
function troublePage() {
  const query = errorQuery.trim().toLocaleLowerCase('ar');
  const list = errors.filter(item => !query || item.join(' ').toLocaleLowerCase('ar').includes(query));
  return `${hero('حلّ العائق، وواصل التدريب', 'إرشادات عملية للأعطال الشائعة في بيئتك المحلية وأدوات المختبر.')}<div class="section-head"><h2>دليل حلول الأعطال</h2><div class="field"><label for="errorSearch">ابحث عن المشكلة</label><input type="search" class="search" id="errorSearch" placeholder="مثل WebGoat أو عنوان IP…" value="${esc(errorQuery)}"></div></div><div class="error-grid">${list.map(([title, description]) => `<article class="error-card"><h3>${esc(title)}</h3><p>${esc(description)}</p></article>`).join('') || '<div class="card empty"><h2>لم نجد نتيجة مطابقة</h2><p>جرّب اسم الأداة أو وصفًا أقصر للمشكلة.</p></div>'}</div>`;
}
function render(focus = false) {
  updateMetadata();
  document.querySelectorAll('#nav [data-view]').forEach(button => {
    const active = button.dataset.view === currentView || (currentView === 'exercise' && button.dataset.view === 'tracks');
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  document.getElementById('crumb').textContent = titles[currentView];
  const count = completedCount();
  document.getElementById('sideProgress').textContent = `${count} / ${allStages}`;
  document.getElementById('sideProgressBar').value = count;
  const pages = { home, tracks: tracksPage, exercise: exercisePage, journal: journalPage, backups: backupsPage, troubleshoot: troublePage };
  content.innerHTML = `${routeNotice ? `<div class="route-notice" role="status">${esc(routeNotice)}</div>` : ''}${pages[currentView]()}`;
  bind();
  updateSaveStatus(Boolean(saveTimer));
  trackPageView();
  if (focus) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    content.querySelector('h1')?.focus({ preventScroll: true });
  }
}
function download(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportBackup() {
  flushDraft();
  try {
    const backup = createBackup(state);
    download(JSON.stringify(backup, null, 2), 'application/json;charset=utf-8', `blackbox-backup-${new Date().toISOString().slice(0, 10)}.json`);
    trackEvent('backup_export', { format: 'json' });
    toast('جهّزنا نسختك الاحتياطية للتنزيل');
  } catch (error) { toast(error.message || 'تعذّر تجهيز النسخة الاحتياطية'); }
}
function reportMarkdown() {
  const lines = ['# تقرير التدريب — BLACKBOX', '', `تاريخ إنشاء التقرير: ${new Date().toISOString()}`, '', `المراحل المكتملة: ${completedCount()} / ${allStages}`, `بنود التحقق المنجزة: ${checkedCount()} / ${allChecks}`, `المراحل الموثّقة: ${documentedCount()}`, '', '## حالة البيئة — إدخال يدوي', ''];
  for (const [key, label] of [['kali', 'Kali Linux'], ['windows', 'Windows Host'], ['target', 'الآلة الهدف'], ['network', 'شبكة المختبر']]) lines.push(`- ${label}: ${state.devices[key]}`);
  for (const track of tracks) {
    lines.push('', `## ${track.name}`, '', track.sub);
    track.stages.forEach((stage, index) => {
      const key = stageKey(track.id, index);
      lines.push('', `### ${index + 1}. ${stage.name}`, '', `الحالة: ${isDone(track.id, index) ? 'مكتملة' : 'لم تؤكّد بعد'}`);
      if (state.completed[key]) lines.push(`تاريخ الإنجاز: ${state.completed[key]}`);
      if (state.stageUpdatedAt[key]) lines.push(`آخر تعديل: ${state.stageUpdatedAt[key]}`);
      lines.push('', stage.goal, '', 'قائمة التحقق:');
      stage.check.forEach((label, item) => lines.push(`- [${state.checks[key]?.includes(item) ? 'x' : ' '}] ${label}`));
      if (state.results[key]) lines.push('', '#### النتائج والأدلة', '', state.results[key]);
      if (state.notes[key]) lines.push('', '#### الملاحظات وخطوات المتابعة', '', state.notes[key]);
    });
  }
  return `${lines.join('\n')}\n`;
}
function exportReport() {
  flushDraft();
  download(reportMarkdown(), 'text/markdown;charset=utf-8', `blackbox-report-${new Date().toISOString().slice(0, 10)}.md`);
  trackEvent('report_export', { format: 'markdown' });
  toast('جهّزنا تقرير التدريب للتنزيل');
}
async function readImport(file) {
  const requestId = ++importRequest;
  flushDraft();
  pendingImport = null;
  importMessage = file ? 'جارٍ فحص النسخة الاحتياطية…' : '';
  importError = false;
  if (currentView === 'backups') render();
  if (!file) return;
  try {
    if (file.size > MAX_BACKUP_BYTES) throw new Error(`حجم الملف يتجاوز ${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB.`);
    const contents = await file.text();
    if (requestId !== importRequest) return;
    pendingImport = parseBackup(contents);
    importMessage = 'نجح فحص الملف. راجع الملخص ثم اضغط استعادة.';
    importError = false;
  } catch (error) {
    if (requestId !== importRequest) return;
    importMessage = `${error.message || 'تعذّر قراءة الملف.'} لم تتغيّر بياناتك الحالية.`;
    importError = true;
  }
  if (currentView === 'backups') render();
}
function confirmImport() {
  if (!pendingImport) return;
  const result = saveProgress(pendingImport, storage);
  if (!result.ok) {
    importMessage = `${result.message} لم تتغيّر بياناتك الحالية؛ احتفظ بالنسخة وحاول بعد إتاحة التخزين.`;
    importError = true;
    render();
    return;
  }
  state = pendingImport;
  trackEvent('backup_restore', { completed_count: Object.keys(state.completed).length });
  importRequest += 1;
  pendingImport = null;
  saveState = result;
  importMessage = 'تمت استعادة النسخة بنجاح.';
  importError = false;
  currentTrack = state.lastActivity?.trackId || tracks[0].id;
  currentStage = state.lastActivity?.stageIndex || 0;
  navigate('home');
  toast('تمت استعادة تقدّمك وملاحظاتك بنجاح');
}
function refreshSearch(id, value, position) {
  render();
  const input = document.getElementById(id);
  input.focus({ preventScroll: true });
  if (typeof position === 'number' && input.type !== 'search') input.setSelectionRange(position, position);
}
function bind() {
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => navigate(button.dataset.view));
  document.querySelectorAll('[data-nav]').forEach(button => button.onclick = () => navigate(button.dataset.nav));
  document.querySelectorAll('[data-track]').forEach(button => button.onclick = () => openTrack(button.dataset.track));
  document.querySelectorAll('[data-open]').forEach(button => button.onclick = () => openStage(button.dataset.open, Number(button.dataset.stage)));
  document.querySelectorAll('[data-device]').forEach(select => select.onchange = () => { state.devices[select.dataset.device] = select.value; logActivity(`تحديث حالة بيئة التدريب: ${select.options[select.selectedIndex].text}`); persist(); });
  document.querySelectorAll('[data-result], [data-notes]').forEach(input => input.addEventListener('input', () => {
    const key = input.dataset.result || input.dataset.notes;
    const target = input.dataset.result ? state.results : state.notes;
    target[key] = input.value;
    queueSave(key);
  }));
  document.querySelectorAll('[data-check]').forEach(input => input.addEventListener('change', () => {
    const key = input.dataset.check;
    const index = Number(input.dataset.index);
    const previous = state.checks[key] || [];
    state.checks[key] = input.checked ? [...new Set([...previous, index])].sort((a, b) => a - b) : previous.filter(item => item !== index);
    state.stageUpdatedAt[key] = new Date().toISOString();
    persist();
    input.closest('.step').classList.toggle('done', input.checked);
    const stage = trackById(currentTrack).stages[currentStage];
    document.getElementById('checkCount').textContent = `${state.checks[key].length}/${stage.check.length}`;
    document.getElementById('confirmStage').disabled = state.checks[key].length < stage.check.length;
  }));
  document.getElementById('confirmStage')?.addEventListener('click', () => {
    const track = trackById(currentTrack);
    const key = stageKey(currentTrack, currentStage);
    if (!stageOpen(currentTrack, currentStage) || isDone(currentTrack, currentStage) || state.checks[key]?.length !== track.stages[currentStage].check.length) return;
    flushDraft();
    const timestamp = new Date().toISOString();
    state.completed[key] = timestamp;
    state.stageUpdatedAt[key] = timestamp;
    logActivity(`إنجاز مرحلة: ${track.name} — ${track.stages[currentStage].name}`);
    persist();
    trackEvent('stage_complete', { track_id: currentTrack, stage_index: currentStage });
    render();
    toast(currentStage + 1 < track.stages.length ? 'سُجّل إنجازك، والمرحلة التالية متاحة الآن' : 'أكملت هذا المسار. أحسنت التوثيق!');
  });
  document.getElementById('saveDraft')?.addEventListener('click', () => { persist(); toast(saveState.ok ? 'تم حفظ الملاحظات والنتائج محليًا' : saveState.message); });
  document.querySelectorAll('[data-copy]').forEach(button => button.onclick = async () => {
    try { await navigator.clipboard.writeText(button.dataset.copy); toast('نُسخ الأمر'); }
    catch { toast('تعذّر النسخ التلقائي؛ يمكنك تحديد نص الأمر ونسخه'); }
  });
  document.querySelectorAll('[data-share-track], [data-share-stage]').forEach(button => button.onclick = async () => {
    const route = button.dataset.shareStage
      ? { view: 'exercise', trackId: button.dataset.shareStage, stageIndex: Number(button.dataset.stageIndex) }
      : { view: 'tracks', trackId: button.dataset.shareTrack };
    const url = routeURL(route, 'https://blackboxlab.dev/', { preserveCampaign: false }).href;
    try { await navigator.clipboard.writeText(url); toast('نُسخ الرابط المباشر، ويمكن فتحه على أي جهاز'); }
    catch { toast('تعذّر النسخ التلقائي؛ يمكنك مشاركة الرابط الموجود في شريط العنوان'); }
  });
  document.querySelectorAll('[data-partner]').forEach(link => link.addEventListener('click', () => {
    flushDraft();
    trackEvent('partner_click', { destination: 'cybertrace', context: link.dataset.partner });
  }));
  document.getElementById('trackSearch')?.addEventListener('input', event => { trackQuery = event.target.value; refreshSearch('trackSearch'); });
  document.getElementById('trackFilter')?.addEventListener('change', event => { trackFilter = event.target.value; render(); document.getElementById('trackFilter')?.focus(); });
  document.getElementById('clearTrackSearch')?.addEventListener('click', () => { trackQuery = ''; trackFilter = 'all'; render(); document.getElementById('trackSearch')?.focus(); });
  document.getElementById('errorSearch')?.addEventListener('input', event => { errorQuery = event.target.value; refreshSearch('errorSearch'); });
  document.querySelectorAll('[data-backup]').forEach(button => button.onclick = exportBackup);
  document.querySelectorAll('[data-report]').forEach(button => button.onclick = exportReport);
  document.getElementById('importFile')?.addEventListener('change', event => readImport(event.target.files?.[0]));
  document.getElementById('confirmImport')?.addEventListener('click', confirmImport);
  document.getElementById('cancelImport')?.addEventListener('click', () => { importRequest += 1; pendingImport = null; importMessage = 'أُلغيت الاستعادة. بياناتك الحالية محفوظة.'; importError = false; render(); });
  document.getElementById('resetProgress')?.addEventListener('click', () => {
    if (!window.confirm('سيُمسح التقدم والملاحظات من هذا المتصفح. هل نزّلت نسخة احتياطية وتريد بدء رحلة جديدة؟')) return;
    const fresh = createInitialState();
    const result = saveProgress(fresh, storage);
    if (!result.ok) { toast(`${result.message} لم يتم مسح بياناتك.`); return; }
    state = fresh;
    saveState = result;
    importRequest += 1;
    pendingImport = null;
    currentTrack = tracks[0].id;
    currentStage = 0;
    navigate('home');
    toast('بدأت مساحة تدريب جديدة على هذا المتصفح');
  });
}

document.getElementById('quickBackup').addEventListener('click', exportBackup);
document.querySelector('.brand').addEventListener('click', event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate('home');
});
window.addEventListener('beforeunload', flushDraft);
window.addEventListener('popstate', applyLocation);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDraft(); });
applyLocation();
