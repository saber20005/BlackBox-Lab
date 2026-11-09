import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalytics } from '../analytics.js';

const ID = 'G-ABC1234567';

function browser({ url = 'https://test.example/?view=tracks&track=recon', id = ID, privacy = {} } = {}) {
  const scripts = [];
  const document = {
    title: 'مكتبة التحقيقات',
    referrer: 'https://referrer.example/article?email=private@example.com#private',
    querySelector: selector => selector.includes('google-analytics-id')
      ? { content: id, getAttribute: () => id }
      : null,
    createElement: tag => ({ tagName: tag, setAttribute(name, value) { this[name] = value; } }),
    head: { appendChild: script => { scripts.push(script); return script; } },
  };
  const navigator = { ...privacy };
  const window = { location: new URL(url), document, navigator, dataLayer: [] };
  return { window, document, navigator, scripts };
}

function analytics(fixture, options = {}) {
  return createAnalytics({
    window: fixture.window,
    document: fixture.document,
    navigator: fixture.navigator,
    measurementId: ID,
    allowedHosts: ['test.example'],
    site: 'BlackBoxLab',
    ...options,
  });
}

function commands(fixture) {
  return fixture.window.dataLayer.map(command => Array.from(command));
}

function events(fixture, name) {
  return commands(fixture).filter(command => command[0] === 'event' && (!name || command[1] === name));
}

test('missing and invalid public IDs never load Google or enqueue analytics', () => {
  for (const id of ['', 'not-an-id', 'G-…', 'G-abc1234567', 'G-123']) {
    const fixture = browser({ id });
    const api = analytics(fixture, { measurementId: id });
    assert.equal(api.trackPageView(), false);
    assert.equal(api.trackEvent('training_complete', { case_id: 'INC-1104', score: 70 }), false);
    assert.equal(fixture.scripts.length, 0);
    assert.deepEqual(commands(fixture), []);
  }
});

test('valid setup queues a real GA4 configuration once and allowlisted events', () => {
  const fixture = browser();
  const api = analytics(fixture);
  assert.equal(api.trackEvent('training_complete', { case_id: 'INC-1104', score: 70 }), true);
  assert.equal(api.trackEvent('training_complete', { case_id: 'INC-1101', score: 10 }), true);
  assert.equal(fixture.scripts.length, 1);
  assert.match(fixture.scripts[0].src, /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-ABC1234567$/);
  const configs = commands(fixture).filter(command => command[0] === 'config');
  assert.equal(configs.length, 1);
  assert.equal(configs[0][1], ID);
  assert.equal(configs[0][2].send_page_view, false);
  assert.equal(configs[0][2].allow_google_signals, false);
  assert.equal(configs[0][2].allow_ad_personalization_signals, false);
  assert.equal(events(fixture, 'training_complete').length, 2);
  assert.equal(events(fixture, 'training_complete')[0][2].case_id, 'INC-1104');
  assert.equal(events(fixture, 'training_complete')[0][2].score, 70);
});

test('private fields, unknown events and untrusted URL contents are not forwarded', () => {
  const fixture = browser({
    url: 'https://test.example/?track=network&stage=0&utm_source=linkedin&utm_campaign=launch30&utm_content=dns_case&notes=PRIVATE_NOTE&email=private%40example.com&token=SECRET#PRIVATE_HASH',
  });
  const api = analytics(fixture);
  assert.equal(api.trackEvent('note_saved', { notes: 'PRIVATE_NOTE' }), false);
  api.trackEvent('training_complete', {
    case_id: 'INC-1104', score: 70, notes: 'PRIVATE_NOTE', results: 'PRIVATE_RESULT',
    email: 'private@example.com', commands: 'PRIVATE_COMMAND', arbitrary: 'SECRET',
  });
  assert.equal(api.trackPageView(), true);
  const payload = events(fixture, 'page_view')[0][2];
  const location = new URL(payload.page_location);
  assert.equal(location.searchParams.get('track'), 'network');
  assert.equal(location.searchParams.get('stage'), '0');
  assert.equal(location.searchParams.get('utm_source'), 'linkedin');
  assert.equal(location.searchParams.get('utm_campaign'), 'launch30');
  assert.equal(location.searchParams.get('utm_content'), 'dns_case');
  assert.equal(location.hash, '');
  for (const field of ['notes', 'email', 'token']) assert.equal(location.searchParams.has(field), false);
  assert.equal(payload.page_referrer, 'https://referrer.example/article');
  const sent = JSON.stringify(events(fixture));
  for (const privateText of ['PRIVATE_NOTE', 'PRIVATE_RESULT', 'PRIVATE_COMMAND', 'private@example.com', 'SECRET', 'PRIVATE_HASH']) {
    assert.equal(sent.includes(privateText), false, privateText);
  }
});

test('page views deduplicate repeated renders and StrictMode calls while tracking a new route', () => {
  const fixture = browser();
  const api = analytics(fixture);
  assert.equal(api.trackPageView(), true);
  assert.equal(api.trackPageView(), false);
  fixture.window.location = new URL('https://test.example/?view=tracks&track=recon&ignored=value#section');
  assert.equal(api.trackPageView(), false);
  fixture.window.location = new URL('https://test.example/?track=network&stage=0');
  assert.equal(api.trackPageView(), true);
  assert.equal(api.trackPageView(), false);
  assert.equal(events(fixture, 'page_view').length, 2);
});

test('preview hosts and browser privacy signals prevent all analytics initialization', () => {
  for (const privacy of [{ doNotTrack: '1' }, { globalPrivacyControl: true }]) {
    const fixture = browser({ privacy });
    const api = analytics(fixture);
    assert.equal(api.trackPageView(), false);
    assert.equal(api.trackEvent('stage_start', { track_id: 'recon', stage_index: 0 }), false);
    assert.equal(fixture.scripts.length, 0);
    assert.deepEqual(commands(fixture), []);
  }
  const fixture = browser({ url: 'https://untrusted-preview.example/?view=tracks&track=recon' });
  const api = analytics(fixture);
  assert.equal(api.trackPageView(), false);
  assert.equal(fixture.scripts.length, 0);
  assert.deepEqual(commands(fixture), []);
});

test('missing browser objects and blocked script insertion fail without disrupting training', () => {
  const absent = createAnalytics({ window: null, document: null, navigator: null, measurementId: ID, allowedHosts: ['test.example'] });
  assert.equal(absent.trackPageView(), false);
  assert.equal(absent.trackEvent('backup_export', { format: 'json' }), false);
  const fixture = browser();
  fixture.document.head.appendChild = () => { throw new Error('blocked'); };
  const api = analytics(fixture);
  assert.doesNotThrow(() => assert.equal(api.trackEvent('training_complete', { case_id: 'INC-1104', score: 70 }), false));
  assert.doesNotThrow(() => api.trackPageView());
  const offline = browser();
  const offlineAPI = analytics(offline);
  assert.equal(offlineAPI.trackPageView(), true);
  const queuedBeforeFailure = commands(offline).length;
  offline.scripts[0].onerror();
  assert.equal(offlineAPI.trackEvent('backup_export', { format: 'json' }), false);
  assert.equal(commands(offline).length, queuedBeforeFailure);
  const deniedWindow = {};
  Object.defineProperty(deniedWindow, 'document', { get() { throw new Error('denied'); } });
  assert.doesNotThrow(() => {
    const denied = createAnalytics({ window: deniedWindow });
    assert.equal(denied.trackPageView(), false);
  });
});
