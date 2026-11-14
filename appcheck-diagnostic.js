import { accountConfig } from './account-config.js';

const button = document.getElementById('run');
const result = document.getElementById('result');
const SDK = '12.18.0';

button.addEventListener('click', async () => {
  button.disabled = true;
  result.textContent = 'جارٍ طلب رمز App Check من Firebase...';
  try {
    if (location.protocol !== 'https:' || !accountConfig.grading?.appCheckSiteKey) {
      throw new Error('configuration-unavailable');
    }
    const [appSDK, checkSDK] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app-check.js`)
    ]);
    const app = appSDK.getApps().find(item => item.name === 'blackbox-appcheck-diagnostic')
      ?? appSDK.initializeApp(accountConfig.firebase, 'blackbox-appcheck-diagnostic');
    const check = checkSDK.initializeAppCheck(app, {
      provider: new checkSDK.ReCaptchaEnterpriseProvider(accountConfig.grading.appCheckSiteKey),
      isTokenAutoRefreshEnabled: false
    });
    const response = await checkSDK.getToken(check);
    if (typeof response.token !== 'string' || response.token.length === 0) {
      throw new Error('empty-token');
    }
    result.textContent = 'نجح الاختبار: تم الحصول على رمز App Check. لم يتم عرض الرمز أو حفظه. هذا لا يثبت نجاح وظائف التقييم على الخادم.';
  } catch (error) {
    // Deliberately avoid printing tokens, SDK internals, or credentials.
    const code = typeof error?.code === 'string' ? error.code.slice(0, 100) : 'unknown';
    result.textContent = `فشل الاختبار. رمز الخطأ: ${code}. افتح Network لمراجعة طلبات Firebase، دون مشاركة رموز المصادقة.`;
  } finally {
    button.disabled = false;
  }
});
