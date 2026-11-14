// Pure validation for the trusted grading service. Never accept a client score.
export const MAX_ANSWER_LENGTH = 256;
export const SESSION_LIFETIME_MS = 10 * 60 * 1000;
export function normalizeAnswer(answer) {
  if (typeof answer !== 'string' || answer.length > MAX_ANSWER_LENGTH) throw new Error('invalid-answer');
  return answer.trim().toLowerCase();
}
export function requireCaseId(value) {
  if (typeof value !== 'string' || !/^INC-[0-9]{4}$/.test(value)) throw new Error('invalid-case');
  return value;
}
export function gradeAnswer(answer, rubric) {
  if (!rubric || !Array.isArray(rubric.acceptedAnswers) || !Number.isSafeInteger(rubric.maxScore) ||
      rubric.maxScore < 0 || rubric.maxScore > 70 || rubric.acceptedAnswers.length === 0) throw new Error('invalid-rubric');
  const normalized = normalizeAnswer(answer);
  return rubric.acceptedAnswers.some(candidate => typeof candidate === 'string' && normalizeAnswer(candidate) === normalized)
    ? rubric.maxScore : 0;
}
export function validateSession(session, uid, caseId, nowMs) {
  if (!session || session.uid !== uid || session.caseId !== caseId ||
      session.status !== 'open' || !Number.isSafeInteger(session.expiresAtMs) ||
      nowMs >= session.expiresAtMs) throw new Error('invalid-session');
}
