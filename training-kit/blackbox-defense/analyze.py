#!/usr/bin/env python3
"""Read-only analysis of the synthetic BLACKBOX fixtures, using only Python 3."""

import argparse
import csv
import difflib
import hashlib
import ipaddress
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser, Parser
from http.cookies import SimpleCookie
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CSV_FIELDS = ["time", "user", "src_ip", "event", "session_id", "device", "result", "resource"]


class FixtureError(ValueError):
    pass


def read_text(relative):
    return (ROOT / relative).read_text(encoding="utf-8")


def read_json(relative):
    return json.loads(read_text(relative))


def sha256(relative):
    return hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()


def log_analysis():
    with (ROOT / "auth-events.csv").open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != CSV_FIELDS:
            raise FixtureError("auth-events.csv: رؤوس الأعمدة لا تطابق نموذج التدريب.")
        rows = list(reader)
    if not rows:
        raise FixtureError("auth-events.csv: لا توجد أحداث للتحليل.")
    for number, row in enumerate(rows, start=2):
        if set(row) != set(CSV_FIELDS) or any(not isinstance(value, str) or not value.strip() for value in row.values()):
            raise FixtureError("auth-events.csv: سطر غير مكتمل عند الرقم {}.".format(number))
        try:
            at = datetime.strptime(row["time"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
            ipaddress.ip_address(row["src_ip"])
        except ValueError as error:
            raise FixtureError("auth-events.csv: وقت UTC أو عنوان IP غير صالح في السطر {}.".format(number)) from error
        row["_sort_time"] = at
    rows.sort(key=lambda row: row["_sort_time"])
    sessions = defaultdict(list)
    for row in rows:
        sessions[row["session_id"]].append(row)
    summaries = []
    for session_id, events in sorted(sessions.items()):
        sources = sorted({event["src_ip"] for event in events})
        authentication_sources = sorted({event["src_ip"] for event in events if event["event"] in ("login", "mfa")})
        summaries.append({
            "session_id": session_id,
            "users": sorted({event["user"] for event in events}),
            "sources": sources,
            "devices": sorted({event["device"] for event in events}),
            "authentication_sources": authentication_sources,
            "sources_without_login_or_mfa": sorted(set(sources) - set(authentication_sources)),
            "event_count": len(events),
            "first_seen_utc": events[0]["time"],
            "last_seen_utc": events[-1]["time"],
        })
    return {
        "mode": "logs", "event_count": len(rows), "session_count": len(summaries),
        "sessions_with_multiple_sources": [item["session_id"] for item in summaries if len(item["sources"]) > 1],
        "sessions": summaries,
        "timeline": [{key: value for key, value in row.items() if key != "_sort_time"} for row in rows],
        "limit": "تعدد مصادر الجلسة مؤشر يحتاج تفسيرًا؛ قارنه بالسياق والأجهزة المصرّح بها قبل استنتاج سرقة جلسة.",
    }


def settings(relative):
    result = {}
    for number, line in enumerate(read_text(relative).splitlines(), start=1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if "=" not in line:
            raise FixtureError("{}: إعداد غير صالح في السطر {}.".format(relative, number))
        key, value = (part.strip() for part in line.split("=", 1))
        if not key or not value or key in result:
            raise FixtureError("{}: إعداد فارغ أو مكرر في السطر {}.".format(relative, number))
        result[key] = value
    return result


def integrity_analysis():
    baseline = "integrity/baseline/settings.conf"
    current = "integrity/current/settings.conf"
    manifest = read_text("integrity/baseline.sha256").strip().split()
    if len(manifest) != 2 or manifest[1] != baseline or len(manifest[0]) != 64 or any(character not in "0123456789abcdef" for character in manifest[0]):
        raise FixtureError("integrity/baseline.sha256: بصمة المرجع أو مساره غير صالح.")
    context = read_json("integrity/change-context.json")
    if not isinstance(context, dict) or not isinstance(context.get("baseline_ref"), str) or not isinstance(context.get("approved_changes"), list) or any(not isinstance(item, str) for item in context["approved_changes"]):
        raise FixtureError("integrity/change-context.json: سجل التغيير التدريبي غير صالح.")
    before, after = settings(baseline), settings(current)
    changed = [{"key": key, "before": before.get(key), "after": after.get(key)} for key in sorted(set(before) | set(after)) if before.get(key) != after.get(key)]
    return {
        "mode": "integrity", "baseline_ref": context["baseline_ref"],
        "baseline_sha256": sha256(baseline), "current_sha256": sha256(current),
        "baseline_matches_manifest": sha256(baseline) == manifest[0],
        "changed_settings": changed, "approved_changes": context["approved_changes"],
        "changes_without_recorded_approval": [item["key"] for item in changed if item["key"] not in context["approved_changes"]],
        "diff": "\n".join(difflib.unified_diff(read_text(baseline).splitlines(), read_text(current).splitlines(), fromfile=baseline, tofile=current, lineterm="")),
        "limit": "تطابق SHA-256 يثبت التطابق مع مرجع الحزمة فقط؛ لا يثبت أصالة المرجع أو سلامة الملف من البرمجيات الخبيثة.",
    }


def header_observations(relative):
    lines = read_text(relative).splitlines()
    if not lines or not lines[0].startswith("HTTP/1.1 "):
        raise FixtureError("{}: سطر حالة HTTP التدريبي غير صالح.".format(relative))
    headers = Parser(policy=policy.default).parsestr("\n".join(lines[1:]))
    if headers.defects:
        raise FixtureError("{}: تنسيق الترويسات غير صالح.".format(relative))
    values = headers.get_all("Set-Cookie", [])
    if len(values) != 1:
        raise FixtureError("{}: يتطلب المثال ترويسة Set-Cookie واحدة.".format(relative))
    cookies = SimpleCookie()
    cookies.load(str(values[0]))
    if "demo_session" not in cookies:
        raise FixtureError("{}: ملف تعريف الارتباط التدريبي غير صالح.".format(relative))
    cookie = cookies["demo_session"]
    return {
        "file": relative, "status": lines[0],
        "content_security_policy": str(headers.get("Content-Security-Policy", "")),
        "x_content_type_options": str(headers.get("X-Content-Type-Options", "")),
        "strict_transport_security": str(headers.get("Strict-Transport-Security", "")),
        "cookie": {"name": "demo_session", "secure": bool(cookie["secure"]), "http_only": bool(cookie["httponly"]), "same_site": cookie["samesite"]},
    }


def header_analysis():
    return {
        "mode": "headers", "assumed_origin": "https://portal.training.example/",
        "before": header_observations("headers/before.txt"),
        "after": header_observations("headers/after.txt"),
        "limit": "هذه استجابات HTTPS اصطناعية محفوظة في ملفات. لا يتصل التحليل بخادم ولا يختبر TLS فعليًا. وجود الترويسات لا يثبت أمان التطبيق كله.",
    }


def email_observations(relative):
    message = BytesParser(policy=policy.default).parsebytes((ROOT / relative).read_bytes())
    if message.defects or not message.get("From") or not message.get("To") or not message.get("Authentication-Results"):
        raise FixtureError("{}: رؤوس البريد التدريبي غير مكتملة أو غير صالحة.".format(relative))
    parts = list(message.walk())
    bodies = [part.get_content() for part in parts if part.get_content_type() == "text/plain" and part.get_content_disposition() != "attachment"]
    return {
        "file": relative, "from": str(message.get("From")), "reply_to": str(message.get("Reply-To", "")),
        "to": str(message.get("To")), "subject": str(message.get("Subject", "")),
        "authentication_results": str(message.get("Authentication-Results")),
        "attachment_count": sum(1 for part in parts if part.get_content_disposition() == "attachment"),
        "body_text": "\n".join(bodies),
    }


def email_analysis():
    return {
        "mode": "email", "trusted_gateway_in_fixture": "gateway.training.example",
        "messages": [email_observations("email/suspicious.eml"), email_observations("email/legitimate.eml")],
        "limit": "نتائج المصادقة هنا جزء من سيناريو بوابة موثوقة اصطناعي. في بريد فعلي يجب التحقق من مصدرها؛ ونجاح SPF/DKIM/DMARC لا يثبت التفويض التجاري أو سلامة الطلب.",
    }


def main():
    parser = argparse.ArgumentParser(description="BLACKBOX: تحليل ملفات تدريب اصطناعية محليًا دون اتصال شبكي أو تغييرها.")
    parser.add_argument("mode", choices=["logs", "integrity", "headers", "email"], help="مجموعة الأدلة المراد قراءتها")
    parser.add_argument("--json", action="store_true", help="إخراج الملاحظات بصيغة JSON")
    args = parser.parse_args()
    methods = {"logs": log_analysis, "integrity": integrity_analysis, "headers": header_analysis, "email": email_analysis}
    try:
        result = methods[args.mode]()
    except (OSError, ValueError, csv.Error) as error:
        print("تعذّر تحليل ملفات التدريب: {}\nأعد استخراج الحزمة كاملة وتحقق من أن الملفات بصيغة UTF-8 ولم تتغير بنيتها.".format(error), file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("BLACKBOX — ملاحظات تحليل {} (ملفات اصطناعية، قراءة فقط)".format(args.mode))
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
