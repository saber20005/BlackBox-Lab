import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('primary navigation keeps four routes with a central search control',()=>{
  const html=read('../index.html');
  const nav=html.match(/<nav\b(?=[^>]*\bid="nav")[\s\S]*?<\/nav>/)?.[0];
  assert(nav);
  assert.deepEqual([...nav.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]),['home','tracks','progress','account']);
  const controls=[...nav.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]);
  assert.equal(controls.length,5);
  assert.match(controls[2],/id="bb-app-search-open"/);
  assert.match(controls[2],/type="button"/);
  assert.match(html,/<dialog\b[^>]*\bid="bb-app-search"/);
  assert.match(html,/href="\.\/assets\/styles\/app-navigation\.css"/);
});
test('Pro stays prominently visible on mobile from the top bar and tools',()=>{
  const html=read('../index.html'),css=read('../assets/styles/workspace-shell.css');
  assert.match(html,/class="bb-pro-cta" href="\.\/pro\.html"/);
  assert.match(html,/href="\.\/pro\.html">الاشتراك Suite Pro — قريبًا/);
  assert.match(css,/\.topbar \.right-actions \.bb-pro-cta \{flex:0 0 auto/);
  assert.match(html,/class="bb-pro-sidebar" href="\.\/pro\.html"/);
});
test('UI-only layout does not touch account, saves or certificate verification',()=>{
  const html=read('../index.html');
  assert.match(html,/id="saveStatus"/);
  assert.match(html,/id="workspace-tools"/);
  assert.match(html,/id="bb-app-search-open"/);
  assert.doesNotMatch(html,/<details\b[^>]*id="bb-quick-dock"/);
  assert.match(html,/id="accountButton"/);
});
