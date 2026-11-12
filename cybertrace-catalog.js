export const MAX_CASE_SCORE = 70;

export const SKILLS = Object.freeze([
  { id: 'identity', label: 'الهوية والوصول' },
  { id: 'email', label: 'أمن البريد' },
  { id: 'malware', label: 'البرمجيات الخبيثة' },
  { id: 'web', label: 'تطبيقات الويب' },
  { id: 'data', label: 'حماية البيانات' },
  { id: 'cloud', label: 'الأمن السحابي' },
  { id: 'network', label: 'أمن الشبكات' },
  { id: 'supply-chain', label: 'سلسلة التوريد' },
].map(skill => Object.freeze(skill)));

const definitions = [
  ['INC-0417', 'تسجيل دخول مشبوه', 'identity', []],
  ['INC-0512', 'حملة تصيّد عبر البريد', 'email', []],
  ['INC-0633', 'تنبيه تشفير ببرمجية فدية', 'malware', []],
  ['INC-0701', 'استغلال خادم غير محدّث', 'web', ['webgoat', 'proxy']],
  ['INC-0755', 'تسريب بيانات من الداخل', 'data', []],
  ['INC-0812', 'هجوم تخمين على لوحة الإدارة', 'identity', []],
  ['INC-0890', 'حاوية تخزين سحابي مكشوفة', 'cloud', []],
  ['INC-0944', 'حجب خدمة على واجهة عامة', 'network', ['network']],
  ['INC-1002', 'تصعيد صلاحيات غير مصرّح به', 'identity', []],
  ['INC-1055', 'اختراق سلسلة توريد برمجية', 'supply-chain', []],
  ['INC-1101', 'حقن SQL وتسريب بيانات العملاء', 'web', ['webgoat', 'proxy']],
  ['INC-1102', 'إساءة استخدام موافقة OAuth', 'identity', []],
  ['INC-1103', 'تعدين خفي داخل حاوية إنتاج', 'malware', ['network']],
  ['INC-1104', 'تسريب بيانات عبر نفق DNS', 'data', ['network']],
  ['INC-1105', 'حركة جانبية بحساب خدمة مخترق', 'network', ['network']],
  ['INC-1106', 'استغلال مفتاح وصول سحابي مسرّب', 'cloud', []],
  ['INC-1201', 'إعادة استخدام جلسة مسروقة', 'identity', []],
  ['INC-1202', 'قاعدة تحويل بريد خفية', 'email', []],
  ['INC-1203', 'وصول إلى سجلات عميل آخر', 'web', ['webgoat', 'proxy']],
  ['INC-1204', 'خادم DHCP غير مصرح يغيّر مسار DNS', 'network', ['network']],
  ['INC-1205', 'إنذار تصدير بيانات معتمد', 'data', []],
  ['INC-1206', 'استبدال صورة حاوية تحت وسم موثوق', 'supply-chain', []],
  ['INC-1207', 'تغيير جهة الثقة في تسجيل الدخول الموحّد', 'identity', []],
  ['INC-1208', 'احتيال مالي داخل سلسلة مراسلات مورد', 'email', []],
  ['INC-1209', 'تحميل مكتبة مزروعة بجانب برنامج موقّع', 'malware', ['network']],
  ['INC-1210', 'مشاركة لقطة قاعدة بيانات مع حساب خارجي', 'cloud', []],
  ['INC-1211', 'تجاوز التقسيم الشبكي بقاعدة مؤقتة', 'network', ['network', 'nmap']],
  ['INC-1212', 'انتحال مسار بناء عبر هوية CI موحّدة', 'supply-chain', []],
];

export const CASE_META = Object.freeze(Object.fromEntries(definitions.map(
  ([id, title, skillId, trackIds]) => [id, Object.freeze({ title, skillId, trackIds: Object.freeze([...trackIds]) })],
)));
export const CASE_IDS = Object.freeze(Object.keys(CASE_META));

const receiptFields = new Set(['schemaVersion', 'source', 'caseId', 'bestScore', 'firstSyncedAt', 'updatedAt']);
const canonicalISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MIN_TIMESTAMP_SECONDS = -62135596800;
const MAX_TIMESTAMP_SECONDS = 253402300799;

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isoFromMilliseconds(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getUTCFullYear();
  return year >= 1 && year <= 9999 ? date.toISOString() : null;
}

// SDK Timestamp instances expose toDate()/toMillis(). Strings are accepted
// only in the canonical format that this function itself returns.
function timestampISO(value) {
  try {
    if (typeof value === 'string') {
      if (!canonicalISO.test(value)) return null;
      const normalized = isoFromMilliseconds(Date.parse(value));
      return normalized === value ? normalized : null;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    let milliseconds;
    if (typeof value.toDate === 'function') {
      milliseconds = Date.prototype.getTime.call(value.toDate());
    } else if (typeof value.toMillis === 'function') {
      milliseconds = value.toMillis();
    } else return null;
    const normalized = isoFromMilliseconds(milliseconds);
    if (!normalized) return null;
    if (typeof value.toMillis === 'function') {
      const byMethod = value.toMillis();
      if (typeof byMethod !== 'number' || !Number.isFinite(byMethod) || Math.trunc(byMethod) !== Math.trunc(milliseconds)) return null;
    }
    // Validate SDK numeric fields when present, including their agreement
    // with the conversion method. Plain method-only test adapters also work.
    if ('seconds' in value || 'nanoseconds' in value) {
      const { seconds, nanoseconds } = value;
      if (!Number.isSafeInteger(seconds) || seconds < MIN_TIMESTAMP_SECONDS || seconds > MAX_TIMESTAMP_SECONDS ||
        !Number.isInteger(nanoseconds) || nanoseconds < 0 || nanoseconds > 999999999) return null;
      const byParts = seconds * 1000 + nanoseconds / 1000000;
      if (Math.trunc(byParts) !== Math.trunc(milliseconds)) return null;
    }
    return normalized;
  } catch { return null; }
}

/** Normalize an actual scored receipt; never infer scores or missing dates. */
export function normalizeReceipt(raw, id) {
  try {
    if (typeof id !== 'string' || !Object.hasOwn(CASE_META, id) || !plainObject(raw)) return null;
    const keys = Object.keys(raw);
    if (keys.length !== receiptFields.size || keys.some(key => !receiptFields.has(key))) return null;
    if (raw.schemaVersion !== 1 || raw.source !== 'cybertrace' || raw.caseId !== id ||
      !Number.isInteger(raw.bestScore) || raw.bestScore < 0 || raw.bestScore > MAX_CASE_SCORE) return null;
    const firstSyncedAt = timestampISO(raw.firstSyncedAt);
    const updatedAt = timestampISO(raw.updatedAt);
    if (!firstSyncedAt || !updatedAt || updatedAt < firstSyncedAt) return null;
    return { schemaVersion: 1, source: 'cybertrace', caseId: id, bestScore: raw.bestScore, firstSyncedAt, updatedAt };
  } catch { return null; }
}

/**
 * Catalogue coverage is separate from practical stage completion. Maps are
 * keyed by actual document ID; arrays may contain repeated snapshots. Only
 * the highest valid score per case contributes, regardless of input order.
 */
export function aggregateSkillProgress(receiptsById) {
  const bestScores = new Map();
  const candidates = [];
  try {
    if (Array.isArray(receiptsById)) {
      for (const raw of receiptsById) {
        try { candidates.push([raw?.caseId, raw]); } catch { /* Skip an unreadable entry. */ }
      }
    } else if (plainObject(receiptsById)) {
      for (const id of Object.keys(receiptsById)) {
        try { candidates.push([id, receiptsById[id]]); } catch { /* Skip an unreadable entry. */ }
      }
    }
  } catch { /* Invalid input contributes no achievements. */ }
  for (const [id, raw] of candidates) {
    const receipt = normalizeReceipt(raw, id);
    if (receipt) bestScores.set(id, Math.max(bestScores.get(id) ?? 0, receipt.bestScore));
  }
  const skills = SKILLS.map(skill => {
    const caseIds = CASE_IDS.filter(id => CASE_META[id].skillId === skill.id);
    const points = caseIds.reduce((sum, id) => sum + (bestScores.get(id) ?? 0), 0);
    const maxPoints = caseIds.length * MAX_CASE_SCORE;
    return {
      ...skill,
      points,
      maxPoints,
      percent: maxPoints ? Math.round(points * 100 / maxPoints) : 0,
      completedCount: caseIds.filter(id => bestScores.has(id)).length,
      totalCases: caseIds.length,
      caseIds,
    };
  });
  const points = skills.reduce((sum, skill) => sum + skill.points, 0);
  const maxPoints = CASE_IDS.length * MAX_CASE_SCORE;
  return { points, maxPoints, percent: maxPoints ? Math.round(points * 100 / maxPoints) : 0, completedCount: bestScores.size, totalCases: CASE_IDS.length, skills };
}
