import test from 'node:test';
import assert from 'node:assert/strict';
import { portfolioEntries, buildPortfolio, PORTFOLIO_SOURCE_LABELS } from '../portfolio.js';
import { createInitialState } from '../progress.js';
import { tracks } from '../data.js';

const stamp = '2026-11-19T12:00:00.000Z';
function fixture() {
  const state = createInitialState();
  state.completed['recon-0'] = stamp;
  state.completed['network-1'] = stamp;
  state.checks['recon-0'] = [0, 1];
  state.notes['recon-0'] = 'PRIVATE_SELECTED_NOTE';
  state.results['recon-0'] = 'PRIVATE_SELECTED_RESULT';
  state.notes['network-1'] = 'PRIVATE_UNSELECTED_NOTE';
  state.results['network-1'] = 'PRIVATE_UNSELECTED_RESULT';
  state.notes['webgoat-0'] = 'PRIVATE_INCOMPLETE_NOTE';
  state.checks['webgoat-0'] = [0, 1, 2];
  state.email = 'private-account@example.test';
  state.uid = 'PRIVATE_ACCOUNT_UID';
  state.logs = [{ at: stamp, msg: 'PRIVATE_ACTIVITY_LOG' }];
  state.devices.kali = 'on';
  state.lastActivity = { trackId: 'webgoat', stageIndex: 0, at: stamp };
  return state;
}

test('portfolio entries contain metadata for known completed stages only', () => {
  const entries = portfolioEntries(fixture());
  assert.deepEqual(entries.map(entry => entry.key), ['recon-0', 'network-1']);
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['key', 'trackName', 'title', 'goal', 'completedAt', 'checkedCount', 'checkCount'].sort());
    assert.equal(entry.completedAt, stamp);
  }
  assert.equal(entries[0].title, tracks.find(track => track.id === 'recon').stages[0].name);
  assert.equal(entries[0].checkedCount, 2);
  assert.equal(entries[0].checkCount, 3);
  assert.doesNotMatch(JSON.stringify(entries), /PRIVATE_|private-account|notes|results|devices|logs/);
});

test('a portfolio starts with no selected stages and no private documentation', () => {
  const state = fixture();
  const report = buildPortfolio(state);
  assert.deepEqual(report.entries, []);
  assert.deepEqual(Object.keys(report).sort(), ['sourceLabel', 'disclaimer', 'entries'].sort());
  assert.match(report.disclaimer, /تأكيد يدوي/);
  assert.match(report.disclaimer, /ليس شهادة/);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|private-account|"notes"|"results"|"uid"|"email"|"logs"|"devices"|lastActivity/);
});

test('selecting a completed stage excludes notes and results by default', () => {
  const report = buildPortfolio(fixture(), { selectedKeys: ['recon-0'] });
  assert.equal(report.entries.length, 1);
  assert.equal(Object.hasOwn(report.entries[0], 'notes'), false);
  assert.equal(Object.hasOwn(report.entries[0], 'results'), false);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|private-account/);
});

test('unknown, duplicate, incomplete, and invalid selections never create completion', () => {
  const state = fixture();
  state.completed['unknown-track-0'] = stamp;
  state.completed['recon-1'] = 'invalid timestamp';
  state.completed['recon-2'] = true;
  const report = buildPortfolio(state, { selectedKeys: ['unknown-track-0', 'webgoat-0', 'recon-0', 'recon-0', 'recon-1', 'recon-2', '__proto__', null, {}], includeNotes: true, includeResults: true });
  assert.deepEqual(report.entries.map(entry => entry.key), ['recon-0']);
  assert.equal(state.completed['recon-1'], 'invalid timestamp');
  assert.equal(Object.hasOwn(state.completed, 'webgoat-0'), false);
  assert.deepEqual(buildPortfolio(state, { selectedKeys: 'recon-0' }).entries, []);
});

test('documentation opt-ins are independent and apply only to selected stages', () => {
  const state = fixture();
  const notes = buildPortfolio(state, { selectedKeys: ['recon-0'], includeNotes: true });
  assert.equal(notes.entries[0].notes, state.notes['recon-0']);
  assert.equal(Object.hasOwn(notes.entries[0], 'results'), false);
  assert.doesNotMatch(JSON.stringify(notes), /PRIVATE_UNSELECTED|PRIVATE_INCOMPLETE|PRIVATE_SELECTED_RESULT/);
  const results = buildPortfolio(state, { selectedKeys: ['recon-0'], includeResults: true });
  assert.equal(results.entries[0].results, state.results['recon-0']);
  assert.equal(Object.hasOwn(results.entries[0], 'notes'), false);
  assert.doesNotMatch(JSON.stringify(results), /PRIVATE_UNSELECTED|PRIVATE_INCOMPLETE|PRIVATE_SELECTED_NOTE/);
  const neither = buildPortfolio(state, { selectedKeys: ['recon-0'], includeNotes: 'true', includeResults: 1 });
  assert.equal(Object.hasOwn(neither.entries[0], 'notes'), false);
  assert.equal(Object.hasOwn(neither.entries[0], 'results'), false);
});

test('opted-in literal text and long documentation are preserved completely without mutating progress', () => {
  const state = fixture();
  state.notes['recon-0'] = '<img src=x onerror=alert(1)>\n& literal text ' + 'تفاصيل كاملة '.repeat(12000);
  state.results['recon-0'] = 'line one\r\nline two\n<script>literal content</script>';
  const original = JSON.stringify(state);
  const report = buildPortfolio(state, { selectedKeys: ['recon-0'], includeNotes: true, includeResults: true });
  assert.equal(report.entries[0].notes, state.notes['recon-0']);
  assert.equal(report.entries[0].results, state.results['recon-0']);
  assert.equal(JSON.stringify(state), original);
  report.entries[0].title = 'changed outside';
  assert.equal(JSON.stringify(state), original);
});

test('report source descriptions are fixed labels and cannot inject account identity', () => {
  const state = fixture();
  for (const sourceLabel of Object.values(PORTFOLIO_SOURCE_LABELS)) {
    const report = buildPortfolio(state, { selectedKeys: ['recon-0'], sourceLabel });
    assert.equal(report.sourceLabel, sourceLabel);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|private-account|"uid"|"email"/);
  }
  for (const sourceLabel of [state.email, state.uid, { uid: state.uid }, 'حساب ' + state.email]) {
    assert.equal(buildPortfolio(state, { sourceLabel }).sourceLabel, PORTFOLIO_SOURCE_LABELS.unknown);
  }
});

test('check counts and completion dates come from valid known progress', () => {
  const state = fixture();
  state.checks['recon-0'] = [0, 0, 2, 100, -1, '1'];
  assert.equal(portfolioEntries(state)[0].checkedCount, 2);
  assert.deepEqual(portfolioEntries({ completed: { 'recon-0': false }, notes: { 'recon-0': 'draft' } }), []);
  assert.deepEqual(portfolioEntries(null), []);
});
