// Browser verification contract. The server remains the ONLY authority.
// No client-generated progress, XP, name or PDF can pass this validator.
export const CERTIFICATE_VERIFY_ENDPOINT = 'https://us-central1-black-box-lab.cloudfunctions.net/verifyIssuedCertificate';
export const CERTIFICATE_ID_PATTERN = /^[0-9a-f]{32}$/;

export function normalizedCertificateId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function verificationResult(httpStatus, data, requestedId) {
  if (!CERTIFICATE_ID_PATTERN.test(requestedId)) return { state: 'bad-id' };
  if (httpStatus === 404 && data?.valid === false && data?.status === 'not-found') {
    return { state: 'not-found' };
  }
  if (httpStatus !== 200 || !data || typeof data !== 'object' || Array.isArray(data) ||
      data.certificateId !== requestedId ||
      !['blackbox', 'cybertrace'].includes(data.issuer) ||
      typeof data.groupTitle !== 'string' || data.groupTitle.trim().length < 2 ||
      data.groupTitle.length > 120 ||
      !/^[a-z][a-z0-9-]{1,63}$/.test(data.groupId) ||
      typeof data.issuedAt !== 'string' || !Number.isFinite(Date.parse(data.issuedAt)) ||
      data.evidence !== 'server-assessed') return { state: 'unavailable' };
  if (data.status === 'verified' && data.valid === true) return { state: 'verified', certificate: data };
  if (data.status === 'revoked' && data.valid === false) return { state: 'revoked', certificate: data };
  return { state: 'unavailable' };
}

export async function checkIssuedCertificate(value, fetcher = fetch) {
  const id = normalizedCertificateId(value);
  if (!CERTIFICATE_ID_PATTERN.test(id)) return { state: 'bad-id' };
  try {
    const response = await fetcher(CERTIFICATE_VERIFY_ENDPOINT + '?id=' + encodeURIComponent(id), {
      method: 'GET', cache: 'no-store', mode: 'cors', credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    const body = await response.json();
    return verificationResult(response.status, body, id);
  } catch {
    // Network, CORS, disabled Firebase Function or non-JSON response:
    // do not classify as counterfeit or verified.
    return { state: 'unavailable' };
  }
}
