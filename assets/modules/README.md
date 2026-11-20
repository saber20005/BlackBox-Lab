# BLACKBOX internal modules

Browser-side ES modules whose own filenames are not public page entry points:

- `training/lab-catalog.js` — manual lab metadata and validation.
- `training/documentation-templates.js` — optional documentation text templates and checks; no saving side effects.
- `training/training-hints.js` — stage hint content and reveal UI; no progress changes.
- `diagnostics/ux-test-model.js` — self-reported UX feedback summary only.
- `diagnostics/recaptcha-diagnostic-core.js` — standalone reCAPTCHA probe; receiving a token is not Firebase attestation.

Keep the public HTML/JS entrypoints at their existing URLs. Update runtime imports, references, tests, and structural checks together. Never store private keys or scoring rubrics in browser modules.
