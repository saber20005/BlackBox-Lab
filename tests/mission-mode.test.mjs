import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, missionStatus, skillDNA } from '../mission-mode.js';
import { tracks } from '../data.js';
import { DOCUMENTATION_TEMPLATES } from '../assets/modules/training/documentation-templates.js';

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

test('untouched documentation templates do not count as mission or skill evidence', () => {
  const progress = {
    completed: { 'recon-0': '2026-11-19T09:00:00.000Z' },
    notes: { 'recon-0': DOCUMENTATION_TEMPLATES.notes.text },
    results: { 'recon-0': DOCUMENTATION_TEMPLATES.result.text },
  };
  assert.equal(missionStatus(MISSIONS[0], progress).steps[0].documented, false);
  assert.equal(skillDNA(progress).find(skill => skill.id === 'recon').documented, 0);
  progress.results['recon-0'] += '\nChecked the local lab scope.';
  assert.equal(missionStatus(MISSIONS[0], progress).steps[0].documented, true);
  assert.equal(skillDNA(progress).find(skill => skill.id === 'recon').documented, 1);
});

test('locked mission stages link to the track until the preceding stage is complete', () => {
  const mission = MISSIONS[0];
  const locked = missionStatus(mission, {}).steps.find(step => step.stageIndex === 1);
  assert.equal(locked.available, false);
  assert.equal(new URL(locked.href, 'https://blackboxlab.dev').searchParams.has('stage'), false);
  const progress = { completed: { [`${locked.trackId}-0`]: '2026-11-19T09:00:00.000Z' } };
  const open = missionStatus(mission, progress).steps.find(step => step.stageIndex === 1);
  assert.equal(open.available, true);
  assert.equal(new URL(open.href, 'https://blackboxlab.dev').searchParams.get('stage'), '1');
});
