# Firebase production rules attestation (keyless; main branch only)

**Status:** This workflow provides a way to obtain proof from the *actual active Firebase Rules release* without exporting static service-account JSON credentials into GitHub. **It is not connected yet.** A Google Cloud administrator must provision the read-only identity below. Creating this workflow does not grant ChatGPT or GitHub permissions by itself.

## Selected project and source
- GitHub repo: `saber20005/BlackBox-Lab`.
- Firebase project: `black-box-lab`.
- Source input: `firestore.rules`.
- A successful attestation requires that the *full single-file* deployed Firestore rules match this exact reviewed GitHub source. A mismatch fails the workflow.

## One-time owner setup (Google Cloud + GitHub)
1. In **Google Cloud Console**, select `black-box-lab` and create a dedicated service account for read-only security attestation. Grant it **Firebase Rules Viewer** (`roles/firebaserules.viewer`) **only** on this project. Do not grant Editor/Owner/Rules Admin and do not create JSON private keys.
2. Configure **Workload Identity Federation**: issuer `https://token.actions.githubusercontent.com`; map `google.subject=assertion.sub`, `attribute.repository=assertion.repository` and `attribute.ref=assertion.ref`. Restrict provider acceptance to `assertion.repository == 'saber20005/BlackBox-Lab' && assertion.ref == 'refs/heads/main'`; use a dedicated pool/provider and grant **Workload Identity User** on that one reader service account only to the repository's trusted OIDC principal. Avoid wildcard organizations or repositories.
3. Enable the Google Cloud IAM Credentials/STS access needed for short-lived service-account impersonation, and Firebase Rules API if it is disabled. An administrator can verify the exact APIs and provider permissions in Google Cloud.
4. In this **GitHub repository → Settings → Secrets and variables → Actions → Variables**, set two repository-scoped **nonsecret identifiers**:
   - `FIREBASE_RULES_WIF_PROVIDER`: full `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER` resource path.
   - `FIREBASE_RULES_VIEWER_SA`: email of the scoped, read-only service account.
5. Open **Actions → Firebase production rules attestation (read-only) → Run workflow** on `main`. The workflow gets a temporary OAuth token using GitHub OIDC, calls **only GET** on active Firebase release/ruleset, prints SHA-256 hashes and ruleset ID in the job summary, and never modifies deployed rules.

**Never paste credentials, Firebase ID tokens, OAuth tokens or service-account keys into ChatGPT, GitHub issues, screenshots or source files.** The WIF provider identifier and reader account email are routing identifiers, not credentials.

## How to interpret results
- **BLACKBOX only:** `match` / green means the single-file `cloud.firestore` source matches GitHub byte-for-byte after CRLF/newline normalization; it does not prove the rules are *secure*, that the active Firebase Functions version matches GitHub, or that IAM/App Check is correctly enforced.
- **CyberTrace only:** a ruleset ID/hash is collected for manual reconciliation; the reference rules **must not be deployed wholesale**. The workflow intentionally cannot be green until a complete reviewed baseline is available.
- For a `drift` result, make a complete backup/export of current deployed rules, review all collections, test in a disposable emulator, then use a **separate explicitly approved release**. The workflow does not deploy anything.
- Authentication errors must be fixed through the scoped federation setup, not by supplying static Firebase private keys.

**Limits:** This read-only workflow cannot verify Firebase Functions/IAM/App Check, live cross-account access, genuine server-issued certificates or paid entitlement enforcement; track those independently in the corresponding P1 issues.

References:
- https://firebase.google.com/docs/reference/rules/rest/v1/projects.releases/get
- https://firebase.google.com/docs/reference/rules/rest/v1/projects.rulesets/get
- https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines
- https://github.com/google-github-actions/auth
