# Selectable Rust engine: integration and recovery validation

Implemented and tested locally on 2026-10-15 in the existing
`codex/load-bottleneck-analysis` worktree. No changes were deployed to the VM.
The built-in user guide is `/docs/large-audiences`, linked from the host dialog.

## What changed after the prototype

- Explicit engine selection at room creation, health-based availability, metadata
  endpoint selection, separate proxy paths, and rejection of incompatible modes.
  Python rooms remain on their own engine alongside native rooms.
- A packaged binary and dedicated Python supervisor service, bounded restart
  backoff, readiness, graceful shutdown, and a single global owner per Redis DB.
- Atomic lease and game-generation fencing on native writes; the canonical
  admission Lua still validates identity/SID, token/index, uniqueness, clock and
  deadline/grace, then appends the answer and updates the score.
- Persisted phases, original question clocks/tokens, stable admission/resume
  identities, atomic per-player answer recovery index, acknowledgements and
  browser retry of unacknowledged answers. Host refresh restores its roster,
  control state and results; the same tab can replace a stale host connection.
- Bounded parallel admissions with a room read/write lock, no such lock on answer
  submission, room-scoped TTL registries, inactive/expired cache cleanup and clean
  PIN reuse. Final state is terminal; repeated opening does not restart a round.
- Host result pages contain 50 rows, rather than sending a ten-round 30 MB full
  history to one browser. Full records remain available for exports and saving.
- Authenticated idempotent result saving, frozen export metadata/answers, PIN
  binding, and spreadsheet assembly outside the API event loop. Old exports
  remain their original snapshots after room expiry or PIN reuse.
- Host generation secrets are absent from player metadata. The deprecated public
  token lookup is disabled, Python rejects native-room socket admission/control,
  native Origin enforcement is configurable, and queues/inputs/admission are bounded.

## Capacity with recovery enabled

Both runs use four native Tokio workers, eight multiplexed Redis connections,
ten small ABCD questions, 0–500 ms think time after each player's receipt, and
one-second result pauses. The server stack shares CPU affinity 0–3; the Go load
generator and controller use 4–7. The Python-plus-Rust container retains its
2 GiB cap, nginx 2 GiB and the generator 4 GiB. Redis/Valkey uses AOF.

| Players | Answers verified | Worst all-stored | All question results p95 | All finals | Independent API p95 | Rust commit p95 | Peak native RSS | Comfort |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 10,000 | 100,000 | 0.730 s | 0.123 s | 0.232 s | 43.8 ms | 8.7 ms | 433 MiB | pass |
| 30,000 | 300,000 | 1.263 s | 0.404 s | 0.550 s | 280.3 ms | 331.3 ms | 1,309 MiB | outside latency targets |

Every player received every result. Both runs had zero duplicate records,
unexpected disconnects, native errors/rejections and emit errors. Admission
ramps were 60 and 120 seconds. Direct native health p95 was 2.4 and 13.7 ms.
Native gameplay CPU averaged 57% and 113% of one core; including Python gives
60% and 117%. Redis and nginx also share the CPU budget and are excluded from
those runtime figures. These are averages including result pauses, not peak CPU.

All-stored includes question delivery, reaction time and persistence; it is not
individual answer RTT. Count polling resolution is about 50 ms. All-result times
end at the final recipient. Ten-round p95 is the worst observed round. Independent
fixed-rate 10 Hz probes avoid host JSON-decoding delays; the older host-loop
probes are retained too. Runtime CPU is sampled per process, including the live
Rust child. The PC has a Ryzen 9 9900X3D; four logical CPUs do not emulate the
VM's CPU speed or steal time. Other PC workloads varied.

The targets remain 1 s all-stored/all-player results and 100 ms HTTP p95, with
headroom in the runtime CPU budget. Thus the current evidence supports a local
10,000-player comfort target; 30,000 completes correctly with higher latency.
This is one short regression trial at each size, not a capacity guarantee or a
controlled claim that hardening made the prototype faster. The initial six
prototype trials remain separately documented in [BENCHMARK.md](BENCHMARK.md).

## Fault injection and functional evidence

- Shared Python-generated grading fixtures cover six types, Unicode, range
  normalization and invalid values. Unit tests check score bounds and redaction,
  including voting media. Cargo test, rustfmt and Clippy with warnings denied pass.
- Fourteen network checks exercise host authentication, duplicate names, player
  authorization, concurrent retries, stale tokens, authoritative deadlines,
  personal/no-answer results, SID replacement, kick, full exports, repeated open
  and the expiry key registry. Existing Python engine's fourteen checks pass too.
- Authenticated HTTP checks create real database-backed rooms, verify incompatible
  flags, native/Python routing isolation, same-tab host replacement, numeric
  result requests, idempotent saving and actual XLSX content/PIN binding.
- Forced SIGKILL during an active question, result screen and final screen
  preserves the original token/deadline, accepted rows, personal rankings and
  export records. Replacing the owner lease fences old writes, forces an exit
  and restarts safely. Expired rooms cannot be resurrected, reused PINs start
  clean, and old export downloads retain their old snapshot.
- In the separate **1,000-player reconnect wave**, the service was ready 13.067 s
  after SIGKILL and every identity had a new SID by 20.187 s. All 1,000 then
  answered and received final results. The 1,000 disconnects and 3,726 HTTP 502
  attempts during this injected outage are expected recovery traffic and are
  excluded from clean capacity evidence.
- Real Chromium runs create a room through the host setting, join two players,
  kill the child, automatically restore host/player UI state, then reveal, save,
  export and refresh finals, over WebSockets and forced HTTP polling. Mobile
  setting/docs link and built-in docs layout
  are checked against real Svelte sources. No browser runtime errors were seen.
- Both deployment images build. An isolated packaged-service smoke check verifies
  the Python entrypoint, native readiness and rejected cross-origin requests.
  The repository-wide Svelte check still has 45 existing errors in unrelated
  editor/account/dependency files; changed integration files add none.

Compact evidence is in `hardened-measurements.json`. Detailed raw reports,
logs, spreadsheet/browser fixtures and generated binaries remain in ignored
`../stresstest/lab/results/`. See [README.md](README.md) for reproduction commands.

## Boundaries of the claim

This is a production-integrated **experimental** option, not an active-active or
seamless failover service. A killed owner leaves up to 15 seconds of lease time,
plus client backoff/admission; 1,000-player recovery took about 20 seconds in the
measured trial. The clock keeps running, so unanswered players may miss a round.
Accepted-in-Redis is not an fsync-per-answer guarantee: default AOF every-second
fsync has a different VM/storage failure loss window.

Captcha, controllers, old-school presentation, remote host control and the legacy
live-data API are unsupported for native rooms. Live counts lag up to 250 ms;
compression is absent; host viewing is paged. Full history and personal ranks
are retained. Default player/connection/cache caps are resource guards, not
aggregate capacity promises. Media/TLS/uplink limits, many simultaneous rooms,
long quizzes, long soaks, sustained churn and a 10,000/30,000-player reconnect
storm remain deployment-specific validation work.
