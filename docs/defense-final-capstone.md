# BLACKBOX final capstone: independent, supervised *knowledge* assessment

## Chosen first group
`blackbox:defensive-analysis:v1`: logs, integrity, HTTP headers, email.
These four areas already have practical synthetic evidence workshops in
`/evidence-labs.html` and the public training-kit.

New learner route: **`/defense-final.html`**. It is also linked from the
training workshop and certificate center. Dark-blue Arabic responsive UI;
no guest/user progress is upgraded or replaced.

## Final examination architecture
- **Source of truth:** `defenseFinalCatalog/defensive-analysis` and separate
  `defenseFinalRubrics/defensive-analysis` in BLACKBOX Firestore.
  They are ADMIN-SDK-ONLY and currently **NOT populated or enabled**.
- Independently authored new bank: **at least four distinct private exam items
  per domain** (16 minimum), with four plausible choices and at least two
  synthetic evidence lines each. Four domains * three sampled items = **12
  questions/session**, randomly chosen using cryptographic randomInt.
- Rubric includes one correct choice for each item and is withheld from all
  client responses, source control and logs.
- Passing policy: **at least 10 of 12 correct** AND **at least two
  correct per each of the four domains**.
- Every exam session: **25-minute TTL**, at most **3 sessions/rolling
  24 hours/BLACKBOX UID**, transactional one-time submission, ownership check,
  catalog SHA-256 digest, version and approved rubric checks.
- No caller-provided UID/score/answers/approval is accepted. The trusted result
  is stored server-side in
  `blackboxUsers/{uid}/defenseFinalResults/defensive-analysis_v1`.
- A new administrator-disabled or edited catalog/rubric invalidates a cached
  pass for readiness and portfolio submissions, even if the version field
  was accidentally left unchanged.

## Evidence portfolio: review != independent proof
- Only users with a currently valid **server-side passing final score**
  can submit four structured evidence reports (logs, integrity, headers,
  email). The browser calculates **SHA-256** of a selected local file and
  submits only checksum, learner-written summary and evidence limitations.
- Real files **are not uploaded**. The digest is a consistency aid, not proof
  of execution or originality. A learner can fabricate, edit or reuse it.
- Stored under `blackboxUsers/{uid}/defenseFinalEvidence/defensive-analysis_v1`
  with `pending-review`, never `practicalEvidenceVerified:true`. A
  reviewer may set **needs-revision** or **reviewed-unverified** only.
  Review actions create immutable
  `defenseFinalReviewAudit/{randomUUID}` records.
- Reviewer-only callables demand both BLACKBOX Auth, App Check **and a trusted
  Firebase Auth custom claim** `certificateReviewer === true`.
  Self-review forbidden. Do not grant this claim from client application code.
- Two portfolio revisions maximum. No automatic certificate issuance.
- No secrets, production addresses or personal data may be submitted.

## Pre-release operational checklist
1. Author and peer-review NEW independent exam scenarios. Public synthetic
   training fixture solutions MUST NOT be reused as exam answer keys.
2. Provision the 16+ reviewed catalog items and matching secret rubric with
   Firebase Admin SDK in a protected staging project. Never commit rubric.
3. Run Firestore rules and Cloud Functions callable emulator tests, including
   wrong-user UID, expired/replayed sessions, concurrency, bank changes,
   revoked App Check, quota abuse and reviewer custom claim bypass.
4. Configure and verify production App Check/ReCaptcha Enterprise and deploy
   selected Firebase Functions + Firestore rules separately; Vercel deployment
   does not deploy Firebase Functions.
5. Complete actual *independent* practical execution verification. A text
   summary and SHA-256 alone cannot demonstrate Kali/VirtualBox work.
6. Independently review and sign group policy, issuance, verification and
   revocation lifecycle for real test users before considering any credential.
7. Keep the backend `CERTIFICATE_ISSUANCE_ENABLED=false` and BLACKBOX
   manifests `issuableByGradingService:false` until every gate is satisfied.
   This PR must NOT change these flags.

## Threat-model highlights
- Reused old completed training progress: never authoritative.
- Client-submitted UID, scores, rubric or approval: rejected.
- Correct guesses by brute force: 3 starts / rolling day, randomized variants;
  content must be independently reviewed and rotated if leaked.
- Rubric/catalog changed mid-session: digest mismatch fails closed.
- Prior pass after catalog change: invalidated for portfolio readiness.
- Browser-supplied documents: treated as user claims, no automatic practical
  competence verified.
- Unauthorized reviewer: denied by Firebase Auth custom claim.
- Certificate issuance: existing server feature gate remains OFF.
