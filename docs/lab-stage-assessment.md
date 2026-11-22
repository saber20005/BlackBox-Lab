# BLACKBOX lab-stage knowledge assessment (staged, not a credential)

This backend supports 30 stage identifiers across 10 tracks. Each stage must
have a separately reviewed public `labStageCatalog/<stageKey>` document
and private `labStageRubrics/<stageKey>` document, both schema version 1,
reviewed and enabled by an administrator. Nothing is pre-provisioned.
Both are inaccessible directly to browsers under Firestore security rules.

A learner signed into BLACKBOX with valid App Check may request a limited
15-minute session; max five sessions per hour. The server chooses five
admin-reviewed multiple-choice evidence-analysis tasks, keeps correct answers
in a private rubric, and transactionally consumes the session before writing
the owner-specific best score. No browser-submitted score, XP, old notes,
completion checkbox, or case progress is accepted as proof.

**CRITICAL:** This is a **knowledge assessment only**. It is *not* proof
of actual Kali/Linux lab execution or independent control of a local VM.
Even a 70/70 result returns `credentialEligible:false`. All BLACKBOX
certificate manifests remain `issuableByGradingService:false` and the
global `CERTIFICATE_ISSUANCE_ENABLED=false` gate remains unchanged. A
future trustworthy lab-observation/evidence verifier and owner-approved
rubrics are required before BLACKBOX groups can issue verified credentials.

Deploy only after Firebase Admin cross-account function and App Check
configuration are reviewed. Vercel does not deploy Cloud Functions.
Test owner switch, tab replay, rate limits, invalid/expired sessions,
disabled rubrics, Firestore rules, offline failures, and abuse of choices.
