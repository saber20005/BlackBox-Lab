// Static metadata only. This module does not launch or connect to virtual machines.
export const labs = Object.freeze([
  Object.freeze({
    id: 'webgoat-local',
    title: 'WebGoat — مختبر تطبيقات الويب',
    difficulty: 'beginner',
    category: 'web',
    runtime: 'local',
    network: 'host-only',
    estimatedMinutes: 45,
    prerequisites: Object.freeze(['VirtualBox', 'Kali Linux', 'WebGoat on an isolated VM']),
    objectives: Object.freeze(['Identify an authorized training target', 'Document a finding', 'Record mitigation steps']),
    status: 'manual',
  }),
  Object.freeze({
    id: 'network-observation',
    title: 'تحليل حركة الشبكة المعزولة',
    difficulty: 'beginner',
    category: 'network',
    runtime: 'local',
    network: 'host-only',
    estimatedMinutes: 30,
    prerequisites: Object.freeze(['VirtualBox', 'Kali Linux', 'Wireshark']),
    objectives: Object.freeze(['Capture lab traffic', 'Identify DNS and TCP exchanges', 'Document evidence']),
    status: 'manual',
  }),
]);
const ids = new Set();
export function validateLab(lab) {
  if (!lab || typeof lab !== 'object' || Array.isArray(lab)) throw new TypeError('Lab must be an object');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lab.id ?? '')) throw new TypeError('Invalid lab id');
  if (typeof lab.title !== 'string' || !lab.title.trim()) throw new TypeError('Missing title');
  if (!['beginner','intermediate','advanced'].includes(lab.difficulty)) throw new TypeError('Invalid difficulty');
  if (!['web','network','forensics','soc','linux','windows'].includes(lab.category)) throw new TypeError('Invalid category');
  if (lab.runtime !== 'local' || lab.network !== 'host-only' || lab.status !== 'manual') throw new TypeError('Unsupported runtime or network mode');
  if (!Number.isInteger(lab.estimatedMinutes) || lab.estimatedMinutes < 1 || lab.estimatedMinutes > 480) throw new TypeError('Invalid duration');
  for (const key of ['prerequisites','objectives']) {
    if (!Array.isArray(lab[key]) || !lab[key].length || lab[key].some(v => typeof v !== 'string' || !v.trim())) throw new TypeError('Invalid '+key);
  }
  return true;
}
for (const lab of labs) {
  validateLab(lab);
  if (ids.has(lab.id)) throw new Error('Duplicate lab id');
  ids.add(lab.id);
}
export function filterLabs({category, difficulty}={}) {
  return labs.filter(lab => (!category || lab.category === category) && (!difficulty || lab.difficulty === difficulty));
}
