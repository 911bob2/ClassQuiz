"""Redis outage behaviour of the Rust engine (isolated lab only, destructive).

    docker compose -f tools/stresstest/lab/compose.yaml exec -T api python /rust-source/test_redis_outage.py

Uses CLIENT PAUSE / CLIENT KILL on the lab's disposable Redis, so no container
control is needed. Takes about a minute and ends with the engine running again.
"""

import asyncio
import json
import time
import uuid

import aiohttp
import redis.asyncio as redis
from test_protocol import Client

METRICS = "http://api:81/__rust/metrics"
HEALTH = "http://api:81/health"


async def pid(http):
    async with http.get(METRICS) as response:
        return (await response.json())["pid"]


async def healthy(http):
    try:
        async with http.get(HEALTH) as response:
            return response.status == 200
    except (aiohttp.ClientError, asyncio.TimeoutError):
        return False


async def eventually(check, seconds, message):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            if await check():
                return
        except (aiohttp.ClientError, asyncio.TimeoutError, KeyError):
            pass
        await asyncio.sleep(0.5)
    raise AssertionError(message)


async def main():
    db = redis.Redis.from_url("redis://redis:6379/0", decode_responses=True)
    passed = []
    clients = []
    timeout = aiohttp.ClientTimeout(total=3)

    async def play_roundtrip(label):
        """Create a native room and join it: needs Redis reads, scripts and writes."""
        pin = str(100000 + uuid.uuid4().int % 900000)
        game_id = str(uuid.uuid4())
        game = dict(
            quiz_id=str(uuid.uuid4()),
            user_id=str(uuid.uuid4()),
            game_id=game_id,
            game_pin=pin,
            title=label,
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
        c = Client()
        clients.append(c)
        await c.io.connect("http://proxy:8080", transports=["websocket"], socketio_path="socket.io-rust")
        await c.io.emit("join_game", dict(game_pin=pin, username="outage"))
        await c.wait("joined_game", timeout=5)
        await c.io.disconnect()
        keys = [key async for key in db.scan_iter(f"*{pin}*")]
        if keys:
            await db.delete(*keys)

    async with aiohttp.ClientSession(timeout=timeout) as http:
        try:
            start_pid = await pid(http)
            await play_roundtrip("baseline")

            # 1. A 5 s stall is shorter than the 10 s patience: same process, healthy again.
            await db.execute_command("CLIENT", "PAUSE", 5000, "ALL")
            await asyncio.sleep(6.5)
            await eventually(lambda: healthy(http), 10, "health did not return after a 5 s Redis stall")
            assert await pid(http) == start_pid, "process restarted during a 5 s Redis stall"
            await play_roundtrip("after stall")
            passed.append("5 s Redis stall: same process, healthy, rooms usable")

            # 2. Every Redis connection dropped (as in a Redis restart): connections come back.
            killed = await db.execute_command("CLIENT", "KILL", "TYPE", "normal", "SKIPME", "yes")
            assert killed >= 8, f"expected the engine's pooled connections to be killed, got {killed}"
            await asyncio.sleep(1)

            async def usable():
                await play_roundtrip("after kill")
                return True

            await eventually(usable, 30, "engine did not recover after all Redis connections were dropped")
            assert await pid(http) == start_pid, "process restarted although its connections could recover"
            passed.append(f"{killed} Redis connections killed: same process, reconnected, rooms usable")

            # 3. A 14 s stall exceeds the patience: the process gives up and the supervisor restarts it.
            await db.execute_command("CLIENT", "PAUSE", 14000, "ALL")
            await asyncio.sleep(15)

            async def replaced():
                return await pid(http) != start_pid and await healthy(http)

            await eventually(replaced, 60, "engine was not replaced after a 14 s Redis outage")
            await play_roundtrip("after restart")
            passed.append("14 s Redis outage: process exited, supervisor started a healthy replacement")
            print(json.dumps(dict(passed=passed, count=len(passed)), indent=2), flush=True)
        finally:
            for c in clients:
                if c.io.connected:
                    await c.io.disconnect()
            await db.aclose()


if __name__ == "__main__":
    asyncio.run(main())
