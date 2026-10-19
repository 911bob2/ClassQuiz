"""Network admission/lifecycle regression checks for the isolated Rust lab."""

import asyncio
import json
import time
import uuid

import redis.asyncio as redis
import socketio


class Client:
    def __init__(self):
        self.io = socketio.AsyncClient(reconnection=False)
        self.events = asyncio.Queue()
        self.latest = {}

        @self.io.on("*")
        async def event(name, *args):
            data = args[0] if args else None
            self.latest[name] = data
            await self.events.put((name, data))

        @self.io.on("time_sync")
        async def echo(nonce):
            await self.io.emit("echo_time_sync", nonce)

    async def wait(self, name, timeout=5):
        async def receive():
            while True:
                event, data = await self.events.get()
                if event == name:
                    return data

        return await asyncio.wait_for(receive(), timeout)


async def main():
    db = redis.Redis.from_url("redis://redis:6379/0", decode_responses=True)
    clients = []
    pin = str(100000 + uuid.uuid4().int % 900000)
    game_id = str(uuid.uuid4())
    target = "http://proxy:8080"
    passed = []

    async def client():
        c = Client()
        clients.append(c)
        await c.io.connect(target, transports=["websocket"], socketio_path="socket.io-rust")
        return c

    variants = [
        ("ABCD", [{"answer": "A", "right": True}, {"answer": "B", "right": False}], "A", None),
        ("RANGE", dict(min=0, max=10, min_correct=4, max_correct=6), "5", None),
        ("TEXT", [{"answer": "Yes", "case_sensitive": False}], "YES", None),
        ("CHECK", [{"answer": "A", "right": True}, {"answer": "B", "right": False}], "0", None),
        ("ORDER", [{"answer": "A"}, {"answer": "B"}], "a", [{"answer": "A"}, {"answer": "B"}]),
        ("VOTING", [{"answer": "A"}, {"answer": "B"}], "A", None),
    ]
    game = dict(
        quiz_id=str(uuid.uuid4()),
        user_id=str(uuid.uuid4()),
        game_id=game_id,
        game_pin=pin,
        title="Rust contract",
        description="",
        started=False,
        large_audience=True,
        realtime_engine="rust",
        realtime_phase="lobby",
        captcha_enabled=False,
        game_mode="kahoot",
        current_question=-1,
        questions=[dict(question=kind, time="30", type=kind, answers=answers) for kind, answers, _, _ in variants],
    )
    game["questions"].append(dict(question="After rejoin", time="30", type="ABCD", answers=variants[0][1]))
    await db.set(f"game:{pin}", json.dumps(game), ex=600)
    try:
        host = await client()
        await host.io.emit("register_as_admin", dict(game_pin=pin, game_id="incorrect"))
        await host.wait("error")
        await host.io.emit("register_as_admin", dict(game_pin=pin, game_id=game_id))
        await host.wait("registered_as_admin")
        passed.append("host secret checked before registration")
        a, b = await client(), await client()
        for c, name in ((a, "alpha"), (b, "beta")):
            await c.io.emit("join_game", dict(game_pin=pin, username=name))
            joined = await c.wait("joined_game")
            assert "game_id" not in joined and "questions" not in joined
        duplicate = await client()
        await duplicate.io.emit("join_game", dict(game_pin=pin, username="alpha"))
        await duplicate.wait("username_already_exists")
        passed.append("duplicate names rejected")
        await a.io.emit("start_game", {})
        await a.wait("error")
        await host.io.emit("start_game", {})
        await host.wait("start_game")
        passed.append("players cannot start or control the room")
        previous_token = "old"
        for i, (kind, _, answer, order) in enumerate(variants):
            await host.io.emit("set_question_number", str(i))
            q = await a.wait("set_question_number")
            if i == 0:
                before = await db.hgetall(f"game:{pin}:answer_state")
                await host.io.emit("set_question_number", "0")
                await asyncio.sleep(0.05)
                assert await db.hgetall(f"game:{pin}:answer_state") == before
                registry = await db.smembers(f"game:{pin}:rust_keys")
                assert f"game_session:{pin}:players:alpha" in registry
                assert f"game_session:{pin}:0:by_player" in registry
            public = q["question"]["answers"]
            if kind == "RANGE":
                assert "min_correct" not in public and "max_correct" not in public
            else:
                assert all("right" not in row and "case_sensitive" not in row for row in public)
            data = dict(question_index=i, question_token=q["question_token"], answer=answer, complex_answer=order)
            await a.io.emit("submit_answer", {**data, "question_token": previous_token})
            await a.wait("question_not_active")
            assert await db.llen(f"game_session:{pin}:{i}") == 0
            await asyncio.gather(*(a.io.emit("submit_answer", data) for _ in range(20)))
            for _ in range(100):
                if await db.llen(f"game_session:{pin}:{i}") == 1:
                    break
                await asyncio.sleep(0.01)
            await asyncio.sleep(0.1)
            rows = [json.loads(v) for v in await db.lrange(f"game_session:{pin}:{i}", 0, -1)]
            assert len(rows) == 1 and rows[0]["username"] == "alpha"
            assert rows[0]["right"] == (kind != "VOTING")
            await host.io.call("get_question_results", dict(question_number=str(i)), timeout=5)
            own = await a.wait("personal_question_results")
            missed = await b.wait("personal_question_results")
            assert own["answer"]["username"] == "alpha" and missed["answer"] is None
            assert own["player_count"] == 2 and 1 <= missed["rank"] <= 2
            await b.io.emit("submit_answer", data)
            await b.wait("question_not_active")
            assert await db.llen(f"game_session:{pin}:{i}") == 1
            passed.append(
                f"{kind}: stale token, 20 retries, public redaction, personal/no-answer results, closed admission"
            )
            previous_token = q["question_token"]
        total = int(await db.hget(f"game_session:{pin}:player_scores", "alpha"))
        expected = sum([json.loads((await db.lrange(f"game_session:{pin}:{i}", 0, 0))[0])["score"] for i in range(6)])
        assert total == expected
        passed.append("duplicates do not double-score")
        # Rejoin changes the authoritative SID and invalidates the old socket.
        old = a.io.get_sid()
        rejoined = await client()
        await rejoined.io.emit("rejoin_game", dict(game_pin=pin, username="alpha", old_sid=old))
        await rejoined.wait("rejoined_game")
        await host.io.emit("set_question_number", "6")
        q = await rejoined.wait("set_question_number")
        await a.io.emit("submit_answer", dict(question_index=6, question_token=q["question_token"], answer="A"))
        await a.wait("question_not_active")
        passed.append("rejoin replaces SID; old connection cannot submit")
        await host.io.emit("kick_player", dict(username="alpha"))
        await rejoined.wait("kick")
        assert await db.get(f"game_session:{pin}:players:alpha") is None
        passed.append("kick removes authoritative membership")
        await db.hset(f"game:{pin}:answer_state", "deadline_ms", time.time() * 1000 - 2000)
        await b.io.emit("submit_answer", dict(question_index=6, question_token=q["question_token"], answer="A"))
        await b.wait("question_not_active")
        assert await db.llen(f"game_session:{pin}:6") == 0
        passed.append("Redis deadline rejects admission despite cached round context")
        await host.io.emit("get_final_results", {})
        history = await host.wait("final_results")
        assert history["native_summary"] and history["answer_counts"] == {str(i): 1 for i in range(6)}
        await host.io.emit("get_export_token")
        export_token = await host.wait("export_token")
        full = json.loads(await db.get(f"export_token:{export_token}"))
        assert len(full) == 6 and all(len(rows) == 1 for rows in full.values())
        assert await db.get(f"export_token:{export_token}:room") == pin
        final = await b.wait("personal_final_results")
        assert final["score"] == 0 and final["question_scores"] == {}
        passed.append("bounded host pages, full exported history and no-answer final result preserved")
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
