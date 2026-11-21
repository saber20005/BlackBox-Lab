// Server-only suite entitlement resolver. No checkout, billing webhook,
// trial activation, upgrade endpoint or admin grant is exposed from this file.
// Only the trusted backend may read suiteMemberships/{BLACKBOX Firebase UID}.
export const SUITE_PLAN_ID = 'cybertrace-blackbox-pro';
export const SUITE_SCHEMA_VERSION = 1;
// HARD LAUNCH GATE. A DB document alone CANNOT activate Pro before a separately
// reviewed billing + content-protection release changes this value.
export const SUITE_RELEASE = 'not-for-sale';
export const SUITE_FEATURES = Object.freeze(['advanced-soc', 'advanced-reports']);
const MAX_FUTURE_MS = 366 * 24 * 60 * 60 * 1000;
const free = Object.freeze({
  schemaVersion: SUITE_SCHEMA_VERSION, plan: 'free', active: false,
  features: Object.freeze([]), expiresAt: null,
});

export function validTrustedSuiteMembership(raw, now = Date.now()) {
  if (!Number.isFinite(now) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  if (raw.schemaVersion !== SUITE_SCHEMA_VERSION || raw.plan !== SUITE_PLAN_ID ||
      raw.status !== 'active' || raw.source !== 'trusted-billing') return false;
  const expiry = typeof raw.expiresAt?.toMillis === 'function'
    ? raw.expiresAt.toMillis()
    : typeof raw.expiresAt === 'string' ? Date.parse(raw.expiresAt) : NaN;
  return Number.isFinite(expiry) && expiry > now && expiry <= now + MAX_FUTURE_MS;
}

export function membershipForClient(raw, now = Date.now()) {
  // No production membership, even a future-dated Admin SDK record, can be
  // described as active before BOTH billing and the SKU release are reviewed.
  if (SUITE_RELEASE !== 'live' || !validTrustedSuiteMembership(raw, now)) return free;
  const expiry = typeof raw.expiresAt?.toMillis === 'function'
    ? raw.expiresAt.toMillis() : Date.parse(raw.expiresAt);
  return Object.freeze({
    schemaVersion: SUITE_SCHEMA_VERSION, plan: SUITE_PLAN_ID,
    active: true, features: SUITE_FEATURES,
    expiresAt: new Date(expiry).toISOString(),
  });
}

// For FUTURE server-only premium handlers. Never make an allow/deny decision
// from a browser membership badge, email, CyberTrace native UID, XP or score.
export function suiteFeatureAllowed(raw, feature, now = Date.now()) {
  return typeof feature === 'string' && SUITE_FEATURES.includes(feature) &&
    membershipForClient(raw, now).active === true;
}
