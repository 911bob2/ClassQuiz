"""Summarize completed basic/large runs, including every bot's result receipt."""

import json
import math
import statistics
import sys
from datetime import datetime
from pathlib import Path


def percentile(values, p=0.95):
    return sorted(values)[max(0, math.ceil(len(values) * p) - 1)] if values else None


def epoch(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def summarize(path):
    run = json.loads(path.read_text())
    bots = json.loads(path.with_suffix(".bots.json").read_text())
    bot_questions = {q["question_index"]: q for q in bots["questions"]}
    questions = run["questions"]
    stored = [q["all_stored_ms"] for q in questions]
    receipts = [
        max(0, (epoch(bot_questions[q["index"]]["last_result_at"]) - q["results_requested_at"]) * 1000)
        for q in questions
        if q["index"] in bot_questions
    ]
    final_ms = (
        max(0, (epoch(bots["last_final_at"]) - run["final_requested_at"]) * 1000)
        if run.get("final_requested_at")
        else None
    )
    samples = [s for s in run["server"]["samples"] if s["phase"].startswith(("answer_", "results_", "final"))]
    cpu = (
        (100 * (samples[-1]["cpu_s"] - samples[0]["cpu_s"]) / (samples[-1]["time"] - samples[0]["time"]))
        if len(samples) > 1
        else 0
    )
    probes = [s["ms"] for s in run["http"] if s["phase"].startswith(("answer_", "results_", "final"))]
    users = run["users"]
    integrity = (
        not run.get("error")
        and run["bot_exit"] == 0
        and not bots["failures"]
        and bots["unexpected_disconnects"] == 0
        and bots["players_joined"] == users
        and bots["final_result_receipts"] == users
        and not run["server"].get("exceptions")
        and len(questions) == run["settings"]["questions"]
        and all(q["stored"] == users and q["unique_players"] == users for q in questions)
        and all(run.get("host_final_counts", {}).get(str(q["index"])) == users for q in questions)
        and all(
            q["result_receipts"] == users
            and q.get("answers_recorded") == users
            and q.get("answers_missing") == 0
            and q["duplicate_bot_answers"] == 0
            for q in bots["questions"]
        )
    )
    out = dict(
        label=run["label"],
        answer_validation=run.get("environment", {}).get("answer_validation", "whole-quiz"),
        quiz_questions=run["settings"].get("quiz_questions", 10),
        users=users,
        rounds=len(questions),
        integrity=integrity,
        join_seconds=run["join_seconds"],
        stored_median_ms=statistics.median(stored) if stored else None,
        stored_p95_ms=percentile(stored),
        stored_max_ms=max(stored) if stored else None,
        all_question_results_p95_ms=percentile(receipts),
        all_question_results_max_ms=max(receipts) if receipts else None,
        all_final_results_ms=final_ms,
        http_p95_ms=percentile(probes),
        http_max_ms=max(probes) if probes else None,
        gameplay_cpu_percent_one_core=cpu,
        api_peak_rss_mib=max(s["rss_kib"] for s in run["server"]["samples"]) / 1024,
        api_peak_fds=max(s["fds"] for s in run["server"]["samples"]),
        rx_mib=bots["received_payload_bytes"] / 2**20,
        generator_peak_cpu=max(s["cpu_percent_one_core"] for s in bots["generator_samples"]),
        generator_peak_rss_mib=max(s["rss_bytes"] for s in bots["generator_samples"]) / 2**20,
        disconnects=bots["unexpected_disconnects"],
        failures=bots["failures"],
        answer_total=sum(q["stored"] for q in questions),
        final_receipts=bots["final_result_receipts"],
    )
    out["comfortable"] = bool(
        integrity
        and out["stored_p95_ms"] <= 1000
        and out["all_question_results_p95_ms"] <= 1000
        and final_ms <= 1000
        and out["http_p95_ms"] <= 100
        and cpu <= 70
    )
    return out


if __name__ == "__main__":
    paths = [Path(p) for p in sys.argv[1:]]
    print(json.dumps([summarize(p) for p in paths], indent=2))
