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

test('main workspace uses persistent primary navigation instead of the optional legacy dock',()=>{
  const app=read('../app.js');
  assert.match(app,/mountAppNavigation\(/);
  assert.doesNotMatch(app,/const quickDock = document\.getElementById\('bb-quick-dock'\)/);
  const html=read('../index.html');
  assert.match(html,/id="bb-app-search-open"/);
  assert.match(html,/<dialog\b[^>]*\bid="bb-app-search"/);
  assert.doesNotMatch(html,/<details\b[^>]*id="bb-quick-dock"/);
  const css=read('../assets/styles/app-navigation.css');
  assert.match(css,/position:\s*fixed/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.doesNotMatch(html,/data-bb-dock-view="logout"/);
});
