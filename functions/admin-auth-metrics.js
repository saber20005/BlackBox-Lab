// Server-only account snapshot. Does not count individual login events.
// Provider counts are linked identities, not sign-in method counts.
const zone = 'Asia/Amman';
const dateKey = new Intl.DateTimeFormat('en-CA', {timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit'});
function timestamp(value) {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}
export async function readAuthAccountMetrics(listUsers, {now = Date.now(), maxPages = 20} = {}) {
  if (typeof listUsers !== 'function' || !Number.isFinite(now) || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error('invalid-metrics-options');
  const today = dateKey.format(now);
  const metrics = {totalAccounts:0, disabledAccounts:0, accountsCreatedToday:0, accountsLastSignedInToday:0, accountsLastSignedIn7d:0, accountsLastSignedIn30d:0, googleLinkedAccounts:0, passwordLinkedAccounts:0, loginEventsToday:null, googleLoginEventsToday:null, passwordLoginEventsToday:null, asOf:new Date(now).toISOString(), timezone:zone};
  const seen = new Set(), tokens = new Set();
  let pageToken;
  for (let page = 0; page < maxPages; page++) {
    const response = await listUsers(1000, pageToken);
    if (!Array.isArray(response?.users)) throw new Error('invalid-user-page');
    for (const user of response.users) {
      if (typeof user?.uid !== 'string' || !user.uid) throw new Error('invalid-user-record');
      if (seen.has(user.uid)) throw new Error('duplicate-user-record');
      seen.add(user.uid);
      metrics.totalAccounts++;
      if (user.disabled === true) metrics.disabledAccounts++;
      const created = timestamp(user.metadata?.creationTime);
      const signed = timestamp(user.metadata?.lastSignInTime);
      if (created !== null && created <= now && dateKey.format(created) === today) metrics.accountsCreatedToday++;
      if (signed !== null && signed <= now) {
        if (dateKey.format(signed) === today) metrics.accountsLastSignedInToday++;
        if (now - signed < 7 * 86400000) metrics.accountsLastSignedIn7d++;
        if (now - signed < 30 * 86400000) metrics.accountsLastSignedIn30d++;
      }
      const providers = new Set((user.providerData ?? []).map(p => p.providerId));
      if (providers.has('google.com')) metrics.googleLinkedAccounts++;
      if (providers.has('password')) metrics.passwordLinkedAccounts++;
    }
    if (!response.pageToken) return metrics;
    if (typeof response.pageToken !== 'string' || tokens.has(response.pageToken)) throw new Error('invalid-pagination');
    tokens.add(response.pageToken);
    pageToken = response.pageToken;
  }
  throw new Error('account-scan-limit-exceeded');
}
