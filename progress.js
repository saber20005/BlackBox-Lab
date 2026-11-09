import { tracks } from './data.js';

export const STORAGE_KEY = 'blackbox-progress-v1';
export const BACKUP_FORMAT = 'blackbox-lab-progress';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 100000;

const fields = new Set(['checks', 'notes', 'results', 'completed', 'devices', 'logs', 'lastActivity', 'updatedAt', 'stageUpdatedAt']);
const legacyFields = ['checks', 'notes', 'results', 'completed', 'devices', 'logs'];
const stageDefinitions = new Map();
const trackDefinitions = new Map(tracks.map(track => [track.id, track]));
for (const track of tracks) {
  track.stages.forEach((stage, index) => stageDefinitions.set(`${track.id}-${index}`, stage));
}
const deviceValues = {
  kali: new Set(['unknown', 'on', 'off']),
  windows: new Set(['unknown', 'on', 'off']),
  target: new Set(['unknown', 'on', 'off']),
  network: new Set(['unknown', 'isolated', 'notset']),
};

function isObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day && Number.isFinite(Date.parse(value));
}

function reject(message) {
  throw new Error(message);
}

function requireObject(value, strict, description) {
  if (isObject(value)) return true;
  if (strict) reject(`بنية ${description} غير صالحة في النسخة الاحتياطية.`);
  return false;
}

function validateMapKeys(value, strict, description) {
  if (!requireObject(value, strict, description)) return [];
  return Object.entries(value).filter(([stageKey]) => {
    if (stageDefinitions.has(stageKey)) return true;
    if (strict) reject(`تحتوي ${description} على مرحلة غير معروفة.`);
    return false;
  });
}

export function createInitialState() {
  return {
    checks: Object.fromEntries([...stageDefinitions.keys()].map(stageKey => [stageKey, []])),
    notes: {},
    results: {},
    completed: {},
    devices: { kali: 'unknown', windows: 'unknown', target: 'unknown', network: 'unknown' },
    logs: [],
    lastActivity: null,
    updatedAt: null,
    stageUpdatedAt: {},
  };
}

function readState(raw, strict) {
  const state = createInitialState();
  if (!requireObject(raw, strict, 'بيانات التقدم')) return state;
  if (strict) {
    for (const field of legacyFields) {
      if (!Object.hasOwn(raw, field)) reject('الملف لا يحتوي على بيانات تقدم BLACKBOX كاملة.');
    }
    if (Object.keys(raw).some(field => !fields.has(field))) reject('تحتوي النسخة الاحتياطية على حقول غير معروفة.');
  }

  if (Object.hasOwn(raw, 'checks')) {
    for (const [stageKey, indexes] of validateMapKeys(raw.checks, strict, 'قوائم التحقق')) {
      if (!Array.isArray(indexes)) {
        if (strict) reject('إحدى قوائم التحقق ليست قائمة صالحة.');
        continue;
      }
      const length = stageDefinitions.get(stageKey).check.length;
      const valid = indexes.filter(index => Number.isInteger(index) && index >= 0 && index < length);
      if (strict && (valid.length !== indexes.length || new Set(valid).size !== indexes.length)) reject('تحتوي قائمة التحقق على بند غير صالح أو مكرر.');
      state.checks[stageKey] = [...new Set(valid)].sort((a, b) => a - b);
    }
  }

  for (const field of ['notes', 'results']) {
    if (!Object.hasOwn(raw, field)) continue;
    for (const [stageKey, value] of validateMapKeys(raw[field], strict, field === 'notes' ? 'الملاحظات' : 'النتائج')) {
      if (typeof value !== 'string') {
        if (strict) reject('يجب أن تكون الملاحظات والنتائج نصوصًا.');
        continue;
      }
      // Keep existing valid text intact when loading old browser storage.
      // Imported files have explicit bounds; nothing is silently truncated.
      if (strict && value.length > MAX_TEXT_LENGTH) reject('أحد النصوص يتجاوز الحد المسموح: 100000 حرف لكل ملاحظة أو نتيجة.');
      state[field][stageKey] = value;
    }
  }

  for (const field of ['completed', 'stageUpdatedAt']) {
    if (!Object.hasOwn(raw, field)) continue;
    for (const [stageKey, value] of validateMapKeys(raw[field], strict, field === 'completed' ? 'المراحل المكتملة' : 'تواريخ المراحل')) {
      if (!isTimestamp(value)) {
        if (strict) reject('تحتوي النسخة الاحتياطية على تاريخ مرحلة غير صالح.');
        continue;
      }
      state[field][stageKey] = value;
    }
  }

  if (Object.hasOwn(raw, 'devices') && requireObject(raw.devices, strict, 'حالات الأجهزة')) {
    for (const [device, value] of Object.entries(raw.devices)) {
      if (!Object.hasOwn(deviceValues, device) || !deviceValues[device].has(value)) {
        if (strict) reject('تحتوي النسخة الاحتياطية على حالة جهاز غير صالحة.');
        continue;
      }
      state.devices[device] = value;
    }
  }

  if (Object.hasOwn(raw, 'logs')) {
    if (!Array.isArray(raw.logs)) {
      if (strict) reject('سجل النشاط ليس قائمة صالحة.');
    } else {
      if (strict && raw.logs.length > 100) reject('سجل النشاط يتجاوز الحد المسموح: 100 عملية.');
      for (const log of raw.logs.slice(-100)) {
        const valid = isObject(log) && typeof log.msg === 'string' && log.msg.length <= 2000 && isTimestamp(log.at) && Object.keys(log).every(field => ['msg', 'at'].includes(field));
        if (!valid) {
          if (strict) reject('يحتوي سجل النشاط على عملية غير صالحة.');
          continue;
        }
        state.logs.push({ msg: log.msg, at: log.at });
      }
    }
  }

  if (Object.hasOwn(raw, 'updatedAt') && raw.updatedAt !== null) {
    if (isTimestamp(raw.updatedAt)) state.updatedAt = raw.updatedAt;
    else if (strict) reject('تاريخ آخر حفظ غير صالح.');
  }
  if (Object.hasOwn(raw, 'lastActivity') && raw.lastActivity !== null) {
    const activity = raw.lastActivity;
    const track = isObject(activity) ? trackDefinitions.get(activity.trackId) : null;
    const valid = track && Number.isInteger(activity.stageIndex) && activity.stageIndex >= 0 && activity.stageIndex < track.stages.length && isTimestamp(activity.at) && Object.keys(activity).every(field => ['trackId', 'stageIndex', 'at'].includes(field));
    if (valid) state.lastActivity = { trackId: activity.trackId, stageIndex: activity.stageIndex, at: activity.at };
    else if (strict) reject('موضع متابعة التدريب غير صالح.');
  }
  return state;
}

export function normalizeState(raw) {
  return readState(raw, false);
}

function storageInstance(storage) {
  return storage === undefined ? globalThis.localStorage : storage;
}

export function loadProgress(storage) {
  try {
    const instance = storageInstance(storage);
    if (!instance || typeof instance.getItem !== 'function') throw new Error('Storage unavailable');
    const saved = instance.getItem(STORAGE_KEY);
    if (saved === null) return { state: createInitialState(), ok: true, message: 'سيُحفظ تقدمك محليًا أثناء التدريب.' };
    const raw = JSON.parse(saved);
    const state = normalizeState(raw);
    let recovered = false;
    try { readState(raw, true); } catch { recovered = true; }
    return {
      state,
      ok: true,
      recovered,
      message: recovered ? 'حُمّلت الأجزاء الصالحة من التقدم القديم. راجعها واحفظ نسخة احتياطية.' : 'تم تحميل تقدمك المحفوظ على هذا المتصفح.',
    };
  } catch {
    return { state: createInitialState(), ok: false, message: 'تعذر قراءة الحفظ المحلي. يمكنك المتابعة مؤقتًا وتصدير نسخة من عملك.' };
  }
}

export function saveProgress(state, storage) {
  try {
    const instance = storageInstance(storage);
    if (!instance || typeof instance.setItem !== 'function') throw new Error('Storage unavailable');
    instance.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
    return { ok: true, message: 'تم الحفظ على هذا المتصفح.' };
  } catch {
    return { ok: false, message: 'تعذر حفظ آخر تعديل على هذا المتصفح. يبقى عملك ظاهرًا الآن؛ صدّر نسخة احتياطية قبل إغلاق الصفحة.' };
  }
}

function validateTextSize(text) {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) reject('حجم النسخة الاحتياطية أكبر من 5 ميغابايت.');
}

export function createBackup(state) {
  const data = readState(state, true);
  const backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
  validateTextSize(JSON.stringify(backup, null, 2));
  return backup;
}

export function parseBackup(text) {
  if (typeof text !== 'string') reject('تعذر قراءة ملف النسخة الاحتياطية.');
  validateTextSize(text);
  let parsed;
  try { parsed = JSON.parse(text); } catch { reject('الملف ليس JSON صالحًا. اختر نسخة BLACKBOX احتياطية.'); }
  if (!isObject(parsed)) reject('الملف لا يحتوي على نسخة BLACKBOX احتياطية.');
  if (Object.hasOwn(parsed, 'format') || Object.hasOwn(parsed, 'version')) {
    if (parsed.format !== BACKUP_FORMAT || parsed.version !== BACKUP_VERSION) reject('نوع النسخة الاحتياطية أو إصدارها غير مدعوم.');
    if (!isTimestamp(parsed.exportedAt)) reject('تاريخ النسخة الاحتياطية غير صالح.');
    if (Object.keys(parsed).some(field => !['format', 'version', 'exportedAt', 'data'].includes(field))) reject('تحتوي النسخة الاحتياطية على حقول غير معروفة.');
    return readState(parsed.data, true);
  }
  // Older BLACKBOX releases exported the state object directly.
  return readState(parsed, true);
}
