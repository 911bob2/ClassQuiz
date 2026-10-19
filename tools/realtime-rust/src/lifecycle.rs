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
/// The lease lasts 15 s and is renewed every 3 s. One slow or failed renewal
/// (a Redis blip, a GC-like stall, a failover) must not kill live rooms, so the
/// process only gives up when the last success is older than this, which still
/// leaves several seconds before the lease can expire under a replacement.
const LEASE_PATIENCE: Duration = Duration::from_secs(10);
async fn give_up(app: &App, reason: &str) -> ! {
    app.healthy.store(false, Ordering::Relaxed);
    tracing::error!("{reason}; closing native connections and exiting");
    let _ = tokio::time::timeout(Duration::from_secs(1), app.io.close()).await;
    std::process::exit(2);
}
pub fn maintain(app: Arc<App>) {
    let expiry = app.clone();
    tokio::spawn(async move {
        let mut last_ok = Instant::now();
        let mut delay = Duration::from_secs(3);
        loop {
            tokio::time::sleep(delay).await;
            match tokio::time::timeout(Duration::from_secs(2), app.store.renew()).await {
                Ok(Ok(Lease::Held)) => {
                    last_ok = Instant::now();
                    delay = Duration::from_secs(3);
                    app.healthy.store(true, Ordering::Relaxed);
                }
                Ok(Ok(Lease::Lost)) => {
                    give_up(&app, "Redis lease is absent or belongs to another process").await
                }
                failed => {
                    let stale = last_ok.elapsed();
                    if stale >= LEASE_PATIENCE {
                        give_up(
                            &app,
                            &format!("lease not renewed for {:.1} s", stale.as_secs_f64()),
                        )
                        .await;
                    }
                    app.healthy.store(false, Ordering::Relaxed);
                    if log_allowed() {
                        match failed {
                            Ok(Err(error)) => {
                                tracing::warn!(%error, "lease renewal failed; retrying")
                            }
                            _ => tracing::warn!("lease renewal timed out; retrying"),
                        }
                    }
                    // Retry sooner so a short outage recovers well inside the lease.
                    delay = Duration::from_secs(1);
                }
            }
        }
    });
    // Expiry maintenance must never delay the lease watchdog.
    tokio::spawn(async move {
        let app = expiry;
        let mut tick = tokio::time::interval(Duration::from_secs(60));
        loop {
            tick.tick().await;
            let rooms: Vec<_> = app.rooms.lock().values().cloned().collect();
            for room in rooms {
                match app.store.game(&room.pin).await {
                    Ok(game) if game["game_id"] == room.game_id => {
                        app.store
                            .refresh_expiry(&room.pin, &room.game_id)
                            .await
                            .ok();
                        // Unreferenced: only the cache and this loop hold it.
                        // Check and removal share one lock so a concurrent
                        // admission cannot be handed a room that is dropped.
                        let unused = {
                            let mut rooms = app.rooms.lock();
                            let unused = rooms.get(&room.pin).is_some_and(|cached| {
                                Arc::ptr_eq(cached, &room) && Arc::strong_count(cached) == 2
                            });
                            if unused {
                                rooms.remove(&room.pin);
                            }
                            unused
                        };
                        if unused {
                            app.forget(&room);
                        }
                    }
                    // A missing key can also be a Redis error; only a definite
                    // replacement or expiry evicts the room.
                    Err(error) if !error.to_string().contains("game_not_found") => {
                        if log_allowed() {
                            tracing::warn!(%error, pin=%room.pin, "room check failed; keeping room");
                        }
                    }
                    _ => {
                        app.evict(&room);
                        app.forget(&room);
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
pub async fn solutions(_: Throttle, socket: SocketRef, State(app): State<Arc<App>>) {
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
