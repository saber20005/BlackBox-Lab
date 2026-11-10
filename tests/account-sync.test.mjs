import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountSync, mergeProgress } from '../account-sync.js';
import { validateCloudProgress } from '../firebase-client.js';
import { createInitialState, STORAGE_KEY } from '../progress.js';

const controllers = [];
afterEach(() => { for (const controller of controllers.splice(0)) controller.dispose(); });
const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const progress = text => ({ ...createInitialState(), notes: { 'recon-0': text } });
function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, fail: false, get length() { return data.size; }, key(index) { return [...data.keys()][index] ?? null; }, getItem(key) { return data.get(key) ?? null; }, setItem(key, value) { if (this.fail) throw new Error('Quota'); data.set(key, value); }, removeItem(key) { data.delete(key); } };
}
function backend() {
  const api = {
    docs: new Map(), writes: [], listeners: 0, readOverride: null, writeOverride: null,
    providers: { email: true, google: true },
    onUserChanged(callback) { this.callback = callback; this.listeners += 1; queueMicrotask(() => callback(null)); return () => { this.callback = null; }; },
    setUser(uid) { this.uid = uid; this.callback?.(uid ? { uid, email: `${uid}@example.test`, displayName: uid } : null); },
    async read(uid) { return this.readOverride ? this.readOverride(uid) : copy(this.docs.get(uid) ?? null); },
    async write(uid, state, expected) {
      this.writes.push({ uid, state: copy(state), expected });
      if (this.writeOverride) return this.writeOverride(uid, state, expected);
      const remote = this.docs.get(uid) ?? null;
      if ((remote?.revision ?? 0) !== expected) throw Object.assign(new Error('Conflict'), { code: 'account/conflict', remote: copy(remote) });
      const value = { revision: expected + 1, progress: copy(state) }; this.docs.set(uid, value); return copy(value);
    },
    async signOut() { this.setUser(null); },
    async signInEmail() {}, async signUpEmail() {}, async signInGoogle() {}, async resetPassword() {},
  };
  return api;
}
async function setup({ guest = createInitialState(), service = backend(), store = storage(), ...options } = {}) {
  const shown = [], statuses = [];
  const controller = createAccountSync({ guestState: guest, storage: store, backend: service, debounceMs: 60000, onState: state => shown.push(state), onStatus: status => statuses.push(status), ...options });
  controllers.push(controller); await controller.start(); await tick();
  return { controller, service, store, shown, statuses };
}
const cache = (store, uid) => JSON.parse(store.getItem(`blackbox-account-progress-v1:${uid}`));

test('guest migration is explicit, preserves both notes, and never changes the legacy guest key', async () => {
  const guest = progress('guest note');
  const store = storage({ [STORAGE_KEY]: JSON.stringify(guest) });
  const service = backend(); service.docs.set('A', { revision: 1, progress: progress('account note') });
  const { controller, shown } = await setup({ guest, store, service });
  service.setUser('A'); await tick();
  assert.equal(shown.at(-1).notes['recon-0'], 'account note');
  assert.equal(controller.getStatus().guestAvailable, true);
  assert.equal(service.writes.length, 0);
  await controller.importGuest();
  const text = service.docs.get('A').progress.notes['recon-0'];
  assert(text.includes('guest note') && text.includes('account note'));
  await controller.importGuest();
  assert.equal(service.docs.get('A').progress.notes['recon-0'], text);
  assert.equal(store.getItem(STORAGE_KEY), JSON.stringify(guest));
});

test('ordinary autosave does not rerender, increments revision, and keeps guest data isolated', async () => {
  const guest = progress('guest'); const store = storage({ [STORAGE_KEY]: JSON.stringify(guest) });
  const { controller, service, shown } = await setup({ guest, store });
  service.setUser('A'); await tick(); const count = shown.length;
  controller.save(progress('account edit')); assert.equal(shown.length, count);
  assert.equal(controller.getStatus().pending, true);
  await controller.syncNow();
  assert.equal(service.docs.get('A').revision, 1);
  assert.equal(service.docs.get('A').progress.notes['recon-0'], 'account edit');
  assert.equal(controller.getStatus().pending, false);
  assert.equal(store.getItem(STORAGE_KEY), JSON.stringify(guest));
});

test('a stale account A write cannot alter account B state or revision after a switch', async () => {
  const pending = deferred(); const { controller, service, shown } = await setup();
  service.docs.set('B', { revision: 7, progress: progress('B private note') });
  service.setUser('A'); await tick();
  service.writeOverride = () => pending.promise;
  controller.save(progress('A private draft')); const writing = controller.syncNow(); await tick();
  service.setUser('B'); await tick();
  assert.equal(shown.at(-1).notes['recon-0'], 'B private note');
  pending.resolve({ revision: 1, progress: progress('A private draft') }); await writing;
  assert.equal(controller.getStatus().user.uid, 'B');
  assert.equal(controller.getStatus().pending, false);
  assert.equal(shown.at(-1).notes['recon-0'], 'B private note');
});

test('logout and same UID relogin reject an older read generation', async () => {
  const old = deferred(); let reads = 0;
  const { controller, service, shown } = await setup();
  service.readOverride = () => ++reads === 1 ? old.promise : Promise.resolve({ revision: 2, progress: progress('new A') });
  service.setUser('A'); await tick(); service.setUser(null); await tick(); service.setUser('A'); await tick();
  old.resolve({ revision: 1, progress: progress('old A') }); await tick();
  assert.equal(controller.getStatus().user.uid, 'A');
  assert.equal(shown.at(-1).notes['recon-0'], 'new A');
});

test('a revision conflict keeps local drafts until an explicit preserving merge', async () => {
  const service = backend(); service.docs.set('A', { revision: 1, progress: progress('initial') });
  const { controller, store } = await setup({ service });
  service.setUser('A'); await tick(); controller.save(progress('local new'));
  service.docs.set('A', { revision: 2, progress: progress('remote new') });
  assert.equal(await controller.syncNow(), false);
  assert.equal(controller.getStatus().conflict, true);
  assert.equal(cache(store, 'A').progress.notes['recon-0'], 'local new');
  assert.equal(service.docs.get('A').progress.notes['recon-0'], 'remote new');
  assert.equal(await controller.resolveConflict('merge'), true);
  const merged = service.docs.get('A'); assert.equal(merged.revision, 3);
  assert(merged.progress.notes['recon-0'].includes('local new') && merged.progress.notes['recon-0'].includes('remote new'));
  assert(controller.getConflictBackup().local.notes['recon-0'].includes('local new'));
});

test('typing during an initial cloud read remains local and creates a conflict rather than being replaced', async () => {
  const pending = deferred(); const { controller, service, store, shown } = await setup();
  service.readOverride = () => pending.promise;
  service.setUser('A'); await tick(); controller.save(progress('typed while loading'));
  const count = shown.length;
  pending.resolve({ revision: 4, progress: progress('cloud copy') }); await tick();
  assert.equal(controller.getStatus().conflict, true);
  assert.equal(shown.length, count);
  assert.equal(cache(store, 'A').progress.notes['recon-0'], 'typed while loading');
});

test('failed requireLocal replacements do not mutate state or queue a cloud upload', async () => {
  const service = backend(); service.docs.set('A', { revision: 1, progress: progress('saved') });
  const { controller, store, shown } = await setup({ service }); service.setUser('A'); await tick();
  store.fail = true;
  assert.equal(controller.save(progress('must not replace'), { requireLocal: true }).ok, false);
  assert.equal(controller.getStatus().pending, false);
  await controller.syncNow();
  assert.equal(service.writes.length, 0);
  assert.equal(shown.at(-1).notes['recon-0'], 'saved');
});

test('oversized cloud progress is retained locally and never silently truncated or uploaded', async () => {
  const { controller, service, store } = await setup(); service.setUser('A'); await tick();
  const huge = createInitialState();
  for (const key of Object.keys(huge.checks).slice(0, 8)) huge.notes[key] = 'x'.repeat(95000);
  controller.save(huge);
  assert.equal(await controller.syncNow(), false);
  assert.equal(controller.getStatus().error, 'account/too-large');
  assert.equal(controller.getStatus().pending, true);
  assert.equal(service.writes.length, 0);
  assert.equal(cache(store, 'A').progress.notes['recon-0'].length, 95000);
  assert.throws(() => mergeProgress(progress('a'.repeat(80000)), progress('b'.repeat(80000))));
  assert.throws(() => validateCloudProgress(huge), { code: 'account/too-large' });
});

test('signout guards unsynced work, restores the guest and removes account caches after explicit discard', async () => {
  const guest = progress('guest survives'); const store = storage({ [STORAGE_KEY]: JSON.stringify(guest) });
  const { controller, service, shown } = await setup({ guest, store });
  service.setUser('A'); await tick(); controller.save(progress('private unsynced'));
  await assert.rejects(controller.signOut(), { code: 'account/unsynced' });
  assert.equal(controller.getStatus().user.uid, 'A');
  await controller.signOut({ discardUnsynced: true }); await tick();
  assert.equal(controller.getStatus().user, null);
  assert.equal(shown.at(-1).notes['recon-0'], 'guest survives');
  assert.equal(store.getItem('blackbox-account-progress-v1:A'), null);
  assert.equal(store.getItem(STORAGE_KEY), JSON.stringify(guest));
});

test('manual sync downloads clean newer remote progress and initialization failure can be retried', async () => {
  const service = backend(); let attempts = 0;
  const { controller, shown } = await setup({ service, backend: async () => { if (++attempts === 1) throw new Error('Offline'); return service; } });
  assert.equal(controller.getStatus().configured, false);
  await controller.start(); await tick(); assert.equal(service.listeners, 1);
  service.docs.set('A', { revision: 1, progress: progress('first') }); service.setUser('A'); await tick();
  service.docs.set('A', { revision: 2, progress: progress('second device') });
  assert.equal(await controller.syncNow(), true);
  assert.equal(shown.at(-1).notes['recon-0'], 'second device');
});

test('beforeScopeChange flushes pending drafts in their previous guest scope', async () => {
  let controller;
  const guest = progress('before'); const store = storage({ [STORAGE_KEY]: JSON.stringify(guest) });
  const setupResult = await setup({ guest, store, beforeScopeChange: () => controller.save(progress('last guest draft')) });
  controller = setupResult.controller;
  setupResult.service.setUser('A'); await tick();
  assert.equal(JSON.parse(store.getItem(STORAGE_KEY)).notes['recon-0'], 'last guest draft');
  assert.equal(setupResult.service.writes.length, 0);
});

test('returning to guest and importing guest refresh work saved by a different guest tab', async () => {
  const guest = progress('old guest'); const store = storage({ [STORAGE_KEY]: JSON.stringify(guest) });
  const { controller, service, shown } = await setup({ guest, store });
  service.setUser('A'); await tick();
  store.setItem(STORAGE_KEY, JSON.stringify(progress('new guest from another tab')));
  await controller.importGuest();
  assert(service.docs.get('A').progress.notes['recon-0'].includes('new guest from another tab'));
  service.setUser(null); await tick();
  assert.equal(shown.at(-1).notes['recon-0'], 'new guest from another tab');
  controller.save({ ...shown.at(-1), results: { 'recon-0': 'guest follow-up' } });
  assert.equal(JSON.parse(store.getItem(STORAGE_KEY)).notes['recon-0'], 'new guest from another tab');
});

test('a delayed old signout cannot delete the cache of a newer session using the same UID', async () => {
  const ending = deferred(); const { controller, service, store } = await setup();
  service.setUser('A'); await tick();
  service.signOut = async () => { service.setUser(null); await ending.promise; };
  const logout = controller.signOut(); await tick();
  service.setUser('A'); await tick(); controller.save(progress('new session private draft'));
  ending.resolve(); await logout;
  assert.equal(controller.getStatus().user.uid, 'A');
  assert.equal(cache(store, 'A').progress.notes['recon-0'], 'new session private draft');
  assert.equal(controller.getStatus().pending, true);
});

test('a clean second tab cannot overwrite another tab\'s only pending recovery copy', async () => {
  const store = storage(), service = backend();
  const first = await setup({ store, service });
  const second = await setup({ store });
  service.setUser('A'); second.service.setUser('A'); await tick();
  first.controller.save(progress('offline draft in first tab'));
  await second.controller.syncNow();
  first.controller.dispose();
  const recovered = await setup({ store }); recovered.service.setUser('A'); await tick();
  assert.equal(recovered.shown.at(-1).notes['recon-0'], 'offline draft in first tab');
  assert.equal(recovered.controller.getStatus().pending, true);
  assert.equal(await recovered.controller.syncNow(), true);
  assert.equal(recovered.service.docs.get('A').progress.notes['recon-0'], 'offline draft in first tab');
});

test('distinct same-account tab drafts require explicit preserving resolution on recovery', async () => {
  const store = storage(), first = await setup({ store }), second = await setup({ store });
  first.service.setUser('A'); second.service.setUser('A'); await tick();
  first.controller.save(progress('first tab note'));
  second.controller.save(progress('second tab note'));
  const recovered = await setup({ store }); recovered.service.setUser('A'); await tick();
  assert.equal(recovered.controller.getStatus().conflict, true);
  assert.equal(recovered.controller.getStatus().recoveryCount, 2);
  assert.equal(recovered.service.writes.length, 0);
  assert.deepEqual(new Set(recovered.controller.getRecoveryBackups().map(copy => copy.progress.notes['recon-0'])), new Set(['first tab note', 'second tab note']));
  assert.equal(await recovered.controller.resolveConflict('merge'), true);
  const saved = recovered.service.docs.get('A').progress.notes['recon-0'];
  assert(saved.includes('first tab note') && saved.includes('second tab note'));
  assert.equal(recovered.controller.getStatus().recoveryCount, 0);
});

test('an oversized recovery merge preserves independently exportable originals', async () => {
  const store = storage(), first = await setup({ store }), second = await setup({ store });
  first.service.setUser('A'); second.service.setUser('A'); await tick();
  first.controller.save(progress('a'.repeat(80000)));
  second.controller.save(progress('b'.repeat(80000)));
  const recovered = await setup({ store }); recovered.service.setUser('A'); await tick();
  await assert.rejects(recovered.controller.resolveConflict('merge'));
  assert.equal(recovered.controller.getStatus().conflict, true);
  const originals = recovered.controller.getRecoveryBackups();
  assert.equal(originals.length, 2);
  assert(originals.every(copy => copy.progress.notes['recon-0'].length === 80000));
  assert.equal(recovered.service.writes.length, 0);
});

test('cross-tab signout preserves another tab\'s pending work while guest state stays isolated', async () => {
  const store = storage(), first = await setup({ store }), second = await setup({ store });
  first.service.setUser('A'); second.service.setUser('A'); await tick();
  first.controller.save(progress('pending private A work'));
  second.service.signOut = async () => { second.service.setUser(null); first.service.setUser(null); };
  await second.controller.signOut(); await tick();
  assert.equal(first.controller.getStatus().user, null);
  assert.equal(first.shown.at(-1).notes['recon-0'], undefined);
  assert.deepEqual(first.controller.getRecoveryBackups(), []);
  first.service.setUser('B'); await tick();
  assert.equal(first.shown.at(-1).notes['recon-0'], undefined);
  assert.equal(first.controller.getStatus().recoveryCount, 0);
  first.service.setUser('A'); await tick();
  assert.equal(first.shown.at(-1).notes['recon-0'], 'pending private A work');
});

test('choosing one local recovery copy retains unselected originals when conflict backup storage fails', async () => {
  const store = storage(), first = await setup({ store }), second = await setup({ store });
  first.service.setUser('A'); second.service.setUser('A'); await tick();
  first.controller.save(progress('first original'));
  second.controller.save(progress('second original'));
  const recovered = await setup({ store }); recovered.service.setUser('A'); await tick();
  const selected = recovered.shown.at(-1).notes['recon-0'];
  const unselected = selected === 'first original' ? 'second original' : 'first original';
  const write = store.setItem.bind(store);
  store.setItem = (key, value) => { if (key.endsWith(':conflict')) throw new Error('Quota'); write(key, value); };
  assert.equal(await recovered.controller.resolveConflict('local'), true);
  assert.equal(recovered.service.docs.get('A').progress.notes['recon-0'], selected);
  assert(recovered.controller.getRecoveryBackups().some(copy => copy.progress.notes['recon-0'] === unselected));
  assert([...store.data.entries()].some(([key, value]) => key.includes(':pending:') && JSON.parse(value).progress.notes['recon-0'] === unselected));
});

test('a later save after choosing cloud cannot remove original drafts when conflict backup storage failed', async () => {
  const store = storage(), first = await setup({ store }), second = await setup({ store });
  first.service.setUser('A'); second.service.setUser('A'); await tick();
  first.controller.save(progress('first original'));
  second.controller.save(progress('second original'));
  const service = backend(); service.docs.set('A', { revision: 2, progress: progress('chosen cloud') });
  const recovered = await setup({ store, service }); service.setUser('A'); await tick();
  recovered.controller.save(progress('current tab original'));
  const write = store.setItem.bind(store);
  store.setItem = (key, value) => { if (key.endsWith(':conflict')) throw new Error('Quota'); write(key, value); };
  assert.equal(await recovered.controller.resolveConflict('cloud'), true);
  recovered.controller.save(progress('new work after cloud choice'));
  assert.equal(await recovered.controller.syncNow(), true);
  const remaining = new Set(recovered.controller.getRecoveryBackups().map(copy => copy.progress.notes['recon-0']));
  assert(remaining.has('first original') && remaining.has('second original') && remaining.has('current tab original'));
  const persisted = new Set([...store.data.entries()].filter(([key]) => key.includes(':pending:')).map(([, value]) => JSON.parse(value).progress.notes['recon-0']));
  assert(persisted.has('first original') && persisted.has('second original') && persisted.has('current tab original'));
});
