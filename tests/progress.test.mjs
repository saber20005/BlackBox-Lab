import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, MAX_BACKUP_BYTES, MAX_TEXT_LENGTH, createInitialState,
  normalizeState, loadProgress, saveProgress, createBackup, parseBackup,
} from '../progress.js';

const timestamp = '2026-11-09T08:00:00.000Z';
function populatedState() {
  const state = createInitialState();
  state.checks['recon-0'] = [0, 1, 2];
  state.notes['recon-0'] = 'عنوان الهدف التجريبي وملاحظات المتابعة';
  state.results['recon-0'] = '<img src=x onerror=alert(1)> نص محفوظ كما كُتب';
  state.completed['recon-0'] = timestamp;
  state.devices.kali = 'on';
  state.devices.network = 'isolated';
  state.logs.push({ msg: 'تأكيد المرحلة الأولى', at: timestamp });
  state.updatedAt = timestamp;
  state.stageUpdatedAt['recon-0'] = timestamp;
  state.lastActivity = { trackId: 'recon', stageIndex: 1, at: timestamp };
  return state;
}

test('legacy exported progress migrates without losing notes, checklist, completions or device state', () => {
  const original = populatedState();
  const { updatedAt, stageUpdatedAt, lastActivity, ...legacy } = original;
  const restored = parseBackup(JSON.stringify(legacy));
  assert.deepEqual(restored.checks, original.checks);
  assert.deepEqual(restored.notes, original.notes);
  assert.deepEqual(restored.results, original.results);
  assert.deepEqual(restored.completed, original.completed);
  assert.deepEqual(restored.devices, original.devices);
  assert.equal(restored.updatedAt, null);
  assert.equal(restored.lastActivity, null);
});

test('versioned export round-trips all data, timestamps, resume point and literal markup safely', () => {
  const state = populatedState();
  state.notes['recon-0'] = 'أ'.repeat(MAX_TEXT_LENGTH);
  const backup = createBackup(state);
  assert.equal(backup.format, 'blackbox-lab-progress');
  assert.equal(backup.version, 1);
  assert.deepEqual(parseBackup(JSON.stringify(backup)), state);
});

test('strict import rejects malformed input without mutating the current progress', () => {
  const current = populatedState();
  const snapshot = structuredClone(current);
  for (const input of ['not JSON', 'null', '[]', '{}', '{"format":"other","version":1}', '{"checks":[]}']) {
    assert.throws(() => parseBackup(input));
    assert.deepEqual(current, snapshot);
  }
  for (const mutation of [
    state => { state.notes['unknown-0'] = 'unknown stage'; },
    state => { state.checks['recon-0'] = [0, 999]; },
    state => { state.checks['recon-0'] = [0, 0]; },
    state => { state.notes['recon-0'] = { html: '<script>' }; },
    state => { state.completed['recon-0'] = '2026-02-31T12:00:00Z'; },
    state => { state.devices.network = 'on'; },
    state => { state.lastActivity.stageIndex = 99; },
    state => { state.lastActivity.trackId = '__proto__'; },
    state => { state.logs[0].at = 'yesterday'; },
  ]) {
    const invalid = structuredClone(current);
    mutation(invalid);
    assert.throws(() => parseBackup(JSON.stringify(invalid)));
  }
  assert.throws(() => parseBackup(JSON.stringify(current).replace('"notes":{', '"notes":{"__proto__":"x",')));
  assert.equal({}.polluted, undefined);
});

test('import respects UTF-8 byte limits and rejects oversized notes and future versions', () => {
  assert.throws(() => parseBackup('أ'.repeat(Math.ceil(MAX_BACKUP_BYTES / 2) + 1)), /5/);
  const oversized = populatedState();
  oversized.notes['recon-0'] = 'a'.repeat(MAX_TEXT_LENGTH + 1);
  assert.throws(() => parseBackup(JSON.stringify(oversized)), /100000/);
  assert.throws(() => createBackup(oversized), /100000/);
  const future = createBackup(populatedState());
  future.version = 999;
  assert.throws(() => parseBackup(JSON.stringify(future)), /إصدارها/);
});

test('tolerant loading salvages valid fields instead of crashing or truncating existing notes', () => {
  const raw = {
    checks: { 'recon-0': [0, '1', 2, 999, 2], bad: [0] },
    notes: { 'recon-0': 'أ'.repeat(MAX_TEXT_LENGTH + 1), 'recon-1': 42 },
    results: null,
    completed: { 'recon-0': timestamp, 'recon-1': true },
    devices: { kali: 'on', windows: 'bad' },
    logs: [{ msg: 'صالح', at: timestamp }, { msg: {}, at: timestamp }],
    lastActivity: { trackId: 'unknown', stageIndex: 0, at: timestamp },
  };
  const clean = normalizeState(raw);
  assert.deepEqual(clean.checks['recon-0'], [0, 2]);
  assert.equal(clean.notes['recon-0'], raw.notes['recon-0']);
  assert.equal(clean.notes['recon-1'], undefined);
  assert.equal(clean.completed['recon-0'], timestamp);
  assert.equal(clean.completed['recon-1'], undefined);
  assert.equal(clean.devices.kali, 'on');
  assert.equal(clean.devices.windows, 'unknown');
  assert.equal(clean.logs.length, 1);
  assert.equal(clean.lastActivity, null);
  assert.doesNotThrow(() => normalizeState(null));
});

test('storage unavailable, corrupt JSON and quota failures are reported honestly', () => {
  assert.equal(loadProgress(null).ok, false);
  assert.equal(loadProgress({ getItem() { throw new Error('blocked'); } }).ok, false);
  assert.equal(loadProgress({ getItem() { return '{'; } }).ok, false);
  assert.equal(saveProgress(populatedState(), { setItem() { throw new Error('quota'); } }).ok, false);
  assert.equal(saveProgress(populatedState(), null).ok, false);
  let written;
  const success = saveProgress(populatedState(), { setItem(key, value) { assert.equal(key, STORAGE_KEY); written = value; } });
  assert.equal(success.ok, true);
  const loaded = loadProgress({ getItem(key) { assert.equal(key, STORAGE_KEY); return written; } });
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.state, populatedState());
  assert.equal(loadProgress({ getItem() { return null; } }).ok, true);
});
