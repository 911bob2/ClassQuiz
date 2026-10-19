# SPDX-License-Identifier: MPL-2.0
"""Shared answer admission/storage. Both delivery modes use this transaction."""

import time
import uuid
import json
from dataclasses import dataclass

from classquiz.config import redis
from classquiz.db.models import AnswerData, PlayGame, QuizQuestion, QuizQuestionType

TTL = 7200
# Phones auto-submit at their own timer boundary, which starts when the question
# reaches them, not when the host opened it. Allow for slow networks and large
# broadcasts; late answers already score 0 and an explicit host reveal/close
# still rejects immediately.
ANSWER_GRACE_MS = 5000


@dataclass(frozen=True)
class AnswerContext:
    game_pin: str
    game_id: str
    current_question: int
    question: QuizQuestion


async def load_answer_context(pin: str) -> AnswerContext | None:
    """Fresh room state, validating only the question used by this submission.

    Quiz contents were validated on creation/open. This intentionally has no
    cache: next/back, expiry and other workers always see the current Redis data.
    Lua still rechecks generation/open/deadline/membership at commit time.
    """
    raw = await redis.get(f"game:{pin}")
    if raw is None:
        return None
    game = json.loads(raw)
    index = game.get("current_question", -1)
    if not game.get("started") or not 0 <= index < len(game["questions"]):
        return None
    return AnswerContext(pin, game["game_id"], index, QuizQuestion.model_validate(game["questions"][index]))


# State, uniqueness, answer, score and count must agree even when two events for
# the same player arrive together or the host closes/changes the question.
_commit = redis.register_script("""
    if redis.call('EXISTS', KEYS[7]) == 0
       or redis.call('GET', KEYS[6]) ~= ARGV[2]
       or redis.call('HGET', KEYS[1], 'game_id') ~= ARGV[3]
       or redis.call('HGET', KEYS[1], 'token') ~= ARGV[4]
       or redis.call('HGET', KEYS[1], 'index') ~= ARGV[5] then
        return {-2, 0}
    end
    if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return {-1, 0} end
    if redis.call('HGET', KEYS[1], 'open') ~= '1'
       or tonumber(ARGV[6]) < tonumber(redis.call('HGET', KEYS[1], 'started_ms'))
       or tonumber(ARGV[6]) > tonumber(redis.call('HGET', KEYS[1], 'deadline_ms')) + tonumber(ARGV[10]) then
        return {-2, 0}
    end
    redis.call('SADD', KEYS[2], ARGV[1])
    local count = redis.call('RPUSH', KEYS[3], ARGV[7])
    redis.call('HINCRBY', KEYS[4], ARGV[1], ARGV[8])
    for i = 1, 4 do redis.call('EXPIRE', KEYS[i], ARGV[9]) end
    -- Long games must not outlive the player's membership.
    redis.call('EXPIRE', KEYS[6], ARGV[9])
    local players = redis.call('SCARD', KEYS[5])
    if count == players then
        redis.call('HSET', KEYS[1], 'open', '0')
        local game = cjson.decode(redis.call('GET', KEYS[7]))
        game.question_show = false
        redis.call('SET', KEYS[7], cjson.encode(game), 'EX', ARGV[9])
    end
    return {count, players}
""")

_close = redis.register_script("""
    if redis.call('HGET', KEYS[1], 'game_id') ~= ARGV[1]
       or redis.call('HGET', KEYS[1], 'index') ~= ARGV[2] then return 0 end
    redis.call('HSET', KEYS[1], 'open', '0')
    local raw = redis.call('GET', KEYS[2])
    if raw then
        local game = cjson.decode(raw)
        game.question_show = false
        redis.call('SET', KEYS[2], cjson.encode(game), 'KEEPTTL')
    end
    return 1
""")


async def open_question(game: PlayGame) -> str:
    pin, index = game.game_pin, game.current_question
    token = uuid.uuid4().hex
    now = time.time() * 1000
    # Build the index once when resuming an older room or revisiting a question.
    # New rooms have no history. This is never a scan in the answer hot path.
    from classquiz.db.models import AnswerDataList

    previous = await AnswerDataList.get_redis_or_empty(pin, str(index))
    async with redis.pipeline(transaction=True) as pipe:
        pipe.set(f"game:{pin}", game.model_dump_json(), ex=TTL)
        pipe.hset(
            f"game:{pin}:answer_state",
            mapping={
                "game_id": str(game.game_id),
                "index": index,
                "token": token,
                "open": int(game.questions[index].type != QuizQuestionType.SLIDE),
                "started_ms": now,
                "deadline_ms": now + float(game.questions[index].time) * 1000,
            },
        )
        pipe.expire(f"game:{pin}:answer_state", TTL)
        if previous.root:
            pipe.sadd(f"game_session:{pin}:{index}:answered", *(row.username for row in previous.root))
            pipe.expire(f"game_session:{pin}:{index}:answered", TTL)
        await pipe.execute()
    return token


async def close_question(game: PlayGame, index: int) -> bool:
    return bool(
        await _close(
            keys=[f"game:{game.game_pin}:answer_state", f"game:{game.game_pin}"], args=[str(game.game_id), index]
        )
    )


async def commit_answer(
    game: PlayGame | AnswerContext, sid: str, token: str, received_ms: float, row: AnswerData
) -> tuple[int, int]:
    pin, index = game.game_pin, game.current_question
    return await _commit(
        keys=[
            f"game:{pin}:answer_state",
            f"game_session:{pin}:{index}:answered",
            f"game_session:{pin}:{index}",
            f"game_session:{pin}:player_scores",
            f"game_session:{pin}:players",
            f"game_session:{pin}:players:{row.username}",
            f"game:{pin}",
        ],
        args=[
            row.username,
            sid,
            str(game.game_id),
            token,
            index,
            received_ms,
            row.model_dump_json(),
            row.score,
            TTL,
            ANSWER_GRACE_MS,
        ],
    )
