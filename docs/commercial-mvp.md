# Commercial MVP: student-first, non-destructive rollout

## Target
Cybersecurity students and beginners. Validate a useful free learning journey before taking payment.

## Non-negotiable compatibility
- Do not rename existing progress storage keys or case/stage identifiers.
- Do not auto-migrate or overwrite guest progress; retain explicit import and backup behavior.
- Do not paywall content currently available to existing learners.
- Keep XP and self-confirmed completions distinct from verified achievements and paid entitlements.
- No live payment provider, secrets, or Firebase rules changes in this branch.

## Rollout gates
1. Run existing test suite and the new commercial safety tests.
2. Verify guest, email and Google sign-in, account switching, export/import, and multi-device synchronization with test accounts.
3. Confirm legacy and newly added stages/cases remain accessible.
4. Launch an opt-in beginner journey behind a disabled-by-default feature flag.
5. Add privacy-safe activation/retention measurement only after consent and event-schema review.
6. Validate purchase intent before payment integration. Enforce paid access on a trusted backend, not localStorage or client flags.

## Initial metrics (targets, not results)
- 50 learners attempt the journey.
- At least 40% finish the first guided journey.
- At least 25% return within seven days.
- Five actual paid subscriptions before expanding premium scope.

## Release protocol
Merge only after CI and manual browser tests. Ship the beginner journey independently of subscription entitlements. Back up and verify user progress before any future data migration.
