import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tracks } from '../data.js';

const { chromium } = await import(process.env.BLACKBOX_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifactDirectory = process.env.BLACKBOX_BROWSER_ARTIFACTS || '/tmp/blackbox-browser-artifacts';
const stageCount = tracks.reduce((count, track) => count + track.stages.length, 0);
const testConfig = `export const accountConfig = Object.freeze(${JSON.stringify({
  enabled: false, linkedSkillsEnabled: true, providers: { email: false, google: false },
  grading: { enabled: false, appCheckSiteKey: '' }, firebase: {}, emulators: null,
})});`;
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.zip': 'application/zip', '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.eml': 'message/rfc822',
};
const localRequests = [];
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    localRequests.push({ method: request.method, pathname });
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405); response.end(); return;
    }
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) {
      response.writeHead(403); response.end(); return;
    }
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    let body;
    let contentType = mime[extname(path)] || 'application/octet-stream';
    if (pathname === '/account-config.js') body = Buffer.from(testConfig);
    else if (pathname.startsWith('/_vercel/insights/')) {
      body = Buffer.from('// Analytics intentionally disabled in the local guest test.');
      contentType = mime['.js'];
    } else {
      body = await readFile(path);
      if (extname(path) === '.html') {
        // Preserve application markup/scripts while omitting third-party font hints.
        body = Buffer.from(body.toString('utf8').replace(/<link\b(?=[^>]*\brel=["'](?:preconnect|dns-prefetch|stylesheet)["'])(?=[^>]*\bhref=["']https?:\/\/)[^>]*>/g, ''));
      }
    }
    response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404); response.end();
  }
});
await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.BLACKBOX_CHROMIUM_PATH || undefined,
  headless: true, args: ['--no-sandbox'],
}).catch(async error => { await new Promise(yes => server.close(yes)); throw error; });
const report = { mode: 'local-disabled-account-guest-regression', viewports: [], blockedExternalHosts: [] };
let activePage;
let deadline;

async function settleUI(page) {
  await page.evaluate(() => new Promise(yes => requestAnimationFrame(() => requestAnimationFrame(yes))));
}
async function navigate(page, path) {
  await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
}
async function downloadBytes(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).first().click();
  const download = await pending;
  const path = await download.path();
  assert(path, 'download must be materialized locally');
  return readFile(path);
}
async function previewBackup(page, buffer) {
  await page.locator('#importFile').setInputFiles({ name: 'guest-progress.json', mimeType: 'application/json', buffer });
  await page.locator('#confirmImport').waitFor({ state: 'visible' });
  return page.locator('.import-preview').innerText();
}
async function runViewport(viewport) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const errors = [];
  const blockedHosts = new Set();
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      blockedHosts.add(url.hostname);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  const result = { width: viewport.width, height: viewport.height };
  report.activeViewport = result;
  try {
    await navigate(page, '/');
    await page.locator('#landing-start-tour').click();
    assert.equal(await page.locator('#bb-tour-overlay').isVisible(), true);
    assert.equal(await page.locator('#bb-whats-new').evaluate(el => el.open), false, 'new-features modal must not open automatically over onboarding');
    assert.equal(await page.locator('#bb-tour-bubble').getAttribute('aria-modal'), 'false', 'interactive navigation tour is nonmodal');
    if (viewport.width < 700) {
      // Exercise the real guide-button event while the custom tour owns focus.
      await page.evaluate(() => document.getElementById('bb-whats-new-open').click());
      assert.equal(await page.locator('#bb-tour-overlay').isVisible(), false, 'opening a native guide stops the active custom tour');
      assert.equal(await page.locator('#bb-whats-new').evaluate(el => el.open), true);
      await page.locator('#bb-whats-new-close').click();
    } else {
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#bb-tour-overlay').isVisible(), false);
      assert.equal(await page.evaluate(() => {
        const element = document.activeElement;
        return element !== document.body && Boolean(element?.getClientRects().length);
      }), true, 'closing the tour restores focus to a visible control');
    }

    await page.locator('#bb-whats-new-open').click();
    assert.equal(await page.locator('#bb-whats-new').evaluate(el => el.open), true);
    await page.locator('#bb-whats-new-close').click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'bb-whats-new-open');
    await page.locator('#bb-whats-new-open').click();
    assert.equal(await page.locator('#bb-whats-new').evaluate(el => el.open), true, 'seen guide can be reopened');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#bb-whats-new').evaluate(el => el.open), false);
    result.guideOpenCloseReopen = true;

    for (const view of ['home', 'tracks', 'plan', 'skills', 'journal', 'backups', 'troubleshoot']) {
      await page.locator(`#nav [data-view="${view}"]`).click();
      await page.locator('#content h1').first().waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${view} must fit the viewport`);
    }
    result.navigation = true;

    await navigate(page, '/?track=recon&stage=0');
    await page.locator('[data-template="result"]').click();
    await page.locator('#nav [data-view="home"]').click();
    assert.equal((await page.locator('[data-stat="notes"]').innerText()).trim(), '0');
    await page.locator('#nav [data-view="backups"]').click();
    const templateBackup = await downloadBytes(page, '[data-backup]');
    assert.match(await previewBackup(page, templateBackup), /0\s+مراحل موثّقة/, 'untouched writing prompts must not count as evidence in import preview');
    await page.locator('#cancelImport').click();

    await navigate(page, '/?track=recon&stage=0');
    const note = `Synthetic local guest note at viewport ${viewport.width}.`;
    await page.locator('#stageResult').fill('Synthetic browser regression result; no actual lab was performed.');
    await page.locator('#stageNotes').fill(note);
    await page.waitForFunction(note => JSON.parse(localStorage.getItem('blackbox-progress-v1') || '{}').notes?.['recon-0'] === note, note);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#stageNotes').inputValue(), note);
    assert.equal(await page.locator('#confirmStage').isDisabled(), true);
    const checks = page.locator('[data-check]');
    const checkCount = await checks.count();
    for (let index = 0; index < checkCount; index++) await checks.nth(index).check();
    assert.equal(await page.locator('#confirmStage').isEnabled(), true);
    await page.locator('#confirmStage').click();
    await page.locator('#content [data-open="recon"][data-stage="1"]').click();
    await page.locator('#stageResult').waitFor({ state: 'visible' });
    await navigate(page, '/?track=recon&stage=2');
    await page.locator('#trackSearch').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#stageResult').count(), 0, 'a direct URL must not unlock an unfinished prerequisite');
    result.draftsAndStageLocks = true;

    await page.locator('#nav [data-view="backups"]').click();
    const savedBackup = await downloadBytes(page, '[data-backup]');
    const saved = JSON.parse(savedBackup.toString('utf8'));
    assert.equal(saved.data.notes['recon-0'], note);
    assert.equal(Object.keys(saved.data.completed).length, 1);
    assert.match(await previewBackup(page, savedBackup), /1\s+مراحل مكتملة/);
    await page.locator('#cancelImport').click();
    assert.equal(await page.locator('#confirmImport').count(), 0);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('blackbox-progress-v1')).notes['recon-0']), note);
    result.backupDownloadPreviewCancel = true;

    assert.equal(tracks.length, 10, 'the approved expansion publishes ten tracks');
    assert.equal(stageCount, 30, 'the approved expansion preserves eighteen stages and adds twelve');
    await navigate(page, '/?track=logs&stage=0');
    await page.locator('#stageResult').waitFor({ state: 'visible' });
    const kit = page.locator('[data-training-kit]').first();
    assert.match(await kit.getAttribute('href'), /downloads\/blackbox-defense-kit\.zip$/);
    const archive = await downloadBytes(page, '[data-training-kit]');
    assert.equal(archive.readUInt32LE(0), 0x04034b50, 'training archive must be a downloadable ZIP');
    assert.equal(await page.locator('#sideProgress').innerText(), `1 / ${stageCount}`, 'old completion survives the expanded catalogue');
    result.defensiveKitDownload = true;

    await navigate(page, '/labs.html');
    await page.locator('#catalog article').first().waitFor({ state: 'visible' });
    if (await page.locator('#lab-intro').evaluate(el => el.open)) await page.locator('#lab-intro-close').click();
    const start = page.locator('[data-lab-start]').first();
    assert.equal(await start.count(), 1, 'catalogue has a real start link');
    await start.click();
    await page.locator('#stageResult').waitFor({ state: 'visible' });
    result.catalogueStartsTraining = true;

    await navigate(page, '/vm-report.html');
    await page.locator('#vm-report-file').waitFor({ state: 'visible' });
    await page.evaluate(() => {
      const original = File.prototype.text;
      window.pendingVMReads = {};
      File.prototype.text = function () {
        if (this.name.startsWith('delayed-')) return new Promise(resolve => { window.pendingVMReads[this.name] = resolve; });
        return original.call(this);
      };
    });
    const vmBody = name => JSON.stringify({ ok: true, mode: 'read-only', machines: [{
      id: '00000000-0000-4000-8000-000000000001', name, state: 'poweroff', adapters: [{ slot: 1, attachment: 'hostonly' }],
    }] });
    const vmFile = (name, machine) => ({ name, mimeType: 'application/json', buffer: Buffer.from(vmBody(machine)) });
    await page.locator('#vm-report-file').setInputFiles(vmFile('delayed-old.json', 'Stale-A'));
    await page.waitForFunction(() => typeof window.pendingVMReads['delayed-old.json'] === 'function');
    await page.locator('#vm-report-file').setInputFiles(vmFile('current.json', 'Newest-B'));
    await page.locator('#vm-report-results h3').waitFor({ state: 'visible' });
    await page.evaluate(body => window.pendingVMReads['delayed-old.json'](body), vmBody('Stale-A'));
    await settleUI(page);
    assert.deepEqual(await page.locator('#vm-report-results h3').allTextContents(), ['Newest-B']);
    await page.locator('#vm-report-file').setInputFiles(vmFile('delayed-clear.json', 'Cleared-C'));
    await page.waitForFunction(() => typeof window.pendingVMReads['delayed-clear.json'] === 'function');
    await page.locator('#vm-report-clear').click();
    await page.evaluate(body => window.pendingVMReads['delayed-clear.json'](body), vmBody('Cleared-C'));
    await settleUI(page);
    assert.equal(await page.locator('#vm-report-results article').count(), 0);
    assert.match(await page.locator('#vm-report-status').innerText(), /لم يُحمّل/);
    result.vmReadCancellation = true;

    assert.deepEqual(errors, [], 'the complete guest journey must have no uncaught JavaScript errors');
    assert.deepEqual([...blockedHosts], [], 'the disabled-account fixture must not attempt external network calls');
    report.viewports.push(result);
    delete report.activeViewport;
    console.log(`PASS guest browser journey at ${viewport.width}px: guides, navigation, drafts, locks, backup, defensive kit, catalogue and VM read cancellation`);
  } catch (error) {
    await mkdir(artifactDirectory, { recursive: true });
    try { await page.screenshot({ path: resolve(artifactDirectory, 'failure.png'), fullPage: true }); } catch {}
    throw error;
  } finally {
    report.blockedExternalHosts.push(...blockedHosts);
    await context.close();
  }
}

try {
  await Promise.race([
    (async () => { for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) await runViewport(viewport); })(),
    new Promise((_, no) => { deadline = setTimeout(() => no(new Error('Guest browser regression exceeded its three-minute deadline')), 180000); }),
  ]);
  const lifecycle = await promisify(execFile)(process.execPath, [resolve(root, 'scripts/test-training-plan-lifecycle.mjs')], {
    env: { ...process.env, BLACKBOX_TEST_URL: origin + '/?view=plan' }, timeout: 60000,
  });
  process.stdout.write(lifecycle.stdout);
  report.controlledAccountLifecycle = true;
  assert(localRequests.every(request => ['GET', 'HEAD'].includes(request.method)));
  console.log('PASS local-only fixture: accounts/grading disabled, analytics stubbed, no external requests or cloud writes');
} catch (error) {
  await mkdir(artifactDirectory, { recursive: true });
  try { if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: resolve(artifactDirectory, 'failure.png'), fullPage: true }); } catch {}
  await writeFile(resolve(artifactDirectory, 'failure.json'), JSON.stringify({ ...report, failure: error.message }, null, 2));
  throw error;
} finally {
  clearTimeout(deadline);
  await browser.close();
  await new Promise(yes => server.close(yes));
}
