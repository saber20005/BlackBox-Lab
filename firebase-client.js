import { accountConfig } from './account-config.js';
import { createBackup, parseBackup } from './progress.js';
import { normalizeReceipt } from './cybertrace-catalog.js';
 
// Ignore identical Firestore metadata echoes without losing the offline-to-
// server-confirmed transition. Only a canonical in-memory key is retained.
export function skillsDeliveryKey(receipts, fromCache) {
  const entries = Object.keys(receipts).sort().map(id => [id, receipts[id]]);
  return JSON.stringify([fromCache === true, entries]);
}


export const MAX_CLOUD_BYTES = 700000;
const SDK_VERSION = '12.18.0';
const unavailable = () => Object.assign(new Error('تسجيل الحسابات والمزامنة قيد الإعداد. يمكنك مواصلة التدريب كضيف وحفظ نسخة من عملك.'), { code: 'account/unavailable' });

export function validateCloudProgress(progress) {
  const backup = createBackup(progress);
  const bytes = new TextEncoder().encode(JSON.stringify(backup.data)).byteLength;
  if (bytes > MAX_CLOUD_BYTES) {
    throw Object.assign(new Error('حجم بيانات التدريب أكبر من حد المزامنة. لم يُحذف شيء؛ نزّل نسخة احتياطية وقلّل النصوص الطويلة قبل إعادة المحاولة.'), { code: 'account/too-large' });
  }
  return backup.data;
}

function readSnapshot(snapshot) {
  if (!snapshot.exists()) return null;
  const value = snapshot.data();
  if (value?.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1 || !value.progress || typeof value.progress !== 'object') {
    throw Object.assign(new Error('تعذّر قراءة نسخة الحساب. احتفظ بنسختك المحلية وأعد المحاولة.'), { code: 'account/invalid-cloud-data' });
  }
  const progress = parseBackup(JSON.stringify(value.progress));
  validateCloudProgress(progress);
  return { revision: value.revision, progress };
}

/** Real Firebase SDK adapter; no local-password or simulated account fallback. */
export async function createFirebaseBackend(config = accountConfig) {
  if (!config.enabled || !config.firebase?.apiKey || !config.firebase?.projectId || !config.firebase?.authDomain) throw unavailable();
  const [appSDK, authSDK] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
  ]);
  const app = appSDK.getApps().find(candidate => candidate.name === 'blackbox-accounts') ?? appSDK.initializeApp(config.firebase, 'blackbox-accounts');
  const auth = authSDK.getAuth(app);
  // Auth is needed for session restoration; Firestore is loaded only for signed-in work.
  let storePromise;
  const getStore = () => storePromise ??= import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`).then(storeSDK => {
    const database = storeSDK.getFirestore(app);
    if (config.emulators && isLocal) storeSDK.connectFirestoreEmulator(database, config.emulators.firestoreHost, config.emulators.firestorePort);
    return { storeSDK, database };
  });
  const isLocal = typeof location !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (config.emulators && isLocal) {
    authSDK.connectAuthEmulator(auth, config.emulators.authURL, { disableWarnings: true });
  }
  await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
  const documentFor = (uid, storeSDK, database) => {
    if (!auth.currentUser || auth.currentUser.uid !== uid) throw Object.assign(new Error('تغيّر الحساب. أعد تسجيل الدخول قبل المزامنة.'), { code: 'account/session-changed' });
    return storeSDK.doc(database, 'blackboxUsers', uid, 'state', 'progress');
  };
  return {
    providers: { email: Boolean(config.providers?.email), google: Boolean(config.providers?.google) },
    onUserChanged: callback => authSDK.onAuthStateChanged(auth, callback),
    signInEmail: (email, password) => authSDK.signInWithEmailAndPassword(auth, email, password),
    signUpEmail: (email, password) => authSDK.createUserWithEmailAndPassword(auth, email, password),
    signInGoogle: () => authSDK.signInWithPopup(auth, new authSDK.GoogleAuthProvider()),
    resetPassword: email => authSDK.sendPasswordResetEmail(auth, email),
    signOut: () => authSDK.signOut(auth),
    watchCybertrace(uid, onData, onError) {
      // Return a synchronous disposer even while the Firestore module is loading.
      let cancelled = false;
      let unsubscribe = null;
      let lastDeliveredKey = null;
      void getStore().then(({ storeSDK, database }) => {
        if (cancelled) return;
        // Ownership is checked after loading, before opening a listener.
        const reference = storeSDK.collection(database, 'blackboxUsers', uid, 'cybertrace');
        if (cancelled) return;
        unsubscribe = storeSDK.onSnapshot(reference, { includeMetadataChanges: true }, snapshot => {
          if (cancelled || snapshot.metadata.hasPendingWrites) return;
          try {
            const receipts = {};
            for (const document of snapshot.docs) {
              const receipt = normalizeReceipt(document.data(), document.id);
              if (!receipt) throw Object.assign(new Error('تعذّر التحقق من إنجازات CyberTrace في الحساب.'), { code: 'skills/invalid-receipt' });
              receipts[document.id] = receipt;
            }
            const key = skillsDeliveryKey(receipts, snapshot.metadata.fromCache);
            if (key === lastDeliveredKey) return;
            lastDeliveredKey = key;
            onData({ receipts, fromCache: snapshot.metadata.fromCache });
          } catch (reason) { onError(reason); }
        }, error => { if (!cancelled) onError(error); });
        if (cancelled) { unsubscribe(); unsubscribe = null; }
      }).catch(error => { if (!cancelled) onError(error); });
      return () => { cancelled = true; unsubscribe?.(); };
    },
    async read(uid) { const { storeSDK, database } = await getStore(); return readSnapshot(await storeSDK.getDocFromServer(documentFor(uid, storeSDK, database))); },
    async write(uid, progress, expectedRevision) {
      const data = validateCloudProgress(progress);
      const { storeSDK, database } = await getStore();
      const reference = documentFor(uid, storeSDK, database);
      return storeSDK.runTransaction(database, async transaction => {
        // The document reference remains bound to this UID if the UI switches accounts.
        const current = readSnapshot(await transaction.get(reference));
        const revision = current?.revision ?? 0;
        if (revision !== expectedRevision) {
          throw Object.assign(new Error('تغيّر تقدم الحساب من جهاز آخر. اختر طريقة جمع التعديلات قبل الرفع.'), { code: 'account/conflict', remote: current });
        }
        if (revision >= 2147483646) throw Object.assign(new Error('وصل سجل المزامنة إلى الحد الأقصى. احتفظ بنسخة من عملك.'), { code: 'account/revision-limit' });
        transaction.set(reference, { schemaVersion: 1, revision: revision + 1, progress: data, updatedAt: storeSDK.serverTimestamp() });
        return { revision: revision + 1, progress: data };
      });
    },
  };
}
