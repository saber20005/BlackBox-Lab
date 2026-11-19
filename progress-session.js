import { createFirebaseBackend } from './firebase-client.js';
import { createInitialState, loadProgress, normalizeState } from './progress.js';

const clone = value => JSON.parse(JSON.stringify(value));
const accountKey = uid => `blackbox-account-progress-v1:${uid}`;

/** Account-aware views have no save, recovery, authentication, or cache mutations. */
export function createProgressSession(options = {}) {
  let storage;
  try { storage = options.storage === undefined ? globalThis.localStorage : options.storage; } catch { storage = null; }
  let backend, unsubscribe, startup;
  let started = false, disposed = false, generation = 0, ownerUid;
  let activeRead = null, lastAvailable = null;
  let snapshot = {
    progress: null, scope: 'unknown', ownerUid: null, phase: 'restoring',
    fromCache: false, pending: false, error: null,
    message: 'جارٍ استعادة جلسة الحساب قبل اختيار مصدر التقدم…',
  };
  const getSnapshot = () => clone(snapshot);
  const publish = next => {
    if (disposed) return;
    snapshot = next;
    options.onChange?.(getSnapshot());
  };
  const current = (scope, uid) => !disposed && scope === generation && ownerUid === uid;

  function showGuest(unavailable = false) {
    const loaded = loadProgress(storage);
    publish({
      progress: loaded.state, scope: 'guest', ownerUid: null,
      phase: loaded.ok ? 'ready' : 'error', fromCache: false, pending: false,
      error: loaded.ok ? unavailable ? 'account/unavailable' : null : 'progress/local-read-failed',
      message: `${unavailable ? 'خدمة الحسابات غير مهيّأة هنا؛ ' : ''}المصدر: تقدم الضيف المحلي في هذا المتصفح. ${loaded.message}`,
    });
    return loaded.ok;
  }

  function readAccountCache(uid) {
    try {
      const value = JSON.parse(storage?.getItem?.(accountKey(uid)) ?? 'null');
      if (!value || !value.progress || typeof value.progress !== 'object' || Array.isArray(value.progress) ||
          typeof value.dirty !== 'boolean' ||
          (value.revision !== null && (!Number.isSafeInteger(value.revision) || value.revision < 0))) return null;
      return { progress: normalizeState(value.progress), pending: value.dirty };
    } catch { return null; }
  }

  function readAccount() {
    const scope = generation, uid = ownerUid;
    if (disposed || !uid) return Promise.resolve(false);
    if (activeRead?.scope === scope && activeRead.uid === uid) return activeRead.promise;
    const attempt = { scope, uid, promise: null };
    // Install the promise before notifying observers, so refreshes coalesce.
    attempt.promise = Promise.resolve().then(async () => {
      if (!current(scope, uid)) return false;
      try {
        const remote = await backend.read(uid);
        if (!current(scope, uid)) return false;
        const progress = normalizeState(remote?.progress ?? createInitialState());
        lastAvailable = { progress: clone(progress), pending: false };
        publish({
          progress, scope: 'account', ownerUid: uid, phase: 'ready',
          fromCache: false, pending: false, error: null,
          message: remote ? 'المصدر: الحساب المتزامن. قُرئت نسخة الحساب الآن؛ أعد التحديث لعرض التغييرات اللاحقة.' :
            'المصدر: الحساب المتزامن. لا يوجد تقدم محفوظ في هذا الحساب بعد.',
        });
        return true;
      } catch (reason) {
        if (!current(scope, uid)) return false;
        // Only the current UID's cache is consulted, and only after a failed read.
        const cached = readAccountCache(uid);
        const fallback = cached ?? lastAvailable;
        if (fallback) lastAvailable = clone(fallback);
        publish({
          progress: fallback ? clone(fallback.progress) : null,
          scope: 'account', ownerUid: uid, phase: 'error',
          fromCache: Boolean(fallback), pending: fallback?.pending ?? false,
          error: reason?.code || 'account/read-failed',
          message: !fallback ? 'تعذّر قراءة تقدم الحساب، ولا تتوفر نسخة لهذا الحساب هنا. أعد المحاولة؛ لا تُعرض بيانات الضيف بدلًا منه.' :
            fallback.pending ? 'تعذّر تحديث الحساب. المصدر: مسودة محلية مخبأة لهذا الحساب لم تتزامن بعد؛ قد تختلف عن النسخة السحابية. راجع الحساب في BLACKBOX.' :
            cached ? 'تعذّر تحديث الحساب. المصدر: نسخة مخبأة لهذا الحساب على هذا المتصفح؛ لم يُؤكَّد أنها أحدث نسخة.' :
              'تعذّر تحديث الحساب. المصدر: آخر نسخة مقروءة لهذا الحساب في هذه الصفحة؛ لم يُؤكَّد أنها أحدث نسخة.',
        });
        return false;
      } finally {
        if (activeRead === attempt) activeRead = null;
      }
    });
    activeRead = attempt;
    publish({
      progress: null, scope: 'account', ownerUid: uid, phase: 'loading',
      fromCache: false, pending: false, error: null,
      message: 'جارٍ قراءة تقدم الحساب المتزامن…',
    });
    return attempt.promise;
  }

  function scopeChanged(user) {
    if (disposed) return;
    const nextUid = user?.uid ?? null;
    if (nextUid === ownerUid) return;
    generation += 1;
    ownerUid = nextUid;
    activeRead = null;
    lastAvailable = null;
    if (nextUid === null) showGuest();
    else void readAccount();
  }

  function start() {
    if (disposed) return Promise.resolve(false);
    if (startup) return startup;
    if (started) return Promise.resolve(true);
    started = true;
    startup = Promise.resolve().then(async () => {
      const service = options.backend === undefined ? await createFirebaseBackend() :
        await (typeof options.backend === 'function' ? options.backend() : options.backend);
      if (disposed) return false;
      backend = service;
      const stop = backend.onUserChanged(scopeChanged);
      if (disposed) stop?.();
      else unsubscribe = stop;
      return true;
    }).catch(reason => {
      if (disposed) return false;
      started = false;
      if (ownerUid !== undefined) return false;
      if (reason?.code === 'account/unavailable') showGuest(true);
      else publish({
        progress: null, scope: 'unknown', ownerUid: null, phase: 'error',
        fromCache: false, pending: false, error: reason?.code || 'account/session-unavailable',
        message: 'تعذّر التحقق من جلسة الحساب. أعد المحاولة أو افتح حسابك في BLACKBOX لاختيار مصدر التقدم.',
      });
      return false;
    }).finally(() => { startup = null; });
    return startup;
  }

  return {
    start,
    refresh() {
      if (disposed) return Promise.resolve(false);
      if (startup || !started) return start();
      if (ownerUid === undefined) return Promise.resolve(false);
      return ownerUid === null ? Promise.resolve(showGuest()) : readAccount();
    },
    getSnapshot,
    dispose() {
      if (disposed) return;
      disposed = true; generation += 1;
      activeRead = null; lastAvailable = null; ownerUid = undefined;
      try { unsubscribe?.(); } catch { /* A late callback remains generation guarded. */ }
      unsubscribe = undefined;
      snapshot = { progress: null, scope: 'unknown', ownerUid: null, phase: 'error', fromCache: false, pending: false, error: 'progress/disposed', message: '' };
    },
  };
}
