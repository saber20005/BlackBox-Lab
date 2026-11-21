import test from 'node:test';
import assert from 'node:assert/strict';
import { requireCertificateId, publicCertificateView, lookupPublicCertificate } from '../certificate-registry.js';

const ID = '0123456789abcdef0123456789abcdef';
const valid = (overrides = {}) => ({
  schemaVersion: 1, issuer: 'blackbox', groupId: 'network-foundations',
  groupTitle: 'الشبكات والاستطلاع', status: 'active',
  proofType: 'server-assessment', issuerAuthority: 'trusted-backend',
  issuedAt: new Date('2026-11-21T12:00:00Z'),
  uid: 'DO_NOT_LEAK_UID', email: 'private@example.test',
  privateEvidencePath: 'DO_NOT_LEAK_EVIDENCE',
  ...overrides,
});

test('certificate IDs are unguessable-format identifiers, not user IDs or case IDs', () => {
  assert.equal(requireCertificateId(ID), ID);
  for (const id of ['', 'INC-1201', 'recon-0', '../anything', 'a'.repeat(31), 'z'.repeat(32), 4]) {
    assert.throws(() => requireCertificateId(id), /invalid-certificate-id/);
  }
});

test('only trusted backend assessed records are publicly verified; no PII or private evidence leaks', () => {
  const result = publicCertificateView(ID, valid());
  assert.deepEqual(result, {
    certificateId: ID, issuer: 'blackbox', groupId: 'network-foundations',
    groupTitle: 'الشبكات والاستطلاع', status: 'verified', valid: true,
    evidence: 'server-assessed', issuedAt: '2026-11-21T12:00:00.000Z',
  });
  for (const text of ['DO_NOT_LEAK_UID', 'private@example.test', 'DO_NOT_LEAK_EVIDENCE']) {
    assert(!JSON.stringify(result).includes(text));
  }
  const cybertrace = publicCertificateView(ID, valid({ issuer: 'cybertrace', groupId: 'identity', groupTitle: 'الهوية والوصول' }));
  assert.equal(cybertrace.issuer, 'cybertrace');
});

test('self-reported legacy completions can never be verified by this registry', () => {
  for (const override of [
    { proofType: 'client-declared' },
    { proofType: 'server-assessment', issuerAuthority: 'browser' },
    { proofType: 'manually-confirmed' },
    { status: 'issued' },
    { groupId: '../users' },
    { issuedAt: '2026-11-21' },
    { schemaVersion: 2 },
    { groupTitle: '<script>alert(1)</script>' },
    { issuer: 'external-provider' },
  ]) {
    assert.equal(publicCertificateView(ID, valid(override)), null);
  }
});

test('revocations are not reported as valid and never cached in the public contract', () => {
  const revoked = publicCertificateView(ID, valid({ status: 'revoked' }));
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.valid, false);
});

test('a lookup only reads the exact private document, never writes or lists', async () => {
  const paths = [];
  const db = { doc(path) {
    paths.push(path);
    return { get: async () => ({ exists: true, data: () => valid() }) };
  }};
  const verified = await lookupPublicCertificate(db, ID);
  assert.equal(verified.valid, true);
  assert.deepEqual(paths, [`certificateRegistry/${ID}`]);
  await assert.rejects(() => lookupPublicCertificate(db, 'forged'), /invalid-certificate-id/);
  assert.equal(paths.length, 1);
  const empty = { doc() { return { get: async () => ({ exists: false }) }; } };
  assert.equal(await lookupPublicCertificate(empty, ID), null);
});
