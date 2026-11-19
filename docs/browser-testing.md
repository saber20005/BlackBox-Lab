# Guest browser regression

`scripts/test-guest-browser.mjs` starts an in-process HTTP server on an ephemeral
loopback port, then runs the real guest UI at desktop and mobile widths. The
script fails on uncaught JavaScript errors, including clashes between classic
guide scripts that syntax-only checks cannot detect.

The local server supplies a test-only `account-config.js` with accounts and
grading disabled, keeps the guest linked-skills page visible, and stubs the
analytics script. Third-party font hints are omitted from test HTML, and browser
requests outside the local origin are blocked and fail the test. No production
Firebase app, App Check token, sign-in, or cloud progress write is exercised.

The journey covers the manual new-feature guide and navigation tour, all seven
workspace sections, autosave across reload, completion/prerequisite locks,
backup download and import preview/cancel, template-only documentation counts,
the defensive training ZIP, the readable learner guide opened from a real training
stage (including its download and return-to-training links), catalogue start links, and stale VM-file reads
after replacement or clearing. Progress is synthetic data in a temporary guest
browser context, which is closed after each viewport.

The learner guide is also checked at 320px with JavaScript disabled. Its Arabic
content and four exercise links remain available, and no raw Markdown link or
external dependency is needed to read the instructions.

With Playwright and Chromium available:

```sh
BLACKBOX_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
BLACKBOX_CHROMIUM_PATH=/path/to/chromium \
node scripts/test-guest-browser.mjs
```

The CI job installs pinned Playwright `1.62.1` into `/tmp`, installs Chromium and
its system dependencies, and runs the same script. It adds no production npm
dependency. Its browser-install command follows the [official CI guide](https://playwright.dev/docs/ci).
On failure, screenshots and a JSON summary are saved under
`BLACKBOX_BROWSER_ARTIFACTS` (default `/tmp/blackbox-browser-artifacts`) and
uploaded as a GitHub Actions artifact.

The same CI job also runs `scripts/test-loading-browser.mjs` against its own
loopback fixture, retaining the real startup HTML and controlling delayed or
failed resources. See [startup behavior and performance](loading-performance.md).

This is a guest regression gate. The existing account, paired-site and emulator
tests remain separate checks; a passing guest journey does not establish live
Firebase permissions, production App Check acceptance or server-grading readiness.

The same CI entry point also runs the real account UI with a fully controlled,
local-only backend. It covers receipt/read arrival order, account isolation and
typing during an awaited online-recovery read before the UI save debounce fires.
This checks that the app actually wires its draft-flush callback, beyond the
controller's unit tests. No Firebase SDK is loaded for this fixture.

Account-focused scripts mark the introduction as seen only in the top-level
local BLACKBOX origin. They do not access fixture storage in opaque or
third-party SDK frames. The fresh landing and guides remain covered separately
by the guest suite.

The learner journey also checks CSV filtering and line citations without losing
typed notes, plus progressive hints whose review is unavailable for untouched
templates. `test-session-pages-browser.mjs` runs against the same loopback fixture
with a controlled account adapter: it checks owner switching, delayed reads,
preservation of dirty caches, account-backed mission cards, and portfolio resets.

Portfolio tests generate real A4 PDFs in Chromium and extract their text using
`pdftotext`. Synthetic private markers must be absent by default and appear only
for explicitly selected documentation. Local runs therefore need `pdftotext` on
PATH (Poppler tools); CI installs `poppler-utils`. The website's PDF workflow uses
the browser print dialog and has no Poppler dependency.
