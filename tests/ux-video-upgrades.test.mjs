import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('optional quick dock has four real route destinations inside workspace',()=>{
  const html=read('../index.html');
  const app=read('../app.js');
  for(const view of ['home','tracks','progress','backups']){
    assert.match(html,new RegExp('data-bb-dock-view="'+view+'"'));
  }
  assert.match(html,/id="bb-quick-dock"/);
  assert.match(html,/aria-label="اختصارات BLACKBOX"/);
  assert.match(app,/quickDock\.open = false/);
  assert.match(app,/navigate\(button\.dataset\.bbDockView\)/);
  const styles=read('../assets/styles/quick-dock.css');
  assert.match(styles,/prefers-reduced-motion:reduce/);
  assert.match(styles,/max-width:420px/);
  assert.match(styles,/@media print/);
});

test('account split presentation preserves all existing auth and recovery flows',()=>{
  const ui=read('../account-ui.js');
  for(const retained of ['id="accountForm"','id="accountGoogle"','id="accountResetMode"',
    'id="accountGuestImport"','id="accountConflict"','id="syncAccountNow"',
    'id="confirmUnsyncedSignOut"','signInEmail','signUpEmail','resetPassword']){
    assert(ui.includes(retained), retained);
  }
  assert.match(ui,/accountVisualSwitch/);
  assert.match(ui,/classList\.toggle\('is-signed-in', signedIn\)/);
  assert.match(ui,/dialog\.dataset\.mode = mode/);
  const css=read('../assets/styles/styles.css');
  assert.match(css,/\.account-dialog\.is-signed-in \.account-visual \{display:none\}/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test('optional styles do not alter the synced progress or certificate trust boundary',()=>{
  const app=read('../app.js');
  assert.match(app,/createAccountSync/);
  assert.match(app,/loadOptionalStyles/);
  const html=read('../index.html');
  assert(!html.includes('data-bb-dock-view="logout"'));
  assert(!html.includes('data-bb-dock-view="certificates"'));
});
