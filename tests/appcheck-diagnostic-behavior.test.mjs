import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../appcheck-diagnostic.js', import.meta.url), 'utf8'))
  .replace("import { accountConfig } from './account-config.js';", '')
  .replace(/\bimport\(/g, 'loadSDK(');

function diagnostic(getToken) {
  const calls = [];
  const result = { textContent: '' };
  let click;
  const button = { disabled: false, addEventListener(name, handler) { assert.equal(name, 'click'); click = handler; } };
  const app = { name: 'blackbox-appcheck-diagnostic' };
  const check = {};
  const appSDK = { getApps: () => [], initializeApp(config, name) { calls.push({ kind: 'app', config, name }); return app; } };
  const checkSDK = {
    ReCaptchaEnterpriseProvider: class { constructor(siteKey) { this.siteKey = siteKey; } },
    initializeAppCheck(target, options) { calls.push({ kind: 'initialize', target, options }); return check; },
    async getToken(target, forceRefresh) { calls.push({ kind: 'getToken', target, forceRefresh }); return getToken(); },
  };
  vm.runInNewContext(source, {
    document: { getElementById: id => id === 'run' ? button : result },
    location: { protocol: 'https:' },
    accountConfig: { firebase: { projectId: 'test-project' }, grading: { enabled: false, appCheckSiteKey: 'PRIVATE_TEST_KEY' } },
    loadSDK: async url => {
      if (url.endsWith('/firebase-app.js')) return appSDK;
      if (url.endsWith('/firebase-app-check.js')) return checkSDK;
      throw new Error('Unexpected SDK requested');
    },
  });
  return { run: () => click(), calls, result, button, app, check };
}

test('manual Firebase diagnostic forces refresh and preserves the Enterprise provider without exposing the result', async () => {
  const harness = diagnostic(() => ({ token: 'PRIVATE_RESULT_TOKEN' }));
  await harness.run();
  const initialized = harness.calls.find(call => call.kind === 'initialize');
  assert.equal(initialized.target, harness.app);
  assert.equal(initialized.options.provider.siteKey, 'PRIVATE_TEST_KEY');
  assert.equal(initialized.options.isTokenAutoRefreshEnabled, false);
  const requested = harness.calls.find(call => call.kind === 'getToken');
  assert.equal(requested.target, harness.check);
  assert.equal(requested.forceRefresh, true);
  assert(harness.result.textContent.startsWith('نجح'));
  assert(!harness.result.textContent.includes('PRIVATE_'));
  assert.equal(harness.button.disabled, false);
});

test('known pre-exchange SDK error is reported without turning clr into a causal claim', async () => {
  const harness = diagnostic(() => { throw { code: 'appCheck/recaptcha-error', message: 'PRIVATE_RAW_MESSAGE' }; });
  await harness.run();
  assert(harness.result.textContent.includes('token-request'));
  assert(harness.result.textContent.includes('appCheck/recaptcha-error'));
  assert(harness.result.textContent.includes('clr وحدها لا تحدد السبب'));
  assert(!harness.result.textContent.includes('PRIVATE_RAW_MESSAGE'));
  assert.equal(harness.button.disabled, false);
});

test('arbitrary error codes/messages and throwing code getters are not disclosed', async () => {
  for (const rejection of [
    { code: 'PRIVATE_TOKEN_LIKE_CODE', message: 'PRIVATE_RAW_MESSAGE' },
    Object.defineProperty({}, 'code', { get() { throw new Error('PRIVATE_GETTER'); } }),
  ]) {
    const harness = diagnostic(() => { throw rejection; });
    await harness.run();
    assert(harness.result.textContent.includes('رمز SDK: unknown'));
    assert(!harness.result.textContent.includes('PRIVATE_'));
    assert.equal(harness.button.disabled, false);
  }
});

test('an error-code getter is read once before validating its value', async () => {
  let reads = 0;
  const rejection = Object.defineProperty({}, 'code', {
    get() { return ++reads === 1 ? 'appCheck/recaptcha-error' : 'PRIVATE_CHANGED_CODE'; },
  });
  const harness = diagnostic(() => { throw rejection; });
  await harness.run();
  assert.equal(reads, 1);
  assert(harness.result.textContent.includes('appCheck/recaptcha-error'));
  assert(!harness.result.textContent.includes('PRIVATE_'));
});
