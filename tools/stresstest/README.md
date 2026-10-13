# ClassQuiz stress test

A standalone Go executable that joins an existing lobby as independent anonymous
players and submits random answers. No Python, browser, login or server changes
are required to run it. Use the normal host UI to start and advance your quiz.

## Quick start

The Windows executable is built at the repository root:

```powershell
./stresstest.exe --target "https://quiz.911bob.dev" --users 1000 --code 123456 --verbosity 1
```

Create a fresh lobby with CAPTCHA disabled. Replace `123456` with its real room
code. Wait until the progress output shows the active player count you want,
then start the quiz. Reveal results after each question, and reveal final
results before ending the run to verify that the submitted answers were stored.
Ctrl+C stops the test and prints the report. Final results also stop it.

Add media traffic, or make every player answer immediately:

```powershell
./stresstest.exe --target "https://quiz.911bob.dev" --users 100 --code 123456 --traffic media --answer-mode burst --monitor-ssh my-vm --output ./tools/stresstest/reports/run-100.json
```

`--output` creates parent directories and writes the report on exit. For an ordinary timing distribution, omit
`--answer-mode burst` or use `--answer-mode spread --answer-min 500ms --answer-max 5s`.

On Linux, copy `bin/stresstest-linux-amd64` to a machine with sufficient capacity,
name it `stresstest`, make it executable, and use the same arguments:

```sh
chmod +x stresstest
./stresstest --target https://quiz.911bob.dev --users 1000 --code 123456
```

## Flags

| Flag | Default | Purpose |
| --- | --- | --- |
| `--target` | required | HTTP(S) origin, optionally with an installation path prefix. |
| `--users` | required | Number of bots, from 1 to 1,000,000; 10,000 is a normal supported test size. |
| `--code` | required | Six digits; leading zeroes are preserved. |
| `--traffic gameplay\|media` | `gameplay` | Player protocol, optionally with media downloads. |
| `--answer-mode spread\|burst` | `spread` | Random think time or immediate submission. |
| `--answer-min`, `--answer-max` | `500ms`, `5s` | Spread delays; shortened for short question timers. |
| `--ramp-up` | `30s` | Period over which bots start; use `0s` for a connection burst. |
| `--join-concurrency` | `128` | Limit concurrent metadata requests and transport setup. |
| `--transport auto\|websocket\|polling` | `auto` | Polling followed by upgrade, direct WebSocket, or polling only. |
| `--timeout` | `20s` | Metadata/media, transport setup, writes and join-confirmation timeout. |
| `--duration` | unlimited | Optional time limit including ramp-up; e.g. `5m`. |
| `--verbosity` | `1` | `0`: final summary; `1`: progress every 5 seconds; `2`: each connection/failure; `3`: events/media requests; `4`: packet samples. |
| `--monitor-ssh` | off | SSH config alias, such as `my-vm`, for optional VM monitoring. |
| `--output` | off | Final JSON report path, also written on Ctrl+C. |
| `--seed` | random | Reproduce answer/think-time randomness. Names remain unique per run. |
| `--custom-field` | bot name | Value for the lobby's custom player field, if present. |

The executable reports failure groups and sample reasons even at verbosity 0.
Trace samples are capped at 4 KiB, session/time-sync tokens and signed URL
credentials are redacted, and logs use a bounded queue. If console output cannot
keep up, the report includes the number of dropped log lines. Trace logging can
materially change the load generator's CPU use; use verbosity 0 or 1 for capacity
runs, and 3 or 4 for diagnosing smaller runs.

Exit codes: `0` completed without detected failures; `1` test failures, rejected
players, unexpected disconnects or verified answer loss/duplicates; `2` invalid
arguments or inability to write the report. An unverified answer is explicitly
marked unverified, and is never counted as accepted. A run with no questions is
a connection-only test.

## Player fidelity

Each bot has its own Engine.IO/Socket.IO session, random name, cookies, question
state and answer timer. It follows ClassQuiz's anonymous `/users/me` and lobby
metadata requests, joins through `join_game`, echoes the encrypted `time_sync`
value, and uses `rejoin_game` with the last accepted Socket.IO SID after a network
disconnect. Reconnects back off from one to five seconds with jitter until the
run ends. Server rejections and kicks terminate the affected player.

ABCD and VOTING select an actual answer string; RANGE selects an integer within
the advertised bounds; TEXT submits a generated guess; ORDER sends the frontend's
`answer: "a"` plus a shuffled `complex_answer`; CHECK sends ascending selected
indices, matching the current UI's four selection slots. Slides require no
answer. Revisiting an answered question does not cause another submission.
Rejoining waits for the next question broadcast, as the current server does not
replay an active question to reconnecting players.

`auto` performs Engine.IO polling setup, probes and upgrades to WebSocket before
joining the default Socket.IO namespace. If the upgrade HTTP request is rejected,
it continues polling. The namespace connection and all gameplay events use the
same server handlers as browser players. Only the text protocol and default
namespace used by ClassQuiz are implemented; binary events and custom namespaces
produce clear protocol errors. Server packets are streamed with a 256 MiB limit.

`gameplay` omits frontend HTML, JavaScript, fonts, rendering and static assets.
`media` adds the lobby cover and question media visible in normal mode; the
Kahoot player UI does not display question media. It calls the same storage info
and download routes and follows same-origin signed object redirects. Completed
images and video prefixes are cached independently for each bot; repeated
question media still performs its info request. Video requests use
`Range: bytes=0-1048575` and consume at most 1 MiB even if the server ignores
Range. Downloads stop when their question ends. This approximates cold player
downloads, not browser video playback or exact browser cache policy. Third-party
redirects are blocked; this tests the supplied target only.

## Reading the report

* `joined` counts players with a `joined_game` confirmation. `active` counts
  joined players whose current connection remains open. Rejoins do not increase
  the unique joined count.
* `answers_sent` counts completed transport writes. The server provides no
  positive per-answer acceptance event. `player_answer` is a global notification
  and cannot acknowledge an individual bot's submission.
* `answers_recorded` matches submitted bot identities against returned results.
  Missing and duplicated identities expose silent storage failures. Other human
  players' rows are ignored. Question-result snapshots have no question index,
  so they are associated with the observer's currently displayed question.
  Indexed final results supersede these snapshots and confirm questions absent
  from the result object as having no recorded answers.
* `delivery_spread` measures receipt time relative to the first bot receiving
  that question. It excludes the delay from clicking Next to the first receipt.
  Percentiles use bounded logarithmic histograms with about 10% precision.
* Generator heap/RSS, CPU, goroutines, payload traffic and timer lag help identify
  local bottlenecks. CPU is expressed relative to one core, so it can exceed 100%.
  Payload byte counts exclude HTTP, WebSocket and TLS framing.
* An elected live observer streams result arrays once while other bots receive and
  drain them. Memory for per-question identity tracking uses bitsets; the tool
  does not retain every frame, answer text or duplicate result history.

Optional SSH monitoring uses your installed `ssh` command, SSH config/key and
noninteractive authentication. It requires Python 3 and Docker access on the VM.
It discovers Compose projects containing `classquiz`, samples container CPU/RAM
and network totals, VM memory/CPU/steal, API open files/limits and Redis stats.
Commands are read-only. Monitoring errors do not interrupt players. Generator
and server samples retain the most recent hour; lifetime counters remain intact.

Use a fresh lobby for every independent test. Ctrl+C closes sockets, but the
current ClassQuiz server does not remove disconnected players from its Redis
membership set. Reusing the same room accumulates stale members and can distort
`everyone_answered` and host UI counts. This tool does not delete server data.

See [CAPACITY.md](CAPACITY.md) for the inspected VM, estimates, generator checks
and a repeatable live testing procedure.

## Build and verify

Go 1.26 is installed on this PC. From the repository root:

```powershell
./tools/stresstest/build.ps1
```

This creates `stresstest.exe` at the repository root and the Linux amd64 binary
inside `tools/stresstest/bin`. Build artifacts and test dependencies are ignored
by Git and excluded from ClassQuiz Docker build contexts.

To build on Linux:

```sh
cd tools/stresstest
go build -trimpath -o stresstest .
```

Ordinary unit checks do not require Python. Optional interoperability tests use
the VM's exact Socket.IO/Engine.IO/Uvicorn versions in an isolated environment:

```powershell
cd tools/stresstest
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r testdata/requirements.txt
go test -v ./...
go vet ./...
```

Tests automatically find this `.venv`; use `STRESSTEST_PYTHON` to select another
fixture interpreter. On Linux use `.venv/bin/python` for the pip command.
`go test -race ./...` also checks races when a supported C compiler is available.

Opt into resource checks with a separate-process loopback fixture:

```powershell
$env:STRESSTEST_SCALE = '10,100,1000,10000'
go test -v -run '^TestScale$' -count=1 -timeout 4m ./...
Remove-Item Env:STRESSTEST_SCALE
```

Each count runs for 20 seconds, joins over five seconds, and writes a JSON report
in `reports/`. These are idle, unencrypted WebSocket client checks against a
simple Go fixture that deliberately omits ClassQuiz's quadratic broadcasts and
Redis writes. They do not measure VM gameplay capacity.
