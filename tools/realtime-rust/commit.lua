
    if redis.call('EXISTS', KEYS[7]) == 0
       or redis.call('GET', KEYS[6]) ~= ARGV[2]
       or redis.call('HGET', KEYS[1], 'game_id') ~= ARGV[3]
       or redis.call('HGET', KEYS[1], 'token') ~= ARGV[4]
       or redis.call('HGET', KEYS[1], 'index') ~= ARGV[5] then
        return {-2, 0}
    end
    if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return {-1, 0} end
    if redis.call('HGET', KEYS[1], 'open') ~= '1'
       or tonumber(ARGV[6]) < tonumber(redis.call('HGET', KEYS[1], 'started_ms'))
       or tonumber(ARGV[6]) > tonumber(redis.call('HGET', KEYS[1], 'deadline_ms')) + tonumber(ARGV[10]) then
        return {-2, 0}
    end
    redis.call('SADD', KEYS[2], ARGV[1])
    local count = redis.call('RPUSH', KEYS[3], ARGV[7])
    redis.call('HINCRBY', KEYS[4], ARGV[1], ARGV[8])
    for i = 1, 4 do redis.call('EXPIRE', KEYS[i], ARGV[9]) end
    local players = redis.call('SCARD', KEYS[5])
    if count == players then
        redis.call('HSET', KEYS[1], 'open', '0')
        local game = cjson.decode(redis.call('GET', KEYS[7]))
        game.question_show = false
        redis.call('SET', KEYS[7], cjson.encode(game), 'EX', ARGV[9])
    end
    return {count, players}
