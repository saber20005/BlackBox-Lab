// TEMPORARY BRANCH-PROTECTION NEGATIVE TEST — DO NOT MERGE.
// This file exists exclusively to prove a required CI check blocks a PR.
// This branch must be cleaned up after evidence is collected.
import test from 'node:test';
import assert from 'node:assert/strict';

test('branch-protection sentinel: intentionally fail required CI gate', () => {
  assert.fail('EXPECTED FAILURE: negative test for required GitHub status checks');
});
