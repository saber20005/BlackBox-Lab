import { tracks, errors } from './data.js';
import { readBbPreferences, saveBbPreferences, applyBbPreferences, normalizeBbPreferences } from './assets/modules/preferences/ui-preferences.js';
import { parseRoute, routeURL, routeMetadata, primaryView } from './routes.js';
import { trackEvent, trackPageView } from './analytics.js';
import { createAccountSync } from './account-sync.js';
import { mountAccountUI } from './account-ui.js';
import { accountConfig } from './account-config.js';
import { gradingAvailable, startVerifiedGrading, submitVerifiedAnswer } from './verified-grading-client.js';
import { linkedSkillsPage } from './linked-skills-ui.js';
import { trainingPlanPage, trainingPlanSummary } from './training-plan-ui.js';
import { getRelatedCaseIds } from './training-plan.js';
import { CASE_META } from './cybertrace-catalog.js';
import { appendDocumentationTemplate, hasMeaningfulDocumentation } from './assets/modules/training/documentation-templates.js';
import {
  loadProgress, saveProgress, createInitialState, createBackup, parseBackup,
  MAX_BACKUP_BYTES, MAX_TEXT_LENGTH,
} from './progress.js';

let storage;
try { storage = window.localStorage; } catch { storage = undefined; }
let displayPreferences = applyBbPreferences(readBbPreferences(storage));
const loaded = loadProgress(storage);
let state = loaded.state;
let saveState = { ok: loaded.ok, message: loaded.message };
let accountStatus = { phase: 'guest', user: null, configured: false, pending: false, syncing: false, conflict: false, message: '', error: null };
let accountController;
let accountUI;
let skillOwnerUid = null;
let gradingSession = null;
let gradingMessage = '';
let gradingBusy = false;
let skillState = { enabled: accountConfig.linkedSkillsEnabled === true, phase: 'guest', receipts: {}, fromCache: false, error: null, message: '' };
const recoveryNotice = loaded.recovered ? loaded.message : '';
let currentView = 'home';
let currentTrack = state.lastActivity?.trackId || tracks[0].id;
let currentStage = state.lastActivity?.stageIndex || 0;
let trackQuery = '';
let trackFilter = 'all';
let errorQuery = '';
let planFocus = 'all';
let planBudget = 30;
let saveTimer;
let toastTimer;
let evidenceDisposer;
let viewGeneration = 0;
let evidenceScope = null;
let evidenceViewState;
const optionalStylePromises = new Map();
let hintController;
let hintScope = null;
let hintViewState;
let renderedContentScope;
const nativePanels = ['[data-training-hints-disclosure]', '[data-training-resources]', '[data-environment-settings]'];
let pendingImport = null;
let importRequest = 0;
let importMessage = '';
let importError = false;
let routeNotice = '';
const titles = { home: 'تدريبي', tracks: 'المسارات', progress: 'تقدّمي', account: 'حسابي', settings: 'الإعدادات', plan: 'خطة جلستك', skills: 'المهارات المترابطة', exercise: 'التمرين الحالي', journal: 'سجل المختبر', backups: 'النسخ والتقارير', troubleshoot: 'حلول الأعطال' };
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
const documentedCount = (progress = state) => new Set([...Object.keys(progress.notes), ...Object.keys(progress.results)].filter(key => hasMeaningfulDocumentation(progress.notes[key]) || hasMeaningfulDocumentation(progress.results[key]))).size;
const esc = (value = '') => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const percentage = (value, total) => total ? Math.round(value / total * 100) : 0;

function resetSkillOwner(uid) {
  if (uid === skillOwnerUid) return false;
  skillOwnerUid = uid;
  gradingSession = null;
  gradingMessage = '';
  skillState = { enabled: accountConfig.linkedSkillsEnabled === true, phase: uid ? 'loading' : 'guest', receipts: {}, fromCache: false, error: null, message: '' };
  return true;
}
function repaintLinkedSkills() {
  // Receipt updates must never replace a textarea while a draft is being edited.
  if (['home', 'progress', 'skills', 'plan'].includes(currentView)) render();
}
function planOptions() {
  return { focus: planFocus, budget: planBudget, linked: { userUid: accountStatus.user?.uid, ownerUid: skillOwnerUid, accountPhase: accountStatus.phase, state: skillState } };
}
function planPage() {
  return `${hero('جهّز جلسة تناسب وقتك', 'اختر المهارة والوقت التقريبي، ثم ابدأ بخطوة عملية متاحة من تقدّمك الحالي.')} ${trainingPlanPage(state, planOptions())}`;
}
function skillsPage() {
  const enabled = gradingAvailable();
  const loggedIn = Boolean(accountStatus.user && accountStatus.phase !== 'loading');
  const session = gradingSession?.uid === accountStatus.user?.uid ? gradingSession : null;
  const details = !enabled ? 'التقييم الموثق قيد الإعداد. يمكنك متابعة التدريب وتوثيق أدلتك الآن؛ سيظهر خيار التقييم هنا عند إتاحته.' : !loggedIn ? 'سجّل الدخول لبدء تقييم موثق.' : 'أدخل معرّف تحدٍّ متاحاً لحسابك، ثم ابدأ جلسة وأرسل إجابتك.';
  const panel = `<section class="card" aria-labelledby="verified-grading-title"><h2 id="verified-grading-title">التقييم الموثق</h2><p>${esc(details)}</p><form id="verifiedGradingForm" ${!enabled ? 'hidden' : ''}><label for="verifiedCaseId">معرّف التحدي</label><input id="verifiedCaseId" name="caseId" placeholder="INC-0417" maxlength="8" pattern="INC-[0-9]{4}" autocomplete="off" value="${esc(session?.caseId ?? '')}" ${session ? 'readonly' : ''} ${!enabled || !loggedIn || gradingBusy ? 'disabled' : ''} required><label for="verifiedAnswer">الإجابة</label><input id="verifiedAnswer" name="answer" maxlength="256" autocomplete="off" ${!session || gradingBusy ? 'disabled' : ''}><div><button type="button" id="startVerifiedGrading" ${!enabled || !loggedIn || gradingBusy || session ? 'disabled' : ''}>بدء جلسة موثقة</button><button type="submit" ${!enabled || !loggedIn || gradingBusy || !session ? 'disabled' : ''}>إرسال الإجابة للخادم</button></div></form><p id="verifiedGradingStatus" role="status" aria-live="polite">${esc(gradingMessage || (session ? 'الجلسة جاهزة؛ أرسل الإجابة قبل انتهاء صلاحيتها.' : 'النتائج المحلية ليست درجات موثقة.'))}</p></section>`;
  return `${hero('مهاراتك تتقدّم مع تحقيقاتك', 'اجمع أفضل نتائج CyberTrace في حساب BlackBox، وتابع نمو مهارات التحقيق بجانب تدريبك العملي.')}${linkedSkillsPage(skillState, accountStatus.user)}${panel}`;
}

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
  const accountError = Boolean(accountStatus.user && (accountStatus.error || accountStatus.conflict));
  status.className = `save-status ${pending || accountStatus.syncing || accountStatus.phase === 'loading' ? 'pending' : saveState.ok && !accountError ? 'saved' : 'error'}`;
  status.textContent = pending ? 'جارٍ حفظ التغييرات…' : accountStatus.user && accountStatus.phase === 'loading' ? 'جارٍ تحميل تقدّم الحساب…' : !saveState.ok ? 'التغييرات في ذاكرة التبويب' : accountStatus.user ? accountStatus.conflict ? 'تحتاج المزامنة إلى مراجعة' : accountStatus.syncing ? 'جارٍ مزامنة الحساب…' : accountStatus.pending || accountStatus.error ? 'محفوظ هنا · بانتظار المزامنة' : 'محفوظ في حسابك' : 'محفوظ على هذا المتصفح';
  const draft = document.getElementById('draftStatus');
  if (draft) {
    draft.textContent = pending ? 'جارٍ حفظ المسودة…' : !saveState.ok ? 'تعذّر الحفظ المحلي؛ نزّل نسخة قبل إغلاق التبويب' : accountStatus.user ? accountStatus.pending || accountStatus.syncing || accountStatus.error || accountStatus.conflict ? 'حُفظت على هذا الجهاز؛ راجع حالة المزامنة' : 'تم الحفظ في حسابك' : 'تم الحفظ محليًا';
    draft.className = `draft-status ${saveState.ok && !accountError ? '' : 'error'}`;
  }
  const notice = document.getElementById('storageNotice');
  notice.classList.toggle('hidden', saveState.ok && !recoveryNotice);
  notice.textContent = saveState.ok ? recoveryNotice : `${saveState.message || 'تعذّر الوصول إلى تخزين المتصفح.'} يمكنك متابعة العمل في هذا التبويب وتنزيل نسخة احتياطية من صفحة النسخ والتقارير.`;
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  state.updatedAt = new Date().toISOString();
  saveState = accountController ? accountController.save(state) : saveProgress(state, storage);
  updateSaveStatus();
  updateHintAttempt();
  return saveState.ok;
}
function flushDraft() { if (saveTimer) persist(); }
function queueSave(key) {
  state.stageUpdatedAt[key] = new Date().toISOString();
  clearTimeout(saveTimer);
  updateSaveStatus(true);
  updateHintAttempt();
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
function closeWorkspaceTools() {
  const tools = document.getElementById('workspace-tools');
  if (tools) tools.open = false;
}
function applyLocation() {
  closeWorkspaceTools();
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
  closeWorkspaceTools();
  flushDraft();
  routeNotice = '';
  currentView = titles[view] ? view : 'home';
  if (currentView === 'tracks') trackEvent('track_open', { track_id: currentTrack });
  syncRoute();
  render(focus);
}
function openTrack(trackId) {
  if (!trackById(trackId)) return;
  closeWorkspaceTools();
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
  closeWorkspaceTools();
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
  return `<section class="hero"><div><div class="eyebrow">${eyebrow}</div><h1 tabindex="-1">${esc(title)}</h1><p>${esc(description)}</p></div><span class="workspace-tag"><span class="dot ok" aria-hidden="true"></span>تدريب منظم · ${accountStatus.user ? 'حساب التدريب' : 'حفظ محلي'}</span></section>`;
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
  const caseId = { webgoat: 'INC-1101', proxy: 'INC-1101', network: 'INC-1104' }[track.id] || getRelatedCaseIds(track)[0];
  if (!caseId || !Object.hasOwn(CASE_META, caseId)) return '';
  const related = [caseId, CASE_META[caseId].title];
  return `<aside class="partner-panel section" aria-label="تحقيق مرتبط بالمهارة"><div><span class="eyebrow">CYBERTRACE / طبّق مهارة التحليل</span><h3>${esc(related[1])}</h3><p>حلّل سجلات حادثة مرتبطة بهذا المسار واتخذ قرار الاستجابة من المتصفح.</p></div><a class="secondary partner-link" href="${esc(partnerURL(related[0]))}" data-partner="track">جرّب التحقيق في CyberTrace ←</a></aside>`;
}
function trainingKitResources(track) {
  if (track.trainingKit !== 'defense-v1') return '';
  const description = track.id === 'logs' ? 'حلّل السجلات داخل المتصفح في صفحة المرحلة، أو نزّل الحزمة لتحليلها على جهازك. اختر القرائن ثم دوّن استنتاجك مما لاحظته فعليًا.' : 'نزّل الحزمة واستخرج مجلد blackbox-defense، ثم افتح الطرفية داخله. تضم ملفات اصطناعية للتحليل؛ اكتب نتائجك مما لاحظته فعليًا.';
  const requirements = track.id === 'logs' ? 'قارئ السجلات داخل الموقع يعمل على الهاتف والحاسوب دون Python. يتطلب تشغيل أدوات الحزمة محليًا Python 3؛ هذه المسارات لا تحتاج إلى آلة افتراضية.' : 'يتطلب التحليل المحلي Python 3. على Windows يمكنك استخدام py -3 بدل python3. هذه المسارات لا تحتاج إلى آلة افتراضية أو خدمة خارجية.';
  return `<section class="card section training-kit-card" aria-labelledby="trainingKitTitle"><div><span class="eyebrow">OFFLINE EVIDENCE KIT</span><h2 id="trainingKitTitle">ملفات هذا التدريب</h2><p>${esc(description)}</p><small>${esc(requirements)}</small></div><div class="training-kit-actions"><a class="primary" href="./downloads/blackbox-defense-kit.zip" download="blackbox-defense-kit.zip" data-training-kit>تنزيل ملفات التدريب (ZIP)</a><a class="secondary" href="./training-guide.html" target="_blank" rel="noopener" data-training-guide>كيف أستخدم ملفات التدريب؟ ↗</a></div></section>`;
}
function compactProgress() {
  return `<section class="card compact-progress" aria-labelledby="progressSummaryTitle"><div class="section-head"><h2 id="progressSummaryTitle">تقدّمك حتى الآن</h2><small>بتأكيدك اليدوي</small></div><dl class="compact-stats"><div><dt>مراحل مكتملة</dt><dd data-stat="completed">${completedCount()} <small>/ ${allStages}</small></dd></div><div><dt>بنود تحقّقت منها</dt><dd data-stat="checks">${checkedCount()} <small>/ ${allChecks}</small></dd></div><div><dt>مراحل موثّقة</dt><dd data-stat="notes">${documentedCount()}</dd></div></dl>${progressBar(completedCount(), allStages, 'المراحل المكتملة')}</section>`;
}
function home() {
  const next = resumeActivity();
  const track = trackById(next.trackId);
  const stage = track.stages[next.index];
  const allDone = completedCount() === allStages;
  const hasProgress = Boolean(state.lastActivity || completedCount() || checkedCount() || documentedCount());
  return `<div class="training-home" data-training-home>${hero('تدريبي', 'خطوة واحدة واضحة، ثم تابع من حيث توقفت.')}<section class="resume-card" aria-labelledby="resumeTitle"><div><h2 id="resumeTitle">${allDone ? 'حان وقت مراجعة ما أنجزته' : hasProgress ? 'واصل تدريبك' : 'ابدأ أول تدريب'}</h2><p>${esc(track.name)} · ${esc(stage.name)}</p><div class="resume-meta">${state.lastActivity ? `آخر نشاط: ${esc(dateLabel(state.lastActivity.at))}` : 'افتح المرحلة واقرأ المطلوب، ثم دوّن ما تتوصل إليه.'}</div></div><button type="button" class="primary resume-button" data-open="${track.id}" data-stage="${next.index}">${allDone ? 'مراجعة التدريب' : hasProgress ? 'متابعة التدريب' : 'ابدأ التدريب'} ←</button></section>${compactProgress()}${trainingPlanSummary(state, planOptions())}</div>`;
}
function sectionNavigation() {
  const group = primaryView(currentView);
  const items = group === 'progress' ? [['progress', 'نظرة عامة'], ['plan', 'خطة جلسة'], ['journal', 'سجلي'], ...(skillState.enabled ? [['skills', 'تحقيقات CyberTrace']] : [])] : group === 'account' ? [['account', 'الحساب'], ['backups', 'النسخ والتقارير'], ['troubleshoot', 'مساعدة المختبر']] : [];
  return items.length ? `<nav class="context-nav" aria-label="${group === 'progress' ? 'أقسام تقدّمي' : 'أقسام حسابي'}">${items.map(([view, label]) => `<button type="button" class="${view === currentView ? 'active' : ''}" data-nav="${view}" ${view === currentView ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>` : '';
}
function progressPage() {
  return `${hero('تقدّمي', 'راجع تدريبك العملي، ثم اختر ما تريد توثيقه أو مشاركته.')} ${compactProgress()}<section class="section progress-tools" aria-label="أدوات متابعة التدريب"><a class="card destination-card" href="./mission-mode.html"><h2>المهام والمهارات</h2><p>اعرض المراحل التي أكّدتها ضمن مهام مترابطة وبصمة مهارات التدريب.</p><span>افتح مهامي ←</span></a><a class="card destination-card" href="./certificates.html"><h2>شهاداتي</h2><p>راجع المسارات المكتملة وأصدر إفادة إتمام تدريب غير موثقة قابلة للطباعة.</p><span>مركز الشهادات ←</span></a><a class="card destination-card" href="./portfolio.html"><h2>ملف أعمالي</h2><p>اختر المراحل التي تريد عرضها، وراجع محتواها قبل الطباعة أو حفظ PDF.</p><span>جهّز ملف الأعمال ←</span></a></section><section class="card section"><div class="section-head"><h2>آخر نشاط</h2><button type="button" class="link-btn" data-nav="journal">افتح سجلي ←</button></div>${recentActivity()}</section>`;
}
function accountSummary() {
  return accountStatus.message || (accountStatus.user ? 'راجع حالة الحفظ والمزامنة، وأدر تسجيل الدخول من نافذة الحساب.' : 'يمكنك التدريب كضيف، أو تسجيل الدخول لحفظ تقدمك في حسابك.');
}
function accountPage() {
  return `${hero('حسابي', 'الحساب والحفظ ومساعدة التدريب في مكان واحد.')}<section class="card account-overview"><h2>${accountStatus.user ? 'حساب التدريب' : 'مساحتك متاحة كضيف'}</h2><p data-workspace-account-state role="status">${esc(accountSummary())}</p><button type="button" class="primary" data-open-account>${accountStatus.user ? 'إدارة حسابي' : 'تسجيل الدخول أو إنشاء حساب'}</button></section><details class="card section optional-panel" data-environment-settings><summary>إعداد بيئة التدريب المحلية</summary><p class="context-note">سجّل ما تحققت منه في مختبرك. التدريب على السجلات داخل المتصفح متاح دون آلة افتراضية.</p>${statusControls()}<a class="link-btn" id="localSetupGuideLink" href="./?intro=1#local-lab-setup">دليل تجهيز VirtualBox ←</a></details><section class="card section bb-settings-link"><h2>تفضيلات الاستخدام</h2><p>مظهر ليلي أو فاتح، نص أكبر، تقليل الحركة، ومستوى التدريب الاختياري.</p><button type="button" class="secondary" data-nav="settings">فتح مركز الإعدادات ←</button></section><section class="card section resource-links"><h2>أدلة التدريب</h2><a href="./training-guide.html">استخدام ملفات التدريب ←</a><a href="./labs.html">دليل المختبرات المحلية ←</a><a href="${esc(partnerURL())}" data-partner="account">CyberTrace للتحقيقات التفاعلية ←</a></section>`;
}
function settingsPage() {
  const options=(key,rows)=>rows.map(([value,label])=>`<option value="${value}"${displayPreferences[key]===value?' selected':''}>${label}</option>`).join('');
  return `${hero('إعدادات العرض', 'اختر الطريقة الأنسب لك لاستخدام BLACKBOX، دون المساس بالملاحظات أو بيانات حسابك.', 'WORKSPACE / PREFERENCES')}
  <div class="bb-settings-grid">
    <section class="card bb-settings-panel" aria-labelledby="bb-settings-display">
      <h2 id="bb-settings-display">المظهر وإمكانية الوصول</h2>
      <label class="bb-settings-control"><span>المظهر</span><select data-bb-ui-key="theme">${options('theme',[['dark','ليلي — الأزرق الأصلي'],['light','فاتح — للقراءة']])}</select></label>
      <label class="bb-settings-control"><span>حجم النص</span><select data-bb-ui-key="textSize">${options('textSize',[['normal','عادي'],['large','أكبر']])}</select></label>
      <label class="bb-settings-control"><span>المؤثرات الحركية</span><select data-bb-ui-key="motion">${options('motion',[['system','حسب نظام الجهاز'],['reduce','تقليل الحركة']])}</select></label>
    </section>
    <section class="card bb-settings-panel" aria-labelledby="bb-settings-learning">
      <h2 id="bb-settings-learning">مستوى التدريب — اختياري</h2>
      <p>اختر مستواك لتفضيل طريقة التعلم مستقبلًا. هذا الاختيار لا يفتح مرحلة مغلقة، ولا يمنح شهادة أو صلاحية.</p>
      <label class="bb-settings-control"><span>مستواي الحالي</span><select data-bb-ui-key="level">${options('level',[['unset','لم أحدد بعد'],['beginner','مبتدئ'],['hobbyist','هاوٍ'],['intermediate','متوسط'],['advanced','متقدم']])}</select></label>
      <div class="bb-settings-privacy"><b>حفظ محلي فقط</b><p>تُحفظ تفضيلات العرض في هذا المتصفح على هذا الجهاز، ولا تتزامن مع Firebase أو CyberTrace. لن تتغير الملاحظات أو نتائج التدريب.</p></div>
    </section>
  </div>
  <div class="bb-settings-actions"><p data-bb-ui-feedback role="status" aria-live="polite"></p><button type="button" class="secondary" data-bb-ui-reset>استعادة المظهر الافتراضي</button></div>`;
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
  return `${hero('اختر مهارتك التالية', 'ابحث في المسارات ومحتواها، وابدأ بما يناسبك. تُفتح مراحل كل مسار بالتتابع بعد تأكيد إنجازها.')}<section class="card"><div class="search-tools"><div class="field search-field"><label for="trackSearch">ابحث في المسارات والمراحل</label><input class="search" id="trackSearch" type="search" placeholder="مثل Nmap، التقاط الحزم، الويب…" value="${esc(trackQuery)}"></div><div class="field filter-field"><label for="trackFilter">حالة التقدّم</label><select id="trackFilter" class="select-control">${[['all', 'كل المسارات'], ['new', 'لم تبدأ بعد'], ['progress', 'قيد التقدم'], ['done', 'مكتملة']].map(([value, label]) => `<option value="${value}" ${trackFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><span class="results-count" role="status">${matches.length} من ${tracks.length} مسارات</span></div>${pathCards(matches)}</section><section class="card section" id="selectedTrack"><div class="track-head"><div><div class="eyebrow">TRAINING PATH / ${track.icon}</div><h2>${esc(track.name)}</h2><p>${esc(track.sub)}</p></div><div class="track-actions"><span class="badge">${trackDone(track)}/${track.stages.length} مراحل مكتملة</span><button type="button" class="secondary compact" data-share-track="${track.id}">نسخ رابط المسار</button></div></div>${trainingKitResources(track)}${stageRows(track)}</section>${relatedInvestigation(track)}`;
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
  const browserEvidence = track.id === 'logs';
  const commands = stage.commands.map(([label, command]) => `<div class="field command-field"><span class="command-label">${esc(label)}</span><div class="cmd"><button type="button" class="copy" data-copy="${esc(command)}" aria-label="نسخ: ${esc(label)}">نسخ</button><code>${esc(command)}</code></div></div>`).join('');
  return `<div class="exercise-breadcrumb"><button type="button" class="link-btn" data-nav="tracks">المسارات</button><span aria-hidden="true">/</span><span>${esc(track.name)}</span><span aria-hidden="true">/</span><span>المرحلة ${currentStage + 1} من ${track.stages.length}</span></div>
  <section class="track-head exercise-heading"><div><h1 tabindex="-1">${esc(stage.name)}</h1><p>${esc(stage.goal)}</p></div><div class="track-actions"><span class="badge ${done ? 'done' : 'current'}">${done ? 'مكتملة' : 'قيد التدريب'}</span><button type="button" class="link-btn" data-share-stage="${track.id}" data-stage-index="${currentStage}">نسخ رابط المرحلة</button></div></section>
  <section class="card task-brief" data-task-brief aria-labelledby="taskGuideTitle"><span class="workflow-step">١ · افهم المطلوب</span><h2 id="taskGuideTitle">مهمتك في هذه المرحلة</h2><p class="stage-guide">${esc(stage.guide)}</p><details class="optional-panel hints-disclosure" data-training-hints-disclosure><summary>تحتاج إلى تلميح؟</summary><div data-training-hints><p role="status">جارٍ تحميل التلميحات…</p></div></details></section>
  ${browserEvidence ? '<section class="card section evidence-step" aria-label="أدلة المرحلة"><span class="workflow-step">٢ · اقرأ الأدلة</span><div data-evidence-workbench><p role="status">جارٍ تحميل قارئ السجلات…</p></div></section>' : ''}
  <details class="card section optional-panel training-resources" data-training-resources><summary>${browserEvidence ? 'أدوات التحليل على جهازك (اختياري)' : '٢ · افتح ملفات وأوامر التدريب'}</summary>${trainingKitResources(track)}<h2 class="box-title">${browserEvidence ? 'أوامر التحليل المحلي' : 'أوامر وعناوين التمرين'}</h2>${commands}<p class="context-note">${browserEvidence ? 'يمكنك إنجاز قراءة السجلات من القارئ أعلاه. هذه الأدوات لمن يريد التحليل محليًا باستخدام Python 3.' : 'نفّذ الأوامر وتحقق من النتائج داخل بيئتك المصرح بها، ثم وثّق ما لاحظته أدناه.'}</p></details>
  <div class="exercise section"><section class="card exercise-main" aria-labelledby="stageAnswerTitle"><span class="workflow-step">٣ · اكتب استنتاجك</span><div class="section-head notes-heading"><h2 id="stageAnswerTitle">دوّن ما توصلت إليه</h2><span class="badge">حفظ تلقائي</span></div>
  <div class="field"><div class="documentation-label"><label for="stageResult">النتائج والأدلة</label><button type="button" class="link-btn" data-template="result">إضافة قالب النتائج</button></div><textarea id="stageResult" class="notearea" data-result="${key}" maxlength="${MAX_TEXT_LENGTH}" placeholder="المخرجات المهمة، ما الذي لاحظته، وكيف تحقّقت منه…">${esc(state.results[key] || '')}</textarea></div>
  <div class="field"><div class="documentation-label"><label for="stageNotes">ملاحظات وخطوات المتابعة</label><button type="button" class="link-btn" data-template="notes">إضافة قالب المراجعة</button></div><textarea id="stageNotes" class="notearea" data-notes="${key}" maxlength="${MAX_TEXT_LENGTH}" placeholder="ما الذي تعلّمته؟ وما الذي ستراجعه في المرة القادمة؟">${esc(state.notes[key] || '')}</textarea></div><div class="save-line"><span id="draftStatus" class="draft-status" role="status" aria-live="polite"></span><button type="button" class="secondary" id="saveDraft">حفظ الآن</button></div></section><aside class="card check-card"><span class="workflow-step">٤ · راجع وأكمل</span><div class="section-head"><div><h2>خطوات إنجازك</h2><small>أشّر على البنود بعد تنفيذها</small></div><span class="badge" id="checkCount">${checks.length}/${stage.check.length}</span></div><div class="steps">${stage.check.map((label, index) => `<label class="step ${checks.includes(index) ? 'done' : ''}"><input type="checkbox" data-check="${key}" data-index="${index}" ${checks.includes(index) ? 'checked' : ''} ${done ? 'disabled' : ''}><span>${esc(label)}</span></label>`).join('')}</div><p class="context-note">التأشير يحفظ الخطوات. تأكيد المرحلة يسجّل إنجازها ويفتح المرحلة التالية.</p><button type="button" class="primary confirm" id="confirmStage" ${done || checks.length < stage.check.length ? 'disabled' : ''}>${done ? '✓ المرحلة مكتملة' : 'تأكيد إكمال المرحلة'}</button>${done ? `<p class="completion-date">أكّدت إنجازها في ${esc(dateLabel(state.completed[key]))}</p>${currentStage + 1 < track.stages.length ? `<button type="button" class="secondary full-width" data-open="${track.id}" data-stage="${currentStage + 1}">الانتقال إلى المرحلة التالية ←</button>` : '<button type="button" class="secondary full-width" data-nav="tracks">اختيار مسار آخر ←</button>'}` : ''}<div class="mini-progress"><span>تقدّم المسار</span><strong>${trackDone(track)}/${track.stages.length}</strong>${progressBar(trackDone(track), track.stages.length, `تقدم مسار ${track.name}`)}</div></aside></div>`;
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
  const description = accountStatus.user ? 'نزّل نسخة من التقدّم المعروض في حسابك أو تقريرًا للقراءة والمشاركة. راجع حالة المزامنة قبل الانتقال إلى جهاز آخر.' : 'نزّل نسخة قابلة للاستعادة أو تقريرًا للقراءة والمشاركة. بيانات الضيف محلية؛ النسخة الاحتياطية تساعدك على نقلها إلى متصفح آخر.';
  const resetTitle = accountStatus.user ? 'إعادة ضبط تقدّم الحساب' : 'بداية جديدة على هذا المتصفح';
  const resetDescription = accountStatus.user ? 'يعيد هذا الإجراء ضبط التقدّم والملاحظات في حسابك، ويُزامَن التغيير مع أجهزتك. نزّل نسخة للاحتفاظ بعملك أولًا.' : 'مسح البيانات يزيل تقدّمك وملاحظاتك هنا. يمكنك الاحتفاظ بها بتنزيل نسخة أولًا.';
  const resetLabel = accountStatus.user ? 'إعادة ضبط تقدّم الحساب' : 'مسح البيانات المحلية';
  const candidate = pendingImport;
  const importStats = candidate ? { completed: Object.keys(candidate.completed).length, documented: documentedCount(candidate) } : null;
  return `${hero('احتفظ بعملك، أينما تتدرّب', description)}<div class="grid backup-grid"><section class="card backup-card"><span class="feature-symbol" aria-hidden="true">↓</span><h2>نسخة احتياطية كاملة</h2><p>ملف JSON يحتوي على الخطوات والملاحظات والنتائج والتقدّم وآخر نشاط وحالات بيئتك.</p><dl class="backup-summary"><div><dt>مراحل مكتملة</dt><dd>${completedCount()} / ${allStages}</dd></div><div><dt>مراحل موثّقة</dt><dd>${documentedCount()}</dd></div><div><dt>آخر حفظ</dt><dd>${esc(dateLabel(state.updatedAt))}</dd></div></dl><button type="button" class="primary" data-backup>تنزيل نسخة JSON</button></section><section class="card backup-card"><span class="feature-symbol" aria-hidden="true">↑</span><h2>استعادة نسخة محفوظة</h2><p>اختر نسخة BLACKBOX بصيغة JSON. تُفحص البيانات أولًا، ثم تؤكّد الاستعادة قبل استبدال تقدّمك الحالي.</p><label class="file-label" for="importFile">اختر ملف النسخة الاحتياطية</label><input id="importFile" class="file-input" type="file" accept=".json,application/json" aria-describedby="importHint importStatus"><small id="importHint" class="muted">حتى ${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB · تقبل النسخ القديمة من هذا المختبر أيضًا</small><p id="importStatus" class="import-status ${importError ? 'error' : ''}" role="${importError ? 'alert' : 'status'}">${esc(importMessage)}</p>${candidate ? `<div class="import-preview"><strong>النسخة جاهزة للاستعادة</strong><p>${importStats.completed} مراحل مكتملة · ${importStats.documented} مراحل موثّقة</p><p>ستستبدل هذه النسخة البيانات الحالية. ننصح بتنزيل نسختك الحالية قبل المتابعة.</p><div class="button-row"><button type="button" class="primary" id="confirmImport">استعادة هذه النسخة</button><button type="button" class="secondary" id="cancelImport">إلغاء</button></div></div>` : ''}</section></div><section class="card report-card section"><div><span class="eyebrow">TRAINING REPORT</span><h2>تقرير يروي ما أنجزته</h2><p>ملف Markdown مرتب حسب المسار، ويشمل المراحل وحالتها وبنود التحقّق ونتائجك وملاحظاتك وتواريخ الإنجاز.</p></div><div class="report-actions"><button type="button" class="secondary" data-report>تنزيل تقرير Markdown</button><a class="secondary" href="./portfolio.html" data-portfolio-open>ملف أعمال مختار وحفظ PDF ←</a></div></section><section class="card reset-card section"><div><h2>${resetTitle}</h2><p>${resetDescription}</p></div><button type="button" class="secondary danger" id="resetProgress">${resetLabel}</button></section>`;
}
function troublePage() {
  const query = errorQuery.trim().toLocaleLowerCase('ar');
  const list = errors.filter(item => !query || item.join(' ').toLocaleLowerCase('ar').includes(query));
  return `${hero('حلّ العائق، وواصل التدريب', 'إرشادات عملية للأعطال الشائعة في بيئتك المحلية وأدوات المختبر.')}<div class="section-head"><h2>دليل حلول الأعطال</h2><div class="field"><label for="errorSearch">ابحث عن المشكلة</label><input type="search" class="search" id="errorSearch" placeholder="مثل WebGoat أو عنوان IP…" value="${esc(errorQuery)}"></div></div><div class="error-grid">${list.map(([title, description]) => `<article class="error-card"><h3>${esc(title)}</h3><p>${esc(description)}</p></article>`).join('') || '<div class="card empty"><h2>لم نجد نتيجة مطابقة</h2><p>جرّب اسم الأداة أو وصفًا أقصر للمشكلة.</p></div>'}</div>`;
}
function render(focus = false) {
  const nextScope = JSON.stringify([currentView, currentTrack, currentStage, accountStatus.user?.uid ?? null]);
  const sameScope = nextScope === renderedContentScope;
  const openPanels = sameScope ? nativePanels.filter(selector => content.querySelector(selector)?.open) : [];
  const focused = document.activeElement;
  const focusedPanel = sameScope ? nativePanels.find(selector => content.querySelector(selector)?.contains(focused)) : null;
  const panelFocus = focusedPanel ? focused.id ? { id: focused.id } : focused.tagName === 'SUMMARY' ? { selector: focusedPanel + ' > summary' } : null : null;
  hintController?.dispose();
  hintController = undefined;
  evidenceDisposer?.();
  evidenceDisposer = undefined;
  const evidenceRun = ++viewGeneration;
  updateMetadata();
  document.querySelectorAll('#bb-quick-dock [data-bb-dock-view]').forEach(button => {
    const selected = button.dataset.bbDockView === (currentView === 'exercise' ? 'tracks' : currentView);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelectorAll('#nav [data-view]').forEach(button => {
    const active = button.dataset.view === primaryView(currentView);
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  document.getElementById('crumb').textContent = titles[currentView];
  const count = completedCount();
  document.getElementById('sideProgress').textContent = `${count} / ${allStages}`;
  document.getElementById('sideProgressBar').value = count;
  const pages = { home, progress: progressPage, account: accountPage, settings: settingsPage, tracks: tracksPage, plan: planPage, skills: skillsPage, exercise: exercisePage, journal: journalPage, backups: backupsPage, troubleshoot: troublePage };
  content.innerHTML = `${routeNotice ? `<div class="route-notice" role="status">${esc(routeNotice)}</div>` : ''}${sectionNavigation()}${pages[currentView]()}`;
  renderedContentScope = nextScope;
  // A same-owner account refresh must not close a guide while it is being used.
  // Route, stage and account changes deliberately start with folded panels.
  for (const selector of openPanels) {
    const panel = content.querySelector(selector);
    if (panel) panel.open = true;
  }
  bind();
  void mountStageEvidence(evidenceRun);
  void mountStageHints(evidenceRun);
  updateSaveStatus(Boolean(saveTimer));
  trackPageView();
  if (!focus && panelFocus) {
    const target = panelFocus.id ? document.getElementById(panelFocus.id) : content.querySelector(panelFocus.selector);
    if (target && content.contains(target)) target.focus({ preventScroll: true });
  }
  if (focus) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    content.querySelector('h1')?.focus({ preventScroll: true });
  }
}
function currentEvidenceScope() {
  return currentView === 'exercise' && currentTrack === 'logs'
    ? JSON.stringify([accountStatus.user?.uid ?? null, currentTrack, currentStage]) : null;
}
function loadOptionalStyles(filename) {
  if (!optionalStylePromises.has(filename)) optionalStylePromises.set(filename, new Promise(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL(filename, import.meta.url).href;
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
    document.head.append(link);
  }));
  return optionalStylePromises.get(filename);
}
function hasStageAttempt() {
  const key = stageKey(currentTrack, currentStage);
  return hasMeaningfulDocumentation(state.notes[key]) || hasMeaningfulDocumentation(state.results[key]);
}
function updateHintAttempt() { hintController?.setAttempted(hasStageAttempt()); }
async function mountStageHints(run) {
  const scope = currentView === 'exercise' ? JSON.stringify([accountStatus.user?.uid ?? null, currentTrack, currentStage]) : null;
  if (scope !== hintScope) { hintScope = scope; hintViewState = undefined; }
  const panel = content.querySelector('[data-training-hints]');
  if (!panel || !scope) return;
  const isCurrent = () => run === viewGeneration && scope === hintScope && panel.isConnected;
  try {
    const [module] = await Promise.all([import('./assets/modules/training/training-hints.js'), loadOptionalStyles('./assets/styles/training-hints.css')]);
    if (!isCurrent()) return;
    hintViewState ??= module.createHintViewState();
    hintController = module.mountTrainingHints(panel, {
      trackId: currentTrack, stageIndex: currentStage, viewState: hintViewState, attempted: hasStageAttempt(),
    });
  } catch {
    if (isCurrent()) panel.textContent = 'تعذّر تحميل التلميحات. يمكنك متابعة تعليمات المرحلة أو تحديث الصفحة للمحاولة مجددًا.';
  }
}
async function mountStageEvidence(run) {
  const scope = currentEvidenceScope();
  if (scope !== evidenceScope) {
    evidenceScope = scope;
    evidenceViewState = undefined;
  }
  const panel = content.querySelector('[data-evidence-workbench]');
  if (!panel || !scope) return;
  const isCurrent = () => run === viewGeneration && scope === currentEvidenceScope() && panel.isConnected;
  try {
    const [module] = await Promise.all([import('./evidence-workbench.js'), loadOptionalStyles('./assets/styles/evidence-workbench.css')]);
    if (!isCurrent()) return;
    evidenceViewState ??= module.createEvidenceViewState();
    evidenceDisposer = module.mountEvidenceWorkbench(panel, {
      viewState: evidenceViewState,
      onAppend: citation => {
        if (!isCurrent() || accountStatus.phase === 'loading') return false;
        flushDraft();
        const key = stageKey(currentTrack, currentStage);
        const existing = state.results[key] || '';
        if (existing.includes(citation)) {
          toast('هذه القرائن موجودة في النتائج بالفعل.');
          return false;
        }
        const next = existing ? existing + '\n\n' + citation : citation;
        if (next.length > MAX_TEXT_LENGTH) {
          toast('النتائج طويلة؛ احتفظ بنسخة واختصرها قبل إضافة قرائن جديدة.');
          return false;
        }
        state.results[key] = next;
        state.stageUpdatedAt[key] = new Date().toISOString();
        const field = document.getElementById('stageResult');
        if (field) field.value = next;
        persist();
        toast('أُضيفت القرائن إلى نتائج المرحلة. دوّن استنتاجك وحدوده.');
        return true;
      },
    });
  } catch {
    if (isCurrent()) panel.textContent = 'تعذّر تحميل قارئ السجلات. يمكنك متابعة التوثيق أو تحديث الصفحة للمحاولة مجددًا.';
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
function exportRecovery(id) {
  flushDraft();
  const copies = accountController.getRecoveryBackups();
  const index = copies.findIndex(copy => copy.id === id);
  if (index < 0) { toast('لم تعد هذه المسودة متاحة؛ يمكنك تنزيل نسخة من التقدّم المعروض.'); return; }
  const backup = createBackup(copies[index].progress);
  download(JSON.stringify(backup, null, 2), 'application/json;charset=utf-8', `blackbox-recovery-${new Date().toISOString().slice(0, 10)}-${index + 1}.json`);
  trackEvent('backup_export', { format: 'json' });
  toast('جهّزنا نسخة المسودة للتنزيل');
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
  const result = accountController ? accountController.save(pendingImport, { requireLocal: true }) : saveProgress(pendingImport, storage);
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
  importMessage = accountStatus.user ? 'استُعيدت النسخة على هذا الجهاز؛ تابع حالة مزامنتها مع حسابك.' : 'تمت استعادة النسخة بنجاح.';
  importError = false;
  currentTrack = state.lastActivity?.trackId || tracks[0].id;
  currentStage = state.lastActivity?.stageIndex || 0;
  navigate('home');
  toast(accountStatus.user ? 'استُعيدت النسخة؛ تابع حالة مزامنة الحساب' : 'تمت استعادة تقدّمك وملاحظاتك بنجاح');
}
function refreshSearch(id, value, position) {
  render();
  const input = document.getElementById(id);
  input.focus({ preventScroll: true });
  if (typeof position === 'number' && input.type !== 'search') input.setSelectionRange(position, position);
}
function bind() {
  // Settings are local device preferences, never saved into training progress.
  content.querySelectorAll('[data-bb-ui-key]').forEach(select => select.addEventListener('change', () => {
    const key=select.dataset.bbUiKey;
    if(!Object.hasOwn(displayPreferences,key))return;
    displayPreferences=applyBbPreferences(normalizeBbPreferences({...displayPreferences,[key]:select.value}));
    const saved=saveBbPreferences(displayPreferences,storage);
    const status=content.querySelector('[data-bb-ui-feedback]');
    if(status)status.textContent=saved?'تم حفظ التفضيلات على هذا الجهاز.':'تعذّر الحفظ؛ سيبقى هذا العرض حتى تحديث الصفحة.';
  }));
  content.querySelector('[data-bb-ui-reset]')?.addEventListener('click', () => {
    displayPreferences=applyBbPreferences(null);
    const saved=saveBbPreferences(displayPreferences,storage);
    render(false);
    const status=content.querySelector('[data-bb-ui-feedback]');
    if(status)status.textContent=saved?'استُعيد المظهر الافتراضي.':'استُعيد المظهر الافتراضي لهذه الجلسة فقط.';
  });
  const gradingForm = document.getElementById('verifiedGradingForm');
  const startButton = document.getElementById('startVerifiedGrading');
  if (gradingForm && startButton) {
    startButton.onclick = async () => {
      if (gradingBusy || !gradingAvailable()) return;
      const uid = accountStatus.user?.uid;
      const caseId = gradingForm.elements.caseId.value.trim();
      gradingBusy = true;
      gradingMessage = 'جارٍ بدء الجلسة الموثقة…';
      render();
      try {
        const session = await startVerifiedGrading(caseId, uid);
        if (accountStatus.user?.uid !== uid) return;
        gradingSession = session;
        gradingMessage = 'بدأت الجلسة. أرسل إجابتك خلال مدة الصلاحية.';
      } catch (error) { gradingMessage = error?.message || 'تعذّر بدء الجلسة.'; }
      finally { gradingBusy = false; if (currentView === 'skills') render(); }
    };
    gradingForm.onsubmit = async event => {
      event.preventDefault();
      if (gradingBusy || !gradingSession) return;
      const uid = accountStatus.user?.uid;
      const session = gradingSession;
      const answer = gradingForm.elements.answer.value;
      gradingBusy = true;
      gradingMessage = 'جارٍ التحقق من الإجابة على الخادم…';
      render();
      try {
        const result = await submitVerifiedAnswer(session, answer, uid);
        if (accountStatus.user?.uid !== uid) return;
        gradingSession = null;
        gradingMessage = `نتيجة موثقة من الخادم: ${result.score} / 70 · أفضل نتيجة: ${result.bestScore} / 70`;
      } catch (error) { gradingMessage = error?.message || 'تعذّر التحقق من الإجابة.'; }
      finally { gradingBusy = false; if (currentView === 'skills') render(); }
    };
  }
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => navigate(button.dataset.view));
  document.querySelectorAll('[data-nav]').forEach(button => button.onclick = () => navigate(button.dataset.nav));
  document.querySelectorAll('[data-open-account]').forEach(button => button.onclick = () => accountUI.open());
  document.querySelectorAll('[data-retry-skills]').forEach(button => button.onclick = async () => {
    button.disabled = true;
    try { await accountController.retrySkills(); }
    catch { toast('تعذّر تحديث إنجازات التحقيق. حاول مجددًا عند الاتصال.'); }
    finally { if (button.isConnected) button.disabled = false; }
  });
  document.querySelectorAll('[data-track]').forEach(button => button.onclick = () => openTrack(button.dataset.track));
  document.querySelectorAll('[data-open]').forEach(button => button.onclick = () => openStage(button.dataset.open, Number(button.dataset.stage)));
  document.getElementById('planFocus')?.addEventListener('change', event => { planFocus = event.target.value; render(); document.getElementById('planFocus')?.focus(); });
  document.getElementById('planBudget')?.addEventListener('change', event => { planBudget = Number(event.target.value); render(); document.getElementById('planBudget')?.focus(); });
  document.querySelectorAll('[data-template]').forEach(button => button.addEventListener('click', () => {
    const type = button.dataset.template;
    const input = document.getElementById(type === 'result' ? 'stageResult' : 'stageNotes');
    if (!input) return;
    const appended = appendDocumentationTemplate(input.value, type, MAX_TEXT_LENGTH);
    if (!appended.ok) {
      toast(appended.reason === 'duplicate' ? 'القالب موجود بالفعل؛ أكمل إجاباتك داخله.' : appended.reason === 'too-long' ? 'لا توجد مساحة كافية لإضافة القالب. بقي نصّك كما هو.' : 'تعذّر إضافة القالب. بقي نصّك كما هو.');
      return;
    }
    input.value = appended.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus({ preventScroll: true });
    toast('أُضيف القالب إلى كتابتك. أكمل إجاباتك بما لاحظته في مختبرك.');
  }));
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
    const prompt = accountStatus.user ? 'سيُعاد ضبط تقدّم هذا الحساب وملاحظاته، ويُزامَن التغيير مع أجهزتك. هل نزّلت نسخة احتياطية وتريد المتابعة؟' : 'سيُمسح التقدم والملاحظات من هذا المتصفح. هل نزّلت نسخة احتياطية وتريد بدء رحلة جديدة؟';
    if (!window.confirm(prompt)) return;
    const fresh = createInitialState();
    const result = accountController ? accountController.save(fresh, { requireLocal: true }) : saveProgress(fresh, storage);
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
// Keyboard/touch-friendly native disclosure; only existing navigation targets.
const quickDock = document.getElementById('bb-quick-dock');
quickDock?.addEventListener('click', event => {
  const button = event.target.closest('[data-bb-dock-view]');
  if (!button || !quickDock.contains(button)) return;
  quickDock.open = false;
  navigate(button.dataset.bbDockView);
});
// Do not leave the open dock covering training content on mobile.
document.addEventListener('pointerdown', event => {
  if (quickDock?.open && !quickDock.contains(event.target)) quickDock.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !quickDock?.open) return;
  quickDock.open = false;
  quickDock.querySelector('summary')?.focus();
});
window.addEventListener('scroll', () => {
  if (quickDock?.open) quickDock.open = false;
}, { passive: true });
document.querySelector('.brand').addEventListener('click', event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate('home');
});
window.addEventListener('beforeunload', flushDraft);
window.addEventListener('popstate', applyLocation);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDraft(); });
accountUI = mountAccountUI({
  beforeOpen: flushDraft,
  onExport: exportBackup,
  getRecoveries: () => accountController?.getRecoveryBackups() || [],
  onAction: async (action, payload) => {
    flushDraft();
    if (action === 'exportRecovery') return exportRecovery(payload.id);
    if (action === 'signInEmail') return accountController.signInEmail(payload.email, payload.password);
    if (action === 'signUpEmail') return accountController.signUpEmail(payload.email, payload.password);
    if (action === 'signInGoogle') return accountController.signInGoogle();
    if (action === 'resetPassword') return accountController.resetPassword(payload.email);
    if (action === 'signOut') return accountController.signOut(payload);
    if (action === 'importGuest') {
      if (!await accountController.importGuest()) throw Object.assign(new Error(), { code: 'account/sync-failed' });
      return;
    }
    if (action === 'resolveConflict') {
      if (!await accountController.resolveConflict(payload.choice)) throw Object.assign(new Error(), { code: 'account/sync-failed' });
      return;
    }
    if (action === 'syncNow') return accountController.syncNow();
    if (action === 'retry') {
      await accountController.start();
      if (accountController.getStatus().user) return accountController.syncNow();
    }
  },
});
accountController = createAccountSync({
  guestState: state,
  storage,
  beforeScopeChange: flushDraft,
  beforeRemoteApply: flushDraft,
  onState: next => {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    state = next;
    accountStatus = accountController.getStatus();
    resetSkillOwner(accountStatus.user?.uid ?? null);
    if (typeof accountStatus.localSaved === 'boolean') saveState = { ok: accountStatus.localSaved, message: '' };
    importRequest += 1;
    pendingImport = null;
    importMessage = '';
    importError = false;
    if (currentView === 'exercise' && !stageOpen(currentTrack, currentStage)) {
      currentView = 'tracks';
      routeNotice = 'اختر مرحلة متاحة في التقدّم المعروض حاليًا.';
      syncRoute(true);
    }
    render();
  },
  onStatus: next => {
    const loadingChanged = (accountStatus.phase === 'loading') !== (next.phase === 'loading');
    accountStatus = next;
    const skillOwnerChanged = resetSkillOwner(next.user?.uid ?? null);
    if (typeof next.localSaved === 'boolean') saveState = { ok: next.localSaved, message: '' };
    accountUI.update(next);
    content.inert = Boolean(next.user && next.phase === 'loading');
    updateSaveStatus(Boolean(saveTimer));
    const accountSummaryNode = document.querySelector('[data-workspace-account-state]');
    if (accountSummaryNode) accountSummaryNode.textContent = accountSummary();
    // Ready receipts can arrive before practical progress. Recompute once the
    // same account finishes loading, without replacing an exercise draft.
    if (skillOwnerChanged || loadingChanged) repaintLinkedSkills();
  },
  onSkillState: next => {
    resetSkillOwner(accountController?.getStatus().user?.uid ?? null);
    const previous = JSON.stringify(skillState);
    skillState = { ...skillState, ...next };
    if (previous !== JSON.stringify(skillState)) repaintLinkedSkills();
  },
});
applyLocation();
document.documentElement.dataset.bbAppReady = 'true';
document.dispatchEvent(new Event('blackbox:screen-ready'));
void accountController.start().catch(() => accountUI.update(accountController.getStatus()));
