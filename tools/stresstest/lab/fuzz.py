"""Small concurrency regression probe against the disposable local database."""
import asyncio
import json
import uuid
from pathlib import Path
import redis.asyncio as redis
import socketio


async def main():
    store = redis.Redis.from_url('redis://redis:6379', decode_responses=True)
    pin = str(100000 + uuid.uuid4().int % 900000)
    game_id = str(uuid.uuid4())
    game = dict(quiz_id=str(uuid.uuid4()), user_id=str(uuid.uuid4()), game_id=game_id,
        game_pin=pin, title='Duplicate submission probe', description='', started=False,
        captcha_enabled=False, game_mode='kahoot', current_question=-1,
        questions=[dict(question='A?', time='30', type='ABCD',
            answers=[dict(answer='A',right=True),dict(answer='B',right=False)]) for _ in range(10)])
    await store.set(f'game:{pin}', json.dumps(game), ex=600)
    host, player = socketio.AsyncClient(), socketio.AsyncClient()
    joined, question = asyncio.Event(), asyncio.Event()

    @player.on('joined_game')
    async def on_joined(*_):
        joined.set()

    @player.on('time_sync')
    async def on_time(data):
        await player.call('echo_time_sync', data, timeout=10)

    @player.on('set_question_number')
    async def on_question(*_):
        question.set()

    try:
        await host.connect('http://proxy:8080', transports=['websocket'])
        await host.call('register_as_admin',dict(game_pin=pin,game_id=game_id))
        await player.connect('http://proxy:8080',transports=['websocket'])
        await player.call('join_game',dict(game_pin=pin,username='duplicate-probe',captcha='',custom_field=''))
        await joined.wait()
        await asyncio.sleep(.2)
        await host.call('start_game',{})
        counts = []
        for index in range(10):
            question.clear()
            await host.call('set_question_number',str(index))
            await question.wait()
            payload = dict(question_index=str(index),answer='A')
            await asyncio.gather(*(player.call('submit_answer',payload,timeout=20) for _ in range(2)))
            counts.append(await store.llen(f'game_session:{pin}:{index}'))
        out = dict(pin=pin, simultaneous_identical_submissions=2, stored_counts=counts,
                   total_score=await store.hgetall(f'game_session:{pin}:player_scores'))
        Path('/results/fuzz.json').write_text(json.dumps(out,indent=2))
        print(json.dumps(out),flush=True)
    finally:
        await player.disconnect()
        await host.disconnect()
        await store.aclose()


asyncio.run(main())
