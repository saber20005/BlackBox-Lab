import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CASE_SCORE, SKILLS, CASE_META, CASE_IDS, normalizeReceipt, aggregateSkillProgress } from '../cybertrace-catalog.js';

const first = '2026-11-11T12:00:00.000Z';
const updated = '2026-11-11T12:01:00.000Z';
const receipt = (id = 'INC-0417', bestScore = 35, extra = {}) => ({
  schemaVersion: 1, source: 'cybertrace', caseId: id, bestScore,
  firstSyncedAt: first, updatedAt: updated, ...extra,
});
const LEGACY_CASE_IDS = ['INC-0417', 'INC-0512', 'INC-0633', 'INC-0701', 'INC-0755', 'INC-0812', 'INC-0890', 'INC-0944', 'INC-1002', 'INC-1055', 'INC-1101', 'INC-1102', 'INC-1103', 'INC-1104', 'INC-1105', 'INC-1106'];
const NEW_CASE_IDS = ['INC-1201', 'INC-1202', 'INC-1203', 'INC-1204', 'INC-1205', 'INC-1206', 'INC-1207', 'INC-1208', 'INC-1209', 'INC-1210', 'INC-1211', 'INC-1212'];
function timestamp(iso) {
  const milliseconds = Date.parse(iso);
  const seconds = Math.floor(milliseconds / 1000);
  return {
    seconds, nanoseconds: (milliseconds - seconds * 1000) * 1000000,
    toDate: () => new Date(milliseconds), toMillis: () => milliseconds,
  };
}

test('catalogue preserves the original cases and adds exactly twelve cases across eight complementary skills', () => {
  assert.equal(MAX_CASE_SCORE, 70);
  assert.deepEqual(CASE_IDS, [...LEGACY_CASE_IDS, ...NEW_CASE_IDS]);
  assert.equal(CASE_IDS.length, 28);
  assert.equal(new Set(CASE_IDS).size, CASE_IDS.length);
  assert.deepEqual(SKILLS.map(skill => skill.id), ['identity', 'email', 'malware', 'web', 'data', 'cloud', 'network', 'supply-chain']);
  for (const id of CASE_IDS) {
    assert.equal(typeof CASE_META[id].title, 'string');
    assert(SKILLS.some(skill => skill.id === CASE_META[id].skillId));
    assert(CASE_META[id].trackIds.every(track => ['webgoat', 'proxy', 'network', 'nmap'].includes(track)));
  }
  assert.deepEqual(CASE_META['INC-0701'].trackIds, ['webgoat', 'proxy']);
  assert.deepEqual(CASE_META['INC-1104'].trackIds, ['network']);
  assert.deepEqual(CASE_META['INC-1102'].trackIds, []);
  assert.deepEqual(CASE_META['INC-1203'].trackIds, ['webgoat', 'proxy']);
  assert.deepEqual(CASE_META['INC-1211'].trackIds, ['network', 'nmap']);
  assert(Object.isFrozen(SKILLS) && Object.isFrozen(CASE_META) && Object.isFrozen(CASE_IDS));
});

test('each new case accepts only its own valid scored receipt', () => {
  for (const id of NEW_CASE_IDS) {
    assert.deepEqual(normalizeReceipt(receipt(id, 70), id), receipt(id, 70));
    assert.equal(normalizeReceipt(receipt(id, 70, { privateNotes: 'not a receipt field' }), id), null);
    assert.equal(normalizeReceipt(receipt('INC-0417', 70), id), null);
  }
  assert.equal(normalizeReceipt(receipt('INC-1213', 70), 'INC-1213'), null);
});

test('valid scored receipts normalize without mutating or inventing fields', () => {
  const input = Object.freeze(receipt());
  assert.deepEqual(normalizeReceipt(input, 'INC-0417'), input);
  assert.equal(normalizeReceipt(receipt('INC-0417', 0), 'INC-0417').bestScore, 0);
  assert.equal(normalizeReceipt(receipt('INC-0417', 70), 'INC-0417').bestScore, 70);
  assert.equal(input.firstSyncedAt, first);
});

test('SDK Timestamp conversions become canonical ISO with numeric consistency checks', () => {
  assert.deepEqual(normalizeReceipt(receipt('INC-0417', 35, {
    firstSyncedAt: timestamp(first), updatedAt: timestamp(updated),
  }), 'INC-0417'), receipt());
  assert.equal(normalizeReceipt(receipt('INC-0417', 35, {
    firstSyncedAt: { toDate: () => new Date(first) }, updatedAt: { toMillis: () => Date.parse(updated) },
  }), 'INC-0417').updatedAt, updated);
  assert.equal(normalizeReceipt(receipt('INC-0417', 35, {
    updatedAt: { ...timestamp(updated), toMillis: () => Date.parse(first) },
  }), 'INC-0417'), null);
});

test('unknown IDs, wrong envelopes, unscored legacy values and malformed scores are rejected', () => {
  for (const raw of [null, [], {}, { completed: true }, { ...receipt(), extra: true },
    receipt('INC-9999'), receipt('INC-0812'), receipt('INC-0417', 35, { schemaVersion: 2 }),
    receipt('INC-0417', 35, { source: 'other' }), receipt('INC-0417', 35, { firstSyncedAt: undefined })]) {
    assert.equal(normalizeReceipt(raw, 'INC-0417'), null);
  }
  for (const score of [-1, 71, 12.5, '35', NaN, Infinity, null, true, undefined]) {
    assert.equal(normalizeReceipt(receipt('INC-0417', 35, { bestScore: score }), 'INC-0417'), null);
  }
  for (const id of ['INC-9999', '__proto__', 'constructor', '', null, 1]) assert.equal(normalizeReceipt(receipt(), id), null);
});

test('invalid or missing timestamps are rejected without fabricated dates', () => {
  for (const value of [null, undefined, 0, new Date(first), '2026-02-30T12:00:00.000Z',
    '2026-11-11T12:00:00Z', '2026-11-11T12:00:00.000+00:00', '0000-01-01T00:00:00.000Z',
    { toDate: () => new Date(NaN) }, { toDate: () => first }, { toDate: () => { throw new Error('bad'); } },
    { toMillis: () => Infinity }, { toMillis: () => '123' },
    { ...timestamp(first), seconds: 1.5 }, { ...timestamp(first), nanoseconds: 1000000000 },
    { ...timestamp(first), seconds: 253402300800 }, { seconds: 0, nanoseconds: 0 }]) {
    assert.equal(normalizeReceipt(receipt('INC-0417', 35, { firstSyncedAt: value }), 'INC-0417'), null);
  }
  assert.equal(normalizeReceipt(receipt('INC-0417', 35, { firstSyncedAt: updated, updatedAt: first }), 'INC-0417'), null);
  const throwing = Object.defineProperty(receipt(), 'updatedAt', { enumerable: true, get() { throw new Error('bad'); } });
  assert.equal(normalizeReceipt(throwing, 'INC-0417'), null);
});

test('empty or unknown receipt data leaves fixed catalogue denominators intact', () => {
  for (const input of [undefined, null, 5, {}, [], { unknown: receipt() }, { 'INC-0417': receipt('INC-0812') }]) {
    const progress = aggregateSkillProgress(input);
    assert.equal(progress.points, 0);
    assert.equal(progress.maxPoints, CASE_IDS.length * MAX_CASE_SCORE);
    assert.equal(progress.percent, 0);
    assert.equal(progress.completedCount, 0);
    assert.equal(progress.totalCases, CASE_IDS.length);
  }
  assert.deepEqual(Object.fromEntries(aggregateSkillProgress({}).skills.map(skill => [skill.id, skill.totalCases])), {
    identity: 6, email: 3, malware: 3, web: 3, data: 3, cloud: 3, network: 4, 'supply-chain': 3,
  });
});

test('partial best scores increase their named skill without changing practical stages', () => {
  const input = { 'INC-0417': receipt('INC-0417', 35), 'INC-1101': receipt('INC-1101', 70), 'INC-1104': receipt('INC-1104', 14) };
  const progress = aggregateSkillProgress(input);
  assert.equal(progress.points, 119);
  assert.equal(progress.percent, Math.round(119 * 100 / (CASE_IDS.length * MAX_CASE_SCORE)));
  assert.equal(progress.completedCount, 3);
  const byId = Object.fromEntries(progress.skills.map(skill => [skill.id, skill]));
  assert.equal(byId.identity.points, 35);
  assert.equal(byId.identity.percent, Math.round(35 * 100 / byId.identity.maxPoints));
  assert.equal(byId.web.percent, Math.round(70 * 100 / byId.web.maxPoints));
  assert.equal(byId.data.percent, Math.round(14 * 100 / byId.data.maxPoints));
  assert.deepEqual(byId.web.caseIds, ['INC-0701', 'INC-1101', 'INC-1203']);
  assert.equal(Object.hasOwn(progress, 'completed'), false);
  assert.deepEqual(aggregateSkillProgress(input), progress);
});

test('old stored receipts retain scores and timestamps when catalogue coverage expands', () => {
  const saved = Object.freeze(Object.fromEntries(LEGACY_CASE_IDS.map(id => [id, Object.freeze(receipt(id, 70))])));
  const before = JSON.stringify(saved);
  const expanded = aggregateSkillProgress(saved);
  assert.equal(expanded.points, 1120);
  assert.equal(expanded.completedCount, LEGACY_CASE_IDS.length);
  assert.equal(expanded.totalCases, 28);
  assert.equal(expanded.maxPoints, 1960);
  assert.equal(expanded.percent, Math.round(1120 * 100 / 1960));
  for (const id of LEGACY_CASE_IDS) assert.deepEqual(normalizeReceipt(saved[id], id), saved[id]);
  assert.equal(JSON.stringify(saved), before);
  const withNewResult = aggregateSkillProgress({ ...saved, 'INC-1203': receipt('INC-1203', 35) });
  assert.equal(withNewResult.points, expanded.points + 35);
  assert.equal(withNewResult.completedCount, expanded.completedCount + 1);
  assert.equal(JSON.stringify(saved), before);
});

test('duplicate snapshots contribute the highest valid per-case score once, independently of order', () => {
  const input = [receipt('INC-0417', 10), receipt('INC-0417', 50),
    receipt('INC-0417', 35, { updatedAt: '2026-11-11T12:05:00.000Z' }), receipt('INC-1101', 70),
    receipt('INC-9999', 70), receipt('INC-0417', 71)];
  const progress = aggregateSkillProgress(input);
  assert.equal(progress.points, 120);
  assert.equal(progress.completedCount, 2);
  assert.deepEqual(aggregateSkillProgress([...input].reverse()), progress);
  assert.equal(input[1].updatedAt, updated);
  assert.equal(aggregateSkillProgress({ 'INC-0417': receipt('INC-0417', 35), duplicate: receipt('INC-0417', 70) }).points, 35);
});

test('sparse or unreadable entries cannot crash aggregation or discard readable achievements', () => {
  const unreadable = Object.defineProperty({}, 'caseId', { get() { throw new Error('bad'); } });
  const entries = new Array(1);
  entries.push(unreadable, receipt('INC-0417', 35));
  assert.equal(aggregateSkillProgress(entries).points, 35);
  const map = Object.defineProperty({ 'INC-0417': receipt('INC-0417', 35) }, 'INC-0812', {
    enumerable: true, get() { throw new Error('bad'); },
  });
  assert.equal(aggregateSkillProgress(map).points, 35);
});

test('a valid zero-score completion is counted without granting points, and complete coverage is bounded', () => {
  const zero = aggregateSkillProgress({ 'INC-0417': receipt('INC-0417', 0) });
  assert.equal(zero.completedCount, 1);
  assert.equal(zero.points, 0);
  const full = aggregateSkillProgress(Object.fromEntries(CASE_IDS.map(id => [id, receipt(id, 70)])));
  assert.equal(full.points, 1960);
  assert.equal(full.maxPoints, CASE_IDS.length * MAX_CASE_SCORE);
  assert.equal(full.percent, 100);
  assert.equal(full.completedCount, 28);
  assert(full.skills.every(skill => skill.percent === 100 && skill.points === skill.maxPoints));
});
