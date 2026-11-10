# اختبار قواعد مزامنة الحسابات

الملفات `firestore.rules` و`firebase.json` معدّة للمحاكي المحلي، ولا تنشئ حسابات أو قواعد بيانات إنتاجية. المسار المحمي هو:

`blackboxUsers/{uid}/state/progress`

يسمح فقط لصاحب `uid` بقراءة مستنده وكتابته. تُمنع قراءات المستخدم الآخر والزائر والقوائم والمسارات الأخرى والحذف المباشر. كل تحديث يجب أن يزيد `revision` واحدًا ويستخدم وقت الخادم. تُفحص بنية المستند وأنواع وحقول خرائط التقدّم الأساسية ومفاتيح المراحل؛ التحقق التفصيلي من كل نص وتاريخ وبند يتمّ أيضًا في العميل قبل الإرسال والاستخدام.

## تشغيل الاختبارات

تتطلب الأدوات Java 21 ومكتبات Firebase الرسمية للتطوير. يمكن تثبيتها في مجلد تطوير مستقل، دون إضافة أي مفاتيح خدمة:

```sh
npm install --prefix /tmp/blackbox-firebase-rules-test --no-audit --no-fund firebase-tools @firebase/rules-unit-testing firebase
```

ثم من مجلد المشروع:

```sh
BLACKBOX_FIREBASE_TEST_DEPS=/tmp/blackbox-firebase-rules-test \
/tmp/blackbox-firebase-rules-test/node_modules/.bin/firebase \
  emulators:exec --project demo-blackbox-account-tests --only firestore \
  'node --test --test-isolation=none tests/firestore-rules.test.mjs'
```

يُضبط `FIRESTORE_EMULATOR_HOST` بواسطة أمر المحاكي. إذا لم يوجد، يتخطّى ملف الاختبار فحوص القواعد بدل محاولة الوصول إلى الإنتاج؛ التخطي لا يعني نجاح فحص القواعد. يرفض الاختبار أيضًا عنوان محاكي غير محلي.

الإعداد يستخدم Firestore على `127.0.0.1:8180`، وAuth على `127.0.0.1:9199` إن شُغّل لاحقًا. لا توجد إعدادات Hosting أو أمر نشر ضمن الاختبارات.

عند استخدام مشروع Firebase مشترك مع تطبيقات أخرى، راجع القواعد الموجودة على الخدمة وادمج المسار المحمي قبل أي نشر؛ هذا الملف ينتهي بمنع المسارات الأخرى، ولا ينبغي أن يستبدل قواعد تطبيق آخر دون مراجعتها.

المراجع: [اختبار قواعد Firestore بالمحاكي](https://firebase.google.com/docs/firestore/security/test-rules-emulator)، و[ضبط حقول المستند](https://firebase.google.com/docs/firestore/security/rules-fields).
