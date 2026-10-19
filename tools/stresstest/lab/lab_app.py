"""Local-only instrumentation and reversible ablations; never import in production."""

import asyncio
import cProfile
import functools
import gc
import json
import os
import resource
import time
from collections import defaultdict

from fastapi import APIRouter
from classquiz import app
from classquiz import socket_server as server
from classquiz.config import redis
from classquiz.db.models import PlayGame

PATCHES = set(os.getenv("LAB_PATCHES", "baseline").split(","))
if hasattr(server, "delivery_for") and PATCHES != {"baseline"}:
    raise RuntimeError(
        "Legacy ablations require commit 50c6dd16. Use baseline instrumentation for the implemented modes."
    )
metrics = {}
phase = "idle"
profile = cProfile.Profile()
profiling = False
selected_profile_phase = ""
cache = {}
rust_runtime = None


@app.on_event("startup")
async def configure_lab_captcha():
    # The normal Python app has no provider-URL override. This adapter lives only
    # in the disposable laboratory and exercises its real HTTP verifier.
    if os.getenv("CAPTCHA_TEST_VERIFY_URL"):
        import aiohttp
        import classquiz.captcha as captcha

        verifier = captcha.CaptchaVerifier(*captcha.configuration())
        session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5, connect=2))

        class LocalProviderSession:
            def post(self, _url, **kwargs):
                return session.post(os.environ["CAPTCHA_TEST_VERIFY_URL"], **kwargs)

            async def close(self):
                await session.close()

        verifier.session = LocalProviderSession()
        captcha._verifier = verifier


if os.getenv("LAB_RUST_BINARY"):
    from classquiz.realtime_process import RustRealtime

    rust_runtime = RustRealtime(
        os.environ["LAB_RUST_BINARY"],
        os.environ["REDIS"].split("?", 1)[0],
        threads=int(os.getenv("LAB_RUST_THREADS", "4")),
        redis_connections=int(os.getenv("LAB_RUST_REDIS_CONNECTIONS", "8")),
    )
scale_experiment = os.getenv("LAB_SCALE", "")
if scale_experiment:
    scale_options = set(scale_experiment.split(","))
    if scale_options - {"cached-context", "sparse-full-gc"}:
        raise RuntimeError(f"Unknown LAB_SCALE experiment: {scale_experiment}")
    if "cached-context" in scale_options:
        from scale_experiments import install

        install(server)
    if "sparse-full-gc" in scale_options:
        # Measurement only: young-generation collection remains active, but full
        # graph scans are deferred. A deployed design needs bounded idle-time
        # collection, churn/soak tests and memory-pressure handling.
        gc.set_threshold(700, 10, 100000)


def reset():
    metrics.clear()
    metrics.update(start=time.time(), phases={}, lag=[], samples=[], rust_samples=[], exceptions=[], gc=[])


reset()

gc_started = {}


def gc_monitor(event, info):
    generation = info["generation"]
    if event == "start":
        gc_started[generation] = time.perf_counter()
    elif generation in gc_started:
        metrics["gc"].append(
            {
                "phase": phase,
                "generation": generation,
                "ms": (time.perf_counter() - gc_started.pop(generation)) * 1000,
                "collected": info.get("collected", 0),
            }
        )


gc.callbacks.append(gc_monitor)


def bucket(kind, key):
    phases = metrics["phases"].setdefault(phase, {})
    return phases.setdefault(kind, {}).setdefault(key, {"calls": 0, "wall_s": 0.0, "max_s": 0.0})


def record(kind, key, duration, **counts):
    b = bucket(kind, key)
    b["calls"] += 1
    b["wall_s"] += duration
    b["max_s"] = max(b["max_s"], duration)
    for k, v in counts.items():
        b[k] = b.get(k, 0) + v


# Ablation: move already-unneeded broadcasts to their intended audience.
raw_emit = server.sio.emit


async def emit(event, data=None, to=None, room=None, **kwargs):
    if "scoped" in PATCHES:
        # session_id is handled by the connect wrapper below, which knows sid.
        if event == "player_answer" and room is None and to is None:
            sid = current_sid.get()
            if sid:
                session = await server.get_session(sid, server.sio)
                room = f"admin:{session['game_pin']}"
        if event == "everyone_answered" and room is None and to is None:
            sid = current_sid.get()
            if sid:
                session = await server.get_session(sid, server.sio)
                room = session["game_pin"]
        if event == "session_id":
            room = current_sid.get()
    if "compact" in PATCHES and event in {"question_results", "final_results"}:
        # Measurement-only: full detail still reaches the host. This deliberately
        # omits player result screens; the production proposal requires a new
        # personal/aggregate response schema, not simply this filter.
        room = f"admin:{room}"
    audience = room if room is not None else to
    recipients = len(server.sio.manager.rooms.get("/", {}).get(audience, {}))
    start = time.perf_counter()
    try:
        return await raw_emit(event, data, to=to, room=room, **kwargs)
    finally:
        record("emit", event, time.perf_counter() - start, recipients=recipients)


from contextvars import ContextVar

current_sid = ContextVar("benchmark_sid", default=None)
server.sio.emit = emit


def timed_handler(name, fn):
    @functools.wraps(fn)
    async def wrapped(sid, *args, **kwargs):
        token = current_sid.set(sid)
        start = time.perf_counter()
        try:
            return await fn(sid, *args, **kwargs)
        except Exception as exc:
            expected_auth_fallback = (
                name == "connect" and len(args) == 1 and isinstance(exc, TypeError) and "_auth" in str(exc)
            )
            if not expected_auth_fallback and len(metrics["exceptions"]) < 30:
                metrics["exceptions"].append({"handler": name, "error": repr(exc)})
            raise
        finally:
            record("handler", name, time.perf_counter() - start)
            current_sid.reset(token)

    return wrapped


for name, fn in list(server.sio.handlers["/"].items()):
    server.sio.handlers["/"][name] = timed_handler(name, fn)


raw_command = redis.execute_command


async def command(*args, **kwargs):
    start = time.perf_counter()
    result = None
    try:
        result = await raw_command(*args, **kwargs)
        return result
    finally:
        name = str(args[0]).upper()
        record("redis", name, time.perf_counter() - start, list_items=len(result) if name == "LRANGE" and result else 0)


redis.execute_command = command
from classquiz.socket_server.helpers import has_already_answered

raw_duplicate = has_already_answered


async def duplicate(pin, index, username):
    start = time.perf_counter()
    try:
        if "indexed" in PATCHES:
            # Atomic admission reservation to measure removal of the full-list
            # scan. NOT production ready: a crash after reservation can leave an
            # unanswered reservation. A production Lua commit must combine the
            # uniqueness check, answer, score and count after validation.
            return not await redis.sadd(f"bench:answered:{pin}:{index}", username)
        return await raw_duplicate(pin, index, username)
    finally:
        record("stage", "duplicate_check", time.perf_counter() - start)


server.has_already_answered = duplicate

# Attribute current engine stages separately. Durations overlap while awaiting
# Redis, so these are latency observations, not additive CPU measurements.
for stage_name in ("get_session", "load_answer_context", "commit_answer"):
    if hasattr(server, stage_name):

        def wrap_stage(name, fn):
            @functools.wraps(fn)
            async def measured(*args, **kwargs):
                start = time.perf_counter()
                try:
                    return await fn(*args, **kwargs)
                finally:
                    record("stage", name, time.perf_counter() - start)

            return measured

        setattr(server, stage_name, wrap_stage(stage_name, getattr(server, stage_name)))
raw_get_game = PlayGame.get_from_redis
raw_save_game = PlayGame.save


async def get_game(cls, pin):
    start = time.perf_counter()
    try:
        if "cached" not in PATCHES:
            return await raw_get_game(pin)
        if pin not in cache:
            cache[pin] = await raw_get_game(pin)
        return cache[pin].model_copy(deep=True)
    finally:
        record("stage", "load_game", time.perf_counter() - start)


async def save_game(self, pin, ex=7200):
    await raw_save_game(self, pin, ex)
    if "cached" in PATCHES:
        cache[pin] = self.model_copy(deep=True)


PlayGame.get_from_redis = classmethod(get_game)
PlayGame.save = save_game


if "atomic" in PATCHES:
    from datetime import datetime
    from classquiz.db.models import AnswerData
    from classquiz.socket_server.models import SubmitAnswerData

    # Same answer list/score schema; experimental local-only atomic commit.
    # Production still needs explicit question-generation/deadline validation
    # inside the transaction and lifecycle/retry/migration tests.
    commit_answer = redis.register_script(
        """
        if redis.call('SADD', KEYS[1], ARGV[1]) == 0 then return {-1, 0} end
        redis.call('EXPIRE', KEYS[1], 7200)
        local count = redis.call('RPUSH', KEYS[2], ARGV[2])
        redis.call('EXPIRE', KEYS[2], 7200)
        redis.call('HINCRBY', KEYS[3], ARGV[1], ARGV[3])
        return {count, redis.call('SCARD', KEYS[4])}
    """
    )

    async def atomic_submit(sid, data):
        now = datetime.now()
        data = SubmitAnswerData(**data)
        data.answer = str(data.answer)
        session = await server.get_session(sid, server.sio)
        pin = session["game_pin"]
        index = int(float(data.question_index))
        game = await PlayGame.get_from_redis(pin)
        if index != game.current_question:
            await server.sio.emit("question_not_active", room=sid)
            return
        right, answer = server.check_answer(game, data)
        latency = int(float(session["ping"]))
        at = datetime.fromisoformat(await redis.get(f"game:{pin}:current_time"))
        elapsed = abs((at - now).total_seconds() * 1000) - latency
        score = min(1000, server.calculate_score(elapsed, int(float(game.questions[index].time)))) if right else 0
        row = AnswerData(username=session["username"], answer=answer, right=right, time_taken=elapsed, score=score)
        count, players = await commit_answer(
            keys=[
                f"bench:atomic:{pin}:{index}",
                f"game_session:{pin}:{index}",
                f"game_session:{pin}:player_scores",
                f"game_session:{pin}:players",
            ],
            args=[session["username"], row.model_dump_json(), score],
        )
        if count < 0:
            await server.sio.emit("already_replied", room=sid)
            return
        await server.sio.emit("player_answer", {}, room=f"admin:{pin}")
        if count == players:
            game = await PlayGame.get_from_redis(pin)
            game.question_show = False
            await game.save(pin)
            await server.sio.emit("everyone_answered", {}, room=pin)

    server.sio.handlers["/"]["submit_answer"] = timed_handler("submit_answer", atomic_submit)


async def ticker():
    next_sample = time.monotonic()
    while True:
        start = time.monotonic()
        await asyncio.sleep(0.02)
        now = time.monotonic()
        metrics["lag"].append({"phase": phase, "ms": max(0, now - start - 0.02) * 1000})
        if now >= next_sample:
            usage = resource.getrusage(resource.RUSAGE_SELF)
            metrics["samples"].append(
                {
                    "phase": phase,
                    "time": time.time(),
                    "cpu_s": usage.ru_utime + usage.ru_stime,
                    "rss_kib": usage.ru_maxrss,
                    "fds": len(os.listdir("/proc/self/fd")),
                    "sockets": len(server.sio.eio.sockets),
                    "redis_connections": len(redis.connection_pool._available_connections)
                    + len(redis.connection_pool._in_use_connections),
                }
            )
            if rust_runtime:
                child = rust_runtime.sample()
                if child:
                    metrics["rust_samples"].append({"phase": phase, "time": time.time(), **child})
            next_sample = now + 0.5


@app.on_event("startup")
async def start_monitor():
    if rust_runtime:
        await rust_runtime.start()
        rust_runtime.supervise()
    asyncio.create_task(ticker())


@app.on_event("shutdown")
async def stop_runtime():
    if rust_runtime:
        await rust_runtime.stop()


router = APIRouter()


@router.post("/__bench/kill_rust")
async def kill_rust():
    import signal

    if not rust_runtime or rust_runtime.process.returncode is not None:
        return {"killed": None}
    pid = rust_runtime.process.pid
    os.kill(pid, signal.SIGKILL)
    return {"killed": pid}


@router.post("/__bench/reset")
async def reset_metrics(enable_profile: bool = False, profile_phase: str = ""):
    global profiling, selected_profile_phase
    selected_profile_phase = profile_phase
    profile.disable()
    profile.clear()
    reset()
    profiling = enable_profile
    if profiling:
        profile.enable()
    return {
        "patches": sorted(PATCHES),
        "profile_phase": profile_phase,
        "scale_experiment": scale_experiment,
        "event_loop": type(asyncio.get_running_loop()).__module__,
        "gc_thresholds": gc.get_threshold(),
        "answer_validation": "active-question" if hasattr(server, "load_answer_context") else "whole-quiz",
        "pid": os.getpid(),
        "rust_pid": rust_runtime.process.pid if rust_runtime else None,
        "rust_config": (
            {
                "threads": rust_runtime.threads,
                "redis_connections": rust_runtime.redis_connections,
                "binary_sha256": rust_runtime.binary_sha256,
            }
            if rust_runtime
            else None
        ),
        "cpus": sorted(os.sched_getaffinity(0)),
        "nofile": resource.getrlimit(resource.RLIMIT_NOFILE),
    }


@router.post("/__bench/phase/{name}")
async def set_phase(name: str):
    global phase, profiling
    if selected_profile_phase and profiling:
        profile.disable()
        profile.dump_stats(f"/results/server-{selected_profile_phase}.prof")
        profiling = False
    phase = name
    if selected_profile_phase == name:
        profile.clear()
        profile.enable()
        profiling = True
    return {"phase": phase}


@router.get("/__bench/metrics")
async def get_metrics():
    if profiling:
        profile.disable()
        profile.dump_stats("/results/server.prof")
    native = await rust_runtime.metrics() if rust_runtime else None
    return {**metrics, "patches": sorted(PATCHES), "phase": phase, "rust": native}


# The real application mounts Socket.IO at '/' last; bench routes go before it.
app.router.routes[-1:-1] = router.routes
