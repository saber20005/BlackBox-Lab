# BLACKBOX UI upgrades from three user-supplied videos

- A blue-brand split authentication dialog mirrors the side-panel motion concept. It preserves the existing Google/email/reset flows, guest progression, conflict recovery, and consent rules. Signed-in account management retains its full-width layout.
- An opt-in, expandable floating dock provides four existing route actions (home, tracks, progress, backups), not a new source of truth. Keyboard/touch and reduced-motion support included. The dock stays hidden on the introductory landing page because it is inside the existing workspace container.
- CSS `content-visibility` reduces painting work for offscreen read-only troubleshooting cards on browsers that support it; the existing app already lazy-loads the evidence and hints modules and defers web fonts.

**Performance honesty:** BLACKBOX does not expose a catalogue database query to paginate like the video. No changes to Firestore reads, sync, caching, account identity or certificate authority are claimed here. Benchmark mobile INP/LCP with browser developer tools before and after; test dialogs, keyboard navigation, phone safe-area and reduced motion.
