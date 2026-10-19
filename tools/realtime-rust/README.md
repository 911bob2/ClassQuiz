# Experimental Rust realtime engine

The host dialog exposes **Experimental Rust engine (10,000+ players)** when the
native service is healthy. It enables personal player results and routes that
room's host and players to `/socket.io-rust/`. Normal and Python-optimized rooms
continue using `/socket.io/`. The built-in guide is `/docs/large-audiences`;
it starts with trade-offs and expected performance, then explains benchmarks,
recovery, limits and operation.

Python launches and supervises one long-running Linux binary. Rust handles the
realtime connections; Python retains accounts, editing, room creation, saved
database results and spreadsheet generation. There is no Python RPC per answer.
Use a dedicated supervisor service, never a child per Gunicorn worker.

## Local worktree

Requirements: Docker Desktop/Linux containers, PowerShell and the local lab API
and frontend images. The lab is bound to `127.0.0.1:18088` and is not public.

```powershell
# Stop an existing child before replacing its executable.
docker compose -f tools/stresstest/lab/compose.yaml stop api
./tools/realtime-rust/build.ps1
./tools/realtime-rust/build.ps1 -Test
# Optional: keep the build off the CPUs a benchmark uses (or set RUST_BUILD_CPUSET).
./tools/realtime-rust/build.ps1 -CpuSet 8-15
docker compose -f tools/stresstest/lab/compose.yaml -f tools/stresstest/lab/compose.rust.yaml up -d
# If frontend sources changed:
docker compose -f tools/stresstest/lab/compose.yaml build frontend
docker compose -f tools/stresstest/lab/compose.yaml up -d --no-deps --force-recreate frontend
```

Open <http://127.0.0.1:18088/dashboard>, host a quiz and select the Rust option.
The full guide is <http://127.0.0.1:18088/docs/large-audiences>. The generated
binary is `tools/stresstest/lab/results/classquiz-realtime`: x86-64 Linux GNU,
built with pinned Rust 1.95 on Debian bookworm. It is not a Windows executable.
Cargo.lock fixes the dependency versions. Registry/target caches use Docker
volumes; generated binaries and raw logs are ignored under lab results.

```powershell
./tools/stresstest/lab/rust.ps1 -Users @(10000) -Suffix hardened -Questions 10 -Ramp 60
./tools/stresstest/lab/rust.ps1 -Users @(30000) -Suffix hardened -Questions 10 -Ramp 120
# Immediate answers on receipt, rather than a random 0–500 ms think time:
./tools/stresstest/lab/rust.ps1 -Users @(30000) -Suffix burst -Questions 10 -Ramp 120 -ExtraArgs @('--answer-mode','burst')
```

Each run creates a fresh room and restarts the API/child, but retains Redis/AOF.
The runner drives real Socket.IO host controls and the same Go player client
used for Python. It independently checks stored records and every player's
question/final results. Read [BENCHMARK.md](BENCHMARK.md) for the initial prototype
measurements and [HARDENING.md](HARDENING.md) for integration validation.

To restore the ordinary local runtime:

```powershell
Remove-Item Env:LAB_RUST_THREADS,Env:LAB_RUST_REDIS_CONNECTIONS -ErrorAction SilentlyContinue
docker compose -f tools/stresstest/lab/compose.yaml up -d --no-deps --force-recreate api proxy
```

## Deployment integration

The root Dockerfile builds the binary in a pinned Rust builder and packages it
with Python. `deploy/compose.yaml` runs a dedicated `realtime` service using:

```text
python /app/classquiz/realtime_process.py
```

Configure `REDIS`, `CLASSQUIZ_ORIGIN` (the public site origin), and optionally
`RUST_REALTIME_THREADS` (default 4), `RUST_REALTIME_PORT` (default 81) and
`RUST_REALTIME_BINARY`. The API needs `RUST_REALTIME_URL` pointing to that internal
service. Its capabilities route checks health and disables new native rooms
when unavailable. Existing rooms retain their endpoint during an outage.

The proxy forwards `/socket.io-rust/` to native port 81 and `/socket.io/` to
Python. No native port is published. Health and metrics stay internal. The
deployment raises file descriptors, connection slots and proxy ephemeral-port
headroom; still size the server for client sockets, upstream sockets and memory.
Building/configuring this worktree does not deploy anything to the VM.

The reusable boundary is `classquiz.realtime_process.RustRealtime`:

```python
runtime = RustRealtime(binary, redis_url, port=81, threads=4)
await runtime.start()       # waits for native readiness
runtime.supervise()        # bounded backoff on unexpected exit
try:
    ...
finally:
    await runtime.stop()    # SIGINT, then kill after a bounded wait
```

## Recovery and consistency

- One random process token owns a Redis lease, renewed every 3 seconds with a
  15-second expiry. Native writes check ownership inside Redis. A stale process
  cannot write after replacement. A single failed or slow renewal is tolerated;
  the process closes sockets and exits when the last success is older than 10 s
  or another process owns the lease. Redis connections reconnect automatically
  (a Redis restart or short outage does not need a native restart); health is
  503 while renewals fail.
- Redis stores phase, generation, question token, original deadline, roster,
  stable resume credentials, answers and scores. The in-memory round and result
  projections are rebuilt lazily. No timer restarts and no answer is admitted
  after the authoritative deadline/grace merely because a cache says otherwise.
- The canonical Python commit Lua is wrapped with lease/generation fencing and
  an atomic per-player recovery index. Membership, token/index, time bounds,
  deduplication, answer append and score update remain one Redis execution.
  `answer_committed` is sent only after Redis executes it. This is not a claim
  that Redis fsyncs every accepted answer; AOF durability is separately configured.
- The browser persists admission identity before its join, updates its SID after
  rejoin, and retains a pending answer until acknowledgement. On recovery it
  restores the question, submitted state or personal result and retries only
  a still-valid unanswered round. The same host tab can replace a stale socket.
- Admissions are bounded at 256 concurrent operations and use a shared read lock;
  host state transitions use the write lock. Answer submissions do not take that
  lock. A connection may run one admission at a time (a second is rejected before
  it can take a slot). Room-scoped key registries refresh dependent TTLs without scanning all
  Redis keys every minute. Expired and unreferenced cached rooms are removed.
- New PIN generations discard stale state. Final state is terminal. Repeating
  the same active-question command does not reset its token or clock.
- Full exports use a frozen metadata/answer snapshot, survive room expiry/PIN
  reuse within the token TTL, and reject a different PIN. Native XLSX generation
  runs outside the API loop. Database save retries are serialized and idempotent.

## Trade-offs and supported scope

All six answer types, slides, media references, solutions, individual scoring,
exact ranks, top-ten finals, host result paging, full exports, saving and recovery
are implemented. Native rooms require Kahoot/normal presentation and controllers
off; the API rejects incompatible combinations. Configured hCaptcha or reCAPTCHA
v3 is verified directly in Rust on initial admission; authenticated reconnects
and gameplay do not call the provider. See [CAPTCHA.md](CAPTCHA.md) for setup,
limits and the isolated test harness. Remote host
control and the legacy live-data integration are unsupported.

Live host counts are coalesced every 250 ms with a final flush. Heartbeats stay
25 s / 20 s. WebSocket compression is absent. Host result messages contain 50
rows and counts; complete histories are retained in Redis and export/database
paths instead of broadcasting megabytes of history to the host browser.

Admission defaults: 30,000 registered players per room, 40,000 native connections
per process, 256 cached rooms, 64 KiB incoming packets, 128 queued outgoing events
per connection, 128 events/second per connection of any type (burst 256; a
connection that grossly exceeds it is disconnected), bounded answer lengths and
65,536 concurrent answer commits. Sockets that neither join nor register within
30 seconds are disconnected, and the deployed proxy allows 2,000 concurrent
realtime requests per client address. These caps are not a whole-server capacity
guarantee. The CLI can lower per-room player capacity. Questions last 1–3,600
seconds; completed questions cannot be reopened for a second scoring pass.

This is an experimental selectable engine with restart recovery, not an
active-active cluster or a seamless failover system. A killed owner can cause
about 15 seconds of interruption plus reconnection/backoff/admission time. Room
state expires after two hours without a control transition. A crash may make an
unanswered player miss a still-running deadline. Redis loss cannot be repaired
from process memory; default AOF every-second fsync can lose recent writes on a
VM/storage failure. Media, TLS/CDNs, browser performance, sustained churn,
multiple huge rooms and long soaks need deployment-specific validation.

## Checks

Run without an active capacity benchmark; these intentionally inject rejects and
kill/restart the native child in the isolated lab:

```powershell
docker compose -f tools/stresstest/lab/compose.yaml exec -T -e RUST_FIXTURE_OUTPUT=/results/rust-grading.json api python /rust-source/generate_fixtures.py
./tools/realtime-rust/build.ps1 -Test
docker compose -f tools/stresstest/lab/compose.yaml exec -T api python /rust-source/test_protocol.py
docker compose -f tools/stresstest/lab/compose.yaml exec -T api python /rust-source/test_integration.py
docker compose -f tools/stresstest/lab/compose.yaml exec -T api python /rust-source/test_limits.py
node tools/realtime-rust/test_browser.mjs
docker compose -f tools/stresstest/lab/compose.yaml exec -T api python /rust-source/test_recovery.py
docker compose -f tools/stresstest/lab/compose.yaml -f tools/stresstest/lab/compose.rust.yaml run --rm --no-deps -v "${PWD}/tools/realtime-rust:/rust-source:ro" --entrypoint python runner /rust-source/test_reconnect_load.py --users 1000
node tools/realtime-rust/test_browser.mjs --polling
# Destructive to the lab Redis connection (stalls it for up to 14 s); run last:
docker compose -f tools/stresstest/lab/compose.yaml exec -T api python /rust-source/test_redis_outage.py
```

The fixture generator compares real Python grading rules and canonical Lua.
Set `RUST_FIXTURE_OUTPUT=/results/rust-grading.json` when the source mount is
read-only, then copy it to `tests/grading.json` if updating fixtures. The HTTP
integration check creates a disposable local account/quiz for the browser test;
its credentials live only in ignored lab results. Native tests do not contact
the VM.
