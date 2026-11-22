# CyberTrace × BLACKBOX Suite Pro — entitlement release gate

## Decisions carried over from the agreed plan
- One future paid plan for both websites, anchored to an authenticated
  **BLACKBOX Firebase UID**. CyberTrace uses an entirely separate Firebase
  Auth project; matching emails or UID strings never prove account ownership.
- Free keeps the currently published investigations, BLACKBOX lab routes,
  XP, progress sync, analysis tools and the three local-scored SOC shifts.
- New (not yet published) premium content is planned: multi-stage advanced
  investigations and SOC shifts, server-verified scoring and advanced
  performance reports. No existing free content is downgraded.
- No final price, billing provider, paid subscription, webhook, entitlement
  provisioning, refund or cancellation automation is implemented.
- `getSuiteMembership` (BLACKBOX Firebase Auth + App Check required)
  reads a **server-owned** `suiteMemberships/{blackboxUid}` document.
  Firestore rules deny all browser reads and writes to this collection.
  No browser-supplied email, UID, XP, certificate or case score can grant Pro.

## Strict release gate added in this phase
`SUITE_RELEASE = 'not-for-sale'` is a SOURCE-CODE gate. The public callable
returns the exact Free envelope even if an administrator accidentally creates
an otherwise valid active membership record in Firestore. The future
`suiteFeatureAllowed` helper fails closed for all features while the gate
is closed. Do not flip this until billing webhooks, replay protection,
refunds/cancellations, audit logs, and independently authorized premium
server resources have been completed and tested.

The **UI badge is only informational**; all premium Cloud Functions must
independently verify a fresh BLACKBOX token and an active server membership
before returning premium content. Never ship answer keys or premium
assessments in a public React bundle or Firestore owner-writable document.

## Before selling or announcing paid enrollment
1. Approve feature-based SKU, delivery/cancellation policy and actual price.
2. Select and configure a provider allowed to serve the target regions;
   do not accept payment details directly in these applications.
3. Use provider-signed webhooks with idempotency and a server-side event log.
4. Test trial (if offered), renewal, expiry, failed charge, cancellation,
   refunds, replay events, deleted/relinked accounts, App Check failures.
5. Protect every paid resource SERVER-SIDE, ship meaningful new training
   content, and test account linking across both Firebase projects.
6. Perform staged production verification before changing the release gate.
