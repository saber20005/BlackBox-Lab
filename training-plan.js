import { tracks } from './data.js';
import { CASE_META, normalizeReceipt } from './cybertrace-catalog.js';

export const PLAN_FOCUSES = Object.freeze([
  { id: 'all', label: 'كل المهارات' },
  { id: 'foundation', label: 'الأساسيات والاستطلاع' },
  { id: 'network', label: 'الشبكات' },
  { id: 'web', label: 'تطبيقات الويب' },
]);
export const PLAN_BUDGETS = Object.freeze([15, 30, 60]);
const focusTracks = { foundation: ['recon', 'nmap'], network: ['network', 'nmap'], web: ['webgoat', 'proxy'] };
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const own = (value, key) => Object.hasOwn(object(value), key) ? value[key] : undefined;
const text = value => typeof value === 'string' && value.trim().length > 0;
const completed = (progress, key) => typeof own(progress.completed, key) === 'string' && Number.isFinite(Date.parse(progress.completed[key]));

function linkedCases(linked) {
  const { userUid, ownerUid, accountPhase, state } = object(linked);
  // A ready snapshot is usable only for the owner currently shown in the app.
  if (!text(userUid) || userUid !== ownerUid || accountPhase === 'loading' || state?.enabled !== true || state.phase !== 'ready' || state.error) return [];
  try {
    return Object.entries(object(state.receipts)).flatMap(([id, raw]) => {
      const receipt = normalizeReceipt(raw, id);
      return receipt ? [{ id, ...receipt, meta: CASE_META[id] }] : [];
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch { return []; }
}

/** Derive a plan from existing progress; this function never awards or saves work. */
export function buildTrainingPlan(rawProgress, options = {}) {
  const progress = object(rawProgress);
  const focus = PLAN_FOCUSES.some(item => item.id === options?.focus) ? options.focus : 'all';
  const budget = PLAN_BUDGETS.includes(options?.budget) ? options.budget : 30;
  const receipts = linkedCases(options?.linked);
  const candidates = [];
  for (const [order, track] of tracks.entries()) {
    if (focus !== 'all' && !focusTracks[focus].includes(track.id)) continue;
    const index = track.stages.findIndex((stage, index) => !completed(progress, `${track.id}-${index}`) && (index === 0 || completed(progress, `${track.id}-${index - 1}`)));
    if (index < 0) continue;
    const stage = track.stages[index];
    const key = `${track.id}-${index}`;
    const checks = own(progress.checks, key);
    const draft = text(own(progress.notes, key)) || text(own(progress.results, key)) || (Array.isArray(checks) && checks.some(item => Number.isInteger(item) && item >= 0 && item < stage.check.length));
    const last = progress.lastActivity;
    const current = last?.trackId === track.id && last.stageIndex === index;
    const related = receipts.find(receipt => receipt.meta.trackIds.includes(track.id));
    const priority = draft ? 0 : current ? 1 : related ? 2 : index > 0 ? 3 : 4;
    const reason = draft ? 'لديك خطوات أو ملاحظات بدأت بها في هذه المرحلة.'
      : current ? 'هذه آخر مرحلة بدأت بها ولم تؤكّد إكمالها.'
      : related ? `تطبيق عملي مكمّل لتحقيق «${related.meta.title}» المسجّل في حسابك.`
      : index > 0 ? 'أكملت المرحلة السابقة؛ هذه الخطوة التالية المتاحة.'
      : track.id === 'recon' ? 'ابدأ بتجهيز حدود المختبر قبل التوسّع في الأدوات.' : 'خطوة متاحة لاستكشاف هذه المهارة.';
    const suggestedCaseId = related?.id || Object.keys(CASE_META).find(id => CASE_META[id].trackIds.includes(track.id)) || null;
    candidates.push({ trackId: track.id, trackName: track.name, stageIndex: index, stageName: stage.name, goal: stage.goal, priority, order, reason, minutes: index === 0 ? 15 : 20, relatedCaseId: suggestedCaseId, linkedCaseId: related?.id || null });
  }
  candidates.sort((a, b) => a.priority - b.priority || a.order - b.order);
  const tasks = [];
  let minutes = 0;
  for (const candidate of candidates) {
    if (tasks.length === 3) break;
    if (!tasks.length || minutes + candidate.minutes <= budget) {
      tasks.push(candidate);
      minutes += candidate.minutes;
    }
  }
  return { focus, budget, tasks, estimatedMinutes: minutes, overBudget: minutes > budget, linkedUsed: tasks.some(task => task.linkedCaseId), allComplete: tracks.every(track => track.stages.every((_, index) => completed(progress, `${track.id}-${index}`))) };
}

export function investigationURL(caseId) {
  if (!Object.hasOwn(CASE_META, caseId)) return null;
  const url = new URL('https://cybertracelab.dev/');
  url.searchParams.set('case', caseId);
  url.searchParams.set('utm_source', 'blackbox');
  url.searchParams.set('utm_medium', 'referral');
  url.searchParams.set('utm_campaign', 'session_plan');
  return url.href;
}
