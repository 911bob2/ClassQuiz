# SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
#
# SPDX-License-Identifier: MPL-2.0


import base64
import hashlib
import json
import os
import random
import time

import socketio
from cryptography.fernet import Fernet

from classquiz.config import redis, settings
from classquiz.db.models import (
    PlayGame,
    QuizQuestionType,
    GameSession,
    GamePlayer,
    VotingQuizAnswer,
    AnswerDataList,
    AnswerData,
)
from pydantic import BaseModel, ValidationError
from datetime import datetime

from classquiz.socket_server.helpers import (
    check_question_answer,
)
from .models import (
    RejoinGameData,
    JoinGameData,
    ReturnQuestion,
    SubmitAnswerData,
    RegisterAsAdminData,
    KickPlayerInput,
    ConnectSessionIdEvent,
)

from classquiz.socket_server.export_helpers import save_quiz_to_storage
from classquiz.socket_server.session import get_session, save_session
from classquiz.socket_server.answers import open_question, close_question, commit_answer, load_answer_context
from classquiz.socket_server.delivery import delivery_for

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=[])
settings = settings()


def get_fernet_key() -> bytes:
    hlib = hashlib.sha256()
    hlib.update(settings.secret_key.encode("utf-8"))
    return base64.urlsafe_b64encode(hlib.hexdigest().encode("latin-1")[:32])


fernet = Fernet(get_fernet_key())


async def generate_final_results(game_data: PlayGame, game_pin: str) -> dict:
    results = {}
    for i in range(len(game_data.questions)):
        redis_res = await redis.lrange(f"game_session:{game_pin}:{i}", 0, -1)
        if not redis_res:
            continue
        else:
            results[str(i)] = [json.loads(a) for a in redis_res]
    return results


def calculate_score(z: float, t: int) -> int:
    t = t * 1000
    res = (t - z) / t
    return int(res * 1000)


@sio.event
async def rejoin_game(sid: str, data: dict):
    redis_res = await redis.get(f"game:{data['game_pin']}")
    if redis_res is None:
        await sio.emit("game_not_found", room=sid)
        return
    if json.loads(redis_res).get("realtime_engine") == "rust":
        await sio.emit("error", {"message": "Use this room's Rust endpoint"}, room=sid)
        return
    try:
        data = RejoinGameData(**data)
    except ValidationError as e:
        await sio.emit("error", room=sid)
        print(e)
    redis_sid_key = f"game_session:{data.game_pin}:players:{data.username}"
    old_sid = await redis.get(redis_sid_key)
    if old_sid != data.old_sid:
        return
    encrypted_datetime = fernet.encrypt(datetime.now().isoformat().encode("utf-8")).decode("utf-8")
    await sio.emit("time_sync", encrypted_datetime, room=sid)
    async with redis.pipeline(transaction=True) as pipe:
        pipe.set(redis_sid_key, sid, ex=7200)
        pipe.srem(
            f"game_session:{data.game_pin}:players",
            GamePlayer(username=data.username, sid=data.old_sid).model_dump_json(),
        )
        pipe.sadd(
            f"game_session:{data.game_pin}:players",
            GamePlayer(username=data.username, sid=sid).model_dump_json(),
        )
        await pipe.execute()
    game_data = PlayGame.model_validate_json(redis_res)
    session = {
        "game_pin": data.game_pin,
        "username": data.username,
        "sid_custom": sid,
        "admin": False,
    }
    await save_session(sid, sio, session)
    await sio.enter_room(sid, data.game_pin)
    await sio.emit(
        "rejoined_game",
        game_data.to_player_data(),
        room=sid,
    )


@sio.event
async def join_game(sid: str, data: dict):
    redis_res = await redis.get(f"game:{data['game_pin']}")
    if redis_res is None:
        await sio.emit("game_not_found", room=sid)
        return
    try:
        data = JoinGameData(**data)
    except ValidationError as e:
        await sio.emit("error", room=sid)
        print(e)
        return
    game_data = PlayGame.model_validate_json(redis_res)
    if game_data.realtime_engine == "rust":
        await sio.emit("error", {"message": "Use this room's Rust endpoint"}, room=sid)
        return
    if game_data.started:
        await sio.emit("game_already_started", room=sid)
        return
    # +++ START checking captcha +++
    if game_data.captcha_enabled:
        from classquiz.captcha import verify_captcha

        captcha_error = await verify_captcha(data.captcha, game_data.captcha_policy)
        if captcha_error:
            await sio.emit("captcha_error", {"code": captcha_error, "retry_after_ms": 1000}, room=sid)
            return
    # --- END checking captcha ---
    if not await redis.set(f"game_session:{data.game_pin}:players:{data.username}", sid, nx=True, ex=7200):
        await sio.emit("username_already_exists", room=sid)
        return

    session = {
        "game_pin": data.game_pin,
        "username": data.username,
        "sid_custom": sid,
        "admin": False,
    }
    await save_session(sid, sio, session)
    await sio.emit(
        "joined_game",
        game_data.to_player_data(),
        room=sid,
    )
    await GamePlayer(username=data.username, sid=sid).to_player_stack(data.game_pin)

    if data.custom_field == "":
        data.custom_field = None
    if data.custom_field is not None:
        await redis.hset(
            f"game:{data.game_pin}:players:custom_fields",
            data.username,
            data.custom_field,
        )

    await sio.emit(
        "player_joined",
        {"username": data.username, "sid": sid},
        room=f"admin:{data.game_pin}",
    )
    # +++ Time-Sync +++
    encrypted_datetime = fernet.encrypt(datetime.now().isoformat().encode("utf-8")).decode("utf-8")
    await sio.emit("time_sync", encrypted_datetime, room=sid)
    # --- Time-Sync ---
    await sio.enter_room(sid, data.game_pin)


@sio.event
async def start_game(sid: str, _data: dict):
    session = await get_session(sid, sio)
    if not session["admin"]:
        return
    game_data = await PlayGame.get_from_redis(session["game_pin"])
    game_data.started = True
    await game_data.save(session["game_pin"])
    await redis.delete(f"game_in_lobby:{game_data.user_id.hex}")
    await sio.emit("start_game", room=session["game_pin"])


@sio.event
async def register_as_admin(sid: str, data: dict):
    try:
        data = RegisterAsAdminData(**data)
    except ValidationError as e:
        await sio.emit("error", room=sid)
        print(e)
        return
    game_pin = data.game_pin
    game_id = data.game_id
    raw_game = await redis.get(f"game:{game_pin}")
    if not raw_game:
        await sio.emit("game_not_found", room=sid)
        return
    game = PlayGame.model_validate_json(raw_game)
    if game.realtime_engine == "rust" or str(game.game_id) != game_id:
        await sio.emit("error", {"message": "Invalid host token or realtime endpoint"}, room=sid)
        return
    if await redis.get(f"game_session:{game_pin}") is not None:
        await sio.emit("already_registered_as_admin", room=sid)
        return
    await GameSession(admin=sid, game_id=game_id, answers=[]).save(game_pin)
    await sio.emit(
        "registered_as_admin",
        {"game_id": game_id, "game": await redis.get(f"game:{game_pin}")},
        room=sid,
    )
    session = {"game_pin": game_pin, "admin": True, "remote": False}
    await save_session(sid, sio, session)
    await sio.enter_room(sid, game_pin)
    await sio.enter_room(sid, f"admin:{data.game_pin}")


@sio.event
async def get_question_results(sid: str, data: dict):
    session = await get_session(sid, sio)
    if not session["admin"]:
        return
    game_pin = session["game_pin"]
    game_data = await PlayGame.get_from_redis(game_pin)
    try:
        index = int(data["question_number"])
    except (KeyError, TypeError, ValueError):
        return
    if not await close_question(game_data, index):
        return
    answer_data_list = await AnswerDataList.get_redis_or_empty(game_pin, str(index))
    await delivery_for(game_data).question(sio, game_data, index, answer_data_list.model_dump())


@sio.event
async def set_question_number(sid: str, data: str):
    # data is just a number (as a str) of the question
    session = await get_session(sid, sio)
    if not session["admin"]:
        return
    game_pin = session["game_pin"]
    game_data = await PlayGame.get_from_redis(session["game_pin"])
    try:
        index = int(data)
    except (TypeError, ValueError):
        return
    if not game_data.started or not 0 <= index < len(game_data.questions):
        return
    game_data.current_question = index
    game_data.question_show = True
    question_token = await open_question(game_data)
    temp_return = game_data.model_dump(include={"questions"})["questions"][int(float(data))]
    if game_data.questions[int(float(data))].type == QuizQuestionType.SLIDE:
        await sio.emit(
            "set_question_number",
            {
                "question_index": int(float(data)),
            },
            room=sid,
        )
        return
    if game_data.questions[int(float(data))].type == QuizQuestionType.VOTING:
        for i in range(len(temp_return["answers"])):
            temp_return["answers"][i] = VotingQuizAnswer(**temp_return["answers"][i])
    temp_return["type"] = game_data.questions[int(float(data))].type
    if temp_return["type"] == QuizQuestionType.ORDER:
        random.shuffle(temp_return["answers"])
    await sio.emit(
        "set_question_number",
        {
            "question_index": int(float(data)),
            "question_token": question_token,
            "question": ReturnQuestion(**temp_return).model_dump(),
        },
        room=game_pin,
    )


@sio.event
async def submit_answer(sid: str, data: dict):
    received_ms = time.time() * 1000
    try:
        data = SubmitAnswerData(**data)
    except ValidationError as e:
        await sio.emit("error", room=sid)
        print(e)
        return
    data.answer = str(data.answer)
    session = await get_session(sid, sio)
    if session.get("admin") or not session.get("username"):
        return
    question_index = int(float(data.question_index))
    game_data = await load_answer_context(session["game_pin"])

    if game_data is None or question_index != game_data.current_question or question_index < 0:
        await sio.emit("question_not_active", room=sid)
        return
    if game_data.question.type == QuizQuestionType.SLIDE:
        return

    state = await redis.hgetall(f"game:{session['game_pin']}:answer_state")
    if not state or (data.question_token is not None and data.question_token != state["token"]):
        await sio.emit("question_not_active", room=sid)
        return
    try:
        answer_right, answer = check_question_answer(game_data.question, data)
    except (ValueError, TypeError, OverflowError, IndexError):
        await sio.emit("error", room=sid)
        return
    latency = max(0, min(1000, float(session.get("ping", 0))))
    elapsed = max(0, received_ms - float(state["started_ms"]) - latency)
    score = 0
    if answer_right:
        score = max(0, min(1000, calculate_score(elapsed, int(float(game_data.question.time)))))
    answer_data = AnswerData(
        username=session["username"],
        answer=answer,
        right=bool(answer_right),
        time_taken=elapsed,
        score=score,
    )
    answer_count, player_count = await commit_answer(game_data, sid, state["token"], received_ms, answer_data)
    if answer_count < 0:
        await sio.emit("already_replied" if answer_count == -1 else "question_not_active", room=sid)
        return
    await sio.emit(
        "player_answer", {"question_index": question_index, "count": answer_count}, room=f"admin:{session['game_pin']}"
    )
    if answer_count == player_count:
        await sio.emit("everyone_answered", {"question_index": question_index}, room=session["game_pin"])


@sio.event
async def get_final_results(sid: str, _data: dict):
    session: dict = await get_session(sid, sio)
    if not session["admin"]:
        return
    game_data = await PlayGame.get_from_redis(session["game_pin"])
    await close_question(game_data, game_data.current_question)
    results = await generate_final_results(game_data, session["game_pin"])
    await delivery_for(game_data).final(sio, game_data, results)


@sio.event
async def get_export_token(sid: str):
    session = await get_session(sid, sio)
    if not session["admin"]:
        return
    game_data = await PlayGame.get_from_redis(session["game_pin"])
    results = await generate_final_results(game_data, session["game_pin"])
    token = os.urandom(32).hex()
    await redis.set(f"export_token:{token}", json.dumps(results), ex=7200)
    await sio.emit("export_token", token, room=sid)


@sio.event
async def show_solutions(sid: str, _data: dict):
    session: dict = await get_session(sid, sio)
    game_data = await PlayGame.get_from_redis(session["game_pin"])
    if not session["admin"]:
        return
    await close_question(game_data, game_data.current_question)
    await sio.emit(
        "solutions",
        game_data.questions[game_data.current_question].model_dump(),
        room=session["game_pin"],
    )


@sio.event
async def echo_time_sync(sid: str, data: str):
    then_dec = fernet.decrypt(data).decode("utf-8")
    then = datetime.fromisoformat(then_dec)
    now = datetime.now()
    delta = now - then
    session = await get_session(sid, sio)
    session["ping"] = delta.microseconds / 1000
    await save_session(sid, sio, session)


@sio.event
async def kick_player(sid: str, data: dict):
    try:
        data = KickPlayerInput(**data)
    except ValidationError as e:
        await sio.emit("error", room=sid)
        print(e)
        return

    session: dict = await get_session(sid, sio)
    if not session["admin"]:
        return

    player_sid = await redis.get(f"game_session:{session['game_pin']}:players:{data.username}")
    controller = player_sid is not None and player_sid.startswith("controller:")
    await redis.srem(
        f"game_session:{session['game_pin']}:players",
        GamePlayer(username=data.username, sid=None if controller else player_sid).model_dump_json(),
    )
    await redis.delete(f"game_session:{session['game_pin']}:players:{data.username}")
    if player_sid is not None and not controller:
        await sio.leave_room(player_sid, session["game_pin"])
        await sio.emit("kick", room=player_sid)


class _RegisterAsRemoteInput(BaseModel):
    game_pin: str
    game_id: str


@sio.event
async def register_as_remote(sid: str, data: dict):
    try:
        data = _RegisterAsRemoteInput(**data)
    except ValidationError as e:
        await sio.emit("error", room=sid)
        print(e)
        return
    raw_game = await redis.get(f"game:{data.game_pin}")
    if not raw_game:
        return
    game = PlayGame.model_validate_json(raw_game)
    if game.realtime_engine == "rust" or str(game.game_id) != data.game_id:
        await sio.emit("error", {"message": "Invalid host token or unsupported remote mode"}, room=sid)
        return
    await sio.emit(
        "registered_as_admin",
        {"game_id": data.game_id, "game": await redis.get(f"game:{data.game_pin}")},
        room=sid,
    )
    await sio.emit("control_visibility", {"visible": False}, room=f"admin:{data.game_pin}")
    session = await get_session(sid, sio)
    session["game_pin"] = data.game_pin
    session["admin"] = True
    session["remote"] = True
    await save_session(sid, sio, session)
    await sio.enter_room(sid, data.game_pin)
    await sio.enter_room(sid, f"admin:{data.game_pin}")


class _SetControlVisibilityInput(BaseModel):
    visible: bool


@sio.event
async def set_control_visibility(sid: str, data: dict):
    try:
        data = _SetControlVisibilityInput(**data)
    except ValidationError as e:
        await sio.emit("error", room=sid)
        print(e)
        return
    session: dict = await get_session(sid, sio)
    await sio.emit(
        "control_visibility",
        {"visible": data.visible},
        room=f"admin:{session['game_pin']}",
    )


@sio.event
async def save_quiz(sid: str):
    session: dict = await get_session(sid, sio)
    if not session["admin"]:
        return
    await save_quiz_to_storage(session["game_pin"])
    await sio.emit("results_saved_successfully", room=sid)


@sio.event
async def connect(sid: str, _environ, _auth=None):
    session_id = os.urandom(16).hex()
    sio_session = {"session_id": session_id}
    await sio.save_session(sid, sio_session)
    await sio.emit("session_id", ConnectSessionIdEvent(session_id=session_id).model_dump(), room=sid)
