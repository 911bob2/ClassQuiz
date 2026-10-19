"""Local lab provider only; never imported or launched by the production app."""

import asyncio
import time
from aiohttp import web

config = {"delay_ms": 200, "mode": "token"}
stats = {"requests": 0, "active": 0, "peak_active": 0, "connections": set(), "forms_valid": True}


async def verify(request):
    data = await request.post()
    stats["requests"] += 1
    stats["active"] += 1
    stats["peak_active"] = max(stats["peak_active"], stats["active"])
    stats["connections"].add(request.transport.get_extra_info("peername"))
    stats["forms_valid"] &= data.get("secret") == "lab-secret" and data.get("sitekey", "lab-site-key") == "lab-site-key"
    try:
        token = data.get("response", "")
        mode = token.split(":", 1)[0] if config["mode"] == "token" else config["mode"]
        await asyncio.sleep((6000 if mode == "slow" else config["delay_ms"]) / 1000)
        if mode == "malformed":
            return web.Response(text="not json", content_type="application/json")
        if mode == "oversize":
            return web.Response(text="x" * 20000)
        if mode == "status":
            return web.json_response({"error": "quota"}, status=429)
        value = dict(
            success=mode not in ("fail", "expired"), hostname="classquiz.test", action="classquiz_join", score=0.9
        )
        if mode == "wrong-host":
            value["hostname"] = "other.example"
        if mode == "wrong-action":
            value["action"] = "other_action"
        if mode == "low":
            value["score"] = 0.1
        if mode == "quota":
            value["error-codes"] = ["Over free quota."]
        if mode == "expired":
            value["error-codes"] = ["expired-input-response"]
        if not stats["forms_valid"]:
            value = {"success": False}
        return web.json_response(value)
    finally:
        stats["active"] -= 1


async def metrics(request):
    return web.json_response({**stats, "connections": len(stats["connections"]), "config": config, "time": time.time()})


async def configure(request):
    values = await request.json()
    config.update({k: v for k, v in values.items() if k in config})
    if values.get("reset") and stats["active"] == 0:
        stats.update(requests=0, peak_active=0, connections=set(), forms_valid=True)
    return await metrics(request)


app = web.Application()
app.router.add_post("/siteverify", verify)
app.router.add_get("/metrics", metrics)
app.router.add_post("/config", configure)
if __name__ == "__main__":
    web.run_app(app, port=9080, access_log=None)
