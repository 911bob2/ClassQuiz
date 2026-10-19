//! Redis owns room state. Every mutation checks the native process lease.
use crate::grading::Answer;
use anyhow::{Result, ensure};
use redis::{AsyncCommands, aio::MultiplexedConnection};
use serde_json::Value;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

pub const OWNER_KEY: &str = "classquiz:rust:owner:v1";
#[derive(Clone)]
pub struct Store {
    connections: Arc<Vec<MultiplexedConnection>>,
    next: Arc<AtomicUsize>,
    owner: String,
    script: redis::Script,
}
impl Store {
    pub async fn new(url: &str, count: usize) -> Result<Self> {
        let client = redis::Client::open(url)?;
        let mut connections = Vec::new();
        for _ in 0..count {
            connections.push(client.get_multiplexed_async_connection().await?);
        }
        let owner = uuid::Uuid::new_v4().to_string();
        let mut acquired = false;
        // A killed owner cannot release its lease. Wait for expiry, never steal.
        for _ in 0..100 {
            let result: Option<String> = redis::cmd("SET")
                .arg(OWNER_KEY)
                .arg(&owner)
                .arg("NX")
                .arg("EX")
                .arg(15)
                .query_async(&mut connections[0])
                .await?;
            if result.is_some() {
                acquired = true;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
        ensure!(
            acquired,
            "another Rust realtime process owns this Redis deployment"
        );
        let code = format!(
            "if redis.call('GET',KEYS[8]) ~= ARGV[11] then return {{-3,0}} end\nif redis.call('GET',KEYS[10]) ~= ARGV[3] then return {{-2,0}} end\nlocal function commit()\n{}\nend\nlocal result=commit(); if result[1]>0 then redis.call('HSET',KEYS[9],ARGV[1],ARGV[7]); redis.call('EXPIRE',KEYS[9],7200) end; return result",
            include_str!("../commit.lua")
        );
        let script = redis::Script::new(&code);
        script
            .prepare_invoke()
            .load_async(&mut connections[0])
            .await?;
        Ok(Self {
            connections: Arc::new(connections),
            next: Arc::new(AtomicUsize::new(0)),
            owner,
            script,
        })
    }
    pub fn connection(&self) -> MultiplexedConnection {
        self.connections[self.next.fetch_add(1, Ordering::Relaxed) % self.connections.len()].clone()
    }
    pub async fn renew(&self) -> Result<()> {
        let ok:i64=redis::Script::new("if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end; return redis.call('EXPIRE',KEYS[1],15)")
            .key(OWNER_KEY).arg(&self.owner).invoke_async(&mut self.connection()).await?;
        ensure!(ok == 1, "lost native ownership lease");
        Ok(())
    }
    pub async fn release(&self) {
        let _:redis::RedisResult<i64>=redis::Script::new("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0")
            .key(OWNER_KEY).arg(&self.owner).invoke_async(&mut self.connection()).await;
    }
    pub async fn game(&self, pin: &str) -> Result<Value> {
        let raw: Option<String> = self.connection().get(format!("game:{pin}")).await?;
        Ok(serde_json::from_str(
            &raw.ok_or_else(|| anyhow::anyhow!("game_not_found"))?,
        )?)
    }
    pub async fn state(&self, pin: &str) -> Result<std::collections::HashMap<String, String>> {
        Ok(self
            .connection()
            .hgetall(format!("game:{pin}:answer_state"))
            .await?)
    }
    pub async fn count(&self, pin: &str, index: usize) -> Result<u64> {
        Ok(self
            .connection()
            .llen(format!("game_session:{pin}:{index}"))
            .await?)
    }
    pub async fn captcha_preflight(
        &self,
        pin: &str,
        name: &str,
        resume: &str,
        max_players: usize,
    ) -> Result<bool> {
        let code: i64 = redis::Script::new(
            r#"
            local raw=redis.call('GET',KEYS[1]); if not raw then return -2 end
            local existing=redis.call('GET',KEYS[2])
            if existing then
                if redis.call('HGET',KEYS[3],ARGV[1])==ARGV[2] and ARGV[2]~='' then return 1 end
                return -1
            end
            if cjson.decode(raw).started then return -3 end
            if redis.call('SCARD',KEYS[4])>=tonumber(ARGV[3]) then return -6 end
            return 0
        "#,
        )
        .key(format!("game:{pin}"))
        .key(format!("game_session:{pin}:players:{name}"))
        .key(format!("game_session:{pin}:resume"))
        .key(format!("game_session:{pin}:players"))
        .arg(name)
        .arg(resume)
        .arg(max_players)
        .invoke_async(&mut self.connection())
        .await?;
        ensure!(
            code >= 0,
            match code {
                -1 => "username_already_exists",
                -2 => "game_not_found",
                -3 => "game_already_started",
                _ => "room_full",
            }
        );
        Ok(code == 1)
    }
    pub async fn captcha_receipt(&self, proof: &str) -> Result<bool> {
        let value: Option<String> = self
            .connection()
            .get(format!("classquiz:captcha:receipt:{proof}"))
            .await?;
        Ok(value.as_deref() == Some(proof))
    }
    pub async fn captcha_claim(&self, game: &Value, token_key: &str, proof: &str) -> Result<bool> {
        let pin = game["game_pin"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("game_not_found"))?;
        let code:i64=redis::Script::new(r#"
            if redis.call('GET',KEYS[1])~=ARGV[1] then return -1 end
            local raw=redis.call('GET',KEYS[2]); if not raw or cjson.decode(raw).game_id~=ARGV[2] then return -1 end
            if redis.call('SET',KEYS[3],ARGV[3],'NX','EX',180) then return 1 end
            return 0
        "#).key(OWNER_KEY).key(format!("game:{pin}")).key(token_key)
            .arg(&self.owner).arg(game["game_id"].as_str().unwrap_or("")).arg(proof).invoke_async(&mut self.connection()).await?;
        ensure!(code >= 0, "captcha_unavailable");
        Ok(code == 1)
    }
    pub async fn captcha_finish(&self, game: &Value, token_key: &str, proof: &str) -> Result<()> {
        let pin = game["game_pin"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("game_not_found"))?;
        let code:i64=redis::Script::new(r#"
            if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
            local raw=redis.call('GET',KEYS[2]); if not raw or cjson.decode(raw).game_id~=ARGV[2] then return 0 end
            if redis.call('GET',KEYS[3])~=ARGV[3] then return 0 end
            redis.call('SET',KEYS[4],ARGV[3],'EX',60); return 1
        "#).key(OWNER_KEY).key(format!("game:{pin}")).key(token_key).key(format!("classquiz:captcha:receipt:{proof}"))
            .arg(&self.owner).arg(game["game_id"].as_str().unwrap_or("")).arg(proof).invoke_async(&mut self.connection()).await?;
        ensure!(code == 1, "captcha_unavailable");
        Ok(())
    }
    pub async fn initialize(&self, pin: &str, generation: &str) -> Result<()> {
        let marker = format!("game:{pin}:rust_generation");
        let previous: Option<String> = self.connection().get(&marker).await?;
        if previous.as_deref() == Some(generation) {
            return Ok(());
        }
        // Fresh generation: purge only this PIN's stale keys, atomically fenced
        // against room replacement. Startup's global lease prevents two owners.
        let mut keys = vec![format!("game_session:{pin}")];
        for pattern in [format!("game_session:{pin}:*"), format!("game:{pin}:*")] {
            let mut cursor = 0u64;
            loop {
                let (next, found): (u64, Vec<String>) = redis::cmd("SCAN")
                    .arg(cursor)
                    .arg("MATCH")
                    .arg(&pattern)
                    .arg("COUNT")
                    .arg(500)
                    .query_async(&mut self.connection())
                    .await?;
                keys.extend(found);
                cursor = next;
                if cursor == 0 {
                    break;
                }
            }
        }
        let script = redis::Script::new(
            r#"
            if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
            local raw=redis.call('GET',KEYS[2]); if not raw or cjson.decode(raw).game_id ~= ARGV[2] then return 0 end
            for i=4,#KEYS do redis.call('DEL',KEYS[i]) end
            redis.call('SET',KEYS[3],ARGV[2],'EX',7200)
            redis.call('SET',KEYS[2]..':generation',ARGV[2],'EX',7200)
            local base='game_session:'..ARGV[3]
            redis.call('SADD',KEYS[2]..':rust_keys',KEYS[2]..':rust_keys',KEYS[3],KEYS[2]..':generation',base..':players',base..':resume',KEYS[2]..':players:custom_fields')
            redis.call('EXPIRE',KEYS[2]..':rust_keys',7200); return 1
        "#,
        );
        let mut invoke = script.prepare_invoke();
        invoke
            .key(OWNER_KEY)
            .key(format!("game:{pin}"))
            .key(&marker)
            .arg(&self.owner)
            .arg(generation)
            .arg(pin);
        for key in keys {
            invoke.key(key);
        }
        let ok: i64 = invoke.invoke_async(&mut self.connection()).await?;
        ensure!(ok == 1, "room generation changed during admission");
        Ok(())
    }
    #[allow(clippy::too_many_arguments)]
    pub async fn commit(
        &self,
        pin: &str,
        game_id: &str,
        index: usize,
        token: &str,
        sid: &str,
        received: f64,
        row: &Answer,
    ) -> Result<(i64, i64)> {
        Ok(self
            .script
            .key(format!("game:{pin}:answer_state"))
            .key(format!("game_session:{pin}:{index}:answered"))
            .key(format!("game_session:{pin}:{index}"))
            .key(format!("game_session:{pin}:player_scores"))
            .key(format!("game_session:{pin}:players"))
            .key(format!("game_session:{pin}:players:{}", row.username))
            .key(format!("game:{pin}"))
            .key(OWNER_KEY)
            .key(format!("game_session:{pin}:{index}:by_player"))
            .key(format!("game:{pin}:generation"))
            .arg(&row.username)
            .arg(sid)
            .arg(game_id)
            .arg(token)
            .arg(index)
            .arg(received)
            .arg(serde_json::to_string(row)?)
            .arg(row.score)
            .arg(7200)
            .arg(1000)
            .arg(&self.owner)
            .invoke_async(&mut self.connection())
            .await?)
    }
    #[allow(clippy::too_many_arguments)]
    pub async fn join(
        &self,
        pin: &str,
        game_id: &str,
        name: &str,
        sid: &str,
        custom: Option<&str>,
        old_sid: Option<&str>,
        resume: Option<&str>,
        max_players: usize,
        captcha_proof: Option<&str>,
    ) -> Result<(String, bool)> {
        let token = resume.map(str::to_owned).unwrap_or_else(|| {
            format!(
                "{}{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            )
        });
        let encoded_name = serde_json::to_string(name)?;
        let row = format!(
            "{{\"username\":{},\"sid\":{}}}",
            encoded_name,
            serde_json::to_string(sid)?
        );
        let code:i64=redis::Script::new(r#"
            if redis.call('GET',KEYS[5]) ~= ARGV[6] then return -5 end
            local raw=redis.call('GET',KEYS[1]); if not raw then return -2 end
            local game=cjson.decode(raw); if game.game_id ~= ARGV[1] then return -2 end
            local existing=redis.call('GET',KEYS[2]); local restored=0
            if existing then
                local saved=redis.call('HGET',KEYS[6],ARGV[2])
                if (not game.captcha_enabled and ARGV[5] ~= '' and existing==ARGV[5]) or (ARGV[8]~='' and saved==ARGV[8]) then
                    restored=1
                    local old='{"username":'..ARGV[10]..',"sid":'..cjson.encode(existing)..'}'
                    local alternate='{"sid":'..cjson.encode(existing)..',"username":'..ARGV[10]..'}'
                    redis.call('SREM',KEYS[3],old,alternate)
                else return -1 end
            else
                if ARGV[5]~='' then return -4 end
                if game.started then return -3 end
                if redis.call('SCARD',KEYS[3])>=tonumber(ARGV[9]) then return -6 end
                if game.captcha_enabled then
                    if ARGV[11]=='' or redis.call('GET',KEYS[8])~=ARGV[11] then return -7 end
                    redis.call('DEL',KEYS[8])
                end
            end
            redis.call('SET',KEYS[2],ARGV[3],'EX',7200)
            redis.call('SADD',KEYS[7],KEYS[2]); redis.call('EXPIRE',KEYS[7],7200)
            redis.call('SADD',KEYS[3],ARGV[4]); redis.call('EXPIRE',KEYS[3],7200)
            redis.call('HSET',KEYS[6],ARGV[2],ARGV[8]); redis.call('EXPIRE',KEYS[6],7200)
            if ARGV[7]~='' then redis.call('HSET',KEYS[4],ARGV[2],ARGV[7]); redis.call('EXPIRE',KEYS[4],7200) end
            return 1+restored
        "#).key(format!("game:{pin}")).key(format!("game_session:{pin}:players:{name}"))
            .key(format!("game_session:{pin}:players")).key(format!("game:{pin}:players:custom_fields"))
            .key(OWNER_KEY).key(format!("game_session:{pin}:resume")).key(format!("game:{pin}:rust_keys"))
            .key(format!("classquiz:captcha:receipt:{}",captcha_proof.unwrap_or("")))
            .arg(game_id).arg(name).arg(sid).arg(row.to_string()).arg(old_sid.unwrap_or(""))
            .arg(&self.owner).arg(custom.unwrap_or("")).arg(&token).arg(max_players).arg(&encoded_name).arg(captcha_proof.unwrap_or(""))
            .invoke_async(&mut self.connection()).await?;
        ensure!(
            code > 0,
            match code {
                -1 => "username_already_exists",
                -7 => "captcha_required",
                -3 => "game_already_started",
                -6 => "room_full",
                _ => "game_not_found",
            }
        );
        Ok((token, code == 2))
    }
    pub async fn transition(
        &self,
        pin: &str,
        game_id: &str,
        phase: &str,
        index: i64,
    ) -> Result<Value> {
        let raw: String = redis::Script::new(include_str!("../transition.lua"))
            .key(OWNER_KEY)
            .key(format!("game:{pin}"))
            .key(format!("game:{pin}:answer_state"))
            .key(format!("game:{pin}:rust_keys"))
            .arg(&self.owner)
            .arg(game_id)
            .arg(phase)
            .arg(index)
            .arg(uuid::Uuid::new_v4().simple().to_string())
            .arg(crate::now_ms())
            .invoke_async(&mut self.connection())
            .await?;
        Ok(serde_json::from_str(&raw)?)
    }
    pub async fn kick(&self, pin: &str, game_id: &str, name: &str) -> Result<()> {
        let ok:i64=redis::Script::new(r#"
            if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
            local raw=redis.call('GET',KEYS[2]); if not raw or cjson.decode(raw).game_id~=ARGV[2] then return 0 end
            local sid=redis.call('GET',KEYS[3])
            redis.call('DEL',KEYS[3]); redis.call('HDEL',KEYS[5],ARGV[3])
            if sid then
                redis.call('SREM',KEYS[4],'{"username":'..ARGV[4]..',"sid":'..cjson.encode(sid)..'}',
                    '{"sid":'..cjson.encode(sid)..',"username":'..ARGV[4]..'}')
            end
            return 1
        "#).key(OWNER_KEY).key(format!("game:{pin}")).key(format!("game_session:{pin}:players:{name}"))
            .key(format!("game_session:{pin}:players")).key(format!("game_session:{pin}:resume"))
            .arg(&self.owner).arg(game_id).arg(name).arg(serde_json::to_string(name)?).invoke_async(&mut self.connection()).await?;
        ensure!(ok == 1, "stale room owner");
        Ok(())
    }
    pub async fn refresh_expiry(&self, pin: &str, game_id: &str) -> Result<()> {
        let script = redis::Script::new(
            r#"
            if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
            local raw=redis.call('GET',KEYS[2]); if not raw or cjson.decode(raw).game_id~=ARGV[2] then return 0 end
            local ttl=redis.call('PTTL',KEYS[2]); if ttl<0 then return 0 end
            for i=3,#KEYS do redis.call('PEXPIRE',KEYS[i],ttl+60000) end; return 1
        "#,
        );
        let keys: Vec<String> = self
            .connection()
            .smembers(format!("game:{pin}:rust_keys"))
            .await?;
        for batch in keys.chunks(256) {
            let mut invoke = script.prepare_invoke();
            invoke
                .key(OWNER_KEY)
                .key(format!("game:{pin}"))
                .arg(&self.owner)
                .arg(game_id);
            for key in batch {
                invoke.key(key);
            }
            let _: i64 = invoke.invoke_async(&mut self.connection()).await?;
        }
        Ok(())
    }
    pub async fn export(&self, pin: &str, game_id: &str, token: &str, history: &str) -> Result<()> {
        let ok:i64=redis::Script::new(r#"
            if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
            local raw=redis.call('GET',KEYS[2]); if not raw or cjson.decode(raw).game_id~=ARGV[2] then return 0 end
            redis.call('SET',KEYS[3],ARGV[3],'EX',7200)
            redis.call('SET',KEYS[3]..':room',ARGV[4],'EX',7200)
            local meta={game=cjson.decode(raw),fields=redis.call('HGETALL',KEYS[4]),scores=redis.call('HGETALL',KEYS[5]),players=redis.call('SMEMBERS',KEYS[6])}
            redis.call('SET',KEYS[3]..':snapshot',cjson.encode(meta),'EX',7200); return 1
        "#).key(OWNER_KEY).key(format!("game:{pin}")).key(format!("export_token:{token}"))
            .key(format!("game:{pin}:players:custom_fields")).key(format!("game_session:{pin}:player_scores")).key(format!("game_session:{pin}:players"))
            .arg(&self.owner).arg(game_id).arg(history).arg(pin).invoke_async(&mut self.connection()).await?;
        ensure!(ok == 1, "stale room owner");
        Ok(())
    }
}
