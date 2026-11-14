import test from 'node:test';
import assert from 'node:assert/strict';
import { gradingAvailable, startVerifiedGrading } from '../verified-grading-client.js';
import { accountConfig } from '../account-config.js';

test('production grading remains disabled until owner enables App Check', () => {
  assert.equal(gradingAvailable(accountConfig), false);
  assert.equal(gradingAvailable({ enabled: true, grading: { enabled: true, appCheckSiteKey: '' } }), false);
  assert.equal(gradingAvailable({ enabled: true, grading: { enabled: true, appCheckSiteKey: 'test-key' } }), true);
});

test('invalid case ID is rejected before Firebase network initialization', async () => {
  await assert.rejects(startVerifiedGrading('INC-1', 'test-user'), /INC-0001/);
});

test('disabled grading never calls Firebase', async () => {
  await assert.rejects(startVerifiedGrading('INC-0001', 'test-user'), /غير مفعّل/);
});
