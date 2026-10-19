"""Tiny live hCaptcha smoke using their published test credentials, not load.

Launches a lab-feature native child on loopback:82 and an EMPTY Redis database15.
Never uses site credentials or sends capacity traffic to the real provider.
"""

import asyncio
import json
import os
import signal
import uuid
from pathlib import Path
import aiohttp
import redis.asyncio as redis
from test_protocol import Client


async def main():
    db = redis.Redis.from_url("redis://redis:6379/15", decode_responses=True)
    assert await db.dbsize() == 0, "live smoke requires an unused isolated Redis DB15"
    env = {
        **os.environ,
        "CAPTCHA_PROVIDER": "hcaptcha",
        "CAPTCHA_SITE_KEY": "10000000-ffff-ffff-ffff-000000000001",
        "CAPTCHA_SECRET_KEY": "0x0000000000000000000000000000000000000000",
    }
    env.pop("CAPTCHA_TEST_VERIFY_URL", None)
    log = Path("/results/captcha-live-hcaptcha.log").open("w")
    process = await asyncio.create_subprocess_exec(
        "/results/classquiz-realtime-captcha-lab",
        "--listen",
        "127.0.0.1:82",
        "--redis",
        "redis://redis:6379/15",
        env=env,
        stdout=log,
        stderr=log,
    )
    clients = []
    try:
        async with aiohttp.ClientSession() as http:
            for _ in range(60):
                try:
                    async with http.get("http://127.0.0.1:82/__rust/capabilities") as response:
                        caps = await response.json()
                    break
                except aiohttp.ClientError:
                    await asyncio.sleep(0.1)
            else:
                raise AssertionError("native smoke process did not start")
            game = dict(
                game_pin="991510",
                game_id=str(uuid.uuid4()),
                quiz_id=str(uuid.uuid4()),
                user_id=str(uuid.uuid4()),
                title="Published hCaptcha test key",
                description="",
                started=False,
                current_question=-1,
                large_audience=True,
                realtime_engine="rust",
                realtime_phase="lobby",
                game_mode="kahoot",
                captcha_enabled=True,
                captcha_policy=caps["captcha_policy"],
                questions=[dict(question="Test", type="ABCD", time="30", answers=[dict(answer="A", right=True)])],
            )
            await db.set("game:991510", json.dumps(game), ex=300)
            for name, token, event in (
                ("invalid", "invalid-live-test-token", "captcha_error"),
                ("valid", "10000000-aaaa-bbbb-cccc-000000000001", "joined_game"),
                ("replayed", "10000000-aaaa-bbbb-cccc-000000000001", "captcha_error"),
            ):
                c = Client()
                clients.append(c)
                await c.io.connect("http://127.0.0.1:82", transports=["websocket"], socketio_path="socket.io-rust")
                await c.io.emit(
                    "join_game", dict(game_pin="991510", username=name, resume_token=uuid.uuid4().hex, captcha=token)
                )
                result = await c.wait(event, timeout=9)
                if event == "captcha_error":
                    assert result["code"] == ("captcha_expired" if name == "replayed" else "captcha_failed"), result
            async with http.get("http://127.0.0.1:82/__rust/metrics") as response:
                metrics = await response.json()
            assert await db.scard("game_session:991510:players") == 1
            report = dict(
                passed=[
                    "real HTTPS siteverify rejects invalid token",
                    "published dummy token admitted through native verifier",
                    "dummy replay rejected locally",
                ],
                captcha=metrics["captcha"],
            )
            Path("/results/captcha-live-hcaptcha.json").write_text(json.dumps(report, indent=2))
            print(json.dumps(report, indent=2), flush=True)
    finally:
        await asyncio.gather(*(c.io.disconnect() for c in clients), return_exceptions=True)
        if process.returncode is None:
            process.send_signal(signal.SIGTERM)
            await asyncio.wait_for(process.wait(), 10)
        # DB15 was empty before this dedicated child; remove only its prefixes.
        keys = [
            k
            async for k in db.scan_iter()
            if k.startswith(("game:991510", "game_session:991510", "classquiz:captcha:", "classquiz:rust:"))
        ]
        if keys:
            await db.delete(*keys)
        await db.aclose()
        log.close()


if __name__ == "__main__":
    asyncio.run(main())
