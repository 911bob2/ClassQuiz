"""Regression checks against disposable lab Redis; run with compose exec api.

Uses the production handlers/transactions with a captured Socket.IO sink. The
load driver separately tests the real network, transport and player protocol.
"""

import asyncio
import json
import time
import uuid
from datetime import datetime

from classquiz import socket_server as engine
from classquiz.config import redis
from classquiz.db.models import PlayGame, GamePlayer, AnswerData
from classquiz.socket_server.answers import open_question, close_question, commit_answer
from classquiz.socket_server.delivery import delivery_for
from classquiz.socket_server.large_audience import standings
from classquiz.socket_server.session import save_session


class Sink:
    def __init__(self):
        self.events = []

    async def get_session(self, sid):
        return {"session_id": sid}

    async def emit(self, event, data=None, room=None, **kwargs):
        self.events.append((event, data, room))

    async def enter_room(self, sid, room):
        pass

    async def leave_room(self, sid, room):
        pass


async def main():
    sink = Sink()
    engine.sio = sink
    pin = "test-" + uuid.uuid4().hex
    sid, username = "test-" + uuid.uuid4().hex, "player"
    admin = "test-" + uuid.uuid4().hex
    questions = [
        ("ABCD", [{"answer": "A", "right": True}, {"answer": "B", "right": False}], "A", None),
        ("RANGE", dict(min=0, max=10, min_correct=4, max_correct=6), "5", None),
        ("TEXT", [dict(answer="Yes", case_sensitive=False)], "YES", None),
        ("CHECK", [dict(answer="A", right=True), dict(answer="B", right=False)], "0", None),
        ("ORDER", [dict(answer="A"), dict(answer="B")], "a", [dict(answer="A"), dict(answer="B")]),
        ("VOTING", [dict(answer="A"), dict(answer="B")], "A", None),
        ("ABCD", [dict(answer="A", right=True)], "A", None),
        ("ABCD", [dict(answer="A", right=True)], "A", None),
        ("RANGE", dict(min=0, max=10, min_correct=4, max_correct=6), "5", None),
    ]
    game = PlayGame(
        quiz_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        game_id=uuid.uuid4(),
        game_pin=pin,
        title="Regression",
        description="",
        started=True,
        questions=[dict(question=kind, time="30", type=kind, answers=answers) for kind, answers, _, _ in questions],
    )
    await save_session(sid, sink, dict(game_pin=pin, username=username, admin=False))
    await save_session(admin, sink, dict(game_pin=pin, admin=True))
    await redis.set(f"game_session:{pin}:players:{username}", sid, ex=600)
    await redis.sadd(
        f"game_session:{pin}:players",
        GamePlayer(username=username, sid=sid).model_dump_json(),
        GamePlayer(username="absent", sid="absent").model_dump_json(),
    )
    passed = []
    try:
        for index, (kind, _, answer, complex_answer) in enumerate(questions[:6]):
            game.current_question = index
            game.question_show = True
            await game.save(pin)
            await engine.set_question_number(admin, str(index))
            token = await redis.hget(f"game:{pin}:answer_state", "token")
            assert any(
                event == "set_question_number" and data.get("question_token") == token and room == pin
                for event, data, room in sink.events
            )
            payload = dict(question_index=index, question_token=token, answer=answer, complex_answer=complex_answer)
            if kind == "RANGE":
                await engine.submit_answer(sid, {**payload, "answer": "not a number"})
                assert await redis.llen(f"game_session:{pin}:{index}") == 0
            await asyncio.gather(*(engine.submit_answer(sid, payload) for _ in range(20)))
            rows = await redis.lrange(f"game_session:{pin}:{index}", 0, -1)
            assert len(rows) == 1, (kind, len(rows))
            row = json.loads(rows[0])
            assert row["right"] == (kind != "VOTING") and 0 <= row["score"] <= 1000, row
            assert await redis.ttl(f"game_session:{pin}:{index}:answered") > 0
            assert await redis.ttl(f"game_session:{pin}:player_scores") > 0
            passed.append(f"{kind}: 20 concurrent retries stored/scored once")
        assert all(room is not None for _, _, room in sink.events)
        assert all(room == f"admin:{pin}" for event, _, room in sink.events if event == "player_answer")

        all_rows = [
            json.loads(row) for index in range(6) for row in await redis.lrange(f"game_session:{pin}:{index}", 0, -1)
        ]
        assert int(await redis.hget(f"game_session:{pin}:player_scores", username)) == sum(r["score"] for r in all_rows)
        game.current_question = 6
        old = await open_question(game)
        new = await open_question(game)
        row = AnswerData(username=username, answer="A", right=True, time_taken=1, score=999)
        assert (await commit_answer(game, sid, old, time.time() * 1000, row))[0] == -2
        await engine.submit_answer(sid, dict(question_index=6, question_token=old, answer="A"))
        assert await redis.llen(f"game_session:{pin}:6") == 0
        assert not await close_question(game, 5)
        assert (await redis.hget(f"game:{pin}:answer_state", "open")) == "1"
        await close_question(game, 6)
        assert (await commit_answer(game, sid, new, time.time() * 1000, row))[0] == -2
        assert not (await PlayGame.get_from_redis(pin)).question_show
        passed.append("stale token, stale host close, and closed-question writes rejected")

        token = await open_question(game)
        await redis.hset(f"game:{pin}:answer_state", "deadline_ms", time.time() * 1000 - 2000)
        assert (await commit_answer(game, sid, token, time.time() * 1000, row))[0] == -2
        token = await open_question(game)
        await redis.hset(f"game:{pin}:answer_state", "deadline_ms", time.time() * 1000 - 500)
        assert (await commit_answer(game, "old-socket", token, time.time() * 1000, row))[0] == -2
        count_before_rejoin = await redis.scard(f"game_session:{pin}:players")
        await engine.rejoin_game("rejoined", dict(game_pin=pin, username=username, old_sid=sid))
        assert await redis.scard(f"game_session:{pin}:players") == count_before_rejoin
        assert await redis.get(f"game_session:{pin}:players:{username}") == "rejoined"
        assert (await commit_answer(game, sid, token, time.time() * 1000, row))[0] == -2
        assert (await commit_answer(game, "rejoined", token, time.time() * 1000, row))[0] == 1
        passed.append("deadline/network grace, kicked/old socket, and rejoined identity checks")

        # Index migration from existing list history, without another score write.
        await redis.delete(f"game_session:{pin}:6:answered")
        token = await open_question(game)
        assert (await commit_answer(game, "rejoined", token, time.time() * 1000, row))[0] == -1
        passed.append("legacy answer list seeds uniqueness when question is opened")

        from classquiz.routers.box_controller.embedded import socket as controller

        controller.sio = sink
        game.current_question = 7
        await open_question(game)
        controller_id = uuid.uuid4().hex
        await redis.set(f"game:cqc:player:{controller_id}", "controller", ex=600)
        await redis.set(f"game_session:{pin}:players:controller", f"controller:{controller_id}", ex=600)
        await redis.sadd(f"game_session:{pin}:players", GamePlayer(username="controller").model_dump_json())
        await asyncio.gather(*(controller.submit_answer_fn(0, pin, controller_id, datetime.now()) for _ in range(20)))
        assert await redis.llen(f"game_session:{pin}:7") == 1
        passed.append("physical controller uses the same atomic admission")

        game.current_question = 8
        game.questions[8].time = "1"
        token = await open_question(game)
        await asyncio.sleep(1.1)
        await engine.submit_answer("rejoined", dict(question_index=8, question_token=token, answer="5"))
        late = [json.loads(value) for value in await redis.lrange(f"game_session:{pin}:8", 0, -1)]
        assert len(late) == 1 and late[0]["right"] and late[0]["score"] == 0
        passed.append("timer-boundary range answer is accepted within grace with score clamped to zero")

        result_rows = [dict(username="player", answer="A", right=True, time_taken=1, score=999)]
        sink.events.clear()
        await delivery_for(game).question(sink, game, 7, result_rows)
        assert sink.events == [("question_results", result_rows, pin)]
        game.large_audience = True
        sink.events.clear()
        await delivery_for(game).question(sink, game, 7, result_rows)
        assert ("question_results", result_rows, f"admin:{pin}") in sink.events
        messages = [data for event, data, room in sink.events if event == "personal_question_results"]
        assert len(messages) == 2 and {data["username"] for data in messages} == {"player", "absent"}
        assert next(d for d in messages if d["username"] == "absent")["answer"] is None
        sink.events.clear()
        await delivery_for(game).final(sink, game, {"7": result_rows})
        finals = [data for event, data, room in sink.events if event == "personal_final_results"]
        assert len(finals) == 2 and all(len(d["leaderboard"]) <= 10 for d in finals)
        assert next(d for d in finals if d["username"] == "player")["score"] == 999
        assert next(d for d in finals if d["username"] == "player")["question_scores"] == {"7": 999}
        assert standings({"B": 100, "A": 100, "C": 0}) == [
            dict(username="A", score=100, rank=1),
            dict(username="B", score=100, rank=2),
            dict(username="C", score=0, rank=3),
        ]
        passed.append("standard/large result schemas, no-answer player, deterministic ties, and full host results")
        assert all(room is not None for _, _, room in sink.events)
        passed.append("all captured result events scoped to intended recipients")
        await engine.kick_player(admin, dict(username="controller"))
        assert await redis.get(f"game_session:{pin}:players:controller") is None
        assert not await redis.sismember(
            f"game_session:{pin}:players", GamePlayer(username="controller").model_dump_json()
        )
        await engine.kick_player(admin, dict(username=username))
        assert await redis.get(f"game_session:{pin}:players:{username}") is None
        assert not await redis.sismember(
            f"game_session:{pin}:players", GamePlayer(username=username, sid="rejoined").model_dump_json()
        )
        passed.append("kicking browser and controller identities removes membership and blocks future admission")
        print(json.dumps(dict(passed=passed, count=len(passed)), indent=2))
    finally:
        # Only keys for this unique test room/session. No database flush.
        keys = [key async for key in redis.scan_iter(match=f"*{pin}*")]
        if keys:
            await redis.delete(*keys)
        await redis.delete(f"socket_io_session:{sid}", f"socket_io_session:{admin}", "socket_io_session:rejoined")
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(main())
