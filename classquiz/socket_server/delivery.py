# SPDX-License-Identifier: MPL-2.0
"""Result delivery policy; game rules and answer admission are mode-independent."""

from typing import Protocol

from .large_audience import LargeAudienceDelivery


class ResultDelivery(Protocol):
    async def question(self, sio, game, index: int, rows: list[dict]) -> None: ...
    async def final(self, sio, game, results: dict) -> None: ...


class StandardDelivery:
    async def question(self, sio, game, index, rows):
        await sio.emit("question_results", rows, room=game.game_pin)

    async def final(self, sio, game, results):
        await sio.emit("final_results", results, room=game.game_pin)


# Stateless strategies: no room cache, timers, mutable game copies or lifecycle
# cleanup. Selection occurs only at result boundaries, never per answer.
_DELIVERY: tuple[ResultDelivery, ResultDelivery] = (StandardDelivery(), LargeAudienceDelivery())


def delivery_for(game) -> ResultDelivery:
    return _DELIVERY[int(game.large_audience)]
