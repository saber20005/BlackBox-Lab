import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createProgressSession } from '../progress-session.js';
import { createInitialState, STORAGE_KEY } from '../progress.js';

const sessions = [];
afterEach(() => { for (const session of sessions.splice(0)) session.dispose(); });
const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const progress = text => ({ ...createInitialState(), notes: { 'recon-0': text } });
const failedRead = () => Object.assign(new Error('offline'), { code: 'unavailable' });
const cacheKey = uid => `blackbox-account-progress-v1:${uid}`;
const cached = (state, dirty = false) => JSON.stringify({ revision: 1, progress: state, dirty, owner: 'other-tab', savedAt: '2026-11-19T09:00:00.000Z' });

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data, reads: [], writes: [], removals: [], scans: 0,
    getItem(key) { this.reads.push(key); return data.get(key) ?? null; },
    setItem(key, value) { this.writes.push([key, value]); throw new Error('Reader must not write'); },
    removeItem(key) { this.removals.push(key); throw new Error('Reader must not remove'); },
    key() { this.scans += 1; throw new Error('Reader must not scan pending drafts'); },
  };
}

function backend() {
  return {
    docs: new Map(), reads: [], writes: [], mutations: [], watches: [], stopped: 0,
    onUserChanged(callback) { this.auth = callback; return () => { this.auth = null; this.stopped += 1; }; },
    setUser(uid) { this.auth?.(uid ? { uid, email: `${uid}@private.example`, displayName: uid } : null); },
    async read(uid) { this.reads.push(uid); return this.readOverride ? this.readOverride(uid) : copy(this.docs.get(uid) ?? null); },
    write(...args) { this.writes.push(args); throw new Error('Reader must not upload'); },
    signOut() { this.mutations.push('signOut'); throw new Error('Reader must not change auth'); },
    watchCybertrace(...args) { this.watches.push(args); throw new Error('Reader must not subscribe to receipts'); },
  };
}

async function setup({ store = storage(), service = backend(), factory, onChange } = {}) {
  const changes = [];
  const session = createProgressSession({
    storage: store, backend: factory ?? service,
    onChange: snapshot => { changes.push(snapshot); onChange?.(snapshot); },
  });
  sessions.push(session);
  await session.start();
  return { session, store, service, changes };
}

test('session restoration does not present local guest progress as a known account source', async () => {
  const pending = deferred();
  const service = backend();
  const session = createProgressSession({ storage: storage({ [STORAGE_KEY]: JSON.stringify(progress('guest')) }), backend: () => pending.promise });
  sessions.push(session);
  const first = session.start();
  assert.equal(session.start(), first);
  assert.deepEqual(Object.keys(session).sort(), ['dispose', 'getSnapshot', 'refresh', 'start']);
  assert.equal(session.getSnapshot().scope, 'unknown');
  assert.equal(session.getSnapshot().phase, 'restoring');
  assert.equal(session.getSnapshot().progress, null);
  pending.resolve(service); await first;
  assert.equal(session.getSnapshot().progress, null);
  service.setUser(null);
  assert.equal(session.getSnapshot().scope, 'guest');
  assert.equal(session.getSnapshot().progress.notes['recon-0'], 'guest');
});

test('guest refresh and logout load the latest guest snapshot without saving it', async () => {
  const store = storage({ [STORAGE_KEY]: JSON.stringify(progress('guest original')) });
  const { session, service } = await setup({ store });
  service.setUser(null);
  assert.match(session.getSnapshot().message, /الضيف المحلي/);
  store.data.set(STORAGE_KEY, JSON.stringify(progress('guest refreshed')));
  assert.equal(await session.refresh(), true);
  assert.equal(session.getSnapshot().progress.notes['recon-0'], 'guest refreshed');
  service.docs.set('A', { revision: 1, progress: progress('private A') });
  service.setUser('A'); await tick();
  service.setUser(null);
  assert.equal(session.getSnapshot().ownerUid, null);
  assert.equal(session.getSnapshot().progress.notes['recon-0'], 'guest refreshed');
  assert.deepEqual(store.writes, []);
  assert.deepEqual(store.removals, []);
  assert.deepEqual(service.mutations, []);
});

test('dirty main and pending caches are untouched and never uploaded, including failed refreshes', async () => {
  const dirty = cached(progress('unsynced account draft'), true);
  const pendingKey = `${cacheKey('A')}:pending:original-tab`;
  const store = storage({ [STORAGE_KEY]: JSON.stringify(progress('guest separate')), [cacheKey('A')]: dirty, [pendingKey]: dirty });
  const original = [...store.data];
  const { session, service } = await setup({ store });
  service.docs.set('A', { revision: 1, progress: progress('cloud A') });
  service.setUser('A');
  assert.equal(session.getSnapshot().phase, 'loading');
  assert.equal(session.getSnapshot().progress, null);
  await tick();
  assert.equal(session.getSnapshot().progress.notes['recon-0'], 'cloud A');
  assert.equal(session.getSnapshot().fromCache, false);
  assert.equal(store.reads.includes(cacheKey('A')), false, 'cache is not consulted on successful reads');
  service.readOverride = () => { throw failedRead(); };
  assert.equal(await session.refresh(), false);
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.scope, 'account');
  assert.equal(snapshot.progress.notes['recon-0'], 'unsynced account draft');
  assert.equal(snapshot.pending, true);
  assert.equal(snapshot.fromCache, true);
  assert.match(snapshot.message, /مسودة محلية مخبأة.*لم تتزامن/);
  assert.deepEqual([...store.data], original);
  assert.deepEqual(store.writes, []);
  assert.deepEqual(store.removals, []);
  assert.equal(store.scans, 0);
  assert.deepEqual(service.writes, []);
  assert.deepEqual(service.mutations, []);
  assert.deepEqual(service.watches, []);
});

for (const outcome of ['resolve', 'reject']) {
  test(`an account A read that later ${outcome}s cannot replace account B`, async () => {
    const old = deferred();
    const { session, service, changes } = await setup();
    service.readOverride = uid => uid === 'A' ? old.promise : { revision: 1, progress: progress('B current') };
    service.setUser('A'); await tick();
    service.setUser('B');
    assert.equal(session.getSnapshot().ownerUid, 'B');
    assert.equal(session.getSnapshot().progress, null);
    await tick();
    const count = changes.length;
    if (outcome === 'resolve') old.resolve({ revision: 1, progress: progress('A stale') });
    else old.reject(failedRead());
    await tick();
    assert.equal(changes.length, count);
    assert.equal(session.getSnapshot().progress.notes['recon-0'], 'B current');
    assert.equal(session.getSnapshot().ownerUid, 'B');
  });
}

for (const middle of [null, 'B']) {
  test(`A to ${middle ?? 'guest'} to A rejects the previous A generation`, async () => {
    const old = deferred(); let aReads = 0;
    const { session, service } = await setup();
    service.readOverride = uid => uid === 'A' && ++aReads === 1 ? old.promise : { revision: 2, progress: progress('latest account') };
    service.setUser('A'); await tick();
    service.setUser(middle); await tick();
    service.setUser('A'); await tick();
    old.resolve({ revision: 1, progress: progress('old account') }); await tick();
    assert.equal(session.getSnapshot().ownerUid, 'A');
    assert.equal(session.getSnapshot().progress.notes['recon-0'], 'latest account');
  });
}

test('failed account reads use only the same UID cache, with truthful cached status', async () => {
  const store = storage({
    [STORAGE_KEY]: JSON.stringify(progress('guest must stay separate')),
    [cacheKey('A')]: cached(progress('cached A')),
    [cacheKey('B')]: cached(progress('cached B'), true),
  });
  const { session, service } = await setup({ store });
  service.readOverride = () => { throw failedRead(); };
  service.setUser('A'); await tick();
  const a = session.getSnapshot();
  assert.equal(a.phase, 'error');
  assert.equal(a.fromCache, true);
  assert.equal(a.pending, false);
  assert.equal(a.progress.notes['recon-0'], 'cached A');
  assert.match(a.message, /نسخة مخبأة.*لم يُؤكَّد/);
  assert.equal(store.reads.includes(cacheKey('B')), false);
  service.setUser('C'); await tick();
  const c = session.getSnapshot();
  assert.equal(c.scope, 'account');
  assert.equal(c.ownerUid, 'C');
  assert.equal(c.progress, null);
  assert.equal(c.fromCache, false);
  assert.equal(c.error, 'unavailable');
  assert.match(c.message, /لا تتوفر نسخة/);
});

test('a failed refresh retains the last same-owner cloud read when no cache exists', async () => {
  const { session, service } = await setup();
  service.docs.set('A', { revision: 1, progress: progress('last good cloud read') });
  service.setUser('A'); await tick();
  service.readOverride = () => { throw failedRead(); };
  await session.refresh();
  assert.equal(session.getSnapshot().progress.notes['recon-0'], 'last good cloud read');
  assert.equal(session.getSnapshot().fromCache, true);
  assert.match(session.getSnapshot().message, /آخر نسخة مقروءة/);
  service.setUser('B'); await tick();
  assert.equal(session.getSnapshot().progress, null);
});

test('a missing cloud document means empty account progress, ignoring dirty cache and guest', async () => {
  const { session, service } = await setup({ store: storage({
    [STORAGE_KEY]: JSON.stringify(progress('guest')),
    [cacheKey('A')]: cached(progress('draft A'), true),
  }) });
  service.setUser('A'); await tick();
  assert.equal(session.getSnapshot().scope, 'account');
  assert.equal(session.getSnapshot().phase, 'ready');
  assert.deepEqual(session.getSnapshot().progress, createInitialState());
  assert.equal(session.getSnapshot().pending, false);
  assert.match(session.getSnapshot().message, /لا يوجد تقدم محفوظ/);
});

test('parallel refreshes coalesce and snapshots cannot mutate reader state', async () => {
  const pending = deferred();
  const { session, service } = await setup();
  service.readOverride = () => pending.promise;
  service.setUser('A');
  const first = session.refresh(), second = session.refresh();
  assert.equal(first, second);
  await tick();
  assert.deepEqual(service.reads, ['A']);
  pending.resolve({ revision: 1, progress: progress('cloud original') });
  assert.equal(await first, true);
  const snapshot = session.getSnapshot();
  snapshot.progress.notes['recon-0'] = 'mutated outside';
  snapshot.ownerUid = 'B';
  assert.equal(session.getSnapshot().ownerUid, 'A');
  assert.equal(session.getSnapshot().progress.notes['recon-0'], 'cloud original');
});

test('disabled accounts have an explicit local guest fallback, other SDK failures keep source unknown', async () => {
  const store = storage({ [STORAGE_KEY]: JSON.stringify(progress('local guest')) });
  const disabled = await setup({ store, factory: () => { throw Object.assign(new Error('disabled'), { code: 'account/unavailable' }); } });
  assert.equal(disabled.session.getSnapshot().scope, 'guest');
  assert.equal(disabled.session.getSnapshot().error, 'account/unavailable');
  assert.match(disabled.session.getSnapshot().message, /الحسابات غير مهيّأة.*الضيف المحلي/);
  const unknown = await setup({ store, factory: () => { throw new TypeError('SDK load failed'); } });
  assert.equal(unknown.session.getSnapshot().scope, 'unknown');
  assert.equal(unknown.session.getSnapshot().phase, 'error');
  assert.equal(unknown.session.getSnapshot().progress, null);
});

test('corrupt or blocked account caches cannot substitute guest data after an account failure', async () => {
  for (const raw of ['{broken', cached(progress('bad revision')).replace('"revision":1', '"revision":-1'), JSON.stringify({ revision: 1, dirty: false, progress: [] })]) {
    const { session, service } = await setup({ store: storage({ [cacheKey('A')]: raw, [STORAGE_KEY]: JSON.stringify(progress('guest')) }) });
    service.readOverride = () => { throw failedRead(); };
    service.setUser('A'); await tick();
    assert.equal(session.getSnapshot().progress, null);
  }
});

test('dispose unsubscribes, clears private state, and ignores late reads and auth callbacks', async () => {
  const pending = deferred();
  const { session, service, changes } = await setup();
  const oldAuth = service.auth;
  service.readOverride = () => pending.promise;
  service.setUser('A'); await tick();
  session.dispose();
  const count = changes.length;
  pending.resolve({ revision: 1, progress: progress('private late result') });
  oldAuth({ uid: 'B' }); await tick();
  assert.equal(changes.length, count);
  assert.equal(service.stopped, 1);
  assert.equal(session.getSnapshot().progress, null);
  assert.equal(session.getSnapshot().ownerUid, null);
  assert.equal(await session.refresh(), false);
  assert.equal(await session.start(), false);
});

test('disposing while the backend loads never subscribes later', async () => {
  const pending = deferred();
  const service = backend();
  const session = createProgressSession({ storage: storage(), backend: () => pending.promise });
  sessions.push(session);
  const starting = session.start();
  session.dispose();
  pending.resolve(service);
  assert.equal(await starting, false);
  assert.equal(service.auth, undefined);
});
