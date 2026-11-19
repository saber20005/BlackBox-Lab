(() => {
'use strict';
const $=id=>document.getElementById(id);
const landing=$('landing-page'),overlay=$('bb-tour-overlay'),spot=$('bb-tour-spotlight'),bubble=$('bb-tour-bubble');
const tour=[
{selector:'[data-view="home"]',title:'1. تدريبي — خطوتك التالية',text:'ابدأ من هنا في كل جلسة. ستجد المهمة التي يمكنك متابعتها وملخصًا قصيرًا لتقدمك.\n\nاضغط «تدريبي» أو استخدم التالي.'},
{selector:'[data-view="tracks"]',title:'2. المسارات — اختر مهارتك',text:'ابحث عن تدريب يناسبك، ثم افتح مرحلة متاحة. بعض المسارات تعمل بملفات التدريب داخل المتصفح، وبعضها يحتاج إلى مختبر محلي.\n\nاقرأ المطلوب وحلّل الأدلة، ثم دوّن إجابتك وأكّد ما أنجزته.'},
{selector:'[data-view="progress"]',title:'3. تقدّمي — راجع رحلتك',text:'تجد هنا ملخص إنجازك والمهام وبصمة المهارات وسجل التدريب وملف الأعمال. يمكنك أيضًا الوصول إلى خطة الجلسة ونتائج تحقيقات CyberTrace المرتبطة.\n\nالمراحل التي تؤكدها يدويًا تبقى مختلفة عن نتائج التقييم الموثق.'},
{selector:'[data-view="account"]',title:'4. حسابي — الحفظ والأدوات',text:'راجع حسابك وحالة المزامنة، أو احتفظ بعملك في نسخة احتياطية. ستجد هنا أدوات إعداد المختبر والمساعدة.\n\nيمكنك التدريب كضيف، وتبقى بيانات الضيف في متصفحك. يظهر مصدر الحفظ دائمًا أعلى الصفحة.'}
];
let ti=0,active=false,prior=null,target=null;
const availableTour=()=>tour.filter(step=>{const el=document.querySelector(step.selector);return el&&!el.classList.contains('hidden')&&getComputedStyle(el).display!=='none';});
let activeTour=[];
// History normalization may remove ?view=home before this deferred script runs.
let initialScreen=true;
let initialPageURL;
try{initialPageURL=new URL(globalThis.performance?.getEntriesByType?.('navigation')?.[0]?.name||location.href);}catch{initialPageURL=new URL(location.href);}
function isHome(){const p=new URL(location.href).searchParams;return !['view','track','stage'].some(k=>p.has(k));}
const introSeenKey='blackbox-lab-intro-seen-v1';
function hasSeenIntro(){try{return localStorage.getItem(introSeenKey)==='1';}catch{return false;}}
function markIntroSeen(){try{localStorage.setItem(introSeenKey,'1');}catch{}}
function enter(){markIntroSeen();document.body.classList.remove('bb-landing-active');landing.hidden=true;}
function showLanding(){
const url=new URL(location.href);
const requestedWorkspace=initialScreen&&['view','track','stage'].some(key=>initialPageURL.searchParams.has(key));
initialScreen=false;
if(requestedWorkspace){enter();return;}
if(!isHome()){landing.hidden=true;document.body.classList.remove('bb-landing-active');return;}
if(hasSeenIntro()&&!url.searchParams.has('intro')){landing.hidden=true;document.body.classList.remove('bb-landing-active');return;}
landing.hidden=false;document.body.classList.add('bb-landing-active');
const setup=$('local-lab-setup');
if(url.searchParams.get('intro')==='1'&&url.hash==='#local-lab-setup'&&setup){setup.open=true;setup.scrollIntoView({block:'start'});}
}
function place(){
target=document.querySelector(activeTour[ti]?.selector);if(!target){finish();return;}
target.scrollIntoView({block:'nearest',behavior:'auto'});
const r=target.getBoundingClientRect(),pad=5;
Object.assign(spot.style,{top:Math.max(0,r.top-pad)+'px',left:Math.max(0,r.left-pad)+'px',width:r.width+pad*2+'px',height:r.height+pad*2+'px'});
$('bb-tour-heading').textContent=activeTour[ti].title.replace(/^\d+\./,(ti+1)+'.');$('bb-tour-description').textContent=activeTour[ti].text;
$('bb-tour-count').textContent=(ti+1)+' / '+activeTour.length;
$('bb-tour-prev').disabled=ti===0;$('bb-tour-next').textContent=ti===activeTour.length-1?'إنهاء الجولة':'تخطي هذه الخطوة ←';
const width=Math.min(340,innerWidth-32);let left=Math.max(16,Math.min(innerWidth-width-16,r.right+14));if(r.right+width+25>innerWidth)left=Math.max(16,r.left-width-14);
let top=Math.max(12,Math.min(innerHeight-bubble.offsetHeight-12,r.top));if(innerWidth<700){left=16;top=Math.max(12,innerHeight-bubble.offsetHeight-12);}
Object.assign(bubble.style,{left:left+'px',top:top+'px'});
target.classList.add('bb-tour-target');
}
function focusVisible(element){
if(!element||element.isConnected===false||element.disabled||!element.getClientRects().length)return false;
const style=getComputedStyle(element);if(style.display==='none'||style.visibility==='hidden')return false;
element.focus({preventScroll:true});return true;
}
function advance(){target?.classList.remove('bb-tour-target');if(ti>=activeTour.length-1){finish();return;}ti++;place();}
function finish(restore=true){
if(!active)return;
const lastTarget=target;target?.classList.remove('bb-tour-target');active=false;overlay.hidden=true;window.removeEventListener('resize',place);
if(restore&&!focusVisible(prior)&&!focusVisible(lastTarget))focusVisible($('main-content'));
prior=null;target=null;
}
function begin(){
if(document.querySelector('dialog[open]'))return;
if(active)finish(false);
prior=document.activeElement;enter();activeTour=availableTour();if(!activeTour.length){prior=null;focusVisible($('main-content'));return;}
ti=0;active=true;bubble.setAttribute('aria-modal','false');overlay.hidden=false;window.addEventListener('resize',place);place();$('bb-tour-next').focus();
}
document.addEventListener('click',e=>{if(!active||!target)return;const clicked=e.target.closest('button');if(clicked===target){advance();}});
for(const id of ['landing-enter','landing-enter-top'])$(id)?.addEventListener('click',enter);
for(const id of ['landing-start-tour','landing-start-tour-bottom'])$(id)?.addEventListener('click',begin);
$('bb-tour-next')?.addEventListener('click',advance);
$('bb-tour-prev')?.addEventListener('click',()=>{if(ti){target?.classList.remove('bb-tour-target');ti--;place();}});
$('bb-tour-skip')?.addEventListener('click',finish);
document.addEventListener('keydown',e=>{if(active&&e.key==='Escape'&&!document.querySelector('dialog[open]')){e.preventDefault();finish();}});
document.addEventListener('blackbox:stop-tour',()=>finish(false));
if(typeof MutationObserver!=='undefined')new MutationObserver(()=>{if(active&&document.querySelector('dialog[open]'))finish(false);}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
window.addEventListener('popstate',()=>{
const wasActive=active;finish(false);if(isHome())showLanding();else enter();
if(wasActive){if(!landing.hidden)focusVisible($('landing-start-tour'));else focusVisible($('main-content'));}
});
const prompts=[
{title:'ما نظام التشغيل الذي تستخدمه؟',help:'الشرح الحالي مخصص لـWindows مع VirtualBox. يمكن متابعة الإرشادات العامة على الأنظمة الأخرى.',choices:[['windows','Windows'],['other','Linux / macOS']]},
{title:'هل VirtualBox مثبت ويعمل؟',help:'يمكنك تنزيل VirtualBox من الموقع الرسمي virtualbox.org. اختبر تشغيل آلة افتراضية قبل المتابعة.',choices:[['yes','نعم، يعمل'],['no','لا، أحتاج إلى تثبيته']]},
{title:'هل Kali Linux يعمل داخل VirtualBox؟',help:'استخدم صورة Kali الرسمية من kali.org. لا تعتمد على صور مجهولة المصدر.',choices:[['yes','نعم، يعمل'],['no','لا، أحتاج إلى تجهيزه']]},
{title:'هل جهزت شبكة مختبر معزولة وSnapshot؟',help:'للربط مع Windows استخدم Host-only، وللعزل بين الآلات فقط استخدم Internal Network. لا تعرض الأنظمة الضعيفة على Bridged.',choices:[['yes','نعم، تحققت من الشبكة واللقطة'],['no','لم أجهزها بعد']]},
{title:'هل أنت جاهز للبدء بمسار تدريبي؟',help:'تأكد أن لديك تصريحاً باختبار جميع الآلات، ثم اختر المسار المناسب من لوحة التحكم.',choices:[['yes','نعم، جاهز'],['no','أحتاج إلى مراجعة الإعداد']]}
];
const storageKey='blackbox-lab-setup-guide-v3';
let wizard={level:'beginner',step:0,answers:{},confirmed:{}};
try{const v=JSON.parse(localStorage.getItem(storageKey)||'null');if(v&&['beginner','hobbyist','intermediate','advanced'].includes(v.level)&&Number.isInteger(v.step)){wizard={level:v.level,step:Math.max(0,Math.min(4,v.step)),answers:v.answers||{},confirmed:v.confirmed||{}};}}catch{}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(wizard));}catch{}}
function renderWizard(){
const i=wizard.step,p=prompts[i];$('bb-wizard-count').textContent='الخطوة '+(i+1)+' من '+prompts.length;$('bb-wizard-progress').value=i+1;
$('bb-wizard-question').textContent=p.title;$('bb-wizard-help').textContent=p.help;
const wrap=$('bb-wizard-answers');wrap.replaceChildren();
p.choices.forEach(([value,label])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.className=wizard.answers[i]===value?'selected':'';b.setAttribute('aria-pressed',String(wizard.answers[i]===value));b.addEventListener('click',()=>{wizard.answers[i]=value;wizard.confirmed[i]=false;save();renderWizard();});wrap.append(b);});
$('bb-wizard-check').hidden=!wizard.answers[i] || (i>0 && wizard.answers[i]!=='yes');$('bb-wizard-confirm').checked=!!wizard.confirmed[i];
$('bb-wizard-feedback').textContent=wizard.answers[i]==='no'?'يجب إكمال التجهيز والتحقق منه قبل الانتقال. لا يمكن تجاوز هذه الخطوة.':(wizard.answers[i]&&!wizard.confirmed[i]?'ضع علامة التأكيد بعد التحقق الفعلي للمتابعة.':'');
$('bb-wizard-back').disabled=i===0;$('bb-wizard-next').textContent=i===4?'عرض خطة التدريب ←':'التالي ←';
document.querySelectorAll('input[name="bb-level"]').forEach(el=>el.checked=el.value===wizard.level);
}
$('bb-wizard-confirm')?.addEventListener('change',e=>{wizard.confirmed[wizard.step]=e.target.checked;save();});
$('bb-wizard-back')?.addEventListener('click',()=>{if(wizard.step>0){wizard.step--;save();renderWizard();}});
$('bb-wizard-next')?.addEventListener('click',()=>{
if(!wizard.answers[wizard.step]){$('bb-wizard-feedback').textContent='اختر إجابة قبل المتابعة.';return;}
if(wizard.step>0 && wizard.answers[wizard.step]!=='yes'){$('bb-wizard-feedback').textContent='لا يمكن المتابعة: أكمل إعداد هذه الخطوة أولاً ثم اختر نعم.';return;}
if(!wizard.confirmed[wizard.step]){$('bb-wizard-feedback').textContent='يجب أن تؤكد بنفسك أنك تحققت من هذه الخطوة قبل المتابعة.';return;}
if(wizard.step<4){wizard.step++;save();renderWizard();return;}
const labels={beginner:'مبتدئ',hobbyist:'هاوٍ',intermediate:'متوسط',advanced:'متقدم'};
const incomplete=prompts.map((p,i)=>({p,i})).filter(({i})=>(i>0&&wizard.answers[i]!=='yes')||!wizard.confirmed[i]);
const result=$('bb-wizard-result');result.hidden=false;result.replaceChildren();
const heading=document.createElement('h3');heading.textContent='خطتك الشخصية — '+labels[wizard.level];result.append(heading);
const paragraph=document.createElement('p');paragraph.textContent=incomplete.length?'لا تزال هناك خطوات تحتاج إلى تجهيز أو تأكيد. يمكنك استكشاف الموقع الآن، لكن جاهزية المختبر غير مؤكدة.':'أكملت تأكيد خطوات التجهيز بنفسك. يمكنك الآن اختيار مسار التدريب.';result.append(paragraph);
const ul=document.createElement('ul');const suggestions={
beginner:['ابدأ بمسار الاستطلاع الآمن، وتعلم قراءة عناوين IP.','نفّذ مهمة واحدة في كل جلسة وسجل ملاحظاتك.'],
hobbyist:['ابدأ بالاستطلاع الآمن ثم Nmap داخل Host-only.','قارن النتائج مع أهداف المختبر المسموح بها.'],
intermediate:['راجع مسار Nmap وتحليل الشبكات، ثم وثّق أدلة كل مرحلة.','أنشئ تقريراً لكل جلسة.'],
advanced:['ابدأ بمسار تحليل الشبكات أو تطبيقات الويب وفق مختبرك.','اختبر الفرضيات ووثّق القيود والنتائج القابلة لإعادة الإنتاج.']
};[...suggestions[wizard.level],...incomplete.map(({p})=>'راجع: '+p.title)].forEach(t=>{const li=document.createElement('li');li.textContent=t;ul.append(li);});result.append(ul);
const button=document.createElement('button');button.textContent='افتح مسارات التدريب ←';button.addEventListener('click',()=>{enter();document.querySelector('[data-view="tracks"]')?.click();});result.append(button);result.scrollIntoView({behavior:'smooth',block:'center'});
});
document.querySelectorAll('input[name="bb-level"]').forEach(el=>el.addEventListener('change',()=>{wizard.level=el.value;save();renderWizard();}));
renderWizard();showLanding();
document.documentElement.dataset.bbLandingReady = 'true';
document.dispatchEvent(new Event('blackbox:screen-ready'));
})();
