# Certificate verification deployment — manual, reviewed only

New workflow `.github/workflows/firebase-certificate-verifier.yml` is NEVER
triggered by push, PR, Vercel or cron. To execute, an authorized repository
maintainer must select **main** and type the exact confirmation
`DEPLOY_VERIFIER_ONLY`. Create a protected GitHub Environment named
`firebase-certificate-verifier` with required reviewer approval and the
following **non-secret** environment vars: `GCP_WIF_PROVIDER` (trusted
Workload Identity Provider resource) and `GCP_DEPLOY_SERVICE_ACCOUNT`
(least-privilege deployer service-account email). Configure the Google
Cloud workload identity pool to trust only the intended repository, branch
and protected environment. No service-account JSON secrets or Firebase
long-lived refresh tokens should be stored in the repository.

The workflow tests the staged backend, deploys **only**
`verifyIssuedCertificate` to the correct Firebase project, then probes a
random synthetic 128-bit certificate ID. A properly deployed verifier must
return HTTP **404 with JSON** `{status:"not-found",valid:false}`.
A platform-generated HTML 404, HTTP 200, redirect or unstructured response
fails the smoke check; it never implies a certificate exists.

**Not included in this deployment:** `issueGroupCertificate`,
`beginVerifiedLabStage`, `submitVerifiedLabStage`, cross-project identity
callables, private rubrics or `firestore.rules`. Those require separate owner
review, rollout and dedicated emulator testing for the new collections.
The global certificate issuance gate stays FALSE. Production Firestore
indexes/owner projects must be validated separately; deploying a new Vercel
build cannot substitute for Firebase Functions release.
