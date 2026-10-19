# Native captcha admission

Rust verifies hCaptcha (default) or reCAPTCHA v3 directly. Python is not a proxy
for these requests. Captcha affects initial admission only; answers, scoring,
results and authenticated resumes use their existing paths.

## Configure a real site

Set the same values on the API and realtime services. `deploy/compose.yaml`
passes these from `deploy/.env`; the frontend discovers only public policy at
runtime, so changing keys does not require rebuilding frontend assets.

```dotenv
CAPTCHA_PROVIDER=hcaptcha
CAPTCHA_SITE_KEY=your-public-site-key
CAPTCHA_SECRET_KEY=your-private-secret
CAPTCHA_ALLOWED_HOSTNAMES=quiz.911bob.dev
CAPTCHA_RECAPTCHA_MIN_SCORE=0.5
RUST_CAPTCHA_MAX_CONCURRENT=128
RUST_CAPTCHA_QUEUE=256
RUST_CAPTCHA_RPS=200
```

For Google use `CAPTCHA_PROVIDER=recaptcha_v3`, a **v3 score-based key** and its
legacy secret. The API used here is `siteverify`, not the Google Cloud assessment
API. The action is `classquiz_join`; allowed hostnames are exact, lowercased names
without scheme, path or port. A score of 0.5 is a starting point, not a validated
threshold for this site's visitors. Do not use a v2 checkbox key for v3.

`HCAPTCHA_SITE_KEY` / `HCAPTCHA_KEY` and `RECAPTCHA_SITE_KEY` / `RECAPTCHA_KEY`
remain supported aliases. For older installations the server also accepts
`VITE_HCAPTCHA` / `VITE_RECAPTCHA` as public site-key aliases. Generic names take
precedence. Explicit provider selection avoids ambiguity when both are present.
Absent required configuration disables the host checkbox; the API rejects a
request to create a protected room. `CAPTCHA_PROVIDER=none` explicitly disables
it. Existing rooms retain their policy snapshot. Finish rooms before rotating
keys or changing policy; protected initial joins fail closed if policy no longer
matches the running verifier. Authenticated native resumes continue working.

The secret stays server-side, is sent only to the fixed HTTPS verification URL,
and is never returned in capabilities or persisted in game metadata. Captcha
tokens and resume credentials are not logged. The native metrics expose counts,
queue/provider latency histograms and concurrency, not token contents.

## Admission, limits and failure behavior

`src/captcha.rs` owns pooled asynchronous reqwest/Rustls HTTP, policy validation,
rate/concurrency limits and metrics. The join handler invokes it only for new
players. General admissions and room control locks are released before awaiting
verification. `store.rs` holds the small Lua transactions needed to connect a
proof to atomic admission.

- 128 concurrent verification slots and 256 waiting attempts per native process.
- 200 starts/sec with a 128-token initial burst; two seconds maximum queue wait.
- Two-second connect timeout, five-second total HTTP timeout, no redirects.
- 8 KiB input token and 16 KiB response limits. Malformed, failed, timed-out and
  quota responses fail closed. A retry requires a fresh provider token.
- Redis claims SHA-256 hashes of provider/site/token for 180 seconds before
  contacting the provider. The raw token is not stored. Replay cannot authorize
  another name, room or identity, including across process restarts.
- Successful proof receipts last 60 seconds and bind room generation, username,
  resume identity and public policy. Final admission atomically rechecks process
  ownership, generation, started/full state and membership, then consumes proof.
- A saved receipt can finish an interrupted admission without a second provider
  call. A crash between provider success and receipt storage can require a new
  challenge. Captcha is not an exactly-once transaction across the provider and
  Redis. Authenticated resumes require the saved identity token; socket ID alone
  is insufficient in protected native rooms.
- hCaptcha verifies `success` and errors and sends the expected `sitekey` in the
  request. Its returned hostname is **not** an authentication check: hCaptcha
  documents that it may be `not-provided`. Google verifies success, no errors,
  hostname allowlist, action and finite score within the configured threshold–1.
- The browser loads the selected SDK on demand, permits a challenge when needed,
  displays progress and inline retry errors, and preserves native admission
  identity while retrying. A failed SDK load can be retried without reloading.

At 200 verifications/sec, admission alone needs roughly 50 seconds for 10,000
new players and 150 seconds for 30,000. The bounded queue is not a waiting room
for 30,000 simultaneous requests: excess clients must retry with backoff.
Provider latency, limits and human challenges can dominate those estimates.
Captcha does not eliminate bots or protect idle transport handshakes by itself;
existing connection/packet limits remain necessary. No per-IP hard admission cap
is added because many classroom users share a NAT address. Optional `remoteip`
is omitted; trusting forwarded client addresses needs a separately configured
proxy trust boundary.

Python rooms use the repaired `classquiz/captcha.py`: awaited checks, correct
configuration and response parsing, bounded pooled aiohttp requests and the same
verdict rules. Python does not use Rust's receipts or native rate budget.

## Free keys and what can be tested without them

Checked October 2026:

- [hCaptcha Basic](https://www.hcaptcha.com/pricing) is free. Register a real site
  for its public key and secret. Invisible execution can still show a challenge.
- New [Google Cloud Essentials](https://docs.cloud.google.com/recaptcha/docs/billing-information)
  keys include 10,000 monthly assessments **per organization**. Billing-enabled
  Standard usage from 10,001–100,000 is listed at $8/month. Verify current pricing
  and billing settings before use. One 10k-player event can consume the allowance.
- A [Google website key](https://docs.cloud.google.com/recaptcha/docs/create-key-website)
  can expose its legacy secret using **Use Legacy Key** for this integration.
- [hCaptcha's public test keys](https://docs.hcaptcha.com/#integration-testing-test-keys)
  let us check transport and SDK integration without credentials. They deliberately
  do not detect bots. The fixed dummy token is still subject to our replay check.
  Production native builds reject the published always-pass key/secret.
- Google v2 public test keys do not validate v3 scoring. Final human verification,
  real-site domain settings and score tuning require a real v3 key. No free plan
  is assumed to guarantee the configured 200 requests/sec.

## Isolated reproducible tests

The `captcha-lab` Cargo feature is opt-in and excluded from production images.
Only that build accepts `CAPTCHA_TEST_VERIFY_URL`. `mock_captcha.py` is a separate
local service; there is no runtime verification bypass in the production binary.
The Python simulator transport is installed only by the lab entry point.
The Go client's `--lab-captcha` flag requires room metadata marking this isolated
lab. It generates mock tokens; it never solves or bypasses real captchas.

```powershell
./tools/realtime-rust/build.ps1 -CaptchaLab
$lab = @('-f','tools/stresstest/lab/compose.yaml','-f','tools/stresstest/lab/compose.rust.yaml','-f','tools/stresstest/lab/compose.captcha.yaml')
docker compose @lab up -d
docker compose @lab exec -T api python /rust-source/test_captcha.py
docker compose @lab exec -T api python /rust-source/test_python_captcha.py
docker compose @lab exec -T api python /rust-source/test_integration.py
node tools/realtime-rust/test_captcha_browser.mjs
docker compose @lab exec -T api python /rust-source/test_captcha_overload.py
docker compose @lab exec -T api python /rust-source/test_reconnect_load.py --captcha --users 1000
docker compose @lab run --rm --no-deps runner --rust --captcha --large-audience --users 10000 --questions 10 --ramp 60 --label rust-captcha-10000
docker compose @lab run --rm --no-deps runner --rust --captcha --large-audience --users 30000 --questions 10 --ramp 180 --label rust-captcha-30000
```

Set `$env:LAB_CAPTCHA_PROVIDER='recaptcha_v3'`, recreate `api` with the same
Compose files, then repeat the contract/browser tests for Google verdicts.
Capacity tests use a 200 ms local provider and one valid proof per player, with
10 gameplay rounds. Failure tests inject false/expired proofs, wrong host/action,
low scores, quota errors, malformed/oversized JSON, HTTP errors and timeouts.
The 1k overload test separately verifies bounded rejection and recovery.

### Measured results (15–16 October 2026)

Full compact evidence is in [captcha-measurements.json](captcha-measurements.json),
generated by `captcha_report.py`; raw data remains in the ignored lab results.
Inside the API container, pass `/lab` as the report script's argument.
The capacity runs shared four logical server CPUs and a 2 GiB API/native memory
cap, with simulator and load generator on four separate CPUs. Ryzen 9 9900X3D;
CPU-count matching is not VM performance equivalence. Ten short ABCD rounds,
0–500 ms think time after each client's question receipt, one-second result pauses.

| Players | All joins / scheduled ramp | Worst answer wave | Last question result (worst) | Last final | Native peak RSS | Independent API p95 |
| --- | --- | --- | --- | --- | --- | --- |
| 10,000 | 60.34 / 60 s | 688 ms | 131 ms | 207 ms | 448 MiB | 38.4 ms |
| 30,000 | 180.28 / 180 s | 1,397 ms | 414 ms | 596 ms | 1,346 MiB | 274.2 ms |

All 400,000 answers and all results were verified; no duplicates, native errors
or unexpected disconnects. Exactly one provider call per player and none during
gameplay. At 10k, 43 pooled connections served all checks; provider p95 was
201 ms and queue waits were below 1 ms. Native gameplay CPU averaged 55% / 113%
of one core, plus 2–3% Python. Redis/proxy CPU is excluded from those percentages.
The 10k run passed local targets; 30k exceeded one-second wave and 100 ms HTTP
targets. Single runs and ten-round worst values are not long-term tail estimates.

With 1,000 simultaneous joins and a six-second provider stall, 128 checks were
sent and timed out; 872 attempts received busy errors. No player was admitted.
Native health p95 stayed below 1 ms (46 ms max); all 1,000 joined in 10.20 seconds
after recovery with a controlled 100/sec retry ramp. In a separate SIGKILL test,
the native service became ready at 13.88 seconds and all 1,000 authenticated
identities rejoined by 21.31 seconds. All answered and received finals; the
provider count stayed at the original 1,000 checks.

Both provider contracts and real browser admission/retry/refresh flows passed
using a controlled SDK and local HTTP provider. A tiny **real hCaptcha HTTPS**
smoke also passed: one invalid token rejected, one published dummy token accepted,
and its replay rejected locally (two actual provider requests). Reproduce it with
`python /rust-source/test_captcha_live.py` inside the lab API. It requires an empty
isolated Redis DB15 and launches a loopback-only child; it does not load-test
hCaptcha. Real Google scoring and human challenge flows remain unverified.

This measures our verifier and engine, not the public providers' global latency,
anti-bot quality, burst capacity or human solve time. Do not send the capacity
test traffic to real providers. Never deploy the `captcha-lab` binary or fake
credentials. To return the local stack to normal, stop the API, build the default
binary, recreate services with just `compose.yaml` and `compose.rust.yaml`, and
stop `captcha-provider`. Do not delete persistent volumes.
