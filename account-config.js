// Public web-app configuration only. Provider activation is an owner action.
// Never put a service-account key or Firebase Admin credential in this file.
export const accountConfig = Object.freeze({
  // Authentication, the production domain, and owner-only reads are verified.
  enabled: true,
  // CyberTrace domains and owner-only receipt reads are verified in production.
  linkedSkillsEnabled: true,
  firebase: Object.freeze({
    apiKey: 'AIzaSyAXZixrz0V0-68NwGDHZFYwveIW20AsiRA',
    authDomain: 'black-box-lab.firebaseapp.com',
    projectId: 'black-box-lab',
    storageBucket: 'black-box-lab.firebasestorage.app',
    messagingSenderId: '277258714756',
    appId: '1:277258714756:web:47b77d87e1462ae3da0cd1',
  }),
  providers: Object.freeze({ email: true, google: true }),
  // Public reCAPTCHA Enterprise site key registered in Firebase App Check.
  // Release gate: keep grading disabled until Functions deployment and end-to-end production verification.
  grading: Object.freeze({ enabled: false, appCheckSiteKey: '6Le83x8uAAAAACsU1HBgr_omCXlPcBubyd0OBffI' }),
  emulators: null,
});
