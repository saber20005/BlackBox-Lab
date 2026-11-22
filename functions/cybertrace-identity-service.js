import { createHash } from 'node:crypto';

// A two-account link must be based on two VERIFIED Firebase auth contexts,
// never matching email, name, native CyberTrace progress, or a caller UID.
const uidOK = uid => typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && !uid.includes('/');
export const cybertraceClaimId = uid => {
  if (!uidOK(uid)) throw Error('invalid-cybertrace-identity');
  return createHash('sha256').update('cybertrace-48ab0\0' + uid).digest('hex');
};
const ownerRef = uid => 'blackboxUsers/' + uid + '/identityLinks/cybertrace';
const claimRef = uid => 'cybertraceIdentityClaims/' + cybertraceClaimId(uid);
const same = (record, blackboxUid, cybertraceUid) =>
  record?.schemaVersion === 1 && record.blackboxUid === blackboxUid &&
  record.cybertraceUid === cybertraceUid && record.provider === 'cybertrace-48ab0' &&
  record.status === 'linked';

export function recentlyAuthenticated(blackboxClaims, cybertraceClaims, now = Date.now()) {
  if (!Number.isFinite(now)) return false;
  const nowSeconds = Math.floor(now / 1000);
  return [blackboxClaims, cybertraceClaims].every(claims => {
    const at = claims?.auth_time;
    return Number.isSafeInteger(at) && at > 0 && at <= nowSeconds + 60 &&
      nowSeconds - at <= 600;
  });
}

export async function linkCyberTraceIdentity(db, FieldValue, {
  blackboxUid, blackboxClaims, cybertraceClaims, consent, now = Date.now(),
}) {
  if (!uidOK(blackboxUid) || !uidOK(cybertraceClaims?.uid) ||
      cybertraceClaims.aud !== 'cybertrace-48ab0' || consent !== true) {
    throw Error('invalid-identity-link');
  }
  if (!recentlyAuthenticated(blackboxClaims, cybertraceClaims, now)) throw Error('recent-login-required');
  const cybertraceUid = cybertraceClaims.uid;
  return db.runTransaction(async tx => {
    const own = db.doc(ownerRef(blackboxUid)), claim = db.doc(claimRef(cybertraceUid));
    const [previous, claimed] = await Promise.all([tx.get(own), tx.get(claim)]);
    if (previous.exists || claimed.exists) {
      if (!previous.exists || !claimed.exists ||
          !same(previous.data(), blackboxUid, cybertraceUid) ||
          !same(claimed.data(), blackboxUid, cybertraceUid)) {
        throw Error('identity-already-linked');
      }
      return { linked: true, alreadyLinked: true };
    }
    const record = {
      schemaVersion: 1, provider: 'cybertrace-48ab0', status: 'linked',
      blackboxUid, cybertraceUid, linkedAt: FieldValue.serverTimestamp(),
    };
    tx.create(own, record);
    tx.create(claim, record);
    return { linked: true, alreadyLinked: false };
  });
}

export async function currentCyberTraceLink(db, blackboxUid) {
  if (!uidOK(blackboxUid)) throw Error('invalid-identity-link');
  const ref = db.doc(ownerRef(blackboxUid)), snap = await ref.get();
  const data = snap.exists ? snap.data() : null;
  if (!data || !same(data, blackboxUid, data.cybertraceUid)) return {linked:false};
  const claim = await db.doc(claimRef(data.cybertraceUid)).get();
  return { linked: Boolean(claim.exists && same(claim.data(),blackboxUid,data.cybertraceUid)) };
}

export async function unlinkCyberTraceIdentity(db, blackboxUid) {
  if (!uidOK(blackboxUid)) throw Error('invalid-identity-link');
  return db.runTransaction(async tx => {
    const own = db.doc(ownerRef(blackboxUid));
    const ownSnap = await tx.get(own);
    if (!ownSnap.exists) return {linked:false,changed:false};
    const old = ownSnap.data();
    if (!same(old,blackboxUid,old?.cybertraceUid)) throw Error('invalid-existing-link');
    const claim = db.doc(claimRef(old.cybertraceUid));
    const claimSnap = await tx.get(claim);
    if (!claimSnap.exists || !same(claimSnap.data(),blackboxUid,old.cybertraceUid)) throw Error('invalid-existing-link');
    tx.delete(own);
    tx.delete(claim);
    return {linked:false,changed:true};
  });
}
