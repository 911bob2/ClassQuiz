# Rust realtime prototype: 10,000 and 30,000 players

This report describes the initial prototype. The selectable engine, recovery,
paged host results and follow-up measurements are in [HARDENING.md](HARDENING.md).

Measured locally on 2026-10-15. The binary is launched by the Python API through
`classquiz.realtime_process.RustRealtime`; it owns the realtime sockets and
answer path. Every counted answer uses the same authoritative atomic Redis
commit as Python. This is a working prototype, not a deployed production toggle.

## Results

<!-- RUST_TABLE -->

| Players | Rust configuration / workload | Worst all-stored | All-player question results p95 | All-player finals | Commit latency p95 | Rust peak RSS | Answer integrity |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 | 4 workers, 0–500 ms | 0.682 s | 0.157 s | 0.227 s | 4.4 ms | 442 MiB | 100,000 / 100,000 |
| 10,000 | 4 workers, 0–500 ms, repeat | 0.720 s | 0.147 s | 0.262 s | 4.3 ms | 436 MiB | 100,000 / 100,000 |
| 10,000 | 1 worker, 0–500 ms | 0.803 s | 0.279 s | 0.357 s | 4.7 ms | 463 MiB | 100,000 / 100,000 |
| 30,000 | 4 workers, 0–500 ms | 1.321 s | 0.484 s | 0.886 s | 194.3 ms | 1306 MiB | 300,000 / 300,000 |
| 30,000 | 4 workers, 0–500 ms, repeat | 1.174 s | 0.526 s | 0.912 s | 184.1 ms | 1329 MiB | 300,000 / 300,000 |
| 30,000 | 4 workers, zero think time | 1.137 s | 0.583 s | 0.745 s | 464.6 ms | 1352 MiB | 300,000 / 300,000 |

<!-- /RUST_TABLE -->

All-stored starts at the host's question request and includes question delivery,
bot think time and persistence. The regular workload chooses an answer after a
random 0–500 ms **from each phone's question receipt**, not from a global barrier.
Consequently a large broadcast's delivery spread also spreads submissions. The
zero-think workload submits immediately after each question receipt; it is also
not a global simultaneous-send barrier. Storage polling resolution is ~50 ms.
Result timings end at the last bot, not when the host first sees results.

Ten-round p95 is the worst observed round. These are short engineering trials,
not a statistically certified VM capacity. Raw logs and reports are retained in
`../stresstest/lab/results/`; compact evidence is in `measurements.json`.

## What this demonstrates

The six clean trials preserve **1,200,000 answer records** and every player's
question/final results, with zero join failures, unexpected disconnects,
duplicates, native commit errors or bounded-queue emit errors. Each trial uses
ten questions; the three 10,000-player trials each retain 100,000 answers, and
the three 30,000-player trials each retain 300,000.

The first clean four-worker 10,000-player run had a worst answer wave of 682 ms,
question-result delivery to all players within 157 ms, final delivery within
228 ms, and native admission/commit p95 of 4.4 ms. The first 30,000-player run
had a worst wave of 1.32 s, all question results within 485 ms and final results
within 887 ms. Repeating with TCP_NODELAY and cheaper monitoring produced a
1.17 s worst wave, all question results within 527 ms and finals within 912 ms.
The response targets were not relaxed to make those 30,000-player runs pass:
their answer wave still exceeded the strict one-second target.

The one-worker 10,000-player control also passes: worst wave 803 ms, all-player
finals 358 ms, commit p95 4.7 ms, and independently probed Python API p95 4.7 ms.
This limits the extent to which the result can be explained by four Rust worker
threads. It is a one-Tokio-worker control within the shared four-CPU affinity,
not a one-CPU cgroup or a comparison of languages with identical architectures.

With zero think time at 30,000, waves take 820–1,137 ms (median 931 ms), finals
reach every player within 745 ms, and native commit p95 rises to 465 ms. The
independent Python API probe measures p95 259 ms; direct native health is 18 ms.
Thus **10,000 is comfortable in these short local tests; 30,000 is functional
but exceeds the strict 1 s answer-wave / 100 ms HTTP targets**. This does not
establish the live VM's capacity.

At 30,000, Rust's peak process RSS was about 1.3 GiB, Python's parent around
200 MiB, and the Go generator around 1.0 GiB. The API container's combined
2 GiB limit was retained, and no container OOM was observed. Docker memory also
includes kernel socket buffers and other charges; process RSS is not the entire
deployment's memory requirement.

This is not a pure language comparison. The Python prototype's 10,000-player
half-second workload took up to 2.95 s; the implemented Python toggle took up to
8.08 s. Rust also changes the architecture: cached identity and round state,
one Redis commit per answer, 250 ms host-count coalescing, native networking,
four Tokio workers, no Python player-object GC, and no WebSocket compression.
The one-worker control is included to make the core-count difference visible.

## Next measured constraints

- **Commit queueing grows at 30,000.** In the repeated regular 30,000-player run,
  native handler-to-committed latency was p50 ~92 ms, p95 ~184 ms, versus p95
  ~4.4 ms at 10,000. The mean Redis Lua execution cost was ~13–16 microseconds
  per answer. Thirty thousand such commits alone represent ~0.4–0.5 s of Redis
  command execution, plus network/client scheduling and persistence overhead.
  Redis's average CPU over an entire phase is lower than its peak burst load;
  do not add overlapping async await durations as CPU time.
- **HTTP/control-path queueing is not fully isolated.** Independent 30,000-player
  probes avoid host-controller JSON decoding overhead, yet the Python API still
  has p95 259 ms versus 18 ms for direct native health. Instrumented Python Redis
  GET maxima in the corresponding answer phases are only about 8–25 ms. Redis
  commit backlog is measured, but it does not by itself explain the external
  API latency. Proxy, scheduling and control-path queues need separate profiling.
- **Question and result fanout still costs O(players).** At 30,000, observed
  host question delivery was ~0.2–0.36 s, and delivery to phones had substantial
  spread. Even a zero-cost grader cannot remove 30,000 socket writes. Profile
  bounded parallel fanout, protocol/task overhead and syscall batching next.
- **The full host history is large.** 30,000 players × ten rounds sends roughly
  30 MB of answer history to one host. The controller permits 64 MiB, but a real
  browser still must parse/render it. A paginated host summary and asynchronous
  full export are appropriate production changes.
- **Wire throughput now matters.** The Go report observes roughly 195 MiB of
  decoded application payload for the regular 30,000-player ten-round run,
  including results and joins. This is not measured network throughput and
  excludes framing/TLS. Rust currently sends uncompressed WebSocket messages;
  local Docker networking does not validate the VM uplink or a proxy/CDN's caps.
- **Load-generator headroom is recorded.** Thirty-thousand-player runs use about
  1 GiB in the Go process and peak around 1.2 CPU cores in the initial trials,
  with four generator CPUs available. Scheduler-lag samples are retained; a
  target cannot be judged from a generator that fails to offer its intended load.

The next backend experiment would be bounded batches of atomic admission, or
careful Redis pipeline/round-state optimizations, while retaining membership,
deadline, generation and deduplication checks and waiting for persistence before
counting acceptance. An in-memory or fire-and-forget fast path would change the
failure semantics; these results do not use one.

## Resource and measurement controls

All six server containers share CPU affinity **0–3**, matching the previous
four-logical-CPU lab budget. Python retains one API worker; Rust runs as its
child with four Tokio workers (or one for the control trial). Redis, nginx,
frontend, database and search share those same CPUs. The Go generator and the
Python controller use CPUs **4–7**. Other applications on this PC varied during
the trials, so results are not clean-room speedup guarantees. The Ryzen 9
9900X3D is not speed-equivalent to the VM CPU.

The API/Python+Rust cgroup retains **2 GiB**, nginx gets **2 GiB**, and the four
other server containers retain 1 GiB each. Generator memory is capped at 4 GiB;
it is separate from server resources. API and runner FD limits are 65,536.
nginx has four workers with 32,768 connection slots each, accounting for client
and upstream sockets. Proxy and generator ephemeral ports span 1024–65535 so a
single source/destination pair can hold 30,000 connections. These are local lab
changes and have not been applied to the live VM.

Every run uses a fresh lobby. Normal metadata requests, polling-to-WebSocket
upgrade, Engine.IO 25 s / 20 s heartbeats, time-sync, individual player identities
and answer validation remain enabled. The Rust WebSocket stack negotiates no
compression. Redis/Valkey retains AOF persistence. Accepted answers are not
buffered for later persistence.

Python and Rust CPU/RSS are measured separately. CPU is expressed as percentage
of one core (400% represents all four allowed cores); runtime CPU does not
include Redis/nginx. Per-process high-water RSS is captured from `/proc`.
FD enumeration uses strings every five seconds rather than allocating tens of
thousands of Python Path objects every half second. CPU/RSS are sampled every
500 ms. Resource sampling has overhead and may miss short CPU peaks.

The original HTTP probes share the host controller's event loop. Decoding a
multi-megabyte result can delay those probes even while the server is responsive.
Later control/burst runs additionally launch an **independent process** with
fixed 10 Hz Python-API and Rust-health probes, at most 40 outstanding probes.
Both old and independent measurements, errors and skipped probes are retained.
The independent result is preferred when available; the numerical response
targets remain 1 s all-stored/all-player results and 100 ms HTTP p95. Runtime CPU
budget is 70% of the four available server cores for Python plus its Rust child.
Redis counters are sampled separately; nginx shares the same CPU affinity but
its CPU is not included in that runtime metric. This is not an aggregate
whole-stack CPU capacity certification.

## Validation and prototype limits

- Thirty Python-generated grading fixtures cover all six types, normalization,
  invalid ranges and Unicode text. Rust unit tests also check score bounds and
  public-field redaction. Lua commit and close scripts match Python exactly.
- Network checks cover host authentication, duplicate names, unauthorized host
  commands, stale tokens, 20 concurrent retries per question type, no double
  scoring, public redaction, personal/no-answer results, closed questions,
  rejoin SID replacement, kick and the authoritative Redis deadline.
- The controller independently verifies Redis record counts and unique names.
  Every Go bot verifies its own result and final score/history; every bot must
  drain every result. Native accepted/error/emit-error counters are checked too.
- One initial 10,000-player run required one join retry because event handlers
  were registered after the namespace ACK. It retained every answer/result,
  but is marked an unsuccessful diagnostic run. Handlers now register in
  middleware before ACK; later complete admission tests require zero failures.
- This prototype is restricted to optimized captcha-free Kahoot rooms. It lacks
  production routing/checkbox integration, controllers, remote-host functions,
  export socket events, cross-process ownership/expiry and crash rehydration.
  Read [README.md](README.md) before running it. The normal engine and VM remain
  unchanged, and the ordinary local stack is restored after benchmarking.

Core behavior is independently testable; this is not a mock server that merely
acknowledges messages. Nevertheless, media, TLS, real browser rendering, shared
VM CPU steal, multiple concurrent huge rooms and long reconnect/churn/soak loads
remain outside the demonstrated capacity.

Implementation references: [socketioxide](https://docs.rs/socketioxide/0.18.7/socketioxide/),
[Axum listener configuration](https://docs.rs/axum/0.8.9/axum/serve/trait.ListenerExt.html),
and [Socket.IO's Engine.IO v4 protocol](https://github.com/socketio/socket.io/blob/main/docs/engine.io-protocol/v4-current.md).
