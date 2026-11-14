import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = path => readFile(new URL(path, import.meta.url), 'utf8');

test('diagnostic is opt-in, noindex and separate from grading', async () => {
  const page = await load('../appcheck-diagnostic.html');
  const script = await load('../appcheck-diagnostic.js');
  assert.match(page, /noindex,nofollow/);
  assert.match(script, /addEventListener\('click'/);
  assert.match(script, /ReCaptchaEnterpriseProvider/);
  assert.match(script, /getToken\(check\)/);
  assert.doesNotMatch(script, /startGradingSession|submitGradingAnswer|httpsCallable/);
  assert.doesNotMatch(script, /console\.log|localStorage|sessionStorage|fetch\(/);
  assert.doesNotMatch(script, /response\.token\s*[,)]|JSON\.stringify\(response\)/);
});
