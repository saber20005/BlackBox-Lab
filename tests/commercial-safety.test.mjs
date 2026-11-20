import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, createInitialState, createBackup, parseBackup, normalizeState } from '../progress.js';
import { mergeProgress } from '../account-sync.js';

test('commercial rollout must retain the original browser storage key', () => {
  assert.equal(STORAGE_KEY, 'blackbox-progress-v1');
});

test('commercial rollout must preserve notes, results and completions through backup roundtrip', () => {
  const original = createInitialState();
  original.notes['recon-0'] = 'طالب: ملاحظات محفوظة';
  original.results['recon-0'] = 'نتيجة مختبر محلي';
  original.completed['recon-0'] = '2026-11-18T12:00:00.000Z';
  const restored = parseBackup(JSON.stringify(createBackup(original)));
  assert.deepEqual(restored, normalizeState(original));
});

test('commercial rollout must merge guest and account work without dropping either note', () => {
  const guest = createInitialState();
  const account = createInitialState();
  guest.notes['recon-0'] = 'ملاحظة الضيف';
  account.notes['recon-0'] = 'ملاحظة الحساب';
  const merged = mergeProgress(guest, account);
  assert.match(merged.notes['recon-0'], /ملاحظة الضيف/);
  assert.match(merged.notes['recon-0'], /ملاحظة الحساب/);
});
