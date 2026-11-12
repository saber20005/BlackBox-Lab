import test from 'node:test';
import assert from 'node:assert/strict';
import { appendDocumentationTemplate, DOCUMENTATION_TEMPLATES, hasMeaningfulDocumentation } from '../documentation-templates.js';

test('result prompts are optional proposed text and preserve existing evidence exactly', () => {
  const existing = 'ملاحظتي السابقة\n  فراغات محفوظة  \n';
  const result = appendDocumentationTemplate(existing, 'result');
  assert.equal(result.ok, true);
  assert.equal(result.reason, null);
  assert.equal(result.value, `${existing}\n\n${DOCUMENTATION_TEMPLATES.result.text}`);
  assert.equal(existing, 'ملاحظتي السابقة\n  فراغات محفوظة  \n');
  assert(result.value.includes('ما الذي لا يثبته هذا الدليل؟'));
});

test('empty fields get only prompts and whitespace is not silently trimmed', () => {
  assert.equal(appendDocumentationTemplate('', 'notes').value, DOCUMENTATION_TEMPLATES.notes.text);
  const result = appendDocumentationTemplate('  ', 'notes');
  assert(result.value.startsWith('  \n\n'));
  assert(result.value.includes('الأسئلة المفتوحة'));
  assert(result.value.includes('إعادة التحقق'));
});

test('repeating or editing an existing template does not append a duplicate', () => {
  for (const type of ['result', 'notes']) {
    const first = appendDocumentationTemplate('كتابة أصلية', type);
    const second = appendDocumentationTemplate(first.value, type);
    assert.deepEqual(second, { ok: false, value: first.value, reason: 'duplicate' });
    const edited = `${DOCUMENTATION_TEMPLATES[type].heading}\n\nإجاباتي بدل الأسئلة`;
    assert.deepEqual(appendDocumentationTemplate(edited, type), { ok: false, value: edited, reason: 'duplicate' });
  }
});

test('exact length boundary is allowed and overflow returns original text without truncation', () => {
  const existing = 'نص أصلي';
  const expectedLength = existing.length + 2 + DOCUMENTATION_TEMPLATES.result.text.length;
  assert.equal(appendDocumentationTemplate(existing, 'result', expectedLength).ok, true);
  assert.deepEqual(appendDocumentationTemplate(existing, 'result', expectedLength - 1), {
    ok: false, value: existing, reason: 'too-long',
  });
  assert.deepEqual(appendDocumentationTemplate('x'.repeat(100001), 'notes'), {
    ok: false, value: 'x'.repeat(100001), reason: 'too-long',
  });
});

test('invalid template types, text and limits are rejected without changing input', () => {
  for (const type of ['unknown', '__proto__', 'constructor', undefined]) {
    assert.deepEqual(appendDocumentationTemplate('ابق كما أنت', type), { ok: false, value: 'ابق كما أنت', reason: 'invalid' });
  }
  for (const existing of [null, undefined, {}, ['text'], 4]) {
    assert.deepEqual(appendDocumentationTemplate(existing, 'notes'), { ok: false, value: existing, reason: 'invalid' });
  }
  for (const limit of [-1, Infinity, NaN, '100000', 1.5]) {
    assert.deepEqual(appendDocumentationTemplate('text', 'notes', limit), { ok: false, value: 'text', reason: 'invalid' });
  }
});

test('untouched prompts in results and notes do not count as documented work', () => {
  const result = appendDocumentationTemplate('', 'result').value;
  const notes = appendDocumentationTemplate('', 'notes').value;
  assert.equal(hasMeaningfulDocumentation(result), false);
  assert.equal(hasMeaningfulDocumentation(notes), false);
  assert.equal(hasMeaningfulDocumentation(result) || hasMeaningfulDocumentation(notes), false);
  assert.equal(hasMeaningfulDocumentation(` \n${result}\n\n${notes}\n `), false);
  assert.equal(hasMeaningfulDocumentation(notes.replaceAll('\n', '\r\n')), false);
  for (const value of [undefined, null, 7, {}, '', ' \n\t']) assert.equal(hasMeaningfulDocumentation(value), false);
});

test('existing work remains meaningful when unchanged prompts are appended', () => {
  const original = 'ملاحظة قديمة: لم تصل حزم من العنوان المحدد.\n';
  assert.equal(hasMeaningfulDocumentation(original), true);
  for (const type of ['result', 'notes']) {
    const appended = appendDocumentationTemplate(original, type).value;
    assert.equal(hasMeaningfulDocumentation(appended), true);
    assert(appended.startsWith(original));
  }
  assert.equal(original, 'ملاحظة قديمة: لم تصل حزم من العنوان المحدد.\n');
});

test('inline answers and substantive edits count without stripping user writing', () => {
  const template = DOCUMENTATION_TEMPLATES.result.text;
  const answered = template.replace('الملاحظة:', 'الملاحظة: ظهر رمز HTTP 200 في طلبي المحلي.');
  assert.equal(hasMeaningfulDocumentation(answered), true);
  assert.equal(hasMeaningfulDocumentation(`${template}\nتحققت من الخدمة المحلية باستخدام curl.`), true);
  const edited = `${DOCUMENTATION_TEMPLATES.notes.heading}\nالتوصية: راجع اسم الواجهة قبل الالتقاط.`;
  assert.equal(hasMeaningfulDocumentation(edited), true);
  assert(answered.includes('ظهر رمز HTTP 200'));
});
