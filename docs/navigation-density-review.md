# BLACKBOX navigation density review

Reviewed the production main workspace after the Suite Pro link was added.
The desktop sidebar has four main training routes plus the independent
informational Suite Pro link. The mobile sidebar CSS uses a four-column grid,
so the fifth Pro item causes a second row and conflicts visually with the
already-visible Pro topbar CTA.

Fix: on widths <=700px the Pro sidebar duplicate is hidden **visually and from
the tab order** through display:none; the blue Suite Pro button remains in the
persistent topbar and another copy remains in the tools menu. The sidebar now
has exactly four primary training actions on one row. Tight widths get
slightly smaller spacing, wrap-safe labels and a flexible save-status message.
Desktop stays unchanged and the optional bottom dock is untouched.

No auth, Firestore, progress, local-agent, verified results or premium
authorization logic changes. Suite Pro is still not for sale.
Verify 360px/390px/680px layouts, keyboard focus, topbar saving status and
Pro links before production. Vercel rate limiting is independent of CI.
