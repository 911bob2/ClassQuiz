//! Bounded player payloads, full host exports, and one shared recovery projection.
use super::*;

#[derive(Serialize, Clone)]
struct Standing {
    username: String,
    score: i64,
    rank: usize,
}
pub struct ResultCache {
    index: usize,
    final_screen: bool,
    history: BTreeMap<String, Vec<Answer>>,
    ranked: Vec<Standing>,
    rank_index: HashMap<String, usize>,
    answers: HashMap<String, Answer>,
    question_scores: HashMap<String, BTreeMap<String, i64>>,
}
fn standings(scores: HashMap<String, i64>) -> Vec<Standing> {
    let mut rows: Vec<_> = scores.into_iter().collect();
    rows.sort_unstable_by(|a, b| {
        b.1.cmp(&a.1)
            .then_with(|| a.0.encode_utf16().cmp(b.0.encode_utf16()))
    });
    rows.into_iter()
        .enumerate()
        .map(|(i, (username, score))| Standing {
            username,
            score,
            rank: i + 1,
        })
        .collect()
}
async fn history(app: &App, room: &Room) -> Result<BTreeMap<String, Vec<Answer>>> {
    let count = room.game.lock().await["questions"]
        .as_array()
        .context("missing questions")?
        .len();
    let mut pipe = redis::pipe();
    for i in 0..count {
        pipe.lrange(format!("game_session:{}:{i}", room.pin), 0, -1);
    }
    let raw: Vec<Vec<String>> = pipe.query_async(&mut app.store.connection()).await?;
    let mut result = BTreeMap::new();
    for (i, rows) in raw.iter().enumerate() {
        if !rows.is_empty() {
            result.insert(
                i.to_string(),
                rows.iter()
                    .map(|r| serde_json::from_str(r))
                    .collect::<std::result::Result<_, _>>()?,
            );
        }
    }
    Ok(result)
}
async fn cache(app: &App, room: &Room) -> Result<Arc<ResultCache>> {
    let mut slot = room.result_cache.lock().await;
    if let Some(value) = &*slot {
        return Ok(value.clone());
    }
    let game = app.store.game(&room.pin).await?;
    let index = game["current_question"].as_i64().unwrap_or(0).max(0) as usize;
    let final_screen = game["realtime_phase"] == "final";
    let history = if final_screen {
        history(app, room).await?
    } else {
        let raw: Vec<String> = app
            .store
            .connection()
            .lrange(format!("game_session:{}:{index}", room.pin), 0, -1)
            .await?;
        BTreeMap::from([(
            index.to_string(),
            raw.iter()
                .map(|r| serde_json::from_str(r))
                .collect::<std::result::Result<Vec<Answer>, _>>()?,
        )])
    };
    let players: Vec<String> = app
        .store
        .connection()
        .smembers(format!("game_session:{}:players", room.pin))
        .await?;
    let mut scores = HashMap::<String, i64>::new();
    for raw in players {
        scores.insert(
            serde_json::from_str::<Value>(&raw)?["username"]
                .as_str()
                .context("invalid roster")?
                .to_owned(),
            0,
        );
    }
    let mut question_scores: HashMap<String, BTreeMap<String, i64>> = HashMap::new();
    for (i, rows) in &history {
        for row in rows {
            if final_screen {
                *scores.entry(row.username.clone()).or_default() += row.score;
            }
            question_scores
                .entry(row.username.clone())
                .or_default()
                .insert(i.clone(), row.score);
        }
    }
    if !final_screen {
        let recorded: HashMap<String, i64> = app
            .store
            .connection()
            .hgetall(format!("game_session:{}:player_scores", room.pin))
            .await?;
        scores.extend(recorded);
    }
    let answers = history
        .get(&index.to_string())
        .into_iter()
        .flatten()
        .map(|r| (r.username.clone(), r.clone()))
        .collect();
    let ranked = standings(scores);
    let rank_index = ranked
        .iter()
        .enumerate()
        .map(|(i, r)| (r.username.clone(), i))
        .collect();
    let value = Arc::new(ResultCache {
        index,
        final_screen,
        history,
        ranked,
        rank_index,
        answers,
        question_scores,
    });
    *slot = Some(value.clone());
    Ok(value)
}
fn deliver(app: &App, cache: &ResultCache, socket: &SocketRef, name: Option<&str>) {
    if let Some(name) = name {
        let Some(index) = cache.rank_index.get(name) else {
            return;
        };
        let score = &cache.ranked[*index];
        if cache.final_screen {
            emit(
                app,
                socket,
                "personal_final_results",
                &json!({"version":1,"username":name,"score":score.score,"rank":score.rank,
                "player_count":cache.ranked.len(),"leaderboard":&cache.ranked[..cache.ranked.len().min(10)],
                "question_scores":cache.question_scores.get(name).cloned().unwrap_or_default()}),
            );
        } else {
            emit(
                app,
                socket,
                "personal_question_results",
                &json!({"version":1,"question_index":cache.index,"answer":cache.answers.get(name),
                "username":name,"score":score.score,"rank":score.rank,"player_count":cache.ranked.len()}),
            );
        }
    } else {
        emit(
            app,
            socket,
            if cache.final_screen {
                "final_results"
            } else {
                "question_results"
            },
            &host_page(cache, 0),
        );
    }
}
fn host_page(cache: &ResultCache, page: usize) -> Value {
    let count = cache.ranked.len();
    let page = page.min(count.saturating_sub(1) / 50);
    let rows:Vec<_>=cache.ranked.iter().skip(page*50).take(50).map(|r|json!({
        "username":r.username,"score":r.score,"rank":r.rank,
        "answer":if cache.final_screen {None} else {cache.answers.get(&r.username).map(|a|a.answer.chars().take(256).collect::<String>())}
    })).collect();
    let counts: BTreeMap<_, _> = cache
        .history
        .iter()
        .map(|(i, rows)| (i, rows.len()))
        .collect();
    json!({"native_summary":true,"final":cache.final_screen,"question_index":cache.index,"page":page,"page_size":50,
        "player_count":count,"rows":rows,"answer_counts":counts})
}
#[derive(Deserialize)]
pub struct Page {
    page: usize,
}
pub async fn page(
    _: Throttle,
    socket: SocketRef,
    Data(data): Data<Page>,
    State(app): State<Arc<App>>,
) {
    let result: Result<()> = async {
        let session = host(&socket)?;
        let _guard = session.room.control.read().await;
        let phase = session.room.game.lock().await["realtime_phase"].clone();
        ensure!(
            phase == "results" || phase == "final",
            "results not available"
        );
        let value = cache(&app, &session.room).await?;
        emit(
            &app,
            &socket,
            "host_results_page",
            &host_page(&value, data.page),
        );
        Ok(())
    }
    .await;
    if let Err(error) = result {
        failure(&app, &socket, error);
    }
}
pub async fn resume(app: &App, session: &Session, socket: &SocketRef) -> Result<()> {
    let value = cache(app, &session.room).await?;
    deliver(app, &value, socket, session.name.as_deref());
    Ok(())
}
async fn publish(app: &App, room: &Room) -> Result<()> {
    let value = cache(app, room).await?;
    if let Some(host) = room.host.lock().clone() {
        deliver(app, &value, &host, None);
    }
    for player in room.players.iter() {
        deliver(app, &value, &player.socket, Some(player.key()));
    }
    Ok(())
}
pub async fn reveal(
    _: Throttle,
    socket: SocketRef,
    Data(data): Data<QuestionResults>,
    ack: AckSender,
    State(app): State<Arc<App>>,
) {
    let result: Result<()> = async {
        let session = host(&socket)?;
        let room = &session.room;
        let _guard = room.control.write().await;
        let index: usize = match data.question_number {
            Value::String(v) => v.parse()?,
            Value::Number(v) => v.as_u64().context("invalid index")? as usize,
            _ => anyhow::bail!("invalid index"),
        };
        let game = app
            .store
            .transition(&room.pin, &room.game_id, "results", index as i64)
            .await?;
        *room.game.lock().await = game;
        *room.result_cache.lock().await = None;
        publish(&app, room).await
    }
    .await;
    match result {
        Ok(()) => {
            ack.send(&json!(null)).ok();
        }
        Err(error) => failure(&app, &socket, error),
    }
}
pub async fn finals(_: Throttle, socket: SocketRef, State(app): State<Arc<App>>) {
    let result: Result<()> = async {
        let session = host(&socket)?;
        let room = &session.room;
        let _guard = room.control.write().await;
        let game = app
            .store
            .transition(&room.pin, &room.game_id, "final", -1)
            .await?;
        *room.game.lock().await = game;
        *room.result_cache.lock().await = None;
        publish(&app, room).await
    }
    .await;
    if let Err(error) = result {
        failure(&app, &socket, error);
    }
}
pub async fn export(_: Throttle, socket: SocketRef, State(app): State<Arc<App>>) {
    let result: Result<()> = async {
        let session = host(&socket)?;
        let room = &session.room;
        let _guard = room.control.read().await;
        let token = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        app.store
            .export(
                &room.pin,
                &room.game_id,
                &token,
                &serde_json::to_string(&history(&app, room).await?)?,
            )
            .await?;
        emit(&app, &socket, "export_token", &token);
        Ok(())
    }
    .await;
    if let Err(error) = result {
        failure(&app, &socket, error);
    }
}
pub async fn kick(
    _: Throttle,
    socket: SocketRef,
    Data(data): Data<Value>,
    State(app): State<Arc<App>>,
) {
    let result: Result<()> = async {
        let session = host(&socket)?;
        let room = &session.room;
        let _guard = room.control.write().await;
        let name = data["username"].as_str().context("missing username")?;
        app.store.kick(&room.pin, &room.game_id, name).await?;
        if let Some((_, player)) = room.players.remove(name) {
            emit(&app, &player.socket, "kick", &json!({}));
            player.socket.disconnect().ok();
        }
        *room.result_cache.lock().await = None;
        Ok(())
    }
    .await;
    if let Err(error) = result {
        failure(&app, &socket, error);
    }
}
