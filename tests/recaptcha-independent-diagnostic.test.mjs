import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEnterpriseScriptLoader, createRecaptchaProbe, classifyRecaptchaFailure } from '../assets/modules/diagnostics/recaptcha-diagnostic-core.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let index = 0; index < 16; index += 1) await Promise.resolve(); }
function fixture(overrides = {}) {
  const calls = { load: 0, ready: 0, execute: 0 };
  const timers = new Map();
  const stages = [];
  let nextTimer = 0;
  const probe = createRecaptchaProbe({
    siteKey: 'public-test-key', secure: true,
    loadScript: async () => { calls.load += 1; },
    ready: async () => { calls.ready += 1; },
    execute: async () => { calls.execute += 1; return 'PRIVATE_GOOGLE_TOKEN'; },
    onStage: stage => { stages.push(stage); },
    setTimer(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimer(id) { timers.delete(id); },
    ...overrides,
  });
  return {
    probe, calls, stages, timers,
    expire() {
      assert.equal(timers.size, 1, 'exactly the active stage owns a deadline');
      const [id, callback] = timers.entries().next().value;
      timers.delete(id);
      callback();
    },
  };
}
function fakeDocument() {
  const foreign = { foreign: true };
  const nodes = [foreign];
  const created = [];
  return {
    nodes, created, foreign,
    head: { append(script) { nodes.push(script); } },
    createElement(tag) {
      assert.equal(tag, 'script');
      const script = { remove() { const index = nodes.indexOf(script); if (index >= 0) nodes.splice(index, 1); } };
      created.push(script);
      return script;
    },
  };
}

test('DOM loader coalesces concurrent loads and retains one successful Google script across retries', async () => {
  const document = fakeDocument();
  const load = createEnterpriseScriptLoader({ document });
  const first = load('public-test-key');
  assert.equal(load('public-test-key'), first);
  assert.equal(document.created.length, 1);
  assert.equal(document.created[0].src, 'https://www.google.com/recaptcha/enterprise.js?render=public-test-key');
  assert.equal(document.created[0].async, true);
  document.created[0].onload();
  await first;
  await load('public-test-key');
  assert.equal(document.created.length, 1);
  assert(document.nodes.includes(document.foreign));
});

test('failed script is removed and retried without deleting an unrelated script or exposing event data', async () => {
  const document = fakeDocument();
  const load = createEnterpriseScriptLoader({ document });
  const first = load('public-test-key');
  document.created[0].onerror({ message: 'PRIVATE_NETWORK_DETAILS' });
  await assert.rejects(first, error => error.code === 'probe/script-load' && !JSON.stringify(error).includes('PRIVATE'));
  assert.deepEqual(document.nodes, [document.foreign]);
  const retry = load('public-test-key');
  assert.equal(document.created.length, 2);
  document.created[1].onload();
  await retry;
  assert(document.nodes.includes(document.foreign));
});

test('concurrent probe calls share one complete attempt and never execute in parallel', async () => {
  const execution = deferred();
  let executions = 0;
  const state = fixture({ execute: () => { executions += 1; return execution.promise; } });
  const first = state.probe.run();
  assert.equal(state.probe.run(), first);
  await flush();
  assert.equal(executions, 1);
  assert.equal(state.calls.load, 1);
  execution.resolve('PRIVATE_GOOGLE_TOKEN');
  const result = await first;
  assert.equal(result.ok, true);
  assert.equal(state.probe.getState().running, false);
  assert.equal(state.timers.size, 0);
});

test('a known execute rejection retains its stage and a retry reuses the loaded SDK', async () => {
  let executions = 0;
  const state = fixture({ execute: async () => {
    executions += 1;
    if (executions === 1) throw new Error('Invalid site key or not loaded in api.js: PRIVATE_SITE_DETAILS');
    return 'PRIVATE_GOOGLE_TOKEN';
  } });
  const failure = await state.probe.run();
  assert.equal(failure.stage, 'execute');
  assert.equal(failure.code, 'client-or-key-rejected');
  assert.equal(failure.rejectionType, 'object');
  assert.equal(failure.reloadRequired, false);
  assert(!JSON.stringify(failure).includes('PRIVATE'));
  const success = await state.probe.run();
  assert.equal(success.ok, true);
  assert.equal(state.calls.load, 1);
  assert.equal(state.calls.ready, 2);
  assert.equal(executions, 2);
});

test('load failures may retry and ready failures never advance to execute', async () => {
  let loads = 0;
  const loadFailure = fixture({ loadScript: async () => { loads += 1; if (loads === 1) throw { code: 'probe/script-load' }; } });
  const first = await loadFailure.probe.run();
  assert.equal(first.stage, 'script-load');
  assert.equal(first.code, 'script-load-failed');
  assert.equal(loadFailure.calls.execute, 0);
  assert.equal((await loadFailure.probe.run()).ok, true);
  assert.equal(loads, 2);
  const readyFailure = fixture({ ready: async () => { throw new Error('PRIVATE_READY_EXCEPTION'); } });
  const result = await readyFailure.probe.run();
  assert.equal(result.stage, 'ready');
  assert.equal(result.code, 'ready-failed');
  assert.equal(readyFailure.calls.execute, 0);
  assert(!JSON.stringify(result).includes('PRIVATE'));
});

for (const stage of ['script-load', 'ready', 'execute']) {
  test(`${stage} timeout requires reload and late completion cannot advance or start another attempt`, async () => {
    const pending = deferred();
    const calls = { load: 0, ready: 0, execute: 0 };
    const state = fixture({
      loadScript: () => { calls.load += 1; return stage === 'script-load' ? pending.promise : Promise.resolve(); },
      ready: () => { calls.ready += 1; return stage === 'ready' ? pending.promise : Promise.resolve(); },
      execute: () => { calls.execute += 1; return stage === 'execute' ? pending.promise : Promise.resolve('PRIVATE_GOOGLE_TOKEN'); },
    });
    const attempt = state.probe.run();
    await flush();
    state.expire();
    const result = await attempt;
    assert.equal(result.stage, stage);
    assert.equal(result.code, 'timeout');
    assert.equal(result.reloadRequired, true);
    const before = { ...calls };
    pending.resolve('PRIVATE_LATE_TOKEN');
    await flush();
    const retry = await state.probe.run();
    assert.equal(retry.code, 'reload-required');
    assert.equal(retry.reloadRequired, true);
    assert.deepEqual(calls, before);
    assert.equal(calls.execute, stage === 'execute' ? 1 : 0);
    assert(!JSON.stringify([result, retry]).includes('PRIVATE'));
  });
}

test('a deadline before a queued operation starts prevents that operation from starting', async () => {
  const state = fixture();
  const attempt = state.probe.run();
  state.expire();
  const result = await attempt;
  await flush();
  assert.equal(result.code, 'timeout');
  assert.deepEqual(state.calls, { load: 0, ready: 0, execute: 0 });
});

test('unknown rejection fields and token strings are never included in a report', async () => {
  const secret = 'PRIVATE_TOKEN_OR_MESSAGE_123456';
  for (const error of [new Error(secret), { code: secret, name: secret, message: secret }, secret, null, 19]) {
    const state = fixture({ execute: async () => { throw error; } });
    const result = await state.probe.run();
    assert.equal(result.code, 'execution-failed');
    assert.equal(result.stage, 'execute');
    assert(!JSON.stringify(result).includes(secret));
  }
  const unreadable = Object.defineProperty({}, 'message', { get() { throw new Error(secret); } });
  assert.equal(classifyRecaptchaFailure(unreadable, 'execute'), 'execution-failed');
  let reads = 0;
  const changing = Object.defineProperty({}, 'message', { get() {
    reads += 1;
    return reads === 1 ? secret : { toString() { throw new Error(secret); } };
  } });
  assert.equal(classifyRecaptchaFailure(changing, 'execute'), 'execution-failed');
  assert.equal(reads, 1);
  const success = await fixture({ execute: async () => secret }).probe.run();
  assert.equal(success.nonemptyResult, true);
  assert.equal(success.firebaseAcceptance, 'not-tested');
  assert.equal(success.code, 'independent-result-created');
  assert(!JSON.stringify(success).includes(secret));
  assert.equal(Object.hasOwn(success, 'token'), false);
});

test('empty values fail validation and invalid configuration starts no Google request', async () => {
  for (const token of ['', undefined, null, {}]) {
    const state = fixture({ execute: async () => token });
    const result = await state.probe.run();
    assert.equal(result.stage, 'token-validation');
    assert.equal(result.code, 'empty-token');
    assert.equal(result.nonemptyResult, false);
  }
  for (const config of [{ secure: false }, { siteKey: '' }, { execute: undefined }]) {
    const state = fixture(config);
    const result = await state.probe.run();
    assert.equal(result.code, 'invalid-configuration');
    assert.deepEqual(state.calls, { load: 0, ready: 0, execute: 0 });
  }
});

test('page stays opt-in/noindex and displays only safe probe reports without Firebase or security bypasses', async () => {
  const page = await readFile(new URL('../recaptcha-independent-diagnostic.html', import.meta.url), 'utf8');
  const client = await readFile(new URL('../recaptcha-independent-diagnostic.js', import.meta.url), 'utf8');
  const core = await readFile(new URL('../assets/modules/diagnostics/recaptcha-diagnostic-core.js', import.meta.url), 'utf8');
  assert.match(page, /noindex,nofollow/);
  assert.match(page, /role="status" aria-live="polite"/);
  assert.match(page, /src="\.\/recaptcha-independent-diagnostic.js"/);
  assert.match(client, /addEventListener\('click'/);
  assert.match(client, /button\.disabled = report\.reloadRequired/);
  assert.doesNotMatch(client + core, /console\.|localStorage|sessionStorage|fetch\(|initializeAppCheck|DEBUG_TOKEN|CustomProvider|ReCaptchaV3Provider/);
  assert.doesNotMatch(client, /error\.message|error\.name|error\.code|JSON\.stringify/);
});
