import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createInitialState } from '../progress.js';
import { CASE_IDS } from '../cybertrace-catalog.js';

// No production requests or accounts are used by this suite. Without an
// explicit emulator address it skips instead of falling back to live Firebase.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  test('Firestore security rules require an explicitly running local emulator', { skip: true }, () => {});
} else {
  const dependencyRoot = process.env.BLACKBOX_FIREBASE_TEST_DEPS;
  const require = dependencyRoot
    ? createRequire(`${dependencyRoot.replace(/\/$/, '')}/package.json`)
    : createRequire(import.meta.url);
  const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
  const { doc, collection, collectionGroup, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } = require('firebase/firestore');
  let environment;
  const path = uid => `blackboxUsers/${uid}/state/progress`;
  const snapshot = (revision = 1, progress = createInitialState()) => ({
    schemaVersion: 1, revision, progress, updatedAt: serverTimestamp(),
  });
  const receiptPath = (uid, caseId = CASE_IDS[0]) => `blackboxUsers/${uid}/cybertrace/${caseId}`;
  const receipt = (caseId = CASE_IDS[0], bestScore = 40) => ({
    schemaVersion: 1, source: 'cybertrace', caseId, bestScore,
    firstSyncedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });

  before(async () => {
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
    assert(['localhost', '127.0.0.1', '::1'].includes(host), 'Rule tests must target localhost only');
    environment = await initializeTestEnvironment({
      projectId: 'demo-blackbox-account-tests',
      firestore: { host, port: Number(port), rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
    });
  });
  beforeEach(async () => environment.clearFirestore());
  after(async () => environment?.cleanup());

  test('unauthenticated visitors cannot read or write account progress', async () => {
    const guest = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(guest, path('alice'))));
    await assertFails(setDoc(doc(guest, path('alice')), snapshot()));
  });

  test('an owner can create, read and advance exactly one revision at a time', async () => {
    const alice = environment.authenticatedContext('alice').firestore();
    const reference = doc(alice, path('alice'));
    await assertSucceeds(setDoc(reference, snapshot()));
    const stored = await assertSucceeds(getDoc(reference));
    assert.equal(stored.data().revision, 1);
    const progress = createInitialState();
    progress.notes['recon-0'] = 'ملاحظة خاصة بحساب أليس';
    await assertSucceeds(setDoc(reference, snapshot(2, progress)));
    assert.equal((await getDoc(reference)).data().progress.notes['recon-0'], progress.notes['recon-0']);
    await assertFails(setDoc(reference, snapshot(2, progress)));
    await assertFails(setDoc(reference, snapshot(4, progress)));
  });

  test('another signed-in user cannot read, overwrite or delete the owner document', async () => {
    const alice = environment.authenticatedContext('alice').firestore();
    await setDoc(doc(alice, path('alice')), snapshot());
    const bob = environment.authenticatedContext('bob').firestore();
    const aliceFromBob = doc(bob, path('alice'));
    await assertFails(getDoc(aliceFromBob));
    await assertFails(setDoc(aliceFromBob, snapshot(2)));
    await assertFails(updateDoc(aliceFromBob, { revision: 2, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(aliceFromBob));
    await assertSucceeds(setDoc(doc(bob, path('bob')), snapshot()));
  });

  test('collection listing and unrelated paths remain denied even for an owner', async () => {
    const alice = environment.authenticatedContext('alice').firestore();
    await setDoc(doc(alice, path('alice')), snapshot());
    await assertFails(getDocs(collection(alice, 'blackboxUsers')));
    await assertFails(getDocs(collection(alice, 'blackboxUsers/alice/state')));
    await assertFails(setDoc(doc(alice, 'blackboxUsers/alice/state/other'), snapshot()));
    await assertFails(setDoc(doc(alice, 'otherCollection/alice'), snapshot()));
    await assertFails(deleteDoc(doc(alice, path('alice'))));
  });

  test('wrong versions, unknown fields, client timestamps and invalid revisions are denied', async () => {
    const alice = environment.authenticatedContext('alice').firestore();
    const reference = doc(alice, path('alice'));
    for (const value of [
      { ...snapshot(), schemaVersion: 2 },
      { ...snapshot(), extra: true },
      { ...snapshot(), revision: 0 },
      { ...snapshot(), revision: 2 },
      { ...snapshot(), revision: 1.5 },
      { ...snapshot(), updatedAt: Timestamp.fromMillis(0) },
    ]) await assertFails(setDoc(reference, value));
  });

  test('invalid progress map shape, unknown stage keys and excessive logs are denied', async () => {
    const alice = environment.authenticatedContext('alice').firestore();
    const reference = doc(alice, path('alice'));
    const candidates = [];
    for (const field of ['checks', 'notes', 'results', 'completed', 'stageUpdatedAt']) {
      candidates.push({ ...createInitialState(), [field]: [] });
      candidates.push({ ...createInitialState(), [field]: { 'unknown-0': 'unexpected' } });
    }
    candidates.push({ ...createInitialState(), extra: true });
    candidates.push({ ...createInitialState(), devices: { kali: 'on', windows: 'on', target: 'on', network: 'public' } });
    candidates.push({ ...createInitialState(), logs: Array.from({ length: 101 }, () => ({ msg: 'x', at: '2026-11-09T00:00:00Z' })) });
    candidates.push({ ...createInitialState(), lastActivity: { trackId: 'recon', stageIndex: 9, at: '2026-11-09T00:00:00Z' } });
    for (const progress of candidates) await assertFails(setDoc(reference, snapshot(1, progress)));
  });

  test('an owner can create and list receipts for every case in the shared catalogue', async () => {
    const alice = environment.authenticatedContext('alice').firestore();
    for (const caseId of CASE_IDS) {
      const reference = doc(alice, receiptPath('alice', caseId));
      await assertSucceeds(setDoc(reference, receipt(caseId)));
      const saved = await assertSucceeds(getDoc(reference));
      assert.equal(saved.data().caseId, caseId);
      assert.equal(saved.data().source, 'cybertrace');
      assert(saved.data().firstSyncedAt instanceof Timestamp);
      assert(saved.data().updatedAt instanceof Timestamp);
    }
    const list = await assertSucceeds(getDocs(collection(alice, 'blackboxUsers/alice/cybertrace')));
    assert.deepEqual(list.docs.map(item => item.id).sort(), [...CASE_IDS].sort());
  });

  test('visitors and another UID cannot read, list or write receipt data', async () => {
    const alice = environment.authenticatedContext('alice').firestore();
    await setDoc(doc(alice, receiptPath('alice')), receipt());
    for (const viewer of [environment.unauthenticatedContext().firestore(), environment.authenticatedContext('bob').firestore()]) {
      const reference = doc(viewer, receiptPath('alice'));
      await assertFails(getDoc(reference));
      await assertFails(getDocs(collection(viewer, 'blackboxUsers/alice/cybertrace')));
      await assertFails(setDoc(reference, receipt(CASE_IDS[0], 50)));
      await assertFails(setDoc(doc(viewer, receiptPath('alice', CASE_IDS[1])), receipt(CASE_IDS[1])));
      await assertFails(updateDoc(reference, { bestScore: 70, updatedAt: serverTimestamp() }));
      await assertFails(deleteDoc(reference));
    }
    const bob = environment.authenticatedContext('bob').firestore();
    await assertSucceeds(setDoc(doc(bob, receiptPath('bob')), receipt()));
    await assertSucceeds(getDocs(collection(bob, 'blackboxUsers/bob/cybertrace')));
    await assertFails(getDocs(collectionGroup(alice, 'cybertrace')));
    await assertFails(getDocs(collection(alice, 'blackboxUsers')));
  });

  test('a receipt only accepts a strictly improved score and preserves its first sync time', async () => {
    const alice = environment.authenticatedContext('alice').firestore();
    const reference = doc(alice, receiptPath('alice'));
    await setDoc(reference, receipt(CASE_IDS[0], 20));
    const firstSyncedAt = (await getDoc(reference)).data().firstSyncedAt;
    await assertSucceeds(updateDoc(reference, { bestScore: 50, updatedAt: serverTimestamp() }));
    assert.equal((await getDoc(reference)).data().firstSyncedAt.toMillis(), firstSyncedAt.toMillis());
    for (const bestScore of [50, 20, 0]) {
      await assertFails(updateDoc(reference, { bestScore, updatedAt: serverTimestamp() }));
    }
    await assertFails(updateDoc(reference, { bestScore: 60, firstSyncedAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(reference, { bestScore: 60, firstSyncedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(reference, { bestScore: 70, updatedAt: serverTimestamp() }));
    assert.equal((await getDoc(reference)).data().bestScore, 70);
    await assertFails(deleteDoc(reference));
  });

  test('unknown cases, forged envelopes, unbounded scores and client timestamps are denied', async () => {
    const alice = environment.authenticatedContext('alice').firestore();
    const reference = doc(alice, receiptPath('alice'));
    const missingField = receipt();
    delete missingField.firstSyncedAt;
    const candidates = [
      { ...receipt(), schemaVersion: 2 },
      { ...receipt(), source: 'other-site' },
      { ...receipt(), caseId: CASE_IDS[1] },
      { ...receipt(), bestScore: -1 },
      { ...receipt(), bestScore: 71 },
      { ...receipt(), bestScore: 40.5 },
      { ...receipt(), bestScore: '70' },
      { ...receipt(), bestScore: Number.NaN },
      { ...receipt(), firstSyncedAt: Timestamp.fromMillis(0) },
      { ...receipt(), updatedAt: Timestamp.fromMillis(0) },
      { ...receipt(), unexpected: true },
      missingField,
    ];
    for (const value of candidates) await assertFails(setDoc(reference, value));
    await assertFails(setDoc(doc(alice, receiptPath('alice', 'INC-9999')), receipt('INC-9999')));
    await setDoc(reference, receipt());
    for (const value of [
      { source: 'other-site' }, { schemaVersion: 2 }, { caseId: CASE_IDS[1] },
      { bestScore: 71 }, { updatedAt: Timestamp.fromMillis(0) }, { unexpected: true },
    ]) await assertFails(updateDoc(reference, { bestScore: 50, updatedAt: serverTimestamp(), ...value }));
  });

  test('receipt credits cannot mutate or complete practical training progress', async () => {
    const alice = environment.authenticatedContext('alice').firestore();
    const practical = createInitialState();
    practical.notes['recon-0'] = 'العمل العملي مستقل عن تحقيقات CyberTrace';
    const reference = doc(alice, path('alice'));
    await setDoc(reference, snapshot(1, practical));
    await setDoc(doc(alice, receiptPath('alice')), receipt(CASE_IDS[0], 70));
    const afterCredit = (await getDoc(reference)).data();
    assert.equal(afterCredit.revision, 1);
    assert.deepEqual(afterCredit.progress, practical);
    const progress = { ...practical, notes: { ...practical.notes, 'recon-0': 'تعديل عملي بعد المزامنة' } };
    await assertSucceeds(setDoc(reference, snapshot(2, progress)));
    assert.equal((await getDoc(doc(alice, receiptPath('alice')))).data().bestScore, 70);
    await assertFails(setDoc(doc(alice, 'blackboxUsers/alice/integrations/cybertrace'), receipt()));
  });
}
