"""Read-only VirtualBox inventory for BLACKBOX. No network listener or VM mutations."""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

VM_LINE = re.compile(r'^"(?P<name>.*)" \{(?P<uuid>[0-9a-fA-F-]{36})\}$')
SAFE_UUID = re.compile(r'^[0-9a-fA-F-]{36}$')
MAX_OUTPUT = 256_000


class InspectorError(RuntimeError):
    pass


def find_vboxmanage() -> str:
    executable = shutil.which("VBoxManage") or shutil.which("VBoxManage.exe")
    if executable:
        return executable
    if os.name == "nt":
        candidate = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Oracle" / "VirtualBox" / "VBoxManage.exe"
        if candidate.is_file():
            return str(candidate)
    raise InspectorError("VBoxManage was not found. Install VirtualBox or add it to PATH.")


def run_readonly(executable: str, *args: str) -> str:
    if not args or args[0] not in {"list", "showvminfo"}:
        raise InspectorError("Only read-only VirtualBox operations are permitted")
    if args[0] == "list" and args[1:] != ("vms",):
        raise InspectorError("Only 'list vms' is permitted")
    if args[0] == "showvminfo" and (len(args) != 3 or not SAFE_UUID.fullmatch(args[1]) or args[2] != "--machinereadable"):
        raise InspectorError("Invalid VM inspection request")
    try:
        result = subprocess.run([executable, *args], capture_output=True, text=True, timeout=12, check=False, encoding="utf-8", errors="replace")
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise InspectorError("VirtualBox inspection failed or timed out") from exc
    if result.returncode:
        raise InspectorError("VirtualBox returned an error (exit code %d)" % result.returncode)
    if len(result.stdout) > MAX_OUTPUT:
        raise InspectorError("VirtualBox output exceeds safety limit")
    return result.stdout


def parse_inventory(output: str) -> list[dict[str, str]]:
    entries = []
    for line in output.splitlines():
        match = VM_LINE.fullmatch(line.strip())
        if match:
            entries.append({"id": match["uuid"].lower(), "name": match["name"][:200]})
    return entries


def parse_info(output: str) -> dict[str, object]:
    values = {}
    for line in output.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            values[key] = value.strip().strip('"')
    adapters = []
    for i in range(1, 9):
        if values.get(f"nic{i}", "none") != "none":
            adapters.append({"slot": i, "attachment": values.get(f"nic{i}", "unknown"), "enabled": True})
    return {"state": values.get("VMState", "unknown"), "adapters": adapters,
            "isolated": bool(adapters) and all(a["attachment"].lower() in {"hostonly", "intnet"} for a in adapters)}


def inventory(executable: str) -> list[dict[str, object]]:
    machines = parse_inventory(run_readonly(executable, "list", "vms"))
    results = []
    for vm in machines:
        try:
            info = parse_info(run_readonly(executable, "showvminfo", vm["id"], "--machinereadable"))
            results.append({**vm, **info})
        except InspectorError:
            results.append({**vm, "state": "unknown", "adapters": [], "isolated": False, "inspectionError": True})
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only local VirtualBox isolation inspection")
    parser.add_argument("--json", action="store_true", help="Print JSON report (no credentials or host paths)")
    args = parser.parse_args()
    try:
        machines = inventory(find_vboxmanage())
    except InspectorError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1
    report = {"ok": True, "mode": "read-only", "machines": machines}
    print(json.dumps(report, ensure_ascii=False, indent=2 if args.json else None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
