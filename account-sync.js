import { accountConfig } from './account-config.js';
import { createFirebaseBackend, validateCloudProgress } from './firebase-client.js';
import { createInitialState, normalizeState, loadProgress, saveProgress, STORAGE_KEY } from './progress.js';
import { normalizeReceipt } from './cybertrace-catalog.js';

const clone = value => JSON.parse(JSON.stringify(value));
const accountKey = uid => `blackbox-account-progress-v1:${uid}`;
const pendingPrefix = uid => `${accountKey(uid)}:pending:`;
const uniqueId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const codeError = (code, message) => Object.assign(new Error(message), { code });
const latest = (...values) => values.filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

export function hasProgress(value) {
  const state = normalizeState(value);
  return Boolean(Object.values(state.checks).some(items => items.length) || Object.keys(state.completed).length ||
    Object.values(state.notes).some(text => text.trim()) || Object.values(state.results).some(text => text.trim()) ||
    Object.values(state.devices).some(value => !['unknown', 'notset'].includes(value)) || state.lastActivity);
}

function combineText(account = '', device = '') {
  if (!account || account === device) return device;
  if (!device) return account;
  if (account.endsWith(`\n\n[من هذا الجهاز]\n${device}`)) return account;
  if (device.startsWith(`[من الحساب]\n${account}\n\n`)) return device;
  return `[من الحساب]\n${account}\n\n[من هذا الجهاز]\n${device}`;
}

/** Explicit, non-destructive merge. Ordinary account saves never merge silently. */
export function mergeProgress(deviceValue, accountValue) {
  const device = normalizeState(deviceValue), account = normalizeState(accountValue);
  const combined = createInitialState();
  for (const key of Object.keys(combined.checks)) {
    combined.checks[key] = [...new Set([...account.checks[key], ...device.checks[key]])].sort((a, b) => a - b);
    for (const field of ['notes', 'results']) {
      const text = combineText(account[field][key], device[field][key]);
      if (text) combined[field][key] = text;
    }
    const completion = [account.completed[key], device.completed[key]].filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
    if (completion) combined.completed[key] = completion;
    const changed = latest(account.stageUpdatedAt[key], device.stageUpdatedAt[key]);
    if (changed) combined.stageUpdatedAt[key] = changed;
  }
  for (const key of Object.keys(combined.devices)) combined.devices[key] = device.devices[key] !== 'unknown' ? device.devices[key] : account.devices[key];
  const logs = [...account.logs, ...device.logs];
  combined.logs = [...new Map(logs.map(log => [`${log.at}\u0000${log.msg}`, log])).values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-100);
  combined.lastActivity = [account.lastActivity, device.lastActivity].filter(Boolean).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
  combined.updatedAt = new Date().toISOString();
  // Validation rejects an oversized merge and leaves both originals intact.
  validateCloudProgress(combined);
  return combined;
}

export function createAccountSync(options = {}) {
  let storage;
  try { storage = options.storage ?? globalThis.localStorage; } catch { storage = undefined; }
  let guest = clone(normalizeState(options.guestState ?? loadProgress(storage).state));
  let guestMemoryDirty = false;
  let current = clone(guest);
  let backend, user = null, generation = 0, editSequence = 0, revision = null;
  let started = false, disposed = false, cloudReady = false, dirty = false, syncing = false, timer, unsubscribe;
  let localSaved = loadProgress(storage).ok;
  let remoteConflict = undefined, conflictBackup = null;
  const sessionId = uniqueId();
  let pendingId = sessionId;
  let recoveryEntries = [], eligibleRecoveries = [], recoveryConflict = false;
  let configured = Boolean(options.backend || accountConfig.enabled);
  let providers = options.backend ? { email: true, google: true } : { ...accountConfig.providers };
  let phase = 'guest', error = null, message = 'تدرّب كضيف، أو سجّل لحفظ تقدمك في حسابك.';
  const delay = options.debounceMs ?? 700;
  const linkedSkillsEnabled = Boolean(options.linkedSkillsEnabled ?? accountConfig.linkedSkillsEnabled);
  let skillWatchStop, skillGeneration = 0;
  let skillState = {
    enabled: linkedSkillsEnabled, phase: linkedSkillsEnabled ? 'guest' : 'disabled',
    receipts: {}, fromCache: false, error: null,
    message: linkedSkillsEnabled ? 'سجّل الدخول لعرض تقدّم مهاراتك المرتبط بـCyberTrace.' : 'ربط مهارات CyberTrace قيد الإعداد.',
  };

  const snapshot = () => ({ phase, user: user ? { uid: user.uid, email: user.email ?? '', displayName: user.displayName ?? '' } : null, configured, providers: { ...providers }, syncing, pending: dirty, conflict: remoteConflict !== undefined, recoveryCount: distinctRecoveries(recoveryEntries).length, recoveryConflict, guestAvailable: Boolean(user && hasProgress(guest)), localSaved, message, error });
  const notify = () => { if (!disposed) options.onStatus?.(snapshot()); };
  const show = () => { if (!disposed) options.onState?.(clone(current)); };
  const notifySkills = () => { if (!disposed) options.onSkillState?.(clone(skillState)); };
  function stopSkillWatch() {
    const stop = skillWatchStop;
    skillWatchStop = undefined;
    try { stop?.(); } catch { /* A failed optional unsubscribe must not block an account switch. */ }
  }
  function resetSkills(nextPhase, keepReceipts = false) {
    skillGeneration += 1;
    stopSkillWatch();
    skillState = {
      enabled: linkedSkillsEnabled, phase: nextPhase,
      receipts: keepReceipts ? skillState.receipts : {},
      fromCache: keepReceipts && Object.keys(skillState.receipts).length > 0,
      error: null,
      message: nextPhase === 'disabled' ? 'ربط مهارات CyberTrace قيد الإعداد.' : nextPhase === 'guest' ? 'سجّل الدخول لعرض تقدّم مهاراتك المرتبط بـCyberTrace.' : 'جارٍ تحميل إنجازات CyberTrace…',
    };
    notifySkills();
  }
  function watchSkills({ reset = true, keepReceipts = false } = {}) {
    if (disposed) return false;
    const uid = user?.uid, scope = generation;
    const nextPhase = !linkedSkillsEnabled ? 'disabled' : uid ? 'loading' : 'guest';
    if (reset) resetSkills(nextPhase, keepReceipts && Boolean(uid));
    if (!linkedSkillsEnabled || !uid) return false;
    const subscription = skillGeneration;
    const isCurrent = () => !disposed && scope === generation && subscription === skillGeneration && user?.uid === uid;
    const failed = reason => {
      if (!isCurrent()) return;
      skillState = {
        ...skillState, phase: 'error', fromCache: Object.keys(skillState.receipts).length > 0,
        error: reason?.code || 'skills/read-failed',
        message: reason?.code === 'skills/invalid-receipt' ? 'تعذّر التحقق من إنجازات CyberTrace؛ احتُفظ بآخر نسخة صالحة لهذا الحساب.' : 'تعذّر تحديث إنجازات CyberTrace. يمكنك إعادة المحاولة؛ تقدّم المختبر العملي مستقل ومحفوظ.',
      };
      notifySkills();
    };
    if (typeof backend?.watchCybertrace !== 'function') {
      failed(codeError('skills/unavailable', 'خدمة ربط المهارات غير متاحة.'));
      return false;
    }
    try {
      const stop = backend.watchCybertrace(uid, data => {
        if (!isCurrent()) return;
        try {
          const raw = data?.receipts;
          if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) throw codeError('skills/invalid-receipt', 'بيانات الإنجازات غير صالحة.');
          const receipts = {};
          for (const [id, value] of Object.entries(raw)) {
            const receipt = normalizeReceipt(value, id);
            if (!receipt) throw codeError('skills/invalid-receipt', 'نتيجة تحقيق غير صالحة.');
            receipts[id] = receipt;
          }
          const fromCache = data.fromCache !== false;
          const available = fromCache && !Object.keys(receipts).length ? skillState.receipts : receipts;
          skillState = {
            enabled: true, phase: fromCache && !Object.keys(available).length ? 'loading' : 'ready', receipts: available, fromCache, error: null,
            message: fromCache ? 'تُعرض نسخة مخبأة من إنجازات حسابك؛ ننتظر تأكيد الاتصال.' : 'إنجازات CyberTrace محدثة لهذا الحساب.',
          };
          notifySkills();
        } catch (reason) { failed(reason); }
      }, failed);
      if (isCurrent()) skillWatchStop = typeof stop === 'function' ? stop : undefined;
      else if (typeof stop === 'function') stop();
      return isCurrent();
    } catch (reason) { failed(reason); return false; }
  }
  function refreshGuest() {
    const loaded = loadProgress(storage);
    // A failed local write may leave a newer draft only in memory.
    if (loaded.ok && !loaded.recovered && !guestMemoryDirty) guest = clone(loaded.state);
    return clone(guest);
  }
  function localWrite(key, value) {
    try {
      if (!storage?.setItem) throw new Error('Storage unavailable');
      storage.setItem(key, JSON.stringify(value));
      localSaved = true;
      return { ok: true, message: user ? 'حُفظت نسخة الحساب على هذا المتصفح؛ تجري المزامنة عند الاتصال.' : 'تم الحفظ على هذا المتصفح.' };
    } catch { localSaved = false; return { ok: false, message: 'تعذّر الحفظ المحلي. احتفظ بالتبويب مفتوحًا ونزّل نسخة من العمل غير المتزامن.' }; }
  }
  function readCache(raw) {
    try {
      const value = JSON.parse(raw ?? 'null');
      if (!value || !value.progress || (value.revision !== null && (!Number.isSafeInteger(value.revision) || value.revision < 0)) || typeof value.dirty !== 'boolean') return null;
      return { ...value, progress: normalizeState(value.progress) };
    } catch { return null; }
  }
  function storedRecoveries(uid) {
    const entries = [];
    try {
      const keys = [accountKey(uid)];
      for (let index = 0; index < (storage?.length ?? 0); index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(pendingPrefix(uid))) keys.push(key);
      }
      for (const key of keys) {
        const raw = storage?.getItem?.(key), value = readCache(raw);
        if (value?.dirty) entries.push({ key, raw, ...value });
      }
    } catch { /* The visible draft is still available for export. */ }
    return entries;
  }
  function distinctRecoveries(entries) {
    return [...new Map(entries.map(entry => [JSON.stringify(entry.progress), entry])).values()];
  }
  function clearRecoveries(entries) {
    for (const entry of entries) {
      try { if (storage?.getItem?.(entry.key) === entry.raw) storage.removeItem(entry.key); } catch { /* Never remove a newer draft. */ }
    }
  }
  function cache(progress = current, pending = dirty, baseRevision = revision) {
    if (!user) return { ok: false, message: '' };
    const key = accountKey(user.uid), ownKey = `${pendingPrefix(user.uid)}${pendingId}`;
    const value = { revision: baseRevision, progress, dirty: pending, owner: sessionId, savedAt: new Date().toISOString() };
    const ownResult = pending ? localWrite(ownKey, value) : null;
    // A second tab may own the shared cache. Keep its unsent snapshot before
    // replacing that pointer; each tab's pending slot is independently durable.
    let mayReplace = true;
    try {
      const previousRaw = storage?.getItem?.(key), previous = readCache(previousRaw);
      if (previous?.dirty && previous.owner !== sessionId && JSON.stringify(previous.progress) !== JSON.stringify(progress)) {
        const represented = storedRecoveries(user.uid).some(entry => entry.key !== key && JSON.stringify(entry.progress) === JSON.stringify(previous.progress));
        if (!represented) mayReplace = localWrite(`${pendingPrefix(user.uid)}${uniqueId()}`, previous).ok;
      }
    } catch { mayReplace = false; }
    const result = mayReplace ? localWrite(key, value) : { ok: false, message: 'تعذّر تحديث الحفظ المحلي؛ احتفظ بنسخة من التعديلات.' };
    localSaved = Boolean(result.ok || ownResult?.ok);
    return localSaved ? { ok: true, message: 'حُفظت نسخة الحساب على هذا المتصفح؛ تجري المزامنة عند الاتصال.' } : result;
  }
  function cached(uid) {
    let shared = null;
    try { shared = readCache(storage?.getItem?.(accountKey(uid))); } catch { /* Work can continue in memory. */ }
    recoveryEntries = storedRecoveries(uid);
    const copies = distinctRecoveries(recoveryEntries).sort((a, b) => String(b.savedAt ?? '').localeCompare(String(a.savedAt ?? '')));
    recoveryConflict = copies.length > 1;
    eligibleRecoveries = recoveryConflict ? [] : [...recoveryEntries];
    return copies[0] ?? shared;
  }
  const cancelTimer = () => { clearTimeout(timer); timer = undefined; };
  function queue() {
    cancelTimer();
    if (user && dirty && cloudReady && remoteConflict === undefined && !syncing) timer = setTimeout(() => { timer = undefined; void writePending(); }, delay);
  }
  function fail(reason, fallback) {
    error = reason?.code || 'account/sync-failed';
    message = reason?.message || fallback;
    notify();
  }
  async function loadRemote(scope, uid) {
    const remote = await backend.read(uid);
    if (disposed || scope !== generation || user?.uid !== uid) return false;
    cloudReady = true;
    if (dirty) {
      if (recoveryConflict || (remote?.revision ?? 0) !== (revision ?? 0)) {
        remoteConflict = remote;
        message = recoveryConflict ? 'توجد مسودات مختلفة محفوظة من تبويبات حسابك. نزّل النسخ قبل اختيار الدمج أو النسخة التي تريدها.' : 'توجد نسخة أحدث في الحساب. اختر دمجها أو النسخة التي تريد الاحتفاظ بها.';
        error = 'account/conflict';
      } else {
        revision = remote?.revision ?? 0;
        message = 'توجد تعديلات محلية تنتظر المزامنة.';
        error = null;
      }
    } else {
      revision = remote?.revision ?? 0;
      current = clone(remote?.progress ?? createInitialState());
      error = null;
      message = remote ? 'حُمّل تقدمك من الحساب.' : 'حسابك جاهز. يمكنك نقل تقدم الضيف أو البدء من هنا.';
      cache();
      show();
    }
    phase = 'signed-in';
    notify();
    return true;
  }
  async function scopeChanged(nextUser) {
    const nextUid = nextUser?.uid ?? null;
    if (nextUid === (user?.uid ?? null)) { if (nextUser) user = nextUser; notify(); return; }
    // Flush textareas while the previous UID still owns the current scope.
    try { options.beforeScopeChange?.(); } catch { /* Switch safely even if a UI callback fails. */ }
    cancelTimer();
    const scope = ++generation;
    user = nextUser;
    remoteConflict = undefined; conflictBackup = null; recoveryEntries = []; eligibleRecoveries = []; recoveryConflict = false; revision = null; dirty = false; syncing = false; cloudReady = false; error = null; editSequence = 0;
    // Clear the old owner's achievements before any practical state renders.
    resetSkills(!linkedSkillsEnabled ? 'disabled' : user ? 'loading' : 'guest');
    if (!user) {
      current = refreshGuest(); phase = 'guest'; message = 'عدت إلى تقدم الضيف على هذا المتصفح.'; show(); notify(); return;
    }
    const prior = cached(user.uid);
    current = clone(prior?.progress ?? createInitialState());
    revision = prior?.revision ?? null; dirty = prior?.dirty ?? false;
    phase = 'loading'; message = 'جارٍ تحميل تقدم الحساب…'; show(); notify();
    watchSkills({ reset: false });
    try { if (await loadRemote(scope, user.uid)) queue(); }
    catch (reason) {
      if (scope !== generation || disposed) return;
      phase = 'signed-in';
      fail(reason, 'تعذّر تحميل نسخة الحساب. يمكنك العمل محليًا ثم إعادة المزامنة.');
    }
  }
  async function writePending() {
    if (disposed || !user || !dirty || !cloudReady || remoteConflict !== undefined || syncing) return false;
    const scope = generation, uid = user.uid, sequence = editSequence;
    const progress = clone(current), expectedRevision = revision;
    const representedRecoveries = [...eligibleRecoveries];
    syncing = true; error = null; message = 'جارٍ مزامنة تقدمك مع الحساب…'; notify();
    try {
      validateCloudProgress(progress);
      const result = await backend.write(uid, progress, expectedRevision);
      if (disposed || scope !== generation || user?.uid !== uid) return false;
      revision = result.revision;
      dirty = editSequence !== sequence;
      clearRecoveries(representedRecoveries);
      recoveryEntries = recoveryEntries.filter(entry => !representedRecoveries.includes(entry));
      eligibleRecoveries = eligibleRecoveries.filter(entry => !representedRecoveries.includes(entry));
      recoveryConflict = distinctRecoveries(recoveryEntries).length > 1;
      if (!dirty) {
        try { storage?.removeItem?.(`${pendingPrefix(uid)}${pendingId}`); } catch { /* A committed draft can safely remain recoverable. */ }
      }
      cache();
      message = dirty ? 'تنتظر أحدث تعديلاتك المزامنة.' : 'تمت مزامنة تقدمك مع الحساب.';
      return !dirty;
    } catch (reason) {
      if (disposed || scope !== generation || user?.uid !== uid) return false;
      if (reason?.code === 'account/conflict') remoteConflict = reason.remote ?? null;
      cache(); fail(reason, 'تعذّرت المزامنة؛ بقيت تعديلاتك في هذا التبويب.');
      return false;
    } finally {
      if (!disposed && scope === generation) { syncing = false; notify(); if (dirty && !error) queue(); }
    }
  }
  async function ensureBackend() {
    if (backend) return backend;
    backend = options.backend ? await (typeof options.backend === 'function' ? options.backend() : options.backend) : await createFirebaseBackend();
    configured = true; providers = { email: true, google: true, ...backend.providers };
    return backend;
  }
  async function authAction(method, ...args) {
    const scope = generation;
    try { const service = await ensureBackend(); return await service[method](...args); }
    catch (reason) { if (scope === generation) fail(reason, 'تعذّر إكمال تسجيل الدخول.'); throw reason; }
  }

  const controller = {
    async start() {
      if (started || disposed) return;
      started = true;
      try {
        const service = await ensureBackend();
        if (disposed) return;
        unsubscribe = service.onUserChanged(next => { void scopeChanged(next); });
        notifySkills();
        notify();
      } catch (reason) {
        started = false; configured = false; phase = 'guest'; fail(reason, 'الحسابات قيد الإعداد. يمكنك متابعة التدريب كضيف.');
      }
    },
    save(progress, settings = {}) {
      const next = clone(normalizeState(progress));
      const result = user ? cache(next, true) : saveProgress(next, storage);
      localSaved = result.ok;
      if (settings.requireLocal && !result.ok) return result;
      current = next;
      if (!user) { guest = clone(next); guestMemoryDirty = !result.ok; return result; }
      dirty = true; editSequence += 1; error = remoteConflict !== undefined ? 'account/conflict' : null;
      message = result.ok ? 'حُفظ التعديل محليًا وينتظر المزامنة.' : result.message;
      notify(); queue(); return result;
    },
    signInEmail: (email, password) => authAction('signInEmail', email, password),
    signUpEmail: (email, password) => authAction('signUpEmail', email, password),
    signInGoogle: () => authAction('signInGoogle'),
    resetPassword: email => authAction('resetPassword', email),
    async syncNow() {
      cancelTimer();
      if (!user || disposed) return false;
      const scope = generation, uid = user.uid;
      if (!cloudReady || !dirty) {
        try { if (!await loadRemote(scope, uid)) return false; }
        catch (reason) { if (scope === generation) fail(reason, 'تعذّر الاتصال بالحساب.'); return false; }
      }
      return dirty ? writePending() : remoteConflict === undefined;
    },
    async importGuest() {
      if (!user || !cloudReady) throw codeError('account/not-ready', 'انتظر تحميل تقدم الحساب قبل نقل بيانات الضيف.');
      if (remoteConflict !== undefined) throw codeError('account/conflict', 'عالج تعارض النسخ قبل نقل تقدم الضيف.');
      const merged = mergeProgress(refreshGuest(), current);
      controller.save(merged); show();
      return controller.syncNow();
    },
    async resolveConflict(choice) {
      if (!user || remoteConflict === undefined) return false;
      if (!['merge', 'cloud', 'local'].includes(choice)) throw codeError('account/invalid-choice', 'اختر طريقة صالحة لمعالجة التعارض.');
      const remote = remoteConflict;
      recoveryEntries = [...new Map([...recoveryEntries, ...storedRecoveries(user.uid)].map(entry => [entry.key, entry])).values()];
      if (!recoveryEntries.some(entry => JSON.stringify(entry.progress) === JSON.stringify(current))) recoveryEntries.push({ key: `memory:${uniqueId()}`, raw: null, revision, dirty: true, progress: clone(current) });
      let next = choice === 'cloud' ? clone(remote?.progress ?? createInitialState()) : choice === 'merge' ? mergeProgress(current, remote?.progress ?? createInitialState()) : clone(current);
      if (choice === 'merge') for (const copy of distinctRecoveries(recoveryEntries)) {
        if (JSON.stringify(copy.progress) !== JSON.stringify(current)) next = mergeProgress(copy.progress, next);
      }
      conflictBackup = { local: clone(current), remote: clone(remote?.progress ?? createInitialState()), recovery: distinctRecoveries(recoveryEntries).map(copy => clone(copy.progress)), owner: sessionId, at: new Date().toISOString() };
      const backupSaved = localWrite(`${accountKey(user.uid)}:conflict`, conflictBackup).ok;
      eligibleRecoveries = choice === 'merge' || backupSaved ? [...recoveryEntries] : choice === 'local' ? recoveryEntries.filter(entry => JSON.stringify(entry.progress) === JSON.stringify(next)) : [];
      // If no durable conflict backup could be written, future edits must use a
      // fresh slot rather than replacing an original that was not selected.
      if (!backupSaved) pendingId = uniqueId();
      if (choice === 'cloud' && backupSaved) {
        clearRecoveries(recoveryEntries);
        try { storage?.removeItem?.(`${pendingPrefix(user.uid)}${pendingId}`); } catch { /* Originals remain available. */ }
        recoveryEntries = []; eligibleRecoveries = []; recoveryConflict = false;
      }
      revision = remote?.revision ?? 0; current = next; remoteConflict = undefined; error = null; dirty = choice !== 'cloud'; editSequence += 1;
      cache(); show(); message = dirty ? 'جُمعت التعديلات؛ تجري إعادة المزامنة.' : 'حُمّلت نسخة الحساب التي اخترتها.'; notify();
      return dirty ? controller.syncNow() : true;
    },
    async signOut({ discardUnsynced = false } = {}) {
      try { options.beforeScopeChange?.(); } catch { /* The pending guard remains authoritative. */ }
      if (user && (dirty || syncing || remoteConflict !== undefined) && !discardUnsynced) throw codeError('account/unsynced', 'لديك تعديلات لم تتزامن. نزّل نسخة أو أعد المزامنة قبل تسجيل الخروج.');
      const uid = user?.uid;
      const scope = generation;
      await authAction('signOut');
      if (scope === generation && user?.uid === uid) await scopeChanged(null);
      if (uid && generation === scope + 1 && !user) {
        try {
          const shared = readCache(storage?.getItem?.(accountKey(uid)));
          if (!shared?.dirty || shared.owner === sessionId) storage?.removeItem?.(accountKey(uid));
          storage?.removeItem?.(`${pendingPrefix(uid)}${pendingId}`);
          const backup = JSON.parse(storage?.getItem?.(`${accountKey(uid)}:conflict`) ?? 'null');
          if (backup?.owner === sessionId) storage?.removeItem?.(`${accountKey(uid)}:conflict`);
        } catch { /* Guest storage and other tabs' pending drafts remain separate. */ }
      }
    },
    getStatus: snapshot,
    getSkillState: () => clone(skillState),
    retrySkills: () => watchSkills({ keepReceipts: true }),
    getConflictBackup: () => conflictBackup ? clone(conflictBackup) : null,
    getRecoveryBackups() {
      if (!user) return [];
      const entries = distinctRecoveries([...recoveryEntries, ...storedRecoveries(user.uid)]);
      if (dirty && !entries.some(entry => JSON.stringify(entry.progress) === JSON.stringify(current))) entries.push({ key: 'current-tab', revision, progress: current });
      return entries.map(entry => ({ id: entry.key, revision: entry.revision, savedAt: entry.savedAt ?? null, progress: clone(entry.progress) }));
    },
    dispose() {
      disposed = true; generation += 1; skillGeneration += 1;
      cancelTimer(); unsubscribe?.(); stopSkillWatch();
      skillState = { ...skillState, phase: linkedSkillsEnabled ? 'guest' : 'disabled', receipts: {}, fromCache: false, error: null, message: '' };
    },
  };
  return controller;
}
