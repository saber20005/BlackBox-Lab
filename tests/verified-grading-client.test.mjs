import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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


test('Firebase App Check client uses Enterprise provider and never classic v3', async () => {
  const source = await readFile(new URL('../verified-grading-client.js', import.meta.url), 'utf8');
  assert.match(source, /new appCheckSDK\.ReCaptchaEnterpriseProvider\(/);
  assert.doesNotMatch(source, /ReCaptchaV3Provider/);
});

test('Enterprise site key is configured but production grading remains gated', () => {
  assert.match(accountConfig.grading.appCheckSiteKey, /^6L/);
  assert.equal(accountConfig.grading.enabled, false);
  assert.equal(gradingAvailable(), false);
});
