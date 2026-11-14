import { accountConfig } from './account-config.js';

const button = document.getElementById('run');
const result = document.getElementById('result');
const SDK = '12.18.0';

// Report only a known failure stage and a short SDK error code. Never expose
// tokens, request payloads, API responses, or raw exception messages.
const advice = Object.freeze({
  configuration: 'تحقق من HTTPS ووجود مفتاح الموقع في إعدادات التطبيق.',
  'sdk-load': 'تعذر تحميل Firebase SDK. تحقق من اتصال الإنترنت وحظر الإضافات أو الشبكة.',
  'app-init': 'تعذرت تهيئة Firebase. تحقق من تطابق إعدادات المشروع والتطبيق.',
  'app-check-init': 'تعذرت تهيئة App Check. تحقق من تسجيل تطبيق الويب والمفتاح.',
  'token-request': 'فشل إصدار الرمز. افحص Network بحثًا عن طلبات reCAPTCHA وFirebase App Check. تأكد من نوع المفتاح والنطاق، ثم جرّب نافذة خاصة دون إضافات.',
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
    const response = await checkSDK.getToken(check);
    stage = 'token-validation';
    if (typeof response.token !== 'string' || response.token.length === 0) {
      throw new Error('empty-token');
    }
    result.textContent = 'نجح إصدار رمز App Check. لم يتم عرضه أو حفظه. هذا لا يثبت نجاح وظائف التقييم على الخادم.';
  } catch (error) {
    const rawCode = typeof error?.code === 'string' ? error.code : 'unknown';
    const code = /^[a-zA-Z0-9/_-]{1,80}$/.test(rawCode) ? rawCode : 'unknown';
    result.textContent = `فشل الاختبار.\nالمرحلة: ${stage}\nرمز SDK: ${code}\nالإجراء المقترح: ${advice[stage]}\n\nلا تشارك رموز App Check أو بيانات Authorization أو أجسام الطلبات.`;
  } finally {
    button.disabled = false;
  }
});
