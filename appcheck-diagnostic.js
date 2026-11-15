import { accountConfig } from './account-config.js';

const button = document.getElementById('run');
const result = document.getElementById('result');
const SDK = '12.18.0';
const knownSDKCodes = new Set([
  'already-initialized', 'use-before-activation', 'fetch-network-error',
  'fetch-parse-error', 'fetch-status-error', 'storage-open', 'storage-get',
  'storage-set', 'recaptcha-error', 'initial-throttle', 'throttled'
].map(code => `appCheck/${code}`));

// Report only a known failure stage and a short SDK error code. Never expose
// tokens, request payloads, API responses, or raw exception messages.
const advice = Object.freeze({
  configuration: 'تحقق من HTTPS ووجود مفتاح الموقع في إعدادات التطبيق.',
  'sdk-load': 'تعذر تحميل Firebase SDK. تحقق من اتصال الإنترنت وحظر الإضافات أو الشبكة.',
  'app-init': 'تعذرت تهيئة Firebase. تحقق من تطابق إعدادات المشروع والتطبيق.',
  'app-check-init': 'تعذرت تهيئة App Check. تحقق من تسجيل تطبيق الويب والمفتاح.',
  'token-request': 'ميّز بين فشل تنفيذ reCAPTCHA وفشل تبادل الرمز مع Firebase باستخدام الفحص المستقل وطلبات Network. استجابة clr وحدها لا تحدد السبب.',
  'token-validation': 'لم تُرجع Firebase رمزًا صالحًا. افحص إعدادات App Check.'
});

button.addEventListener('click', async () => {
  button.disabled = true;
  let stage = 'configuration';
  result.textContent = 'جارٍ فحص الإعدادات...';
  try {
    if (location.protocol !== 'https:' || !accountConfig.grading?.appCheckSiteKey) {
      throw new Error('configuration-unavailable');
    }
    stage = 'sdk-load';
    result.textContent = 'جارٍ تحميل Firebase SDK...';
    const [appSDK, checkSDK] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app-check.js`)
    ]);
    stage = 'app-init';
    const app = appSDK.getApps().find(item => item.name === 'blackbox-appcheck-diagnostic')
      ?? appSDK.initializeApp(accountConfig.firebase, 'blackbox-appcheck-diagnostic');
    stage = 'app-check-init';
    const check = checkSDK.initializeAppCheck(app, {
      provider: new checkSDK.ReCaptchaEnterpriseProvider(accountConfig.grading.appCheckSiteKey),
      isTokenAutoRefreshEnabled: false
    });
    stage = 'token-request';
    result.textContent = 'جارٍ طلب رمز App Check...';
    // A cached token must not be mistaken for a new attestation succeeding.
    const response = await checkSDK.getToken(check, true);
    stage = 'token-validation';
    if (typeof response.token !== 'string' || response.token.length === 0) {
      throw new Error('empty-token');
    }
    result.textContent = 'نجح إصدار رمز App Check. لم يعرض التشخيص قيمته أو يسجّلها؛ تبقى إدارة الرمز داخل Firebase SDK. هذا لا يثبت نجاح وظائف التقييم على الخادم.';
  } catch (error) {
    let code = 'unknown';
    try {
      const candidate = error?.code;
      if (knownSDKCodes.has(candidate)) code = candidate;
    } catch { /* Never serialize an unreadable provider rejection. */ }
    result.textContent = `فشل الاختبار.\nالمرحلة: ${stage}\nرمز SDK: ${code}\nالإجراء المقترح: ${advice[stage]}\n\nلا تشارك رموز App Check أو بيانات Authorization أو أجسام الطلبات.`;
  } finally {
    button.disabled = false;
  }
});
