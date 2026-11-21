// Public verification is strictly a read-only view of a server-controlled registry.
// IMPORTANT: no browser completion, imported legacy receipt, XP or user-entered name
// is sufficient evidence of passing a server-graded assessment.
export const CERTIFICATE_ID_PATTERN = /^[0-9a-f]{32}$/;
export const CERTIFICATE_ISSUERS = new Set(['blackbox', 'cybertrace']);
const safeText = (value, max) => typeof value === 'string' &&
  value.trim().length >= 2 && value.trim().length <= max &&
  !/[<>\u0000-\u001f\u007f]/.test(value);

export function requireCertificateId(value) {
  if (typeof value !== 'string' || !CERTIFICATE_ID_PATTERN.test(value)) {
    throw new Error('invalid-certificate-id');
  }
  return value;
}

function validTimestamp(value) {
  const date = value instanceof Date ? value : value?.toDate?.();
  return date instanceof Date && Number.isFinite(date.getTime()) && date.getTime() > 0
    ? date.toISOString() : null;
}

// Whitelist the *only* information allowed to leave the server. No UID, email,
// rubric identifiers, private evidence, training notes or other Firestore fields.
export function publicCertificateView(id, record) {
  requireCertificateId(id);
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      record.schemaVersion !== 1 || !CERTIFICATE_ISSUERS.has(record.issuer) ||
      !safeText(record.groupTitle, 120) ||
      typeof record.groupId !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(record.groupId) ||
      !['active', 'revoked'].includes(record.status) ||
      record.proofType !== 'server-assessment' ||
      record.issuerAuthority !== 'trusted-backend') return null;
  const issuedAt = validTimestamp(record.issuedAt);
  if (!issuedAt) return null;
  return {
    certificateId: id,
    issuer: record.issuer,
    groupId: record.groupId,
    groupTitle: record.groupTitle.trim(),
    status: record.status === 'active' ? 'verified' : 'revoked',
    valid: record.status === 'active',
    evidence: 'server-assessed',
    issuedAt,
  };
}

// Read-only; authorization is in the production Firestore rules and service
// account IAM. This function NEVER creates or alters a certificate.
export async function lookupPublicCertificate(db, id) {
  requireCertificateId(id);
  const snapshot = await db.doc(`certificateRegistry/${id}`).get();
  if (!snapshot.exists) return null;
  return publicCertificateView(id, snapshot.data());
}
