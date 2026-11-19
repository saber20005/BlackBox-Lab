import { tracks } from './data.js';
import { normalizeState } from './progress.js';

export const PORTFOLIO_SOURCE_LABELS = Object.freeze({
  guest: 'المصدر: تقدم الضيف المحلي في هذا المتصفح، دون مزامنة مع حساب.',
  account: 'المصدر: آخر تقدم محفوظ على خادم الحساب وقت تحديث العرض. قد لا يشمل التعديلات المحلية الحديثة.',
  cache: 'المصدر: نسخة سابقة لهذا الحساب؛ لم يُؤكَّد أنها أحدث نسخة بسبب تعذّر تحديث الحساب.',
  pending: 'المصدر: مسودة محلية مخبأة لهذا الحساب لم تتزامن بعد؛ قد تختلف عن النسخة السحابية.',
  unknown: 'لم يُحدَّد مصدر التقدم بعد.',
});

export const PORTFOLIO_DISCLAIMER = 'هذا ملف تدريب اختاره المتعلم للمشاركة. إكمال المراحل وبنود التحقق تأكيد يدوي من المتعلم، وليس شهادة أو تحققًا آليًا من تنفيذ التدريب أو تقييمًا أمنيًا معتمدًا.';

/** Selection metadata only: documentation and private account fields stay out. */
export function portfolioEntries(progress) {
  const state = normalizeState(progress);
  return tracks.flatMap(track => track.stages.flatMap((stage, index) => {
    const key = `${track.id}-${index}`;
    if (!state.completed[key]) return [];
    return [{
      key, trackName: track.name, title: stage.name, goal: stage.goal,
      completedAt: state.completed[key],
      checkedCount: state.checks[key].length, checkCount: stage.check.length,
    }];
  }));
}

/** Build a curated report from explicit selections; never spread raw progress. */
export function buildPortfolio(progress, options = {}) {
  const state = normalizeState(progress);
  const selected = new Set(Array.isArray(options.selectedKeys) ? options.selectedKeys : []);
  const entries = portfolioEntries(state).filter(entry => selected.has(entry.key)).map(entry => {
    const result = { ...entry };
    if (options.includeNotes === true) result.notes = state.notes[entry.key] ?? '';
    if (options.includeResults === true) result.results = state.results[entry.key] ?? '';
    return result;
  });
  return {
    sourceLabel: Object.values(PORTFOLIO_SOURCE_LABELS).includes(options.sourceLabel) ? options.sourceLabel : PORTFOLIO_SOURCE_LABELS.unknown,
    disclaimer: PORTFOLIO_DISCLAIMER,
    entries,
  };
}
