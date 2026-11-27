import {accountConfig} from '../account-config.js';
const SDK='12.18.0', status=document.getElementById('status'), panel=document.getElementById('panel'), grid=document.getElementById('metrics'), refresh=document.getElementById('refresh'), asof=document.getElementById('asof');
const cards=[['إجمالي الحسابات','totalAccounts'],['الحسابات الجديدة اليوم','accountsCreatedToday'],['حسابات دخلت اليوم','accountsLastSignedInToday'],['حسابات دخلت خلال 7 أيام','accountsLastSignedIn7d'],['حسابات دخلت خلال 30 يومًا','accountsLastSignedIn30d'],['حسابات مرتبطة بـGoogle','googleLinkedAccounts'],['حسابات مرتبطة بالبريد وكلمة المرور','passwordLinkedAccounts'],['الحسابات المعطّلة','disabledAccounts'],['عمليات الدخول اليوم','loginEventsToday']];
let generation=0, auth, read;
function render(metrics){grid.replaceChildren();for(const [label,key] of cards){const card=document.createElement('article'), title=document.createElement('span'), value=document.createElement('strong');title.textContent=label;value.textContent=Number.isSafeInteger(metrics?.[key])?metrics[key].toLocaleString('ar-JO'):'غير متاح';card.append(title,value);grid.append(card);}asof.textContent=metrics?.asOf?'آخر قراءة: '+new Date(metrics.asOf).toLocaleString('ar-JO',{timeZone:'Asia/Amman'}):'';}
async function load(user){const run=++generation;panel.hidden=true;render(null);refresh.disabled=true;
  if(!user){status.textContent='سجّل الدخول بحساب إداري من الصفحة الرئيسية أولًا.';return;}
  status.textContent='جارٍ التحقق من صلاحية المدير...';
  try{const token=await user.getIdTokenResult(true);
    if(run!==generation||auth.currentUser?.uid!==user.uid)return;
    if(token.claims.admin!==true){status.textContent='وصول مرفوض: حساب غير إداري.';return;}
    panel.hidden=false;status.textContent='جارٍ قراءة البيانات من الخادم...';
    const reply=await read({});
    if(run!==generation||auth.currentUser?.uid!==user.uid)return;
    const metrics=reply.data?.status==='ready'?reply.data.metrics:null;render(metrics);
    status.textContent=metrics?'بيانات من الخادم — توقيت الأردن':'مصدر الإحصائيات غير مفعّل بعد.';
  }catch(error){if(run!==generation)return;panel.hidden=true;render(null);status.textContent=error?.code==='functions/permission-denied'?'وصول مرفوض: الصلاحية غير معتمدة على الخادم.':'تعذّر قراءة الإحصائيات من الخادم. أعد فتح الصفحة.';}
  finally{if(run===generation)refresh.disabled=false;}
}
async function init(){if(!accountConfig.enabled||!accountConfig.grading?.appCheckSiteKey)throw Error('not-configured');
  const [appSDK,authSDK,appCheckSDK,functionsSDK]=await Promise.all(['app','auth','app-check','functions'].map(name=>import('https://www.gstatic.com/firebasejs/'+SDK+'/firebase-'+name+'.js')));
  const app=appSDK.getApps().find(a=>a.name==='blackbox-accounts')??appSDK.initializeApp(accountConfig.firebase,'blackbox-accounts');
  appCheckSDK.initializeAppCheck(app,{provider:new appCheckSDK.ReCaptchaEnterpriseProvider(accountConfig.grading.appCheckSiteKey),isTokenAutoRefreshEnabled:true});
  auth=authSDK.getAuth(app);
  read=functionsSDK.httpsCallable(functionsSDK.getFunctions(app,'us-central1'),'getAdminAuthMetrics');
  refresh.addEventListener('click',()=>void load(auth.currentUser));
  authSDK.onAuthStateChanged(auth,user=>void load(user));
}
void init().catch(()=>{status.textContent='تعذّر تهيئة لوحة الإدارة. راجع إعداد App Check والاتصال.';});
