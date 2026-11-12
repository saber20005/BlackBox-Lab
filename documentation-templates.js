// Optional prompts only: the caller inserts them after an explicit user action.
// Existing training text stays intact and the usual draft save path owns storage.
export const DOCUMENTATION_TEMPLATES = Object.freeze({
  result: Object.freeze({
    heading: '### قالب توثيق النتائج — BLACKBOX',
    text: [
      '### قالب توثيق النتائج — BLACKBOX',
      '',
      'النطاق والهدف:',
      '- ما الجهاز أو التطبيق المحلي الذي اختبرته؟ وما السؤال الذي تريد الإجابة عنه؟',
      '',
      'الملاحظة:',
      '- ما الذي لاحظته فعلًا؟ اذكر الوقت والسياق عند الحاجة.',
      '',
      'الدليل:',
      '- أضف المخرجات ذات الصلة بعد إزالة أي بيانات حساسة، وبيّن مصدرها.',
      '',
      'التحقق وحدود النتيجة:',
      '- كيف تحقّقت من الملاحظة؟ وما الذي لا يثبته هذا الدليل؟',
    ].join('\n'),
  }),
  notes: Object.freeze({
    heading: '### قالب مراجعة التعلّم — BLACKBOX',
    text: [
      '### قالب مراجعة التعلّم — BLACKBOX',
      '',
      'ما تعلّمته:',
      '- اشرح الفكرة أو المهارة بأسلوبك.',
      '',
      'ما يحتاج إلى مراجعة:',
      '- ما الذي لم يتضح بعد؟ وما الأسئلة المفتوحة؟',
      '',
      'التوصية:',
      '- ما الإجراء أو التحسين المقترح؟ ولماذا تدعمه ملاحظاتك؟',
      '',
      'خطوة المتابعة وإعادة التحقق:',
      '- ما التجربة التالية داخل مختبرك؟ وكيف ستعرف إن تحقق التحسين؟',
    ].join('\n'),
  }),
});

/**
 * Return a proposed value without changing or saving the supplied text.
 * reason is null on success, otherwise invalid / duplicate / too-long.
 * A stable visible heading also prevents duplicates after editing the prompts.
 */
export function appendDocumentationTemplate(existing, type, maxLength = 100000) {
  if (typeof existing !== 'string' || !Object.hasOwn(DOCUMENTATION_TEMPLATES, type) ||
      !Number.isSafeInteger(maxLength) || maxLength < 0) {
    return { ok: false, value: existing, reason: 'invalid' };
  }
  const template = DOCUMENTATION_TEMPLATES[type];
  if (existing.includes(template.heading)) return { ok: false, value: existing, reason: 'duplicate' };
  const value = `${existing}${existing.length ? '\n\n' : ''}${template.text}`;
  if (value.length > maxLength) return { ok: false, value: existing, reason: 'too-long' };
  return { ok: true, value, reason: null };
}

// Untouched prompts are a writing aid, not evidence that a stage is documented.
// Remove complete original blocks only; any edited or answered text stays.
export function hasMeaningfulDocumentation(value) {
  if (typeof value !== 'string') return false;
  let remaining = value.replaceAll('\r\n', '\n');
  for (const template of Object.values(DOCUMENTATION_TEMPLATES)) {
    remaining = remaining.replaceAll(template.text, '');
  }
  return remaining.trim().length > 0;
}
