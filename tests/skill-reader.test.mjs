import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountSync } from '../account-sync.js';
import { createInitialState } from '../progress.js';

const controllers = [];
afterEach(() => { for (const controller of controllers.splice(0)) controller.dispose(); });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const copy = value => JSON.parse(JSON.stringify(value));
const receipt = (caseId = 'INC-0417', bestScore = 50) => ({
  schemaVersion: 1, source: 'cybertrace', caseId, bestScore,
  firstSyncedAt: '2026-11-11T10:00:00.000Z', updatedAt: '2026-11-11T10:00:00.000Z',
});
function storage() {
  const entries = new Map();
  return { get length() { return entries.size; }, key(index) { return [...entries.keys()][index] ?? null; }, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}
function backend() {
  return {
    watchers: [], writes: [],
    onUserChanged(callback) { this.auth = callback; queueMicrotask(() => callback(null)); return () => { this.auth = null; }; },
    setUser(uid) { this.auth?.(uid ? { uid, email: `${uid}@example.test` } : null); },
    async read() { return null; },
    async write(uid, progress, revision) { this.writes.push({ uid, progress: copy(progress) }); return { revision: revision + 1, progress: copy(progress) }; },
    async signOut() { this.setUser(null); },
    watchCybertrace(uid, onData, onError) {
      const watcher = { uid, onData, onError, stopped: false };
      this.watchers.push(watcher);
      return () => { watcher.stopped = true; };
    },
  };
}
async function setup({ enabled = true, service = backend() } = {}) {
  const skills = [], shown = [], events = [];
  const controller = createAccountSync({
    backend: service, storage: storage(), guestState: createInitialState(), debounceMs: 60000,
    linkedSkillsEnabled: enabled,
    onSkillState: state => { skills.push(state); events.push({ type: 'skills', state }); },
    onState: state => { shown.push(state); events.push({ type: 'practical', skills: controller.getSkillState() }); },
  });
  controllers.push(controller);
  await controller.start(); await tick();
  return { controller, service, skills, shown, events };
}

test('disabled linked skills never subscribe or affect practical account loading', async () => {
  const { controller, service } = await setup({ enabled: false });
  service.setUser('A'); await tick();
  assert.equal(service.watchers.length, 0);
  assert.equal(controller.getStatus().phase, 'signed-in');
  assert.equal(controller.getSkillState().phase, 'disabled');
  assert.equal(controller.retrySkills(), false);
});

test('changing account clears receipts before practical rendering and rejects late old-owner callbacks', async () => {
  const { controller, service, events } = await setup();
  service.setUser('A'); await tick();
  const first = service.watchers.at(-1);
  first.onData({ receipts: { 'INC-0417': receipt() }, fromCache: false });
  assert.equal(controller.getSkillState().receipts['INC-0417'].bestScore, 50);
  events.length = 0;
  service.setUser('B');
  assert.deepEqual(controller.getSkillState().receipts, {});
  assert.equal(first.stopped, true);
  assert.equal(events[0].type, 'skills');
  assert.deepEqual(events.find(event => event.type === 'practical').skills.receipts, {});
  await tick();
  const second = service.watchers.at(-1);
  first.onData({ receipts: { 'INC-0417': receipt('INC-0417', 70) }, fromCache: false });
  first.onError({ code: 'permission-denied' });
  assert.equal(controller.getSkillState().phase, 'loading');
  assert.deepEqual(controller.getSkillState().receipts, {});
  second.onData({ receipts: { 'INC-0512': receipt('INC-0512', 30) }, fromCache: false });
  assert.deepEqual(Object.keys(controller.getSkillState().receipts), ['INC-0512']);
  service.setUser(null);
  assert.equal(controller.getSkillState().phase, 'guest');
  assert.deepEqual(controller.getSkillState().receipts, {});
});

test('logout and same-UID relogin reject an earlier subscription generation', async () => {
  const { controller, service } = await setup();
  service.setUser('A'); await tick(); const old = service.watchers.at(-1);
  service.setUser(null); await tick(); service.setUser('A'); await tick();
  const current = service.watchers.at(-1);
  current.onData({ receipts: { 'INC-0417': receipt('INC-0417', 60) }, fromCache: false });
  old.onData({ receipts: { 'INC-0417': receipt('INC-0417', 10) }, fromCache: false });
  old.onError({ code: 'unavailable' });
  assert.equal(controller.getSkillState().phase, 'ready');
  assert.equal(controller.getSkillState().receipts['INC-0417'].bestScore, 60);
});

test('reader cache status is truthful and malformed receipts never add credit', async () => {
  const { controller, service } = await setup();
  service.setUser('A'); await tick(); const watcher = service.watchers.at(-1);
  watcher.onData({ receipts: { 'INC-0417': receipt() }, fromCache: true });
  assert.equal(controller.getSkillState().fromCache, true);
  watcher.onData({ receipts: { 'INC-0417': receipt() }, fromCache: false });
  assert.equal(controller.getSkillState().fromCache, false);
  watcher.onData({ receipts: { 'INC-0417': receipt(), 'UNKNOWN': receipt('UNKNOWN', 70) }, fromCache: false });
  assert.equal(controller.getSkillState().phase, 'error');
  assert.equal(controller.getSkillState().error, 'skills/invalid-receipt');
  assert.deepEqual(Object.keys(controller.getSkillState().receipts), ['INC-0417']);
  assert.equal(controller.getSkillState().fromCache, true);
  service.setUser('B'); await tick();
  service.watchers.at(-1).onData({ receipts: { 'INC-0417': { ...receipt(), bestScore: 999 } }, fromCache: false });
  assert.deepEqual(controller.getSkillState().receipts, {});
});

test('an empty unconfirmed cache neither declares zero progress nor erases known account receipts', async () => {
  const { controller, service } = await setup();
  service.setUser('A'); await tick(); const watcher = service.watchers.at(-1);
  watcher.onData({ receipts: {}, fromCache: true });
  assert.equal(controller.getSkillState().phase, 'loading');
  watcher.onData({ receipts: { 'INC-0417': receipt() }, fromCache: false });
  watcher.onData({ receipts: {}, fromCache: true });
  assert.equal(controller.getSkillState().receipts['INC-0417'].bestScore, 50);
  assert.equal(controller.getSkillState().fromCache, true);
  watcher.onData({ receipts: {}, fromCache: false });
  assert.equal(controller.getSkillState().phase, 'ready');
  assert.deepEqual(controller.getSkillState().receipts, {});
});

test('retry replaces only the skill subscription while practical saves keep working', async () => {
  const { controller, service, shown } = await setup();
  service.setUser('A'); await tick(); const first = service.watchers.at(-1);
  first.onData({ receipts: { 'INC-0417': receipt() }, fromCache: false });
  const renders = shown.length;
  first.onError({ code: 'unavailable' });
  assert.equal(controller.getSkillState().phase, 'error');
  assert.equal(controller.getStatus().error, null);
  assert.equal(controller.retrySkills(), true);
  assert.equal(first.stopped, true);
  assert.equal(controller.getSkillState().receipts['INC-0417'].bestScore, 50);
  first.onError({ code: 'permission-denied' });
  service.watchers.at(-1).onData({ receipts: { 'INC-0417': receipt('INC-0417', 70) }, fromCache: false });
  assert.equal(controller.getSkillState().phase, 'ready');
  assert.equal(shown.length, renders);
  assert.equal(service.writes.length, 0);
  const practical = createInitialState(); practical.notes['recon-0'] = 'my practical note';
  controller.save(practical);
  assert.equal(await controller.syncNow(), true);
  assert.equal(service.writes[0].progress.notes['recon-0'], 'my practical note');
  assert.deepEqual(service.writes[0].progress.completed, {});
  assert.equal(Object.hasOwn(service.writes[0].progress, 'receipts'), false);
});

test('missing optional backend capability does not break old practical backends', async () => {
  const service = backend(); delete service.watchCybertrace;
  const { controller } = await setup({ service });
  service.setUser('A'); await tick();
  assert.equal(controller.getSkillState().phase, 'error');
  assert.equal(controller.getSkillState().error, 'skills/unavailable');
  assert.equal(controller.getStatus().phase, 'signed-in');
  controller.save(createInitialState());
  assert.equal(await controller.syncNow(), true);
});

test('dispose unsubscribes and prevents late notifications or receipt exposure', async () => {
  const { controller, service, skills } = await setup();
  service.setUser('A'); await tick(); const watcher = service.watchers.at(-1);
  watcher.onData({ receipts: { 'INC-0417': receipt() }, fromCache: false });
  controller.dispose(); const count = skills.length;
  assert.equal(watcher.stopped, true);
  watcher.onData({ receipts: { 'INC-0417': receipt('INC-0417', 70) }, fromCache: false });
  assert.equal(skills.length, count);
  assert.deepEqual(controller.getSkillState().receipts, {});
});

test('a broken optional watcher cleanup cannot prevent an account switch', async () => {
  const service = backend();
  const originalWatch = service.watchCybertrace;
  service.watchCybertrace = function (...args) {
    originalWatch.apply(this, args);
    return () => { throw new Error('Cleanup failure'); };
  };
  const { controller } = await setup({ service });
  service.setUser('A'); await tick();
  service.watchers.at(-1).onData({ receipts: { 'INC-0417': receipt() }, fromCache: false });
  service.setUser('B'); await tick();
  assert.equal(controller.getStatus().user.uid, 'B');
  assert.equal(controller.getStatus().phase, 'signed-in');
  assert.deepEqual(controller.getSkillState().receipts, {});
});
