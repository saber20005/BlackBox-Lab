# BLACKBOX — local VirtualBox inspection (read-only)

This first local integration milestone inspects **your own** VirtualBox machines on Windows, Linux or macOS. It does **not** connect the browser to the host, start VMs, change networks, or submit results to BLACKBOX.

## Run locally

Install Python 3.10+ and Oracle VirtualBox with `VBoxManage` on PATH.

From the repository root:

```sh
python local-agent/vm_inspector.py --json
python -m unittest discover -s local-agent -p 'test_*.py' -v
```

On Windows, `py local-agent/vm_inspector.py --json` may be used.

## Output and safety

Each entry reports VM name, UUID, state, enabled adapter attachment types and a conservative `isolated` flag. A VM is marked isolated only if it has at least one enabled adapter and **all** enabled adapters use `hostonly` or `intnet`. NAT, Bridged and unknown attachments are **not** considered isolated. This is a configuration check, **not proof** of end-to-end isolation or of host firewall correctness.

No credentials, guest commands, VM files, host paths, IP addresses, or secrets are collected. The script has no network listener and never sends data anywhere. Inspect the report before sharing it, because VM names may be private.

## Next implementation gate

A paired local service may be added only after threat modeling, origin restrictions, explicit pairing, VM allowlists, action approvals, and end-to-end isolation tests. The web app must not be allowed to run arbitrary host commands.
