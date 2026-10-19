# One engine, unconditional fixes, one audience toggle

Implemented in `codex/load-bottleneck-analysis`, based on `50c6dd16`. Measured
14–15 October 2026. All tests use the isolated local stack; the VM is unchanged.

Follow-up: [10,000-player profiling and experimental runtime](TEN_THOUSAND.md)
preserves these recommendations and measures the next capacity limits.

**Recommendation: use normal mode for roughly 300 players, and enable “Huge
publicum optimization (300+ players)” for larger rooms. The conservative local
target with the toggle is 1,000 players for short quizzes, or around 750 when
100 questions are loaded.** These are practical targets for the tested media-free
quiz and aggressive submission wave, not VM guarantees.

The basic fixes remove accidental global broadcasts and repeated answer scans.
The toggle solves a different cost: sending everybody's answer history to every
phone. It changes result presentation, while both modes share answer validation,
scoring, timing, storage, question types and the live host answer count.

## What “comfortable” means here

The test drives ten short ABCD questions, with every player answering at a random
delay between 0 and 500 ms. A fresh room starts with a 15-second join ramp.
There is one second between result screens. The real API, nginx, Valkey,
PostgreSQL and frontend containers share four logical CPUs, with **one API
worker**. The Go bots and host controller use another four CPU threads.

A run must have:

- Exactly one stored answer per player per round, verified independently in
  Redis and by the result protocol; no failed connections or unexpected drops.
- Every player receiving each question result and completely draining finals.
- Observed round p95 all-stored time <=1,000 ms, including the 0–500 ms think time.
- Observed round p95 delivery of question results to all players <=1,000 ms,
  and final results delivered to all players <=1,000 ms.
- Observed gameplay metadata-probe p95 <=100 ms and average gameplay API CPU
  <=70% of one core. CPU averages include the fixed one-second result pauses;
  short answer bursts can still occupy the entire API core.

These are deliberately conservative engineering targets. With ten rounds, p95
is the worst observed round; it is not a reliable estimate of a population tail.
Metadata probes are sequential and under-sample long stalls. The Ryzen CPU is
not equivalent in speed to the VM's vCPU. The test excludes public networking,
TLS, VM steal, competing VM services, media downloads and browser rendering.
UI rendering/functionality is checked separately with real Svelte components.

## Results

<!-- capacity-table -->
| Mode / players | Runs | Stored p95 ms | All question results p95 ms | All finals ms | HTTP p95 ms | API CPU¹ | Comfort |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Basic / 300 | 3 | 563–581 | 72–81 | 628–662 | 10–14 | 19–20% | 3/3 pass |
| Basic / 500 | 1 | 592 | 143 | 1629 | 32 | 31% | 0/1 pass |
| Basic / 1,000 | 1 | 971 | 791 | 6376 | 593 | 63% | 0/1 pass |
| Toggle / 1,000 | 3 | 614–767 | 243–358 | 122–155 | 20–35 | 36–38% | 3/3 pass |
| Toggle / 1,500 | 1 | 1029 | 408 | 222 | 87 | 50% | 0/1 pass |
| Toggle / 2,000 | 1 | 1642 | 501 | 319 | 268 | 58% | 0/1 pass |

¹ Average percentage of **one core**, including the fixed one-second pauses. All listed runs retained every answer and had no unexpected disconnects.

The loaded-quiz-size check plays the same ten rounds with **100 questions loaded**, rather than playing all 100:

| Mode / players | Runs | Stored p95 ms | All question results p95 ms | All finals ms | HTTP p95 ms | API CPU¹ | Comfort |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Basic / 300 / 100 loaded | 1 | 576 | 48 | 648 | 7 | 22% | 1/1 pass |
| Toggle / 750 / 100 loaded | 1 | 768 | 78 | 111 | 33 | 37% | 1/1 pass |
| Toggle / 1,000 / 100 loaded | 1 | 1025 | 112 | 178 | 72 | 44% | 0/1 pass |

<!-- /capacity-table -->

The final engine passed **three independent 300-player normal runs** (9,000
answers) and **three independent 1,000-player optimized runs** (30,000 answers).
Every player received every result; there were no missing/duplicate answers,
unexpected disconnects or instrumented handler exceptions in these runs.
At 1,500 optimized players, the worst answer wave reached 1,029 ms, just outside
the declared target. At 2,000 it reached 1,642 ms. This is a soft engineering
boundary, not an enforced player cap.

The loaded-quiz test exposed a second bottleneck during implementation. With
100 questions loaded and 1,000 players, changing shared validation from the whole
quiz to the active question reduced median all-stored time **3,229 → 770 ms**,
observed HTTP p95 **1,246 → 72 ms**, and average API CPU **74% → 44% of one core**.
One round still measured 1,025 ms, including polling resolution; 750 players
gave better headroom. This test plays ten rounds, so it does not establish the
cost of delivering a normal-mode final after all 100 questions are answered.

“All stored” starts at the host's question request, with about 50 ms polling
resolution. Result delivery is timed at the **last bot**, not only the host or
first observer. All byte figures are decoded application payload, not compressed
network traffic. Current comparisons wait for every recipient, so their decoded
totals are more complete than the earlier investigation's observer-only totals.

Raw reports, bot logs and validation output are under ignored `results/`.
`capacity-measurements.json` is the compact reviewable data set. The tables above
use runs labeled `active`, `active-r1` and `active-r2`: the final shared validation
implementation. Earlier `a`, `b`, `c`, `d` and `long100` sweeps remain in the data
as intermediate measurements; their `answer_validation` field is `whole-quiz`.

## What is unconditional

1. `session_id` goes only to the connecting socket. `player_answer` goes only to
   that quiz's host/control room. `everyone_answered` goes only to that quiz.
   Host answer notifications contain an absolute count and question index, so
   delayed/out-of-order notifications cannot increment a different question.
2. One Redis Lua transaction validates room/question generation, open state,
   deadline and player membership, then commits uniqueness, answer, score, TTLs
   and answer count. This removes the full `LRANGE`/Pydantic duplicate scan and
   concurrent double scoring. Question state transitions use the same state.
3. Browser and physical controller submissions share that transaction. Rejoining
   replaces the socket identity and roster entry in one Redis transaction.
   Kicking removes admission membership. Scores are clamped to 0–1,000 and a
   bounded one-second network grace supports timer-triggered range submissions;
   a host reveal/close remains immediate.
4. Deployment templates raise API/proxy file-descriptor limits to 65,536 and
   configure nginx with 8,192 connections per worker. The separately managed
   outer proxy on the real VM still needs equivalent operational headroom.
5. Lobby and final standings render at most 50 rows per page, with lobby search
   and kick controls. Round leaderboards create only their four visible rows.
   Host joins append to the reactive array instead of copying the entire list.
6. Equal-score standings have a deterministic username order in both result
   modes and the host. This makes rank consistent instead of relying on arrival
   or hash iteration order. It does not change awarded points.
7. Each submission reads fresh room JSON and validates **only the active
   question**, rather than building models for the entire quiz. This applies
   to browser and controller players in both modes. There is no cache to expire
   or invalidate; the same Lua generation check protects an in-flight answer
   if the host changes questions while the handler is waiting.

The Redis transaction is short and uses the existing standalone Redis/Valkey
deployment. [Redis documents atomic script execution](https://redis.io/docs/latest/develop/programmability/eval-intro/).
It preserves answer-list and score-hash formats used by host results and exports.

## What the single toggle changes

The host still receives full question/final results and can export the complete
answer history. Each browser player receives a versioned personal question
result containing their answer, correctness, points, total score and rank.
Finals contain their total/rank, small per-question score map, participant count
and a top-10 leaderboard. A player outside the top 10 still sees their own rank.

The tradeoff is that phones no longer receive/display the full final standings
or everybody else's raw answer history. The host retains that information.
Media, question types, solutions, time synchronization, heartbeat settings and
the exact live host answer count remain enabled. There is no second “ultra” mode.

This is an application protocol change: deploy frontend and backend together
between quizzes, and use freshly loaded clients/new rooms. Existing Redis room
JSON defaults to `large_audience=false`; no SQL schema migration is needed.
An already-open question created by the older backend has no new admission state;
do not hot-swap engines during an active quiz. Reopening/advancing a question
builds that state and seeds the uniqueness index from existing stored answers.

## Why this module structure

`classquiz/socket_server/answers.py` owns shared atomic admission/storage.
`classquiz/socket_server/delivery.py` defines a tiny delivery interface and the
normal implementation. `classquiz/socket_server/large_audience.py` contains the
optimized result path. The Socket.IO engine calls:

```python
await delivery_for(game).question(sio, game, index, rows)
await delivery_for(game).final(sio, game, results)
```

The choice is stored when the room is created and dispatched only at result
boundaries. The answer hot path has **no optimization-mode check**. Strategies
are stateless singletons: no per-room cache, background timers or duplicated
scoring engine. Personalized sends use bounded batches of 64 so a large reveal
does not create thousands of application-level coroutines simultaneously.

A boolean check itself would be negligible beside Redis, serialization and
network work. The reason to separate these modules is maintainability: change
presentation policy without copying game rules or creating two engines that
drift apart. Two small implementations are enough; a plugin framework or
separate service would add complexity without solving this bottleneck.

## Validation and practical limits

The Go tests include personal-result reconciliation and waiting for all clients.
The local Redis regression checks exercise six answer types, 20 simultaneous
retries, stale question generations, close/deadline guards, network grace,
rejoining, controller submissions, kick membership, tie ordering and both result
schemas. Real network smoke runs cover both modes and mixed question types.

The production frontend Docker build passed and is served by the local stack at
`http://127.0.0.1:18088/play`. Go tests, Python formatting, nginx syntax and Compose
configuration checks passed. The load generator was rebuilt for Windows and Linux.

The UI-preview checks cover hosting, normal/optimized personal and final results,
host results and large rosters. Interactive checks verify the mobile Start
button and transmitted setting, 2,000-player paging/search/kick, and a personal
rank outside the top 10. The repo-wide typecheck has the same 45 errors and seven
warnings as the untouched base; the changed screens introduce no new diagnostics.

Further scale is limited by the shared answer path: it still fetches/decodes the
entire quiz's JSON per submission, although it now validates only one question,
and uses one Python API worker. Reducing that next would mean separating compact
mutable question state from quiz content, or a carefully versioned immutable
question cache. Simply increasing worker count is not
safe with the current in-process Socket.IO manager; shared coordination/affinity
would also be required. [Socket.IO deployment documentation](https://python-socketio.readthedocs.io/en/stable/server.html).

No 10,000-player claim is made. Long quizzes, sustained multi-room loads,
disconnect/reconnect storms, production media and actual mobile browsers still
need deployment-specific tests. The old stale-presence policy is not replaced
here: enrolled users can remain in the roster after disconnecting. The local
capacity figure describes this measured workload, not a guaranteed room limit.

See [README.md](README.md) for reproduction and [ANALYSIS.md](ANALYSIS.md) for
the original bottleneck investigation. Implementation remains local in this
worktree; no VM deployment, remote push or PR was performed.
