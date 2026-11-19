import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.BLACKBOX_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifacts = process.env.BLACKBOX_BROWSER_ARTIFACTS || '/tmp/blackbox-browser-artifacts';
const configuration = enabled => `export const accountConfig = ${JSON.stringify({
  enabled, linkedSkillsEnabled: true, providers: { email: false, google: false },
  firebase: enabled ? { apiKey: 'demo-loading-key', projectId: 'demo-blackbox-loading', authDomain: 'demo-blackbox-loading.firebaseapp.com', appId: '1:123:web:loading' } : {},
  grading: { enabled: false, appCheckSiteKey: '' }, emulators: null,
})};`;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) {
      response.writeHead(403); response.end(); return;
    }
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    let body = pathname === '/account-config.js' ? Buffer.from(configuration(false)) : await readFile(path);
    if (extname(path) === '.html') {
      // Preserve the font stylesheet: its delayed response is tested below.
      // Omit speculative external connections from the local fixture.
      body = Buffer.from(body.toString().replace(/<link\b(?=[^>]*\brel=["'](?:preconnect|dns-prefetch)["'])(?=[^>]*\bhref=["']https?:\/\/)[^>]*>/g, ''));
    }
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.BLACKBOX_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] })
  .catch(async error => { await new Promise(yes => server.close(yes)); throw error; });
const report = { scope: 'local startup lifecycle; no production accounts or external network', cases: [] };
let activePage, deadline;

function gate() {
  let release, reached;
  const pending = new Promise(resolve => { release = resolve; });
  const requested = new Promise(resolve => { reached = resolve; });
  return { pending, requested, release, hit() { reached(); } };
}
async function reached(gate) {
  let timeout;
  try {
    await Promise.race([gate.requested, new Promise((_, no) => { timeout = setTimeout(() => no(new Error('Expected optional resource was not requested')), 10000); })]);
  } finally { clearTimeout(timeout); }
}

async function fixture(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 390, height: 844 },
    reducedMotion: options.reducedMotion || 'no-preference',
    javaScriptEnabled: options.javaScriptEnabled !== false,
  });
  const gates = { app: gate(), fonts: gate(), analytics: gate(), auth: gate() };
  const errors = [], external = [];
  let closing = false;
  await context.route('**/*', async route => {
    try {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin) {
        if (url.pathname === '/app.js') {
          gates.app.hit();
          if (options.holdApp) await gates.app.pending;
          if (options.failApp) return await route.abort('failed');
        }
        if (url.pathname.startsWith('/_vercel/insights/')) {
          gates.analytics.hit();
          if (options.holdAnalytics) await gates.analytics.pending;
          return await route.fulfill({ contentType: types['.js'], body: '// Local optional analytics fixture.' });
        }
        if (url.pathname === '/account-config.js') return await route.fulfill({ contentType: types['.js'], body: configuration(Boolean(options.holdAuth)) });
        return await route.continue();
      }
      if (url.hostname === 'fonts.googleapis.com') {
        gates.fonts.hit();
        if (options.holdFonts) await gates.fonts.pending;
        return await route.fulfill({ contentType: types['.css'], headers: { 'Access-Control-Allow-Origin': '*' }, body: ':root { --loading-test-font-ready: 1; }' });
      }
      if (options.holdAuth && url.hostname === 'www.gstatic.com' && url.pathname.endsWith('/firebase-app.js')) {
        return await route.fulfill({ contentType: types['.js'], headers: { 'Access-Control-Allow-Origin': '*' }, body: 'const apps=[]; export const getApps=()=>apps; export function initializeApp(options,name){const app={options,name};apps.push(app);return app;}' });
      }
      if (options.holdAuth && url.hostname === 'www.gstatic.com' && url.pathname.endsWith('/firebase-auth.js')) {
        gates.auth.hit();
        await gates.auth.pending;
        return await route.fulfill({ contentType: types['.js'], headers: { 'Access-Control-Allow-Origin': '*' }, body: 'export const browserLocalPersistence={}; export const getAuth=()=>({currentUser:null}); export async function setPersistence(){} export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback(null));return()=>{};}' });
      }
      external.push({ method: request.method(), host: url.hostname, path: url.pathname });
      return await route.abort('blockedbyclient');
    } catch (error) { if (!closing) throw error; }
  });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  return {
    page, gates, errors, options,
    async close({ allowPageErrors = false } = {}) {
      closing = true;
      for (const value of Object.values(gates)) value.release();
      try {
        assert.deepEqual(external, [], 'known remote URLs are fulfilled locally; unexpected external requests fail');
        if (!allowPageErrors) assert.deepEqual(errors, [], 'startup has no uncaught JavaScript errors');
      } finally { await context.close(); }
    },
  };
}

const workspace = '/?track=logs&stage=0';
async function assertReady(page) {
  await page.waitForFunction(() => {
    const cue = document.getElementById('bb-load-indicator');
    return cue?.hidden && cue.dataset.state === 'ready';
  });
}
async function assertWorkspace(page) {
  await page.locator('#stageNotes').waitFor({ state: 'visible' });
  await assertReady(page);
}
async function record(name, run) {
  await run();
  report.cases.push(name);
  console.log(`PASS loading lifecycle: ${name}`);
}

try {
  const checks = (async () => {
    await record('pending core module remains loading until first usable render', async () => {
      const f = await fixture({ holdApp: true });
      const navigation = f.page.goto(origin + workspace, { waitUntil: 'domcontentloaded' });
      void navigation.catch(() => {});
      try {
        await f.page.waitForFunction(() => {
          const cue = document.getElementById('bb-load-indicator');
          return document.readyState === 'interactive' && cue && !cue.hidden && cue.dataset.state === 'loading';
        });
        assert.equal(await f.page.locator('#content').innerText(), '');
        assert.equal(await f.page.locator('#bb-load-indicator').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
        await f.page.locator('#quickBackup').focus();
        assert.equal(await f.page.evaluate(() => document.activeElement.id), 'quickBackup', 'startup cue does not capture focus');
        f.gates.app.release();
        await navigation;
        await assertWorkspace(f.page);
      } finally { await f.close(); await navigation.catch(() => {}); }
    });

    await record('slow fonts and analytics do not delay the usable workspace', async () => {
      const f = await fixture({ holdFonts: true, holdAnalytics: true });
      try {
        await f.page.goto(origin + workspace, { waitUntil: 'domcontentloaded' });
        await assertWorkspace(f.page);
        await reached(f.gates.fonts); await reached(f.gates.analytics);
        assert.equal(await f.page.locator('#bb-fonts').getAttribute('media'), 'print');
        await f.page.locator('#nav [data-view="tracks"]').click();
        await f.page.locator('#trackSearch').waitFor({ state: 'visible' });
        f.gates.fonts.release();
        await f.page.waitForFunction(() => document.getElementById('bb-fonts')?.media === 'all');
        assert.equal(await f.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--loading-test-font-ready').trim()), '1', 'font CSS is applied when it eventually loads');
        f.gates.analytics.release();
      } finally { await f.close(); }
    });

    await record('pending optional Auth SDK leaves local training usable', async () => {
      const f = await fixture({ holdAuth: true });
      try {
        await f.page.goto(origin + workspace, { waitUntil: 'domcontentloaded' });
        await assertWorkspace(f.page);
        // The real Firebase adapter reaches a locally intercepted SDK boundary;
        // it stays pending without delaying independent training controls.
        await reached(f.gates.auth);
        assert.equal(await f.page.locator('#saveStatus').innerText(), 'محفوظ على هذا المتصفح');
        f.gates.auth.release();
      } finally { await f.close(); }
    });

    await record('failed core module shows a retry action and recovers when reloaded', async () => {
      const f = await fixture({ failApp: true });
      try {
        await f.page.goto(origin + workspace, { waitUntil: 'domcontentloaded' });
        await f.page.waitForFunction(() => document.getElementById('bb-load-indicator')?.dataset.state === 'error');
        const retry = f.page.locator('[data-load-retry]');
        await retry.waitFor({ state: 'visible' });
        await retry.focus();
        assert.equal(await retry.evaluate(el => el === document.activeElement), true);
        assert.notEqual(await retry.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
        f.options.failApp = false;
        const navigation = f.page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        await retry.click();
        await navigation;
        await assertWorkspace(f.page);
      } finally { await f.close({ allowPageErrors: true }); }
    });

    await record('reduced motion keeps the pending cue static and page width intact', async () => {
      const f = await fixture({ holdApp: true, reducedMotion: 'reduce' });
      const navigation = f.page.goto(origin + workspace, { waitUntil: 'domcontentloaded' });
      void navigation.catch(() => {});
      try {
        await f.page.waitForFunction(() => document.getElementById('bb-load-indicator')?.dataset.state === 'loading');
        assert.equal(await f.page.locator('#bb-load-indicator').evaluate(el => el.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length), 0);
        assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        f.gates.app.release();
        await navigation;
        await assertWorkspace(f.page);
      } finally { await f.close(); await navigation.catch(() => {}); }
    });

    await record('JavaScript-disabled page retains its notice without a stuck loader', async () => {
      const f = await fixture({ javaScriptEnabled: false });
      try {
        await f.page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
        assert.equal(await f.page.locator('#bb-load-indicator').isVisible(), false);
        await f.page.locator('noscript p').waitFor({ state: 'visible' });
      } finally { await f.close(); }
    });

    for (const path of ['/labs.html', '/vm-report.html']) {
      await record(`${path} settles independently of delayed analytics`, async () => {
        const f = await fixture({ holdAnalytics: true });
        try {
          await f.page.goto(origin + path, { waitUntil: 'domcontentloaded' });
          await assertReady(f.page);
          await f.page.locator('main h1').waitFor({ state: 'visible' });
          if (path === '/labs.html') assert(await f.page.locator('#catalog article').count() > 0);
          else await f.page.locator('#vm-report-file').waitFor({ state: 'visible' });
        } finally { await f.close(); }
      });
    }

    await record('persisted pageshow handler clears stale loading without restarting it', async () => {
      const f = await fixture({ viewport: { width: 1440, height: 1000 } });
      try {
        await f.page.goto(origin + workspace, { waitUntil: 'domcontentloaded' });
        await assertWorkspace(f.page);
        // Test the restoration event handler, not browser cache eligibility.
        await f.page.evaluate(() => {
          const cue = document.getElementById('bb-load-indicator');
          cue.hidden = false; cue.dataset.state = 'loading';
          window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        });
        await assertReady(f.page);
      } finally { await f.close(); }
    });
  })();
  await Promise.race([
    checks,
    new Promise((_, no) => { deadline = setTimeout(() => no(new Error('Loading browser regression exceeded two minutes')), 120000); }),
  ]);
  await mkdir(artifacts, { recursive: true });
  await writeFile(resolve(artifacts, 'loading-results.json'), JSON.stringify(report, null, 2));
} catch (error) {
  await mkdir(artifacts, { recursive: true });
  try { if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: resolve(artifacts, 'loading-failure.png'), fullPage: true }); } catch {}
  await writeFile(resolve(artifacts, 'loading-failure.json'), JSON.stringify({ ...report, failure: error.message }, null, 2));
  throw error;
} finally {
  clearTimeout(deadline);
  await browser.close();
  server.closeAllConnections();
  await new Promise(yes => server.close(yes));
}
