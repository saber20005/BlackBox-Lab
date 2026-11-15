const STAGES = new Set(['configuration', 'script-load', 'ready', 'execute', 'token-validation']);
const DEFAULT_TIMEOUTS = Object.freeze({ 'script-load': 20000, ready: 20000, execute: 30000 });
const DEADLINE = Symbol('diagnostic-deadline');

/** Classify only known signatures. Never return a provider's raw message/code. */
export function classifyRecaptchaFailure(error, stage) {
  let message = '';
  let code = '';
  try {
    const candidateMessage = typeof error === 'string' ? error : error?.message;
    const candidateCode = error?.code;
    if (typeof candidateMessage === 'string') message = candidateMessage;
    if (typeof candidateCode === 'string') code = candidateCode;
  } catch { /* An unreadable rejection remains unclassified. */ }
  if (code === 'probe/script-load') return 'script-load-failed';
  if (code === 'probe/api-missing') return 'api-unavailable';
  if (code === 'probe/empty-token') return 'empty-token';
  if (/^Invalid site key or not loaded in api\.js(?:[:.\s]|$)/i.test(message)) return 'client-or-key-rejected';
  if (/^No reCAPTCHA clients exist(?:[:.\s]|$)/i.test(message)) return 'client-not-initialized';
  return stage === 'script-load' ? 'script-load-failed' : stage === 'ready' ? 'ready-failed' : 'execution-failed';
}

/** Load the canonical Google script once; remove only our failed script. */
export function createEnterpriseScriptLoader({ document = globalThis.document } = {}) {
  let pending;
  let loaded = false;
  return function loadScript(siteKey) {
    if (loaded) return Promise.resolve();
    if (pending) return pending;
    let resolveLoad;
    let rejectLoad;
    const promise = new Promise((resolve, reject) => { resolveLoad = resolve; rejectLoad = reject; });
    pending = promise;
    let script;
    const fail = () => {
      if (script) {
        script.onload = null;
        script.onerror = null;
        try { script.remove(); } catch { /* Never remove an unrelated script. */ }
      }
      if (pending === promise) pending = undefined;
      rejectLoad({ code: 'probe/script-load' });
    };
    try {
      script = document.createElement('script');
      script.src = 'https://www.google.com/recaptcha/enterprise.js?render=' + encodeURIComponent(siteKey);
      script.async = true;
      script.onload = () => {
        loaded = true;
        if (pending === promise) pending = undefined;
        script.onload = null;
        script.onerror = null;
        resolveLoad();
      };
      script.onerror = fail;
      document.head.append(script);
    } catch { fail(); }
    return promise;
  };
}

/**
 * A manual, independent probe. A nonempty result is not verified attestation.
 * Timeouts lock this instance: uncancellable Google work may still finish, so
 * a fresh page is required before starting another attempt.
 */
export function createRecaptchaProbe({
  siteKey, secure = false, loadScript, ready, execute, onStage,
  timeouts = DEFAULT_TIMEOUTS,
  setTimer = (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimer = timer => globalThis.clearTimeout(timer),
} = {}) {
  let inFlight;
  let scriptPromise;
  let reloadRequired = false;
  let timedOutStage = null;

  function report(ok, stage, code, rejectionType = null) {
    return Object.freeze({
      ok, stage: STAGES.has(stage) ? stage : 'configuration', code,
      rejectionType, nonemptyResult: ok, reloadRequired,
      firebaseAcceptance: 'not-tested',
    });
  }
  function notify(stage) {
    try { onStage?.(stage); } catch { /* Display failures cannot trigger more requests. */ }
  }
  function loadOnce() {
    if (!scriptPromise) {
      const promise = Promise.resolve().then(() => loadScript(siteKey));
      scriptPromise = promise;
      void promise.catch(() => { if (scriptPromise === promise) scriptPromise = undefined; });
    }
    return scriptPromise;
  }
  function bounded(stage, operation) {
    const configured = timeouts?.[stage];
    const milliseconds = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUTS[stage];
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimer(() => {
        if (settled) return;
        settled = true;
        reloadRequired = true;
        timedOutStage = stage;
        reject(DEADLINE);
      }, milliseconds);
      Promise.resolve().then(() => {
        if (settled || reloadRequired) return undefined;
        return operation();
      }).then(value => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        resolve(value);
      }, error => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        reject(error);
      });
    });
  }
  async function attempt() {
    let stage = 'configuration';
    notify(stage);
    try {
      if (!secure || typeof siteKey !== 'string' || !siteKey.trim() ||
          typeof loadScript !== 'function' || typeof ready !== 'function' || typeof execute !== 'function') {
        return report(false, stage, 'invalid-configuration');
      }
      stage = 'script-load'; notify(stage);
      await bounded(stage, loadOnce);
      stage = 'ready'; notify(stage);
      await bounded(stage, ready);
      stage = 'execute'; notify(stage);
      const token = await bounded(stage, () => execute(siteKey, { action: 'blackbox_diagnostic' }));
      stage = 'token-validation'; notify(stage);
      if (typeof token !== 'string' || !token.length) throw { code: 'probe/empty-token' };
      return report(true, stage, 'independent-result-created');
    } catch (error) {
      if (error === DEADLINE) return report(false, stage, 'timeout');
      return report(false, stage, classifyRecaptchaFailure(error, stage), error === null ? 'null' : typeof error);
    }
  }
  function run() {
    if (inFlight) return inFlight;
    if (reloadRequired) return Promise.resolve(report(false, timedOutStage, 'reload-required'));
    inFlight = attempt().finally(() => { inFlight = undefined; });
    return inFlight;
  }
  return Object.freeze({ run, getState: () => Object.freeze({ running: Boolean(inFlight), reloadRequired }) });
}
