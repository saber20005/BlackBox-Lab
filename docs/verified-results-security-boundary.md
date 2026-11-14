# Verified CyberTrace results — security boundary (phase 1)

## Current status
This change reserves `blackboxUsers/{uid}/verifiedCybertrace/{caseId}` as an owner-readable, **client-write-denied** collection. No backend verifier or verified-result writer is deployed by this change. No existing receipt is promoted or relabeled.

The existing `blackboxUsers/{uid}/cybertrace/{caseId}` collection is **legacy, client-reported** training progress. Its 0–70 scores can be submitted by the authenticated owner and must not be described as independently verified.

## Future server-side grading protocol (not implemented)
1. Authenticated user requests a new challenge session from a trusted backend. Enforce Firebase Auth token verification, App Check where suitable, abuse throttling, session expiration and per-user quotas.
2. Backend issues a single-use, high-entropy session identifier; persist its owner UID, case ID, challenge version, expiry and server-only challenge state. Never ship scoring secrets or answer keys to the browser.
3. User submits a response to the backend, not a score. Backend validates ownership, session status and answer against server-held challenge state; record an immutable audit event.
4. Backend computes score and writes to `verifiedCybertrace` via Admin SDK within an idempotent transaction, preserving highest valid score and evidence metadata. Reject replayed and cross-user sessions.
5. UI reads verified and legacy paths separately. Display distinct badges: “verified by server” vs “self-reported (legacy)”. Never add legacy scores to a verified leaderboard or certificate.
6. Add emulator integration tests for forged score, missing/wrong Auth, replay, expiry, case mismatch, concurrent submissions and backend failure. Review production IAM and deploy only after tests pass.

## Compatibility
- Preserve existing `/cybertrace` documents and `state/progress` unchanged.
- This rules-only change cannot make existing client-side investigations independently verifiable.
- Admin SDK bypasses Firestore security rules; use least-privilege service accounts, backend input validation, audit logs and rate limits.
- A client-readable verified result may be cached; UI must not mistake a cached result for a new successful submission.

## Release gate
Do not advertise certificates, verified scores, or public Cyber Range operation until a real trusted backend, end-to-end tests, and isolation checks are deployed and demonstrated. Production rules deployment requires explicit review and project-owner approval.
