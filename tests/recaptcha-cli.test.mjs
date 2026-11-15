import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../scripts/diagnose-recaptcha-enterprise.mjs', import.meta.url), 'utf8');
const start = source.indexOf('const MAX_NETWORK_EVENTS =');
const end = source.indexOf('\nconst browser = await chromium.launch(');
assert(start >= 0 && end > start, 'the CLI helper boundaries must remain identifiable');
const helpersSource = source.slice(start, end)
  .replace("import('/account-config.js')", 'loadConfig()')
  + '\nglobalThis.helpers = { classify, runDirectProbe, iframeErrorCategories };';
const PRIVATE = 'PRIVATE_RESULT_OR_PROVIDER_DATA';

async function flush() { for (let index = 0; index < 20; index += 1) await Promise.resolve(); }
function harness({ autoLoad = true, autoReady = true, execute, widgetError = false } = {}) {
  const scripts = [];
  const timers = new Map();
  const calls = { ready: 0, render: 0, execute: 0 };
  const window = {};
  let readyCallback;
  let nextTimer = 0;
  let now = 0;
  const enterprise = {
    ready(callback) { calls.ready += 1; readyCallback = callback; if (autoReady) callback(); },
    render(element, options) {
      calls.render += 1;
      assert.equal(options.size, 'invisible');
      if (widgetError) options['error-callback'](PRIVATE);
      return 0;
    },
    async execute(target, options) {
      calls.execute += 1;
      calls.target = target;
      calls.action = options.action;
      return execute ? execute() : PRIVATE;
    },
  };
  function finishLoad() {
    window.grecaptcha = { enterprise };
    scripts.at(-1).onload();
  }
  const document = {
    querySelector() { return scripts[0] ?? null; },
    createElement(tag) { return tag === 'div' ? { style: {} } : {}; },
    head: { append(script) { scripts.push(script); if (autoLoad) queueMicrotask(finishLoad); } },
    body: { append() {} },
  };
  const context = vm.createContext({
    origin: new URL('https://blackboxlab.dev/'), URL, Buffer, window, document,
    performance: { now: () => ++now },
    loadConfig: async () => ({ accountConfig: { grading: { appCheckSiteKey: 'PRIVATE_TEST_SITE_KEY' } } }),
    setTimeout(callback, milliseconds) { const id = ++nextTimer; timers.set(id, { callback, milliseconds }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(helpersSource, context);
  const page = { evaluate: (callback, argument) => callback(argument) };
  return {
    helpers: context.helpers, page, window, calls, scripts, timers, finishLoad,
    finishReady: () => readyCallback(),
    expire() {
      const entry = [...timers.entries()].find(([, timer]) => timer.milliseconds === 45_000);
      assert(entry, 'the direct probe has a bounded observation deadline');
      timers.delete(entry[0]);
      entry[1].callback();
    },
  };
}

test('CLI helper classification reads a changing name once and never exposes arbitrary or throwing fields', () => {
  const state = harness();
  let reads = 0;
  const changing = Object.defineProperty({ message: PRIVATE }, 'name', {
    get() { reads += 1; return reads === 1 ? 'Error' : PRIVATE; },
  });
  const result = state.helpers.classify(changing);
  assert.equal(reads, 1);
  assert.equal(result.name, 'Error');
  assert(!JSON.stringify(result).includes(PRIVATE));
  const throwing = Object.defineProperty({ message: PRIVATE }, 'name', {
    get() { throw new Error(PRIVATE); },
  });
  assert.equal(state.helpers.classify(throwing).name, null);
  const unreadableMessage = Object.defineProperty({}, 'message', { get() { throw new Error(PRIVATE); } });
  assert.equal(state.helpers.classify(unreadableMessage).category, 'unclassified');
});

test('browser rejection classification also redacts changing and throwing name getters', async () => {
  for (const throwing of [false, true]) {
    let reads = 0;
    const rejection = Object.defineProperty({ message: PRIVATE }, 'name', {
      get() {
        reads += 1;
        if (throwing) throw new Error(PRIVATE);
        return reads === 1 ? 'Error' : PRIVATE;
      },
    });
    const state = harness({ execute: () => { throw rejection; } });
    const result = await state.helpers.runDirectProbe(state.page, false);
    assert.equal(reads, 1);
    assert.equal(result.acquisitionResultCategory, 'rejected');
    assert.equal(result.errorName, throwing ? null : 'Error');
    assert(!JSON.stringify(result).includes(PRIVATE));
    assert.equal(state.timers.size, 0);
  }
});

test('direct probe deadline prevents a late script load from reaching ready or execute', async () => {
  const state = harness({ autoLoad: false });
  const pending = state.helpers.runDirectProbe(state.page, false);
  await flush();
  assert.equal(state.scripts.length, 1);
  state.expire();
  const result = await pending;
  assert.equal(result.stage, 'script-load');
  assert.equal(result.deadlineReached, true);
  assert.equal(result.firebaseAcceptance, 'not-tested');
  state.finishLoad();
  await flush();
  assert.equal(state.calls.ready, 0);
  assert.equal(state.calls.execute, 0);
  assert.equal(state.timers.size, 0);
});

test('direct probe deadline prevents late ready completion from rendering or executing a widget', async () => {
  const state = harness({ autoReady: false });
  const pending = state.helpers.runDirectProbe(state.page, true);
  await flush();
  assert.equal(state.calls.ready, 1);
  state.expire();
  const result = await pending;
  assert.equal(result.stage, 'ready');
  assert.equal(result.deadlineReached, true);
  state.finishReady();
  await flush();
  assert.equal(state.calls.render, 0);
  assert.equal(state.calls.execute, 0);
  assert.equal(state.timers.size, 0);
});

test('optional widget records its error callback even when execute fulfills with a nonempty value', async () => {
  const state = harness({ widgetError: true });
  const result = await state.helpers.runDirectProbe(state.page, true);
  const callbacks = state.window.__blackboxWidgetObservations;
  assert.equal(state.calls.render, 1);
  assert.equal(state.calls.target, 0);
  assert.equal(state.calls.action, 'fire_app_check');
  assert.equal(result.acquisitionResultCategory, 'nonempty-string');
  assert.equal(result.firebaseAcceptance, 'not-tested');
  assert.equal(callbacks.errorCallbackCount, 1);
  assert.equal(callbacks.successCallbackCount, 0);
  assert.equal(callbacks.events[0].kind, 'error');
  assert(!JSON.stringify({ result, callbacks }).includes(PRIVATE));
  assert.equal(Object.hasOwn(result, 'token'), false);
});

test('iframe inspection recognizes a prefixed error line but returns no iframe text or URL query', async () => {
  const state = harness();
  const frame = (url, text) => ({
    url: () => url,
    evaluate: callback => Promise.resolve(vm.runInNewContext(`(${callback.toString()})()`, {
      document: { body: { innerText: text } },
    })),
  });
  const page = { frames: () => [
    frame('https://www.google.com/recaptcha/enterprise/anchor?k=PRIVATE_QUERY',
      `reCAPTCHA\nPrivacy - Terms\nERROR for site owner:\nInvalid site key\n${PRIVATE}`),
    frame('https://www.google.com/recaptcha/enterprise/bframe?payload=PRIVATE_QUERY',
      `Other interface text\nUnrecognized provider details ${PRIVATE}`),
    { url: () => 'https://other.example/recaptcha/enterprise/anchor', evaluate() { throw new Error('Unrelated frame must not be inspected'); } },
  ] };
  const result = await state.helpers.iframeErrorCategories(page);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [{ endpoint: 'anchor', errorCategory: 'invalid-site-key' }]);
  assert(!JSON.stringify(result).includes('PRIVATE'));
  assert.equal(state.timers.size, 0);
});
