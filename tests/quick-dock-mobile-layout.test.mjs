import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('BLACKBOX phone dock fits readable 2x2 grid and does not block main cards while closed',()=>{
  const css=read('../assets/styles/quick-dock.css');
  const mobile=css.slice(css.lastIndexOf('@media (max-width:640px)'));
  assert.match(mobile,/left:max\(12px,env\(safe-area-inset-left,0px\)\)/);
  assert.match(mobile,/\.bb-quick-dock:not\(\[open\]\) \{width:max-content\}/);
  assert.match(mobile,/\.bb-quick-dock\[open\] \{width:min\(274px,calc\(100vw - 24px\)\)\}/);
  assert.match(mobile,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(mobile,/min-height:66px/);
  assert.match(mobile,/white-space:normal;overflow-wrap:anywhere/);
});

test('BLACKBOX dock closes when navigating, clicking outside, pressing Escape or scrolling',()=>{
  const app=read('../app.js');
  assert.match(app,/const quickDock = document\.getElementById\('bb-quick-dock'\)/);
  assert.match(app,/navigate\(button\.dataset\.bbDockView\)/);
  assert.match(app,/if \(quickDock\?\.open && !quickDock\.contains\(event\.target\)\)/);
  assert.match(app,/event\.key !== 'Escape'/);
  assert.match(app,/quickDock\.querySelector\('summary'\)\?\.focus\(\)/);
  assert.match(app,/window\.addEventListener\('scroll'/);
  assert.match(app,/passive: true/);
  const html=read('../index.html');
  for(const id of ['home','tracks','progress','backups']) assert(html.includes('data-bb-dock-view="'+id+'"'));
  assert.doesNotMatch(html,/data-bb-dock-view="logout"/);
});
