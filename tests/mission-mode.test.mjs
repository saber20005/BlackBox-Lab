import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, missionStatus, skillDNA } from '../mission-mode.js';
import { tracks } from '../data.js';

test('every mission references a known stage', () => {
  for (const mission of MISSIONS) {
    const status = missionStatus(mission, {});
    assert.equal(status.total, mission.steps.length);
    assert.equal(status.completed, 0);
    assert.equal(status.finished, false);
    for (const step of status.steps) assert.match(step.href, /^\.\/\?track=/);
  }
});

test('mission progress is derived, never grants completion', () => {
  const mission = MISSIONS[0];
  const first = mission.steps[0];
  const key = first.trackId + '-' + first.stageIndex;
  const progress = { completed: { [key]: new Date().toISOString() }, notes: { [key]: 'lab note' } };
  const status = missionStatus(mission, progress);
  assert.equal(status.completed, 1);
  assert.equal(status.steps[0].documented, true);
  assert.equal(status.finished, false);
  assert.equal(Object.keys(progress.completed).length, 1);
});

test('skill DNA does not treat notes alone as completed stages', () => {
  const track = tracks[0];
  const key = track.id + '-0';
  const result = skillDNA({ notes: { [key]: 'draft' }, completed: {} }).find(item => item.id === track.id);
  assert.equal(result.completed, 0);
  assert.equal(result.documented, 0);
  assert.equal(result.percent, 0);
});
