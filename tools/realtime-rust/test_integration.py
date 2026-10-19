"""Real authenticated HTTP room creation, both engines, and durable result save."""

import asyncio
import json
import uuid
from io import BytesIO
from datetime import timedelta
from openpyxl import load_workbook
from pathlib import Path

import aiohttp
from classquiz.auth import create_access_token, get_password_hash
from classquiz.db import database
from classquiz.db.models import Quiz, User, GameResults
from classquiz.config import redis
from test_protocol import Client


async def main():
    await database.connect()
    suffix = uuid.uuid4().hex[:10]
    email = f"native-{suffix}@example.invalid"
    user = await User.objects.create(
        email=email,
        username=f"native-{suffix}",
        avatar=b"",
        verified=True,
        password=get_password_hash(uuid.uuid4().hex),
    )
    quiz = await Quiz.objects.create(
        user_id=user.id,
        title="Rust integration local demo",
        description="Local test quiz",
        questions=[
            dict(
                question="Does recovery preserve answers?",
                time="120",
                type="ABCD",
                answers=[dict(answer="Yes", right=True), dict(answer="No", right=False)],
            )
        ],
    )
    token = create_access_token({"sub": email}, expires_delta=timedelta(hours=2))
    clients, pins, passed = [], [], []
    target = "http://proxy:8080"
    async with aiohttp.ClientSession(cookies={"access_token": f"Bearer {token}"}) as http:

        async def request(method, path, expected=200, **kwargs):
            async with http.request(method, target + path, **kwargs) as r:
                data = await r.json()
                assert r.status == expected, (path, r.status, data)
                return data

        async def socket(path):
            c = Client()
            clients.append(c)
            await c.io.connect(target, transports=["websocket"], socketio_path=path)
            return c

        try:
            capabilities = await request("GET", "/api/v1/quiz/realtime/capabilities")
            assert capabilities["rust"]
            if capabilities.get("rust_captcha"):
                protected = await request(
                    "POST", f"/api/v1/quiz/start/{quiz.id}?game_mode=kahoot&rust_experimental=true&captcha_enabled=True"
                )
                pins.append(protected["game_pin"])
                meta = await request("GET", f"/api/v1/quiz/play/check_captcha/{protected['game_pin']}")
                assert meta["enabled"] and meta["captcha_policy"] == capabilities["rust_captcha"]
            else:
                await request(
                    "POST",
                    f"/api/v1/quiz/start/{quiz.id}?game_mode=kahoot&rust_experimental=true&captcha_enabled=True",
                    422,
                )
            for options in ("captcha_enabled=False&cqcs_enabled=True",):
                await request(
                    "POST", f"/api/v1/quiz/start/{quiz.id}?game_mode=kahoot&rust_experimental=true&{options}", 422
                )
            await request(
                "POST",
                f"/api/v1/quiz/start/{quiz.id}?game_mode=normal&rust_experimental=true&captcha_enabled=False",
                422,
            )
            passed.append("captcha creation follows runtime capability; controllers and old-school remain unsupported")
            game = await request(
                "POST", f"/api/v1/quiz/start/{quiz.id}?game_mode=kahoot&rust_experimental=true&captcha_enabled=False"
            )
            pin, secret = game["game_pin"], game["game_id"]
            pins.append(pin)
            metadata = await request("GET", f"/api/v1/quiz/play/check_captcha/{pin}")
            assert (
                metadata["socket_path"] == "/socket.io-rust"
                and metadata["realtime_engine"] == "rust"
                and "game_id" not in metadata
            )
            await request("GET", f"/api/v1/quiz/join/{pin}", 410)
            await request("POST", f"/api/v1/quiz/realtime/{pin}/save", 403)
            await request("POST", f"/api/v1/quiz/realtime/{pin}/save", 409, headers={"X-Quiz-Host-Token": secret})
            h = await socket("socket.io-rust")
            client_id = uuid.uuid4().hex
            await h.io.emit("register_as_admin", dict(game_pin=pin, game_id=secret, client_id=client_id))
            await h.wait("registered_as_admin")
            duplicate_host = await socket("socket.io-rust")
            await duplicate_host.io.emit(
                "register_as_admin", dict(game_pin=pin, game_id=secret, client_id=uuid.uuid4().hex)
            )
            await duplicate_host.wait("error")
            replacement_host = await socket("socket.io-rust")
            await replacement_host.io.emit("register_as_admin", dict(game_pin=pin, game_id=secret, client_id=client_id))
            await replacement_host.wait("registered_as_admin")
            await h.wait("host_replaced")
            h = replacement_host
            passed.append("same host tab replaces its stale socket; other active host tabs are rejected")
            p = await socket("socket.io-rust")
            await p.io.emit("join_game", dict(game_pin=pin, username="integration-player"))
            joined = await p.wait("joined_game")
            assert "game_id" not in joined
            wrong = await socket("socket.io")
            await wrong.io.emit("register_as_admin", dict(game_pin=pin, game_id=secret))
            await wrong.wait("error")
            await wrong.io.emit("join_game", dict(game_pin=pin, username="wrong-engine"))
            await wrong.wait("error")
            passed.append("metadata selects native route; Python rejects native room admission and control")
            await h.io.emit("start_game", "")
            await h.wait("start_game")
            await h.io.emit("set_question_number", "0")
            q = await p.wait("set_question_number")
            await p.io.emit("submit_answer", dict(question_index=0, question_token=q["question_token"], answer="Yes"))
            await p.wait("answer_committed")
            await h.io.emit("show_solutions", {})
            await p.wait("solutions")
            await h.io.call("get_question_results", dict(question_number=0))
            await p.wait("personal_question_results")
            await h.io.emit("get_final_results", {})
            await p.wait("personal_final_results")
            await h.wait("final_results")
            for _ in range(2):
                await request("POST", f"/api/v1/quiz/realtime/{pin}/save", headers={"X-Quiz-Host-Token": secret})
            saved = await GameResults.objects.get(id=uuid.UUID(secret))
            assert saved.player_count == 1 and len(saved.answers[0]) == 1
            assert await GameResults.objects.filter(id=uuid.UUID(secret)).count() == 1
            passed.append("host solutions, numeric reveal, full database save and idempotent save retries")
            await h.io.emit("get_export_token")
            export_token = await h.wait("export_token")
            snapshot_key = f"export_token:{export_token}:snapshot"
            frozen = json.loads(await redis.get(snapshot_key))
            frozen["game"]["questions"][0]["image"] = "missing-local-export-image"
            frozen["fields"] = ["integration-player", "=1+1"]
            await redis.set(snapshot_key, json.dumps(frozen), ex=7200)
            await request("GET", f"/api/v1/quiz/export_data/{export_token}?game_pin=000000", 403)
            async with http.get(f"{target}/api/v1/quiz/export_data/{export_token}?game_pin={pin}") as response:
                body = await response.read()
                assert response.status == 200, body[:200]
            workbook = load_workbook(BytesIO(body), read_only=True)
            assert workbook["Players"]["A2"].value == "integration-player"
            assert workbook["Players"]["C2"].value == "=1+1" and workbook["Players"]["C2"].data_type == "s"
            assert workbook["1. Question"]["A2"].value == "Yes"
            workbook.close()
            passed.append("actual XLSX download contains answers; export tokens reject other room PINs")
            passed.append("missing export media does not discard answer data")
            normal = await request("POST", f"/api/v1/quiz/start/{quiz.id}?game_mode=kahoot&captcha_enabled=False")
            pins.append(normal["game_pin"])
            meta = await request("GET", f"/api/v1/quiz/play/check_captcha/{normal['game_pin']}")
            assert meta["socket_path"] == "/socket.io" and meta["realtime_engine"] == "python"
            normal_host = await socket("socket.io")
            await normal_host.io.emit("register_as_admin", dict(game_pin=normal["game_pin"], game_id=normal["game_id"]))
            await normal_host.wait("registered_as_admin")
            normal_player = await socket("socket.io")
            await normal_player.io.emit("join_game", dict(game_pin=normal["game_pin"], username="python-player"))
            assert "game_id" not in await normal_player.wait("joined_game")
            passed.append("normal Python room still uses its original endpoint alongside Rust")
            # Local browser test fixture; contains only disposable local credentials.
            Path("/results/rust-browser-fixture.json").write_text(
                json.dumps(dict(cookie=f"Bearer {token}", quiz_id=str(quiz.id), user_id=str(user.id), email=email))
            )
            print(json.dumps(dict(passed=passed, quiz_id=str(quiz.id)), indent=2), flush=True)
        finally:
            await asyncio.gather(*(c.io.disconnect() for c in clients), return_exceptions=True)
            for pin in pins:
                keys = [key async for key in redis.scan_iter(f"*{pin}*")]
                if keys:
                    await redis.delete(*keys)
            # Retain the disposable account/quiz for the real browser test.
            await database.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
