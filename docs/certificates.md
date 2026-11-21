# BLACKBOX Training Certificates — phase 1

This release adds a read-only Training Completion Records page. It checks the selected scope using the existing account-aware createProgressSession API and displays *only* tracks whose every stage has a stored manual-completion timestamp.

Learners can type a preferred display name and print / Save as PDF. The name is not saved or transmitted. The printed record is labelled "غير موثّقة". No unique ID, QR, public verification, server signature, billing, authenticated assessment, or professional accreditation exists in this phase.

Account safety: never present guest progress as an account snapshot. Do not print pending, failed, or cached account state as confirmed. Existing progress and Firestore remain unchanged. The page is marked noindex.

Future stages: verified server assessments; trusted issuance; revocation; privacy-conscious public verification; and joint certifications based on explicit linked BLACKBOX identity and trusted CyberTrace results. Do not issue any verified certificate based on local user-edited checklists, email matching, or client XP.
