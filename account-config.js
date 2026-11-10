// Public web-app configuration only. Provider activation is an owner action.
// Never put a service-account key or Firebase Admin credential in this file.
export const accountConfig = Object.freeze({
  enabled: false,
  firebase: null,
  providers: Object.freeze({ email: false, google: false }),
  emulators: null,
});
