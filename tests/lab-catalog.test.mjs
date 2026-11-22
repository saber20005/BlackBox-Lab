import test from 'node:test';
import assert from 'node:assert/strict';
import { labs, validateLab, filterLabs, labStartURL } from '../assets/modules/training/lab-catalog.js';
import { tracks } from '../data.js';
import { parseRoute } from '../routes.js';

test('catalog contains distinct valid manual isolated labs', () => {
  assert.ok(labs.length >= 2);
  assert.equal(new Set(labs.map(l => l.id)).size, labs.length);
  for (const lab of labs) assert.equal(validateLab(lab), true);
});
test('filter by category and difficulty', () => {
  assert.equal(filterLabs({ category: 'network' }).length, 2);
  assert.equal(filterLabs({ difficulty: 'advanced' }).length, 0);
});
test('rejects unsafe network and automated execution claims', () => {
  assert.throws(() => validateLab({ ...labs[0], network: 'bridged' }), /Unsupported/);
  assert.throws(() => validateLab({ ...labs[0], status: 'automated' }), /Unsupported/);
  assert.throws(() => validateLab({ ...labs[0], runtime: 'cloud' }), /Unsupported/);
});
test('each catalog entry starts a real unlocked first-stage route without private URL fields', () => {
  for (const lab of labs) {
    assert(tracks.some(track => track.id === lab.trackId));
    const url = new URL(labStartURL(lab), 'https://blackboxlab.dev/labs.html');
    assert.equal(url.origin, 'https://blackboxlab.dev');
    assert.deepEqual([...url.searchParams.keys()], ['track', 'stage']);
    const route = parseRoute(url);
    assert.equal(route.view, 'exercise');
    assert.equal(route.trackId, lab.trackId);
    assert.equal(route.stageIndex, 0);
  }
});
test('start links reject malformed track targets', () => {
  for (const trackId of ['javascript:alert(1)', '../admin', '', 'network&uid=other']) {
    assert.throws(() => labStartURL({ ...labs[0], trackId }), /Invalid training track/);
  }
});
