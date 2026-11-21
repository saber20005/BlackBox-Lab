import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('mobile keeps the four primary routes in one navigation row',()=>{
  const html=read('../index.html');
  const css=read('../assets/styles/workspace-shell.css');
  const nav=html.match(/<nav class="nav" id="nav"[\s\S]*?<\/nav>/)?.[0];
  assert(nav);
  for(const view of ['home','tracks','progress','account']){
    assert.match(nav,new RegExp('data-view="'+view+'"'));
  }
  assert.match(css,/\.sidebar #nav \.bb-pro-sidebar \{display:none\}/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
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
  assert.match(html,/id="bb-quick-dock"/);
  assert.match(html,/id="accountButton"/);
});
