"""Destructive fault injection against the isolated lab only; never the VM."""

import asyncio
import json
import time
import uuid

import aiohttp
import redis.asyncio as redis
from test_protocol import Client


async def main():
    db = redis.Redis.from_url("redis://redis:6379/0", decode_responses=True)
    pin = str(100000 + uuid.uuid4().int % 900000)
    generation = str(uuid.uuid4())
    clients = []
    checks = []
    restarts = []
    tokens = {name: uuid.uuid4().hex + uuid.uuid4().hex for name in ("alpha", "beta")}
    game = dict(
        quiz_id=str(uuid.uuid4()),
        user_id=str(uuid.uuid4()),
        game_id=generation,
        game_pin=pin,
        title="Native recovery fault injection",
        description="",
        game_mode="kahoot",
        realtime_engine="rust",
        realtime_phase="lobby",
        large_audience=True,
        captcha_enabled=False,
        started=False,
        current_question=-1,
        questions=[
            dict(
                type="ABCD",
                time="120",
                question="Recovery?",
                answers=[dict(answer="A", right=True), dict(answer="B", right=False)],
            )
        ],
    )
    await db.set(f"game:{pin}", json.dumps(game), ex=7200)
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as http:

        async def client():
            c = Client()
            clients.append(c)
            await c.io.connect("http://proxy:8080", transports=["websocket"], socketio_path="socket.io-rust")
            return c

        async def host():
            c = await client()
            await c.io.emit("register_as_admin", dict(game_pin=pin, game_id=generation))
            await c.wait("registered_as_admin")
            return c, await c.wait("room_state")

        async def player(name, restore=False):
            c = await client()
            # Retry the same admission identity even if the original response was lost.
            await c.io.emit("join_game", dict(game_pin=pin, username=name, resume_token=tokens[name]))
            data = await c.wait("joined_game")
            assert data["resume_token"] == tokens[name] and "game_id" not in data
            return c, await c.wait("room_state") if restore else None

        async def pid():
            async with http.post("http://api:80/__bench/reset") as r:
                return (await r.json())["rust_pid"]

        async def restarted(previous, at):
            for _ in range(450):
                try:
                    current = await pid()
                    async with http.get("http://api:81/health") as r:
                        if current != previous and r.status == 200:
                            restarts.append(round(time.monotonic() - at, 3))
                            return
                except (aiohttp.ClientError, asyncio.TimeoutError):
                    pass
                await asyncio.sleep(0.1)
            raise AssertionError("Python supervisor failed to restart Rust")

        async def crash():
            previous = await pid()
            at = time.monotonic()
            async with http.post("http://api:80/__bench/kill_rust") as r:
                assert (await r.json())["killed"] == previous
            await restarted(previous, at)

        try:
            h, state = await host()
            assert state["phase"] == "lobby"
            a, _ = await player("alpha")
            b, _ = await player("beta")
            await h.io.disconnect()
            h, state = await host()
            assert len(state["players"]) == 2
            checks.append("host refresh restores lobby roster without duplicate admission")
            await h.io.emit("start_game", "")
            await h.wait("start_game")
            await h.io.emit("set_question_number", "0")
            q = await a.wait("set_question_number")
            original_state = await db.hgetall(f"game:{pin}:answer_state")
            data = dict(question_index=0, question_token=q["question_token"], answer="A")
            await a.io.emit("submit_answer", data)
            await a.wait("answer_committed")
            await crash()
            h, state = await host()
            a, own = await player("alpha", True)
            b, missed = await player("beta", True)
            after = await db.hgetall(f"game:{pin}:answer_state")
            assert state["phase"] == "question" and own["answered"] and not missed["answered"]
            assert state["answer_count"] == 1 and own["remaining_ms"] < 120000
            assert after["token"] == original_state["token"] and after["deadline_ms"] == original_state["deadline_ms"]
            await a.io.emit("submit_answer", data)
            await a.wait("already_replied")
            assert await db.llen(f"game_session:{pin}:0") == 1
            checks.append("SIGKILL preserves committed answer, identity, original token/deadline and deduplication")

            await db.set(f"game:{pin}:generation", str(uuid.uuid4()), ex=60)
            await b.io.emit("submit_answer", data)
            await b.wait("question_not_active")
            assert await db.llen(f"game_session:{pin}:0") == 1
            await db.set(f"game:{pin}:generation", generation, ex=7200)
            checks.append("generation fence rejects stale admission before state/cache replacement")

            previous, at = await pid(), time.monotonic()
            await db.set("classquiz:rust:owner:v1", "fault-injection-replacement", ex=2)
            await b.io.emit("submit_answer", data)
            await b.wait("question_not_active")
            assert await db.llen(f"game_session:{pin}:0") == 1
            await restarted(previous, at)
            h, _ = await host()
            a, _ = await player("alpha", True)
            b, _ = await player("beta", True)
            await b.io.emit("submit_answer", data)
            await b.wait("answer_committed")
            checks.append("lease replacement fences old writes; watchdog exits and supervisor recovers")

            await h.io.emit("show_solutions", {})
            await b.wait("solutions")
            await h.io.call("get_question_results", dict(question_number=0))
            expected = await b.wait("personal_question_results")
            await crash()
            h, state = await host()
            b, own = await player("beta", True)
            actual = await b.wait("personal_question_results")
            assert state["phase"] == "results" and own["remaining_ms"] == 0 and actual == expected
            checks.append("results and personal rank reconstruct after SIGKILL")
            await h.io.emit("get_host_page", dict(page=999999))
            page = await h.wait("host_results_page")
            assert page["page"] == 0 and len(page["rows"]) == 2
            await h.io.emit("get_final_results", {})
            final = await b.wait("personal_final_results")
            await crash()
            h, state = await host()
            b, own = await player("beta", True)
            assert state["phase"] == "final" and await b.wait("personal_final_results") == final
            summary = await h.wait("final_results")
            assert summary["native_summary"] and summary["answer_counts"] == {"0": 2}
            await h.io.emit("get_export_token")
            token = await h.wait("export_token")
            full = json.loads(await db.get(f"export_token:{token}"))
            assert len(full["0"]) == 2
            checks.append("finals, bounded host pages and full export recover after SIGKILL")
            raw = await db.get(f"game:{pin}")
            await db.delete(f"game:{pin}")
            await h.io.emit("get_final_results", {})
            await h.wait("error")
            await db.set(f"game:{pin}", raw, ex=7200)
            checks.append("expired room cannot be resurrected by a cached host command")
            replacement = {**game, "game_id": str(uuid.uuid4())}
            async with db.pipeline(transaction=True) as pipe:
                pipe.set(f"game:{pin}", json.dumps(replacement), ex=7200)
                pipe.set(f"game:{pin}:generation", replacement["game_id"], ex=7200)
                await pipe.execute()
            new_host = await client()
            await new_host.io.emit("register_as_admin", dict(game_pin=pin, game_id=replacement["game_id"]))
            await new_host.wait("registered_as_admin")
            fresh = await new_host.wait("room_state")
            assert fresh["phase"] == "lobby" and fresh["players"] == []
            assert await db.llen(f"game_session:{pin}:0") == 0
            checks.append("PIN reuse drops old cached connections and clears old-generation membership/results")
            async with http.get(f"http://api:80/api/v1/quiz/export_data/{token}?game_pin={pin}") as response:
                body = await response.read()
                assert response.status == 200 and body[:2] == b"PK", body[:200]
            checks.append("old export remains a frozen snapshot after PIN reuse, with no new-room data")
            print(json.dumps(dict(passed=checks, restarts_seconds=restarts), indent=2), flush=True)
        finally:
            for c in clients:
                await c.io.disconnect()
            keys = [key async for key in db.scan_iter(f"*{pin}*")]
            if keys:
                await db.delete(*keys)
            await db.aclose()


if __name__ == "__main__":
    asyncio.run(main())
