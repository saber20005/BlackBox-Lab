import test from 'node:test';
import assert from 'node:assert/strict';
import { tracks } from '../data.js';
import { SUITE_PATHWAYS } from '../assets/modules/training/suite-learning-pathways.js';
import { suiteJourneyProgress } from '../assets/modules/training/suite-learning-progress.js';
import { suiteJourneysPage } from '../assets/modules/training/suite-learning-pathways-ui.js';

const path = SUITE_PATHWAYS[0];
const at = '2026-11-26T10:00:00.000Z';
const receipt = (caseId = 'INC-0417', bestScore = 70) => ({ schemaVersion: 1, source: 'cybertrace', caseId, bestScore, firstSyncedAt: at, updatedAt: at });
const linked = (receipts = {}, extra = {}, identity = {}) => ({ linked: {
  userUid: 'owner-A', ownerUid: 'owner-A', accountPhase: 'signed-in',
  ...identity, state: { enabled: true, phase: 'ready', fromCache: false, receipts, error: null, ...extra },
} });
const practical = (...ids) => ({ completed: Object.fromEntries(ids.flatMap(id => tracks.find(track => track.id === id).stages.map((_, index) => [id + '-' + index, at]))) });

test('ready owner records combine investigation and practical completion and recommend the first remaining step', () => {
  const state = practical('logs');
  const options = linked({ 'INC-0417': receipt() });
  const before = JSON.stringify([state, options]);
  const result = suiteJourneyProgress(path, state, tracks, options);
  assert.equal(result.done, 2);
  assert.equal(result.total, 4);
  assert.equal(result.unknown, 0);
  assert.equal(result.practicalDone, 1);
  assert.equal(result.receiptPhase, 'ready');
  assert.deepEqual(result.steps.map(step => step.status), ['complete', 'complete', 'incomplete', 'incomplete']);
  assert.equal(result.nextStep.id, 'INC-1201');
  assert.equal(JSON.stringify([state, options]), before, 'render derivation does not write progress or receipt records');
  const html = suiteJourneysPage(state, tracks, options);
  assert.match(html, /الخطوات ذات الإنجاز المعروف: <bdi dir="ltr">2 \/ 4<\/bdi>/);
  assert.match(html, /max="4" value="2"/);
  assert.match(html, /ابدأ التحقيق التالي/);
});

test('even zero-score investigation receipts never auto-complete practical stages', () => {
  const state = practical();
  const result = suiteJourneyProgress(path, state, tracks, linked({ 'INC-0417': receipt('INC-0417', 0) }));
  assert.equal(result.done, 1);
  assert.equal(result.practicalDone, 0);
  assert.equal(result.nextStep.site, 'blackbox');
  assert.equal(result.nextStep.id, 'logs');
  assert.deepEqual(state.completed, {});
});

test('guest and disabled readers keep practical progress while investigation state remains unknown', () => {
  for (const options of [{}, linked({ 'INC-0417': receipt() }, { enabled: false })]) {
    const result = suiteJourneyProgress(path, practical('logs'), tracks, options);
    assert.equal(result.done, 1);
    assert.equal(result.unknown, 2);
    assert.equal(result.steps[0].status, 'unknown');
    assert.equal(result.nextStep.id, 'INC-0417');
  }
  assert.match(suiteJourneysPage(practical(), tracks), /حالة التحقيقات غير معروفة للضيف/);
  assert.match(suiteJourneysPage(practical(), tracks), /data-open-account/);
});

test('loading, account switches, and absent receipt envelopes never invent a known absence', () => {
  const records = { 'INC-0417': receipt() };
  for (const options of [
    linked(records, {}, { ownerUid: 'owner-B' }),
    linked(records, {}, { accountPhase: 'loading' }),
    linked({}, { phase: 'loading' }),
    linked({}, { receipts: undefined }),
    linked({}, { receipts: [] }),
  ]) {
    const result = suiteJourneyProgress(path, practical(), tracks, options);
    assert.equal(result.done, 0);
    assert.equal(result.unknown, 2);
    assert.equal(result.steps[0].status, 'unknown');
    assert.equal(result.steps[2].status, 'unknown');
  }
  const switched = suiteJourneyProgress(path, practical(), tracks, linked({}, {}, { userUid: 'owner-B', ownerUid: 'owner-B' }));
  assert.equal(switched.done, 0);
  assert.equal(switched.unknown, 0, 'an authoritative empty snapshot for the new account is known');
});

test('cached and error snapshots label their known records and keep missing investigations unknown', () => {
  for (const extra of [{ fromCache: true }, { phase: 'error', fromCache: true, error: 'unavailable' }]) {
    const options = linked({ 'INC-0417': receipt() }, extra);
    const result = suiteJourneyProgress(path, practical('logs'), tracks, options);
    assert.equal(result.done, 2);
    assert.equal(result.cachedDone, 1);
    assert.equal(result.unknown, 1);
    assert.equal(result.steps[0].cached, true);
    assert.equal(result.nextStep.id, 'INC-1201');
    const html = suiteJourneysPage(practical('logs'), tracks, options);
    assert.match(html, /نتائج من نسخة مخبأة: 1/);
    assert.match(html, /حالة غير معروفة: 1/);
    assert.match(html, /افتح التحقيق وراجع إنجازه/);
  }
  assert.match(suiteJourneysPage(practical(), tracks, linked({}, { phase: 'error', error: 'permission-denied' })), /data-retry-skills/);
});

test('malformed and unknown receipts add no completion and cannot expose payloads', () => {
  const malicious = {
    'INC-0417': { ...receipt(), bestScore: 999, privateNotes: '<img src=x onerror=alert(1)>' },
    UNKNOWN: receipt('UNKNOWN'),
  };
  const result = suiteJourneyProgress(path, practical(), tracks, linked(malicious));
  assert.equal(result.done, 0);
  assert.equal(result.unknown, 2);
  assert.equal(result.receiptPhase, 'error');
  const html = suiteJourneysPage(practical(), tracks, linked(malicious));
  assert.doesNotMatch(html, /privateNotes|onerror|alert\(1\)|999|UNKNOWN/);
  const throwing = Object.defineProperty({}, 'INC-0417', { enumerable: true, get() { throw new Error('Unreadable'); } });
  assert.equal(suiteJourneyProgress(path, practical(), tracks, linked(throwing)).done, 0);
});

test('complete journeys offer review and each card has a single proposed action with public-only links', () => {
  const state = practical('logs', 'integrity');
  const options = linked({ 'INC-0417': receipt(), 'INC-1201': receipt('INC-1201') });
  const result = suiteJourneyProgress(path, state, tracks, options);
  assert.equal(result.done, 4);
  assert.equal(result.allComplete, true);
  assert.equal(result.nextStep.id, path.steps[0].id);
  const html = suiteJourneysPage(state, tracks, options);
  assert.match(html, /راجع هذه الرحلة/);
  assert.equal((html.match(/data-journey-next/g) || []).length, 4);
  assert.equal((html.match(/<details class="suite-card"/g) || []).length, 4);
  assert.equal((html.match(/<li class="suite-step"/g) || []).length, 16);
  assert.doesNotMatch(html, /owner-A|uid=|email=|token=|session=|score=/);
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    const url = new URL(href.replaceAll('&amp;', '&'));
    assert(['https://blackboxlab.dev', 'https://www.cybertracelab.dev'].includes(url.origin));
    assert.deepEqual([...url.searchParams.keys()], url.hostname === 'blackboxlab.dev' ? ['view', 'track'] : ['case']);
  }
});

test('invalid practical values and unavailable tracks cannot masquerade as completed steps', () => {
  const state = practical('logs');
  state.completed['logs-0'] = 'not-a-date';
  assert.equal(suiteJourneyProgress(path, state, tracks).practicalDone, 0);
  const missing = suiteJourneyProgress(path, practical(), []);
  assert.equal(missing.done, 0);
  assert.equal(missing.unknown, 4);
  assert.throws(() => suiteJourneyProgress({ steps: [] }, state, tracks), /Unknown/);
});
