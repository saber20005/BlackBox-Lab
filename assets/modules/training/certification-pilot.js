// Guided, read-only practice modules backed by the repository's existing
// synthetic training fixtures. These are NOT issuance records.
export const PILOT_EVIDENCE_LABS = Object.freeze([
  Object.freeze({
    id:'logs',stageKey:'logs-0',trackId:'logs',title:'التحقيق في جلسة دخول غير معتادة',
    subtitle:'اربط أحداث المصادقة والجهاز والمصدر دون القفز إلى استنتاج سرقة الجلسة.',
    minutes:30,category:'تحليل الحوادث',file:'auth-events.csv',
    commands:Object.freeze(['python3 analyze.py logs --json']),
    goals:Object.freeze(['ترتيب الأحداث زمنيًا ومراجعة هوية الجلسة.','اكتشاف تغير مصدر الجلسة دون تسجيل دخول ومصادقة جديدين.','الفصل بين الملاحظة والدلالة المحتملة وقرار التصعيد.']),
    steps:Object.freeze([
      'اقرأ auth-events.csv وحدد session_id للمستخدم الذي استمر استخدام جلسته من أكثر من مصدر.',
      'نفّذ أمر تحليل السجلات وحدد المصادر والأجهزة المرتبطة بتلك الجلسة، ثم قارنها بخطوات MFA.',
      'اكتب خطًا زمنيًا يتضمن أربع إشارات زمنية على الأقل مع مصدر كل إشارة، ثم استنتج فرضيتين ممكنتين دون الجزم بالاختراق.',
      'اقترح إجراء تحقق دفاعي محدودًا لتحديد ما إذا كان تغير المصدر متوقعًا أم يستدعي التحقيق.',
    ]),
    deliverables:Object.freeze(['جدول أحداث مع أوقات UTC والمصدر والجهاز','مذكرة تميّز الأدلة المؤكدة عن الفرضيات','خطوة تحقق أو استجابة مرتبطة بما رصدته']),
    caution:'الانتقال بين IPs قد يكون مشروعًا؛ لا تستنتج سرقة الجلسة من حقل منفرد.',
  }),
  Object.freeze({
    id:'integrity',stageKey:'integrity-0',trackId:'integrity',title:'اكتشاف تغييرات إعدادات غير معتمدة',
    subtitle:'قارن خط الأساس بالإعداد الجاري واحصر المفاتيح التي تغيرت دون اعتماد مسجل.',
    minutes:30,category:'سلامة الملفات',file:'integrity/baseline/ وintegrity/current/',
    commands:Object.freeze(['python3 analyze.py integrity --json']),
    goals:Object.freeze(['التمييز بين صحة بصمة مرجع محلي وأصالة مصدره.','استخراج إعدادات تغيرت مع السياق الذي يحدد اعتمادها.','صياغة معالجة وآلية إعادة تحقق دون العبث بملفات الدليل.']),
    steps:Object.freeze([
      'راجع integrity/baseline.sha256 وملف change-context.json؛ ما المرجع وما هي التغييرات الموافق عليها؟',
      'قارن نسخة baseline بنسخة current مستخدمًا أداة التحليل محليًا دون تعديل الملفين الأصليين.',
      'أنشئ جدولًا لكل مفتاح تغيّر، قيمته السابقة والجديدة، وهل توجد له موافقة مسجلة.',
      'اكتب طريقة تصحيح على نسخة عمل منفصلة وكيف ستثبت أن النسخة الجديدة وافقت السياسة المرجعية.',
    ]),
    deliverables:Object.freeze(['جدول فروق الإعدادات','بصمة المرجع وما الذي تثبته وما لا تثبته','خطة معالجة وإعادة تحقق على نسخة عمل']),
    caution:'تطابق SHA-256 مع ملف مرجعي من الحزمة لا يثبت أن مصدر المرجع موثوق خارجيًا.',
  }),
  Object.freeze({
    id:'headers',stageKey:'headers-0',trackId:'headers',title:'مراجعة دفاعات جلسة HTTP',
    subtitle:'قارن سياسات المتصفح وخصائص ملف الارتباط قبل المعالجة وبعدها.',
    minutes:25,category:'أمن الويب',file:'headers/before.txt وheaders/after.txt',
    commands:Object.freeze(['python3 analyze.py headers --json']),
    goals:Object.freeze(['تمييز صفات Secure وHttpOnly وSameSite.','تحديد أثر CSP وHSTS وnosniff ضمن سياق HTTPS.','تجنّب ادعاء حماية مؤكدة اعتمادًا على استجابة نصية فقط.']),
    steps:Object.freeze([
      'اقرأ ترويسات الاستجابة الاصطناعية قبل الإصلاح وتعرف على خصائص demo_session.',
      'شغل مقارنة headers واستخرج التغييرات الدفاعية التي تراها في النسخة اللاحقة.',
      'فسر أثر كل تغيير في جملة قصيرة، واذكر حدًا واحدًا لفحص الترويسات المنفصل عن اختبار المتصفح الفعلي.',
      'اكتب خطوات تحقق إضافية داخل تطبيق HTTPS تدريبي تملكه للتحقق من تطبيق الضوابط.',
    ]),
    deliverables:Object.freeze(['جدول الترويسات قبل وبعد','تحليل مختصر لأثر كل ضابط','اختبار تحقق مقترح ضمن بيئة مصرح بها']),
    caution:'ملفات HTTP المحفوظة ليست دليلًا على أن المتصفح طبق الضوابط أو أن الاتصال الحقيقي كان آمنًا.',
  }),
  Object.freeze({
    id:'email',stageKey:'email-0',trackId:'email',title:'فرز رسالة تصيد اصطناعية',
    subtitle:'قارن هوية المرسل وReply-To ونتائج SPF وDKIM وDMARC والتصرف المناسب.',
    minutes:25,category:'أمن البريد',file:'email/suspicious.eml وemail/legitimate.eml',
    commands:Object.freeze(['python3 analyze.py email --json']),
    goals:Object.freeze(['تفسير نتائج المصادقة وفق البوابة المتوقعة في سيناريو التدريب.','تحديد التناقضات بين From وReply-To والمحتوى.','صياغة توصية احتواء لا تتضمن فتح روابط أو جمع بيانات اعتماد.']),
    steps:Object.freeze([
      'افتح نسختَي الرسالة الاصطناعيتين كنصوص ولا تزُر أي رابط فيهما.',
      'استخدم أداة تحليل البريد وافصل بين نتائج SPF وDKIM وDMARC لكل رسالة.',
      'قارن مجال From وReply-To بنطاق الجهة التدريبية المتوقع، وحدد أي ادعاءات لا تستطيع التحقق منها من النص وحده.',
      'اكتب بلاغًا قصيرًا: العلامات المرصودة، درجة الثقة، وخطوة تحقق آمنة من مصدر مستقل.',
    ]),
    deliverables:Object.freeze(['جدول مقارنة من 3 أعمدة للمصادقة والمرسل والرد','بلاغ فرز يفصل المؤشرات عن الحكم النهائي','توصية تحقق واحتواء آمنة']),
    caution:'نتائج Authentication-Results في رسالة خارج سياق البوابة الموثوقة ليست دليلًا كافيًا بذاتها.',
  }),
]);
export const pilotLabById = id => PILOT_EVIDENCE_LABS.find(lab=>lab.id===id) ?? null;
export const pilotLabByStage = stageKey => PILOT_EVIDENCE_LABS.find(lab=>lab.stageKey===stageKey) ?? null;
export const certificatePilotCriteria = Object.freeze({
  localLabCount:PILOT_EVIDENCE_LABS.length,
  stageKnowledgeMax:70,
  requiresTrustedAuth:true,
  requiresAppCheck:true,
  requiresReviewedPrivateRubrics:true,
  requiresIndependentPracticalEvidence:true,
  issuanceEnabled:false,
});
