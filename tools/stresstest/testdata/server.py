# SPDX-License-Identifier: MPL-2.0
"""Loopback-only protocol fixture. Does not use ClassQuiz databases or the VM."""
import argparse
import asyncio
import json
import socket
import socketio
import uvicorn

p = argparse.ArgumentParser()
p.add_argument('--scenario', default='normal')
p.add_argument('--users', type=int, default=10)
args = p.parse_args()
sio = socketio.AsyncServer(async_mode='asgi', ping_interval=1, ping_timeout=2,
                          cors_allowed_origins=[], logger=False, engineio_logger=False)
players, names, answers, requests = {}, set(), {}, {}
joins = echoes = rejoins = 0
current = -1
driver = None
questions = [
    {'type':'ABCD','answers':[{'answer':'A'},{'answer':'B'}]},
    {'type':'VOTING','answers':[{'answer':'Red'},{'answer':'Blue'}]},
    {'type':'RANGE','answers':{'min':-5,'max':5}},
    {'type':'TEXT','answers':[{'answer':'secret','case_sensitive':True}]},
    {'type':'ORDER','answers':[{'answer':'First'},{'answer':'Second'},{'answer':'Third'}]},
    {'type':'CHECK','answers':[{'answer':str(i)} for i in range(4)]},
]
for q in questions:
    q.update(time='2', question='Fixture question', image=None)

@sio.event
async def connect(sid, environ, auth):
    await sio.emit('session_id', {'session_id':'opaque-fixture-session'})

@sio.event
async def join_game(sid, data):
    global joins, driver
    if args.scenario == 'reject':
        await sio.emit('game_already_started', room=sid)
        return
    name = data['username']
    assert data['game_pin'] == '001234' and 3 < len(name) <= 17
    if name in names:
        await sio.emit('username_already_exists', room=sid)
        return
    names.add(name); players[sid]=name; joins += 1
    await sio.save_session(sid, {'username':name})
    await sio.emit('joined_game', {'started':False,'cover_image':'cover' if args.scenario=='media' else None}, room=sid)
    await sio.emit('time_sync', 'opaque-time-sync', room=sid)
    await sio.enter_room(sid,'001234')
    if joins >= args.users and driver is None and args.scenario != 'idle':
        driver=asyncio.create_task(host())

@sio.event
async def rejoin_game(sid, data):
    global rejoins
    assert players[data['old_sid']] == data['username'], 'wrong Socket.IO SID for rejoin'
    players[sid]=data['username']; rejoins += 1
    await sio.save_session(sid, {'username':data['username']})
    await sio.emit('time_sync','opaque-time-sync',room=sid)
    await sio.enter_room(sid,'001234')
    await sio.emit('rejoined_game',{'started':True,'cover_image':None},room=sid)

@sio.event
async def echo_time_sync(sid, data):
    global echoes
    assert data == 'opaque-time-sync'
    echoes += 1

@sio.event
async def submit_answer(sid, data):
    index=data['question_index']
    if index != current:
        await sio.emit('question_not_active',room=sid)
        return
    name=(await sio.get_session(sid))['username']
    rows=answers.setdefault(str(index),[])
    if any(a['username']==name for a in rows):
        await sio.emit('already_replied',room=sid)
        return
    assert isinstance(data['answer'], (str,int))
    if questions[index]['type']=='ORDER':
        assert sorted(a['answer'] for a in data['complex_answer'])==['First','Second','Third']
    if questions[index]['type']=='CHECK':
        assert data['answer'] and ''.join(sorted(data['answer']))==data['answer']
    if questions[index]['type']=='RANGE':
        assert -5 <= int(data['answer']) <= 5
    if args.scenario=='loss' and name == sorted(names)[0]:
        return  # Silent storage loss, with no server error event.
    row={'username':name,'answer':str(data['answer']),'right':False,'score':0,'time_taken':1}
    rows.append(row)
    if args.scenario=='duplicates' and name == sorted(names)[0]:
        rows.append(row.copy())
    await sio.emit('player_answer', {})

async def host():
    global current
    await asyncio.sleep(.2)
    assert echoes >= args.users
    await sio.emit('start_game',room='001234')
    if args.scenario in ('reconnect','observer'):
        target_name=players[next(iter(players))]
        for expected in range(1,3 if args.scenario=='reconnect' else 2):
            target=next(s for s,n in reversed(list(players.items()))
                        if n==target_name and sio.manager.eio_sid_from_sid(s,'/'))
            engine_sid=sio.manager.eio_sid_from_sid(target,'/')
            await sio.eio.disconnect(engine_sid)
            for _ in range(100):
                if rejoins>=expected: break
                await asyncio.sleep(.05)
            assert rejoins>=expected, 'bot did not rejoin with its latest SID'
            await asyncio.sleep(.2)
    active_questions=questions if args.scenario not in ('observer','stale') else questions[:1]
    for index,q in enumerate(active_questions):
        current=index
        payload=q.copy()
        if args.scenario=='media':payload['image']='video' if index==2 else 'picture'
        await sio.emit('set_question_number',{'question_index':index,'question':payload},room='001234')
        if args.scenario=='stale':
            await asyncio.sleep(.03)
            await sio.emit('solutions',q,room='001234')
            await asyncio.sleep(.8)
        else:
            for _ in range(100):
                expected=args.users-(1 if args.scenario=='loss' else 0)
                if len(answers.get(str(index),[]))>=expected:break
                await asyncio.sleep(.02)
        await sio.emit('question_results',answers.get(str(index),[]),room='001234')
        await asyncio.sleep(.06)
    await sio.emit('final_results',answers,room='001234')

class HTTP:
    async def __call__(self,scope,receive,send):
        if scope['type']!='http':return
        path=scope['path'];requests[path]=requests.get(path,0)+1
        status=200;headers=[(b'content-type',b'application/json')];body=b''
        if path.startswith('/api/v1/quiz/play/check_captcha/'):
            body=json.dumps({'enabled':False,'game_mode':'normal','custom_field':None}).encode()
        elif path=='/api/v1/users/me':status=401;body=b'{}'
        elif path=='/stats':
            body=json.dumps({'joins':joins,'echoes':echoes,'rejoins':rejoins,'answers':answers,'requests':requests}).encode()
        elif path.startswith('/api/v1/storage/info/'):
            headers=[(b'content-type',b'video/mp4' if path.endswith('/video') else b'image/png')]
        elif path.startswith('/api/v1/storage/download/'):
            status=307;headers=[(b'location',('/objects/'+path.rsplit('/',1)[1]).encode())]
        elif path.startswith('/objects/'):
            video=path.endswith('/video');headers=[(b'content-type',b'video/mp4' if video else b'image/png')]
            if video:
                assert dict(scope['headers']).get(b'range')==b'bytes=0-1048575'
                status=206;body=b'v'*(1<<20);headers.append((b'content-range',b'bytes 0-1048575/2097152'))
            else:body=b'i'*4096
        else:body=b'{}'
        headers.append((b'content-length',str(len(body)).encode()))
        await send({'type':'http.response.start','status':status,'headers':headers})
        await send({'type':'http.response.body','body':body})

sock=socket.socket();sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
sock.bind(('127.0.0.1',0));sock.listen(2048);print(sock.getsockname()[1],flush=True)
app=socketio.ASGIApp(sio,other_asgi_app=HTTP())
async def application(scope, receive, send):
    if args.scenario=='upgrade-reject' and scope['type']=='websocket':
        await send({'type':'websocket.close','code':1008})
        return
    await app(scope,receive,send)
uvicorn.Server(uvicorn.Config(application, log_level='error', lifespan='off')).run(sockets=[sock])
