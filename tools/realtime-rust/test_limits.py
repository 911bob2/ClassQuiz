"""Connection-level abuse limits of the Rust engine (isolated lab only).

Run inside the lab API container like test_protocol.py:
    docker compose -f tools/stresstest/lab/compose.yaml exec -T api python /rust-source/test_limits.py
Takes about 40 seconds because it waits for the idle-socket limit.
"""

import asyncio
import json
import time
import uuid

import aiohttp
import redis.asyncio as redis
from test_protocol import Client

METRICS = "http://api:81/__rust/metrics"


async def metrics(http):
    async with http.get(METRICS) as response:
        return await response.json()


async def main():
    db = redis.Redis.from_url("redis://redis:6379/0", decode_responses=True)
    pin = str(100000 + uuid.uuid4().int % 900000)
    game_id = str(uuid.uuid4())
    clients = []
    passed = []

    async def client():
        c = Client()
        clients.append(c)
        await c.io.connect("http://proxy:8080", transports=["websocket"], socketio_path="socket.io-rust")
        return c

    game = dict(
        quiz_id=str(uuid.uuid4()),
        user_id=str(uuid.uuid4()),
        game_id=game_id,
        game_pin=pin,
        title="Rust abuse limits",
        description="",
        started=False,
        large_audience=True,
        realtime_engine="rust",
        realtime_phase="lobby",
        captcha_enabled=False,
        game_mode="kahoot",
        current_question=-1,
        questions=[dict(question="Q", time="30", type="ABCD", answers=[{"answer": "A", "right": True}])],
    )
    await db.set(f"game:{pin}", json.dumps(game), ex=600)
    timeout = aiohttp.ClientTimeout(total=5)
    async with aiohttp.ClientSession(timeout=timeout) as http:
        try:
            before = await metrics(http)

            # 1. Any event type is rate limited and a gross flood is disconnected.
            flooder = await client()
            for _ in range(600):  # above the burst, below the disconnect threshold
                await flooder.io.emit("echo_time_sync", "nonce")
            await asyncio.sleep(0.5)
            assert "rate_limited" in flooder.latest, "flooder was never told to slow down"
            assert flooder.io.connected, "a moderate burst must not disconnect"
            for _ in range(6000):
                await flooder.io.emit("echo_time_sync", "nonce")
            for _ in range(100):
                if not flooder.io.connected:
                    break
                await asyncio.sleep(0.05)
            assert not flooder.io.connected, "flooding socket was not disconnected"
            after = await metrics(http)
            assert after["flood_disconnects"] == before["flood_disconnects"] + 1, after
            assert after["throttled_events"] > before["throttled_events"]
            passed.append("event flood throttled and the connection disconnected")

            # 2. A socket repeating register_as_admin cannot starve other admissions.
            noisy = await client()
            for _ in range(200):
                await noisy.io.emit("register_as_admin", dict(game_pin=pin, game_id="wrong"))
            started = time.monotonic()
            player = await client()
            await player.io.emit("join_game", dict(game_pin=pin, username="legit"))
            await player.wait("joined_game", timeout=5)
            elapsed = time.monotonic() - started
            assert elapsed < 3, f"legitimate join took {elapsed:.2f}s behind a register flood"
            passed.append(f"legitimate join took {elapsed:.2f}s during a register_as_admin flood")

            # 3. Sockets that never join or register are dropped (30 s limit).
            idle = await client()
            begin = time.monotonic()
            while idle.io.connected and time.monotonic() - begin < 40:
                await asyncio.sleep(0.5)
            waited = time.monotonic() - begin
            assert not idle.io.connected, "idle socket was never disconnected"
            assert 28 <= waited <= 36, waited
            assert player.io.connected, "an admitted player must not be reaped"
            final = await metrics(http)
            assert final["idle_disconnects"] >= before["idle_disconnects"] + 1
            passed.append(f"idle socket disconnected after {waited:.1f}s; admitted players kept")
            print(json.dumps(dict(passed=passed, count=len(passed)), indent=2), flush=True)
        finally:
            for c in clients:
                if c.io.connected:
                    await c.io.disconnect()
            keys = [key async for key in db.scan_iter(f"*{pin}*")]
            if keys:
                await db.delete(*keys)
            await db.aclose()


if __name__ == "__main__":
    asyncio.run(main())
