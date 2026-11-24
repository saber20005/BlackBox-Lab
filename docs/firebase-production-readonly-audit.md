# Read-only inspection of deployed Firebase Firestore rules

This helper calls the official Firebase Rules **GET release** and **GET ruleset** endpoints. It never calls create, patch, delete or deploy. It prints SHA-256 hashes and release IDs, **not the contents of the deployed rules or OAuth token**.

The script runs only on a trusted administrator workstation. Do **not** insert OAuth tokens into GitHub Actions, chats, source files, Vercel environment variables or screenshots.

1. Sign in through Google Cloud CLI on a trusted computer that has Firebase Rules Viewer access to the intended project. Obtain a short-lived OAuth token using that CLI and assign it to the local shell environment, without posting it anywhere.
2. From BLACKBOX, check its default Firestore release with:
   \`node scripts/audit-deployed-firestore-rules.mjs --project=black-box-lab --file=firestore.rules\`
3. From CyberTrace, use its reference-only rules document:
   \`node scripts/audit-deployed-firestore-rules.mjs --project=cybertrace-48ab0 --file=security/firestore.cybertrace-progress.rules --reference-only\`
4. Review the output. \`match\` means byte-equivalent after line-ending and trailing-newline normalization; \`drift\` requires careful review, not an automatic overwrite. CyberTrace's file is **a reference fragment**, so a mismatch is expected and not necessarily an unsafe configuration.
5. For a multi-file deployed ruleset, the script returns \`manual-review\`. Examine the complete release using authorized tools; do not combine files blindly.

**The current production rules have NOT been read by ChatGPT.** A green emulator test only proves behavior of repository rules. Firebase Functions revisions, App Check enforcement, Auth configuration, Admin SDK IAM, and claims revocation require separate authenticated administrator checks.

Official API: https://firebase.google.com/docs/reference/rules/rest/v1/projects.releases/get and https://firebase.google.com/docs/reference/rules/rest/v1/projects.rulesets/get.
