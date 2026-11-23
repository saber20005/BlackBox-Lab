# BLACKBOX Lab security review — 2026-11-23

## Scope
Reviewed `firestore.rules`, `functions/index.js`, `functions/certificate-issuance-service.js`, `functions/suite-membership.js`, `tests/firestore-rules.test.mjs` and the cross-platform CyberTrace receipt design. Added a new **isolated Firestore emulator test** to demonstrate that a user-reported CyberTrace receipt cannot forge a trusted certificate or verified result. No live penetration test or production write was performed.

## Main results

| ID | Status | Evidence | Interpretation |
|---|---|---|---|
| BB-01 | Positive security boundary (checked-in rules) | `blackboxUsers/{uid}/verifiedCybertrace/*`, `certificateRegistry/*`, private rubrics/policies and certificate award pointers all deny browser writes; existing tests cover owner/other/guest reads and forgery. | Client-reported XP/scores cannot directly create verified awards through these Firestore rules. Production-deployed rule version is **not independently confirmed**. |
| BB-02 | Intentional self-report limitation | `blackboxUsers/{uid}/cybertrace/{caseId}` accepts signed-in owners' allowed scores up to 70; the new test proves that a maximum *legacy* score can be submitted but does not grant authority to write verified results or certificates. | Keep this separate from `verifiedCybertrace`. Never use a legacy receipt as certificate evidence. |
| BB-03 | Positive application-level gating | Callables require signed-in Firebase UID and `enforceAppCheck:true`; the reviewed certificate issuance handler has hard gate `CERTIFICATE_ISSUANCE_ENABLED=false`. `functions/suite-membership.js` has `SUITE_RELEASE='not-for-sale'`. | Both credentials and Pro activation are intentionally off in source, even if browser UI is present. Their live deployment/configuration needs separate confirmation. |
| BB-04 | Unverified production configuration | Owner-level IAM, deployed Firebase rules/Functions revision, App Check attestation, API key restrictions, token revocation procedures, and abuse controls cannot be read solely from repository code. | Do not claim production is secure just because GitHub tests/builds and Vercel deployment are green. |

## Next gates
1. Export deployed Firestore rules from Firebase project `black-box-lab` under authorized administrator access; compare line-by-line with `firestore.rules` and test exported rules in an emulator.
2. Confirm private rubric/answer key provisioning, session ownership, quotas, server-side grading integrity and custom reviewer claim revocation. Never substitute user-reported local notes or stage checkboxes.
3. Test two synthetic accounts A/B plus guest against owner and server-only paths in isolated emulator; deny cross-account reads and writes.
4. Triage dependencies, exposed env vars, service account roles, Logs/Monitoring and App Check statistics in the project owner's consoles.
5. For automated adversarial testing, use disposable synthetic lab and controlled scanner scope. Do not run on production or real user accounts until a scoped plan is approved.

## Status
Source review performed; draft regression test supplied. **No confirmed unauthorized cross-user access or certificate forgery demonstrated** by these tests. **Not equivalent to an independent production penetration test.**
