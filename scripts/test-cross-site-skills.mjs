const { chromium } = await import(process.env.BLACKBOX_PLAYWRIGHT_MODULE || 'playwright');
const { CASES } = await import(process.env.CYBERTRACE_CASES_MODULE || new URL('../../CyberTrace/src/data/cases.js', import.meta.url).href);
import assert from 'node:assert/strict';

const cyberBase = new URL(process.env.CYBERTRACE_TEST_URL || 'http://127.0.0.1:4175/');
const blackboxBase = new URL(process.env.BLACKBOX_TEST_URL || 'http://127.0.0.1:4176/');
for (const target of [cyberBase, blackboxBase]) if (!['localhost','127.0.0.1','[::1]'].includes(target.hostname)) throw new Error('Paired tests require local servers and demo Firebase emulators.');
const firebase = { apiKey: 'demo-api-key', projectId: 'demo-blackbox-account-tests', authDomain: 'demo-blackbox-account-tests.firebaseapp.com', appId: '1:123:web:linked-test' };
const emulators = { authURL: 'http://127.0.0.1:9199', firestoreHost: '127.0.0.1', firestorePort: 8180 };
const browser = await chromium.launch({ executablePath: process.env.BLACKBOX_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
const contexts = [];
const errors = [];
async function context() {
  const result = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  contexts.push(result);
  await result.route(/https:\/\/[^/]*googleapis\.com\//, route => route.abort());
  await result.route('**/account-config.js', route => route.fulfill({ contentType: 'text/javascript', body: `export const accountConfig = ${JSON.stringify({ enabled: true, linkedSkillsEnabled: true, firebase, emulators, providers: { email: true, google: true } })};` }));
  await result.route('**/src/blackbox/config.js*', route => route.fulfill({ contentType: 'text/javascript', body: `export const blackBoxConfig = ${JSON.stringify({ enabled: true, firebase, emulators, providers: { email: true, google: true } })};` }));
  result.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  return result;
}
async function blackboxAuth(page, email, signup = false) {
  await page.locator('#accountButton').click();
  await page.waitForFunction(() => !document.querySelector('#accountSubmit').disabled);
  await page.locator(`[data-account-mode=${signup ? 'signup' : 'signin'}]`).click();
  await page.locator('#accountEmail').fill(email);
  await page.locator('#accountPassword').fill('Linked-local-test-42');
  await page.locator('#accountSubmit').click();
  await page.waitForFunction(() => !document.querySelector('#accountSignedInPanel').classList.contains('hidden') && !document.querySelector('#content').inert);
  await page.locator('#closeAccount').click();
}
async function linkCyber(page, email) {
  await page.locator('#blackboxLinkButton').click();
  await page.locator('#blackboxLinkEmail').fill(email);
  await page.locator('#blackboxLinkPassword').fill('Linked-local-test-42');
  await page.locator('#blackboxLinkSubmit').click();
  await page.locator('#blackboxDisconnect').waitFor();
  await page.locator('#blackboxLinkClose').click();
}
async function solve(page, id, best = true, linked = true, navigate = true) {
  const investigation = CASES.find(item => item.id === id);
  if (navigate) await page.goto(new URL(`?case=${id}`, cyberBase).href);
  await page.locator('#blackboxLinkButton').waitFor();
  if (linked) await page.waitForFunction(() => document.querySelector('#blackboxLinkButton').textContent === 'إدارة الربط');
  else await page.waitForFunction(() => document.querySelector('#blackboxLinkEmail') && !document.querySelector('#blackboxLinkEmail').disabled);
  const evidence = investigation.evidenceOptions.find(option => option.correct === best);
  const decision = [...investigation.decisions].sort((a, b) => best ? b.points - a.points : a.points - b.points)[0];
  await page.getByRole('button', { name: /ابدأ التحليل/ }).click();
  await page.getByRole('button', { name: evidence.label, exact: true }).click();
  await page.getByRole('button', { name: /تأكيد الاختيار/ }).click();
  await page.getByRole('button', { name: /المتابعة إلى القرار/ }).click();
  await page.getByRole('button', { name: decision.label, exact: true }).click();
  await page.getByRole('button', { name: /تنفيذ القرار/ }).click();
  await page.locator('.inv-result').waitFor();
  return (evidence.correct ? 30 : 10) + decision.points;
}
async function points(page, expected) {
  await page.waitForFunction(value => document.querySelector('#linkedSkillPoints')?.textContent === String(value), expected);
}
try {
  const session = await context();
  const blackbox = await session.newPage();
  const cyber = await session.newPage();
  const suffix = Date.now();
  const alice = `linked-alice-${suffix}@example.test`, bob = `linked-bob-${suffix}@example.test`;
  await blackbox.goto(new URL('?view=skills', blackboxBase).href);
  await blackboxAuth(blackbox, alice, true);
  await points(blackbox, 0);
  await solve(cyber, 'INC-0512', true, false);
  await linkCyber(cyber, alice);
  await points(blackbox, 0);
  assert(!await blackbox.locator('[data-linked-case-id="INC-0512"] .linked-case-score').count());
  console.log('PASS separate origins: linking the existing account does not import guest history automatically');

  const firstScore = await solve(cyber, 'INC-0417', false);
  await points(blackbox, firstScore);
  assert.equal(await blackbox.locator('#sideProgress').textContent(), '0 / 18');
  await cyber.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await solve(cyber, 'INC-0417', true, true, false);
  await points(blackbox, 70);
  assert.equal(await blackbox.locator('[data-skill-id="identity"] progress').getAttribute('value'), '25');
  await cyber.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await solve(cyber, 'INC-0417', true, true, false);
  await cyber.waitForFunction(() => document.querySelector('.bb-link-mini-status')?.textContent === 'الحساب مرتبط');
  await points(blackbox, 70);
  console.log('PASS actual completion streams to BlackBox, a better score adds only its improvement, repetition adds nothing, practical stages stay untouched');

  await cyber.locator('#blackboxLinkButton').click();
  await cyber.locator('#blackboxImportHistory').click();
  await points(blackbox, 140);
  await cyber.locator('#blackboxLinkClose').click();
  console.log('PASS explicit history import credits the old scored investigation exactly once');

  await cyber.goto(new URL('?case=INC-0701', cyberBase).href);
  await cyber.waitForFunction(() => document.querySelector('#blackboxLinkButton')?.textContent === 'إدارة الربط');
  await session.setOffline(true);
  await solve(cyber, 'INC-0701', true, true, false);
  await cyber.waitForFunction(() => /تنتظر المزامنة/.test(document.querySelector('.bb-link-mini-status')?.textContent || ''));
  assert.equal(await blackbox.locator('#linkedSkillPoints').textContent(), '140');
  await session.setOffline(false);
  await cyber.locator('#blackboxLinkButton').click();
  await cyber.locator('#blackboxRetryPending').click();
  await points(blackbox, 210);
  await cyber.locator('#blackboxLinkClose').click();
  console.log('PASS offline completion stays pending and resumes into the original account after reconnect');

  await blackbox.locator('#accountButton').click();
  await blackbox.locator('#accountSignOut').click();
  await blackbox.waitForFunction(() => document.querySelector('#accountSignedInPanel').classList.contains('hidden'));
  await blackbox.locator('#closeAccount').click();
  await blackboxAuth(blackbox, bob, true);
  await points(blackbox, 0);
  await cyber.locator('#blackboxLinkButton').click();
  await cyber.locator('#blackboxDisconnect').click();
  await cyber.locator('#blackboxLinkEmail').waitFor();
  await cyber.locator('#blackboxLinkClose').click();
  await linkCyber(cyber, bob);
  await points(blackbox, 0);
  await solve(cyber, 'INC-0633', true);
  await points(blackbox, 70);
  assert.equal(await blackbox.locator('#sideProgress').textContent(), '0 / 18');
  assert(!await blackbox.locator('[data-linked-case-id="INC-0417"] .linked-case-score').count());
  console.log('PASS account switching clears previous receipts and credits only the newly linked UID');

  const independent = await context();
  const original = await independent.newPage();
  await original.goto(new URL('?view=skills', blackboxBase).href);
  await blackboxAuth(original, alice);
  await points(original, 210);
  assert(!await original.locator('[data-linked-case-id="INC-0633"] .linked-case-score').count());
  assert.deepEqual(errors, []);
  console.log('PASS original account remains intact in a separate browser; no uncaught browser errors');
} catch (error) {
  for (const [i, session] of contexts.entries()) for (const [j, page] of session.pages().entries()) {
    console.log('FAILSTATE', i, j, page.url());
  }
  throw error;
} finally {
  for (const session of contexts) await session.close();
  await browser.close();
}
