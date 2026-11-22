# BLACKBOX device-only display preferences / authentication polish

- A new `?view=settings` page is linked from **حسابي** rather than creating a crowded top navigation button.
- Changes are read-only presentation state: night/light themes, larger text, reduced motion, and optional training level chosen by the user.
- Key `blackbox.ui-preferences.v1` is separate from progress backups, Firestore account data and staged lab completion. It never writes to cloud progress or changes stage unlocking; guest and logged-in users can use it.
- The login dialog receives only a subtle glass visual refinement; Google/email authentication, persistence, password reset and cloud synchronization are not changed.
- Malformed or unavailable browser storage defaults safely; text shows if persistence failed.
- Rollout: do not merge until Node tests, mobile browser journeys, Firebase rules emulator and callable emulator are green. Preview visual contrast for 320px/390px, both themes. Do not publish repeatedly to Vercel.
\n- Preference utilities live in grouped `assets/modules/preferences/` (no unreviewed new root entry).