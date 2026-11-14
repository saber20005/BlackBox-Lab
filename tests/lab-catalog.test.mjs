import test from 'node:test';
import assert from 'node:assert/strict';
import { labs, validateLab, filterLabs } from '../lab-catalog.js';

test('catalog contains distinct valid manual isolated labs', () => {
  assert.ok(labs.length >= 2);
  assert.equal(new Set(labs.map(l => l.id)).size, labs.length);
  for (const lab of labs) assert.equal(validateLab(lab), true);
});
test('filter by category and difficulty', () => {
  assert.equal(filterLabs({ category: 'network' }).length, 1);
  assert.equal(filterLabs({ difficulty: 'advanced' }).length, 0);
});
test('rejects unsafe network and automated execution claims', () => {
  assert.throws(() => validateLab({ ...labs[0], network: 'bridged' }), /Unsupported/);
  assert.throws(() => validateLab({ ...labs[0], status: 'automated' }), /Unsupported/);
  assert.throws(() => validateLab({ ...labs[0], runtime: 'cloud' }), /Unsupported/);
});
