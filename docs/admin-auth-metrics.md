# Admin account metrics — release checklist

The dashboard returns aggregates only from this site's own Firebase Authentication project. Counts include existing accounts (including disabled), new existing accounts today, distinct accounts with last sign-in today/rolling 7 or 30 days, linked Google and password providers, and disabled accounts. Calendar day: Asia/Amman. Provider counts overlap. Deletions and snapshot races affect counts; these are not historic registration or event totals.

Individual login counts remain null. Enable user activity logging only with owner approval after reviewing cost/retention: https://cloud.google.com/identity-platform/docs/activity-logging . Validate real successful password and Google sign-in examples and failed attempts, linking, MFA, token refresh and sign-up before deriving event counts. Never treat a request or a provider link as a successful login. Do not expose raw activity logs, UIDs, emails, tokens, IP addresses, or passwords in the UI.

Release gates: run CI, verify guest and non-admin denial, revoke/remove admin role and test stale token denial, check project isolation, compare counts to Firebase console, check mobile and desktop, ensure no loss of progress. Default is disabled. Do not enable logging or change IAM automatically; never publish service-account keys. No changes to existing Auth flow or Firestore Rules.

## BLACKBOX (black-box-lab)
- Standalone page: /admin/ (sign into BLACKBOX first).
- Deploy only the reviewed getAdminAuthMetrics callable after ensuring the runtime service account has read-only firebaseauth.users.get in black-box-lab, current custom admin claim, and working App Check. Set ADMIN_AUTH_METRICS_ENABLED=true in the approved Functions environment only after tests. No need to enable grading. Function is limited to two instances, reads current admin state on every call, coalesces scans and caches aggregate for 60 seconds per instance. Never enable unrelated functions or rules as part of this release.
