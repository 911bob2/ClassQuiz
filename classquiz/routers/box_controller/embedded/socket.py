# SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
#
# SPDX-License-Identifier: MPL-2.0


import enum
import json
import typing
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, ValidationError

from classquiz.config import redis
from classquiz.db.models import AnswerData, GamePlayer, QuizQuestionType
from classquiz.socket_server import calculate_score, sio
from classquiz.socket_server.answers import commit_answer, load_answer_context
from classquiz.socket_server.helpers import check_question_answer
from classquiz.socket_server.models import SubmitAnswerData

router = APIRouter()


async def submit_answer_fn(data_answer: int, game_pin: str, player_id: str, now: datetime):
    game = await load_answer_context(game_pin)
    if game is None:
        return

    question = game.question
    state = await redis.hgetall(f"game:{game_pin}:answer_state")
    if not state:
        return
    username = await redis.get(f"game:cqc:player:{player_id}")
    if not username:
        return
    if question.type not in (QuizQuestionType.ABCD, QuizQuestionType.VOTING):
        print("Wrong q type")
        return
    if not 0 <= data_answer < len(question.answers):
        return
    selected_answer = question.answers[data_answer].answer

    answer_data_obj = SubmitAnswerData(question_index=game.current_question, answer=selected_answer)
    answer_right, stored_answer = check_question_answer(question, answer_data_obj)
    diff = max(0, now.timestamp() * 1000 - float(state["started_ms"]))
    score = 0
    if answer_right:
        score = calculate_score(
            abs(diff),
            int(float(question.time)),
        )
        score = max(0, min(1000, score))
    answer_data = AnswerData(
        username=username,
        answer=stored_answer,
        right=answer_right,
        time_taken=abs(diff),
        score=score,
    )
    answer_count, player_count = await commit_answer(
        game, f"controller:{player_id}", state["token"], now.timestamp() * 1000, answer_data
    )
    if answer_count < 0:
        return
    await redis.set(f"answer_given:{player_id}:{game.current_question}", "True", ex=600)
    await sio.emit(
        "player_answer", {"question_index": game.current_question, "count": answer_count}, room=f"admin:{game_pin}"
    )
    if answer_count == player_count:
        await sio.emit("everyone_answered", {"question_index": game.current_question}, room=game_pin)


button_to_index_map = {"b": 0, "y": 1, "g": 2, "r": 3}


class WebSocketTypes(enum.Enum):
    ButtonPress = "bp"
    Error = "e"


class WebSocketRequest(BaseModel):
    type: WebSocketTypes
    data: typing.Any


wss_clients = {}


@router.websocket("/{game_id}")
async def websocket_endpoint(ws: WebSocket, game_id: str):
    try:
        if game_id in wss_clients:
            await ws.close(code=status.WS_1001_GOING_AWAY)
            print(f"Client {game_id} already exists.")
            return
        await ws.accept()
        wss_clients[game_id] = ws

        player_id, game_pin = game_id.split(":")
        raw_game = await redis.get(f"game:{game_pin}")
        if raw_game is None or json.loads(raw_game).get("realtime_engine") == "rust":
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            wss_clients.pop(game_id, None)
            return
        if player_id is None or game_pin is None:
            await ws.send_text(WebSocketRequest(type=WebSocketTypes.Error, data="BadId").model_dump_json())
            await ws.close(code=status.WS_1003_UNSUPPORTED_DATA)
        username = await redis.get(f"game:cqc:player:{player_id}")
        if not username:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            wss_clients.pop(game_id, None)
            return
        membership = f"game_session:{game_pin}:players:{username}"
        owner = f"controller:{player_id}"
        if not await redis.set(membership, owner, nx=True, ex=7200) and await redis.get(membership) != owner:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            wss_clients.pop(game_id, None)
            return
        await sio.emit(
            "player_joined",
            {"username": username, "sid": None},
            room=f"admin:{game_pin}",
        )
        await redis.sadd(
            f"game_session:{game_pin}:players",
            GamePlayer(username=username, sid=None).model_dump_json(),
        )

        while True:
            raw_data = await ws.receive_text()
            try:
                data = WebSocketRequest.model_validate_json(raw_data)
            except ValidationError as e:
                print("ValError")
                print(e)
                print(raw_data)
                await ws.send_text(
                    WebSocketRequest(type=WebSocketTypes.Error, data="ValidationError").model_dump_json()
                )
                continue

            if data.type == WebSocketTypes.ButtonPress:
                print("submitting")
                now = datetime.now()
                try:
                    answer_index = button_to_index_map[data.data.lower()]
                except (KeyError, AttributeError):
                    await ws.send_text(
                        WebSocketRequest(type=WebSocketTypes.Error, data="InvalidButton").model_dump_json()
                    )
                    continue
                await submit_answer_fn(answer_index, game_pin, player_id, now)

    except WebSocketDisconnect as ex:
        print(f"Client {game_id} is disconnected: {ex}")
        wss_clients.pop(game_id, None)
