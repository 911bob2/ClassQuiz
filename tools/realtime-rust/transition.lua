-- Control state, deadline and generation change together; never reset on resume.
if redis.call('GET',KEYS[1])~=ARGV[1] then return redis.error_reply('owner lost') end
local raw=redis.call('GET',KEYS[2])
if not raw then return redis.error_reply('game_not_found') end
local game=cjson.decode(raw)
if game.game_id~=ARGV[2] then return redis.error_reply('room replaced') end
local phase=ARGV[3]; local index=tonumber(ARGV[4])
if game.realtime_phase=='final' and phase~='final' then return redis.error_reply('game already finished') end
if phase=='intro' then
    if game.started then return raw end
    game.started=true
elseif phase=='question' then
    if not game.started or index<0 or index>=#game.questions then return redis.error_reply('invalid question') end
    if game.current_question==index and game.realtime_phase=='question' then return raw end
    if index<=game.current_question then return redis.error_reply('question already played') end
    local q=game.questions[index+1]; local duration=tonumber(q.time)
    if not duration or duration<1 or duration>3600 then return redis.error_reply('invalid duration') end
    game.current_question=index; game.question_show=q.type~='SLIDE'
    redis.call('HSET',KEYS[3],'game_id',ARGV[2],'index',index,'token',ARGV[5],
        'open',q.type=='SLIDE' and '0' or '1','started_ms',ARGV[6],'deadline_ms',tonumber(ARGV[6])+duration*1000)
    redis.call('EXPIRE',KEYS[3],7200)
    local prefix='game_session:'..game.game_pin..':'..index
    redis.call('SADD',KEYS[4],KEYS[3],prefix,prefix..':answered',prefix..':by_player','game_session:'..game.game_pin..':player_scores')
    redis.call('EXPIRE',KEYS[4],7200)
elseif phase=='solutions' or phase=='results' or phase=='final' then
    if phase~='final' and index<0 then return redis.error_reply('no active question') end
    if phase~='final' and game.current_question~=index then return redis.error_reply('stale control') end
    if redis.call('HGET',KEYS[3],'game_id')==ARGV[2] then redis.call('HSET',KEYS[3],'open','0') end
    game.question_show=false
else return redis.error_reply('invalid phase') end
game.realtime_phase=phase
raw=cjson.encode(game); redis.call('SET',KEYS[2],raw,'EX',7200)
return raw
