#!/usr/bin/env python3
"""Build the small deterministic, source-backed BLACKBOX training ZIP."""

import hashlib
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile, ZipInfo

REPOSITORY = Path(__file__).resolve().parents[1]
SOURCE = REPOSITORY / "training-kit" / "blackbox-defense"
DESTINATION = REPOSITORY / "downloads" / "blackbox-defense-kit.zip"
FILES = [
    "README-ar.md", "REVIEW-ar.md", "analyze.py", "auth-events.csv",
    "integrity/baseline/settings.conf", "integrity/current/settings.conf",
    "integrity/baseline.sha256", "integrity/change-context.json",
    "headers/before.txt", "headers/after.txt",
    "email/suspicious.eml", "email/legitimate.eml",
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build():
    for relative in FILES:
        if relative == "integrity/baseline.sha256":
            continue
        path = SOURCE / relative
        if path.is_symlink() or not path.is_file():
            raise ValueError("Missing or symlinked source: " + relative)
    for generated in [SOURCE / "integrity/baseline.sha256", SOURCE / "SHA256SUMS", DESTINATION]:
        if generated.is_symlink():
            raise ValueError("Refusing symlinked output: " + str(generated.relative_to(REPOSITORY)))
    baseline = "integrity/baseline/settings.conf"
    (SOURCE / "integrity/baseline.sha256").write_text(digest(SOURCE / baseline) + "  " + baseline + "\n", encoding="utf-8")
    manifest = "".join(digest(SOURCE / relative) + "  " + relative + "\n" for relative in sorted(FILES))
    (SOURCE / "SHA256SUMS").write_text(manifest, encoding="utf-8")
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(DESTINATION, "w", compression=ZIP_STORED) as archive:
        for relative in sorted(FILES + ["SHA256SUMS"]):
            path = SOURCE / relative
            if path.is_symlink() or not path.is_file():
                raise ValueError("Missing or symlinked source: " + relative)
            info = ZipInfo("blackbox-defense/" + relative, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_STORED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())
    print("Built {} ({} files, {} bytes)".format(DESTINATION.relative_to(REPOSITORY), len(FILES) + 1, DESTINATION.stat().st_size))


if __name__ == "__main__":
    build()
