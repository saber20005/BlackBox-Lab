const { chromium } = await import(process.env.BLACKBOX_PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import { tracks } from '../data.js';

const practicalStages = tracks.reduce((sum, track) => sum + track.stages.length, 0);

// Control arrival order at the backend boundary while exercising the real
// account controller, app callbacks, plan derivation, and rendered UI.
const backendModule = `
export const validateCloudProgress = value => value;
export async function createFirebaseBackend() {
  window.testLifecycle = { reads: {}, rejects: {}, readCounts: {}, writes: [], watches: {}, unsubscribed: [], emitUser: null };
  const test = window.testLifecycle;
  return {
    providers: { email: true, google: true },
    onUserChanged(callback) { test.emitUser = callback; queueMicrotask(() => callback(null)); return () => {}; },
    watchCybertrace(uid, onData) { test.watches[uid] = onData; return () => test.unsubscribed.push(uid); },
    read(uid) {
      test.readCounts[uid] = (test.readCounts[uid] || 0) + 1;
      return new Promise((resolve, reject) => { test.reads[uid] = resolve; test.rejects[uid] = reject; });
    },
    async write(uid, progress, revision) { test.writes.push({ uid, progress, revision }); return { progress, revision: revision + 1 }; },
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
  await context.addInitScript(expectedOrigin => {
    if (window.top !== window || location.origin !== expectedOrigin) return;
    try { localStorage.setItem('blackbox-lab-intro-seen-v1', '1'); } catch {}
  }, testURL.origin);
  const errors = [];
  const externalHosts = new Set();
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === testURL.origin) return route.continue();
    externalHosts.add(url.hostname);
    return route.abort('blockedbyclient');
  });
  // The backend is fully controlled below; never initialize a production SDK.
  await context.route('**/account-config.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const accountConfig = ${JSON.stringify({
    enabled: true, linkedSkillsEnabled: true, providers: { email: true, google: true },
    firebase: {}, grading: { enabled: false, appCheckSiteKey: '' }, emulators: null,
  })};` }));
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
  assert.equal(await page.locator('#sideProgress').innerText(), `0 / ${practicalStages}`);
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
  console.log('PASS account switch: old plan clears during loading and late previous-owner receipts cannot personalize the next account');

  // Open the exercise in B first: navigating after C's failed read would itself
  // dirty the controller and conceal the clean-state remote repaint race.
  await page.locator('#nav [data-view="home"]').click();
  await page.locator('#content [data-open="recon"][data-stage="0"]').first().click();
  await page.evaluate(() => window.testLifecycle.emitUser({ uid: 'local-owner-c', email: 'c@example.test' }));
  await page.waitForFunction(() => !!window.testLifecycle.rejects['local-owner-c']);
  await page.evaluate(() => window.testLifecycle.rejects['local-owner-c'](Object.assign(new Error('Synthetic offline read'), { code: 'unavailable' })));
  await page.waitForFunction(() => !document.querySelector('#content').inert);
  await page.locator('#stageNotes').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#saveStatus').innerText(), 'محفوظ هنا · بانتظار المزامنة');
  await page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
  await page.waitForFunction(() => window.testLifecycle.readCounts['local-owner-c'] === 2);
  const bufferedNote = 'Synthetic UI draft typed while the recovery read is pending.';
  // Resolve the cloud read in the same browser task, before the 300ms UI save.
  await page.evaluate(note => {
    const field = document.querySelector('#stageNotes');
    field.value = note;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    window.testLifecycle.reads['local-owner-c'](null);
  }, bufferedNote);
  await page.waitForFunction(note => window.testLifecycle.writes.some(write => write.uid === 'local-owner-c' && write.progress.notes['recon-0'] === note), bufferedNote);
  assert.equal(await page.locator('#stageNotes').inputValue(), bufferedNote);
  await page.waitForFunction(() => document.querySelector('#saveStatus')?.textContent === 'محفوظ في حسابك');
  assert.deepEqual(errors, []);
  assert.deepEqual([...externalHosts], [], 'controlled account lifecycle must remain local-only');
  console.log('PASS real textarea debounce race: recovery flushes newly typed text before applying remote progress and synchronizes it without repaint loss');
} finally { await browser.close(); }
