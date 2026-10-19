# SPDX-License-Identifier: MPL-2.0
"""Bounded player results; the host/export retains the complete answer history."""

import asyncio
import json

from classquiz.config import redis

TOP_PLAYERS = 10


def standings(scores: dict[str, int]) -> list[dict]:
    # Ordinal ranks, as in the existing client. Make tied ordering deterministic
    # for every phone (descending score, then username) instead of arrival order.
    return [
        dict(username=name, score=score, rank=index + 1)
        for index, (name, score) in enumerate(
            sorted(scores.items(), key=lambda item: (-item[1], item[0].encode("utf-16-be")))
        )
    ]


class LargeAudienceDelivery:
    async def _players(self, pin):
        players = [json.loads(value) for value in await redis.smembers(f"game_session:{pin}:players")]
        return players

    async def _send(self, sio, event, players, payload):
        # Bounded batches prevent thousands of simultaneous coroutine objects and
        # give the event loop opportunities to serve timers/other rooms.
        for offset in range(0, len(players), 64):
            await asyncio.gather(
                *(
                    sio.emit(event, payload(player["username"]), room=player["sid"])
                    for player in players[offset : offset + 64]
                    if player.get("sid")
                )
            )

    async def question(self, sio, game, index, rows):
        pin = game.game_pin
        players = await self._players(pin)
        scores = {
            name: int(score) for name, score in (await redis.hgetall(f"game_session:{pin}:player_scores")).items()
        }
        for player in players:
            scores.setdefault(player["username"], 0)
        ranked = standings(scores)
        own = {row["username"]: row for row in ranked}
        answers = {row["username"]: row for row in rows}
        await sio.emit("question_results", rows, room=f"admin:{pin}")
        await self._send(
            sio,
            "personal_question_results",
            players,
            lambda name: dict(
                version=1, question_index=index, answer=answers.get(name), **own[name], player_count=len(ranked)
            ),
        )

    async def final(self, sio, game, results):
        pin = game.game_pin
        players = await self._players(pin)
        scores = {player["username"]: 0 for player in players}
        question_scores = {player["username"]: {} for player in players}
        for index, rows in results.items():
            for row in rows:
                scores[row["username"]] = scores.get(row["username"], 0) + row["score"]
                question_scores.setdefault(row["username"], {})[index] = row["score"]
        ranked = standings(scores)
        own = {row["username"]: row for row in ranked}
        await sio.emit("final_results", results, room=f"admin:{pin}")
        await self._send(
            sio,
            "personal_final_results",
            players,
            lambda name: dict(
                version=1,
                **own[name],
                player_count=len(ranked),
                leaderboard=ranked[:TOP_PLAYERS],
                question_scores=question_scores[name],
            ),
        )
