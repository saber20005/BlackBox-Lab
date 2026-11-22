# Dual Firebase identity proof — staged, not an automatic data merge

**CyberTrace Firebase project:** `cybertrace-48ab0` and
**BLACKBOX Firebase project:** `black-box-lab`.

A user must actively authenticate both projects, authorize linking, and submit
a freshly issued CyberTrace Firebase ID token to the BLACKBOX callable.
The BLACKBOX callable independently verifies its own signed Firebase Auth
context and App Check; Firebase Admin verifies the CyberTrace token issuer,
signature, audience, expiry, and revocation. Both authentications must have
`auth_time` within 10 minutes. Email/displayName is never used as identity.

The server stores an owner-scoped link and a SHA-256 namespace-separated
unique claim **in one transaction**, rejecting a CyberTrace account linked to a
different BLACKBOX account or vice versa. Direct browser access to the claims
index is prohibited by Firestore rules. Repeated exact links are idempotent.
Unlinking removes both records transactionally, without deleting training
history or silently revoking historically issued credentials.

No ID token is stored; do not log it, record it in analytics or URL parameters.
This feature does **not** make unverified legacy CyberTrace browser grades
eligible for certificates. A future issuance gate should check the server
link and reviewed per-case grading proof before awarding CyberTrace groups.

**Deployment:** these exports require a separately authorized Firebase CLI
`firebase deploy --only functions:linkVerifiedCyberTraceAccount,functions:getVerifiedCyberTraceLink,functions:unlinkVerifiedCyberTraceAccount`
and publication of the reviewed Firestore rules in `black-box-lab`.
Vercel deploys ONLY the web sites, not the Firebase functions. Admin runtime
may need Cloud IAM access to check token revocation across the CyberTrace
project; if access is denied, fail closed and leave linking unavailable.

Manual acceptance: reauthenticate each account; test same account, distinct
emails, wrong Firebase token, expired/stale token, sign out/switch during
request, third-party account claim, unlink, and two concurrent link attempts.

## Proof check for each issuance

The CyberTrace issuer branch now reads BOTH the BLACKBOX owner's link and the
server-only hashed exclusive CyberTrace UID claim inside its existing Firestore
issuance transaction. Missing, inconsistent, reassigned or removed claims
cause `identity-link-required`, even on a repeated award request.
This is separate from verified scoring. The global issuance hard gate remains
disabled. Unlink does not silently revoke historical certificates; an
administrator must review and revoke with the existing audit trail.
