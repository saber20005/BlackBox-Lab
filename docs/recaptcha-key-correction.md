# Correct the copied reCAPTCHA site-key identifier

**Status: the Google acquisition defect is identified; overall App Check attestation remains unresolved. This branch has not been verified as deployed production code.**

The configured public site key differs from the owner's existing Google key in two visually similar characters. Correcting those characters lets the controlled candidate flow acquire a Google result and reach Firebase's token-exchange endpoint. Firebase then rejects attestation with HTTP 403, so this change must not be described as a complete App Check fix.

## Evidence for the identifier correction

The owner supplied a 40-character ASCII representation of the key returned by the administrative lookup. Decoding and comparing all 40 code points against `account-config.js` found exactly these differences:

| Position, counting from 1 | Array index | Configured character | Owner's character |
| --- | --- | --- | --- |
| 27 | 26 | uppercase `I` (73) | lowercase `l` (108) |
| 35 | 34 | uppercase `O` (79) | digit `0` (48) |

The resulting public identifier is:

```text
6Le83x8uAAAAACsU1HBgr_omCXlPcBubyd0OBffI
```

The redacted comparison results are recorded in [the dated evidence file](evidence/recaptcha-key-correction-2026-11-16.json). The previous investigation and observations remain historical records of the miscopied identifier.

## Controlled comparison on the production origin

Fresh headless Chromium 156.0.8078.79 contexts on the managed Cloud computer exercised the real Google and Firebase services on `https://blackboxlab.dev`, with the expected candidate identifier checked at runtime. The paired run was recorded on 2026-11-16 at 17:47–17:48 UTC. These candidate tests did not deploy this branch or establish identical results on every user device.

| Boundary | Previously configured identifier | Exact ASCII-decoded candidate |
| --- | --- | --- |
| Independent Google acquisition | Rejects at `execute` | Succeeds |
| Firebase exchange | No `exchangeRecaptchaEnterpriseToken` request observed | POST reaches `exchangeRecaptchaEnterpriseToken` |
| Accepted Firebase attestation | Not obtained | Not obtained: HTTP 403, `PERMISSION_DENIED`, known message `App attestation failed`; SDK reports `appCheck/initial-throttle` |

This comparison supports a causal conclusion for the initial Google acquisition failure: the application was using a miscopied key identifier. The next observed failure is Firebase rejection after acquisition. The captured response does not establish why Firebase rejects attestation. No threshold, billing, provider-registration or enforcement change is justified by that response alone. The separate `clr` HTTP 400 is not used as a causal explanation.

## Change and validation

The application change corrects only the two characters in `account-config.js`. All consumers already read this shared configuration. The existing key is used; no key was created or rotated.

The offline regression command was:

```sh
node --test --test-isolation=none tests/*.test.mjs functions/tests/*.test.mjs
```

Result: **133 total, 130 passed, 3 emulator-dependent tests skipped, 0 failed**. Existing tests cover the grading gate, Enterprise provider and diagnostic behavior. The controlled comparison supplies the additional integration evidence for this identifier correction.

App Check enforcement, Enterprise provider selection, thresholds, Firebase rules, account configuration apart from the public identifier, and grading activation are unchanged. In particular, grading remains disabled. No debug token or bypass is introduced.

## Remaining verification

After merge and deployment, verify that the actual production configuration contains the corrected identifier, then repeat independent acquisition and a fresh Firebase App Check request without a local override. Production resolution requires an accepted fresh App Check result, rather than a nonempty Google value or a reached exchange endpoint. The currently observed HTTP 403 remains unresolved and must be reported as such. Server grading readiness is a separate verification and is not claimed here.
