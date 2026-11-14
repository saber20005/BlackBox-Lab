# Callable grading: remaining verification gates

## Confirmed in CI
- Firestore rules deny client writes to verified results.
- Atomic grading transaction tests cover replay, ownership, expiration, and best score.
- Callable emulator rejects anonymous requests, forged bearer tokens, and valid Auth-emulator tokens missing App Check.

## Not yet confirmed
- An App Check token issued and verified for the actual production application.
- Successful authenticated, App-Check-protected callable start/submit round trip.
- Correct handling of missing, invalid, revoked, or replayed App Check tokens in production.
- Client integration and secure provisioning/versioning of grading rubrics.
- Real-world load, cost, monitoring, quotas and abuse resilience.

## Release gate
Do not mark grading production-ready, deploy functions, or enable rubrics until the positive-path Auth + App Check + Functions emulator flow and production configuration are separately reviewed. Emulator acceptance alone does not prove production App Check attestation.
