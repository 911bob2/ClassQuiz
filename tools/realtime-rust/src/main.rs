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
use socketioxide::adapter::Adapter;
use socketioxide::handler::{ConnectHandler, FromMessageParts};
use socketioxide::socket::Socket;
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
use store::{Lease, Store};
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
    idle_disconnects: AtomicU64,
}
/// Events refused by the per-connection token bucket, and connections dropped
/// for grossly exceeding it. Process-wide so the extractor needs no App handle.
static THROTTLED: AtomicU64 = AtomicU64::new(0);
static FLOOD_DISCONNECTS: AtomicU64 = AtomicU64::new(0);
struct App {
    store: Store,
    /// Never held across an await: building a room does Redis I/O and must
    /// not stall every other room's admissions.
    rooms: Mutex<HashMap<String, Arc<Room>>>,
    /// Per-PIN gate so concurrent first admissions build the room exactly once.
    gates: DashMap<String, Arc<AsyncMutex<()>>>,
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
/// At most 20 log lines per second process-wide from client-triggerable paths,
/// so a misbehaving or hostile client cannot turn the log into the bottleneck.
/// Counters in `/__rust/metrics` still count every event.
fn log_allowed() -> bool {
    static WINDOW: Mutex<Option<(Instant, u32)>> = Mutex::new(None);
    let mut window = WINDOW.lock();
    let now = Instant::now();
    match &mut *window {
        Some((start, used)) if now.duration_since(*start) < Duration::from_secs(1) => {
            *used += 1;
            *used <= 20
        }
        slot => {
            *slot = Some((now, 1));
            true
        }
    }
}
fn emit<T: Serialize + ?Sized>(app: &App, socket: &SocketRef, event: &str, data: &T) {
    if let Err(error) = socket.emit(event, data) {
        app.stats.emit_errors.fetch_add(1, Ordering::Relaxed);
        if log_allowed() {
            tracing::warn!(event, %error, "emit failed (closed connection or bounded queue)");
        }
        socket.clone().disconnect().ok();
    }
}
/// The detailed cause stays in the server log (sampled); clients only learn
/// that the request failed, never internal state, key names or Redis errors.
fn failure(app: &App, socket: &SocketRef, error: anyhow::Error) {
    app.stats.errors.fetch_add(1, Ordering::Relaxed);
    if log_allowed() {
        tracing::warn!(sid=%socket.id,%error,"handler failed");
    }
    emit(app, socket, "error", &json!({"message":"request_failed"}));
}
const MAX_ROOMS: usize = 256;
const ADMISSION_WAIT: Duration = Duration::from_secs(20);
/// A socket that has neither joined nor registered by then is disconnected.
const IDLE_JOIN_LIMIT: Duration = Duration::from_secs(30);
impl App {
    /// Global admission slot. The per-connection lock must already be held, so
    /// one socket can never occupy more than one slot, and a wait is bounded.
    async fn admit(&self) -> Result<tokio::sync::SemaphorePermit<'_>> {
        match tokio::time::timeout(ADMISSION_WAIT, self.admission.acquire()).await {
            Ok(permit) => Ok(permit?),
            Err(_) => anyhow::bail!("server_busy"),
        }
    }
    fn evict(&self, room: &Room) {
        for player in room.players.iter() {
            player.socket.clone().disconnect().ok();
        }
        if let Some(host) = room.host.lock().take() {
            host.disconnect().ok();
        }
    }
    /// Remove a cached room (only if it is still this instance) and free its gate.
    fn forget(&self, room: &Arc<Room>) {
        {
            let mut rooms = self.rooms.lock();
            if rooms.get(&room.pin).is_some_and(|c| Arc::ptr_eq(c, room)) {
                rooms.remove(&room.pin);
            }
        }
        // Waiters hold a clone of the gate, so only an unused one is dropped.
        self.gates
            .remove_if(&room.pin, |_, gate| Arc::strong_count(gate) == 1);
    }
    async fn room(&self, pin: &str) -> Result<Arc<Room>> {
        ensure!(
            (4..=16).contains(&pin.len()) && pin.bytes().all(|c| c.is_ascii_digit()),
            "invalid room code"
        );
        let game = self.store.game(pin).await?;
        let cached = self.rooms.lock().get(pin).cloned();
        if let Some(room) = &cached
            && game["game_id"] == room.game_id
        {
            return Ok(room.clone());
        }
        // Slow path: build under this PIN's gate only. Redis round trips here
        // (including the stale-key purge) never block other rooms.
        let gate = self.gates.entry(pin.to_owned()).or_default().clone();
        let _building = gate.lock().await;
        let game = self.store.game(pin).await?;
        let cached = self.rooms.lock().get(pin).cloned();
        if let Some(room) = cached {
            if game["game_id"] == room.game_id {
                return Ok(room);
            }
            self.evict(&room);
            self.forget(&room);
        }
        ensure!(self.rooms.lock().len() < MAX_ROOMS, "prototype room limit");
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
        {
            // Other PINs may have been built meanwhile; re-check the cap.
            let mut rooms = self.rooms.lock();
            ensure!(rooms.len() < MAX_ROOMS, "prototype room limit");
            rooms.insert(pin.to_owned(), room.clone());
        }
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
/// Per-connection token bucket shared by every event type.
const EVENT_RATE: f64 = 128.0; // sustained events per second
const EVENT_BURST: f64 = 256.0;
/// Denials minus later grants; reaching this means the peer sends far more
/// than the bucket allows and is disconnected. A merely eager client that
/// stays within about twice the sustained rate never gets there.
const FLOOD_STRIKES: u32 = 1024;
struct Bucket {
    tokens: f64,
    at: Instant,
    strikes: u32,
    notified: Option<Instant>,
}
#[derive(Clone)]
struct EventBudget(Arc<Mutex<Bucket>>);
#[derive(Debug, PartialEq)]
enum Verdict {
    Allow,
    /// Refused; `notify` asks for a (once per second) `rate_limited` message.
    Deny {
        notify: bool,
    },
    /// Refused and this is the event that crosses the disconnect threshold.
    Flood,
}
impl Bucket {
    fn new(now: Instant) -> Self {
        Self {
            tokens: EVENT_BURST,
            at: now,
            strikes: 0,
            notified: None,
        }
    }
    fn take(&mut self, now: Instant) -> Verdict {
        let refill = now.saturating_duration_since(self.at).as_secs_f64() * EVENT_RATE;
        self.tokens = (self.tokens + refill).min(EVENT_BURST);
        self.at = now;
        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            self.strikes = self.strikes.saturating_sub(1);
            return Verdict::Allow;
        }
        self.strikes += 1;
        if self.strikes == FLOOD_STRIKES {
            return Verdict::Flood;
        }
        let notify = self
            .notified
            .is_none_or(|t| now.duration_since(t) >= Duration::from_secs(1));
        if notify {
            self.notified = Some(now);
        }
        Verdict::Deny { notify }
    }
}
impl EventBudget {
    fn new() -> Self {
        Self(Arc::new(Mutex::new(Bucket::new(Instant::now()))))
    }
}
#[derive(Debug)]
struct Throttled;
impl std::fmt::Display for Throttled {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("event rate exceeded")
    }
}
impl std::error::Error for Throttled {}
/// First argument of every event handler. Extraction runs synchronously inside
/// socketioxide before it spawns a task, so a refused event costs one lock and
/// never creates a task, parses JSON or touches a semaphore. (The refusal makes
/// socketioxide log an error line; `main` mutes that target and `log_allowed`
/// samples our own message instead.)
struct Throttle;
impl<A: Adapter> FromMessageParts<A> for Throttle {
    type Error = Throttled;
    fn from_message_parts(
        socket: &Arc<Socket<A>>,
        _: &mut socketioxide::handler::Value,
        _: &Option<i64>,
    ) -> std::result::Result<Self, Throttled> {
        let Some(budget) = socket.extensions.get::<EventBudget>() else {
            return Ok(Throttle); // connection is closing
        };
        let verdict = budget.0.lock().take(Instant::now());
        match verdict {
            Verdict::Allow => return Ok(Throttle),
            Verdict::Flood => {
                FLOOD_DISCONNECTS.fetch_add(1, Ordering::Relaxed);
                if log_allowed() {
                    tracing::warn!(sid=%socket.id, "disconnecting connection that floods events");
                }
                socket.clone().disconnect().ok();
            }
            Verdict::Deny { notify } => {
                if notify {
                    socket
                        .emit("rate_limited", &json!({"retry_after_ms":1000}))
                        .ok();
                }
            }
        }
        THROTTLED.fetch_add(1, Ordering::Relaxed);
        Err(Throttled)
    }
}
#[derive(Clone)]
struct Admission(Arc<AsyncMutex<()>>);
#[derive(Clone)]
struct CaptchaAttempt(Arc<Mutex<Option<Instant>>>);

async fn join(_: Throttle, socket: SocketRef, Data(data): Data<Join>, State(app): State<Arc<App>>) {
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
    // Per-connection lock first (reject, never queue), then the global slot:
    // a socket repeating this event cannot pile up on the 256 shared permits.
    let admission = socket
        .extensions
        .get::<Admission>()
        .context("admission unavailable")?;
    let _connection = admission
        .0
        .try_lock()
        .map_err(|_| anyhow::anyhow!("captcha_busy"))?;
    let mut capacity = Some(app.admit().await?);
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
        None => app.admit().await?,
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
async fn register(
    _: Throttle,
    socket: SocketRef,
    Data(data): Data<Admin>,
    State(app): State<Arc<App>>,
) {
    let result: Result<()> = async {
        let admission = socket
            .extensions
            .get::<Admission>()
            .context("admission unavailable")?;
        let _connection = admission
            .0
            .try_lock()
            .map_err(|_| anyhow::anyhow!("admission already in progress"))?;
        let _capacity = app.admit().await?;
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
async fn sync_echo(_: Throttle, socket: SocketRef, Data(nonce): Data<String>) {
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
async fn start(_: Throttle, socket: SocketRef, State(app): State<Arc<App>>) {
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
async fn open(
    _: Throttle,
    socket: SocketRef,
    Data(index): Data<String>,
    State(app): State<Arc<App>>,
) {
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
async fn submit(
    _: Throttle,
    socket: SocketRef,
    Data(data): Data<Submission>,
    State(app): State<Arc<App>>,
) {
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
/// Sockets that never join or register would otherwise hold one of the 40,000
/// connection slots until the peer goes away. An admission that is still in
/// progress (waiting for a slot or a captcha) is given extra time.
fn reap_idle(socket: SocketRef) {
    tokio::spawn(async move {
        tokio::time::sleep(IDLE_JOIN_LIMIT).await;
        for _ in 0..4 {
            if !socket.connected() || socket.extensions.get::<Session>().is_some() {
                return;
            }
            let admitting = socket
                .extensions
                .get::<Admission>()
                .is_some_and(|a| a.0.try_lock().is_err());
            if !admitting {
                break;
            }
            tokio::time::sleep(Duration::from_secs(10)).await;
        }
        if let Some(app) = socket.extensions.get::<Arc<App>>() {
            app.stats.idle_disconnects.fetch_add(1, Ordering::Relaxed);
        }
        socket.disconnect().ok();
    });
}
fn install_handlers(socket: SocketRef, app: Arc<App>) {
    socket
        .extensions
        .insert(Admission(Arc::new(AsyncMutex::new(()))));
    socket.extensions.insert(app.clone());
    socket
        .extensions
        .insert(CaptchaAttempt(Arc::new(Mutex::new(None))));
    socket.extensions.insert(EventBudget::new());
    reap_idle(socket.clone());
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
        "idle_disconnects": app.stats.idle_disconnects.load(Ordering::Relaxed),
        "throttled_events": THROTTLED.load(Ordering::Relaxed),
        "flood_disconnects": FLOOD_DISCONNECTS.load(Ordering::Relaxed),
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
/// SIGINT or SIGTERM (what `docker stop` and systemd send) both release the
/// Redis lease gracefully instead of leaving a 15 s replacement delay.
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        match signal(SignalKind::terminate()) {
            Ok(mut term) => {
                tokio::select! {
                    _ = tokio::signal::ctrl_c() => {}
                    _ = term.recv() => {}
                }
            }
            Err(error) => {
                tracing::warn!(%error, "SIGTERM handler unavailable; only SIGINT is handled");
                tokio::signal::ctrl_c().await.ok();
            }
        }
    }
    #[cfg(not(unix))]
    tokio::signal::ctrl_c().await.ok();
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
        rooms: Mutex::new(HashMap::new()),
        gates: DashMap::new(),
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
            let rooms: Vec<_> = counts.rooms.lock().values().cloned().collect();
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
            shutdown_signal().await;
            shutdown_io.close().await;
        })
        .await?;
    io.close().await;
    app.store.release().await;
    Ok(())
}
fn main() -> Result<()> {
    // socketioxide logs an error line for every event refused by `Throttle` or
    // carrying an undecodable payload; that is client-triggerable, so it is muted
    // unless RUST_LOG names the target. Refusals are counted in the metrics and
    // logged (sampled) by this crate instead.
    let mut filter = tracing_subscriber::EnvFilter::from_default_env();
    if !std::env::var("RUST_LOG").is_ok_and(|v| v.contains("socketioxide::handler::message")) {
        filter = filter.add_directive("socketioxide::handler::message=off".parse()?);
    }
    tracing_subscriber::fmt()
        .with_env_filter(filter)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bucket_allows_bursts_then_refills() {
        let t0 = Instant::now();
        let mut bucket = Bucket::new(t0);
        for _ in 0..EVENT_BURST as usize {
            assert_eq!(bucket.take(t0), Verdict::Allow);
        }
        assert_eq!(bucket.take(t0), Verdict::Deny { notify: true });
        assert_eq!(bucket.take(t0), Verdict::Deny { notify: false });
        // Half a second restores half the sustained rate.
        let later = t0 + Duration::from_millis(500);
        for _ in 0..(EVENT_RATE / 2.0) as usize {
            assert_eq!(bucket.take(later), Verdict::Allow);
        }
        assert!(matches!(bucket.take(later), Verdict::Deny { .. }));
        // The notice repeats once the second has passed.
        let next = t0 + Duration::from_millis(1600);
        let verdicts: Vec<_> = (0..400).map(|_| bucket.take(next)).collect();
        assert!(verdicts.contains(&Verdict::Deny { notify: true }));
    }

    #[test]
    fn bucket_disconnects_only_gross_floods() {
        let t0 = Instant::now();
        // 2x the sustained rate for a minute is throttled, never disconnected.
        let mut eager = Bucket::new(t0);
        for step in 0..60_000u32 {
            let now = t0 + Duration::from_micros(u64::from(step) * 1_000_000 / 256);
            assert_ne!(eager.take(now), Verdict::Flood, "step {step}");
        }
        // 20,000 events in one instant are cut off exactly once.
        let mut flood = Bucket::new(t0);
        let floods = (0..20_000)
            .filter(|_| flood.take(t0) == Verdict::Flood)
            .count();
        assert_eq!(floods, 1);
    }
}
