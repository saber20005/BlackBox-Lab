import assert from 'node:assert/strict';
import { createInitialState, STORAGE_KEY } from '../progress.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const { chromium } = await import(process.env.BLACKBOX_PLAYWRIGHT_MODULE || 'playwright');
const base = new URL(process.env.BLACKBOX_TEST_URL || 'http://127.0.0.1:4176/');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Session page tests require a local fixture.');
const backend = `
export const validateCloudProgress = value => value;
export async function createFirebaseBackend() {
  const test = window.sessionFixture = { reads: [], writes: [], emitUser: null };
  return {
    onUserChanged(callback) { test.emitUser = callback; queueMicrotask(() => callback(null)); return () => {}; },
    read(uid) { return new Promise((resolve,reject) => test.reads.push({ uid, resolve, reject })); },
    async write(...args) { test.writes.push(args); throw new Error('Read-only pages must not upload progress'); }
  };
}`;
const stamp = '2026-01-15T12:00:00.000Z';
const guest = createInitialState();
guest.completed['recon-0'] = stamp; guest.checks['recon-0'] = [0, 1, 2];
guest.notes['recon-0'] = 'PRIVATE_GUEST_NOTE';
guest.results['recon-0'] = 'PRIVATE_GUEST_RESULT';
guest.notes['nmap-0'] = 'PRIVATE_UNSELECTED_DRAFT';
const accountA = createInitialState();
for (const key of ['network-0', 'network-1']) { accountA.completed[key] = stamp; accountA.checks[key] = [0, 1, 2]; }
accountA.notes['network-1'] = 'PRIVATE_ACCOUNT_A_NOTE';
accountA.notes['network-0'] = 'PRIVATE_SELECTED_A_NOTE';
accountA.results['network-0'] = 'PRIVATE_SELECTED_A_RESULT';
const accountB = createInitialState();
accountB.completed['webgoat-0'] = stamp; accountB.checks['webgoat-0'] = [0, 1, 2];
const cacheKey = 'blackbox-account-progress-v1:fixture-account-a';
const pendingKey = cacheKey + ':pending:preserve-test';
const rawCache = JSON.stringify({ revision: 2, progress: accountA, dirty: true, owner: 'fixture-tab', savedAt: stamp });
const config = { enabled: true, linkedSkillsEnabled: true, firebase: {}, providers: { email: true, google: true }, grading: { enabled: false, appCheckSiteKey: '' }, emulators: null };
const browser = await chromium.launch({ executablePath: process.env.BLACKBOX_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
const artifacts = process.env.BLACKBOX_BROWSER_ARTIFACTS || '/tmp/blackbox-browser-artifacts';

async function pdfText(page, filename) {
  await mkdir(artifacts, { recursive: true });
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('[data-portfolio-print]').isVisible(), false, 'export controls are excluded from the printed document');
  const pdf = await page.pdf({ format: 'A4', printBackground: true, displayHeaderFooter: false });
  assert(pdf.length > 1000 && pdf.subarray(0, 4).toString() === '%PDF', 'the print layout generates a real nonempty PDF');
  const path = resolve(artifacts, filename);
  await writeFile(path, pdf);
  const { stdout } = await promisify(execFile)('pdftotext', [path, '-']);
  await page.emulateMedia({ media: 'screen' });
  assert.match(stdout, /BLACKBOX/);
  return stdout;
}

async function resolveRead(page, uid, progress) {
  await page.waitForFunction(uid => window.sessionFixture.reads.some(read => read.uid === uid && !read.settled), uid);
  await page.evaluate(({ uid, progress }) => {
    const read = window.sessionFixture.reads.find(read => read.uid === uid && !read.settled);
    read.settled = true; read.resolve(progress === null ? null : { progress, revision: 3 });
  }, { uid, progress });
}
async function emit(page, uid) { await page.evaluate(uid => window.sessionFixture.emitUser(uid ? { uid } : null), uid); }

try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport });
    const errors = [], external = [];
    await context.addInitScript(({ origin, guestKey, guest, cacheKey, pendingKey, rawCache }) => {
      if (window.top !== window || location.origin !== origin) return;
      if (!sessionStorage.getItem('readonly-session-fixture')) {
        localStorage.setItem(guestKey, JSON.stringify(guest));
        localStorage.setItem(cacheKey, rawCache); localStorage.setItem(pendingKey, rawCache);
        sessionStorage.setItem('readonly-session-fixture', '1');
      }
    }, { origin: base.origin, guestKey: STORAGE_KEY, guest, cacheKey, pendingKey, rawCache });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === base.origin) return route.continue();
      external.push(url.hostname); return route.abort('blockedbyclient');
    });
    await context.route('**/account-config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const accountConfig = ' + JSON.stringify(config) + ';' }));
    await context.route('**/firebase-client.js', route => route.fulfill({ contentType: 'text/javascript', body: backend }));
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(new URL('mission-mode.html', base).href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.sessionFixture?.emitUser === 'function');
      await page.waitForFunction(() => document.querySelectorAll('[data-skill-id]').length === 10);
      assert.equal(await page.locator('[data-mission-id]').count(), 3);
      assert.equal(await page.locator('[data-skill-id="recon"] progress').getAttribute('value'), '33');

      await emit(page, 'fixture-account-a');
      await page.waitForFunction(() => window.sessionFixture.reads.some(read => read.uid === 'fixture-account-a'));
      assert.equal(await page.locator('[data-skill-id]').count(), 0, 'previous guest content clears during account restoration');
      await emit(page, 'fixture-account-b');
      await resolveRead(page, 'fixture-account-a', accountA);
      assert.equal(await page.locator('[data-skill-id]').count(), 0, 'late account A response cannot populate account B');
      await resolveRead(page, 'fixture-account-b', accountB);
      await page.waitForFunction(() => document.querySelector('[data-skill-id="webgoat"] progress')?.value === 33);
      assert.equal(await page.locator('[data-skill-id="network"] progress').getAttribute('value'), '0');

      await page.locator('[data-progress-refresh]').click();
      await resolveRead(page, 'fixture-account-b', accountB);
      await page.waitForFunction(() => document.querySelectorAll('[data-skill-id]').length === 10);
      assert.equal(await page.locator('[data-mission-id]').count(), 3, 'refresh replaces cards rather than duplicating them');

      await emit(page, 'fixture-account-a');
      await page.waitForFunction(() => window.sessionFixture.reads.some(read => read.uid === 'fixture-account-a' && !read.settled));
      await page.evaluate(() => {
        const read = window.sessionFixture.reads.find(read => read.uid === 'fixture-account-a' && !read.settled);
        read.settled = true; read.reject(Object.assign(new Error('Synthetic offline'), { code: 'unavailable' }));
      });
      await page.waitForFunction(() => document.querySelector('[data-skill-id="network"] progress')?.value === 67);
      assert.match(await page.locator('#progress-session-status').innerText(), /محلي|مخب|مسود/);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), cacheKey), rawCache);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), pendingKey), rawCache, 'opening the mission reader preserves dirty recovery slots');
      assert.equal(await page.evaluate(() => window.sessionFixture.writes.length), 0);

      await emit(page, 'fixture-account-c');
      await page.waitForFunction(() => window.sessionFixture.reads.some(read => read.uid === 'fixture-account-c'));
      await page.evaluate(() => {
        const read = window.sessionFixture.reads.find(read => read.uid === 'fixture-account-c');
        read.settled = true; read.reject(Object.assign(new Error('Synthetic offline'), { code: 'unavailable' }));
      });
      await page.waitForFunction(() => document.querySelector('#progress-session-status')?.dataset.phase === 'error');
      assert.equal(await page.locator('[data-skill-id]').count(), 0, 'failed signed-in read does not fall back to guest data');
      await emit(page, null);
      await page.waitForFunction(() => document.querySelector('[data-skill-id="recon"] progress')?.value === 33);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      console.log(`PASS account-backed mission reader at ${viewport.width}px: guest/account isolation, stale responses, dirty-cache preservation and refresh`);

      await page.goto(new URL('portfolio.html', base).href, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-portfolio-stage="recon-0"]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-portfolio-print]').isDisabled(), true, 'nothing is selected for sharing by default');
      assert.equal(await page.locator('[data-portfolio-include-notes]').isChecked(), false);
      assert.equal(await page.locator('[data-portfolio-include-results]').isChecked(), false);
      await page.locator('[data-portfolio-stage="recon-0"]').check();
      assert.doesNotMatch(await page.locator('#portfolio-report').innerText(), /PRIVATE_/);
      const privateDefault = await pdfText(page, `portfolio-${viewport.width}-default.pdf`);
      assert.doesNotMatch(privateDefault, /PRIVATE_|fixture-account-|@example/);
      await page.evaluate(() => { window.portfolioPrintCalls = 0; window.print = () => { window.portfolioPrintCalls++; }; });
      await page.locator('[data-portfolio-print]').click();
      assert.equal(await page.evaluate(() => window.portfolioPrintCalls), 1);
      await page.locator('[data-portfolio-include-notes]').check();
      await page.locator('[data-portfolio-include-results]').check();
      const explicitGuest = await pdfText(page, `portfolio-${viewport.width}-guest-opt-in.pdf`);
      assert.match(explicitGuest, /PRIVATE_GUEST_NOTE/);
      assert.match(explicitGuest, /PRIVATE_GUEST_RESULT/);
      assert.doesNotMatch(explicitGuest, /PRIVATE_UNSELECTED_DRAFT/);

      await emit(page, 'fixture-account-a');
      assert.doesNotMatch(await page.locator('#portfolio-report').innerText(), /PRIVATE_GUEST/);
      assert.equal(await page.locator('[data-portfolio-include-notes]').isChecked(), false);
      assert.equal(await page.locator('[data-portfolio-include-results]').isChecked(), false);
      await resolveRead(page, 'fixture-account-a', accountA);
      await page.locator('[data-portfolio-stage="network-0"]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-portfolio-print]').isDisabled(), true, 'account change resets sharing selections');
      await page.locator('[data-portfolio-stage="network-0"]').check();
      await page.locator('[data-portfolio-include-notes]').check();
      await page.locator('[data-portfolio-include-results]').check();
      const explicitAccount = await pdfText(page, `portfolio-${viewport.width}-account-selected.pdf`);
      assert.match(explicitAccount, /PRIVATE_SELECTED_A_NOTE/);
      assert.match(explicitAccount, /PRIVATE_SELECTED_A_RESULT/);
      assert.doesNotMatch(explicitAccount, /PRIVATE_ACCOUNT_A_NOTE|PRIVATE_GUEST|fixture-account-/);
      await emit(page, 'fixture-account-b');
      assert.doesNotMatch(await page.locator('#portfolio-report').innerText(), /PRIVATE_/);
      await resolveRead(page, 'fixture-account-b', accountB);
      await page.locator('[data-portfolio-stage="webgoat-0"]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-portfolio-print]').isDisabled(), true);
      assert.equal(await page.locator('[data-portfolio-include-notes]').isChecked(), false);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), pendingKey), rawCache);
      assert.equal(await page.evaluate(() => window.sessionFixture.writes.length), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      console.log(`PASS curated portfolio at ${viewport.width}px: real PDF output, private-by-default text, selected-only disclosure and account-switch reset`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
