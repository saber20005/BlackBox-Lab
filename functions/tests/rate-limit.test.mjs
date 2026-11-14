import test from 'node:test';
import assert from 'node:assert/strict';
import { nextQuota, MAX_SESSIONS_PER_WINDOW, WINDOW_MS } from '../rate-limit.js';

test('starts a new window and increments up to the hard cap', () => {
  let quota = nextQuota(null, 1000);
  for (let i = 1; i < MAX_SESSIONS_PER_WINDOW; i++) quota = nextQuota(quota, 1001);
  assert.equal(quota.count, MAX_SESSIONS_PER_WINDOW);
  assert.throws(() => nextQuota(quota, 1002), /quota-exceeded/);
});
test('window resets after an hour', () => {
  assert.deepEqual(nextQuota({ windowStartMs: 1000, count: MAX_SESSIONS_PER_WINDOW }, 1000 + WINDOW_MS),
    { windowStartMs: 1000 + WINDOW_MS, count: 1 });
});
test('rejects malformed counters and clock', () => {
  assert.throws(() => nextQuota({ windowStartMs: 1000, count: -1 }, 1001));
  assert.throws(() => nextQuota(null, -1));
});
