import { normalizeReceipt } from '../../../cybertrace-catalog.js';
import { SUITE_PATHWAYS } from './suite-learning-pathways.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const completedAt = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

// The application passes an already scoped practical state. Optional linked
// records must also belong to the account currently displayed by the reader.
function linkedSnapshot(options) {
  const { userUid, ownerUid, accountPhase, state: rawState } = object(options?.linked);
  const state = object(rawState);
  if (!nonempty(userUid)) return { phase: 'guest', receipts: {} };
  if (userUid !== ownerUid || accountPhase === 'loading') return { phase: 'loading', receipts: {} };
  if (state.enabled !== true || ['disabled', 'guest'].includes(state.phase)) return { phase: 'disabled', receipts: {} };
  if (!['ready', 'loading', 'error'].includes(state.phase)) return { phase: 'loading', receipts: {} };
  const receipts = {};
  let invalid = false;
  try {
    const rows = state.receipts;
    if (!rows || typeof rows !== 'object' || Array.isArray(rows) || ![Object.prototype, null].includes(Object.getPrototypeOf(rows))) throw new TypeError('Invalid linked records');
    for (const [id, raw] of Object.entries(rows)) {
      const receipt = normalizeReceipt(raw, id);
      if (receipt) receipts[id] = receipt;
      else invalid = true;
    }
  } catch { invalid = true; }
  const phase = invalid || state.error || state.phase === 'error' ? 'error'
    : state.fromCache || state.phase === 'loading' ? 'cached' : 'ready';
  return { phase, receipts };
}

export function suiteJourneyProgress(path, practical, tracks, options = {}) {
  if (!SUITE_PATHWAYS.includes(path)) throw new TypeError('Unknown learning journey');
  const linked = linkedSnapshot(options);
  const list = Array.isArray(tracks) ? tracks : [];
  const completed = object(object(practical).completed);
  const steps = path.steps.map(step => {
    if (step.site === 'blackbox') {
      const track = list.find(item => item.id === step.id);
      const known = Boolean(track?.stages?.length);
      const done = known && track.stages.every((_, index) => completedAt(completed[step.id + '-' + index]));
      return { ...step, status: !known ? 'unknown' : done ? 'complete' : 'incomplete', cached: false };
    }
    const receipt = linked.receipts[step.id];
    return { ...step, status: receipt ? 'complete' : linked.phase === 'ready' ? 'incomplete' : 'unknown', cached: Boolean(receipt && linked.phase !== 'ready') };
  });
  const practicalSteps = steps.filter(step => step.site === 'blackbox');
  const done = steps.filter(step => step.status === 'complete').length;
  const unknown = steps.filter(step => step.status === 'unknown').length;
  return {
    steps, done, total: steps.length, unknown,
    cachedDone: steps.filter(step => step.status === 'complete' && step.cached).length,
    practicalDone: practicalSteps.filter(step => step.status === 'complete').length,
    practicalTotal: practicalSteps.length,
    receiptPhase: linked.phase,
    allComplete: done === steps.length,
    nextStep: steps.find(step => step.status !== 'complete') || steps[0],
  };
}
