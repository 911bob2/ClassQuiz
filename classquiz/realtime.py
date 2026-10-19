# SPDX-License-Identifier: MPL-2.0
"""Room admission and the authenticated Python control plane for native rooms."""

import asyncio
import secrets
import time
from contextlib import asynccontextmanager

import aiohttp
from fastapi import HTTPException

from classquiz.config import redis, settings
from classquiz.db.models import PlayGame

_health = (0.0, {})
_health_lock = asyncio.Lock()


async def rust_available():
    return (await rust_capabilities()).get("rust", False)


async def rust_capabilities():
    global _health
    url = settings().rust_realtime_url
    if not url:
        return {"rust": False}
    async with _health_lock:
        now = time.monotonic()
        if now - _health[0] < 2:
            return _health[1]
        result = {"rust": False}
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=1)) as http:
                async with http.get(url.rstrip("/") + "/__rust/capabilities") as response:
                    if response.status == 200:
                        data = await response.json()
                        result = {
                            "rust": True,
                            "rust_captcha": data.get("captcha_policy"),
                            "captcha_lab": data.get("captcha_lab", False),
                        }
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
            pass
        _health = (now, result)
        return result


async def native_host(pin, token):
    raw = await redis.get(f"game:{pin}")
    if not raw:
        raise HTTPException(404, "Room expired")
    game = PlayGame.model_validate_json(raw)
    if (
        not token
        or not secrets.compare_digest(str(game.game_id).encode(), token.encode())
        or game.realtime_engine != "rust"
    ):
        raise HTTPException(403, "Host token required")
    return game


@asynccontextmanager
async def host_action(pin):
    """Serialize retries of durable result saving without deleting another owner."""
    key, token = f"game:{pin}:save_lock", secrets.token_hex(24)
    if not await redis.set(key, token, nx=True, ex=120):
        raise HTTPException(409, "A save is already in progress; retry shortly")
    try:
        yield
    finally:
        await redis.eval(
            "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end", 1, key, token
        )
