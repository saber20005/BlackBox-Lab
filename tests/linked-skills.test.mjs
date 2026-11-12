import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CASE_SCORE, SKILLS, CASE_META, CASE_IDS, normalizeReceipt, aggregateSkillProgress } from '../cybertrace-catalog.js';

const first = '2026-11-11T12:00:00.000Z';
const updated = '2026-11-11T12:01:00.000Z';
const receipt = (id = 'INC-0417', bestScore = 35, extra = {}) => ({
  schemaVersion: 1, source: 'cybertrace', caseId: id, bestScore,
  firstSyncedAt: first, updatedAt: updated, ...extra,
});
function timestamp(iso) {
  const milliseconds = Date.parse(iso);
  const seconds = Math.floor(milliseconds / 1000);
  return {
    seconds, nanoseconds: (milliseconds - seconds * 1000) * 1000000,
    toDate: () => new Date(milliseconds), toMillis: () => milliseconds,
  };
}

test('catalogue covers the exact 16 cases and eight complementary skills', () => {
  assert.equal(MAX_CASE_SCORE, 70);
  assert.deepEqual(CASE_IDS, ['INC-0417', 'INC-0512', 'INC-0633', 'INC-0701', 'INC-0755', 'INC-0812', 'INC-0890', 'INC-0944', 'INC-1002', 'INC-1055', 'INC-1101', 'INC-1102', 'INC-1103', 'INC-1104', 'INC-1105', 'INC-1106']);
  assert.deepEqual(SKILLS.map(skill => skill.id), ['identity', 'email', 'malware', 'web', 'data', 'cloud', 'network', 'supply-chain']);
  for (const id of CASE_IDS) {
    assert.equal(typeof CASE_META[id].title, 'string');
    assert(SKILLS.some(skill => skill.id === CASE_META[id].skillId));
    assert(CASE_META[id].trackIds.every(track => ['webgoat', 'proxy', 'network'].includes(track)));
  }
  assert.deepEqual(CASE_META['INC-0701'].trackIds, ['webgoat', 'proxy']);
  assert.deepEqual(CASE_META['INC-1104'].trackIds, ['network']);
  assert.deepEqual(CASE_META['INC-1102'].trackIds, []);
  assert(Object.isFrozen(SKILLS) && Object.isFrozen(CASE_META) && Object.isFrozen(CASE_IDS));
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
    assert.equal(progress.maxPoints, 1120);
    assert.equal(progress.percent, 0);
    assert.equal(progress.completedCount, 0);
    assert.equal(progress.totalCases, 16);
  }
  assert.deepEqual(Object.fromEntries(aggregateSkillProgress({}).skills.map(skill => [skill.id, skill.totalCases])), {
    identity: 4, email: 1, malware: 2, web: 2, data: 2, cloud: 2, network: 2, 'supply-chain': 1,
  });
});

test('partial best scores increase their named skill without changing practical stages', () => {
  const input = { 'INC-0417': receipt('INC-0417', 35), 'INC-1101': receipt('INC-1101', 70), 'INC-1104': receipt('INC-1104', 14) };
  const progress = aggregateSkillProgress(input);
  assert.equal(progress.points, 119);
  assert.equal(progress.percent, 11);
  assert.equal(progress.completedCount, 3);
  const byId = Object.fromEntries(progress.skills.map(skill => [skill.id, skill]));
  assert.equal(byId.identity.points, 35);
  assert.equal(byId.identity.percent, 13);
  assert.equal(byId.web.percent, 50);
  assert.equal(byId.data.percent, 10);
  assert.deepEqual(byId.web.caseIds, ['INC-0701', 'INC-1101']);
  assert.equal(Object.hasOwn(progress, 'completed'), false);
  assert.deepEqual(aggregateSkillProgress(input), progress);
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
  assert.equal(full.points, 1120);
  assert.equal(full.percent, 100);
  assert.equal(full.completedCount, 16);
  assert(full.skills.every(skill => skill.percent === 100 && skill.points === skill.maxPoints));
});
