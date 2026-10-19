"""Run inside the API container against the deployment gateway.

Creates temporary data and removes only that data in finally. Does not send email.
"""
import asyncio
import io
import json
import secrets
import uuid
from urllib.parse import urlsplit

import httpx
import socketio
from PIL import Image

from classquiz.config import storage, redis, meilisearch, settings
from classquiz.db import database
from classquiz.db.models import User, Quiz, StorageItem

BASE = "http://proxy:8080"
HEADERS = {"Host": "quiz.911bob.dev", "X-Forwarded-Proto": "https"}


def checked(response, *statuses):
    assert response.status_code in (statuses or (200,)), (
        response.request.method, response.request.url.path, response.status_code,
        response.text[:400],
    )
    return response


async def play_native(game, clients):
    events = {}

    def recorder(client, *names):
        for name in names:
            future = events[name] = asyncio.get_running_loop().create_future()
            client.on(name, lambda data=None, f=future: f.done() or f.set_result(data))

    async def wait(name):
        return await asyncio.wait_for(events[name], 10)

    host, player = socketio.AsyncClient(), socketio.AsyncClient()
    clients.extend([host, player])
    recorder(host, "registered_as_admin", "final_results")
    recorder(player, "joined_game", "start_game", "set_question_number", "answer_committed")
    for client in (host, player):
        await client.connect(BASE, headers=HEADERS, transports=["websocket"], socketio_path="socket.io-rust")
    pin = game["game_pin"]
    await host.emit("register_as_admin", {"game_pin": pin, "game_id": game["game_id"], "client_id": uuid.uuid4().hex})
    await wait("registered_as_admin")
    await player.emit("join_game", {"game_pin": pin, "username": "SmokePlayer"})
    await wait("joined_game")
    await host.emit("start_game", "")
    await wait("start_game")
    await host.emit("set_question_number", "0")
    asked = await wait("set_question_number")
    await player.emit("submit_answer", {"question_index": 0, "question_token": asked["question_token"],
                                        "answer": "Yes"})
    await wait("answer_committed")
    await host.emit("get_final_results", {})
    await wait("final_results")


async def main():
    suffix = secrets.token_hex(6)
    username = f"cq-smoke-{suffix}"
    email = f"cq-smoke-{suffix}@gmail.com"
    password = secrets.token_urlsafe(32)
    user_id = quiz_id = None
    game_pins = []
    image_ids = []
    direct_keys = [uuid.uuid4().hex, uuid.uuid4().hex]
    clients = []
    await database.connect()
    try:
        async with httpx.AsyncClient(base_url=BASE, headers=HEADERS, timeout=30) as http:
            for path in ("/", "/account/register", "/account/login", "/openapi.json"):
                checked(await http.get(path))
            print("PASS frontend pages and API schema", flush=True)

            user = checked(await http.post("/api/v1/users/create", json={
                "username": username, "email": email, "password": password,
            })).json()
            user_id = uuid.UUID(user["id"])
            assert user["verified"] is True
            session = checked(await http.post("/api/v1/login/start", json={"email": email})).json()
            checked(await http.post("/api/v1/login/step/1", params={"session_id": session["session_id"]},
                                    json={"auth_type": "PASSWORD", "data": password}))
            checked(await http.get("/api/v1/users/me"))
            checked(await http.get("/dashboard"))
            print("PASS registration, password login and authenticated dashboard", flush=True)

            png = io.BytesIO()
            Image.new("RGB", (32, 32), color=(34, 111, 180)).save(png, format="PNG")
            payload = png.getvalue()
            uploaded = checked(await http.post("/api/v1/storage/", files={
                "file": ("deployment-check.png", payload, "image/png"),
            })).json()
            image_id = uploaded["id"]
            image_ids.append(uuid.UUID(image_id))
            response = checked(await http.get(f"/api/v1/storage/download/{image_id}"), 307)
            public_url = urlsplit(response.headers["location"])
            assert public_url.scheme == "https" and public_url.netloc == HEADERS["Host"]
            assert public_url.path.startswith("/classquiz/")
            image_response = checked(await http.get(public_url.path + "?" + public_url.query))
            assert image_response.content == payload
            assert image_response.headers["content-type"].startswith("image/png")
            checked(await http.get(public_url.path), 403)
            checked(await http.put(public_url.path, content=b"unauthorized"), 403)
            for _ in range(30):
                item = await StorageItem.objects.get(id=uuid.UUID(image_id))
                if item.size == len(payload) and item.hash is not None:
                    break
                await asyncio.sleep(1)
            else:
                raise AssertionError("Image metadata worker did not finish")
            print("PASS S3 upload, signed HTTPS download, MIME type, access controls and worker", flush=True)

            edit = checked(await http.post("/api/v1/editor/start", params={"edit": "false"})).json()
            checked(await http.post("/api/v1/editor/finish", params={"edit_id": edit["token"]}, json={
                "title": username, "description": "Temporary deployment verification quiz",
                "public": True, "cover_image": image_id,
                "questions": [{"question": "Does this deployment work?", "time": "20", "type": "ABCD",
                               "answers": [{"answer": "Yes", "right": True},
                                           {"answer": "No", "right": False}]}],
            }))
            quizzes = checked(await http.get("/api/v1/quiz/list")).json()
            quiz_id = uuid.UUID(next(q["id"] for q in quizzes if q["title"] == username))
            for _ in range(20):
                search = checked(await http.get("/api/v1/search/", params={"q": username})).json()
                if any(q["id"] == str(quiz_id) for q in search["hits"]):
                    break
                await asyncio.sleep(0.5)
            else:
                raise AssertionError("Quiz was not indexed")
            game = checked(await http.post(f"/api/v1/quiz/start/{quiz_id}", params={
                "game_mode": "classic", "captcha_enabled": "false",
            })).json()
            game_pin = game["game_pin"]
            game_pins.append(game_pin)
            print("PASS quiz creation, persistence, search and game lobby", flush=True)

            admin = socketio.AsyncClient()
            player = socketio.AsyncClient()
            clients.extend([admin, player])
            admin_ready = asyncio.Event()
            player_ready = asyncio.Event()
            game_started = asyncio.Event()
            admin.on("registered_as_admin", lambda data: admin_ready.set())
            player.on("joined_game", lambda data: player_ready.set())
            player.on("start_game", lambda: game_started.set())
            question = asyncio.get_running_loop().create_future()
            answered = asyncio.Event()
            player.on("set_question_number", lambda data: question.done() or question.set_result(data))
            admin.on("player_answer", lambda data: answered.set())
            for client in clients:
                await client.connect(BASE, headers=HEADERS, transports=["websocket"])
            await admin.emit("register_as_admin", {"game_pin": game_pin, "game_id": game["game_id"]})
            await asyncio.wait_for(admin_ready.wait(), 10)
            await player.emit("join_game", {"game_pin": game_pin, "username": "SmokePlayer", "captcha": None,
                                            "custom_field": None})
            await asyncio.wait_for(player_ready.wait(), 10)
            await admin.emit("start_game", {})
            await asyncio.wait_for(game_started.wait(), 10)
            await admin.emit("set_question_number", "0")
            asked = await asyncio.wait_for(question, 10)
            await player.emit("submit_answer", {"question_index": 0, "question_token": asked["question_token"],
                                                "answer": "Yes"})
            await asyncio.wait_for(answered.wait(), 10)
            stored = json.loads((await redis.lrange(f"game_session:{game_pin}:0", 0, -1))[0])
            assert stored["right"] is True and stored["score"] > 0, stored
            print("PASS WebSocket admin registration, player join, live game and scored answer", flush=True)

            capabilities = checked(await http.get("/api/v1/quiz/realtime/capabilities")).json()
            if capabilities.get("configured"):
                assert capabilities["rust"], capabilities
                native = checked(await http.post(f"/api/v1/quiz/start/{quiz_id}", params={
                    "game_mode": "kahoot", "captcha_enabled": "false", "rust_experimental": "true",
                })).json()
                game_pins.append(native["game_pin"])
                meta = checked(await http.get(f"/api/v1/quiz/play/check_captcha/{native['game_pin']}")).json()
                assert meta["socket_path"] == "/socket.io-rust", meta
                await play_native(native, clients)
                print("PASS experimental Rust room: host, join, scored answer and final results", flush=True)

            # Both a normal UI deletion and multi-object cleanup must work.
            for key in direct_keys:
                await storage.upload(key, io.BytesIO(payload), mime_type="image/png", size=len(payload))
            await storage.delete(direct_keys)
            for key in direct_keys:
                assert await storage.get_file_size(key) is None
            checked(await http.delete(f"/api/v1/quiz/delete/{quiz_id}"))
            checked(await http.delete(f"/api/v1/storage/meta/{image_id}"))
            assert await storage.get_file_size(uuid.UUID(image_id).hex) is None
            print("PASS quiz and object deletion, including multi-object cleanup", flush=True)
    finally:
        for client in clients:
            if client.connected:
                await client.disconnect()
        for key in direct_keys + [item.hex for item in image_ids]:
            await storage.delete([key])
        if quiz_id:
            meilisearch.index(settings().meilisearch_index).delete_document(str(quiz_id))
            await Quiz.objects.filter(id=quiz_id).delete()
        for item_id in image_ids:
            await StorageItem.objects.filter(id=item_id).delete()
        if user_id:
            await User.objects.filter(id=user_id).delete()
            for pattern in (f"game_in_lobby:{user_id.hex}", f"game_pin:{user_id}:*"):
                keys = [key async for key in redis.scan_iter(match=pattern)]
                if keys:
                    await redis.delete(*keys)
        for game_pin in game_pins:
            for pattern in (f"game:{game_pin}*", f"game_session:{game_pin}*"):
                keys = [key async for key in redis.scan_iter(match=pattern)]
                if keys:
                    await redis.delete(*keys)
        await redis.delete("global_user_count", "global_quiz_count")
        await database.disconnect()
        print("Temporary test data removed", flush=True)


asyncio.run(main())
