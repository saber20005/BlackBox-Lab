import test from 'node:test';
import assert from 'node:assert/strict';
import { tracks } from '../data.js';
import { createInitialState } from '../progress.js';
import { buildTrainingPlan, investigationURL } from '../training-plan.js';
import { trainingPlanPage } from '../training-plan-ui.js';

const timestamp = '2026-11-12T10:00:00.000Z';
const receipt = { schemaVersion: 1, source: 'cybertrace', caseId: 'INC-1101', bestScore: 50, firstSyncedAt: timestamp, updatedAt: timestamp };
const linked = { userUid: 'current', ownerUid: 'current', accountPhase: 'signed-in', state: { enabled: true, phase: 'ready', receipts: { 'INC-1101': receipt } } };

test('fresh guest gets a bounded plan from available stages, without changing progress', () => {
  const state = createInitialState();
  const before = JSON.stringify(state);
  const plan = buildTrainingPlan(state);
  assert.equal(plan.tasks[0].trackId, 'recon');
  assert.equal(plan.tasks.length, 2);
  assert.equal(plan.estimatedMinutes, 30);
  assert(plan.tasks.every(task => task.stageIndex === 0));
  assert.equal(buildTrainingPlan(state, { budget: 15 }).tasks.length, 1);
  assert.equal(buildTrainingPlan(state, { budget: 60 }).tasks.length, 3);
  assert.equal(JSON.stringify(state), before);
});

test('unfinished draft and current stage take priority over linked follow-up', () => {
  const state = createInitialState();
  state.notes['network-0'] = 'ملاحظة قيد العمل';
  state.lastActivity = { trackId: 'nmap', stageIndex: 0, at: timestamp };
  const plan = buildTrainingPlan(state, { budget: 60, linked });
  assert.deepEqual(plan.tasks.map(task => task.trackId), ['network', 'nmap', 'webgoat']);
  assert(plan.tasks[0].reason.includes('بدأت بها'));
  assert.equal(plan.tasks[2].linkedCaseId, 'INC-1101');
});

test('only ready receipts for the current owner influence the plan', () => {
  const state = createInitialState();
  assert.equal(buildTrainingPlan(state, { linked }).tasks[0].trackId, 'webgoat');
  for (const invalid of [
    { ...linked, userUid: null }, { ...linked, ownerUid: 'previous' },
    { ...linked, accountPhase: 'loading' },
    { ...linked, state: { ...linked.state, phase: 'loading' } },
    { ...linked, state: { ...linked.state, phase: 'error' } },
    { ...linked, state: { ...linked.state, enabled: false } },
    { ...linked, state: { ...linked.state, receipts: { 'INC-1101': { ...receipt, bestScore: 999 } } } },
  ]) {
    const plan = buildTrainingPlan(state, { linked: invalid });
    assert.equal(plan.tasks[0].trackId, 'recon');
    assert.equal(plan.linkedUsed, false);
    assert(plan.tasks.every(task => task.linkedCaseId === null));
  }
});

test('receipt-first account loading becomes a linked plan after the same owner is ready', () => {
  const state = createInitialState();
  const receiptBeforeProgress = { ...linked, accountPhase: 'loading' };
  const loading = trainingPlanPage(state, { linked: receiptBeforeProgress });
  assert(loading.includes('data-plan-track="recon"'));
  assert(!loading.includes('المسجّل في حسابك'));
  // The ready receipt snapshot does not need to change for this transition.
  const ready = trainingPlanPage(state, { linked: { ...receiptBeforeProgress, accountPhase: 'signed-in' } });
  assert(ready.includes('data-plan-track="webgoat"'));
  assert(ready.includes('المسجّل في حسابك'));
});

test('next stages respect locks, skip completion, and label a shorter time budget', () => {
  const state = createInitialState();
  state.completed['network-0'] = timestamp;
  state.lastActivity = { trackId: 'network', stageIndex: 2, at: timestamp };
  state.notes['network-2'] = 'لا تفتح هذه المرحلة بعد';
  let plan = buildTrainingPlan(state, { focus: 'network', budget: 15 });
  assert.equal(plan.tasks[0].trackId, 'network');
  assert.equal(plan.tasks[0].stageIndex, 1);
  assert.equal(plan.overBudget, true);
  state.completed['network-1'] = timestamp;
  plan = buildTrainingPlan(state, { focus: 'network', budget: 30 });
  assert.equal(plan.tasks[0].stageIndex, 2);
  assert.equal(new Set(plan.tasks.map(task => task.trackId)).size, plan.tasks.length);
});

test('focus constrains recommendations and completed work yields review actions', () => {
  const state = createInitialState();
  assert(buildTrainingPlan(state, { focus: 'web' }).tasks.every(task => ['webgoat', 'proxy'].includes(task.trackId)));
  for (const track of tracks) track.stages.forEach((_, index) => { state.completed[`${track.id}-${index}`] = timestamp; });
  assert.equal(buildTrainingPlan(state).tasks.length, 0);
  assert.equal(buildTrainingPlan(state).allComplete, true);
  const html = trainingPlanPage(state);
  assert(html.includes('data-nav="journal"'));
  assert(html.includes('data-report'));
  assert(!html.includes('data-open='));
});

test('malformed input falls back safely and public links use only known cases', () => {
  for (const value of [null, undefined, [], 9, { completed: { 'recon-0': 'bad-date' }, notes: [] }]) {
    const plan = buildTrainingPlan(value, { focus: 'unknown', budget: -1, linked: {} });
    assert.equal(plan.focus, 'all');
    assert.equal(plan.budget, 30);
    assert.equal(plan.tasks[0].stageIndex, 0);
    assert.equal(plan.tasks[0].trackId, 'recon');
  }
  assert.equal(investigationURL('javascript:alert(1)'), null);
  const url = new URL(investigationURL('INC-1101'));
  assert.equal(url.origin, 'https://cybertracelab.dev');
  assert.equal(url.searchParams.get('case'), 'INC-1101');
  assert(!url.href.includes('current'));
});

test('planner UI provides explicit available-stage actions and labels estimates', () => {
  const html = trainingPlanPage(createInitialState(), { linked });
  assert(html.includes('id="planFocus"'));
  assert(html.includes('id="planBudget"'));
  assert(html.includes('data-open="webgoat" data-stage="0"'));
  assert(html.includes('الوقت تقديري'));
  assert(html.includes('التخطيط وحده لا يضيف إنجازًا أو نقاطًا'));
  assert(!html.includes('data-check'));
  assert(!html.includes('current'));
});
