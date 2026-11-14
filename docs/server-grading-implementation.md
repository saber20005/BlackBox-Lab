# Server grading foundation (not deployed)

Two Firebase callable Cloud Functions are provided in `functions/index.js`: `startGradingSession` and `submitGradingAnswer`. Both require Firebase Authentication and App Check; the latter computes a score from a server-only rubric inside a Firestore transaction and consumes each session once. Neither accepts a client-provided score.

**No rubric is installed by this PR.** All cases fail closed until an administrator creates a validated, enabled `gradingRubrics/{caseId}` document in the correct Firebase project. Do not put answer keys in web assets or GitHub. The collection is inaccessible to clients under the existing deny-by-default rules. The backend uses Admin SDK, which bypasses Firestore client rules.

## Before production
- Decide whether the existing 28 CyberTrace investigations have independently gradable responses. Do not use this simple exact-answer grader for open-ended investigations; implement and test a proper server-side rubric per case.
- Configure billing, IAM, Firebase App Check provider, allowed domains, quotas and abuse protection. App Check is not a replacement for rate limits.
- Provision rubrics through a controlled admin-only workflow; verify each rubric and score range. Add server-side session creation quotas (per user/IP/case), monitoring and retention/cleanup policies before enabling functions.
- Integration-test Auth/App Check, Firestore transactions, replay, concurrent requests, rubric changes, malicious submissions, service failures and costs using emulators. The included unit tests do not cover the deployed functions.
- Ensure the Firebase project selected for deployment is `black-box-lab`. No deployment is performed by this PR.
- Add a distinct verified-results UI. Keep existing `cybertrace` receipts labelled self-reported, and do not award certificates based on them.

Local pure tests: `node --test functions/tests/*.test.mjs`.
