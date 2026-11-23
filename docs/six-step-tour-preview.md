# BLACKBOX interactive Mission Zero — draft preview PR #88 (third design)

This is no longer a multiple-choice onboarding. The user carries out an entirely **in-memory simulated lab workflow** on the real BLACKBOX website, with six stages:

1. Enter Mission Zero, select a destination.
2. Review a browser-only versus virtual-machine training path.
3. Configure a **virtual** VirtualBox adapter between Bridged / NAT / Host-only and confirm a **simulated** Snapshot. The readiness check requires both Host-only and Snapshot.
4. Type commands into a **closed synthetic terminal**. Exact allowlisted commands are `help`, `ip a`, `nmap -sV 192.168.56.10`, `report`, and `clear`. No shell or network execution is possible from the simulator. Nmap prints static synthetic data only if virtual configuration is ready. Incorrect or unknown commands show an explicit not-executed message.
5. Collect the synthetic SSH/HTTP port evidence and type an analyst's report. Input is validated for presence/length and kept in memory only.
6. See 0-3 **demo milestones** and choose a real lab path to begin afterward.

Unlike the former design, there are **no multiple-choice quiz buttons**. The network builder, command prompt, evidence capture and report submission each respond to real user actions.

**Boundaries:** This feature does not connect to the host, Kali, VirtualBox, or a network. It does not start Nmap. No user input passes to a shell, Firebase, account APIs, grading/XP, or persistent progress. The app's existing first-visit completion flag remains distinct from training progress. The preview includes the existing real training site; navigating beyond the tour may use normal progress persistence, so do not save genuine user notes on the preview.

**Release:** Keep PR #88 draft; don't merge until user reviews visuals and interaction. CI quality gates must pass at 320px/390px/1440px, plus Firebase emulators and local agent tests. Vercel preview is separate from the production BLACKBOX domain.
