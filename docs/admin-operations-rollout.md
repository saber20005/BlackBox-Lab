# BLACKBOX administrator operations — read-only backend pilot

A separate draft PR adds a private `getAdminTrainingOverview` Firebase callable for future BLACKBOX administration. **It is not deployed** by these GitHub changes. The current training workspace, user progress, grades, certificate issuance and Firebase Rules remain untouched.

## Verified authorization boundary
- Callable requires Firebase Auth and App Check, and accepts no business parameters.
- Before returning a public catalog-derived summary, it independently checks the raw signed Firebase ID token with `getAuth().verifyIdToken(token,true)` and current Firebase user record with `getAuth().getUser(uid)`.
- Both the signed token and current user record must carry `admin: true`, UID must equal the caller UID, and the account must not be disabled. Any Firebase Auth failure or revocation fails closed.
- Only owner status is considered; matching email cannot grant access.
- No paths to users' Firestore data are read, no scores are trusted, and no mutation is available.

## Metrics honesty
The initial response contains only reviewed **published training-content** statistics: ten tracks, thirty stages and three editorial groups, with CI ensuring they match `data.js`. It returns `metrics: null` and clearly marks unavailable user totals, verified results, revenue and audit events. Do not confuse these with actual usage.

## Validation and release restrictions
`node --test functions/tests/admin-operations.test.mjs`, then the full GitHub quality and callable emulator suites. On an eventual preview, use a dedicated test administrator and verify authenticated admin, non-admin, disabled, revoked and logout paths. A separate frontend admin UI may be built only after this secure backend can be deployed and manually verified.

This change never adds an admin role to a user, never enables any certificate, never publishes to Firebase or Vercel, and deliberately does not consume personal user data.
