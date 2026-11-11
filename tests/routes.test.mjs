import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeURL, canonicalURL, routeMetadata } from '../routes.js';

test('public track and zero-based stage links parse without changing progress', () => {
  assert.deepEqual(parseRoute('https://blackboxlab.dev/'), { view: 'home', trackId: 'recon', stageIndex: 0, invalid: false });
  assert.deepEqual(parseRoute('?view=tracks&track=webgoat'), { view: 'tracks', trackId: 'webgoat', stageIndex: 0, invalid: false });
  assert.equal(parseRoute('?track=network').view, 'tracks');
  assert.deepEqual(parseRoute('?track=recon&stage=0'), { view: 'exercise', trackId: 'recon', stageIndex: 0, invalid: false });
  assert.equal(parseRoute('?view=journal&track=webgoat&stage=2').view, 'exercise');
  assert.equal(parseRoute('?view=tracks', 'network').trackId, 'network');
  assert.deepEqual(parseRoute('?view=skills'), { view: 'skills', trackId: 'recon', stageIndex: 0, invalid: false });
});

test('unknown, duplicated and malformed route values fall back to known pages', () => {
  for (const input of ['http://[', 'javascript:alert(1)', null, 42, '?track=unknown', '?track=__proto__', '?track=recon&track=network', '?view=tracks&view=journal']) {
    const route = parseRoute(input);
    assert.equal(route.invalid, true, String(input));
    assert.equal(route.view, 'home', String(input));
    assert.equal(route.trackId, 'recon');
  }
  for (const index of ['-1', '3', '99', '0.5', 'NaN', '', '00', '1e0', '9007199254740993']) {
    const route = parseRoute(`?track=webgoat&stage=${index}`);
    assert.equal(route.view, 'tracks', index);
    assert.equal(route.trackId, 'webgoat');
    assert.equal(route.invalid, true);
  }
  assert.equal(parseRoute('?stage=0').invalid, true);
  assert.equal(parseRoute('?view=missing').view, 'home');
  assert.equal(parseRoute('?view=missing&track=network').view, 'tracks');
});

test('navigation keeps allowed attribution and removes stale routes, arbitrary fields and hashes', () => {
  const base = 'https://example.test/BlackBox-Lab/?track=recon&stage=2&utm_source=club&utm_campaign=launch30&email=private%40example.com#old';
  const url = routeURL({ view: 'tracks', trackId: 'webgoat' }, base);
  assert.equal(url.pathname, '/BlackBox-Lab/');
  assert.equal(url.searchParams.get('utm_source'), 'club');
  assert.equal(url.searchParams.get('utm_campaign'), 'launch30');
  assert.equal(url.searchParams.get('view'), 'tracks');
  assert.equal(url.searchParams.get('track'), 'webgoat');
  assert.equal(url.searchParams.has('stage'), false);
  assert.equal(url.searchParams.has('email'), false);
  assert.equal(url.hash, '');
  assert.equal(routeURL({ view: 'home' }, base).search, '?utm_source=club&utm_campaign=launch30');
  assert.equal(routeURL({ view: 'tracks', trackId: 'webgoat' }, base, { preserveCampaign: false }).search, '?view=tracks&track=webgoat');
  assert.equal(routeURL({ view: 'skills' }, base, { preserveCampaign: false }).search, '?view=skills');
});

test('invalid generated routes cannot create unknown stages or unsafe URLs', () => {
  assert.equal(routeURL({ view: 'exercise', trackId: 'recon', stageIndex: 0 }).search, '?track=recon&stage=0');
  assert.equal(routeURL({ view: 'exercise', trackId: 'recon', stageIndex: 50 }).search, '?view=tracks&track=recon');
  assert.equal(routeURL({ view: 'unknown' }, 'javascript:alert(1)').href, 'https://blackboxlab.dev/');
  assert.equal(routeURL({ view: 'home' }, `https://example.test/?utm_source=${'x'.repeat(161)}&utm_content=%00bad`).search, '');
});

test('canonicals discard campaigns and private views while preserving public track pages', () => {
  assert.equal(canonicalURL({ view: 'home' }), 'https://blackboxlab.dev/');
  assert.equal(canonicalURL({ view: 'tracks', trackId: 'network' }), 'https://blackboxlab.dev/?view=tracks&track=network');
  assert.equal(canonicalURL({ view: 'exercise', trackId: 'webgoat', stageIndex: 2 }), 'https://blackboxlab.dev/?view=tracks&track=webgoat');
  for (const view of ['skills', 'journal', 'backups']) {
    assert.equal(canonicalURL({ view }), 'https://blackboxlab.dev/');
    assert.equal(routeMetadata({ view }).shouldIndex, false);
  }
  assert.equal(routeMetadata({ view: 'exercise', trackId: 'recon', stageIndex: 0 }).shouldIndex, false);
  assert.equal(routeMetadata({ view: 'tracks', trackId: 'recon' }).shouldIndex, true);
  assert.equal(canonicalURL({ view: 'troubleshoot' }), 'https://blackboxlab.dev/?view=troubleshoot');
  assert(routeMetadata({ view: 'exercise', trackId: 'network', stageIndex: 0 }).title.includes('BLACKBOX'));
});


test('sitemap lists only canonical public URLs and uses the production domain', async () => {
  const { readFile } = await import('node:fs/promises');
  const xml = await readFile(new URL('../sitemap.xml', import.meta.url), 'utf8');
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1].replaceAll('&amp;', '&'));
  assert.equal(urls.length, 8);
  assert.equal(new Set(urls).size, urls.length);
  for (const url of urls) {
    assert.equal(new URL(url).origin, 'https://blackboxlab.dev');
    const parsed = parseRoute(url);
    assert.equal(parsed.invalid, false);
    assert.equal(canonicalURL(parsed), url);
    assert.equal(routeMetadata(parsed).shouldIndex, true);
  }
});
