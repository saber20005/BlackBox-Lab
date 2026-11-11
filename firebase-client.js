import { accountConfig } from './account-config.js';
import { createBackup, parseBackup } from './progress.js';
import { normalizeReceipt } from './cybertrace-catalog.js';

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
  const [appSDK, authSDK, storeSDK] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`),
  ]);
  const app = appSDK.getApps().find(candidate => candidate.name === 'blackbox-accounts') ?? appSDK.initializeApp(config.firebase, 'blackbox-accounts');
  const auth = authSDK.getAuth(app);
  const database = storeSDK.getFirestore(app);
  const isLocal = typeof location !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (config.emulators && isLocal) {
    authSDK.connectAuthEmulator(auth, config.emulators.authURL, { disableWarnings: true });
    storeSDK.connectFirestoreEmulator(database, config.emulators.firestoreHost, config.emulators.firestorePort);
  }
  await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
  const documentFor = uid => {
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
      // Keep the collection query beneath one authenticated UID; never use a
      // collection-group query or derive ownership from an email address.
      documentFor(uid);
      const reference = storeSDK.collection(database, 'blackboxUsers', uid, 'cybertrace');
      return storeSDK.onSnapshot(reference, { includeMetadataChanges: true }, snapshot => {
        // A local pending write is not proof that a receipt reached the server.
        if (snapshot.metadata.hasPendingWrites) return;
        try {
          const receipts = {};
          for (const document of snapshot.docs) {
            const receipt = normalizeReceipt(document.data(), document.id);
            if (!receipt) throw Object.assign(new Error('تعذّر التحقق من إنجازات CyberTrace في الحساب.'), { code: 'skills/invalid-receipt' });
            receipts[document.id] = receipt;
          }
          onData({ receipts, fromCache: snapshot.metadata.fromCache });
        } catch (reason) { onError(reason); }
      }, onError);
    },
    async read(uid) { return readSnapshot(await storeSDK.getDocFromServer(documentFor(uid))); },
    async write(uid, progress, expectedRevision) {
      const data = validateCloudProgress(progress);
      const reference = documentFor(uid);
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
