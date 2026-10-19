"""Condense reproducible captcha test evidence; raw runs stay in ignored results/."""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent
lab = Path(sys.argv[1]) if len(sys.argv) > 1 else root.parent / "stresstest" / "lab"
sys.path.insert(0, str(lab))
from rust_report import report  # noqa: E402


def read(name):
    return json.loads((lab / "results" / name).read_text(encoding="utf-8-sig"))


output = {
    "scope": "Local lab only. Real engine, Redis and socket clients; 200ms simulated provider for load. No public-provider load traffic.",
    "capacity": [],
    "contracts": [read(f"captcha-contract-{provider}.json") for provider in ("hcaptcha", "recaptcha_v3")],
    "browser": [read(f"captcha-browser-{provider}.json") for provider in ("hcaptcha", "recaptcha_v3")],
    "overload": read("captcha-overload.json"),
    "crash_recovery": read("rust-captcha-reconnect-1000.json"),
    "live_hcaptcha": read("captcha-live-hcaptcha.json"),
    "unverified": [
        "live Google v3 scoring",
        "human challenges and solve time",
        "public-provider burst capacity",
        "production keys and domain settings",
    ],
}
for users in (10000, 30000):
    name = f"rust-captcha-{users}.json"
    raw = read(name)
    summary = report(lab / "results" / name)
    fields = (
        "users",
        "rounds",
        "integrity",
        "comfortable",
        "stored_p95_ms",
        "all_question_results_p95_ms",
        "all_final_results_ms",
        "rust_peak_rss_mib",
        "rust_cpu_percent_one_core",
        "python_cpu_percent_one_core",
        "independent_http",
        "independent_probe_skipped",
        "environment",
        "settings",
    )
    result = {key: summary[key] for key in fields}
    result.update(
        started_utc=datetime.fromtimestamp(raw["start"], timezone.utc).isoformat(),
        captcha=raw["server"]["rust"]["captcha"],
        provider=raw["captcha_provider"],
    )
    assert result["integrity"] and result["provider"]["requests"] == users
    assert result["captcha"]["outcomes"] == {"accepted": users}
    output["capacity"].append(result)
print(json.dumps(output, indent=2))
