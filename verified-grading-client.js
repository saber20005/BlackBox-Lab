import { accountConfig } from './account-config.js';

const SDK = '12.18.0';
const casePattern = /^INC-[0-9]{4}$/;
let clientPromise;

export function gradingAvailable(config = accountConfig) {
  return Boolean(config.enabled && config.grading?.enabled && config.grading?.appCheckSiteKey);
}

async function gradingClient() {
  if (!gradingAvailable()) throw new Error('التقييم الموثق غير مفعّل بعد. يجب إعداد App Check ونشر وظائف التقييم أولاً.');
  if (!clientPromise) clientPromise = (async () => {
    const [appSDK, authSDK, functionsSDK, appCheckSDK] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-functions.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app-check.js`)
    ]);
    const app = appSDK.getApps().find(candidate => candidate.name === 'blackbox-accounts') ?? appSDK.initializeApp(accountConfig.firebase, 'blackbox-accounts');
    const auth = authSDK.getAuth(app);
    appCheckSDK.initializeAppCheck(app, {
      provider: new appCheckSDK.ReCaptchaEnterpriseProvider(accountConfig.grading.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true
    });
    const functions = functionsSDK.getFunctions(app, 'us-central1');
    return { auth, start: functionsSDK.httpsCallable(functions, 'startGradingSession'), submit: functionsSDK.httpsCallable(functions, 'submitGradingAnswer') };
  })().catch(error => { clientPromise = undefined; throw error; });
  return clientPromise;
}

export async function startVerifiedGrading(caseId, expectedUid) {
  if (!casePattern.test(caseId)) throw new Error('معرّف التحدي يجب أن يكون بصيغة INC-0001.');
  const client = await gradingClient();
  if (!expectedUid || client.auth.currentUser?.uid !== expectedUid) throw new Error('سجّل الدخول إلى حسابك قبل بدء التقييم.');
  const response = await client.start({ caseId });
  if (client.auth.currentUser?.uid !== expectedUid) throw new Error('تغيّر الحساب أثناء العملية. أعد المحاولة.');
  const { sessionId, expiresAtMs } = response.data ?? {};
  if (typeof sessionId !== 'string' || !Number.isFinite(expiresAtMs)) throw new Error('استجابة بدء التقييم غير صالحة.');
  return { sessionId, expiresAtMs, caseId, uid: expectedUid };
}

export async function submitVerifiedAnswer(session, answer, expectedUid) {
  if (!session || session.uid !== expectedUid || !expectedUid) throw new Error('الجلسة لا تخص الحساب الحالي.');
  if (Date.now() >= session.expiresAtMs) throw new Error('انتهت صلاحية الجلسة. ابدأ جلسة جديدة.');
  if (typeof answer !== 'string' || answer.length > 256) throw new Error('الإجابة يجب ألا تتجاوز 256 حرفاً.');
  const client = await gradingClient();
  if (client.auth.currentUser?.uid !== expectedUid) throw new Error('تغيّر الحساب. أعد تسجيل الدخول.');
  const response = await client.submit({ caseId: session.caseId, sessionId: session.sessionId, answer });
  if (client.auth.currentUser?.uid !== expectedUid) throw new Error('تغيّر الحساب أثناء إرسال الإجابة.');
  if (response.data?.verifiedByServer !== true) throw new Error('لم يؤكد الخادم النتيجة.');
  return response.data;
}
