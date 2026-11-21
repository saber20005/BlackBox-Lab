# Scale readiness v1 — BLACKBOX Lab

## Current architecture
BLACKBOX is a Vercel-served static JavaScript workspace with Firebase
Authentication/Firestore and separately deployed Firebase Functions. There
is no self-managed VM fleet requiring a load balancer. Account state uses
revisioned optimistic writes, owner-specific storage, conflict prompts,
pending-draft recovery and test coverage. We must **not** replace that safe
design with naïve silent overwrites for the sake of speed.

The owner-scoped `blackboxUsers/{uid}/cybertrace` listener retained all existing
authorization and normalization checks. The only runtime change suppresses an
identical, already-delivered skills receipt payload (including cache state).
The first cache snapshot, the later server-confirmed snapshot, and actual
receipt changes are still delivered; duplicate metadata echoes no longer
force extra UI updates. **This does not reduce Firestore-billed reads by
itself.** No changes are made to certificates or assessment trust.

## Local-only baseline
`node scripts/local-load-smoke.mjs http://127.0.0.1:4173/` samples a
developer-owned local static HTTP preview only. It rejects production hosts,
all non-loopback addresses, paths beyond /, HTTPS, redirected destinations,
and more than 16 requests or two concurrent clients.

A tiny HTTP smoke run is NOT a stress benchmark and cannot justify a
maximum concurrent-user claim. The script intentionally does not query
accounts, local agents, Firebase Admin, or any real-user records. For
scaling decisions, collect real production Core Web Vitals and Firebase usage
and compare them with local emulator tests using synthetic data.

## Future breakpoints to measure before changing architecture
- LCP/INP and payload sizes by device/route; avoid duplicate JS and unused CSS
  while preserving public static links.
- Firebase reads/writes per learner session and linked receipt listener.
- Functions concurrency, cold starts, App Check rejection and per-user quotas.
- Offline reconnection, second-device conflicts and recovery of unsynced
  notes. These are non-negotiable safety properties, not optional features.

No new hosting plan, server, Redis cache, DB replica or paid feature
is warranted until measurements demonstrate a bottleneck.
