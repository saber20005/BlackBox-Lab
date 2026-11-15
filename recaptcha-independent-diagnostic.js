import { accountConfig } from './account-config.js';
import { createEnterpriseScriptLoader, createRecaptchaProbe } from './recaptcha-diagnostic-core.js';

const button = document.getElementById('run');
const result = document.getElementById('result');
const stageText = Object.freeze({
  configuration: 'جارٍ فحص متطلبات الاختبار المحليّة...',
  'script-load': 'تحميل reCAPTCHA Enterprise...',
  ready: 'انتظار جاهزية Google...',
  execute: 'تنفيذ الطلب المستقل...',
  'token-validation': 'التحقق من إصدار قيمة غير فارغة...',
});
const probe = createRecaptchaProbe({
  siteKey: accountConfig.grading?.appCheckSiteKey,
  secure: location.protocol === 'https:',
  loadScript: createEnterpriseScriptLoader(),
  ready: () => new Promise((resolve, reject) => {
    const enterprise = globalThis.grecaptcha?.enterprise;
    if (typeof enterprise?.ready !== 'function') { reject({ code: 'probe/api-missing' }); return; }
    enterprise.ready(resolve);
  }),
  execute: (siteKey, options) => {
    const enterprise = globalThis.grecaptcha?.enterprise;
    if (typeof enterprise?.execute !== 'function') throw { code: 'probe/api-missing' };
    return enterprise.execute(siteKey, options);
  },
  onStage: stage => { result.textContent = stageText[stage]; },
});

button.addEventListener('click', async () => {
  button.disabled = true;
  const report = await probe.run();
  if (report.ok) {
    result.textContent = 'نجح إصدار قيمة غير فارغة من reCAPTCHA Enterprise في الاختبار المستقل. لم تُعرض القيمة أو تُحفظ. لم يُختبر قبول Firebase App Check لها، ولا يثبت ذلك إصلاح التقييم الموثق.';
  } else {
    const lines = ['فشل الاختبار المستقل.', `المرحلة: ${report.stage}`, `النتيجة: ${report.code}`];
    if (report.rejectionType) lines.push(`نوع الرفض: ${report.rejectionType}`);
    if (report.code === 'client-or-key-rejected') lines.push('رسالة Google تجمع احتمال رفض العميل أو المفتاح؛ لا تحدد وحدها سبب الرفض.');
    if (report.reloadRequired) lines.push('انتهت مهلة الانتظار. قد يستمر طلب Google السابق؛ أعد تحميل الصفحة يدويًا قبل المحاولة مجددًا.');
    else lines.push('هذا فحص مستقل قبل تبادل رمز Firebase؛ لا يُنسب السبب إلى طلب clr منفرد.');
    lines.push('لا تشارك الرموز أو محتوى الطلبات.');
    result.textContent = lines.join('\n');
  }
  button.disabled = report.reloadRequired;
  if (report.reloadRequired) {
    button.textContent = 'أعد تحميل الصفحة لإعادة الاختبار';
    button.dataset.reloadRequired = 'true';
  }
});
