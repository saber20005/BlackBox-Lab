import test from 'node:test';
import assert from 'node:assert/strict';
import { membershipForClient, SUITE_PLAN_ID, SUITE_RELEASE } from '../suite-membership.js';

const now = Date.parse('2026-11-19T12:00:00.000Z');
const valid = { schemaVersion: 1, plan: SUITE_PLAN_ID, status: 'active', source: 'trusted-billing', expiresAt: '2026-12-19T12:00:00.000Z', uid: 'private-user', paymentMethod: 'private-secret' };

test('suite remains unavailable for sale during foundation release', () => {
  assert.equal(SUITE_RELEASE, 'not-for-sale');
  assert.equal(membershipForClient(null, now).active, false);
  assert.equal(membershipForClient({}, now).plan, 'free');
});
test('only a canonical trusted and unexpired record maps to a Pro status', () => {
  const p = membershipForClient(valid, now);
  assert.equal(p.active, true);
  assert.equal(p.plan, SUITE_PLAN_ID);
  assert.deepEqual(p.features, ['advanced-soc', 'advanced-reports']);
  assert.equal(p.expiresAt, valid.expiresAt);
  assert.equal(JSON.stringify(p).includes('private-user'), false);
  assert.equal(JSON.stringify(p).includes('private-secret'), false);
});
test('invalid, expired or client-asserted memberships fail closed', () => {
  const changes = [
    { status: 'trialing' }, { status: 'past_due' }, { status: 'canceled' },
    { source: 'client' }, { plan: 'other' }, { schemaVersion: 2 },
    { expiresAt: '2026-10-01T00:00:00.000Z' }, { expiresAt: 'not-a-date' },
    { expiresAt: null }, { expiresAt: '2029-01-01T00:00:00.000Z' }
  ];
  for (const patch of changes) {
    assert.equal(membershipForClient({ ...valid, ...patch }, now).active, false, JSON.stringify(patch));
  }
  assert.equal(membershipForClient([], now).active, false);
});
