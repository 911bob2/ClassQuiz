"""Single-worker measurement prototypes. Never imported by production code.

The cache experiment keeps the production Lua commit, including membership,
generation, open-state, deadline and deduplication checks. It is NOT a distributed
cache design: admin operations on another worker would need invalidation.
"""

import time


def install(server):
    from classquiz.socket_server.answers import AnswerContext

    contexts = {}
    sessions = {}
    raw_open = server.open_question
    raw_close = server.close_question
    raw_context = server.load_answer_context
    raw_save = server.save_session
    raw_session = server.get_session

    async def open_question(game):
        token = await raw_open(game)
        contexts[game.game_pin] = (
            time.monotonic() + 7200,
            AnswerContext(
                game.game_pin, str(game.game_id), game.current_question, game.questions[game.current_question]
            ),
        )
        return token

    async def close_question(game, index):
        contexts.pop(game.game_pin, None)
        return await raw_close(game, index)

    async def load_answer_context(pin):
        cached = contexts.get(pin)
        if cached and cached[0] > time.monotonic():
            return cached[1]
        return await raw_context(pin)

    async def save_session(sid, sio, data, disconnect_on_error=True):
        await raw_save(sid, sio, data, disconnect_on_error)
        sessions[sid] = (time.monotonic() + 3600, dict(data))

    async def get_session(sid, sio, disconnect_on_error=True):
        cached = sessions.get(sid)
        if cached and cached[0] > time.monotonic():
            return dict(cached[1])
        return await raw_session(sid, sio, disconnect_on_error)

    # Clean up identity caches when a socket leaves. Real Redis admission still
    # decides whether an answer is authorized, even for stale cached identities.
    raw_disconnect = server.sio.handlers["/"].get("disconnect")

    async def disconnect(sid, *args):
        sessions.pop(sid, None)
        if raw_disconnect:
            return await raw_disconnect(sid, *args)

    server.sio.handlers["/"]["disconnect"] = disconnect
    server.open_question = open_question
    server.close_question = close_question
    server.load_answer_context = load_answer_context
    server.save_session = save_session
    server.get_session = get_session
