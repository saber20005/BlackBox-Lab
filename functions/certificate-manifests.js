// Immutable, reviewed issuance catalogue. Browser catalogues and historical
// training progress are NOT a credential authority. A version change requires
// a separate code review and policy migration.
const cybertrace = [
  ['identity', 'الهوية والوصول', ['INC-0417','INC-0812','INC-1002','INC-1102','INC-1201','INC-1207']],
  ['email', 'أمن البريد', ['INC-0512','INC-1202','INC-1208']],
  ['malware', 'البرمجيات الخبيثة', ['INC-0633','INC-1103','INC-1209']],
  ['web', 'تطبيقات الويب', ['INC-0701','INC-1101','INC-1203']],
  ['data', 'حماية البيانات', ['INC-0755','INC-1104','INC-1205']],
  ['cloud', 'الأمن السحابي', ['INC-0890','INC-1106','INC-1210']],
  ['network', 'أمن الشبكات', ['INC-0944','INC-1105','INC-1204','INC-1211']],
  ['supply-chain', 'سلسلة التوريد', ['INC-1055','INC-1206','INC-1212']],
];
const blackbox = [
  ['network-foundations', 'الشبكات والاستطلاع', ['recon','nmap','network']],
  ['practical-assessment', 'الأدوات والتقييم العملي', ['webgoat','proxy','metasploit']],
  ['defensive-analysis', 'التحليل الدفاعي والأدلة', ['logs','integrity','headers','email']],
];

export const CERTIFICATE_MANIFESTS = Object.freeze([
  ...cybertrace.map(([groupId,title,caseIds]) => Object.freeze({
    issuer:'cybertrace', groupId, title, version:1, proofKind:'verifiedCybertrace',
    // Requires the independently graded BLACKBOX /verifiedCybertrace receipts
    // for EVERY case, never the native CyberTrace browser score or account UID.
    issuableByGradingService:true, requiredIds:Object.freeze(caseIds),
  })),
  ...blackbox.map(([groupId,title,tracks]) => Object.freeze({
    issuer:'blackbox',groupId,title,version:1,proofKind:'verifiedLabStages',
    // There is NO trusted per-stage grading writer yet. Never allow a policy
    // flag alone to produce a BLACKBOX group credential from manual checkboxes.
    issuableByGradingService:false,
    requiredIds:Object.freeze(tracks.flatMap(track=>[0,1,2].map(index=>track+'-'+index))),
  })),
]);

export function requireCertificateGroup(issuer,groupId) {
  if (typeof issuer !== 'string' || typeof groupId !== 'string') throw new Error('unsupported-certificate-group');
  const manifest = CERTIFICATE_MANIFESTS.find(row=>row.issuer===issuer && row.groupId===groupId);
  if (!manifest) throw new Error('unsupported-certificate-group');
  return manifest;
}
