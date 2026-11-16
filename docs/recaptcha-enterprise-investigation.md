# reCAPTCHA Enterprise: observed pre-exchange rejection

**Historical investigation, 2026-11-15.** The later [registered-key correction](recaptcha-key-correction.md) identifies two copied identifier characters using the owner's complete ASCII output. With those corrected in a controlled local overlay, Google acquisition succeeds and Firebase exchange is reached, but that exchange returns HTTP 403. Overall production attestation remains unresolved.

The diagnostic changes described below improve diagnostic reliability and evidence. The earlier conclusions retain the scope of the evidence available at that time.

## Scope and baseline

- Repository revision inspected: `589b765` (`main`, including merged PR #24).
- Public origin tested: `https://blackboxlab.dev`.
- Observation date: 2026-11-15, approximately 19:59–20:01 UTC, reproduced by the committed CLI at 20:24 UTC.
- Browser: fresh, isolated, headless Chromium 156.0.8078.79 contexts on the managed Cloud computer. This establishes that browser/network path; it does not establish identical behavior on every user device.
- Firebase browser SDK: 12.18.0.
- The owner had already verified Enterprise registration, Website/Score-based type and the allowed production domain. Those console checks were not repeated.

The redacted observations are in [the evidence fixture](evidence/recaptcha-enterprise-2026-11-15.json). It contains no token, site-key value, authentication header, request body or challenge payload.

## What was verified on the actual website

| Probe | Result |
| --- | --- |
| Unmodified standalone page, first clean attempt | Google loader/runtime HTTP 200; failure at `execute`; one loader script; no `clr` request observed before this failure. |
| Direct canonical Enterprise call in a fresh page context | `ready` resolves, then `execute(siteKey, {action: 'blackbox_diagnostic'})` rejects an `Error` with the known prefix `Invalid site key or not loaded in api.js`. |
| Direct invisible-widget control, matching the SDK's acquisition mechanism | The anchor loads with HTTP 200 but displays `Invalid site key`; `error-callback` runs. `execute(widgetId, ...)` nevertheless fulfills with a nonempty value. That value must not be treated as valid attestation. |
| Unmodified Firebase diagnostic page | `appCheck/recaptcha-error` at `token-request`; no `exchangeRecaptchaEnterpriseToken` request observed. A separate `clr` request returned HTTP 400. |

The HTTP response inspected carried no CSP header; the browser probes recorded no CSP violation events. A CSP failure is therefore not supported by these observations. The clean first attempt had one Enterprise loader, so a duplicate-loader explanation is also insufficient for that attempt.

### Loader controls

Separate HTTP controls, using a Chrome 156 user agent and production referrer, found:

- `enterprise.js?render=<configured key>` returned a loader containing `cfg['render'].push('onload')`, rather than automatic registration of the configured key.
- Its body was identical to the no-query loader; the configured key did not occur in that body. SHA-256: `5e5b9d678f28bfc2e8446b9f80489633f861f06b14d80fe8e6c8c79cc42a9354`.
- `render=explicit` was honored. A supplied `onload` callback was also honored, including alongside the configured key.

These controls do not support wholesale query stripping or a single response cached regardless of every query parameter. They corroborate that the observed Google flow did not initialize an automatically executable client for this key. They do **not** identify the Google-side administrative reason.

## Causal conclusion and its limit

The established failure boundary is **Google's client/key rejection before Firebase token exchange**. In the widget flow, Firebase correctly refuses a result accompanied by Google's error callback. The standalone flow fails without Firebase at all, and can fail before a `clr` request occurs; `clr` HTTP 400 alone is not a causal diagnosis.

The generic `Invalid site key or not loaded in api.js` message is a disjunction. It must not be shortened to a claim that the owner selected the wrong key type, forgot a domain, has a particular billing problem, or needs a key rotation. The explicit widget's `Invalid site key` display strengthens the rejection evidence but still does not expose the underlying Google project/key admission reason. Provider-side evidence or a Google support investigation is needed to resolve that remaining question.

No root-cause client patch is justified by the available evidence. Changing Firebase projects, providers, thresholds, keys, billing, App Check enforcement or server security would be speculative and is outside this PR.

The next evidence needed is the owning Google project's reason for rejecting this client/key at the recorded timestamps, through available provider-side diagnostics or Google support. The existing type/domain confirmations are accepted. Any proposed configuration change needs separate owner approval; after an evidence-based correction, repeat the unmodified production acquisition and Firebase exchange before declaring resolution.

## Diagnostic changes

1. The standalone probe reuses its loaded Enterprise script and coalesces concurrent runs. A failed script element owned by the probe is removed before a genuine load retry.
2. Script-load, ready and execute waits are bounded. A timeout requires a manual page reload: an old, uncancellable request cannot be allowed to overlap a new attempt or advance to execute later.
3. Known failure signatures map to fixed safe codes, including the deliberately ambiguous `client-or-key-rejected`. Unknown exception messages, names, codes and token contents are not reported.
4. A nonempty standalone result is explicitly distinct from Firebase acceptance. The SDK's callback guard remains untouched.
5. The manual Firebase diagnostic uses `getToken(check, true)`, so a previously cached token cannot be mistaken for current acquisition success. Auto-refresh remains disabled there. This does not bypass throttling or force a second producer when one is already in flight.
6. Diagnostic advice no longer repeats the already-verified type/domain checklist or treats `clr` as the answer. The Firebase diagnostic accurately describes standard SDK token management rather than claiming the SDK never caches anything.

`account-config.js`, `firebase-client.js`, `verified-grading-client.js`, all server enforcement options, Firebase rules and grading activation are unchanged.

## Reproduction and verification

With Playwright and Chromium available:

```sh
BLACKBOX_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
BLACKBOX_CHROMIUM_PATH=/path/to/chromium \
BLACKBOX_DIAGNOSTIC_WIDGET=1 \
BLACKBOX_DIAGNOSTIC_OUTPUT=/tmp/blackbox-recaptcha-report.json \
node scripts/diagnose-recaptcha-enterprise.mjs
```

The script uses fresh browser contexts and the real HTTPS origin. It exports endpoint labels/statuses, stage and fixed failure categories. It neither logs token contents nor calls grading functions. The optional widget control records callback outcome so a fulfilled nonempty result is not mistaken for attestation success.

The four-scenario CLI run at 20:24:15–20:24:27 UTC reproduced the standalone rejection and the Firebase error without an exchange request. The widget control recorded one error callback and zero success callbacks alongside a nonempty result. Its iframe classifier returned no category in that run; the `Invalid site key` iframe observation above came from the earlier direct comparison. Both observations are preserved rather than substituting one for the other.

Run code regression tests with:

```sh
node --test --test-isolation=none tests/*.test.mjs functions/tests/*.test.mjs
```

Final offline regression result: **133 tests, 130 passed, 3 skipped, 0 failed**. The skips require the Firestore/Functions emulators, which were not running locally. Behavioral probe tests cover script reuse, concurrent runs, load retry, ready/execute rejection, deadlines, late callbacks, invalid results and redaction. CLI tests cover late completion guards, fixed exception/iframe categories and widget error-callback semantics. Existing grading tests continue to check that production grading stays gated and uses the Enterprise provider. No Firestore rule or backend change is part of this work.

The local browser overlay check passed for two standalone attempts (one reused Google loader), mobile layout, redacted failure output and the Firebase diagnostic. It still observed the Google rejection. The final CLI was also syntax checked; subsequent local hardening only changes exception-field reads, late-deadline guards and finite iframe classification, not the acquisition mechanism used in that live run.

Any browser test serving modified files through local response interception must be labelled as such. It verifies diagnostic code against Google on that browser path; it is **not** verification of a deployed production fix. Production success requires an unmodified deployed flow with a successful Google callback, successful fresh Firebase exchange and accepted App Check result. Neither a passed unit test nor a nonempty raw Google result satisfies that condition.

## References

- [Google: execute is separate from ready](https://docs.cloud.google.com/recaptcha/docs/instrument-web-pages#user-action).
- [Firebase 12.18.0 Enterprise provider: rejection and callback guard before exchange](https://github.com/firebase/firebase-js-sdk/blob/firebase@12.18.0/packages/app-check/src/providers.ts#L169).
- [Firebase 12.18.0 reCAPTCHA callbacks and execution](https://github.com/firebase/firebase-js-sdk/blob/firebase@12.18.0/packages/app-check/src/recaptcha.ts#L114).
- [Firebase 12.18.0 force-refresh cache behavior](https://github.com/firebase/firebase-js-sdk/blob/firebase@12.18.0/packages/app-check/src/internal-api.ts#L103).
- [Maintainer explanation of nonempty failure results and the callback guard](https://github.com/firebase/firebase-js-sdk/issues/10499#issuecomment-6510202066).
- [Community counterexample: `clr` 400 with successful token verification](https://discuss.google.dev/t/getting-400-error-on-recaptcha-enterprise-clr-automatically-executed-after-obtaining-recaptcha-token/262418/1) — supporting counterexample, not an official endpoint error contract.
