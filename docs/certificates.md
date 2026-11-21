# BLACKBOX Training Certificates — phase 1

This release adds a read-only Training Completion Records page. It checks the selected scope using the existing account-aware createProgressSession API and displays *only* tracks whose every stage has a stored manual-completion timestamp.

Learners can type a preferred display name and print / Save as PDF. The name is not saved or transmitted. The printed record is labelled "غير موثّقة". No unique ID, QR, public verification, server signature, billing, authenticated assessment, or professional accreditation exists in this phase.

Account safety: never present guest progress as an account snapshot. Do not print pending, failed, or cached account state as confirmed. Existing progress and Firestore remain unchanged. The page is marked noindex.

Future stages: verified server assessments; trusted issuance; revocation; privacy-conscious public verification; and joint certifications based on explicit linked BLACKBOX identity and trusted CyberTrace results. Do not issue any verified certificate based on local user-edited checklists, email matching, or client XP.


## Joint design (shared canonical preview)
BLACKBOX links to the **single** joint-certificate design preview at `https://www.cybertracelab.dev/?view=joint-certificate`; it is not a second copy of an issuance template and cannot award certificates. The preview intentionally combines CyberTrace gold with BLACKBOX electric blue and both genuine brand marks. The prominent `نموذج غير صادر` watermark is not removable in the UI.

The linked view is a static, noindex, non-issuing mockup and makes no change to BLACKBOX auth, progress, Firestore, or cross-site account bridge. A future verified joint award must originate from server-side checked completions from both products with a revocable issuance record.

## Route selection behavior

All 10 training routes are selectable in the certificate center, even with no fully completed routes. The dropdown shows the verified-for-this-session count of manually confirmed stages, and an explanatory message when a route is incomplete. This is a **navigation/status feature only**: the printable record and Print / PDF action remain unavailable until every stage of the chosen route is manually completed and account/guest scope is ready, non-cached and non-pending. During authentication restoration, errors or owner switches, route titles can be browsed but no completion is asserted. Guest and account results are never substituted for one another.
