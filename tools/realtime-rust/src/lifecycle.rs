//! Recoverable room projections; Redis is authoritative across process death.
use super::*;

pub async fn restore_round(app: &App, room: &Room) -> Result<()> {
    let state = app.store.state(&room.pin).await?;
    if state.get("game_id") != Some(&room.game_id) {
        return Ok(());
    }
    let index: usize = state.get("index").context("missing index")?.parse()?;
    let question = room.game.lock().await["questions"]
        .get(index)
        .context("missing question")?
        .clone();
    let count = app.store.count(&room.pin, index).await?;
    room.current.store(Some(Arc::new(Round {
        index,
        token: state.get("token").context("missing token")?.clone(),
        duration: question["time"]
            .as_str()
            .context("invalid duration")?
            .parse()?,
        question,
        started_ms: state.get("started_ms").context("missing clock")?.parse()?,
        count: AtomicU64::new(count),
        notified: AtomicU64::new(count),
    })));
    Ok(())
}
pub async fn health(HttpState(app): HttpState<Arc<App>>) -> axum::http::StatusCode {
    if app.healthy.load(Ordering::Relaxed) {
        axum::http::StatusCode::OK
    } else {
        axum::http::StatusCode::SERVICE_UNAVAILABLE
    }
}
pub fn maintain(app: Arc<App>) {
    let expiry = app.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(3));
        loop {
            tick.tick().await;
            if !matches!(
                tokio::time::timeout(Duration::from_secs(2), app.store.renew()).await,
                Ok(Ok(()))
            ) {
                app.healthy.store(false, Ordering::Relaxed);
                tracing::error!("Redis ownership lost; closing native connections and exiting");
                let _ = tokio::time::timeout(Duration::from_secs(1), app.io.close()).await;
                std::process::exit(2);
            }
        }
    });
    // Expiry maintenance must never delay the lease watchdog.
    tokio::spawn(async move {
        let app = expiry;
        let mut tick = tokio::time::interval(Duration::from_secs(60));
        loop {
            tick.tick().await;
            let rooms: Vec<_> = app.rooms.lock().await.values().cloned().collect();
            for room in rooms {
                match app.store.game(&room.pin).await {
                    Ok(game) if game["game_id"] == room.game_id => {
                        app.store
                            .refresh_expiry(&room.pin, &room.game_id)
                            .await
                            .ok();
                        let mut rooms = app.rooms.lock().await;
                        if rooms.get(&room.pin).is_some_and(|cached| {
                            Arc::ptr_eq(cached, &room) && Arc::strong_count(cached) == 2
                        }) {
                            rooms.remove(&room.pin);
                        }
                    }
                    _ => {
                        for p in room.players.iter() {
                            p.socket.clone().disconnect().ok();
                        }
                        if let Some(host) = room.host.lock().take() {
                            host.disconnect().ok();
                        }
                        app.rooms.lock().await.remove(&room.pin);
                    }
                }
            }
        }
    });
}
pub async fn snapshot(app: &App, socket: &SocketRef) -> Result<()> {
    let session = socket.extensions.get::<Session>().context("not admitted")?;
    let room = &session.room;
    let game = app.store.game(&room.pin).await?;
    ensure!(game["game_id"] == room.game_id, "room replaced");
    let phase = game["realtime_phase"]
        .as_str()
        .unwrap_or(if game["started"] == true {
            "intro"
        } else {
            "lobby"
        });
    let state = app.store.state(&room.pin).await?;
    let index = game["current_question"].as_i64().unwrap_or(-1);
    let mut data = json!({"phase":phase,"started":game["started"],"question_index":index,"answer_count":0,"remaining_ms":0,"answered":false});
    if index >= 0 {
        let count = app.store.count(&room.pin, index as usize).await?;
        data["answer_count"] = json!(count);
        data["question"] = grading::public_question(&game["questions"][index as usize]);
        data["question_token"] = json!(state.get("token"));
        if state.get("open").is_some_and(|v| v == "1") {
            data["remaining_ms"] = json!(
                (state
                    .get("deadline_ms")
                    .and_then(|v| v.parse::<f64>().ok())
                    .unwrap_or(0.0)
                    - now_ms())
                .max(0.0)
            );
        }
        if let Some(name) = &session.name {
            let row: Option<String> = app
                .store
                .connection()
                .hget(format!("game_session:{}:{index}:by_player", room.pin), name)
                .await?;
            data["answered"] = json!(row.is_some());
        }
        if phase == "solutions" {
            data["solution"] = game["questions"][index as usize].clone();
        }
    }
    if session.admin {
        let players: Vec<String> = app
            .store
            .connection()
            .smembers(format!("game_session:{}:players", room.pin))
            .await?;
        data["players"] = json!(
            players
                .iter()
                .map(|p| serde_json::from_str::<Value>(p))
                .collect::<std::result::Result<Vec<_>, _>>()?
        );
        let (mut scores, rows): (HashMap<String, i64>, Vec<String>) = redis::pipe()
            .atomic()
            .hgetall(format!("game_session:{}:player_scores", room.pin))
            .lrange(format!("game_session:{}:{index}", room.pin), 0, -1)
            .query_async(&mut app.store.connection())
            .await?;
        // The existing host view animates the current question's points on top
        // of this base. Recover the base, not already-added cumulative totals.
        for raw in rows {
            let row: Answer = serde_json::from_str(&raw)?;
            *scores.entry(row.username).or_default() -= row.score;
        }
        data["player_scores"] = json!(scores);
    }
    emit(app, socket, "room_state", &data);
    if phase == "results" || phase == "final" {
        results::resume(app, &session, socket).await?;
    }
    Ok(())
}
pub async fn solutions(socket: SocketRef, State(app): State<Arc<App>>) {
    let result: Result<()> = async {
        let session = host(&socket)?;
        let room = &session.room;
        let _guard = room.control.write().await;
        let index = room.game.lock().await["current_question"]
            .as_i64()
            .context("missing index")?;
        let game = app
            .store
            .transition(&room.pin, &room.game_id, "solutions", index)
            .await?;
        let question = game["questions"]
            .get(index as usize)
            .context("invalid index")?
            .clone();
        *room.game.lock().await = game;
        app.broadcast(room, "solutions", &question).await;
        Ok(())
    }
    .await;
    if let Err(error) = result {
        failure(&app, &socket, error);
    }
}
