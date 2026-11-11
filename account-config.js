// Public web-app configuration only. Provider activation is an owner action.
// Never put a service-account key or Firebase Admin credential in this file.
export const accountConfig = Object.freeze({
  // Authentication, the production domain, and owner-only reads are verified.
  enabled: true,
  firebase: Object.freeze({
    apiKey: 'AIzaSyAXZixrz0V0-68NwGDHZFYwveIW20AsiRA',
    authDomain: 'black-box-lab.firebaseapp.com',
    projectId: 'black-box-lab',
    storageBucket: 'black-box-lab.firebasestorage.app',
    messagingSenderId: '277258714756',
    appId: '1:277258714756:web:47b77d87e1462ae3da0cd1',
  }),
  providers: Object.freeze({ email: true, google: true }),
  emulators: null,
});
