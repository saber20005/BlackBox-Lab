const initialStatus = { phase: 'guest', user: null, configured: false, syncing: false, pending: false, conflict: false, guestAvailable: false, message: '', error: null };

function friendlyError(error) {
  const code = String(error?.code || '');
  if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-login-credentials'].includes(code)) return 'تعذّر تسجيل الدخول بهذه البيانات. راجع البريد وكلمة المرور أو استخدم استعادة كلمة المرور.';
  if (code === 'auth/invalid-email') return 'اكتب عنوان بريد إلكتروني صالحًا.';
  if (code === 'auth/email-already-in-use') return 'تعذّر إنشاء الحساب بهذا البريد. جرّب تسجيل الدخول أو استعادة كلمة المرور.';
  if (['auth/weak-password', 'auth/password-does-not-meet-requirements'].includes(code)) return 'كلمة المرور لا تستوفي شروط الخدمة. استخدم كلمة أطول وأكثر تنوّعًا.';
  if (code === 'auth/too-many-requests') return 'تكررت المحاولات خلال وقت قصير. انتظر قليلًا ثم حاول مجددًا.';
  if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(code)) return 'أُغلقت نافذة Google قبل إكمال الدخول. يمكنك المحاولة مجددًا.';
  if (code === 'auth/popup-blocked') return 'منع المتصفح نافذة Google. اسمح بالنافذة المنبثقة لهذا الموقع ثم حاول مجددًا.';
  if (['auth/unauthorized-domain', 'auth/operation-not-allowed', 'account/unavailable', 'account/not-configured', 'account/configuration'].includes(code)) return 'خدمة الحسابات غير مهيّأة لهذا الخيار حاليًا. يمكنك متابعة التدريب كضيف ثم إعادة المحاولة لاحقًا.';
  if (['auth/network-request-failed', 'unavailable', 'account/offline'].includes(code)) return 'تعذّر الاتصال بالخدمة. يبقى تدريبك متاحًا؛ تحقق من الشبكة وحاول مجددًا.';
  if (['permission-denied', 'unauthenticated', 'auth/web-storage-unsupported'].includes(code)) return 'تعذّر الوصول إلى خدمة الحسابات. يمكنك الاحتفاظ بنسخة من عملك وإعادة الاتصال لاحقًا.';
  if (code === 'account/too-large') return 'بياناتك أكبر من حد المزامنة. لم يُحذف شيء؛ نزّل نسخة احتياطية وقلّل النصوص الطويلة قبل إعادة المحاولة.';
  if (code === 'account/not-ready') return 'انتظر تحميل تقدّم الحساب قبل نقل بيانات الضيف أو إعادة المزامنة.';
  if (code === 'account/conflict') return 'توجد تعديلات من جهاز آخر. اختر كيفية دمج النسختين في قسم التعارض.';
  if (code === 'account/session-changed') return 'تغيّر الحساب المستخدم. أعد تسجيل الدخول قبل المزامنة.';
  return 'تعذّر إتمام العملية الآن. راجع حالة الحفظ وحاول مجددًا بعد التحقق من الاتصال.';
}

export function mountAccountUI({ onAction, beforeOpen = () => {}, onExport = () => {}, getRecoveries = () => [] }) {
  const trigger = document.getElementById('accountButton');
  const dialog = document.createElement('dialog');
  dialog.id = 'accountDialog';
  dialog.className = 'account-dialog';
  dialog.setAttribute('aria-labelledby', 'accountDialogTitle');
  dialog.setAttribute('aria-describedby', 'accountDialogDescription');
  dialog.innerHTML = `
    <div class="account-dialog-head"><span class="eyebrow">BLACKBOX / حساب التدريب</span><button type="button" class="account-close" id="closeAccount" aria-label="إغلاق نافذة الحساب">×</button></div>
    <h2 id="accountDialogTitle">احفظ تقدّمك في حسابك</h2>
    <p id="accountDialogDescription" class="account-intro">التدريب متاح للضيف. الحساب يتيح حفظ تقدّمك وملاحظاتك ومتابعتها من أجهزة أخرى عند الاتصال.</p>
    <p id="accountOperationMessage" class="account-message hidden" role="alert"></p>
    <p id="accountServiceStatus" class="account-service-status" role="status" aria-live="polite"></p>
    <section id="accountGuestPanel">
      <div class="account-tabs" role="group" aria-label="خيارات الحساب"><button type="button" data-account-mode="signin" aria-pressed="true">تسجيل الدخول</button><button type="button" data-account-mode="signup" aria-pressed="false">إنشاء حساب</button></div>
      <form id="accountForm">
        <div class="field"><label for="accountEmail">البريد الإلكتروني</label><input id="accountEmail" name="email" type="email" autocomplete="email" inputmode="email" required dir="ltr" placeholder="name@example.com"></div>
        <div class="field" id="accountPasswordField"><label for="accountPassword">كلمة المرور</label><input id="accountPassword" name="password" type="password" autocomplete="current-password" required maxlength="4096" dir="ltr"><small id="accountPasswordHint" class="muted hidden">استخدم 8 أحرف على الأقل لكلمة المرور الجديدة.</small></div>
        <button type="submit" class="primary full-width" id="accountSubmit">تسجيل الدخول</button>
      </form>
      <button type="button" class="link-btn account-reset-link" id="accountResetMode">نسيت كلمة المرور؟</button>
      <button type="button" class="secondary full-width account-google" id="accountGoogle"><span aria-hidden="true" class="account-google-mark">G</span>المتابعة بحساب Google</button>
      <button type="button" class="link-btn account-guest-close" id="continueGuest">متابعة التدريب كضيف</button>
    </section>
    <section id="accountSignedInPanel" class="hidden">
      <div class="account-identity"><span class="account-avatar" aria-hidden="true">BB</span><div><strong id="accountUserName">حسابك</strong><span id="accountUserEmail" dir="ltr"></span></div></div>
      <p class="account-local-note">تقدّم الضيف منفصل عن بيانات حسابك. تسجيل الخروج يعيد عرض تقدّم الضيف على هذا المتصفح.</p>
      <div id="accountGuestImport" class="account-action-card hidden"><h3>نقل تقدّم هذا المتصفح</h3><p>يمكن دمج تقدّم الضيف مع حسابك. عند اختلاف الملاحظات يحتفظ الدمج بنصوص النسختين.</p><button type="button" class="secondary full-width" id="importGuestProgress">نقل تقدّم الضيف إلى الحساب</button></div>
      <div id="accountRecoveries" class="account-action-card hidden"><h3>مسودات محفوظة على هذا المتصفح</h3><p id="accountRecoveryDescription"></p><div id="accountRecoveryDownloads" class="account-choice-buttons"></div></div>
      <div id="accountConflict" class="account-action-card hidden"><h3>تعديلات من جهاز آخر</h3><p>اختر الدمج للاحتفاظ بنصوص النسختين. اختيار نسخة واحدة يستبدل النسخة الحالية بها.</p><div class="account-choice-buttons"><button type="button" class="primary" data-conflict="merge">دمج النسختين</button><button type="button" class="secondary" data-conflict="cloud">استخدام نسخة الحساب</button><button type="button" class="secondary" data-conflict="local">رفع نسخة هذا الجهاز</button></div></div>
      <div class="account-choice-buttons account-session-actions"><button type="button" class="secondary" id="syncAccountNow">مزامنة الآن</button><button type="button" class="secondary" id="accountSignOut">تسجيل الخروج</button></div>
      <div id="accountUnsyncedSignOut" class="account-action-card hidden"><h3>تعديلات لم تُزامن بعد</h3><p>نزّل نسخة من عملك أو ابقَ حتى تكتمل المزامنة. الخروج الآن قد يزيل النسخة المحلية الخاصة بالحساب.</p><div class="account-choice-buttons"><button type="button" class="secondary" id="exportBeforeSignOut">تنزيل نسخة من التقدّم</button><button type="button" class="secondary" id="cancelSignOut">البقاء في الحساب</button><button type="button" class="secondary danger" id="confirmUnsyncedSignOut">الخروج دون مزامنة</button></div></div>
    </section>
    <button type="button" class="link-btn account-retry hidden" id="retryAccountConnection">إعادة الاتصال بخدمة الحسابات</button>
  `;
  document.body.append(dialog);
  let status = { ...initialStatus };
  let mode = 'signin';
  let busy = false;
  let recoveryIdentity = '';

  const element = id => document.getElementById(id);
  function message(text = '', isError = true) {
    const node = element('accountOperationMessage');
    node.textContent = text;
    node.classList.toggle('hidden', !text);
    node.classList.toggle('success', !isError);
    node.setAttribute('role', isError ? 'alert' : 'status');
  }
  function setMode(next) {
    mode = next;
    message();
    element('accountPasswordField').classList.toggle('hidden', mode === 'reset');
    element('accountPassword').required = mode !== 'reset';
    element('accountPassword').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    element('accountPassword').minLength = mode === 'signup' ? 8 : 0;
    element('accountPasswordHint').classList.toggle('hidden', mode !== 'signup');
    element('accountSubmit').textContent = mode === 'signup' ? 'إنشاء حساب' : mode === 'reset' ? 'إرسال رابط الاستعادة' : 'تسجيل الدخول';
    element('accountResetMode').textContent = mode === 'reset' ? 'العودة لتسجيل الدخول' : 'نسيت كلمة المرور؟';
    dialog.querySelectorAll('[data-account-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.accountMode === mode)));
    element('accountGoogle').classList.toggle('hidden', mode === 'reset');
  }
  function update(next) {
    const previousUserId = status.user?.uid;
    status = { ...status, ...next };
    const signedIn = Boolean(status.user);
    if (previousUserId !== status.user?.uid) {
      element('accountPassword').value = '';
      element('accountUnsyncedSignOut').classList.add('hidden');
      recoveryIdentity = '';
      element('accountRecoveryDownloads').replaceChildren();
    }
    trigger.textContent = signedIn ? 'حسابي' : 'سجّل لحفظ تقدّمك';
    trigger.setAttribute('aria-label', signedIn ? 'فتح حساب التدريب' : 'تسجيل الدخول لحفظ التقدّم');
    element('accountGuestPanel').classList.toggle('hidden', signedIn);
    element('accountSignedInPanel').classList.toggle('hidden', !signedIn);
    element('accountDialogTitle').textContent = signedIn ? 'حساب التدريب' : 'احفظ تقدّمك في حسابك';
    element('accountDialogDescription').classList.toggle('hidden', signedIn);
    const serviceMessage = status.error && !String(status.error).startsWith('account/') ? friendlyError({ code: status.error }) : status.message;
    element('accountServiceStatus').textContent = serviceMessage || (status.phase === 'loading' ? 'جارٍ الاتصال بخدمة الحسابات…' : signedIn ? 'متابعة حالة حفظ حسابك' : 'يمكنك متابعة التدريب كضيف دون تسجيل.');
    element('accountServiceStatus').classList.toggle('error', Boolean(status.error));
    element('accountUserName').textContent = status.user?.displayName || 'حسابك في BLACKBOX';
    element('accountUserEmail').textContent = status.user?.email || '';
    element('accountGuestImport').classList.toggle('hidden', !signedIn || !status.guestAvailable);
    const recoveries = signedIn && status.recoveryCount > 0 ? getRecoveries() : [];
    element('accountRecoveries').classList.toggle('hidden', recoveries.length === 0);
    element('accountRecoveryDescription').textContent = recoveries.length ? `عُثر على ${recoveries.length} من المسودات المحلية لهذا الحساب. يمكنك تنزيل كل مسودة كنسخة قابلة للاستعادة قبل معالجة التعارض.` : '';
    const nextRecoveryIdentity = JSON.stringify(recoveries.map(copy => [copy.id, copy.savedAt]));
    if (nextRecoveryIdentity !== recoveryIdentity) {
      recoveryIdentity = nextRecoveryIdentity;
      element('accountRecoveryDownloads').replaceChildren(...recoveries.map((copy, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary';
        button.textContent = `تنزيل المسودة ${index + 1}`;
        button.addEventListener('click', () => run('exportRecovery', { id: copy.id }));
        return button;
      }));
    }
    element('accountConflict').classList.toggle('hidden', !signedIn || !status.conflict);
    element('retryAccountConnection').classList.toggle('hidden', status.configured && !status.error && status.phase !== 'error');
    element('accountSidebarName').textContent = signedIn ? status.user.displayName || 'حساب التدريب' : 'مساحتك الخاصة';
    element('accountSidebarNote').textContent = signedIn ? 'حسابك وتقدّمك' : 'تدريب متاح للضيف';
    const notice = element('accountSyncNotice');
    const needsAttention = signedIn && (status.conflict || status.phase === 'error' || Boolean(status.error));
    notice.classList.toggle('hidden', !needsAttention);
    element('accountSyncNoticeText').textContent = needsAttention ? serviceMessage || 'تحتاج حالة مزامنة الحساب إلى مراجعة.' : '';
    dialog.querySelectorAll('button:not(#closeAccount):not(#continueGuest), input').forEach(control => { control.disabled = busy; });
    const emailReady = status.configured && status.providers?.email !== false && status.phase !== 'loading';
    const googleReady = status.configured && status.providers?.google !== false && status.phase !== 'loading';
    for (const id of ['accountEmail', 'accountPassword', 'accountSubmit', 'accountResetMode']) element(id).disabled = busy || !emailReady;
    dialog.querySelectorAll('[data-account-mode]').forEach(control => { control.disabled = busy || !emailReady; });
    element('accountGoogle').disabled = busy || !googleReady;
    dialog.setAttribute('aria-busy', String(busy));
  }
  async function run(action, payload = {}) {
    if (busy) return;
    busy = true; message(); update(status);
    try {
      await onAction(action, payload);
      if (action === 'resetPassword') message('إذا كان البريد مسجّلًا، ستصلك رسالة تحتوي على خطوات استعادة كلمة المرور.', false);
      else if (action === 'signUpEmail') message('أُنشئ الحساب. يمكنك الآن متابعة حالة حفظ تقدّمك.', false);
      else if (action === 'importGuest') message('اكتملت عملية نقل تقدّم الضيف. راجع حالة المزامنة أعلاه.', false);
      if (action === 'signOut') element('accountUnsyncedSignOut').classList.add('hidden');
      if (['signInEmail', 'signUpEmail', 'signOut'].includes(action)) element('accountPassword').value = '';
      if (action === 'signOut') element('accountEmail').value = '';
    } catch (error) {
      if (action === 'signOut' && error?.code === 'account/unsynced') element('accountUnsyncedSignOut').classList.remove('hidden');
      else message(friendlyError(error));
    } finally { busy = false; update(status); }
  }
  function open() {
    beforeOpen();
    message();
    update(status);
    if (!dialog.open) dialog.showModal();
    if (!status.user) element('accountEmail').focus();
  }
  function close() { dialog.close(); element('accountPassword').value = ''; }
  trigger.addEventListener('click', open);
  element('reviewAccountSync').addEventListener('click', open);
  element('closeAccount').addEventListener('click', close);
  element('continueGuest').addEventListener('click', close);
  dialog.addEventListener('close', () => { element('accountPassword').value = ''; });
  dialog.querySelectorAll('[data-account-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.accountMode)));
  element('accountResetMode').addEventListener('click', () => setMode(mode === 'reset' ? 'signin' : 'reset'));
  element('accountForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const email = element('accountEmail').value.trim();
    if (mode === 'reset') run('resetPassword', { email });
    else run(mode === 'signup' ? 'signUpEmail' : 'signInEmail', { email, password: element('accountPassword').value });
  });
  element('accountGoogle').addEventListener('click', () => run('signInGoogle'));
  element('accountSignOut').addEventListener('click', () => run('signOut'));
  element('confirmUnsyncedSignOut').addEventListener('click', () => run('signOut', { discardUnsynced: true }));
  element('cancelSignOut').addEventListener('click', () => element('accountUnsyncedSignOut').classList.add('hidden'));
  element('exportBeforeSignOut').addEventListener('click', onExport);
  element('importGuestProgress').addEventListener('click', () => run('importGuest'));
  element('syncAccountNow').addEventListener('click', () => run('syncNow'));
  element('retryAccountConnection').addEventListener('click', () => run('retry'));
  dialog.querySelectorAll('[data-conflict]').forEach(button => button.addEventListener('click', () => run('resolveConflict', { choice: button.dataset.conflict })));
  update(status);
  return { update, open, close };
}
