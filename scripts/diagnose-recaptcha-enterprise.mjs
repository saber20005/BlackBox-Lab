import fs from 'node:fs/promises';

// Manual diagnostic only. Never record tokens, raw error messages, response bodies,
// request headers, or URLs containing query strings.
const { chromium } = await import(process.env.BLACKBOX_PLAYWRIGHT_MODULE || 'playwright');
const origin = diagnosticOrigin(process.env.BLACKBOX_DIAGNOSTIC_ORIGIN || 'https://blackboxlab.dev');
const scenarios = ['independent-original', 'independent-direct', 'firebase-original'];
if (process.env.BLACKBOX_DIAGNOSTIC_WIDGET === '1') scenarios.push('independent-explicit-widget');

const MAX_NETWORK_EVENTS = 200;
const OBSERVATION_MS = 45_000;
const errorNames = new Set(['Error', 'TypeError', 'NetworkError', 'AbortError', 'TimeoutError']);
const serverStatuses = new Set([
  'INVALID_ARGUMENT', 'UNAUTHENTICATED', 'PERMISSION_DENIED', 'FAILED_PRECONDITION',
  'RESOURCE_EXHAUSTED', 'INTERNAL', 'UNAVAILABLE'
]);
const networkFailures = new Set([
  'net::ERR_FAILED', 'net::ERR_ABORTED', 'net::ERR_TIMED_OUT', 'net::ERR_CONNECTION_TIMED_OUT',
  'net::ERR_CONNECTION_CLOSED', 'net::ERR_CONNECTION_RESET', 'net::ERR_CONNECTION_REFUSED',
  'net::ERR_NAME_NOT_RESOLVED', 'net::ERR_INTERNET_DISCONNECTED', 'net::ERR_NETWORK_CHANGED',
  'net::ERR_BLOCKED_BY_CLIENT', 'net::ERR_BLOCKED_BY_ADMINISTRATOR',
  'net::ERR_HTTP_RESPONSE_CODE_FAILURE', 'net::ERR_EMPTY_RESPONSE', 'net::ERR_ADDRESS_UNREACHABLE',
  'net::ERR_CERT_AUTHORITY_INVALID', 'net::ERR_CERT_DATE_INVALID', 'net::ERR_CERT_COMMON_NAME_INVALID'
]);

function diagnosticOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Use an HTTPS origin without credentials, query, fragment or path.');
  }
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search ||
      parsed.hash || parsed.username || parsed.password || parsed.href !== parsed.origin + '/') {
    throw new Error('Use an HTTPS origin without credentials, query, fragment or path.');
  }
  return parsed;
}

function endpointFor(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const diagnosticPages = ['/appcheck-diagnostic.html', '/recaptcha-independent-diagnostic.html'];
  if (url.origin === origin.origin && diagnosticPages.includes(url.pathname)) {
    return { service: 'blackbox', endpoint: url.pathname.slice(1) };
  }
  if (url.hostname === 'www.google.com' && url.pathname === '/recaptcha/enterprise.js') {
    return { service: 'google', endpoint: 'enterprise.js' };
  }
  if (['www.google.com', 'recaptcha.google.com'].includes(url.hostname)) {
    const match = /^\/recaptcha\/enterprise\/(anchor|bframe|reload|clr)$/.exec(url.pathname);
    if (match) return { service: 'google', endpoint: match[1] };
  }
  if (url.hostname === 'www.gstatic.com' &&
      /^\/recaptcha\/releases\/[a-zA-Z0-9_-]+\/recaptcha__[a-zA-Z_-]+\.js$/.test(url.pathname)) {
    return { service: 'gstatic', endpoint: 'recaptcha-runtime.js' };
  }
  if (['firebaseappcheck.googleapis.com', 'content-firebaseappcheck.googleapis.com'].includes(url.hostname) &&
      url.pathname.endsWith(':exchangeRecaptchaEnterpriseToken')) {
    return { service: 'firebase-app-check', endpoint: 'exchangeRecaptchaEnterpriseToken' };
  }
  return null;
}

function classify(value) {
  let raw = '';
  let name = null;
  try {
    const message = typeof value === 'string' ? value : value?.message;
    if (typeof message === 'string') raw = message;
    const candidate = value?.name;
    if (errorNames.has(candidate)) name = candidate;
  } catch { /* Unreadable fields remain private and unclassified. */ }
  const category = /timeout|timed out/i.test(raw) ? 'timeout'
    : /invalid site key/i.test(raw) ? 'client-key-or-loader-rejection'
    : /not loaded|no reCAPTCHA clients/i.test(raw) ? 'client-not-loaded'
    : /network|fetch|connection/i.test(raw) ? 'network'
    : /browser.error/i.test(raw) ? 'browser-error'
    : /permission|denied/i.test(raw) ? 'permission' : 'unclassified';
  return {
    type: value === null ? 'null' : typeof value,
    name,
    category
  };
}

async function withDeadline(operation, timeoutMs, fallback) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise(resolve => { timer = setTimeout(() => resolve(fallback), timeoutMs); })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorMetadata(response, row) {
  const read = (async () => {
    try {
      const body = await response.text();
      const metadata = { errorBodyBytes: Buffer.byteLength(body) };
      try {
        const json = JSON.parse(body);
        if (json?.error) {
          metadata.serverStatus = serverStatuses.has(json.error.status) ? json.error.status : null;
        }
      } catch {
        // A non-JSON response stays private too.
      }
      return metadata;
    } catch {
      return { bodyReadable: false };
    }
  })();
  Object.assign(row, await withDeadline(read, 4_000, { bodyReadDeadlineReached: true }));
}

async function observeDiagnosticPage(page) {
  await page.locator('#run').click();
  try {
    await page.waitForFunction(
      () => /^(فشل|نجح)/.test(document.getElementById('result')?.textContent || ''),
      undefined,
      { timeout: 50_000 }
    );
    const resultText = await page.locator('#result').innerText();
    const stages = [
      'configuration', 'sdk-load', 'app-init', 'app-check-init', 'token-request',
      'token-validation', 'script-load', 'ready', 'execute'
    ];
    return {
      outcome: resultText.startsWith('نجح') ? 'success' : 'failure',
      stage: stages.find(stage => resultText.includes('المرحلة: ' + stage)) || null,
      sdkErrorCode: resultText.includes('appCheck/recaptcha-error') ? 'appCheck/recaptcha-error' : null
    };
  } catch {
    return { outcome: 'observation-deadline', stage: 'not-settled-within-observation-window' };
  }
}

async function runDirectProbe(page, explicitWidget) {
  return page.evaluate(async ({ explicitWidget, observationMs }) => {
    const started = performance.now();
    let stage = 'configuration';
    let timeout;
    let expired = false;
    const observations = { successCallbackCount: 0, errorCallbackCount: 0, events: [] };
    // Callback arguments can contain tokens or vendor messages: intentionally ignore them.
    window.__blackboxWidgetObservations = observations;
    const recordCallback = kind => {
      if (kind === 'success') observations.successCallbackCount++;
      else observations.errorCallbackCount++;
      if (observations.events.length < 20) {
        observations.events.push({ kind, at: Math.round(performance.now() - started) });
      }
    };
    const rejection = value => {
      const allowedNames = ['Error', 'TypeError', 'NetworkError', 'AbortError', 'TimeoutError'];
      let raw = '';
      let errorName = null;
      try {
        const message = typeof value === 'string' ? value : value?.message;
        if (typeof message === 'string') raw = message;
        const candidate = value?.name;
        if (allowedNames.includes(candidate)) errorName = candidate;
      } catch { /* Never report an unreadable vendor field. */ }
      return {
        rejectionType: value === null ? 'null' : typeof value,
        errorName,
        category: /timeout|timed out/i.test(raw) ? 'timeout'
          : /invalid site key/i.test(raw) ? 'client-key-or-loader-rejection'
          : /not loaded|no reCAPTCHA clients/i.test(raw) ? 'client-not-loaded'
          : /network|fetch|connection/i.test(raw) ? 'network'
          : /browser.error/i.test(raw) ? 'browser-error' : 'unclassified'
      };
    };
    const work = (async () => {
      try {
        const config = (await import('/account-config.js')).accountConfig;
        if (expired) return;
        const siteKey = config?.grading?.appCheckSiteKey;
        if (typeof siteKey !== 'string' || !siteKey) return { stage, category: 'missing-site-key' };
        if (window.grecaptcha?.enterprise || document.querySelector('script[src*="recaptcha/enterprise.js"]')) {
          return {
            stage, category: 'preexisting-enterprise-loader',
            acquisitionResultCategory: 'not-attempted'
          };
        }
        stage = 'script-load';
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          const render = explicitWidget ? 'explicit' : siteKey;
          script.src = 'https://www.google.com/recaptcha/enterprise.js?render=' + encodeURIComponent(render);
          script.async = true;
          script.onload = resolve;
          script.onerror = () => reject(new Error('script-load'));
          document.head.append(script);
        });
        if (expired) return;
        stage = 'ready';
        await new Promise(resolve => window.grecaptcha.enterprise.ready(resolve));
        if (expired) return;
        let executeTarget = siteKey;
        if (explicitWidget) {
          stage = 'render';
          const container = document.createElement('div');
          container.style.display = 'none';
          document.body.append(container);
          executeTarget = window.grecaptcha.enterprise.render(container, {
            sitekey: siteKey,
            size: 'invisible',
            callback: () => recordCallback('success'),
            'error-callback': () => recordCallback('error')
          });
        }
        stage = 'execute';
        const result = await window.grecaptcha.enterprise.execute(executeTarget, {
          action: explicitWidget ? 'fire_app_check' : 'blackbox_diagnostic'
        });
        return {
          stage,
          settledAt: Math.round(performance.now() - started),
          acquisitionResultCategory: typeof result === 'string' && result.length > 0
            ? 'nonempty-string' : 'empty-or-other',
          firebaseAcceptance: 'not-tested'
        };
      } catch (value) {
        return {
          stage, settledAt: Math.round(performance.now() - started),
          acquisitionResultCategory: 'rejected', ...rejection(value)
        };
      }
    })();
    try {
      return await Promise.race([
        work,
        new Promise(resolve => {
          timeout = setTimeout(() => {
            expired = true;
            resolve({ stage, deadlineReached: true, firebaseAcceptance: 'not-tested' });
          }, observationMs);
        })
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }, { explicitWidget, observationMs: OBSERVATION_MS });
}

async function iframeErrorCategories(page) {
  const categories = [];
  for (const frame of page.frames().slice(0, 20)) {
    const endpoint = endpointFor(frame.url());
    if (endpoint?.service !== 'google' || !['anchor', 'bframe'].includes(endpoint.endpoint)) continue;
    try {
      // The iframe's text never crosses the browser boundary. Only finite categories do.
      const inspection = frame.evaluate(() => {
        const text = (document.body?.innerText || '').trim();
        const knownErrors = [
          [/(?:^|\n)(?:ERROR for site owner:\s*)?Invalid site key\b/i, 'invalid-site-key'],
          [/(?:^|\n)(?:ERROR for site owner:\s*)?Invalid key type\b/i, 'invalid-key-type'],
          [/(?:^|\n)(?:ERROR for site owner:\s*)?Invalid domain for site key\b/i, 'invalid-domain'],
          [/(?:^|\n)(?:ERROR for site owner:\s*)?Site key not enabled\b/i, 'site-key-not-enabled'],
          [/(?:^|\n)(?:ERROR for site owner:\s*)?Could not connect to the reCAPTCHA service\b/i, 'connection-error']
        ];
        return knownErrors.find(([pattern]) => pattern.test(text))?.[1] || null;
      });
      const errorCategory = await withDeadline(inspection, 3_000, 'inspection-deadline');
      if (errorCategory) categories.push({ endpoint: endpoint.endpoint, errorCategory });
    } catch {
      categories.push({ endpoint: endpoint.endpoint, errorCategory: 'inspection-unavailable' });
    }
  }
  return categories;
}

const browser = await chromium.launch({
  executablePath: process.env.BLACKBOX_CHROMIUM_PATH || undefined,
  headless: true,
  args: ['--no-sandbox']
});
const reports = [];
try {
  for (const scenario of scenarios) {
    const context = await browser.newContext();
    const report = {
      scenario, started: new Date().toISOString(), network: [],
      policyViolations: [], consoleErrorCount: 0
    };
    const pending = [];
    const started = Date.now();
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      page.setDefaultNavigationTimeout(25_000);
      page.on('console', message => { if (message.type() === 'error') report.consoleErrorCount++; });
      await page.addInitScript(() => {
        window.testPolicyViolations = [];
        document.addEventListener('securitypolicyviolation', event => {
          if (window.testPolicyViolations.length >= 100) return;
          const allowed = ['script-src', 'script-src-elem', 'frame-src', 'child-src', 'connect-src'];
          window.testPolicyViolations.push({
            directive: allowed.includes(event.effectiveDirective) ? event.effectiveDirective : 'other',
            blockedKind: event.blockedURI === 'inline' ? 'inline' : 'resource'
          });
        });
      });
      page.on('requestfailed', request => {
        const endpoint = endpointFor(request.url());
        if (!endpoint || report.network.length >= MAX_NETWORK_EVENTS) return;
        const reason = request.failure()?.errorText;
        report.network.push({
          at: Date.now() - started, ...endpoint, event: 'failed',
          reason: networkFailures.has(reason) ? reason : 'network-failure'
        });
      });
      page.on('response', response => {
        const endpoint = endpointFor(response.url());
        if (!endpoint || report.network.length >= MAX_NETWORK_EVENTS) return;
        const row = {
          at: Date.now() - started, ...endpoint, status: response.status(),
          method: response.request().method(), type: response.request().resourceType()
        };
        report.network.push(row);
        if (response.status() >= 400) pending.push(readErrorMetadata(response, row));
      });
      const firebaseScenario = scenario === 'firebase-original';
      const diagnosticPage = firebaseScenario
        ? 'appcheck-diagnostic.html' : 'recaptcha-independent-diagnostic.html';
      await page.goto(origin.href + diagnosticPage, { waitUntil: 'domcontentloaded' });
      const directScenario = scenario === 'independent-direct' || scenario === 'independent-explicit-widget';
      if (directScenario) {
        report.direct = await runDirectProbe(page, scenario === 'independent-explicit-widget');
      } else {
        report.result = await observeDiagnosticPage(page);
        if (!firebaseScenario) report.result.firebaseAcceptance = 'not-tested';
      }
      // Passive observation only: do not retry execute or load a second SDK.
      await page.waitForTimeout(1_200);
      report.policyViolations = await page.evaluate(() => window.testPolicyViolations);
      report.scriptCount = await page.locator('script[src*="recaptcha/enterprise.js"]').count();
      if (scenario === 'independent-explicit-widget') {
        report.iframeErrors = await iframeErrorCategories(page);
        report.callbacks = await page.evaluate(() => {
          const observed = window.__blackboxWidgetObservations;
          return {
            successCallbackCount: Number.isSafeInteger(observed?.successCallbackCount)
              ? observed.successCallbackCount : 0,
            errorCallbackCount: Number.isSafeInteger(observed?.errorCallbackCount)
              ? observed.errorCallbackCount : 0,
            events: (Array.isArray(observed?.events) ? observed.events : [])
              .filter(event => ['success', 'error'].includes(event?.kind) && Number.isFinite(event?.at))
              .slice(0, 20).map(event => ({ kind: event.kind, at: event.at }))
          };
        });
      }
    } catch (error) {
      report.runnerError = classify(error);
    } finally {
      await context.close();
    }
    await Promise.allSettled(pending);
    report.finished = new Date().toISOString();
    reports.push(report);
    if (process.env.BLACKBOX_DIAGNOSTIC_OUTPUT) {
      await fs.writeFile(process.env.BLACKBOX_DIAGNOSTIC_OUTPUT, JSON.stringify({
        browserVersion: browser.version(), headless: true, origin: origin.origin, reports
      }, null, 2));
    }
    console.log(JSON.stringify(report));
  }
} finally {
  await browser.close();
}
