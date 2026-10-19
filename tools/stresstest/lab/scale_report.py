"""Current-engine scale runs, with per-phase process and Redis measurements."""

import json
import sys
from pathlib import Path

from compare_modes import percentile, summarize


def report(path):
    run = json.loads(path.read_text(encoding="utf-8"))
    out = summarize(path)
    out["settings"] = run["settings"]
    out["environment"] = run["environment"]
    probes = [s["ms"] for s in run["http"] if s["phase"].startswith("answer_")]
    out["answer_http_p95_ms"] = percentile(probes)
    out["answer_http_max_ms"] = max(probes) if probes else None
    out["round_details"] = [
        {k: q[k] for k in ("index", "all_stored_ms", "host_question_ms", "scoring_elapsed_ms") if k in q}
        for q in run["questions"]
    ]
    out["phases"] = {}
    for name in run["server"]["phases"]:
        samples = [s for s in run["server"]["samples"] if s["phase"] == name]
        lag = [s["ms"] for s in run["server"]["lag"] if s["phase"] == name]
        stages = run["server"]["phases"][name].get("stage", {})
        collections = [s for s in run["server"].get("gc", []) if s["phase"] == name]
        data = {
            "event_loop_lag_p95_ms": percentile(lag),
            "event_loop_lag_max_ms": max(lag) if lag else None,
            "stages": stages,
            "gc_total_ms": sum(s["ms"] for s in collections),
            "gc_max_ms": max((s["ms"] for s in collections), default=0),
            "gc_collections": len(collections),
            "redis_calls": run["server"]["phases"][name].get("redis", {}),
            "emits": run["server"]["phases"][name].get("emit", {}),
        }
        if len(samples) >= 2:
            data["api_cpu_percent_one_core"] = (
                100 * (samples[-1]["cpu_s"] - samples[0]["cpu_s"]) / (samples[-1]["time"] - samples[0]["time"])
            )
        if samples:
            data["peak_redis_connections"] = max(s.get("redis_connections", 0) for s in samples)
        out["phases"][name] = data
    for before, after in zip(run.get("redis_phases", []), run.get("redis_phases", [])[1:]):
        data = out["phases"].setdefault(after["phase_ending"], {})
        data["redis_cpu_seconds"] = sum(after[k] - before[k] for k in ("used_cpu_sys", "used_cpu_user"))
        data["redis_cpu_percent_one_core"] = 100 * data["redis_cpu_seconds"] / (after["time"] - before["time"])
        data["redis_commands"] = after["total_commands_processed"] - before["total_commands_processed"]
        for stat in ("total_net_input_bytes", "total_net_output_bytes"):
            data["redis_" + stat + "_delta"] = after[stat] - before[stat]
        previous = before.get("commandstats", {}).get("cmdstat_evalsha", {})
        current = after.get("commandstats", {}).get("cmdstat_evalsha", {})
        calls = current.get("calls", 0) - previous.get("calls", 0)
        if calls > 0:
            data["redis_lua_mean_us"] = (current["usec"] - previous.get("usec", 0)) / calls
    return out


if __name__ == "__main__":
    print(json.dumps([report(Path(p)) for p in sys.argv[1:]], indent=2))
