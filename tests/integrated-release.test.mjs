import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRoute, routeURL, primaryView } from '../routes.js';
import { readBbPreferences, saveBbPreferences, BB_UI_PREFERENCES_KEY } from '../assets/modules/preferences/ui-preferences.js';
import { SUITE_PATHWAYS } from '../assets/modules/training/suite-learning-pathways.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('integrated release retains both account settings and shared suite pathways', () => {
  assert.equal(parseRoute('https://blackboxlab.dev/?view=journeys').view, 'journeys');
  assert.equal(parseRoute('https://blackboxlab.dev/?view=settings').view, 'settings');
  assert.equal(primaryView('journeys'), 'tracks');
  assert.equal(primaryView('settings'), 'account');
  assert.equal(routeURL({view:'journeys'}).searchParams.get('view'), 'journeys');
  assert.equal(routeURL({view:'settings'}).searchParams.get('view'), 'settings');
  const app = source('../app.js');
  assert.match(app, /journeys:\s*\(\)\s*=>\s*suiteJourneysPage\(state,tracks\)/);
  assert.match(app, /settings:\s*settingsPage/);
  assert.match(app, /displayPreferences\s*=\s*applyBbPreferences\(readBbPreferences/);
});

test('integrated static shell includes both presentation styles without rewriting account state', () => {
  const html = source('../index.html');
  assert.match(html, /assets\/styles\/suite-learning-pathways\.css/);
  assert.match(html, /assets\/styles\/ui-preferences\.css/);
  assert.equal(html.includes('FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON'), false);
  assert.equal(html.includes('private_key'), false);
});

test('display settings remain local and do not modify saved progress or pathway markers', () => {
  const map = new Map();
  const store = { getItem:key=>map.get(key)||null, setItem:(key,value)=>map.set(key,value) };
  const marker = 'blackbox-progress-test';
  map.set(marker, '{"uid":"existing","completed":{"recon-0":true}}');
  assert.equal(saveBbPreferences({theme:'light',textSize:'large',level:'advanced'},store), true);
  assert.equal(readBbPreferences(store).theme, 'light');
  assert.equal(map.get(marker), '{"uid":"existing","completed":{"recon-0":true}}');
  assert.notEqual(BB_UI_PREFERENCES_KEY, marker);
  assert.equal(Array.isArray(SUITE_PATHWAYS), true);
});
