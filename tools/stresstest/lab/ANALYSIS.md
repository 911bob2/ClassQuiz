# Why ClassQuiz stalls at 300–1,000 players

Historical investigation of the original engine. The implemented unconditional
fixes and single optimization toggle are evaluated in [CAPACITY.md](CAPACITY.md).

Measured locally on 14 October 2026, based on commit `50c6dd16`, in the isolated
`codex/load-bottleneck-analysis` worktree. No production deployment was changed.

**The primary limit is unnecessary work in one Python API worker.** ClassQuiz
turns N answers into roughly N² outgoing events, repeatedly parses previous
answers, and sends every player's complete answer history to every player.
These costs reproduced locally without public networking. Increasing RAM or
removing heartbeats would not address them.

The strongest result is a prototype retaining the existing question types,
scoring, result schema, WebSockets, heartbeats and exact host answer-count events:
1,000 players submitted **10,000 answers with no missing/duplicate answers or
disconnects**. A random 0–500 ms answer wave finished storing in **680 ms median**
(613–882 ms across ten rounds). The remaining **5.63-second final-results pause**
shows why that prototype alone is not yet a completely smooth 1,000-player game.

## What was tested

The real API, production frontend build, PostgreSQL, Valkey, Meilisearch and nginx
run locally. All server containers share four logical CPUs, with one Gunicorn /
Uvicorn worker. Bots and the scripted host run on a separate four-CPU set.
The host uses real Socket.IO events; only fixture/lobby creation bypasses login
and the editor. All players use the existing Go protocol implementation with
normal polling/upgrade, compression, heartbeats and independent identities.

This is a CPU-constrained comparison, **not an exact VM emulator**. The local
Ryzen 9 9900X3D cores may be faster than VM vCPUs. The lab omits the shared outer
proxy, TLS, S3/media, other VM workloads, CPU steal and browser rendering. The
synthetic quiz has ten short ABCD questions. Algorithm tests raise nofile to
65,536; a separate test restores 1,024. See [README.md](README.md) for commands,
resource configuration and measurement limitations.
All comparison runs include the same lightweight instrumentation; its overhead
has not been subtracted. The cProfile run is kept separate from timing comparisons.

## Main measurements

Times below include the bots' random 0–500 ms delay. “All stored” is measured
from the host sending a question until Redis polling sees all answers, with
approximately 50 ms resolution. “Reveal” is the host's result-request response,
including any queued answer notifications. These are medians across rounds;
final results are a single event per run.

| Version | Players × rounds | All stored | Host reveal | Final results | Integrity |
| --- | ---: | ---: | ---: | ---: | --- |
| Original | 300 × 10 | 1,487 ms | 629 ms | 544 ms | 3,000/3,000 |
| Scoped broadcasts + indexed check | 300 × 10 | 510 ms | 3.9 ms | 556 ms | 3,000/3,000 |
| Original | 1,000 × 3 | 3,864 ms | 22,554 ms | 1,716 ms | 3,000/3,000 |
| Indexed check alone | 1,000 × 3 | 4,275 ms | 26,298 ms | 1,752 ms | 3,000/3,000; final stream warning¹ |
| Scoped broadcasts alone | 1,000 × 3 | 1,336 ms | 9.7 ms | 1,764 ms | 3,000/3,000 |
| Scoped + indexed check | 1,000 × 10 | 917 ms | 10.3 ms | 5,747 ms | 10,000/10,000 |
| Scoped + atomic answer commit | 1,000 × 10 | **680 ms** | **10.7 ms** | **5,628 ms** | **10,000/10,000** |
| Scoped + indexed, full results only to host² | 1,000 × 10 | 868 ms | 6.8 ms | **46 ms** | 10,000/10,000 via Redis/host |

¹ The indexed-only run reported one `invalid final results / use of closed
network connection` warning at shutdown. Its per-question results, independent
Redis identities and host final counts all verified 3,000 answers. It is not a
clean generator pass and is not used to claim a successful improved build.

² The final row deliberately removes player result messages to isolate their
cost. **It is not a finished optimized player experience.** Personal results
would need a new compact response; the existing Go observer cannot verify
results it no longer receives, so Redis and the host provide verification.

At 300 players, observed HTTP latency during answer phases fell from **975 ms
p95 / 1,542 ms max** to **2.4 ms p95 / 9.0 ms max** with scoped + indexed handling.
The API fell from approximately **100% to 43% of one core** during those phases.
At 1,000, the original worker stayed around **100% of one core** through answers
and the notification backlog, with HTTP probes reaching their **20-second
timeout**. These sequential probe percentiles are descriptive, not a
fixed-arrival latency SLO; long stalls reduce the number of samples.

Idle is inexpensive: the longer exploratory run held 1,000 sockets for 30 seconds
with heartbeats and ten HTTP probes/second, using about **2.9% of one API core**.
Successful 1,000-player variants used roughly **274–296 MiB peak API RSS**.
Memory was not close to the lab's 2 GiB API cap or the VM's available memory.

Joins have the same broadcast mistake: `connect()` sends each new `session_id`
to everyone. A 1,000-player run produced **501,501 deliveries**; sending each
ID only to its own socket produced **1,001** (including the host). With a
15-second configured ramp, join completion improved from **19.8 to 15.1 seconds**,
and observed join-phase HTTP p95 from **787 to 2.8 ms**. This correction loses
no intended feature. It belongs with the unconditional scoped-event fix below.

## Ranked bottlenecks and proposed remedies

| Bottleneck and evidence | Impact | Proposed solution | Experimental level | Feature effect |
| --- | --- | --- | --- | --- |
| **1. Global `player_answer` broadcast for every answer.** Three 1,000-player rounds generated **3,003,000 deliveries**, versus **3,000** when scoped to one host. Python Socket.IO creates a send task for each recipient. | **Critical; measured dominant answer-phase cost.** 22.6 s median reveal response became 9.7 ms when broadcast destinations were corrected. The worst scoped reveal was still 579 ms. | Emit only to `admin:{pin}` using the session already loaded by the handler. Scope `everyone_answered` to the quiz. If all players should see a live count later, send one absolute count snapshot every 250 ms, with question ID and a final flush. | **Low** for correct destinations; **medium** for count batching/reconnect reconciliation. | Existing player UI does not subscribe to `player_answer`; existing host live count remains exact. A future shared count can remain live at 4 updates/sec. Global events currently also corrupt counts/end-state across unrelated rooms. |
| **2. Full results to every player.** `question_results` broadcasts all N answer rows; `final_results` broadcasts N×Q rows to N recipients. | **Critical; measured.** With other fixes in place, ten-question finals still block the loop for about **5.6–5.7 s** at 1,000 players. The host-only experiment reduces final delivery to **46 ms**. | Compute totals/ranks/histograms once. Send personal answer/score/rank to each player and a bounded top-N shared leaderboard. Keep complete history server-side for host/export, and paginate full standings on demand. | **Medium**: backend/frontend protocol change, all modes and tie/rank rules need tests. | Personal feedback, rank, podium, charts and exports can remain. An ultra mode can omit immediate full standings and detailed per-player answer browsing. Simply dropping the existing messages breaks player results, as the experiment demonstrates. |
| **3. Duplicate detection rereads and parses the entire answer list.** `LRANGE`, one Pydantic parse per row, then a username scan. | **High after broadcast correction.** Worst-case serial arrival entails 499,500 prior-row parses per 1,000-answer round. CPU-only microbenchmark: 7.6 ms at 100, 67 ms at 300, **859 ms at 1,000**, excluding Redis/network. Actual burst row counts are lower because handlers overlap. | O(1) indexed uniqueness plus **one atomic commit** for admission, answer, score, expiry and count. Validate question generation/deadline in the transaction. | **Medium**: standard Redis Lua pattern, but correctness needs retry/concurrency/transition tests. | No required feature loss. Fixes double scoring: concurrent duplicate probe stored **2 answers in 10/10 baseline rounds**, versus **1 in 10/10 atomic rounds**. |
| **4. File descriptors and proxy connection limits.** VM API soft nofile is 1,024; successful local 1,000-player runs used about 1,037–1,058 descriptors. | **Hard ceiling; reproduced.** With nofile=1,024 and broadcasts already fixed, only **997/1,000** joined; API reached exactly 1,024 FDs and logged `Errno 24: Too many open files`. | Raise API nofile with headroom, e.g. 16,384+, and align nginx worker limits/connections and host limits. Budget temporary HTTP/upgrades, Redis connections and shared proxy traffic. | **Low**, operational tuning with monitoring. | None. Outer NPM's earlier 4×512 connection configuration is also near a nominal 1,000 proxied-client ceiling because a proxied connection uses client and upstream sockets. That proxy threshold is a configuration estimate, not the cause proven for the earlier 250-player plateau. |
| **5. Many Redis round trips per answer.** Session, whole game, prior answers, start time, score, append, expiry and player count are separate operations. | **Medium; measured after primary fixes.** Combining mutations/count reduced median all-stored time from **917 to 680 ms** at 1,000 players. Redis itself stayed lightly loaded in spot checks; long awaited Redis times also include Python scheduling backlog. | Atomic Lua commit; pipeline independent reads where useful; avoid refetching session merely to choose an emit destination. | **Medium**, same transaction work as #3. | None; retain authoritative timestamp/scoring and exact final count. |
| **6. Full quiz reload/validation per answer and metadata request.** Even answering one question deserializes all questions. | **Medium; grows with quiz size.** Microbenchmark of 1,000 parses: **94 ms for 10 questions**, **920 ms for 100**. These are CPU-only fixture costs, not whole-request latency. | Separate immutable quiz/question data from mutable room state. Cache validated question data by immutable version; keep authoritative current question/start time small and invalidate explicitly. | **Low–medium** in one worker; **medium** across workers. | None if invalidation handles next/back/rejoin correctly. Avoid an unversioned cache of mutable game objects. |
| **7. One API event loop is the shared CPU bottleneck.** `MAX_WORKERS=1`; Socket.IO uses an in-process manager. | **High architectural constraint**, but unnecessary N² work is the first thing to remove. One saturated core can stall the game while the VM still has other idle cores. | Keep one worker initially with efficient handlers. For further scale, use shared Socket.IO coordination and correct load-balancer affinity, or shard rooms across independent instances. | **Medium–high**: distributed ordering, reconnects, state transitions and affinity. | No intended feature loss. Increasing worker count alone is unsafe: shared Redis game data is not a shared Engine.IO connection/room manager. |
| **8. Host/player UI scales with the whole roster/leaderboard.** The host copies its array on every join, renders all roster entries, and creates/animates result rows even when CSS hides most of them. Players sort all players' scores. | **Potential medium/high browser cost; code-inspected, not browser-profiled here.** Local server joins at 300 were smooth, so this lab does not prove the original host UI plateau was DOM work. | Batch roster updates, use stable keyed/virtualized or paginated rows, render only visible/top rows, calculate shared ranks once, and limit transitions. | **Low–medium**, familiar UI work requiring real-browser checks. | Full names/kick/search/standings can remain accessible through pages/search. Ultra can show count + recent joins/top-N only and disable animations. |
| **9. Repeated compression of large result messages.** Socket.IO already encodes a shared event once, but each WebSocket compresses its own payload. | **Measured contributor** to result pauses; profiled one-question scoped run spent 0.87 s in zlib compress plus 0.12 s flush. Profiling changes timing; these are not the normal-run latency figures. | First shrink payloads (#2). For identical large host/result snapshots, consider a versioned, access-controlled HTTP object cached and precompressed once. Benchmark disabling WS compression only as a CPU/bandwidth tradeoff. | **Medium** for result delivery/cache design; tuning alone **low**, benefit depends on bandwidth. | No intrinsic feature loss, but turning compression off increases traffic. Caching JSON alone does not fix this: Socket.IO already reuses its encoded packet. |
| **10. Media metadata/signing and cold downloads.** New phones still need their first image/video download. S3 download redirects are signed per request; local downloads already have long immutable caching. | **Conditional; not benchmarked in this media-free lab.** May dominate bandwidth for large media even after gameplay is efficient. | Stable versioned media URLs with appropriate access controls, shared proxy/CDN cache, thumbnails, caching of safe metadata and prefetching. Never cache live answer submissions or personalized result responses as public assets. | **Low–medium** depending on storage/access design. | Normal mode keeps media. Ultra may use host-only media and small answer controls on phones, sacrificing player-side images/video. |
| **11. Stale presence and lifecycle state.** No disconnect handler removes/marks Redis members; reconnects and names have different lifetime behavior. | **Correctness/UX constraint**, not the measured CPU hotspot. Stale players inflate the roster and prevent “everyone answered” from matching actual active participants. | Stable player identity, separate connected presence from enrolled participants, a reconnect grace period, TTL refresh and explicit rules for each question's eligible count. | **Medium** because mobile reconnect behavior must be preserved. | Keep reconnect support. Immediate removal would lose continuity; a grace period avoids that tradeoff. |

Source locations: `classquiz/socket_server/__init__.py:275–338,454–460`,
`classquiz/socket_server/helpers.py:133`, `classquiz/db/models.py:256,343`,
`classquiz/socket_server/session.py`, `gunicorn_conf.py`, `deploy/compose.yaml`,
`frontend/src/routes/admin/+page.svelte:141`,
`frontend/src/lib/play/admin/game_not_started.svelte:107`,
`frontend/src/lib/play/admin/results.svelte:110`,
`frontend/src/lib/play/results_kahoot.svelte`, and `classquiz/routers/storage.py`.

## Which hosting options make sense?

**Make correctness and efficiency fixes unconditional:** scoped events, atomic
answer storage/deduplication, sensible descriptor limits and avoiding hidden
DOM rows. There is no useful small-room feature to preserve by keeping those
defects behind a checkbox.

**Large audience / “Huge publicum optimization (100+ players)”** should keep
scoring, time sync, reconnects, heartbeats, all question types, personal results,
rank, charts and exports. Use compact result messages and virtualized standings;
batch count/roster presentation to roughly 4 Hz if needed. There is no need to
remove the live host answer count. A count shown to all players is also possible
with bounded absolute-count broadcasts.

**Experimental ultra (1,000+)** should be a presentation/traffic budget: top-N
leaderboards plus personal rank, full standings on demand or after the quiz,
host-only heavy media, small phone screens, no large roster/result animations,
and perhaps count updates at 1 Hz. Keep per-player acceptance/rejection, the
authoritative answer timestamp and reconnect/heartbeat mechanisms. These
restrictions can reduce traffic without changing scoring or exporting full data.

The payload-isolation experiment reduced received bot payload from **842 MiB to
3.4 MiB** over ten 1,000-player rounds, but it omitted personal results completely.
A real compact protocol must send those back, so **3.4 MiB is a lower bound, not
a production estimate**. Counts are decoded application bytes, not compressed
wire bytes; final streams may be cut short after the elected observer finishes.

**Do not remove heartbeats as the main optimization.** Engine.IO defaults to a
25-second ping interval / 20-second timeout. At 1,000 players that layer averages
about 40 ping/pong exchanges per second, compared with a million answer-event
deliveries per question today. The underlying WebSocket server may add its own
keepalive. Tune redundant keepalive only after measuring it, while preserving
dead-connection detection. [Engine.IO reference](https://python-engineio.readthedocs.io/en/latest/api.html),
[Socket.IO heartbeat behavior](https://socket.io/docs/v4/server-options).

For the transaction, Redis supports atomic Lua execution; keep scripts short
and validate inputs/state carefully. For multiple workers, Socket.IO documents
the need for inter-process coordination and session affinity with polling.
[Redis Lua documentation](https://redis.io/docs/latest/develop/programmability/eval-intro/),
[Python Socket.IO deployment](https://python-socketio.readthedocs.io/en/stable/server.html).

## What this establishes—and what remains

The measured priority is **scope broadcasts → atomic indexed answer commit →
compact results**, with descriptor headroom in parallel. Those changes are much
more valuable than removing core gameplay features or rewriting the whole app.
The local results make 1,000-player gameplay a credible engineering target;
they do **not** establish that the existing public VM now supports 1,000 smoothly.

The earlier public-connection plateau and Windows SSH forwarder limit are
separate from this local proof. The new local results do not identify the public
packet-path limit or establish that VM bandwidth is unlimited. Media-heavy,
long-quiz, mixed-question, mobile/reconnect, cross-room, full-browser and soak
tests remain necessary before advertising a capacity figure.

All changes here are lab tooling and reversible runtime experiments. The simple
`indexed` reservation is intentionally not production-safe; the `atomic`
prototype also needs state/deadline/validation/migration review. No production
source file, hosting UI option, VM setting, Git remote or PR was changed.

Raw per-run JSON, bot reports, cProfile data and duplicate probes are retained in
ignored `results/`. [measurements.json](measurements.json) contains a compact
reviewable summary. The initial five-minute exploratory 1,000-player run and
the profiled run are excluded from the normal comparison. Expected Socket.IO
connect-signature fallback exceptions appear in the earlier raw instrumentation
logs; they were caught by Socket.IO and are not failed client connections.
