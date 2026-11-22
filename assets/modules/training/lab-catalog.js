// Static metadata only. This module does not launch or connect to virtual machines.
export const labs = Object.freeze([
  Object.freeze({
    id:'defense-logs',trackId:'logs',title:'التحليل الجنائي لسجل جلسة مصادقة',difficulty:'intermediate',
    category:'forensics',runtime:'local',network:'host-only',estimatedMinutes:30,
    prerequisites:Object.freeze(['Python 3','حزمة blackbox-defense الاصطناعية','مجلد العمل محلي؛ لا توجد حاجة للشبكة']),
    objectives:Object.freeze(['تحليل تسلسل login وMFA وتغير المصدر','تمييز دليل قابل للملاحظة عن فرضية','كتابة تقرير مختصر مع حدود الاستنتاج']),
    status:'manual',
  }),
  Object.freeze({
    id:'defense-integrity',trackId:'integrity',title:'كشف تغيّر إعدادات غير مصرح به',difficulty:'intermediate',
    category:'forensics',runtime:'local',network:'host-only',estimatedMinutes:30,
    prerequisites:Object.freeze(['Python 3','ملفات baseline/current في حزمة blackbox-defense','نسخة عمل منفصلة عن الأدلة الأصلية']),
    objectives:Object.freeze(['مطابقة البصمة المحلية مع المرجع','حصر فروق الإعدادات','تقديم آلية إصلاح وإعادة تحقق']),
    status:'manual',
  }),
  Object.freeze({
    id:'defense-headers',trackId:'headers',title:'تدقيق ترويسات HTTP وخصائص الجلسة',difficulty:'intermediate',
    category:'web',runtime:'local',network:'host-only',estimatedMinutes:25,
    prerequisites:Object.freeze(['Python 3','ملفا headers/before.txt وheaders/after.txt','لا حاجة للاتصال بأي موقع']),
    objectives:Object.freeze(['تفسير خصائص ملفات الارتباط','مقارنة CSP وHSTS وnosniff','تمييز التقرير النصي عن اختبار تطبيق فعلي']),
    status:'manual',
  }),
  Object.freeze({
    id:'defense-email',trackId:'email',title:'فرز بريد تصيد ضمن بيئة اصطناعية',difficulty:'intermediate',
    category:'forensics',runtime:'local',network:'host-only',estimatedMinutes:25,
    prerequisites:Object.freeze(['Python 3','ملفا email/*.eml من حزمة التدريب','لا تفتح روابط الرسائل']),
    objectives:Object.freeze(['مقارنة From وReply-To','تفسير SPF وDKIM وDMARC','كتابة بلاغ فرز بتوصيات تحقق']),
    status:'manual',
  }),
  Object.freeze({
    id: 'nmap-controlled-target',
    trackId: 'nmap',
    title: 'Nmap — فحص هدف HTTP محلي معزول',
    difficulty: 'intermediate',
    category: 'network',
    runtime: 'local',
    network: 'host-only',
    estimatedMinutes: 35,
    prerequisites: Object.freeze(['Kali Linux في VirtualBox على Host-Only', 'VM هدف منفصلة أو loopback محلي', 'Python 3 وNmap']),
    objectives: Object.freeze(['تحديد نطاق اختبار واحد مصرح به', 'تشغيل هدف قراءة فقط ثم فحص المنفذ 8088', 'توثيق المخرجات وحدود التحقق منها']),
    status: 'manual',
  }),
  Object.freeze({
    id: 'webgoat-local',
    trackId: 'webgoat',
    title: 'WebGoat — مختبر تطبيقات الويب',
    difficulty: 'beginner',
    category: 'web',
    runtime: 'local',
    network: 'host-only',
    estimatedMinutes: 45,
    prerequisites: Object.freeze(['VirtualBox يعمل على جهازك', 'Kali Linux داخل آلة افتراضية', 'WebGoat على آلة تدريب داخل شبكة معزولة']),
    objectives: Object.freeze(['تحديد هدف تدريبي تملك صلاحية اختباره', 'توثيق ملاحظة مع دليلها وحدودها', 'تسجيل خطوات المعالجة وإعادة التحقق']),
    status: 'manual',
  }),
  Object.freeze({
    id: 'network-observation',
    trackId: 'network',
    title: 'تحليل حركة الشبكة المعزولة',
    difficulty: 'beginner',
    category: 'network',
    runtime: 'local',
    network: 'host-only',
    estimatedMinutes: 30,
    prerequisites: Object.freeze(['VirtualBox وشبكة مختبر معزولة', 'Kali Linux يعمل داخل المختبر', 'Wireshark لقراءة حركة الشبكة']),
    objectives: Object.freeze(['التقاط حركة شبكة المختبر المصرّح بها', 'تمييز تبادلات DNS وTCP', 'توثيق الحزم التي تدعم الاستنتاج']),
    status: 'manual',
  }),
]);
const ids = new Set();
export function validateLab(lab) {
  if (!lab || typeof lab !== 'object' || Array.isArray(lab)) throw new TypeError('Lab must be an object');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lab.id ?? '')) throw new TypeError('Invalid lab id');
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(lab.trackId ?? '')) throw new TypeError('Invalid training track');
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
export function labStartURL(lab) {
  validateLab(lab);
  return './?' + new URLSearchParams({ track: lab.trackId, stage: '0' }).toString();
}
