# BLACKBOX pre-release security gates — 26 November 2026

This test-only change keeps the reviewed release policy explicit. The regression suite in `functions/tests/prelaunch-security-gates.test.mjs` verifies **checked-in code**, not currently deployed Functions.

- Certificate issuance: `CERTIFICATE_ISSUANCE_ENABLED = false`. No verified award is automatically released by an administrator toggling a Firestore policy.
- Unified paid suite: `SUITE_RELEASE = 'not-for-sale'`. Even a future-dated billing-shaped document is denied by the server model.
- Server grading: case grading requires an explicitly enabled private rubric. The repository does **not** have a universal `grading.enabled: false` switch; actual per-case rollout requires verifying production private rubrics and Functions revisions.
- App Check: all 17 current `onCall` exports have `enforceAppCheck: true` specified in code. The test ensures this cannot be silently omitted in later changes.

## Remaining security release prerequisites

**Never claim the following are verified by source tests.** A Firebase project administrator must inspect:
1. The currently *deployed* Firestore rule release for `black-box-lab` and compare it with GitHub `firestore.rules`.
2. Deployed Functions revisions, service-account IAM, callable exposure, and App Check enforcement settings in production.
3. Two synthetic accounts plus an unauthenticated context in a disposable emulator for owner reads, cross-user denial, certificate writes, receipt replay and identity linkage.
4. Server rubric provisioning, grading answer secrecy, idempotency, credential revocation and certificate revocation authority.
5. A separate security-reviewed release with rollback if authenticated grading, verified certificates or paid subscriptions are ever enabled.

**Do not publish Firebase rules, functions, billing or certificate features as part of this PR.** No production data migrations are needed.
