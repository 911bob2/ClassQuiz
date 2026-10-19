"""Isolated lab: real socket admission and HTTP verifier, no production bypass.

Run inside the API container with compose.captcha.yaml enabled. Repeat with
LAB_CAPTCHA_PROVIDER=recaptcha_v3. All tokens are unique and the verifier's
transport goes to the separately running fake-provider service.
"""

import asyncio
import hashlib
import json
import time
import uuid
from pathlib import Path

import aiohttp
import redis.asyncio as redis
from test_protocol import Client


async def main():
    db = redis.Redis.from_url("redis://redis:6379/0", decode_responses=True)
    clients, pins, checks = [], [], []
    async with aiohttp.ClientSession() as http:

        async def get(url):
            async with http.get(url) as r:
                r.raise_for_status()
                return await r.json()

        async def configure(**data):
            async with http.post("http://captcha-provider:9080/config", json=data) as r:
                return await r.json()

        async def count():
            return (await get("http://captcha-provider:9080/metrics"))["requests"]

        caps = await get("http://api:81/__rust/capabilities")
        assert caps["captcha_lab"], "This suite only targets the explicitly isolated lab build"
        policy = caps["captcha_policy"]
        assert policy["site_key"] == "lab-site-key"
        await configure(reset=True, delay_ms=20, mode="token")

        async def socket(engine="rust"):
            c = Client()
            clients.append(c)
            await c.io.connect(
                "http://proxy:8080",
                transports=["websocket"],
                socketio_path="socket.io-rust" if engine == "rust" else "socket.io",
            )
            return c

        async def room(engine="rust"):
            pin = str(100000 + uuid.uuid4().int % 900000)
            pins.append(pin)
            game = dict(
                game_pin=pin,
                game_id=str(uuid.uuid4()),
                quiz_id=str(uuid.uuid4()),
                user_id=str(uuid.uuid4()),
                title="Captcha test",
                description="",
                started=False,
                current_question=-1,
                large_audience=True,
                realtime_engine=engine,
                realtime_phase="lobby",
                game_mode="kahoot",
                captcha_enabled=True,
                captcha_policy=policy,
                captcha_lab=True,
                questions=[dict(question="Test", type="ABCD", time="30", answers=[dict(answer="A", right=True)])],
            )
            await db.set(f"game:{pin}", json.dumps(game), ex=600)
            host = await socket(engine)
            await host.io.emit("register_as_admin", dict(game_pin=pin, game_id=game["game_id"]))
            await host.wait("registered_as_admin")
            return game, host

        async def attempt(game, mode=None, expected="captcha_error", name=None, resume=None, token=None):
            c = await socket(game["realtime_engine"])
            data = dict(
                game_pin=game["game_pin"],
                username=name or uuid.uuid4().hex[:16],
                resume_token=resume or uuid.uuid4().hex,
            )
            if mode is not None:
                data["captcha"] = token if token is not None else f"{mode}:{uuid.uuid4().hex}"
            await c.io.emit("join_game", data)
            result = await c.wait(expected, timeout=9)
            if expected == "captcha_error":
                assert not await db.exists(f"game_session:{game['game_pin']}:players:{data['username']}")
            return c, data, result

        try:
            for engine in ("rust", "python"):
                game, host = await room(engine)
                before = await count()
                _, _, result = await attempt(game)
                assert result["code"] == "captcha_required"
                assert await count() == before
                for mode, code in (
                    ("fail", "captcha_failed"),
                    ("expired", "captcha_failed"),
                    ("quota", "captcha_failed"),
                    ("malformed", "captcha_unavailable"),
                    ("oversize", "captcha_unavailable"),
                    ("status", "captcha_unavailable"),
                    ("slow", "captcha_unavailable"),
                ):
                    _, _, result = await attempt(game, mode)
                    assert result["code"] == code, (engine, mode, result)
                if policy["provider"] == "recaptcha_v3":
                    for mode in ("wrong-host", "wrong-action", "low"):
                        _, _, result = await attempt(game, mode)
                        assert result["code"] == "captcha_failed"
                a, data, _ = await attempt(game, "good", "joined_game")
                checks.append(
                    f"{engine}: missing, false, expired, quota, malformed, oversized, HTTP failure and timeout fail closed; valid proof joins"
                )
                if engine == "python":
                    continue
                _, _, result = await attempt(game, "good", token=data["captcha"])
                assert result["code"] == "captcha_expired"
                checks.append("token replay into a second identity is rejected before contacting provider")
                shared = f"good:{uuid.uuid4().hex}"
                contenders = [await socket(), await socket()]
                before_race = await count()

                async def contend(c):
                    await c.io.emit(
                        "join_game",
                        dict(
                            game_pin=game["game_pin"],
                            username=uuid.uuid4().hex[:16],
                            resume_token=uuid.uuid4().hex,
                            captcha=shared,
                        ),
                    )
                    while True:
                        event, payload = await asyncio.wait_for(c.events.get(), 5)
                        if event in ("joined_game", "captcha_error"):
                            return event

                outcomes = await asyncio.gather(*(contend(c) for c in contenders))
                assert sorted(outcomes) == ["captcha_error", "joined_game"] and await count() == before_race + 1
                checks.append("simultaneous reuse allows exactly one provider call and one admitted identity")
                before = await count()
                b = await socket()
                await b.io.emit(
                    "rejoin_game",
                    dict(
                        game_pin=game["game_pin"],
                        username=data["username"],
                        resume_token=data["resume_token"],
                        old_sid=a.io.get_sid(),
                    ),
                )
                await b.wait("rejoined_game")
                assert await count() == before
                impostor = await socket()
                await impostor.io.emit(
                    "rejoin_game",
                    dict(
                        game_pin=game["game_pin"],
                        username=data["username"],
                        old_sid=b.io.get_sid(),
                        resume_token=uuid.uuid4().hex,
                    ),
                )
                await impostor.wait("username_already_exists")
                checks.append("authenticated resume skips provider; leaked socket ID alone cannot resume")
                await host.io.emit("start_game", {})
                await host.wait("start_game")
                await host.io.emit("set_question_number", "0")
                question = await b.wait("set_question_number")
                await b.io.emit(
                    "submit_answer", dict(question_index=0, question_token=question["question_token"], answer="A")
                )
                await b.wait("answer_committed")
                assert await count() == before
                checks.append("answers and scoring do not invoke captcha")

            # Stop/start races must revalidate authoritative room state after HTTP returns.
            race, host = await room()
            await configure(delay_ms=500)
            c = await socket()
            before = await count()
            name, resume = uuid.uuid4().hex[:16], uuid.uuid4().hex
            data = dict(
                game_pin=race["game_pin"], username=name, resume_token=resume, captcha=f"good:{uuid.uuid4().hex}"
            )
            await c.io.emit("join_game", data)
            while await count() == before:
                await asyncio.sleep(0.01)
            at = time.monotonic()
            await host.io.emit("start_game", {})
            await host.wait("start_game")
            assert time.monotonic() - at < 0.4, "provider call must not hold room control lock"
            await c.wait("game_already_started")
            assert not await db.exists(f"game_session:{race['game_pin']}:players:{name}")
            # Inspect the server-issued receipt and reopen this lab-only room to
            # exercise a lost-ACK retry with the exact same bound identity.
            encoded = json.dumps(
                [race["game_id"], race["game_pin"], name, resume, policy], sort_keys=True, separators=(",", ":")
            )
            proof = hashlib.sha256(encoded.encode()).hexdigest()
            assert 0 < await db.ttl(f"classquiz:captcha:receipt:{proof}") <= 60
            saved = json.loads(await db.get(f"game:{race['game_pin']}"))
            saved["started"] = False
            await db.set(f"game:{race['game_pin']}", json.dumps(saved), ex=600)
            before = await count()
            await attempt(race, expected="joined_game", name=name, resume=resume)
            assert await count() == before and not await db.exists(f"classquiz:captcha:receipt:{proof}")
            checks.append(
                "room control remains responsive during verification; final join checks started state; bound retry receipt is consumed atomically"
            )
            # Changing a room generation during verification cannot create a player.
            game, _ = await room()
            c = await socket()
            before = await count()
            await c.io.emit(
                "join_game",
                dict(
                    game_pin=game["game_pin"],
                    username="stale",
                    resume_token=uuid.uuid4().hex,
                    captcha=f"good:{uuid.uuid4().hex}",
                ),
            )
            while await count() == before:
                await asyncio.sleep(0.01)
            game["game_id"] = str(uuid.uuid4())
            await db.set(f"game:{game['game_pin']}", json.dumps(game), ex=600)
            assert (await c.wait("captcha_error"))["code"] == "captcha_unavailable"
            assert not await db.exists(f"game_session:{game['game_pin']}:players:stale")
            checks.append("generation replacement during provider call invalidates the proof")
            await configure(delay_ms=200)
            metrics = await get("http://captcha-provider:9080/metrics")
            assert metrics["forms_valid"]
            report = dict(provider=policy["provider"], passed=checks, provider_metrics=metrics)
            Path(f"/results/captcha-contract-{policy['provider']}.json").write_text(json.dumps(report, indent=2))
            print(json.dumps(report, indent=2), flush=True)
        finally:
            await asyncio.gather(*(c.io.disconnect() for c in clients), return_exceptions=True)
            for pin in pins:
                keys = [k async for k in db.scan_iter(f"*{pin}*")]
                if keys:
                    await db.delete(*keys)
            await db.aclose()


if __name__ == "__main__":
    asyncio.run(main())
