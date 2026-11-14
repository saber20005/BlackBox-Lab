# BLACKBOX Lab — platform architecture and delivery gates

## Product goal
Build a guided Arabic cyber range with progressive paths and isolated, authorized practice labs. Inspired by the *learning model* of TryHackMe and the *challenge model* of Hack The Box, without copying their branding or content.

## Verified versus proposed
- Existing static learning application, accounts, progress and reports: implemented in repository; production behavior requires separate verification.
- Verified server-side grading: gated off in `account-config.js`; do not enable until App Check, callable deployment and end-to-end checks pass.
- Local VM lab catalog: metadata only (`lab-catalog.js`). **No VM automation exists yet.**
- VirtualBox/Kali integration: proposed, not implemented.
- Cloud per-user machines, flag verification, leaderboards, subscriptions: proposed, not implemented.

## Security boundaries
1. Browser never receives host hypervisor credentials and never executes arbitrary host commands.
2. Future local agent runs on the user's own computer with explicit pairing, origin validation, least privilege, an allowlist of VM IDs and operations, and a visible stop control.
3. Labs default to Host-Only networking. Never silently switch to Bridged, public IPs or unrestricted outbound traffic.
4. Never treat browser-supplied completion or flags as verified results. Validate server-side, enforce account ownership, expiration and replay protection.
5. Enforce quotas, TTLs and cleanup for cloud machines before multi-user rollout.
6. No App Check bypass or disabling security enforcement to meet release deadlines.

## Delivery gates
1. **Catalog foundation**: static metadata, schema checks, unit tests; no automatic machines.
2. **One real local lab**: reproducible setup, network isolation proof, teardown and evidence collection on Windows + VirtualBox + Kali.
3. **Paired local agent prototype**: authenticated loopback channel, explicit user approval, constrained VM operations and integration tests.
4. **Server grading**: production App Check token success, deployed functions, secrets provisioned, negative authorization tests and real end-to-end scoring.
5. **Multi-user service**: isolated sessions, quotas, logs, monitoring, incident response and cost limits.
6. **CTF and rankings**: verified scores, abuse controls and auditability.

## Immediate blockers
- reCAPTCHA Enterprise `execute` fails independently of Firebase on the production origin. The cause remains unproven; do not assert that App Check is fixed.
- Host-side agent, isolation verification and VM lifecycle are not implemented.
- No proof of production grading end-to-end.

## Acceptance criteria for a first real lab
- Documented Windows/VirtualBox/Kali setup and deterministic target image.
- No bridge to the user's LAN or public network.
- Launch, verify, reset and stop steps tested on a clean machine.
- Evidence submission, expected answer rubric and secure server-side verification.
- Accessible Arabic UI and recoverable error states.
