"""Drive the real ClassQuiz host protocol against the isolated Compose stack."""

import argparse
import asyncio
import json
import os
import signal
import statistics
import sys
import time
import uuid
from pathlib import Path

import aiohttp
import redis.asyncio as redis
import socketio


async def main():
    p = argparse.ArgumentParser()
    p.add_argument("--users", type=int, default=300)
    p.add_argument("--questions", type=int, default=10)
    p.add_argument("--label", required=True)
    p.add_argument("--ramp", type=float, default=15)
    p.add_argument("--profile", action="store_true")
    p.add_argument("--profile-phase", default="", help="Profile one phase separately from unprofiled capacity runs")
    p.add_argument("--compact", action="store_true")
    p.add_argument("--transport", default="auto")
    p.add_argument("--idle", type=float, default=2)
    p.add_argument("--large-audience", action="store_true")
    p.add_argument("--quiz-questions", type=int, default=10)
    p.add_argument("--answer-max", default="500ms")
    p.add_argument("--answer-mode", choices=("spread", "burst"), default="spread")
    p.add_argument("--round-pause", type=float, default=1)
    p.add_argument("--mixed", action="store_true")
    p.add_argument("--rust", action="store_true")
    p.add_argument("--captcha", action="store_true")
    args = p.parse_args()
    target = "http://proxy:8080"
    store = redis.Redis.from_url("redis://redis:6379/0", decode_responses=True)
    pin = str(100000 + uuid.uuid4().int % 900000)
    run_id = str(uuid.uuid4())
    game = dict(
        quiz_id=str(uuid.uuid4()),
        user_id=str(uuid.uuid4()),
        game_id=run_id,
        game_pin=pin,
        title="Local performance benchmark",
        description="Synthetic 4-choice quiz",
        started=False,
        captcha_enabled=False,
        game_mode="kahoot",
        current_question=-1,
        large_audience=args.large_audience,
        realtime_engine="rust" if args.rust else "python",
        realtime_phase="lobby",
        questions=[
            dict(
                question=f"Question {i+1}",
                time="30",
                type="ABCD",
                answers=[dict(answer=c, right=c == "A") for c in "ABCD"],
            )
            for i in range(max(args.quiz_questions, args.questions))
        ],
    )
    if args.captcha:
        assert args.rust
        async with aiohttp.ClientSession() as config_http:
            for attempt in range(40):
                try:
                    async with config_http.get(
                        "http://api:81/__rust/capabilities", timeout=aiohttp.ClientTimeout(total=2)
                    ) as response:
                        response.raise_for_status()
                        capabilities = await response.json()
                    break
                except (aiohttp.ClientError, asyncio.TimeoutError):
                    if attempt == 39:
                        raise
                    await asyncio.sleep(1)
            assert capabilities["captcha_lab"] and capabilities["captcha_policy"]["site_key"] == "lab-site-key"
            game.update(captcha_enabled=True, captcha_policy=capabilities["captcha_policy"], captcha_lab=True)
            async with config_http.post(
                "http://captcha-provider:9080/config", json={"delay_ms": 200, "mode": "token", "reset": True}
            ) as response:
                await response.read()
    if args.mixed:
        variants = [
            ("ABCD", [dict(answer="A", right=True), dict(answer="B", right=False)]),
            ("RANGE", dict(min=0, max=10, min_correct=4, max_correct=6)),
            ("TEXT", [dict(answer="Yes", case_sensitive=False)]),
            ("CHECK", [dict(answer="A", right=True), dict(answer="B", right=False)]),
            ("ORDER", [dict(answer="A"), dict(answer="B")]),
            ("VOTING", [dict(answer="A"), dict(answer="B")]),
        ]
        for index, question in enumerate(game["questions"]):
            question["type"], question["answers"] = variants[index % len(variants)]
    await store.set(f"game:{pin}", json.dumps(game), ex=7200)
    output = Path("/results") / args.label
    result = dict(
        label=args.label, pin=pin, users=args.users, questions=[], http=[], settings=vars(args), start=time.time()
    )
    # aiohttp defaults to a 4 MiB incoming message cap. A host's complete history
    # for 10k players x 10 rounds exceeds that; browsers/bots are not subject to
    # this controller-specific default. Keep a bounded 64 MiB lab-host cap.
    client = socketio.AsyncClient(reconnection=False, websocket_extra_options={"max_msg_size": 64 * 1024 * 1024})
    registered = asyncio.Event()
    started = asyncio.Event()
    question_received = asyncio.Event()
    results_received = asyncio.Event()
    final_received = asyncio.Event()
    joined = set()
    host_answers = []
    phase = "setup"
    probe_task = None
    native_probe_task = None
    process = None
    external_probe = None
    probe_state = Path(str(output) + ".phase")
    probe_output = Path(str(output) + ".http.json")
    probe_state.write_text("setup")
    log = output.with_suffix(".log").open("w")

    @client.on("registered_as_admin")
    async def on_registered(data):
        registered.set()

    @client.on("player_joined")
    async def on_joined(data):
        joined.add(data["username"])

    @client.on("start_game")
    async def on_started(*_):
        started.set()

    @client.on("set_question_number")
    async def on_question(data):
        question_received.set()

    @client.on("question_results")
    async def on_results(data):
        results_received.set()

    @client.on("final_results")
    async def on_final(data):
        result["host_final_counts"] = (
            data["answer_counts"] if data.get("native_summary") else {k: len(v) for k, v in data.items()}
        )
        final_received.set()

    @client.on("player_answer")
    async def on_answer(*_):
        host_answers.append(time.perf_counter())

    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as http:

        async def change_phase(name):
            nonlocal phase
            info = await store.info()
            result.setdefault("redis_phases", []).append(
                {
                    "phase_ending": phase,
                    "time": time.time(),
                    **{
                        key: info.get(key)
                        for key in (
                            "used_cpu_sys",
                            "used_cpu_user",
                            "used_memory",
                            "used_memory_rss",
                            "connected_clients",
                            "total_commands_processed",
                            "total_net_input_bytes",
                            "total_net_output_bytes",
                            "rejected_connections",
                            "blocked_clients",
                        )
                    },
                }
            )
            result["redis_phases"][-1]["commandstats"] = await store.info("commandstats")
            if result.get("environment", {}).get("rust_pid"):
                async with http.get("http://api:81/__rust/metrics") as response:
                    response.raise_for_status()
                    result.setdefault("rust_phases", []).append(
                        {"phase_ending": phase, "time": time.time(), **await response.json()}
                    )
            phase = name
            probe_state.write_text(name)
            async with http.post(f"{target}/__bench/phase/{name}") as r:
                await r.read()

        async def probe():
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20)) as probe_http:
                while True:
                    at = time.perf_counter()
                    sample = dict(phase=phase, time=time.time())
                    try:
                        async with probe_http.get(f"{target}/api/v1/quiz/play/check_captcha/{pin}") as r:
                            await r.read()
                            sample["status"] = r.status
                    except Exception as exc:
                        sample["error"] = repr(exc)
                    sample["ms"] = (time.perf_counter() - at) * 1000
                    result["http"].append(sample)
                    await asyncio.sleep(0.1)

        async def native_probe():
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20)) as probe_http:
                while True:
                    at = time.perf_counter()
                    sample = dict(phase=phase, time=time.time())
                    try:
                        async with probe_http.get("http://api:81/health") as response:
                            await response.read()
                            sample["status"] = response.status
                    except Exception as exc:
                        sample["error"] = repr(exc)
                    sample["ms"] = (time.perf_counter() - at) * 1000
                    result.setdefault("rust_http", []).append(sample)
                    await asyncio.sleep(0.1)

        try:
            async with http.post(
                f"{target}/__bench/reset",
                params={
                    "enable_profile": str(args.profile).lower(),
                    "profile_phase": args.profile_phase,
                },
            ) as r:
                r.raise_for_status()
                result["environment"] = await r.json()
            await client.connect(
                target, transports=["websocket"], socketio_path="socket.io-rust" if args.rust else "socket.io"
            )
            await client.emit("register_as_admin", dict(game_pin=pin, game_id=run_id))
            await asyncio.wait_for(registered.wait(), 10)
            options = [
                sys.executable,
                "/lab/http_probe.py",
                "--pin",
                pin,
                "--output",
                str(probe_output),
                "--state",
                str(probe_state),
            ]
            if result["environment"].get("rust_pid"):
                options.append("--rust")
            external_probe = await asyncio.create_subprocess_exec(*options)
            probe_task = asyncio.create_task(probe())
            if result["environment"].get("rust_pid"):
                native_probe_task = asyncio.create_task(native_probe())
            await change_phase("joins")
            join_start = time.perf_counter()
            process = await asyncio.create_subprocess_exec(
                "/results/stresstest",
                "--target",
                target,
                "--users",
                str(args.users),
                "--code",
                pin,
                "--traffic",
                "gameplay",
                "--answer-min",
                "0ms",
                "--answer-max",
                args.answer_max,
                "--answer-mode",
                args.answer_mode,
                "--ramp-up",
                f"{args.ramp}s",
                "--transport",
                args.transport,
                "--timeout",
                "20s",
                "--duration",
                "15m",
                "--seed",
                "800155105054402584",
                "--wait-all-results",
                "--verbosity",
                "1",
                "--output",
                str(output) + ".bots.json",
                *(["--lab-captcha"] if args.captcha else []),
                stdout=log,
                stderr=log,
            )
            while len(joined) < args.users and time.perf_counter() - join_start < args.ramp + 60:
                await asyncio.sleep(0.1)
            result["join_seconds"] = time.perf_counter() - join_start
            result["host_joined"] = len(joined)
            result["redis_players"] = await store.scard(f"game_session:{pin}:players")
            print(
                json.dumps({"label": args.label, "joined": len(joined), "seconds": result["join_seconds"]}), flush=True
            )
            if len(joined) < args.users:
                raise RuntimeError("Not all players joined; gameplay intentionally skipped")
            await change_phase("idle")
            await asyncio.sleep(args.idle)
            await client.emit("start_game", {})
            await asyncio.wait_for(started.wait(), 10)
            for index in range(args.questions):
                await change_phase(f"answer_{index}")
                question_received.clear()
                q = dict(index=index)
                before_answers = len(host_answers)
                at = time.perf_counter()
                await client.emit("set_question_number", str(index))
                await asyncio.wait_for(question_received.wait(), 30)
                q["host_question_ms"] = (time.perf_counter() - at) * 1000
                q["progress"] = []
                count = 0
                while count < args.users and time.perf_counter() - at < 45:
                    count = await store.llen(f"game_session:{pin}:{index}")
                    q["progress"].append([round((time.perf_counter() - at) * 1000, 3), count])
                    if count < args.users:
                        await asyncio.sleep(0.05)
                q["all_stored_ms"] = (time.perf_counter() - at) * 1000
                q["stored"] = count
                await asyncio.sleep(0.2)
                q["host_answer_notifications"] = len(host_answers) - before_answers
                records = [json.loads(x) for x in await store.lrange(f"game_session:{pin}:{index}", 0, -1)]
                q["unique_players"] = len({x["username"] for x in records})
                elapsed = sorted(row["time_taken"] for row in records)
                if elapsed:
                    q["scoring_elapsed_ms"] = {
                        "median": statistics.median(elapsed),
                        "p95": elapsed[max(0, int(len(elapsed) * 0.95 + 0.999999) - 1)],
                        "max": elapsed[-1],
                    }
                await change_phase(f"results_{index}")
                results_received.clear()
                at = time.perf_counter()
                q["results_requested_at"] = time.time()
                await client.call("get_question_results", {"question_number": str(index)}, timeout=60)
                await asyncio.wait_for(results_received.wait(), 60)
                q["host_results_ms"] = (time.perf_counter() - at) * 1000
                result["questions"].append(q)
                print(json.dumps({"label": args.label, **{k: v for k, v in q.items() if k != "progress"}}), flush=True)
                await asyncio.sleep(args.round_pause)
            await change_phase("final")
            at = time.perf_counter()
            result["final_requested_at"] = time.time()
            await client.emit("get_final_results", {})
            await asyncio.wait_for(final_received.wait(), 60)
            result["host_final_ms"] = (time.perf_counter() - at) * 1000
            if args.compact:
                await asyncio.sleep(2)
                process.send_signal(signal.SIGINT)
            await asyncio.wait_for(process.wait(), 60)
            result["all_final_process_ms"] = (time.perf_counter() - at) * 1000
        except Exception as exc:
            result["error"] = repr(exc)
            print(json.dumps({"label": args.label, "error": repr(exc)}), flush=True)
        finally:
            if process and process.returncode is None:
                process.send_signal(signal.SIGINT)
                try:
                    await asyncio.wait_for(process.wait(), 25)
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()
            result["bot_exit"] = process.returncode if process else None
            try:
                await change_phase("after")
            except Exception as exc:
                result["cleanup_error"] = repr(exc)
            await asyncio.sleep(1)
            if probe_task:
                probe_task.cancel()
                await asyncio.gather(probe_task, return_exceptions=True)
            if native_probe_task:
                native_probe_task.cancel()
                await asyncio.gather(native_probe_task, return_exceptions=True)
            if external_probe:
                probe_state.write_text("stop")
                try:
                    await asyncio.wait_for(external_probe.wait(), 25)
                    if probe_output.exists():
                        result["external_probe"] = json.loads(probe_output.read_text())
                except asyncio.TimeoutError:
                    external_probe.kill()
                    await external_probe.wait()
                    result["external_probe_error"] = "probe did not stop"
            try:
                async with http.get(f"{target}/__bench/metrics") as r:
                    r.raise_for_status()
                    result["server"] = await r.json()
            except Exception as exc:
                result["metrics_error"] = repr(exc)
            await client.disconnect()
            result["end"] = time.time()
            bot_report = output.with_suffix(".bots.json")
            if bot_report.exists():
                bots = json.loads(bot_report.read_text())
                result["complete_player_results"] = (
                    bots.get("final_result_receipts") == args.users
                    and len(bots["questions"]) == args.questions
                    and all(q.get("result_receipts") == args.users for q in bots["questions"])
                )
            if args.captcha:
                async with http.get("http://captcha-provider:9080/metrics") as r:
                    result["captcha_provider"] = await r.json()
            output.with_suffix(".json").write_text(json.dumps(result, indent=2))
            log.close()
            await store.aclose()
    print(json.dumps({"report": str(output) + ".json", "bot_exit": result["bot_exit"]}), flush=True)
    return (
        not result.get("error")
        and result["bot_exit"] == 0
        and result.get("complete_player_results", False)
        and len(result["questions"]) == args.questions
        and all(q["stored"] == args.users and q["unique_players"] == args.users for q in result["questions"])
    )


if __name__ == "__main__":
    sys.exit(0 if asyncio.run(main()) else 1)
