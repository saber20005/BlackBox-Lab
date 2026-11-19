import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../labs.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../lab-intro.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/styles/lab-intro.css', import.meta.url), 'utf8');

test('onboarding has accessible dialog and replay control', () => {
  for (const id of ['lab-intro', 'lab-intro-title', 'lab-intro-body', 'lab-intro-open', 'lab-intro-back', 'lab-intro-next', 'lab-intro-close']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /aria-labelledby="lab-intro-title"/);
  assert.match(html, /aria-describedby="lab-intro-body"/);
  assert.match(html, /src="\.\/lab-intro\.js"/);
  assert.match(html, /href="\.\/lab-intro\.css"/);
  assert.match(css, /::backdrop/);
});
test('guide discloses manual labs and read-only inspector', () => {
  assert.match(script, /للقراءة فقط/);
  assert.match(script, /لا يتصل/);
  assert.match(script, /localStorage\.getItem/);
  assert.match(script, /dialog\.showModal/);
  assert.match(script, /dialog\.addEventListener\('cancel'/);
  assert.match(html, /local-vm-inspector\.md/);
});
