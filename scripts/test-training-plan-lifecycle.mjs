const { chromium } = await import(process.env.BLACKBOX_PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';

// Control arrival order at the backend boundary while exercising the real
// account controller, app callbacks, plan derivation, and rendered UI.
const backendModule = `
export const validateCloudProgress = value => value;
export async function createFirebaseBackend() {
  window.testLifecycle = { reads: {}, watches: {}, unsubscribed: [], emitUser: null };
  const test = window.testLifecycle;
  return {
    providers: { email: true, google: true },
    onUserChanged(callback) { test.emitUser = callback; queueMicrotask(() => callback(null)); return () => {}; },
    watchCybertrace(uid, onData) { test.watches[uid] = onData; return () => test.unsubscribed.push(uid); },
    read(uid) { return new Promise(resolve => test.reads[uid] = resolve); },
    async write(uid, progress, revision) { return { progress, revision: revision + 1 }; },
    async signOut() { test.emitUser(null); }
  };
}
`;
const testURL = new URL(process.env.BLACKBOX_TEST_URL || 'http://127.0.0.1:4176/?view=plan');
if (!['localhost', '127.0.0.1', '[::1]'].includes(testURL.hostname)) throw new Error('Lifecycle browser tests require a local BlackBox server.');
testURL.searchParams.set('view', 'plan');
const browser = await chromium.launch({ executablePath: process.env.BLACKBOX_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext();
  const errors = [];
  await context.route('**/firebase-client.js', route => route.fulfill({ contentType: 'text/javascript', body: backendModule }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(testURL.href);
  await page.waitForFunction(() => typeof window.testLifecycle?.emitUser === 'function');
  assert.equal(await page.locator('[data-plan-track]').first().getAttribute('data-plan-track'), 'recon');
  await page.evaluate(() => window.testLifecycle.emitUser({ uid: 'local-owner-a', email: 'a@example.test' }));
  await page.waitForFunction(() => !!window.testLifecycle.reads['local-owner-a'] && !!window.testLifecycle.watches['local-owner-a']);
  await page.evaluate(() => window.testLifecycle.watches['local-owner-a']({
    fromCache: false,
    receipts: { 'INC-1104': { schemaVersion: 1, source: 'cybertrace', caseId: 'INC-1104', bestScore: 70, firstSyncedAt: '2026-11-12T12:00:00.000Z', updatedAt: '2026-11-12T12:00:00.000Z' } }
  }));
  assert.equal(await page.locator('#content').evaluate(e => e.inert), true);
  assert(!(await page.locator('#content').innerText()).includes('المسجّل في حسابك'));
  await page.evaluate(() => window.testLifecycle.reads['local-owner-a'](null));
  await page.waitForFunction(() => !document.querySelector('#content').inert);
  await page.waitForFunction(() => document.querySelector('[data-plan-track]')?.dataset.planTrack === 'network');
  assert((await page.locator('[data-plan-track]').first().innerText()).includes('المسجّل في حسابك'));
  assert.equal(await page.locator('#sideProgress').innerText(), '0 / 18');
  console.log('PASS real app callback race: receipt arrives before account progress; same-owner loading completion refreshes linked plan without navigation');
  await page.evaluate(() => window.testLifecycle.emitUser({ uid: 'local-owner-b', email: 'b@example.test' }));
  await page.waitForFunction(() => !!window.testLifecycle.reads['local-owner-b']);
  assert(!(await page.locator('#content').innerText()).includes('المسجّل في حسابك'));
  // A late callback from A must not influence B while its data loads.
  await page.evaluate(() => window.testLifecycle.watches['local-owner-a']({
    fromCache: false,
    receipts: { 'INC-1101': { schemaVersion: 1, source: 'cybertrace', caseId: 'INC-1101', bestScore: 70, firstSyncedAt: '2026-11-12T12:00:00.000Z', updatedAt: '2026-11-12T12:00:00.000Z' } }
  }));
  await page.evaluate(() => window.testLifecycle.reads['local-owner-b'](null));
  await page.waitForFunction(() => !document.querySelector('#content').inert);
  assert.equal(await page.locator('[data-plan-track]').first().getAttribute('data-plan-track'), 'recon');
  assert(!(await page.locator('#content').innerText()).includes('المسجّل في حسابك'));
  assert(await page.evaluate(() => window.testLifecycle.unsubscribed.includes('local-owner-a')));
  assert.deepEqual(errors, []);
  console.log('PASS account switch: old plan clears during loading and late previous-owner receipts cannot personalize the next account');
} finally { await browser.close(); }
