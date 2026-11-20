// No real answer keys, correct option indexes or score values belong in this public repo.
// Trusted challenge documents and private rubric documents must be provisioned separately.
// Both collections are inaccessible to the browser under Firestore rules.
export const VERIFIED_SOC_ID = 'SOC-VERIFY-01';
export const VERIFIED_SOC_TTL_MS = 20 * 60 * 1000;
export const VERIFIED_SOC_WINDOW_MS = 60 * 60 * 1000;
export const VERIFIED_SOC_MAX_STARTS = 5;
export const VERIFIED_SOC_MAX_SCORE = 100;

const isRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const exactKeys = (value, names) => isRecord(value) && Object.keys(value).every(k => names.includes(k)) && names.every(k => Object.hasOwn(value, k));
const id = x => typeof x === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,55}$/.test(x);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const unique = values => new Set(values).size === values.length;
const options = rows => Array.isArray(rows) && rows.length === 3 && rows.every(row =>
  isRecord(row) && id(row.id) && text(row.label, 240)) && unique(rows.map(row => row.id));

export function requireVerifiedSocId(shiftId) {
  if (shiftId !== VERIFIED_SOC_ID) throw new Error('unsupported-shift');
  return shiftId;
}

// Whitelist fields returned to learners. Never spread document data into HTTP responses.
export function publicSocChallenge(raw, shiftId = VERIFIED_SOC_ID) {
  requireVerifiedSocId(shiftId);
  if (!isRecord(raw) || raw.id !== shiftId || raw.schemaVersion !== 1 ||
      !Number.isSafeInteger(raw.version) || raw.version < 1 || raw.version > 9999 ||
      !text(raw.title, 110) || !text(raw.description, 500) ||
      !Array.isArray(raw.alerts) || raw.alerts.length !== 4 ||
      !options(raw.correlations)) throw new Error('invalid-public-challenge');
  if (!raw.alerts.every(row => isRecord(row) && id(row.id) &&
      text(row.title, 120) && text(row.description, 420) &&
      Array.isArray(row.evidence) && row.evidence.length >= 3 && row.evidence.length <= 8 &&
      row.evidence.every(line => text(line, 300)) && options(row.actions))) throw new Error('invalid-public-challenge');
  if (!unique(raw.alerts.map(row => row.id))) throw new Error('invalid-public-challenge');
  return {
    id: shiftId, version: raw.version, title: raw.title, description: raw.description,
    alerts: raw.alerts.map(row => ({
      id: row.id, title: row.title, description: row.description,
      evidence: row.evidence.map(line => String(line)),
      actions: row.actions.map(choice => ({ id: choice.id, label: choice.label })),
    })),
    correlations: raw.correlations.map(choice => ({ id: choice.id, label: choice.label })),
    priorityChoices: [
      { id: 'p1', label: 'P1 · عاجل' }, { id: 'p2', label: 'P2 · مرتفع' },
      { id: 'p3', label: 'P3 · متوسط' }, { id: 'p4', label: 'P4 · منخفض' },
    ],
  };
}

export function assertSocRubric(rubric, challenge) {
  if (!isRecord(rubric) || rubric.enabled !== true || rubric.version !== challenge.version ||
      !isRecord(rubric.answers) || !exactKeys(rubric.answers, challenge.alerts.map(a => a.id)) ||
      !id(rubric.correlationId) || !challenge.correlations.some(c => c.id === rubric.correlationId)) {
    throw new Error('invalid-private-rubric');
  }
  for (const alert of challenge.alerts) {
    const answer = rubric.answers[alert.id];
    if (!exactKeys(answer, ['priorityId', 'actionId']) ||
        !challenge.priorityChoices.some(row => row.id === answer.priorityId) ||
        !alert.actions.some(row => row.id === answer.actionId)) throw new Error('invalid-private-rubric');
  }
}

export function requireSocSubmission(payload, challenge) {
  if (!exactKeys(payload, ['responses', 'correlationId']) ||
      !Array.isArray(payload.responses) || payload.responses.length !== challenge.alerts.length ||
      !id(payload.correlationId) || !challenge.correlations.some(row => row.id === payload.correlationId)) {
    throw new Error('invalid-submission');
  }
  const expectedIds = new Set(challenge.alerts.map(a => a.id));
  const seen = new Set();
  for (const response of payload.responses) {
    if (!exactKeys(response, ['alertId', 'priorityId', 'actionId']) ||
        !expectedIds.has(response.alertId) || seen.has(response.alertId) ||
        !challenge.priorityChoices.some(row => row.id === response.priorityId) ||
        !challenge.alerts.find(a => a.id === response.alertId).actions.some(row => row.id === response.actionId)) {
      throw new Error('invalid-submission');
    }
    seen.add(response.alertId);
  }
  return payload;
}

// Validates structure, not the client's claimed score. Rubric is only read on the backend.
export function scoreVerifiedSoc(payload, challenge, rubric) {
  requireSocSubmission(payload, challenge);
  assertSocRubric(rubric, challenge);
  const byId = Object.fromEntries(payload.responses.map(row => [row.alertId, row]));
  const assessments = challenge.alerts.map(alert => {
    const chosen = byId[alert.id], expected = rubric.answers[alert.id];
    return { alertId: alert.id,
      priorityPoints: chosen.priorityId === expected.priorityId ? 8 : 0,
      responsePoints: chosen.actionId === expected.actionId ? 12 : 0 };
  });
  const priorityScore = assessments.reduce((s, a) => s + a.priorityPoints, 0);
  const responseScore = assessments.reduce((s, a) => s + a.responsePoints, 0);
  const correlationScore = payload.correlationId === rubric.correlationId ? 20 : 0;
  return {
    score: priorityScore + responseScore + correlationScore,
    maxScore: VERIFIED_SOC_MAX_SCORE,
    priorityScore, responseScore, correlationScore,
    assessments,
  };
}

export function nextSocQuota(previous, now) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('invalid-clock');
  const start = previous?.windowStartMs, count = previous?.count;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || now < start || now - start >= VERIFIED_SOC_WINDOW_MS) {
    return { windowStartMs: now, count: 1 };
  }
  if (count < 0 || count >= VERIFIED_SOC_MAX_STARTS) throw new Error('quota-exceeded');
  return { windowStartMs: start, count: count + 1 };
}
