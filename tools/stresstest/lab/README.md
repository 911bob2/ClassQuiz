# Local ClassQuiz performance laboratory

This runs the real ClassQuiz API, production frontend build, nginx, PostgreSQL,
Valkey and Meilisearch from this worktree. It never connects to the public VM.
The server is available at **http://127.0.0.1:18088/play**.

The benchmark controller seeds a synthetic lobby into the disposable local Redis
database, then uses the real host Socket.IO events to register, start, advance,
reveal results and end the quiz. Players use the existing Go load generator.
Seeding skips account/login/editor setup; player handling, answer validation,
scoring, persistence, HTTP metadata and result delivery use the real application.
There are no real user accounts or production secrets in this lab.

## Resource model and limits

All six server containers share CPU affinity **0–3**: together they cannot run on
more than four logical CPUs. Gunicorn retains **one Uvicorn worker**, as on the
VM. The runner uses CPUs **4–7**. There is no CPU quota that periodically freezes
the worker. Service memory caps total 7 GiB, well above observed use; no memory
pressure was observed. Other applications on the PC can still contend for these
CPUs. The PC's Ryzen 9 9900X3D is not speed-equivalent to a rented VM vCPU.

Default API nofile is deliberately 65,536 so algorithm tests can reach 1,000
sockets. `LAB_NOFILE=1024` reproduces the VM's separate descriptor limit. The lab
nginx uses four workers / 16,384 connections each and reuses upstream HTTP
connections. These limits were raised for the 10,000-player investigation; the
earlier capacity report used 4,096 connections/worker and a 256 MiB proxy cap.
The lab does not reproduce the
shared outer Nginx Proxy Manager, TLS, S3, public networking or VM CPU steal.
The quiz contains at least ten small ABCD questions, with no media. The built
frontend is served, but the headless host does not measure browser rendering.
The background export/import worker is not required by these gameplay tests.

## Build and start (PowerShell, repository root)

```powershell
$env:GOOS = 'linux'
$env:GOARCH = 'amd64'
Push-Location tools/stresstest
go build -trimpath -o lab/results/stresstest .
Pop-Location
Remove-Item Env:GOOS, Env:GOARCH
docker compose -f tools/stresstest/lab/compose.yaml build
docker compose -f tools/stresstest/lab/compose.yaml up -d
```

Wait for `http://127.0.0.1:18088/play` to return 200. All services are restricted
to the lab network; only nginx publishes a loopback port. Never expose this
configuration publicly: it has fixed development credentials and unprotected
instrumentation endpoints.

## Run and compare

```powershell
./tools/stresstest/lab/modes.ps1 -Suffix my-run
python tools/stresstest/lab/compare_modes.py tools/stresstest/lab/results/basic-300-my-run.json tools/stresstest/lab/results/large-1000-my-run.json
# A single optimized room:
docker compose -f tools/stresstest/lab/compose.yaml run --rm runner --users 1000 --questions 10 --ramp 15 --large-audience --label large-custom
# Same gameplay with a 100-question quiz loaded in memory:
docker compose -f tools/stresstest/lab/compose.yaml run --rm runner --users 1000 --questions 10 --quiz-questions 100 --large-audience --label large-long-quiz
# Mixed ABCD, RANGE, TEXT, CHECK, ORDER and VOTING questions:
docker compose -f tools/stresstest/lab/compose.yaml run --rm runner --users 50 --questions 12 --mixed --large-audience --label large-mixed
docker compose -f tools/stresstest/lab/compose.yaml exec -T api python /lab/test_engine.py
node tools/stresstest/lab/ui_checks.mjs
```

Each player chooses an answer after a random **0–500 ms** delay. Automatic
polling-to-WebSocket upgrade, compression and Engine.IO heartbeats stay enabled.
The installed Uvicorn auto-selection uses wsproto, which has no separate
automatic WebSocket ping loop; clients still respond to WebSocket control pings.
Every run uses a fresh lobby. The Go report verifies results by
player identity; the controller independently checks Redis record counts and
unique players. The ten-question runs exercise final result payload growth.
The runner exits nonzero for failed/incomplete runs. Every player must receive
each question result and fully drain final results. `modes.ps1` keeps going after
an unsuccessful run so its report can be inspected. Both room modes use the
implemented production source; `LAB_PATCHES=baseline` adds instrumentation only.
`--quiz-questions` changes the loaded quiz size without changing played rounds;
`--mixed` exercises all six answer types. `--answer-max` and `--round-pause`
control answer spread and time spent between result screens.

The comfort criterion is: exact answer integrity and result receipts, observed
round p95 all-stored and all-recipient question results <=1,000 ms, all-recipient
final results <=1,000 ms, observed gameplay HTTP p95 <=100 ms and average API
gameplay CPU <=70% of one core. The answer wave itself spans 0–500 ms. These are
local engineering targets, not a VM capacity guarantee. Ten-round p95 is the
worst observed round, not a population percentile. See [CAPACITY.md](CAPACITY.md).

## Historical bottleneck experiments

The original experiment below targets **commit `50c6dd16`**, before production
fixes existed. `ANALYSIS.md` and `measurements.json` preserve those findings.
Non-baseline `LAB_PATCHES` are rejected when the implemented delivery engine is
present. To reproduce an old ablation, use that base in a separate checkout with
the lab files; do not combine monkeypatch prototypes with the implemented modes.

On that historical base, `LAB_PATCHES` enabled runtime-only experiments in
`lab_app.py`, without editing production files:

| Value | Experiment | Limitations |
| --- | --- | --- |
| `baseline` | Original handlers plus instrumentation | Default |
| `scoped` | `session_id` only to its socket, `player_answer` only to the room's admins, `everyone_answered` only to its quiz | Adds a Redis session read for destination lookup; production code can use the already-loaded session |
| `indexed` | Replace full answer-list scan with an atomic set admission | **Not a deployable fix.** Reservation is separate from score/answer commit and can survive a crash or invalid answer. Production needs a single validated atomic commit and TTLs |
| `atomic` | One Lua commit for deduplication, answer append, score increment, expiry and count | Preserves answer/result schema; still a prototype requiring in-transaction question/deadline guards and lifecycle/retry/migration tests |
| `cached` | Prototype single-process game cache | Not part of the main comparison; lacks distributed invalidation and retains deep-copy cost |
| `compact` | Full question/final answer arrays go only to the host | **Feature-removal experiment**, not a ready protocol: players receive no personal/rank/result UI. Go result verification is unavailable, so Redis and host verification are used |

Combine with commas, then recreate the API to apply a change:

```powershell
$env:LAB_PATCHES = 'scoped,indexed'
docker compose -f tools/stresstest/lab/compose.yaml up -d --no-deps --force-recreate api
```

To profile one run, add `--profile` to the runner. This saves cProfile output to
`results/server.prof` and adds substantial overhead; do not compare its latency
to normal runs. `--profile-phase answer_0` profiles just the first answer wave
instead and writes `results/server-answer_0.prof`. Current scale runs also record
per-phase Redis CPU/command/network counters, answer-stage await durations,
connection counts, and Python cyclic-GC pauses. Await durations overlap and must
not be added together as CPU time. Microbenchmarks and a duplicate-submission regression probe:

```powershell
docker compose -f tools/stresstest/lab/compose.yaml exec -T api python /lab/microbench.py
docker compose -f tools/stresstest/lab/compose.yaml run --rm --no-deps --entrypoint python runner /lab/fuzz.py
```

## 10,000-player experiments

These switches are lab-only and never imported by the deployed application.
The normal worker and fresh-Redis answer context remain the defaults.

```powershell
# Current optimized mode; the two-minute ramp isolates gameplay from admission.
./tools/stresstest/lab/modes.ps1 -Runs @('large:10000') -Suffix scale -Questions 3 -ExtraArgs @('--ramp','120','--idle','10')

# Install a pinned alternate event loop in ignored lab results, not the image.
docker compose -f tools/stresstest/lab/compose.yaml run --rm --no-deps --entrypoint python runner -m pip install --only-binary=:all: --target /results/scale-python uvloop==0.22.1
$env:LAB_WORKER = 'lab_worker.UVLoopWorker'
./tools/stresstest/lab/modes.ps1 -Runs @('large:10000') -Suffix uvloop -Questions 3 -ExtraArgs @('--ramp','120')

# Single-worker session/question cache prototype; Lua admission is unchanged.
$env:LAB_SCALE = 'cached-context'
./tools/stresstest/lab/modes.ps1 -Runs @('large:10000') -Suffix cached -Questions 10 -ExtraArgs @('--ramp','120')
Remove-Item Env:LAB_WORKER,Env:LAB_SCALE

python tools/stresstest/lab/scale_report.py tools/stresstest/lab/results/large-10000-scale.json
```

The cache prototype lacks cross-worker invalidation. It is a measurement of the
cost of repeated state lookups, not a deployable distributed engine. Existing
generation/deadline/membership/deduplication guards remain in the Redis Lua commit.
Garbage collection and heartbeats are not disabled by either experiment.
`LAB_SCALE=cached-context,sparse-full-gc` additionally sets GC thresholds to
`(700, 10, 100000)` to measure the cost of full-graph scans. Young collections
remain active. This is not a production recommendation: retained old cycles,
memory pressure and explicit cleanup need a churn/soak design. The controller's
host WebSocket message cap is 64 MiB so ten thousand full histories do not hit
aiohttp's unrelated 4 MiB default.

## Rust realtime prototype

The opt-in [Rust engine](../../realtime-rust/README.md) is a Linux binary
supervised by Python. It handles real Socket.IO clients and commits each answer
through the same authoritative Redis Lua script. The ordinary engine remains
the default. Read the prototype's limits before using this local lab override.

```powershell
./tools/realtime-rust/build.ps1
docker compose -f tools/stresstest/lab/compose.yaml -f tools/stresstest/lab/compose.rust.yaml up -d
./tools/stresstest/lab/rust.ps1 -Users @(10000,30000) -Suffix mine -Questions 10 -Ramp 120
# Restore the ordinary Python engine and proxy after testing:
docker compose -f tools/stresstest/lab/compose.yaml up -d --no-deps --force-recreate api proxy
```

The [10,000/30,000-player report](../../realtime-rust/BENCHMARK.md) records six
clean ten-round trials, including one Rust worker and immediate-answer controls.
Later trials use independent fixed-rate HTTP probes in addition to the original
host-loop probes. Their measurements and resource definitions are documented
in that report.

## Measurement definitions

- `all_stored_ms`: host's question-send time until an independent Redis poll
  sees all records. Includes question delivery, think time, submission and
  persistence; polling resolution is about 50 ms. **Not an answer ACK RTT.**
- `host_results_ms`: in current mode runs, the host's reveal-request until its
  result event and handler ACK arrive, including scheduling player delivery.
  Historical runs used only the host event. Prefer `all_question_results_*`
  from `compare_modes.py` when assessing delivery to every player.
- HTTP samples: sequential metadata requests with a 100 ms pause after each
  completion. Slow intervals yield fewer samples (coordinated omission), so
  these percentiles describe observed probes, not a fixed-arrival workload.
- Event-loop lag: a 20 ms timer's excess delay. HTTP can remain queued for much
  longer than any single timer delay when many tasks share a busy worker.
- CPU: API process CPU / wall time between 0.5 s samples, relative to **one
  core**. Per-phase CPU excludes intervals crossing a phase boundary. RSS is
  the process lifetime high-water mark; the API is recreated between variants.
- Instrumented async stage/Redis wall times include waiting and overlap across
  handlers. **Do not add them up as CPU time or blame Redis execution from them.**
- Byte counts in the Go report are decoded application payload, excluding
  WebSocket/HTTP/TLS framing and compression. They are not wire throughput.
- Historical Go runs stopped once the elected observer verified finals, making
  aggregate final traffic a lower bound. Current mode comparisons use
  `--wait-all-results`; report timestamps/counts track the last recipient. Raw
  decoded bytes therefore include every player's final payload. Clients remain
  headless: they do not measure browser JSON parsing, layout or painting.
- The controller changes phase after observing persisted answers, while
  notifications may still be queued. Work can cross phase boundaries. Use the
  aggregate emit counts for the entire run and the user-visible response times.

An initial `baseline-1000` exploration hit an old five-minute client duration
after nine submitted rounds. Its tenth round had no active bots; it is retained
for diagnosis, **excluded from complete-run comparisons**, and superseded by
`baseline-1000-three`. The runner now allows fifteen minutes.

## Stop and restore baseline

```powershell
Remove-Item Env:LAB_PATCHES, Env:LAB_NOFILE, Env:LAB_WORKER, Env:LAB_SCALE -ErrorAction SilentlyContinue
docker compose -f tools/stresstest/lab/compose.yaml up -d --no-deps --force-recreate api
docker compose -f tools/stresstest/lab/compose.yaml stop
```

`stop` preserves local data. Raw reports, profiles, binaries and logs live under
ignored `results/`. The analysis and compact measurement table are tracked
separately for review.
