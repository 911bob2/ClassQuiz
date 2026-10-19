//! Python-supervised huge-room prototype. No per-answer Python RPC.
mod captcha;
mod grading;
mod lifecycle;
mod results;
mod store;
use anyhow::{Context, Result, ensure};
use arc_swap::ArcSwapOption;
use axum::serve::ListenerExt;
use axum::{Json, Router, extract::State as HttpState, routing::get};
use clap::Parser;
use dashmap::DashMap;
use grading::{Answer, Submission};
use hdrhistogram::Histogram;
use parking_lot::Mutex;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use socketioxide::handler::ConnectHandler;
use socketioxide::{
    SocketIo,
    extract::{AckSender, Data, Extension as State, SocketRef},
};
use std::{
    collections::{BTreeMap, HashMap},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use store::Store;
use tokio::sync::{Mutex as AsyncMutex, RwLock, Semaphore};

#[derive(Parser)]
struct Options {
    #[arg(long, default_value = "127.0.0.1:8081")]
    listen: String,
    #[arg(long, env = "CLASSQUIZ_REDIS", default_value = "redis://127.0.0.1/0")]
    redis: String,
    #[arg(long, default_value_t = 4)]
    threads: usize,
    #[arg(long, default_value_t = 8)]
    redis_connections: usize,
    #[arg(long, default_value_t = 250)]
    count_ms: u64,
    #[arg(long, default_value_t = 30000)]
    max_players: usize,
    #[arg(long, env = "CLASSQUIZ_ORIGIN")]
    origin: Option<String>,
}
#[derive(Clone)]
struct Session {
    room: Arc<Room>,
    name: Option<String>,
    admin: bool,
    host_client: Option<String>,
}
#[derive(Clone)]
struct Player {
    socket: SocketRef,
}
struct Round {
    index: usize,
    token: String,
    question: Value,
    started_ms: f64,
    duration: f64,
    count: AtomicU64,
    notified: AtomicU64,
}
struct Room {
    pin: String,
    game_id: String,
    game: AsyncMutex<Value>,
    host: Mutex<Option<SocketRef>>,
    players: DashMap<String, Player>,
    current: ArcSwapOption<Round>,
    control: RwLock<()>,
    result_cache: AsyncMutex<Option<Arc<results::ResultCache>>>,
}
#[derive(Default)]
struct Counters {
    accepted: AtomicU64,
    rejected: AtomicU64,
    errors: AtomicU64,
    emit_errors: AtomicU64,
    connected: AtomicU64,
    joined: AtomicU64,
}
struct App {
    store: Store,
    rooms: AsyncMutex<HashMap<String, Arc<Room>>>,
    io: SocketIo,
    stats: Counters,
    latency: Mutex<Histogram<u64>>,
    inflight: Arc<Semaphore>,
    healthy: AtomicBool,
    max_players: usize,
    admission: Semaphore,
    captcha: captcha::Captcha,
}
fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs_f64()
        * 1000.0
}
fn emit<T: Serialize + ?Sized>(app: &App, socket: &SocketRef, event: &str, data: &T) {
    if let Err(error) = socket.emit(event, data) {
        app.stats.emit_errors.fetch_add(1, Ordering::Relaxed);
        tracing::warn!(event, %error, "emit failed (closed connection or bounded queue)");
        socket.clone().disconnect().ok();
    }
}
fn failure(app: &App, socket: &SocketRef, error: anyhow::Error) {
    app.stats.errors.fetch_add(1, Ordering::Relaxed);
    tracing::warn!(sid=%socket.id,%error,"handler failed");
    emit(app, socket, "error", &json!({"message":error.to_string()}));
}
impl App {
    async fn room(&self, pin: &str) -> Result<Arc<Room>> {
        ensure!(
            (4..=16).contains(&pin.len()) && pin.bytes().all(|c| c.is_ascii_digit()),
            "invalid room code"
        );
        let game = self.store.game(pin).await?;
        let mut rooms = self.rooms.lock().await;
        if let Some(room) = rooms.get(pin) {
            if game["game_id"] == room.game_id {
                return Ok(room.clone());
            }
            for player in room.players.iter() {
                player.socket.clone().disconnect().ok();
            }
            if let Some(host) = room.host.lock().take() {
                host.disconnect().ok();
            }
            rooms.remove(pin);
        }
        ensure!(rooms.len() < 256, "prototype room limit");
        ensure!(
            game["large_audience"] == true && game["realtime_engine"] == "rust",
            "room belongs to the Python engine"
        );
        ensure!(
            game["game_mode"].as_str().unwrap_or("kahoot") == "kahoot",
            "prototype supports kahoot mode"
        );
        let game_id = game["game_id"]
            .as_str()
            .context("missing room generation")?
            .to_owned();
        self.store.initialize(pin, &game_id).await?;
        let room = Arc::new(Room {
            pin: pin.to_owned(),
            game_id,
            game: AsyncMutex::new(game),
            host: Mutex::new(None),
            players: DashMap::new(),
            current: ArcSwapOption::empty(),
            control: RwLock::new(()),
            result_cache: AsyncMutex::new(None),
        });
        lifecycle::restore_round(self, &room).await?;
        rooms.insert(pin.to_owned(), room.clone());
        Ok(room)
    }
    async fn broadcast<T: Serialize + ?Sized>(&self, room: &Room, event: &str, data: &T) {
        if let Err(error) = self.io.to(room.pin.clone()).emit(event, data).await {
            self.stats.emit_errors.fetch_add(1, Ordering::Relaxed);
            tracing::warn!(%error,event,"broadcast failed");
        }
    }
}
#[derive(Deserialize)]
struct Join {
    game_pin: String,
    username: String,
    custom_field: Option<String>,
    old_sid: Option<String>,
    resume_token: Option<String>,
    captcha: Option<String>,
}
#[derive(Deserialize)]
struct Admin {
    game_pin: String,
    game_id: String,
    client_id: Option<String>,
}
#[derive(Deserialize)]
struct QuestionResults {
    question_number: Value,
}
#[derive(Clone)]
struct SyncChallenge {
    nonce: String,
    at: Instant,
}
#[derive(Clone)]
struct Ping(f64);
#[derive(Clone)]
struct SubmissionBudget(Arc<Mutex<(Instant, u32)>>);
#[derive(Clone)]
struct Admission(Arc<AsyncMutex<()>>);
#[derive(Clone)]
struct CaptchaAttempt(Arc<Mutex<Option<Instant>>>);

async fn join(socket: SocketRef, Data(data): Data<Join>, State(app): State<Arc<App>>) {
    if let Err(error) = join_inner(&socket, &data, &app).await {
        let event = error.to_string();
        if event.starts_with("captcha_") {
            emit(
                app.as_ref(),
                &socket,
                "captcha_error",
                &json!({"code":event,"retry_after_ms":1000}),
            );
        } else if [
            "username_already_exists",
            "game_already_started",
            "game_not_found",
            "room_full",
        ]
        .contains(&event.as_str())
        {
            emit(&app, &socket, &event, &json!({}));
        } else {
            failure(&app, &socket, error);
        }
    }
}
async fn join_inner(socket: &SocketRef, data: &Join, app: &App) -> Result<()> {
    let mut capacity = Some(app.admission.acquire().await?);
    let admission = socket
        .extensions
        .get::<Admission>()
        .context("admission unavailable")?;
    let _connection = admission
        .0
        .try_lock()
        .map_err(|_| anyhow::anyhow!("captcha_busy"))?;
    ensure!(
        socket.extensions.get::<Session>().is_none(),
        "already admitted"
    );
    ensure!(
        !data.username.is_empty() && data.username.len() <= 128,
        "invalid username"
    );
    let room = app.room(&data.game_pin).await?;
    ensure!(
        socket.extensions.get::<Session>().is_none(),
        "already admitted"
    );
    ensure!(
        data.custom_field.as_ref().is_none_or(|v| v.len() <= 1024),
        "custom field too long"
    );
    ensure!(
        data.resume_token
            .as_ref()
            .is_none_or(|v| v.len() >= 32 && v.len() <= 128),
        "invalid resume token"
    );
    let sid = socket.id.to_string();
    let game = {
        let g = room.game.lock().await;
        json!({"game_id":g["game_id"],"game_pin":room.pin,"captcha_enabled":g["captcha_enabled"],"captcha_policy":g["captcha_policy"]})
    };
    let mut proof = None;
    if game["captcha_enabled"] == true {
        let resume = data
            .resume_token
            .as_deref()
            .filter(|s| s.len() >= 32)
            .context("captcha_required")?;
        if !app
            .store
            .captcha_preflight(&room.pin, &data.username, resume, app.max_players)
            .await?
        {
            drop(capacity.take());
            let attempts = socket
                .extensions
                .get::<CaptchaAttempt>()
                .context("captcha_unavailable")?;
            {
                let mut last = attempts.0.lock();
                ensure!(
                    last.is_none_or(|t| t.elapsed() >= Duration::from_secs(1)),
                    "captcha_busy"
                );
                *last = Some(Instant::now());
            }
            proof = Some(
                app.captcha
                    .verify(
                        &app.store,
                        &game,
                        &data.username,
                        resume,
                        data.captcha.as_deref(),
                    )
                    .await?,
            );
        }
    }
    let _capacity = match capacity {
        Some(permit) => permit,
        None => app.admission.acquire().await?,
    };
    let _control = room.control.read().await;
    let (resume_token, restored) = app
        .store
        .join(
            &room.pin,
            &room.game_id,
            &data.username,
            &sid,
            data.custom_field.as_deref(),
            data.old_sid.as_deref(),
            data.resume_token.as_deref(),
            app.max_players,
            proof.as_deref(),
        )
        .await?;
    socket.extensions.insert(Session {
        room: room.clone(),
        name: Some(data.username.clone()),
        admin: false,
        host_client: None,
    });
    if let Some(previous) = room.players.insert(
        data.username.clone(),
        Player {
            socket: socket.clone(),
        },
    ) {
        previous.socket.leave(room.pin.clone());
    }
    socket.join(room.pin.clone());
    let mut player_data = app.store.game(&room.pin).await?;
    let count = player_data["questions"].as_array().unwrap().len();
    for key in ["quiz_id", "questions", "user_id", "game_id"] {
        player_data.as_object_mut().unwrap().remove(key);
    }
    player_data["question_count"] = json!(count);
    player_data["resume_token"] = json!(resume_token);
    emit(
        app,
        socket,
        if data.old_sid.is_some() {
            "rejoined_game"
        } else {
            "joined_game"
        },
        &player_data,
    );
    let nonce = uuid::Uuid::new_v4().to_string();
    socket.extensions.insert(SyncChallenge {
        nonce: nonce.clone(),
        at: Instant::now(),
    });
    emit(app, socket, "time_sync", &nonce);
    if !restored && let Some(host) = room.host.lock().clone() {
        emit(
            app,
            &host,
            "player_joined",
            &json!({"username":data.username,"sid":sid}),
        );
    }
    app.stats.joined.fetch_add(1, Ordering::Relaxed);
    if restored || player_data["started"] == true {
        lifecycle::snapshot(app, socket).await?;
    }
    Ok(())
}
async fn register(socket: SocketRef, Data(data): Data<Admin>, State(app): State<Arc<App>>) {
    let result: Result<()> = async {
        let _capacity = app.admission.acquire().await?;
        let admission = socket
            .extensions
            .get::<Admission>()
            .context("admission unavailable")?;
        let _connection = admission.0.lock().await;
        ensure!(
            socket.extensions.get::<Session>().is_none(),
            "already admitted"
        );
        let room = app.room(&data.game_pin).await?;
        let _control = room.control.read().await;
        ensure!(
            socket.extensions.get::<Session>().is_none(),
            "already admitted"
        );
        ensure!(room.game_id == data.game_id, "invalid host secret");
        ensure!(
            data.client_id
                .as_ref()
                .is_none_or(|v| v.len() >= 16 && v.len() <= 128),
            "invalid host client"
        );
        {
            let mut host = room.host.lock();
            if let Some(previous) = host.as_ref().filter(|s| s.id != socket.id) {
                ensure!(
                    data.client_id.is_some()
                        && previous
                            .extensions
                            .get::<Session>()
                            .is_some_and(|s| s.host_client == data.client_id),
                    "already_registered_as_admin"
                );
                previous.extensions.remove::<Session>();
                emit(&app, previous, "host_replaced", &json!({}));
                previous.clone().disconnect().ok();
            }
            *host = Some(socket.clone());
        }
        socket.extensions.insert(Session {
            room: room.clone(),
            name: None,
            admin: true,
            host_client: data.client_id.clone(),
        });
        socket.join(room.pin.clone());
        socket.join(format!("admin:{}", room.pin));
        emit(
            &app,
            &socket,
            "registered_as_admin",
            &json!({"game_id":room.game_id,"game":room.game.lock().await.to_string()}),
        );
        lifecycle::snapshot(&app, &socket).await?;
        Ok(())
    }
    .await;
    if let Err(error) = result {
        failure(&app, &socket, error);
    }
}
async fn sync_echo(socket: SocketRef, Data(nonce): Data<String>) {
    if let Some(challenge) = socket.extensions.get::<SyncChallenge>()
        && challenge.nonce == nonce
    {
        socket.extensions.insert(Ping(
            (challenge.at.elapsed().as_secs_f64() * 1000.0).clamp(0.0, 1000.0),
        ));
        socket.extensions.remove::<SyncChallenge>();
    }
}
fn host(socket: &SocketRef) -> Result<Session> {
    let session = socket
        .extensions
        .get::<Session>()
        .context("not registered")?;
    ensure!(session.admin, "host required");
    Ok(session)
}
async fn start(socket: SocketRef, State(app): State<Arc<App>>) {
    let result: Result<()> = async {
        let session = host(&socket)?;
        let room = &session.room;
        let _guard = room.control.write().await;
        let game = app
            .store
            .transition(&room.pin, &room.game_id, "intro", -1)
            .await?;
        if let Some(user) = game["user_id"].as_str() {
            let _: () = app
                .store
                .connection()
                .del(format!("game_in_lobby:{}", user.replace('-', "")))
                .await?;
        }
        *room.game.lock().await = game;
        app.broadcast(room, "start_game", &json!(null)).await;
        Ok(())
    }
    .await;
    if let Err(error) = result {
        failure(&app, &socket, error);
    }
}
async fn open(socket: SocketRef, Data(index): Data<String>, State(app): State<Arc<App>>) {
    let result: Result<()> = async {
        let session = host(&socket)?;
        let room = &session.room;
        let _guard = room.control.write().await;
        let index: usize = index.parse()?;
        let repeated = room
            .current
            .load_full()
            .is_some_and(|round| round.index == index);
        let game = app
            .store
            .transition(&room.pin, &room.game_id, "question", index as i64)
            .await?;
        if repeated {
            lifecycle::snapshot(&app, &socket).await?;
            return Ok(());
        }
        let question = game["questions"]
            .get(index)
            .context("invalid question")?
            .clone();
        *room.game.lock().await = game;
        *room.result_cache.lock().await = None;
        lifecycle::restore_round(&app, room).await?;
        let round = room.current.load_full().context("missing round state")?;
        let token = &round.token;
        if question["type"] == "SLIDE" {
            emit(
                &app,
                &socket,
                "set_question_number",
                &json!({"question_index": index}),
            );
        } else {
            app.broadcast(
                room,
                "set_question_number",
                &json!({
                    "question_index": index,
                    "question_token": token,
                    "question": grading::public_question(&question),
                }),
            )
            .await;
        }
        Ok(())
    }
    .await;
    if let Err(error) = result {
        failure(&app, &socket, error);
    }
}
async fn submit(socket: SocketRef, Data(data): Data<Submission>, State(app): State<Arc<App>>) {
    if let Some(budget) = socket.extensions.get::<SubmissionBudget>() {
        let mut value = budget.0.lock();
        if value.0.elapsed() >= Duration::from_secs(1) {
            *value = (Instant::now(), 0);
        }
        if value.1 >= 128 {
            emit(
                &app,
                &socket,
                "rate_limited",
                &json!({"retry_after_ms":1000}),
            );
            return;
        }
        value.1 += 1;
    }
    let received = now_ms();
    let at = Instant::now();
    let result: Result<()> = async {
        let _permit = app
            .inflight
            .clone()
            .try_acquire_owned()
            .context("answer capacity exceeded")?;
        let session = socket
            .extensions
            .get::<Session>()
            .context("player not registered")?;
        ensure!(!session.admin, "players only");
        let room = &session.room;
        let name = session.name.as_ref().context("missing name")?;
        let Some(round) = room.current.load_full() else {
            emit(&app, &socket, "question_not_active", &json!({}));
            return Ok(());
        };
        if round.index != data.question_index
            || data
                .question_token
                .as_deref()
                .is_some_and(|t| t != round.token)
            || round.question["type"] == "SLIDE"
        {
            emit(&app, &socket, "question_not_active", &json!({}));
            return Ok(());
        }
        let (right, answer) = grading::grade(&round.question, &data)?;
        let ping = socket.extensions.get::<Ping>().map(|p| p.0).unwrap_or(0.0);
        let elapsed = (received - round.started_ms - ping).max(0.0);
        let row = Answer {
            username: name.clone(),
            answer,
            right,
            time_taken: elapsed,
            score: grading::score(right, elapsed, round.duration),
        };
        let (count, players) = tokio::time::timeout(
            Duration::from_secs(15),
            app.store.commit(
                &room.pin,
                &room.game_id,
                round.index,
                &round.token,
                &socket.id.to_string(),
                received,
                &row,
            ),
        )
        .await??;
        if count < 0 {
            app.stats.rejected.fetch_add(1, Ordering::Relaxed);
            emit(
                &app,
                &socket,
                if count == -1 {
                    "already_replied"
                } else {
                    "question_not_active"
                },
                &json!({}),
            );
            if count == -1 {
                emit(
                    &app,
                    &socket,
                    "answer_committed",
                    &json!({"question_index":round.index,"duplicate":true}),
                );
            }
            return Ok(());
        }
        round.count.fetch_max(count as u64, Ordering::Relaxed);
        app.stats.accepted.fetch_add(1, Ordering::Relaxed);
        emit(
            &app,
            &socket,
            "answer_committed",
            &json!({"question_index":round.index}),
        );
        app.latency
            .lock()
            .record(at.elapsed().as_micros().max(1) as u64)
            .ok();
        if count == players {
            if let Some(host) = room.host.lock().clone() {
                emit(
                    &app,
                    &host,
                    "player_answer",
                    &json!({"question_index":round.index,"count":count}),
                );
            }
            round.notified.store(count as u64, Ordering::Relaxed);
            app.broadcast(
                room,
                "everyone_answered",
                &json!({"question_index":round.index}),
            )
            .await;
        }
        Ok(())
    }
    .await;
    if let Err(error) = result {
        failure(&app, &socket, error);
    }
}

async fn disconnect(socket: SocketRef, State(app): State<Arc<App>>) {
    app.stats.connected.fetch_sub(1, Ordering::Relaxed);
    if let Some(session) = socket.extensions.remove::<Session>() {
        if session.admin {
            let mut host = session.room.host.lock();
            if host.as_ref().is_some_and(|s| s.id == socket.id) {
                *host = None;
            }
        } else if let Some(name) = session.name {
            session
                .room
                .players
                .remove_if(&name, |_, p| p.socket.id == socket.id);
        }
    }
    socket.extensions.remove::<Arc<App>>();
}
fn install_handlers(socket: SocketRef, app: Arc<App>) {
    socket
        .extensions
        .insert(Admission(Arc::new(AsyncMutex::new(()))));
    socket.extensions.insert(app.clone());
    socket
        .extensions
        .insert(CaptchaAttempt(Arc::new(Mutex::new(None))));
    socket
        .extensions
        .insert(SubmissionBudget(Arc::new(Mutex::new((Instant::now(), 0)))));
    socket.on("join_game", join);
    socket.on("rejoin_game", join);
    socket.on("register_as_admin", register);
    socket.on("echo_time_sync", sync_echo);
    socket.on("start_game", start);
    socket.on("set_question_number", open);
    socket.on("submit_answer", submit);
    socket.on("get_question_results", results::reveal);
    socket.on("get_final_results", results::finals);
    socket.on("kick_player", results::kick);
    socket.on("show_solutions", lifecycle::solutions);
    socket.on("get_export_token", results::export);
    socket.on("get_host_page", results::page);
    socket.on_disconnect(disconnect);
}
async fn metrics(HttpState(app): HttpState<Arc<App>>) -> Json<Value> {
    let h = app.latency.lock();
    Json(json!({
        "engine": "rust-socketioxide",
        "pid": std::process::id(),
        "accepted": app.stats.accepted.load(Ordering::Relaxed),
        "rejected": app.stats.rejected.load(Ordering::Relaxed),
        "errors": app.stats.errors.load(Ordering::Relaxed),
        "emit_errors": app.stats.emit_errors.load(Ordering::Relaxed),
        "connected": app.stats.connected.load(Ordering::Relaxed),
        "joined": app.stats.joined.load(Ordering::Relaxed),
        "commit_latency_ms": {
            "count": h.len(),
            "p50": h.value_at_quantile(0.5) as f64 / 1000.0,
            "p95": h.value_at_quantile(0.95) as f64 / 1000.0,
            "p99": h.value_at_quantile(0.99) as f64 / 1000.0,
            "max": h.max() as f64 / 1000.0,
        },
        "compression": false,
        "heartbeat_interval_s": 25,
        "heartbeat_timeout_s": 20,
        "captcha": app.captcha.metrics(),
    }))
}
async fn serve(options: Options) -> Result<()> {
    let (layer, io) = SocketIo::builder()
        .max_buffer_size(128)
        .max_payload(64 * 1024)
        .ws_read_buffer_size(1024)
        .ws_max_message_size(64 * 1024)
        .build_layer();
    let app = Arc::new(App {
        store: Store::new(&options.redis, options.redis_connections).await?,
        rooms: AsyncMutex::new(HashMap::new()),
        io: io.clone(),
        stats: Counters::default(),
        latency: Mutex::new(Histogram::new(3)?),
        inflight: Arc::new(Semaphore::new(65536)),
        healthy: AtomicBool::new(true),
        max_players: options.max_players,
        admission: Semaphore::new(256),
        captcha: captcha::Captcha::from_env()?,
    });
    // Connection middleware runs before the namespace ACK is sent. Registering
    // handlers in the async connect callback can lose a client's immediate join
    // on another Tokio worker between ACK enqueue and callback execution.
    let state = app.clone();
    lifecycle::maintain(app.clone());
    let callback = async |socket: SocketRef, State(app): State<Arc<App>>| {
        emit(&app, &socket, "session_id", &socket.id.to_string());
    };
    io.ns(
        "/",
        callback.with(move |socket: SocketRef| {
            let state = state.clone();
            async move {
                state
                    .stats
                    .connected
                    .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| {
                        if n < 40000 { Some(n + 1) } else { None }
                    })
                    .map_err(|_| "native connection capacity reached")?;
                install_handlers(socket, state);
                Ok::<(), &str>(())
            }
        }),
    );
    let counts = app.clone();
    let count_ms = options.count_ms.max(50);
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_millis(count_ms));
        loop {
            tick.tick().await;
            let rooms: Vec<_> = counts.rooms.lock().await.values().cloned().collect();
            for room in rooms {
                if let Some(round) = room.current.load_full() {
                    let count = round.count.load(Ordering::Relaxed);
                    if count > round.notified.fetch_max(count, Ordering::Relaxed)
                        && let Some(host) = room.host.lock().clone()
                    {
                        emit(
                            &counts,
                            &host,
                            "player_answer",
                            &json!({"question_index":round.index,"count":count}),
                        );
                    }
                }
            }
        }
    });
    let mut router = Router::new()
        .route("/health", get(lifecycle::health))
        .route("/__rust/metrics", get(metrics))
        .route("/__rust/capabilities", get(|HttpState(app): HttpState<Arc<App>>| async move {
            (if app.healthy.load(Ordering::Relaxed) {axum::http::StatusCode::OK} else {axum::http::StatusCode::SERVICE_UNAVAILABLE},
             Json(json!({"captcha_policy":app.captcha.policy,"captcha_lab":cfg!(feature="captcha-lab")})))
        }))
        .with_state(app.clone())
        .layer(layer);
    if let Some(origin) = options.origin {
        router = router.layer(axum::middleware::from_fn(
            move |request: axum::extract::Request, next: axum::middleware::Next| {
                let origin = origin.clone();
                async move {
                    if request
                        .headers()
                        .get("origin")
                        .is_some_and(|v| v.to_str().ok() != Some(origin.trim_end_matches('/')))
                    {
                        return axum::response::IntoResponse::into_response(
                            axum::http::StatusCode::FORBIDDEN,
                        );
                    }
                    next.run(request).await
                }
            },
        ));
    }
    let listener = tokio::net::TcpListener::bind(&options.listen)
        .await?
        .tap_io(|stream| {
            if let Err(error) = stream.set_nodelay(true) {
                tracing::warn!(%error, "setting TCP_NODELAY failed");
            }
        });
    tracing::info!(address=%options.listen,threads=options.threads,"experimental ClassQuiz Rust engine ready");
    let shutdown_io = io.clone();
    axum::serve(listener, router)
        .with_graceful_shutdown(async move {
            tokio::signal::ctrl_c().await.ok();
            shutdown_io.close().await;
        })
        .await?;
    io.close().await;
    app.store.release().await;
    Ok(())
}
fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_target(false)
        .init();
    let options = Options::parse();
    ensure!(
        options.threads > 0 && options.redis_connections > 0,
        "worker counts must be positive"
    );
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(options.threads)
        .enable_all()
        .build()?
        .block_on(serve(options))
}
