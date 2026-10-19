"""Integrity and resource accounting for Python-supervised Rust runs."""

import json
import sys
from pathlib import Path

from compare_modes import percentile, summarize


def cpu(samples):
    active = [s for s in samples if s["phase"].startswith(("answer_", "results_", "final"))]
    return (
        (100 * (active[-1]["cpu_s"] - active[0]["cpu_s"]) / (active[-1]["time"] - active[0]["time"]))
        if len(active) > 1
        else 0
    )


def report(path):
    raw = json.loads(path.read_text(encoding="utf-8"))
    base = summarize(path)
    native = raw["server"].get("rust") or {}
    samples = raw["server"].get("rust_samples", [])
    base["python_cpu_percent_one_core"] = base.pop("gameplay_cpu_percent_one_core")
    base["python_peak_rss_mib"] = base.pop("api_peak_rss_mib")
    base["rust_cpu_percent_one_core"] = cpu(samples)
    base["combined_runtime_cpu_percent_one_core"] = (
        base["python_cpu_percent_one_core"] + base["rust_cpu_percent_one_core"]
    )
    base["rust_peak_rss_mib"] = max((s["rss_kib"] for s in samples), default=0) / 1024
    base["rust_peak_fds"] = max((s["fds"] for s in samples), default=0)
    base["rust"] = native
    base["settings"] = raw["settings"]
    base["environment"] = raw["environment"]
    base["error"] = raw.get("error")
    probes = [s["ms"] for s in raw.get("rust_http", []) if s["phase"].startswith(("answer_", "results_", "final"))]
    base["rust_http_p95_ms"] = percentile(probes)
    base["rust_http_max_ms"] = max(probes) if probes else None
    answer_http = [s["ms"] for s in raw["http"] if s["phase"].startswith("answer_")]
    base["answer_http_p95_ms"] = percentile(answer_http)
    external = raw.get("external_probe", {})
    base["independent_http"] = {
        kind: {
            "p95_ms": percentile(
                [
                    s["ms"]
                    for s in external.get("samples", [])
                    if s["kind"] == kind and s["phase"].startswith(("answer_", "results_", "final"))
                ]
            ),
            "errors": sum(s.get("status") != 200 for s in external.get("samples", []) if s["kind"] == kind),
        }
        for kind in ("python", "rust")
    }
    base["independent_probe_skipped"] = external.get("skipped")
    base["integrity"] = bool(
        base["integrity"]
        and native.get("accepted") == base["users"] * base["rounds"]
        and native.get("errors") == 0
        and native.get("emit_errors") == 0
    )
    # Same response targets. CPU budget now refers to the four allowed server
    # cores, with Rust using a multithreaded runtime; report both processes.
    base["comfortable_host_observed"] = bool(
        base["integrity"]
        and base["stored_p95_ms"] <= 1000
        and base["all_question_results_p95_ms"] <= 1000
        and base["all_final_results_ms"] <= 1000
        and base["http_p95_ms"] <= 100
        and (base["rust_http_p95_ms"] or float("inf")) <= 100
        and base["combined_runtime_cpu_percent_one_core"] <= 280
    )
    api_probe = base["independent_http"]["python"]["p95_ms"]
    rust_probe = base["independent_http"]["rust"]["p95_ms"]
    base["comfortable"] = bool(
        base["integrity"]
        and base["stored_p95_ms"] <= 1000
        and base["all_question_results_p95_ms"] <= 1000
        and base["all_final_results_ms"] <= 1000
        and (api_probe if api_probe is not None else base["http_p95_ms"]) <= 100
        and (rust_probe if rust_probe is not None else (base["rust_http_p95_ms"] or float("inf"))) <= 100
        and base["combined_runtime_cpu_percent_one_core"] <= 280
        and (
            not external
            or (
                base["independent_probe_skipped"] == 0
                and all(d["errors"] == 0 for d in base["independent_http"].values())
            )
        )
    )
    base["rounds_detail"] = [
        {
            k: q[k]
            for k in ("index", "host_question_ms", "all_stored_ms", "host_answer_notifications", "scoring_elapsed_ms")
        }
        for q in raw["questions"]
    ]
    return base


if __name__ == "__main__":
    print(json.dumps([report(Path(p)) for p in sys.argv[1:]], indent=2))
