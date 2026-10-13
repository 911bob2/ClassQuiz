# ClassQuiz capacity assessment

Inspected on **2026-10-13** through `ssh my-vm`, followed by a user-hosted live
100-player test. No ClassQuiz settings or deployment services were changed.
The live test created normal player and answer records through gameplay.

## Expected capacity of the current deployment

**The live 100-player test sustained all connections but lost 16.7% of answers.**
The earlier 100–300-player performance hypothesis is not a reliable gameplay
capacity estimate. Fix answer storage before increasing player counts: even
spread answers already exposed silent loss at 100 players. Connected sockets
alone are not proof that gameplay works correctly.

| Requested players | Current expectation |
| --- | --- |
| 10 | Likely comfortable for ordinary gameplay; verify results in burst mode too. |
| 100 | Measured: responsive delivery and no disconnects, but 167 of 1,000 submitted answers were absent from final results. |
| 1,000 | Not a dependable target as deployed. The API is near its file limit before CPU and gameplay hot paths are considered. |
| 10,000 | Cannot all remain connected to the current API worker. Its file limit is an order of magnitude lower. |

There is no defensible media capacity number without knowing asset sizes and VM
network throughput. For example, 1,000 cold players each downloading a 1 MiB
image require about 1 GiB of outgoing data for that display. The VM also hosts
other applications, including Authentik, and shares its resources with them.

## Live 100-player measurement

Room 280514 ran for 3 minutes 12 seconds with ten questions, a 30-second join
ramp, random answers delayed 0.5–5 seconds, media downloads and automatic
transport selection. All 100 bots received each question and completed an
answer transport write. Final results retained only 833 of 1,000 answers;
individual questions retained 74–93. A read-only Redis check during the run
confirmed the same counts for the first five questions. There were no unexpected
disconnects, rejoins or reported connection failures. This is consistent with
the non-atomic answer-list updates described below.

| Metric | Observed result |
| --- | --- |
| Connection setup | Median 123 ms; p95 199 ms; maximum 1.14 seconds. |
| Lobby join after connection | Median 27 ms; p95 39 ms. |
| Question receipt spread | All 100 bots received each question within 21–39 ms of the first bot. This is not host-click-to-player latency. |
| API CPU | Sample average 25.7% of one core; sampled peak 104.5% of one core. |
| API memory | Sampled peak 219.7 MiB. |
| Whole VM CPU excluding steal | Sample average 22.6%; sampled peak 40.3% across four vCPUs, including other applications. |
| VM CPU steal | Sample average 9.1%; sampled peak 19.0%. Hypervisor contention consumes potential CPU time. |
| VM available RAM | Minimum 11.77 GiB. |
| API open files | Sampled peak 123; soft limit 1,024. |
| Generator CPU | Sample average 1.5% of one core; sampled peak 6.9%. |
| Generator memory | Sampled peak RSS 106.1 MiB; Go heap 47.1 MiB. |
| Generator answer scheduling | p95 delay 0.72 ms; maximum 2.05 ms beyond the chosen response delay. |

There were 38 server samples at approximately five-second intervals; shorter
CPU and memory spikes may be missed. Docker CPU uses one core as 100%. The JSON
monitor's `vm_cpu_percent` includes steal time (31.7% average, 49.8% peak);
the table subtracts the steal reading from each sample to describe executing
CPU work. VM figures include other services and monitoring overhead.

Media mode downloaded 29.74 MiB across 100 requests. This was Kahoot mode, whose
player screen does not display question media; this test does not establish
capacity for image/video-heavy classic gameplay. Gameplay payload traffic was
13.78 MiB received and 0.11 MiB sent by the generator, excluding framing/TLS.

Local run artifacts are saved under `tools/stresstest/reports/` (ignored):
`vm-280514-100-realistic.json` and its readable Markdown summary. The tool exited
with status 1 because final-result verification detected missing answers.

## Facts observed on the VM

| Item | Observation |
| --- | --- |
| Virtual CPUs | 4, KVM/QEMU x86-64. Virtual model/frequency do not establish actual host CPU performance. |
| RAM | 15,993 MiB total, approximately 12,263 MiB available at the initial inspection. |
| Swap | None. |
| Disk | 145 GiB filesystem, approximately 82 GiB free. |
| API | Python 3.13, one Gunicorn/Uvicorn worker, `MAX_WORKERS=1`. |
| API baseline memory | Approximately 208 MiB for the container. |
| API open files | Soft limit 1,024; hard limit 524,288. Approximately 15 descriptors were already open in the worker during inspection. |
| Gateway | Nginx with four workers and `worker_connections 1024` per worker; process soft file limit 1,024. |
| TLS proxy | Nginx Proxy Manager, four workers; no explicit `worker_connections` override; process soft file limit 1,024. |
| Redis/Valkey | About 1.55 MiB logical memory at baseline; `maxclients=10000`; seven connections at inspection. Browser players do not each open a Redis connection. |
| Protocol | `python-socketio 5.14.2`, `python-engineio 4.12.3`, `uvicorn 0.38.0`. |
| Source parity | The deployed socket server and answer helper SHA-256 hashes matched the local source. |

Each open WebSocket consumes an API socket descriptor. Redis/database sockets,
the host and ordinary requests consume additional descriptors. Therefore 1,024
is an upper limit on **all open files**, not an allowance for 1,024 players.
Polling and media requests can consume more connections.

Nginx connection limits also count upstream connections. Proxying a player
usually requires both a client-facing and an upstream connection in each proxy
layer. Nginx's documented default for `worker_connections`, when absent, is 512.
See the [Nginx core documentation](https://nginx.org/en/docs/ngx_core_module.html#worker_connections).

## Why the game scales poorly before RAM is exhausted

The relevant path is `classquiz/socket_server/__init__.py`, with answer checks in
`classquiz/socket_server/helpers.py`.

* **An answer causes a global broadcast.** `submit_answer` emits `player_answer`
  without a room or recipient. Every connected socket receives a notification
  for every answer, including sockets in other lobbies. Approximately 1,000
  answers from 1,000 players produce one million deliveries; 10,000 produce one
  hundred million, before results and heartbeats.
* **Joining also creates quadratic traffic.** The connection handler broadcasts
  `session_id` globally. Sequentially establishing N connections results in
  roughly N(N+1)/2 event deliveries. At 10,000 connections that is around fifty
  million notifications just from connecting.
* **Every submission reprocesses the answer list.** Duplicate detection loads,
  parses and scans all current answers. Storage then loads the list again,
  appends the answer, serializes it and replaces the entire Redis value. As a
  question fills, total work grows roughly quadratically with player count.
* **Concurrent writes can silently lose answers.** The Redis GET/modify/SET
  sequence is not atomic. Two handlers can read the same list, append different
  players and overwrite one another. Sockets may remain connected and no error
  event needs to occur. This is why recorded-answer checks are necessary.
* **One API worker handles this work.** Four VM CPUs do not imply four workers
  processing the gameplay path. Media adds API/DB metadata requests and object
  storage/network traffic on top of gameplay.

Merely connecting 1,000 idle sockets after raising limits would not demonstrate
that a 1,000-player quiz can accept and retain simultaneous answers.

## Generator measurements on this PC

The PC has a Ryzen 9 9900X3D, 24 logical processors and approximately 31.1 GiB RAM.
Separate-process local fixtures were used so server resource use was excluded
from the generator samples. Each test ran for 20 seconds, joining over five
seconds, through unencrypted WebSockets with normal heartbeats.

| Players | Joined | Unexpected disconnects | Peak sampled RSS | Peak Go heap | Peak sampled CPU, relative to one core |
| --- | --- | --- | --- | --- | --- |
| 10 | 10 | 0 | 49.0 MiB | 1.3 MiB | 0.0% |
| 100 | 100 | 0 | 55.5 MiB | 2.9 MiB | 1.2% |
| 1,000 | 1,000 | 0 | 100.0 MiB | 15.6 MiB | 17.8% |
| 10,000 | 10,000 | 0 | 498.4 MiB | 120.2 MiB | 125.3% |

All four tests passed. The 10,000-player check was rerun after reusing packet
reader buffers; the table uses that final run. Sampled memory is a lower bound on instantaneous peaks.
The 100-player run had one approximately 68 ms sampler delay; the 1,000 and
10,000-player checks had sub-millisecond sampler delays. These short checks do
not establish long-duration stability.

The fixture deliberately omits ClassQuiz's global broadcasts, Redis operations,
TLS and media. Those additions increase CPU, bandwidth and potentially memory.
This establishes that the generator can maintain 10,000 lightweight independent
connections on this PC; it does **not** establish 10,000-player VM capacity or
guarantee the PC can consume the application's quadratic traffic.

Interoperability tests separately passed against the deployed Socket.IO,
Engine.IO and Uvicorn versions for polling, direct WebSocket and upgrade, all
six answer types, reconnect and observer replacement, media redirects/ranges,
cache reuse, stale timer cancellation, rejections, silent answer loss and
duplicate records. Upgrade rejection correctly falls back to polling, and two
successive reconnects use the latest accepted SID. Read-only SSH monitoring also
passed against `my-vm`. The native Windows executable was additionally checked
with Ctrl+C: all ten clients closed and the JSON report recorded zero unexpected
disconnects.

Large media runs create additional HTTP sockets. A single load generator IP can
hit local ephemeral-port, network or NAT limits even when actual players spread
across many devices would not. Check generator resource/lag metrics and reported
network errors before attributing every failure to the VM.

## Measuring actual quiz capacity

1. Create a fresh CAPTCHA-disabled lobby with a representative quiz containing
   at least ten questions. Start with gameplay-only spread answers.
2. Run 10, 100, 200, 300, 500 and then higher counts using a **new lobby for each
   run**. For example, from the repository root:

   ```powershell
   New-Item -ItemType Directory -Force ./tools/stresstest/reports | Out-Null
   ./stresstest.exe --target https://quiz.911bob.dev --users 100 --code 123456 --monitor-ssh my-vm --output ./tools/stresstest/reports/vm-100-spread.json
   ```

3. Wait for joins to settle before starting. Give spread answers at least five
   seconds on each question, then reveal its results. Reveal final results at
   the end. Check unique joins, unexpected disconnects, server errors, missing
   recorded answers and delivery spread together.
4. Repeat promising counts with `--answer-mode burst`. Then repeat with
   `--traffic media` using the actual images/video intended for classes.
5. Repeat the largest count with no errors or disconnects and complete recorded
   answers for a longer session. Report how much question delivery spread
   increased; the tool does not invent a strict latency threshold.
6. Compare API file usage/CPU, proxy limits, VM available memory and steal with
   generator CPU/lag. A clean smaller run and failing larger run bracket capacity.
   Narrow that interval rather than treating the first arbitrary tested count as
   an exact maximum.

Ctrl+C closes connections but does not clear the current server's Redis player
set. Reusing a lobby can retain stale players, distort counts and prevent
`everyone_answered`. Final result verification cannot diagnose questions whose
results were never received; those are reported as unverified.

## Recommendations for a future server-tuning task

These are recommendations only; none were applied:

* Scope `player_answer` to the host/admin room, and `session_id` to its own socket.
* Store answers by player with an atomic duplicate-check/insert, instead of
  repeatedly rewriting the whole list. Maintain answer counts separately and
  create result arrays when requested.
* Remove disconnected players or explicitly track connected versus retained
  identities without breaking rejoin support.
* Raise API and both proxy layers' file/connection limits together, then verify
  the running processes inherited them. Raising one layer alone is insufficient.
* Keep a single API worker until cross-worker Socket.IO room/broadcast support
  is implemented. The current server uses an in-memory Socket.IO manager;
  increasing workers alone can split players and their host across isolated
  rooms. Shared Redis game records do not solve room delivery. Polling across
  workers also needs session affinity.

After those changes, repeat the same tests. A dependable player capacity has
not yet been established for either the current or a modified implementation.
