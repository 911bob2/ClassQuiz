"""Compact the raw local integration evidence; no application imports/network."""

import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
lab = root.parent / "stresstest" / "lab"
sys.path.insert(0, str(lab))
from rust_report import report


def log_json(path):
    text = path.read_text(encoding="utf-8")
    return json.JSONDecoder().raw_decode(text[text.index("{") :])[0]


def main():
    results = lab / "results"
    runs = [report(results / f"rust-{users}-hardened.json") for users in (10000, 30000)]
    assert all(run["integrity"] for run in runs)
    evidence = dict(
        date="2026-10-15",
        server_cpus=[0, 1, 2, 3],
        generator_cpus=[4, 5, 6, 7],
        api_plus_rust_gib=2,
        proxy_gib=2,
        generator_gib=4,
        notes=[
            "Short local tests; no VM deployment. Other PC workloads varied.",
            "Four Tokio workers, one Python API worker, Redis AOF, heartbeats retained, no WebSocket compression.",
            "250ms live counts and 50-row host pages; full stored records and exports retained.",
            "All-stored includes 0-500ms per-player think time; ~50ms polling resolution.",
            "Runtime CPU includes Python plus Rust, excludes Redis/proxy; all share four server CPUs.",
            "Independent fixed-rate HTTP probes; one ten-round run per size.",
        ],
        clean_answer_total=sum(run["answer_total"] for run in runs),
        runs=runs,
        recovery=log_json(results / "rust-recovery-checks.log"),
        reconnect=json.loads((results / "rust-reconnect-1000.json").read_text()),
        integration=log_json(results / "rust-integration-checks.log"),
        browser=json.loads((results / "rust-browser-checks.json").read_text()),
        browser_polling=json.loads((results / "rust-browser-polling-checks.json").read_text()),
    )
    for run in runs:
        run["source_binary_sha256"] = run["environment"]["rust_config"]["binary_sha256"]
    (root / "hardened-measurements.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            dict(
                clean_answers=evidence["clean_answer_total"],
                valid=[r["integrity"] for r in runs],
                comfort=[r["comfortable"] for r in runs],
                sha256=runs[0]["source_binary_sha256"],
            )
        )
    )


if __name__ == "__main__":
    main()
