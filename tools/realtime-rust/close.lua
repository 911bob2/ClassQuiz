
    if redis.call('HGET', KEYS[1], 'game_id') ~= ARGV[1]
       or redis.call('HGET', KEYS[1], 'index') ~= ARGV[2] then return 0 end
    redis.call('HSET', KEYS[1], 'open', '0')
    local raw = redis.call('GET', KEYS[2])
    if raw then
        local game = cjson.decode(raw)
        game.question_show = false
        redis.call('SET', KEYS[2], cjson.encode(game), 'KEEPTTL')
    end
    return 1
