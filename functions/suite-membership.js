// Server-only suite membership resolver. This module never creates, upgrades or bills users.
// Memberships are owned by the trusted server under /suiteMemberships/{blackboxUid};
 // Firestore rules intentionally deny client reads and writes to that collection.
export const SUITE_PLAN_ID = 'cybertrace-blackbox-pro';
export const SUITE_SCHEMA_VERSION = 1;
export const SUITE_RELEASE = 'not-for-sale';

export function membershipForClient(raw, now = Date.now()) {
  const free = Object.freeze({ schemaVersion: SUITE_SCHEMA_VERSION, plan: 'free', active: false, features: [], expiresAt: null });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return free;
  // Only trusted billing/webhook administrators may provision membership documents.
  // Client SDK writes to this collection must always remain denied.
  if (raw.schemaVersion !== SUITE_SCHEMA_VERSION || raw.plan !== SUITE_PLAN_ID || raw.status !== 'active' || raw.source !== 'trusted-billing') return free;
  let expiry;
  if (raw.expiresAt && typeof raw.expiresAt.toMillis === 'function') expiry = raw.expiresAt.toMillis();
  else if (typeof raw.expiresAt === 'string') expiry = Date.parse(raw.expiresAt);
  else return free;
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 366 * 24 * 60 * 60 * 1000) return free;
  return Object.freeze({ schemaVersion: SUITE_SCHEMA_VERSION, plan: SUITE_PLAN_ID, active: true,
    features: Object.freeze(['advanced-soc', 'advanced-reports']), expiresAt: new Date(expiry).toISOString() });
}
