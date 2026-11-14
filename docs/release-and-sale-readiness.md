# BLACKBOX release and sale readiness checklist

This checklist distinguishes repository evidence from verified production behavior. Do not market the app as an automated cyber range or verified certification platform until the corresponding acceptance tests pass.

## Automated checks
- GitHub Actions runs offline unit tests and Firestore rules against a local emulator on PRs.
- A green workflow proves only the tested code and emulator rules, not production Firebase configuration.
- Do not deploy or merge changes if checks fail.

## Production verification (requires account owner)
- Confirm live Firestore rules match reviewed repository rules without overwriting other app paths.
- Test owner, different authenticated user, and unauthenticated visitor with disposable test accounts.
- Verify Email/Password, Google login, account recovery, logout, offline writes, and sync conflicts.
- Confirm domain ownership, renewal cost, Vercel project ownership, Firebase billing and transferable access.
- Record browser checks on mobile and desktop and Lighthouse/Core Web Vitals measurements.

## Trust boundary
- Current CyberTrace receipts under `blackboxUsers/{uid}/cybertrace/{caseId}` are client-reported scores, NOT verified achievements.
- Current practical-stage completion is user-confirmed, not independently observed.
- Never convert these into verified certificates or server-trusted awards by relabeling.
- Future server verification must write to a distinct server-only path and preserve legacy history.
- No public web user may directly access the owner's VirtualBox, Kali VM, host OS or LAN.

## Lab orchestration acceptance criteria
- Create an isolated disposable training session for an authenticated user.
- Allocate a bounded runtime, memory and network policy; isolate other users and host network.
- Verify challenge state server-side; collect only necessary evidence.
- Enforce expiry, cleanup and abuse limits; test concurrent users and failure recovery.
- Document infrastructure costs before public rollout.

## Intellectual property and sale
- Inventory code, learning content, images, fonts, third-party dependencies, licenses and domain.
- Confirm ownership and transfer rights; absence of LICENSE does not establish rights to third-party materials.
- Prepare installation/runbook, architecture diagram, deployment guide, disaster recovery and buyer handover.
- Separate BLACKBOX assets from CyberTrace and list exact rights to any cross-site integration.
- Export only privacy-compliant aggregate analytics; do not sell personal learner data without legal basis.

## Business proof
- Track signups, activation, completion, retention, costs and paid conversions with consent and privacy controls.
- Do not describe the product as profitable, revenue-generating or a proven SaaS while there are zero users/revenue.
