// A fixed-window per-UID limiter; the caller must apply it in a Firestore transaction.
export const WINDOW_MS = 60 * 60 * 1000;
export const MAX_SESSIONS_PER_WINDOW = 12;
export function nextQuota(previous, nowMs) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error('invalid-clock');
  const start = previous?.windowStartMs;
  const count = previous?.count;
  if (start === undefined || nowMs < start || nowMs - start >= WINDOW_MS) {
    return { windowStartMs: nowMs, count: 1 };
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || count < 0 || count >= MAX_SESSIONS_PER_WINDOW) {
    throw new Error('quota-exceeded');
  }
  return { windowStartMs: start, count: count + 1 };
}
