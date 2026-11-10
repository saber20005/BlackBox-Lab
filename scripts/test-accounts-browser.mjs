const { chromium } = await import(process.env.BLACKBOX_PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';

const testURL = new URL(process.env.BLACKBOX_TEST_URL || 'http://127.0.0.1:4176/');
if (!['localhost', '127.0.0.1', '[::1]'].includes(testURL.hostname)) throw new Error('Browser account tests require a local server and demo Firebase emulators.');
const config = {
  enabled: true,
  firebase: { apiKey: 'demo-api-key', projectId: 'demo-blackbox-account-tests', authDomain: 'demo-blackbox-account-tests.firebaseapp.com', appId: '1:123:web:test' },
  providers: { email: true, google: true },
  emulators: { authURL: 'http://127.0.0.1:9199', firestoreHost: '127.0.0.1', firestorePort: 8180 },
};
const browser = await chromium.launch({ executablePath: process.env.BLACKBOX_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
const errors = [];
const contexts = [];
async function newPage() {
  const context = await browser.newContext();
  contexts.push(context);
  await context.route('**/account-config.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const accountConfig = ${JSON.stringify(config)};` }));
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(testURL.href);
  await page.waitForFunction(() => !document.getElementById('accountSubmit').disabled);
  return page;
}
async function openAccount(page) {
  if (!await page.locator('#accountDialog').evaluate(e => e.open)) await page.locator('#accountButton').click();
}
async function auth(page, email, signup = false) {
  await openAccount(page);
  await page.locator(`[data-account-mode=${signup ? 'signup' : 'signin'}]`).click();
  await page.locator('#accountEmail').fill(email);
  await page.locator('#accountPassword').fill('Local-test-password-42');
  await page.locator('#accountSubmit').click();
  await page.waitForFunction(() => !document.querySelector('#accountSignedInPanel').classList.contains('hidden') && !document.querySelector('#content').inert);
}
async function openStage(page) {
  if (await page.locator('#accountDialog').evaluate(e => e.open)) await page.locator('#closeAccount').click();
  if (!await page.locator('#stageNotes').count()) {
    await page.locator('.brand').click();
    await page.locator('[data-open][data-stage="0"]').first().click();
  }
  await page.locator('#stageNotes').waitFor();
}
async function note(page, value) {
  await openStage(page);
  await page.locator('#stageNotes').fill(value);
  await page.locator('#saveDraft').click();
}
async function synced(page) {
  await page.waitForFunction(() => document.querySelector('#saveStatus').textContent === 'محفوظ في حسابك', { timeout: 15000 });
}
async function signout(page) {
  await openAccount(page);
  await page.locator('#accountSignOut').click();
  await page.waitForFunction(() => document.querySelector('#accountSignedInPanel').classList.contains('hidden'));
}
try {
  const suffix = Date.now();
  const alice = `alice-${suffix}@example.test`, bob = `bob-${suffix}@example.test`;
  const a = await newPage();
  await note(a, 'guest-only-note');
  const guestSnapshot = await a.evaluate(() => localStorage.getItem('blackbox-progress-v1'));
  await auth(a, alice, true);
  await openStage(a);
  assert.equal(await a.locator('#stageNotes').inputValue(), '');
  await openAccount(a);
  await a.locator('#importGuestProgress').click();
  await synced(a);
  await openStage(a);
  assert.equal(await a.locator('#stageNotes').inputValue(), 'guest-only-note');
  assert.equal(await a.evaluate(() => localStorage.getItem('blackbox-progress-v1')), guestSnapshot);
  await note(a, 'alice-cloud-note');
  await synced(a);
  console.log('PASS real emulator signup, guest isolation, explicit import, account save');

  const other = await newPage();
  await auth(other, alice);
  await openStage(other);
  assert.equal(await other.locator('#stageNotes').inputValue(), 'alice-cloud-note');
  await synced(other);
  await openAccount(a);
  await a.locator('#syncAccountNow').click();
  await synced(a);
  console.log('PASS second browser reads the same account from Firestore');
  await note(a, 'alice-from-first-device');
  await synced(a);
  await note(other, 'alice-from-second-device');
  await other.waitForFunction(() => !document.querySelector('#accountSyncNotice').classList.contains('hidden'));
  await openAccount(other);
  await other.locator('[data-conflict=merge]').click();
  await synced(other);
  await openStage(other);
  const merged = await other.locator('#stageNotes').inputValue();
  assert(merged.includes('alice-from-first-device') && merged.includes('alice-from-second-device'));
  console.log('PASS two-device revision conflict preserves both notes after explicit merge');

  await signout(a);
  await openStage(a);
  assert.equal(await a.locator('#stageNotes').inputValue(), 'guest-only-note');
  await auth(a, bob, true);
  await openStage(a);
  assert.equal(await a.locator('#stageNotes').inputValue(), '');
  await note(a, 'bob-private-note');
  await synced(a);
  await signout(a);
  await auth(a, alice);
  await openStage(a);
  assert.equal(await a.locator('#stageNotes').inputValue(), merged);
  console.log('PASS logout restores guest, separate account starts empty, original account restored');

  await a.context().setOffline(true);
  await note(a, 'alice-offline-draft');
  await a.waitForFunction(() => document.querySelector('#saveStatus').textContent !== 'محفوظ في حسابك');
  await openAccount(a);
  await a.locator('#accountSignOut').click();
  await a.locator('#accountUnsyncedSignOut:not(.hidden)').waitFor();
  await a.locator('#cancelSignOut').click();
  await a.context().setOffline(false);
  await a.locator('#syncAccountNow').click();
  await synced(a);
  console.log('PASS offline draft stays pending, logout guarded, online retry syncs');
  assert.deepEqual(errors, []);
  console.log('PASS no uncaught browser errors');
} catch (error) {
  for (const [index, context] of contexts.entries()) for (const page of context.pages()) {
    console.log('FAILSTATE', index, await page.locator('#accountServiceStatus').textContent(), await page.locator('#saveStatus').textContent());
  }
  throw error;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
