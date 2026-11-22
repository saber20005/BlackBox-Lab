import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CERTIFICATE_ID_PATTERN, normalizedCertificateId, verificationResult, checkIssuedCertificate } from '../certificate-verify-core.js';

const id = '0123456789abcdef0123456789abcdef';
const payload = { certificateId: id, issuer: 'blackbox', groupId: 'network-foundations',
  groupTitle: 'الشبكات والاستطلاع', issuedAt: '2026-11-21T12:00:00.000Z',
  evidence: 'server-assessed', status: 'verified', valid: true };

test('check only random-looking IDs and use a no-cache public read', async () => {
  assert(CERTIFICATE_ID_PATTERN.test(id));
  assert.equal(normalizedCertificateId(' ' + id + ' '), id);
  assert.deepEqual(await checkIssuedCertificate('INC-0417', () => { throw new Error('should not call'); }), { state: 'bad-id' });
  let url;
  const result = await checkIssuedCertificate(id, async (input, opts) => {
    url = input;
    assert.equal(opts.method, 'GET');
    assert.equal(opts.cache, 'no-store');
    assert.equal(opts.credentials, 'omit');
    return { status: 200, json: async () => payload };
  });
  assert.equal(result.state, 'verified');
  assert(url.endsWith('?id=' + id));
});

test('fail closed on unavailable, malformed, tampered or mismatched server responses', async () => {
  for (const data of [
    { ...payload, certificateId: 'f'.repeat(32) },
    { ...payload, issuer: 'other' },
    { ...payload, groupId: '../escape' },
    { ...payload, evidence: 'browser-completion' },
    { ...payload, valid: false },
  ]) assert.equal(verificationResult(200, data, id).state, 'unavailable');
  assert.equal(verificationResult(404, { status: 'not-found', valid: false }, id).state, 'not-found');
  assert.equal(verificationResult(200, { ...payload, status: 'revoked', valid: false }, id).state, 'revoked');
  assert.equal((await checkIssuedCertificate(id, async () => { throw new Error('offline'); })).state, 'unavailable');
});

test('public page does not print receipts, infer completion, or leak identity', () => {
  const html = readFileSync(new URL('../verify.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../certificate-verify-page.js', import.meta.url), 'utf8');
  assert(html.includes('noindex,nofollow'));
  assert(html.includes('إفادات الإتمام التعليمية القديمة غير موثّقة'));
  assert(js.includes('textContent'));
  assert(!js.includes('innerHTML'));
  assert(!html.includes('QR'));
});
