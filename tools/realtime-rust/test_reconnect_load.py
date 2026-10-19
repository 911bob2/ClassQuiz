"""A real Go-client reconnect wave after SIGKILL, isolated lab only."""

import argparse
import asyncio
import json
import signal
import time
import uuid
from pathlib import Path

import aiohttp
import redis.asyncio as redis
from test_protocol import Client


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--users", type=int, default=1000)
    parser.add_argument("--captcha", action="store_true")
    args = parser.parse_args()
    db = redis.Redis.from_url("redis://redis:6379/0", decode_responses=True)
    pin = str(100000 + uuid.uuid4().int % 900000)
    secret = str(uuid.uuid4())
    root = Path(f"/results/rust-{'captcha-' if args.captcha else ''}reconnect-{args.users}")
    game = dict(
        game_pin=pin,
        game_id=secret,
        quiz_id=str(uuid.uuid4()),
        user_id=str(uuid.uuid4()),
        title="Reconnect load",
        description="",
        started=False,
        current_question=-1,
        large_audience=True,
        realtime_engine="rust",
        realtime_phase="lobby",
        game_mode="kahoot",
        captcha_enabled=False,
        questions=[
            dict(
                question="After recovery",
                type="ABCD",
                time="120",
                answers=[dict(answer="A", right=True), dict(answer="B", right=False)],
            )
        ],
    )
    hosts = []
    log = root.with_suffix(".log").open("w")
    process = None
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=3)) as http:
        if args.captcha:
            async with http.get("http://api:81/__rust/capabilities") as response:
                caps = await response.json()
            assert caps["captcha_lab"] and caps["captcha_policy"]["site_key"] == "lab-site-key"
            game.update(captcha_enabled=True, captcha_policy=caps["captcha_policy"], captcha_lab=True)
            async with http.post(
                "http://captcha-provider:9080/config", json=dict(mode="token", delay_ms=200, reset=True)
            ) as response:
                await response.read()
        await db.set(f"game:{pin}", json.dumps(game), ex=7200)

        async def host():
            c = Client()
            hosts.append(c)
            await c.io.connect("http://proxy:8080", transports=["websocket"], socketio_path="socket.io-rust")
            await c.io.emit("register_as_admin", dict(game_pin=pin, game_id=secret))
            await c.wait("registered_as_admin")
            await c.wait("room_state")
            return c

        async def roster():
            values = await db.smembers(f"game_session:{pin}:players")
            return {row["username"]: row["sid"] for row in map(json.loads, values)}

        try:
            h = await host()
            process = await asyncio.create_subprocess_exec(
                "/results/stresstest",
                "--target",
                "http://proxy:8080",
                "--users",
                str(args.users),
                "--code",
                pin,
                "--ramp-up",
                "10s",
                "--answer-min",
                "0ms",
                "--answer-max",
                "500ms",
                "--duration",
                "3m",
                "--wait-all-results",
                "--output",
                str(root) + ".bots.json",
                "--verbosity",
                "1",
                *(["--lab-captcha"] if args.captcha else []),
                stdout=log,
                stderr=log,
            )
            until = time.monotonic() + 45
            old = {}
            while time.monotonic() < until:
                old = await roster()
                if len(old) == args.users:
                    break
                await asyncio.sleep(0.1)
            assert len(old) == args.users
            provider_before = None
            if args.captcha:
                async with http.get("http://captcha-provider:9080/metrics") as response:
                    provider_before = (await response.json())["requests"]
            async with http.post("http://api:80/__bench/kill_rust") as response:
                assert (await response.json())["killed"]
            at = time.monotonic()
            ready = None
            until = at + 90
            while time.monotonic() < until:
                try:
                    async with http.get("http://api:81/health") as response:
                        if response.status == 200:
                            ready = ready or time.monotonic() - at
                    current = await roster()
                    if ready and len(current) == args.users and all(current[name] != sid for name, sid in old.items()):
                        break
                except (aiohttp.ClientError, asyncio.TimeoutError):
                    pass
                await asyncio.sleep(0.1)
            assert ready and len(current) == args.users and all(current[name] != sid for name, sid in old.items())
            recovered = time.monotonic() - at
            h = await host()
            await h.io.emit("start_game", "")
            await h.wait("start_game")
            await h.io.emit("set_question_number", "0")
            await h.wait("set_question_number")
            until = time.monotonic() + 20
            while await db.llen(f"game_session:{pin}:0") < args.users and time.monotonic() < until:
                await asyncio.sleep(0.05)
            rows = [json.loads(row) for row in await db.lrange(f"game_session:{pin}:0", 0, -1)]
            assert len(rows) == len({row["username"] for row in rows}) == args.users
            await h.io.call("get_question_results", dict(question_number=0), timeout=20)
            await h.wait("question_results")
            await h.io.emit("get_final_results", {})
            await h.wait("final_results")
            await asyncio.wait_for(process.wait(), 25)
            bots = json.loads(Path(str(root) + ".bots.json").read_text())
            assert bots["rejoins"] >= args.users and bots["final_result_receipts"] == args.users
            assert bots["questions"][0]["answers_recorded"] == args.users
            if args.captcha:
                async with http.get("http://captcha-provider:9080/metrics") as response:
                    provider_after = (await response.json())["requests"]
                assert provider_after == provider_before == args.users
            report = dict(
                users=args.users,
                provider_requests=provider_before,
                native_ready_seconds=round(ready, 3),
                all_identities_rejoined_seconds=round(recovered, 3),
                answers_verified=len(rows),
                final_receipts=bots["final_result_receipts"],
                rejoins=bots["rejoins"],
                expected_transport_disconnects=bots["unexpected_disconnects"],
                expected_attempt_failures=bots["failures"],
                note="Deliberate SIGKILL in lobby; transient connection failures are expected. Every identity and result must recover.",
            )
            root.with_suffix(".json").write_text(json.dumps(report, indent=2))
            print(json.dumps(report, indent=2), flush=True)
        finally:
            if process and process.returncode is None:
                process.send_signal(signal.SIGINT)
                await asyncio.wait_for(process.wait(), 15)
            for h in hosts:
                try:
                    await asyncio.wait_for(h.io.disconnect(), 2)
                except asyncio.TimeoutError:
                    pass
            log.close()
            keys = [key async for key in db.scan_iter(f"*{pin}*")]
            if keys:
                await db.delete(*keys)
            await db.aclose()


if __name__ == "__main__":
    asyncio.run(main())
