// Server-only reviewed content inventory. This is not a usage report.
// The list is checked against the public root training catalogue in CI.
export const TRAINING_GROUPS = Object.freeze([
  { id: 'recon-network', label: 'الاستطلاع والشبكات', tracks: ['recon', 'nmap', 'network'] },
  { id: 'web-testing', label: 'تطبيقات الويب والاختبار', tracks: ['webgoat', 'proxy', 'metasploit'] },
  { id: 'defensive', label: 'التحليل والدفاع', tracks: ['logs', 'integrity', 'headers', 'email'] },
]);
const STAGES_PER_TRACK = 3;
export function buildBlackBoxTrainingOverview() {
  const ids = TRAINING_GROUPS.flatMap(group => group.tracks);
  const stageKeys = ids.flatMap(id => Array.from({ length: STAGES_PER_TRACK }, (_,i) => id+'-'+i));
  return {
    status: 'catalog_only',
    schemaVersion: 1,
    catalog: {
      source: 'reviewed-blackbox-training-contract',
      trackCount: ids.length,
      stageCount: stageKeys.length,
      groups: TRAINING_GROUPS.map(({id,label,tracks}) => ({id,label,tracks:tracks.length,stages:tracks.length*STAGES_PER_TRACK})),
      integrity: { uniqueTracks: new Set(ids).size===ids.length, uniqueStages: new Set(stageKeys).size===stageKeys.length },
    },
    metrics: null,
    availability: { userTotals: 'not_configured', labResults: 'not_verified', revenue: 'not_configured', auditEvents: 'not_configured' },
  };
}

// Independent privileged boundary. request.auth is established by Firebase
// callable auth, but is NOT enough for revocation or current role checks.
export async function requireBlackBoxAdmin(request, authProvider, expectedUid) {
  const uid=request?.auth?.uid;
  if (!uid || typeof uid!=='string' || uid!==expectedUid) throw Error('unauthenticated');
  const header=request?.rawRequest?.headers?.authorization;
  const jwt=/^Bearer ([A-Za-z0-9._-]{1,8192})$/.exec(header||'')?.[1];
  if (!jwt) throw Error('missing-id-token');
  const admin=await authProvider();
  // Never change checkRevoked=true. It also detects disabled Firebase users.
  const claims=await admin.verifyIdToken(jwt,true);
  if (claims?.uid!==uid || claims.admin!==true) throw Error('not-admin');
  const record=await admin.getUser(uid);
  if (!record || record.uid!==uid || record.disabled || record.customClaims?.admin!==true) {
    throw Error('role-not-current');
  }
  return uid;
}
