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
async function disclosure(page, selector, open = true, keyboard = false) {
  const panel = page.locator(selector).first();
  await panel.waitFor({ state: 'visible' });
  if (await panel.evaluate(element => element.open) !== open) {
    const summary = panel.locator(':scope > summary');
    if (keyboard) { await summary.focus(); await summary.press('Space'); }
    else await summary.click();
  }
  assert.equal(await panel.evaluate(element => element.open), open, `${selector} follows its native disclosure state`);
}
async function openTools(page) { await disclosure(page, '#workspace-tools'); }
async function openView(page, view) {
  const group = ['plan', 'journal', 'skills'].includes(view) ? 'progress'
    : ['backups', 'troubleshoot'].includes(view) ? 'account' : view;
  await page.locator(`#nav [data-view="${group}"]`).click();
  if (group !== view) await page.locator(`.context-nav [data-nav="${view}"]`).click();
  await page.locator('#content h1').first().waitFor({ state: 'visible' });
  assert.equal(await page.locator('#nav [aria-current="page"]').getAttribute('data-view'), group, 'secondary views keep their primary group active');
}
async function assertPrimaryNavigation(page) {
  assert.deepEqual(await page.locator('#nav [data-view]').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => node.dataset.view)),
    ['home', 'tracks', 'progress', 'account'], 'the primary navigation has four reachable items');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'primary navigation fits the viewport');
}
async function assertCompactHome(page) {
  const home = page.locator('[data-training-home]');
  await home.waitFor({ state: 'visible' });
  assert.equal(await home.locator(':scope > section:not(.hero)').count(), 3, 'training home presents resume, compact progress and one next-session suggestion');
  assert.equal(await home.locator('.path, #defenseIntroTitle, #partnerTitle').count(), 0, 'the complete catalogue and promotional blocks belong outside training home');
  assert.equal(await page.locator('#bb-whats-new-open').isVisible(), false, 'feature announcements stay inside closed tools');
  const resume = await home.locator('.resume-button').boundingBox();
  assert(resume && resume.y >= 0 && resume.y + resume.height <= page.viewportSize().height, 'the main training action is visible without scrolling past announcements');
}
async function freshPrimaryLinks() {
  for (const view of ['home', 'tracks', 'progress', 'account']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const external = [], errors = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      external.push(new URL(route.request().url()).hostname); return route.abort('blockedbyclient');
    });
    const page = await context.newPage(); activePage = page;
    page.on('pageerror', error => errors.push(error.message));
    try {
      // Each direct view starts without an intro marker, cached DOM or learner state.
      await navigate(page, '/?view=' + view);
      await page.waitForFunction(() => document.documentElement.dataset.bbAppReady === 'true'
        && document.documentElement.dataset.bbLandingReady === 'true');
      await page.locator('#content h1').waitFor({ state: 'visible' });
      assert.equal(await page.locator('body').evaluate(node => node.classList.contains('bb-landing-active')), false,
        `fresh ${view} remains in the workspace after both startup scripts settle`);
      await assertPrimaryNavigation(page);
      assert.equal(await page.locator('#nav [aria-current="page"]').getAttribute('data-view'), view);
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
    } finally { await context.close(); }
  }
  report.freshPrimaryLinks = true;
  console.log('PASS fresh primary links: training home, tracks, progress and account remain usable after both startup scripts settle');
}
async function freshDeepLinkAndNavigation() {
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport });
    const external = [], errors = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      external.push(new URL(route.request().url()).hostname); return route.abort('blockedbyclient');
    });
    const page = await context.newPage(); activePage = page;
    page.on('pageerror', error => errors.push(error.message));
    try {
      // No stored introduction marker or learner state exists in this context.
      await navigate(page, '/?track=logs&stage=0');
      await page.locator('#stageNotes').waitFor({ state: 'visible' });
      assert.equal(await page.locator('body').evaluate(node => node.classList.contains('bb-landing-active')), false, 'first-visit training links enter the workspace directly');
      await assertPrimaryNavigation(page);
      assert.equal(await page.locator('[data-training-hints-disclosure]').evaluate(node => node.open), false);
      assert.equal(await page.locator('[data-training-resources]').evaluate(node => node.open), false);
      assert.equal(await page.locator('#workspace-tools').evaluate(node => node.open), false);
      for (const view of ['home', 'tracks', 'progress', 'account']) {
        await openView(page, view);
        await assertPrimaryNavigation(page);
        if (view === 'home') await assertCompactHome(page);
      }
      await page.locator('[data-environment-settings] summary').click();
      await page.locator('a[href*="intro=1"]').click();
      await page.locator('#local-lab-setup').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.documentElement.dataset.bbLandingReady === 'true');
      assert.equal(await page.locator('#local-lab-setup').evaluate(node => node.open), true, 'requesting local setup opens its optional guide');
      assert.equal(new URL(page.url()).searchParams.get('intro'), '1', 'initial route normalization preserves the explicit help request');
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-environment-settings]').waitFor({ state: 'visible' });
      await assertPrimaryNavigation(page);
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      console.log(`PASS simplified workspace at ${viewport.width}px: fresh deep link, four primary destinations, compact home and folded tools`);
    } finally { await context.close(); }
  }
  report.freshDeepLinksAndCompactNavigation = true;
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
    await navigate(page, '/?intro=1');
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

    await openTools(page);
    await page.locator('#bb-whats-new-open').click();
    assert.equal(await page.locator('#bb-whats-new').evaluate(el => el.open), true);
    await page.locator('#bb-whats-new-close').click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'bb-whats-new-open');
    await page.locator('#bb-whats-new-open').click();
    assert.equal(await page.locator('#bb-whats-new').evaluate(el => el.open), true, 'seen guide can be reopened');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#bb-whats-new').evaluate(el => el.open), false);
    result.guideOpenCloseReopen = true;
    await disclosure(page, '#workspace-tools', false);
    await assertPrimaryNavigation(page);

    for (const view of ['home', 'tracks', 'progress', 'account', 'plan', 'skills', 'journal', 'backups', 'troubleshoot']) {
      await openView(page, view);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${view} must fit the viewport`);
    }
    result.navigation = true;

    await navigate(page, '/?track=recon&stage=0');
    assert.equal(await page.locator('[data-training-hints-disclosure]').evaluate(element => element.open), false, 'hints start folded');
    await disclosure(page, '[data-training-hints-disclosure]', true, true);
    await page.locator('[data-hint-next]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-hint-level="3"]').count(), 0, 'review text is absent before explicit reveal');
    await page.locator('[data-hint-next]').click();
    await page.locator('[data-hint-level="1"]').waitFor({ state: 'visible' });
    await page.locator('[data-hint-next]').click();
    await page.locator('[data-hint-level="2"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-hint-review]').isDisabled(), true, 'review requires a written attempt');
    await page.locator('[data-template="result"]').click();
    assert.equal(await page.locator('[data-hint-review]').isDisabled(), true, 'an untouched writing template is not an attempt');
    await page.locator('#nav [data-view="home"]').click();
    assert.equal((await page.locator('[data-stat="notes"]').innerText()).trim(), '0');
    await openView(page, 'backups');
    const templateBackup = await downloadBytes(page, '[data-backup]');
    assert.match(await previewBackup(page, templateBackup), /0\s+مراحل موثّقة/, 'untouched writing prompts must not count as evidence in import preview');
    await page.locator('#cancelImport').click();

    await navigate(page, '/?track=recon&stage=0');
    const note = `Synthetic local guest note at viewport ${viewport.width}.`;
    await page.locator('#stageResult').fill('Synthetic browser regression result; no actual lab was performed.');
    await page.locator('#stageNotes').fill(note);
    await disclosure(page, '[data-training-hints-disclosure]');
    await page.locator('[data-hint-next]').click();
    await page.locator('[data-hint-next]').click();
    assert.equal(await page.locator('[data-hint-review]').isDisabled(), false);
    await page.locator('[data-hint-review]').click();
    await page.locator('[data-hint-level="3"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#stageNotes').inputValue(), note, 'revealing review preserves the learner draft');
    await disclosure(page, '[data-training-hints-disclosure]', false);
    await disclosure(page, '[data-training-hints-disclosure]', true, true);
    await page.locator('[data-hint-level="3"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#stageNotes').inputValue(), note, 'folding and reopening hints preserves the draft and revealed review');
    await page.waitForFunction(note => JSON.parse(localStorage.getItem('blackbox-progress-v1') || '{}').notes?.['recon-0'] === note, note);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#stageNotes').inputValue(), note);

    // Security regression: locally saved, user-authored evidence must remain
    // literal text across the exercise textarea and journal HTML render paths.
    // Include a closing textarea marker to catch parser-context breakouts.
    const syntheticMarkup = '</textarea><svg onload="window.__bbXssTest=1"></svg><img src=x onerror="window.__bbXssTest=1">';
    await page.locator('#stageResult').fill(syntheticMarkup);
    await page.locator('#stageNotes').fill(syntheticMarkup);
    await page.waitForFunction(value => {
      const stored = JSON.parse(localStorage.getItem('blackbox-progress-v1') || '{}');
      return stored.notes?.['recon-0'] === value && stored.results?.['recon-0'] === value;
    }, syntheticMarkup);
    await openView(page, 'journal');
    await page.locator('.journal-entry').first().waitFor({ state: 'visible' });
    assert((await page.locator('.journal-entry').first().innerText()).includes(syntheticMarkup),
      'journal displays the exact saved note as text');
    assert.equal(await page.locator('.journal-entry svg, .journal-entry img').count(), 0,
      'saved HTML/SVG-like evidence must not become active journal DOM elements');
    assert.equal(await page.evaluate(() => window.__bbXssTest ?? null), null,
      'saved HTML/SVG-like evidence must not execute browser event handlers');
    await navigate(page, '/?track=recon&stage=0');
    assert.equal(await page.locator('#stageResult').inputValue(), syntheticMarkup,
      'a closing textarea tag in saved evidence remains literal');
    assert.equal(await page.locator('#stageNotes').inputValue(), syntheticMarkup,
      'a closing textarea tag in saved notes remains literal');
    assert.equal(await page.evaluate(() => window.__bbXssTest ?? null), null);
    await page.locator('#stageResult').fill('Synthetic browser regression result; no actual lab was performed.');
    await page.locator('#stageNotes').fill(note);
    await page.waitForFunction(value => {
      const stored = JSON.parse(localStorage.getItem('blackbox-progress-v1') || '{}');
      return stored.notes?.['recon-0'] === value &&
        stored.results?.['recon-0'] === 'Synthetic browser regression result; no actual lab was performed.';
    }, note);
    result.savedHtmlSvgRemainsText = true;
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

    await openView(page, 'backups');
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
    assert.equal(await page.locator('[data-training-resources]').evaluate(element => element.open), false, 'optional local resources start folded');
    await disclosure(page, '[data-training-resources]', true, true);
    const kit = page.locator('[data-training-kit]').first();
    assert.match(await kit.getAttribute('href'), /downloads\/blackbox-defense-kit\.zip$/);
    const archive = await downloadBytes(page, '[data-training-kit]');
    assert.equal(archive.readUInt32LE(0), 0x04034b50, 'training archive must be a downloadable ZIP');
    assert.equal(await page.locator('#sideProgress').innerText(), `1 / ${stageCount}`, 'old completion survives the expanded catalogue');
    result.defensiveKitDownload = true;
    await disclosure(page, '[data-training-resources]', false);
    assert.equal(await page.locator('[data-training-hints-disclosure]').evaluate(element => element.open), false);
    assert.equal(await page.evaluate(() => {
      const guide = document.querySelector('.stage-guide');
      const evidence = document.querySelector('[data-evidence-workbench]');
      const answer = document.querySelector('#stageResult');
      const complete = document.querySelector('#confirmStage');
      return Boolean(guide.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING)
        && Boolean(evidence.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING)
        && Boolean(answer.compareDocumentPosition(complete) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), true, 'the task precedes evidence, answer and completion');

    await page.locator('[data-evidence-search]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('[data-evidence-line]').length === 12);
    await page.locator('[data-evidence-search]').fill('session-lab-02');
    await page.waitForFunction(() => document.querySelectorAll('[data-evidence-line]').length === 4);
    await page.locator('[data-evidence-search]').fill('');
    await page.locator('[data-evidence-filter-event]').selectOption('file_read');
    await page.waitForFunction(() => document.querySelectorAll('[data-evidence-line]').length === 2);
    await page.locator('[data-evidence-filter-event]').selectOption('');
    const draftResult = 'Synthetic existing result before selecting a source row.';
    const draftNote = 'Synthetic note must survive adding a citation.';
    await page.locator('#stageResult').fill(draftResult);
    await page.locator('#stageNotes').fill(draftNote);
    await page.locator('[data-evidence-select="6"]').check();
    await disclosure(page, '[data-training-resources]', true);
    await disclosure(page, '[data-training-resources]', false, true);
    assert.equal(await page.locator('[data-evidence-select="6"]').isChecked(), true, 'resource toggling preserves the evidence selection');
    assert.equal(await page.locator('#stageResult').inputValue(), draftResult);
    assert.equal(await page.locator('#stageNotes').inputValue(), draftNote);
    await page.locator('[data-evidence-append]').click();
    const cited = await page.locator('#stageResult').inputValue();
    assert(cited.startsWith(draftResult));
    assert.match(cited, /auth-events\.csv/);
    assert.match(cited, /السطر 6/);
    assert.match(cited, /198\.51\.100\.20/);
    assert.equal(await page.locator('#stageNotes').inputValue(), draftNote);
    assert.equal(await page.locator('#confirmStage').isDisabled(), true, 'selecting evidence does not award stage completion');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#stageResult').inputValue(), cited);
    assert.equal(await page.locator('#stageNotes').inputValue(), draftNote);
    assert.equal(await page.locator('#sideProgress').innerText(), `1 / ${stageCount}`);
    result.evidenceFilteringCitationAndDrafts = true;

    // Leave before the debounced save, then return through browser history.
    const navigatedDraft = cited + '\nSynthetic navigation draft.';
    await page.locator('#stageResult').fill(navigatedDraft);
    await openView(page, 'account');
    await page.goBack();
    await page.locator('#stageResult').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#stageResult').inputValue(), navigatedDraft, 'account navigation and browser Back preserve a pending draft');
    assert.equal(await page.locator('#stageNotes').inputValue(), draftNote);
    result.disclosureAndHistoryPreserveDrafts = true;

    await disclosure(page, '[data-training-resources]');
    const openedGuide = page.waitForEvent('popup');
    await page.locator('[data-training-guide]').click();
    const guide = await openedGuide;
    guide.on('pageerror', error => errors.push(error.message));
    await guide.waitForLoadState('domcontentloaded');
    assert.equal(new URL(guide.url()).pathname, '/training-guide.html', 'the learner link opens a rendered guide instead of raw Markdown');
    await guide.locator('main h1').waitFor({ state: 'visible' });
    assert.equal(await guide.locator('html').getAttribute('dir'), 'rtl');
    assert.equal(await guide.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'the readable guide must fit the viewport');
    assert(await guide.locator('body').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16), 'guide body text must remain legible on mobile');
    assert.equal(await guide.locator('a[href$=".md"]').count(), 0, 'the guide does not send readers to another raw Markdown page');
    for (const id of ['logs', 'integrity', 'headers', 'email']) {
      const href = await guide.locator(`[data-guide-track="${id}"]`).getAttribute('href');
      const target = new URL(href, guide.url());
      assert.equal(target.origin, origin);
      assert.equal(target.searchParams.get('track'), id);
      assert.equal(target.searchParams.get('stage'), '0');
    }
    const guideArchive = await downloadBytes(guide, '[data-training-kit]');
    assert(archive.equals(guideArchive), 'the readable guide downloads the existing evidence kit');
    await guide.locator('[data-guide-track="email"]').click();
    await guide.locator('#stageNotes').waitFor({ state: 'visible' });
    assert.equal(new URL(guide.url()).searchParams.get('track'), 'email', 'guide start link opens the real exercise');
    await guide.close();
    assert.equal(await page.locator('#sideProgress').innerText(), `1 / ${stageCount}`, 'opening the guide preserves the original training tab');
    result.readableTrainingGuide = true;

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
    console.log(`PASS guest browser journey at ${viewport.width}px: guides, navigation, drafts, locks, backup, defensive kit, readable learner guide, catalogue and VM read cancellation`);
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
    (async () => { await freshPrimaryLinks(); await freshDeepLinkAndNavigation(); for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) await runViewport(viewport); })(),
    new Promise((_, no) => { deadline = setTimeout(() => no(new Error('Guest browser regression exceeded its three-minute deadline')), 180000); }),
  ]);
  const staticGuideContext = await browser.newContext({ viewport: { width: 320, height: 740 }, javaScriptEnabled: false });
  const staticExternalHosts = new Set();
  await staticGuideContext.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    staticExternalHosts.add(url.hostname);
    return route.abort('blockedbyclient');
  });
  try {
    const guide = await staticGuideContext.newPage();
    activePage = guide;
    await navigate(guide, '/training-guide.html');
    await guide.locator('main h1').waitFor({ state: 'visible' });
    assert.equal(await guide.locator('[data-guide-track]').count(), 4, 'all track links remain available without JavaScript');
    assert.equal(await guide.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'guide fits a narrow 320px screen without JavaScript');
    await guide.locator('[data-guide-track="logs"]').focus();
    assert.equal(await guide.evaluate(() => document.activeElement.dataset.guideTrack), 'logs');
    assert.deepEqual([...staticExternalHosts], [], 'the static guide loads without external dependencies');
    report.staticGuideWithoutJavaScript = true;
    console.log('PASS readable training guide at 320px with JavaScript disabled');
  } finally { await staticGuideContext.close(); }
  // Direct final-capstone route: no unexpected external calls or awards in
  // the disabled production configuration, including narrow 320px phones.
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const ctx = await browser.newContext({ viewport });
    const blocked = [], errors = [];
    await ctx.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      blocked.push(url.hostname); return route.abort('blockedbyclient');
    });
    const page = await ctx.newPage();
    activePage = page;
    page.on('pageerror', error => errors.push(error.message));
    try {
      await navigate(page, '/defense-final.html');
      await page.locator('#exam-status').waitFor({ state: 'visible' });
      assert.match(await page.locator('#exam-status').innerText(), /غير مفعّل/);
      assert.equal(await page.locator('#exam-start').isDisabled(), true);
      assert.equal(await page.locator('#portfolio-form').isVisible(), false);
      assert.equal(await page.locator('#reviewer-console').isVisible(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false,
        'the new final-capstone page fits narrow phones');
      assert.deepEqual(errors, [], 'no JavaScript crashes in disabled final exam route');
      assert.deepEqual(blocked, [], 'no external grading calls when disabled');
    } finally { await ctx.close(); }
  }
  report.finalCapstonePhoneSafety = true;
  console.log('PASS final capstone disabled safely at 320px, 390px and desktop without network calls');

  // Inspect the new read-only suite page directly, including 320px phones.
  for (const viewport of [{width:320,height:740},{width:390,height:844},{width:1440,height:1000}]) {
    const suiteContext = await browser.newContext({viewport});
    const suiteErrors=[],suiteExternal=[];
    await suiteContext.route('**/*', route => {
      if(new URL(route.request().url()).origin===origin) return route.continue();
      suiteExternal.push(route.request().url()); return route.abort('blockedbyclient');
    });
    const suitePage = await suiteContext.newPage();
    activePage=suitePage;
    suitePage.on('pageerror',error=>suiteErrors.push(error.message));
    try {
      await navigate(suitePage,'/?view=journeys');
      await suitePage.locator('.suite-card').first().waitFor({state:'visible'});
      assert.equal(await suitePage.locator('.suite-card').count(),4,'suite page lists all four pathways');
      assert.equal(await suitePage.locator('.suite-step').count(),16,'suite page links to sixteen actual steps');
      const journeyPanels=suitePage.locator('details.suite-card');
      assert.equal(await journeyPanels.count(),4,'all suite paths are native details');
      assert.equal(await journeyPanels.first().evaluate(node=>node.open),true);
      assert.equal(await journeyPanels.nth(1).evaluate(node=>node.open),false);
      const secondSummary=journeyPanels.nth(1).locator('summary');
      await secondSummary.focus();
      await secondSummary.press('Enter');
      assert.equal(await journeyPanels.nth(1).evaluate(node=>node.open),true,'keyboard opens journey');
      await secondSummary.press('Enter');
      assert.equal(await journeyPanels.nth(1).evaluate(node=>node.open),false,'keyboard closes journey');
      assert.equal(await suitePage.locator('#nav [aria-current="page"]').getAttribute('data-view'),'tracks','suite is part of the training nav');
      assert.equal(await suitePage.locator('.context-nav [data-nav="journeys"]').getAttribute('aria-current'),'page');
      assert.equal(await suitePage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'suite steps fit narrow mobile screens');
      assert.deepEqual(await suitePage.locator('.suite-step a').evaluateAll(links=>links.map(a=>new URL(a.href).origin).filter(x=>!['https://blackboxlab.dev','https://www.cybertracelab.dev'].includes(x))),[],'suite links use only the two known public origins');
      assert.deepEqual(suiteErrors,[],'suite UI raises no uncaught errors');
      assert.deepEqual(suiteExternal,[],'suite does not fetch the partner site or transmit user data');
    } finally {await suiteContext.close();}
  }
  report.suiteJourneysMobileSafe=true;
  console.log('PASS suite learning journeys: four paths and 16 safe links, mobile/desktop fit, zero cross-site requests');

  // Experience Studio V2: controls must really work, persist and fit phones.
  for(const viewport of [{width:320,height:740},{width:390,height:844},{width:1440,height:1000}]){
    const studioContext=await browser.newContext({viewport});
    const studioErrors=[];
    await studioContext.route('**/*',route=>{
      const uri=new URL(route.request().url());
      return uri.origin===origin?route.continue():route.abort('blockedbyclient');
    });
    const page=await studioContext.newPage();
    activePage=page;
    page.on('pageerror',error=>studioErrors.push(error.message));
    try{
      await navigate(page,'/?view=settings');
      await page.locator('.bb-studio-preview').waitFor({state:'visible'});
      assert.equal(await page.locator('.bb-studio-preset').count(),3);
      assert.equal(await page.locator('.bb-studio-theme').count(),3);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'studio fits '+viewport.width+'px');
      const original=await page.locator('.bb-studio-preview').evaluate(el=>getComputedStyle(el).backgroundColor);
      await page.locator('[data-bb-choice-key="theme"][data-bb-choice-value="stealth"]').click();
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.bbTheme),'stealth');
      const updated=await page.locator('.bb-studio-preview').evaluate(el=>getComputedStyle(el).backgroundColor);
      assert.notEqual(updated,original,'preview theme responds to live selection');
      await page.locator('[data-bb-choice-key="accent"][data-bb-choice-value="violet"]').click();
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.bbAccent),'violet');
      await page.locator('[data-bb-preset="reading"]').click();
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.bbTheme),'light');
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.bbContrast),'high');
      await page.locator('[data-bb-ui-key="level"]').selectOption('advanced');
      await page.locator('[data-bb-preset="focus"]').click();
      assert.equal(await page.locator('[data-bb-ui-key="level"]').inputValue(),'advanced','presets preserve self-reported level');
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.bbMotion),'reduce');
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.bbDensity),'compact');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'focused studio remains phone-safe');
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('.bb-studio-preview').waitFor({state:'visible'});
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.bbTheme),'stealth','theme survives reload');
      assert.equal(await page.locator('[data-bb-ui-key="level"]').inputValue(),'advanced');
      await page.locator('[data-bb-ui-reset]').click();
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.bbTheme),'dark');
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.bbAccent),'brand');
      assert.deepEqual(studioErrors,[],'no unexpected studio browser exceptions');
    } finally {await studioContext.close();}
  }
  report.experienceStudioMobileSafe=true;
  console.log('PASS experience studio: live controls, presets, persistence, account-state isolation, 320/390/1440 fit');

  // Download the exact user-facing HTML report, then open it offline at phone sizes.
  // Markdown remains available separately; do not infer display fidelity from a raw .md viewer.
  for(const viewport of [{width:320,height:740},{width:390,height:844},{width:1440,height:1000}]){
    const reportContext=await browser.newContext({viewport,acceptDownloads:true});
    const outside=[],pageErrors=[];
    await reportContext.route('**/*',route=>{
      const target=new URL(route.request().url());
      if(target.origin===origin || target.protocol==='about:')return route.continue();
      outside.push(route.request().url());return route.abort('blockedbyclient');
    });
    const appPage=await reportContext.newPage();
    activePage=appPage;
    appPage.on('pageerror',error=>pageErrors.push(error.message));
    try{
      await navigate(appPage,'/?view=backups');
      const defaultAction=appPage.locator('[data-report]').first();
      await defaultAction.waitFor({state:'visible'});
      assert.match(await defaultAction.innerText(),/HTML/,'the default format is browser-readable');
      const [htmlFile]=await Promise.all([appPage.waitForEvent('download'),defaultAction.click()]);
      assert.match(htmlFile.suggestedFilename(),/^blackbox-report-\d{4}-\d{2}-\d{2}\.html$/);
      const html=await readFile(await htmlFile.path(),'utf8');
      assert.match(html,/<html lang="ar" dir="rtl">/);
      assert.match(html,/طباعة أو حفظ PDF/);
      assert.equal((html.match(/<details class="stage"/g)||[]).length,stageCount,'all original stages exported');
      assert.match(html,/لم تُسجّل نتائج لهذه المرحلة/);
      const reportPage=await reportContext.newPage();
      activePage=reportPage;
      reportPage.on('pageerror',error=>pageErrors.push(error.message));
      await reportPage.setContent(html,{waitUntil:'domcontentloaded'});
      assert.equal(await reportPage.locator('h1').innerText(),'تقرير التدريب');
      assert.equal(await reportPage.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,
        'exported report must fit '+viewport.width+'px without horizontal scroll');
      assert.equal(await reportPage.locator('.stage').count(),stageCount);
      const initialOpen=await reportPage.locator('.stage[open]').count();
      await reportPage.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
      assert.equal(await reportPage.locator('.stage[open]').count(),stageCount,'print shows every stage');
      await reportPage.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
      assert.equal(await reportPage.locator('.stage[open]').count(),initialOpen,'print restores previous section state');
      await reportPage.evaluate(()=>{window.print=()=>{document.body.dataset.printRequested='yes';};});
      await reportPage.locator('#printReport').click();
      assert.equal(await reportPage.locator('body').getAttribute('data-print-requested'),'yes',
        'Save PDF action invokes browser print rather than a fake export');
      assert.deepEqual(pageErrors,[],'no application or standalone report errors');
      assert.deepEqual(outside,[],'the standalone report never fetches external content');
    }finally{await reportContext.close();}
  }
  report.mobileReportExportVerified=true;
  console.log('PASS standalone RTL report: real HTML download, offline viewing, print all sections, 320/390/1440 fit');

  // First-time BLACKBOX onboarding must work in the REAL static SPA, not only unit markup.
  for (const viewport of [{width:320,height:740},{width:390,height:844},{width:1440,height:1000}]) {
    const tourContext=await browser.newContext({viewport});
    const tourErrors=[],outside=[];
    await tourContext.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin)return route.continue();
      outside.push(url.href);return route.abort('blockedbyclient');
    });
    const tourPage=await tourContext.newPage();activePage=tourPage;
    tourPage.on('pageerror',error=>tourErrors.push(error.message));
    try{
      await navigate(tourPage,'/');
      await tourPage.locator('[data-bb-first-visit]').waitFor({state:'visible'});
      assert.equal(await tourPage.evaluate(()=>new URL(location.href).searchParams.get('view')),'welcome');
      assert.equal(await tourPage.locator('body.bb-welcome-active').count(),1);
      assert.equal(await tourPage.locator('#landing-page').isVisible(),false,'old landing is not layered under new guide');
      assert.equal(await tourPage.locator('.bb-tour-progress button').count(),6);
      assert.equal(await tourPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'intro fits '+viewport.width+'px');
      assert.equal(await tourPage.locator('.bb-tour-logo img[src="./favicon.svg"]').count(),1);
      assert.equal(await tourPage.locator('.bb-tour-console').count(),1,'meaningful lab console per step');
      assert.equal(await tourPage.locator('.bb-mission-start-grid button[data-bb-tour-step]').count(),2,'first choice guides user into simulation');
      const title=tourPage.locator('#bb-tour-main-title');
      await tourPage.locator('[data-bb-tour-next]').click();
      assert.match(await title.innerText(),/اختر طريقك/);
      assert.equal(await title.evaluate(el=>document.activeElement===el),true,'step receives keyboard focus');
      await tourPage.locator('.bb-tour-progress [data-bb-tour-step="2"]').click();
      assert.match(await title.innerText(),/اضبط شبكة المختبر/);
      assert.equal(await tourPage.locator('[data-bb-mission-adapter="nat"]').getAttribute('aria-pressed'),'true');
      await tourPage.locator('[data-bb-mission-adapter="bridged"]').click();
      assert.match(await tourPage.locator('.bb-mission-feedback').innerText(),/Bridged/);
      await tourPage.locator('[data-bb-mission-adapter="host-only"]').click();
      await tourPage.locator('[data-bb-mission-snapshot]').check();
      assert.match(await tourPage.locator('.bb-mission-readiness').innerText(),/جاهز/);
      await tourPage.locator('[data-bb-tour-next]').click();
      assert.match(await title.innerText(),/اكتب الأمر/);
      const command=tourPage.locator('#bb-mission-command');
      await command.fill('help');
      await tourPage.locator('[data-bb-mission-terminal] button[type="submit"]').click();
      assert.match(await tourPage.locator('[data-bb-mission-console]').innerText(),/AVAILABLE/);
      await command.fill('ip a');
      await tourPage.locator('[data-bb-mission-terminal] button[type="submit"]').click();
      assert.match(await tourPage.locator('[data-bb-mission-console]').innerText(),/192\.168\.56\.20/);
      await command.fill('curl https://example.com');
      await tourPage.locator('[data-bb-mission-terminal] button[type="submit"]').click();
      assert.match(await tourPage.locator('[data-bb-mission-console]').innerText(),/NOT EXECUTED/);
      // Alternative target changes the synthetic result, never the network.
      await tourPage.locator('[data-bb-mission-scenario="hardened"]').click();
      assert.equal(await tourPage.locator('[data-bb-mission-scenario="hardened"]').getAttribute('aria-pressed'),'true');
      assert.match(await tourPage.locator('.bb-mission-context').innerText(),/HTTPS/);
      await tourPage.locator('[data-bb-mission-scenario="web"]').click();
      await command.fill('nmap -sV 192.168.56.10');
      await tourPage.locator('[data-bb-mission-terminal] button[type="submit"]').click();
      assert.match(await tourPage.locator('[data-bb-mission-console]').innerText(),/22\/tcp/);
      assert.match(await tourPage.locator('[data-bb-mission-console]').innerText(),/80\/tcp/);
      assert.equal(await tourPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'terminal fits mobile width '+viewport.width);
      await tourPage.locator('[data-bb-tour-next]').click();
      assert.match(await title.innerText(),/التقط دليل/);
      await tourPage.locator('[data-bb-mission-capture="22/tcp"]').click();
      assert.equal(await tourPage.locator('[data-bb-mission-capture="22/tcp"]').isDisabled(),true);
      await tourPage.locator('#bb-mission-finding').fill('المنفذ 22 يعرّض خدمة SSH، وسأراجع إعدادات الوصول والتفويض في المختبر.');
      await tourPage.locator('[data-bb-mission-report] button[type="submit"]').click();
      assert.match(await tourPage.locator('.bb-mission-panel .bb-mission-feedback').innerText(),/اكتمل تقرير المهمة/);
      await tourPage.locator('[data-bb-tour-next]').click();
      assert.match(await title.innerText(),/أنجزت/);
      assert.match(await tourPage.locator('.bb-mission-debrief-score').innerText(),/3 \/ 3/);
      assert.equal(await tourPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'final score fits mobile width '+viewport.width);
      await tourPage.locator('[data-bb-tour-go="tracks"]').click();
      await tourPage.locator('.training-home, #selectedTrack, #content h1').first().waitFor({state:'visible'});
      assert.equal(await tourPage.evaluate(()=>localStorage.getItem('blackbox.first-visit-tour.v1')),'done');
      assert.equal(await tourPage.locator('[data-bb-first-visit]').count(),0);
      // Going Back after finishing cannot reopen the explicitly replayable welcome.
      await tourPage.goBack({waitUntil:'domcontentloaded'});
      await tourPage.locator('[data-training-home]').waitFor({state:'visible'});
      assert.equal(await tourPage.locator('[data-bb-first-visit]').count(),0,'Back must not replay a finished tour');
      await tourPage.evaluate(()=>history.forward());
      await tourPage.waitForFunction(()=>new URL(location.href).searchParams.get('view')==='tracks');
      await navigate(tourPage,'/');
      await tourPage.locator('[data-training-home]').waitFor({state:'visible'});
      assert.equal(await tourPage.locator('[data-bb-first-visit]').count(),0,'no auto replay for returning browser');
      await disclosure(tourPage,'#workspace-tools',true);
      await tourPage.locator('#bb-replay-tour').click();
      await tourPage.locator('[data-bb-first-visit]').waitFor({state:'visible'});
      await tourPage.locator('.bb-tour-progress [data-bb-tour-step="5"]').click();
      assert.match(await tourPage.locator('.bb-mission-debrief-score').innerText(),/0 \/ 3/,'replay starts clean, no persisted mission attempts');
      await tourPage.locator('.bb-tour-progress [data-bb-tour-step="0"]').click();
      assert.equal(await tourPage.locator('#bb-tour-main-title').innerText(),'مهمتك الأولى تبدأ هنا');
      await tourPage.locator('[data-bb-tour-skip]').click();
      await tourPage.locator('[data-training-home]').waitFor({state:'visible'});
      await navigate(tourPage,'/?view=welcome');
      await tourPage.locator('[data-bb-first-visit]').waitFor({state:'visible'});
      await tourPage.locator('[data-bb-tour-skip]').click();
      await navigate(tourPage,'/?view=account');
      await tourPage.locator('[data-bb-first-visit]').waitFor({state:'detached'});
      assert.equal(await tourPage.locator('body.bb-welcome-active').count(),0,'deep linked account is never intercepted');
      assert.deepEqual(tourErrors,[],'no guest browser exceptions in first visit');
      assert.deepEqual(outside,[],'no API or third party requests caused by intro');
    }finally{await tourContext.close();}
  }
  report.interactiveOnboardingVerified=true;
  console.log('PASS BLACKBOX first-visit mission simulation: VM network, allowlisted terminal, synthetic Nmap report, evidence, fresh replay, mobile 320/390/1440');
  const lifecycle = await promisify(execFile)(process.execPath, [resolve(root, 'scripts/test-training-plan-lifecycle.mjs')], {
    env: { ...process.env, BLACKBOX_TEST_URL: origin + '/?view=plan' }, timeout: 60000,
  });
  process.stdout.write(lifecycle.stdout);
  report.controlledAccountLifecycle = true;
  const sessionPages = await promisify(execFile)(process.execPath, [resolve(root, 'scripts/test-session-pages-browser.mjs')], {
    env: { ...process.env, BLACKBOX_TEST_URL: origin + '/' }, timeout: 120000,
  });
  process.stdout.write(sessionPages.stdout);
  report.readonlySessionPages = true;
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
