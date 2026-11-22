#!/usr/bin/env python3
"""A read-only HTTP target for ONE manually isolated VirtualBox host-only lab.

This process cannot independently verify that a chosen private address is
attached to a VirtualBox host-only adapter. The operator MUST verify that.
It is not deliberately vulnerable, does not authenticate or run commands,
and should never be deployed as an Internet service.
"""
import argparse
import ipaddress
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from ipaddress import IPv4Network

RFC1918 = (IPv4Network("10.0.0.0/8"), IPv4Network("172.16.0.0/12"), IPv4Network("192.168.0.0/16"))


def require_safe_bind(value, confirmed=False):
    try:
        address = ipaddress.ip_address(value)
    except ValueError as exc:
        raise ValueError("Specify an IPv4 address from the verified lab interface") from exc
    if address.version != 4 or address.is_multicast or address.is_unspecified:
        raise ValueError("The target may not bind to all interfaces or to multicast")
    if address == ipaddress.ip_address("127.0.0.1"):
        return str(address)
    if not confirmed or not any(address in network for network in RFC1918):
        raise ValueError("The target requires a confirmed RFC1918 host-only adapter")
    return str(address)


class TargetHandler(BaseHTTPRequestHandler):
    server_version = "BLACKBOX-Lab/1.0"
    sys_version = ""

    def do_GET(self):
        if self.path != "/health":
            return self._send(404, {"error": "not-found"})
        return self._send(200, {
            "lab": "blackbox-nmap-local-01",
            "status": "training-target",
            "protocol": "http",
            "port": self.server.server_port,
            "note": "Synthetic local-only service. No vulnerability implied.",
        })

    def do_HEAD(self):
        return self._send(200 if self.path == "/health" else 404, None)

    def do_POST(self):
        return self._send(405, {"error": "read-only"})

    def _send(self, status, obj):
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8") if obj is not None else b""
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def log_message(self, *args):
        # No raw headers, query strings or learner information are logged.
        return


def main(argv=None):
    parser = argparse.ArgumentParser(description="BLACKBOX read-only lab target. Use Host-Only only.")
    parser.add_argument("--bind", required=True, help="Exact IPv4 address of the lab interface, or 127.0.0.1")
    parser.add_argument("--port", type=int, default=8088)
    parser.add_argument("--confirm-host-only", action="store_true", help="You verified network adapter in VirtualBox")
    args = parser.parse_args(argv)
    try:
        bind = require_safe_bind(args.bind, args.confirm_host_only)
        if not 1024 <= args.port <= 65535:
            raise ValueError("Use an unprivileged TCP port between 1024 and 65535")
    except ValueError as exc:
        parser.error(str(exc))
    try:
        with ThreadingHTTPServer((bind, args.port), TargetHandler) as server:
            server.daemon_threads = True
            print(f"BLACKBOX training HTTP target listening on {bind}:{args.port}", flush=True)
            server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        print("Stopping training target.", flush=True)


if __name__ == "__main__":
    main()
