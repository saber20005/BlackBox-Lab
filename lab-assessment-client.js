import { accountConfig } from './account-config.js';

// Use the *same* Firebase web-app singleton as BLACKBOX's existing account
// adapter. Never create an alternate anonymous grading identity.
const SDK_VERSION='12.18.0';
export const verifiedAssessmentConfigured =
  accountConfig.enabled && accountConfig.grading?.enabled === true &&
  Boolean(accountConfig.grading?.appCheckSiteKey);

function validStage(stageKey){
  if(!['logs-0','integrity-0','headers-0','email-0'].includes(stageKey))throw Error('المختبر غير متاح للتقييم الموثق.');
  return stageKey;
}
async function caller(name) {
  if(!verifiedAssessmentConfigured)throw Error('التقييم الخادمي غير مفعّل حتى الآن.');
  const [appSDK,authSDK]=await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
  ]);
  const app=appSDK.getApps().find(a=>a.name==='blackbox-accounts');
  if(!app||app.options.projectId!=='black-box-lab')throw Error('سجّل الدخول إلى BLACKBOX من صفحة الحساب ثم أعد المحاولة.');
  const auth=authSDK.getAuth(app),uid=auth.currentUser?.uid;
  if(!uid)throw Error('سجّل الدخول إلى BLACKBOX لإجراء تقييم موثّق.');
  const [checkSDK,functionsSDK]=await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app-check.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-functions.js`),
  ]);
  try{checkSDK.getAppCheck(app);}
  catch{checkSDK.initializeAppCheck(app,{
    provider:new checkSDK.ReCaptchaEnterpriseProvider(accountConfig.grading.appCheckSiteKey),
    isTokenAutoRefreshEnabled:true,
  });}
  const invoke=functionsSDK.httpsCallable(functionsSDK.getFunctions(app,'us-central1'),name,{timeout:30000});
  return async data=>{
    if(auth.currentUser?.uid!==uid)throw Error('تغير حساب المستخدم أثناء الطلب؛ لم نعتمد النتيجة.');
    const out=(await invoke(data)).data;
    if(auth.currentUser?.uid!==uid)throw Error('تغير حساب المستخدم أثناء الطلب؛ لم نعتمد النتيجة.');
    return out;
  };
}
const validId=x=>typeof x==='string'&&/^[a-z][a-z0-9-]{0,40}$/.test(x);
const unique=values=>new Set(values).size===values.length;
export function validateServerChallenge(data,stageKey){
  if(!data||data.stageKey!==stageKey||!Array.isArray(data.tasks)||data.tasks.length!==5||
    !Number.isSafeInteger(data.version)||data.version!==1||typeof data.description!=='string'||
    !data.tasks.every(task=>validId(task.id)&&typeof task.prompt==='string'&&
      Array.isArray(task.options)&&task.options.length>=3&&task.options.length<=6&&
      task.options.every(o=>validId(o.id)&&typeof o.label==='string')&&
      unique(task.options.map(o=>o.id)))||!unique(data.tasks.map(t=>t.id))){
    throw Error('محتوى التقييم غير متوافق؛ لن نعرض نتيجة محلية.');
  }
  return data;
}
export async function beginVerifiedAssessment(stageKey){
  validStage(stageKey);
  const call=await caller('beginVerifiedLabStage');
  const data=await call({stageKey});
  if(!data||data.challenge?.stageKey!==stageKey||
    !/^[0-9a-f-]{36}$/.test(data.sessionId??'')||
    !Number.isSafeInteger(data.expiresAtMs)||data.expiresAtMs<=Date.now())throw Error('رد الجلسة غير صالح.');
  return {stageKey,sessionId:data.sessionId,expiresAtMs:data.expiresAtMs,
    challenge:validateServerChallenge(data.challenge,stageKey)};
}
export async function submitVerifiedAssessment({stageKey,sessionId,responses}){
  validStage(stageKey);
  if(!/^[0-9a-f-]{36}$/.test(sessionId??'')||!Array.isArray(responses)||responses.length!==5)throw Error('إجابات غير مكتملة.');
  const call=await caller('submitVerifiedLabStage');
  const out=await call({stageKey,sessionId,responses});
  if(!out||out.stageKey!==stageKey||out.verifiedByServer!==true||
    out.maxScore!==70||!Number.isSafeInteger(out.score)||out.score<0||out.score>70||
    !Number.isSafeInteger(out.bestScore)||out.bestScore<out.score||out.bestScore>70||
    out.credentialEligible!==false)throw Error('رد النتيجة غير موثوق؛ لم نعتمد أي درجة.');
  return {score:out.score,maxScore:70,bestScore:out.bestScore,credentialEligible:false};
}
