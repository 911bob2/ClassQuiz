"""1,000 simultaneous joins during a provider timeout, then controlled recovery."""

import asyncio
import json
import time
import uuid
from pathlib import Path
import aiohttp
import redis.asyncio as redis
from test_protocol import Client


async def main():
    db = redis.Redis.from_url("redis://redis:6379/0", decode_responses=True)
    pin, secret = str(100000 + uuid.uuid4().int % 900000), str(uuid.uuid4())
    clients = []
    async with aiohttp.ClientSession() as http:

        async def get(url):
            async with http.get(url) as r:
                r.raise_for_status()
                return await r.json() if r.content_type == "application/json" else await r.read()

        async def configure(**values):
            async with http.post("http://captcha-provider:9080/config", json=values) as r:
                return await r.json()

        caps = await get("http://api:81/__rust/capabilities")
        assert caps["captcha_lab"] and caps["captcha_policy"]["site_key"] == "lab-site-key"
        game = dict(
            game_pin=pin,
            game_id=secret,
            quiz_id=str(uuid.uuid4()),
            user_id=str(uuid.uuid4()),
            title="Captcha overload",
            description="",
            started=False,
            current_question=-1,
            large_audience=True,
            realtime_engine="rust",
            realtime_phase="lobby",
            game_mode="kahoot",
            captcha_enabled=True,
            captcha_policy=caps["captcha_policy"],
            captcha_lab=True,
            questions=[dict(question="Test", type="ABCD", time="30", answers=[dict(answer="A", right=True)])],
        )
        await db.set(f"game:{pin}", json.dumps(game), ex=600)

        async def connect():
            c = Client()
            clients.append(c)
            await c.io.connect("http://proxy:8080", transports=["websocket"], socketio_path="socket.io-rust")
            return c

        try:
            host = await connect()
            await host.io.emit("register_as_admin", dict(game_pin=pin, game_id=secret))
            await host.wait("registered_as_admin")
            sem = asyncio.Semaphore(100)

            async def limited():
                async with sem:
                    return await connect()

            players = await asyncio.gather(*(limited() for _ in range(1000)))
            identities = [uuid.uuid4().hex for _ in players]
            while (await get("http://captcha-provider:9080/metrics"))["active"]:
                await asyncio.sleep(0.1)
            await configure(mode="slow", reset=True, delay_ms=200)

            async def join(i, mode, event):
                await players[i].io.emit(
                    "join_game",
                    dict(
                        game_pin=pin,
                        username=f"overload-{i}",
                        resume_token=identities[i],
                        captcha=f"{mode}:{uuid.uuid4().hex}",
                    ),
                )
                return await players[i].wait(event, timeout=12)

            attempts = asyncio.gather(*(join(i, "slow", "captcha_error") for i in range(1000)))
            probe = []
            while not attempts.done():
                at = time.monotonic()
                await get("http://api:81/health")
                probe.append((time.monotonic() - at) * 1000)
                await asyncio.sleep(0.1)
            failures = await attempts
            codes = {c: sum(r["code"] == c for r in failures) for c in {r["code"] for r in failures}}
            assert set(codes) <= {"captcha_busy", "captcha_unavailable"} and sum(codes.values()) == 1000
            assert await db.scard(f"game_session:{pin}:players") == 0
            while (await get("http://captcha-provider:9080/metrics"))["active"]:
                await asyncio.sleep(0.1)
            outage = await get("http://captcha-provider:9080/metrics")
            assert outage["peak_active"] <= 128 and outage["requests"] <= 128
            await configure(mode="token", delay_ms=200, reset=True)

            async def retry(i):
                await asyncio.sleep(i / 100)
                await join(i, "good", "joined_game")

            at = time.monotonic()
            await asyncio.gather(*(retry(i) for i in range(1000)))
            elapsed = time.monotonic() - at
            assert await db.scard(f"game_session:{pin}:players") == 1000
            recovery = await get("http://captcha-provider:9080/metrics")
            assert recovery["requests"] == 1000 and recovery["forms_valid"]
            report = dict(
                users=1000,
                rejection_codes=codes,
                outage_provider=outage,
                health_p95_ms=sorted(probe)[int(0.95 * (len(probe) - 1))],
                health_max_ms=max(probe),
                recovered=1000,
                recovery_seconds=elapsed,
                recovery_provider=recovery,
            )
            Path("/results/captcha-overload.json").write_text(json.dumps(report, indent=2))
            print(json.dumps(report, indent=2), flush=True)
        finally:
            await asyncio.gather(*(c.io.disconnect() for c in clients), return_exceptions=True)
            keys = [key async for key in db.scan_iter(f"*{pin}*")]
            if keys:
                await db.delete(*keys)
            await db.aclose()


if __name__ == "__main__":
    asyncio.run(main())
