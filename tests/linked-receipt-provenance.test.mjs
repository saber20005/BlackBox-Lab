import test from 'node:test';
import assert from 'node:assert/strict';
import { linkedSkillsPage, linkedSkillsSummary } from '../linked-skills-ui.js';

const user = { uid: 'current-user' };
const receipt = { schemaVersion: 1, source: 'cybertrace', caseId: 'INC-0417', bestScore: 35, firstSyncedAt: '2026-11-10T10:00:00.000Z', updatedAt: '2026-11-11T10:00:00.000Z' };
test('historical receipt remains counted but is not asserted to be current CyberTrace completion', () => {
  const state = { enabled: true, phase: 'ready', receipts: { 'INC-0417': receipt }, fromCache: false };
  const page = linkedSkillsPage(state, user);
  assert.match(page, /35/);
  assert.match(page, /جلسة ربط سابقة/);
  assert.match(page, /2026-11-11/);
  assert.match(page, /لا يثبت هذا السجل/);
  assert.match(linkedSkillsSummary(state, user), /سجلات تحقيق محفوظة في BLACKBOX/);
});
