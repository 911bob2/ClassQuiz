<svelte:head>
	<title>Telekom Quiz · Large audiences and the Rust engine</title>
	<meta
		name="description"
		content="Large-audience trade-offs, measured capacity, recovery behavior and technical limits."
	/>
</svelte:head>

<article class="prose tq-prose" data-ui="large-audience-docs">
	<h1>Large audiences</h1>
	<h2>TL;DR: which setting should I use?</h2>
	<ul>
		<li>
			<strong>Default Python:</strong> keeps the usual experience. Our conservative local target
			is about 300 players.
		</li>
		<li>
			<strong>Huge publicum optimization:</strong> players receive their own score and exact rank,
			with the top 10 at the end. The local target is about 1,000 players for short quizzes, or
			750 with 100 questions loaded.
		</li>
		<li>
			<strong>Experimental Rust engine:</strong> includes the optimized player experience. The
			integrated build completed 10,000-player answer waves within 0.73 seconds and 30,000 within
			1.26 seconds. The latter exceeds our comfort target. These are local measurements, not a
			promise for every VM.
		</li>
	</ul>
	<p>
		The Rust option requires normal game mode and controllers off. Configured hCaptcha or
		reCAPTCHA v3 can protect new joins; verification runs directly in Rust. Remote host control
		is unavailable. All six answer types, slides, media URLs, scoring, personal rank, saved
		results and full exports remain available. The host views 50 result rows at a time.
	</p>
	<p>
		<strong>Visible delays:</strong> Rust batches the live host answer count every 250 ms, then flushes
		the exact last count. Answers still commit individually. A crash interrupts connections while
		the engine restarts; the timer continues and already stored answers remain counted. No WebSocket
		compression is negotiated, increasing bandwidth use.
	</p>
	<p>
		<a href="#benchmarks">Benchmarks</a> · <a href="#recovery">Recovery</a> ·
		<a href="#limits">Limitations</a>
		· <a href="#operations">Server setup</a>
		· <a href="#captcha">Captcha and large lobbies</a>
	</p>

	<h2 id="benchmarks">Measured performance</h2>
	<p>
		Measured 14–15 October 2026 on a Ryzen 9 9900X3D. The six server containers shared CPU
		affinity for four logical CPUs; Go clients and the host controller used another four. One
		Python API worker served the HTTP side. Other applications on the PC varied. Matching a VM's
		CPU count does not match its CPU speed or steal time.
	</p>
	<p>
		Each clean Rust trial played ten small ABCD questions. Regular bots chose an answer 0–500 ms
		after <em>their own</em> question receipt. The immediate workload used zero think time after
		receipt. Neither workload is a global simultaneous-send barrier. Admission ramped over 60–120
		seconds.
	</p>
	<div class="benchmark-table">
		<table>
			<caption
				>Initial Rust prototype, before production routing and recovery hardening</caption
			>
			<thead
				><tr
					><th>Players / workload</th><th>Worst answer wave</th><th
						>Question results p95</th
					><th>All finals</th><th>Peak Rust RAM</th></tr
				></thead
			>
			<tbody>
				<tr
					><td>10,000, four workers</td><td>0.682 s</td><td>0.157 s</td><td>0.227 s</td
					><td>442 MiB</td></tr
				>
				<tr
					><td>10,000, repeat</td><td>0.720 s</td><td>0.147 s</td><td>0.262 s</td><td
						>436 MiB</td
					></tr
				>
				<tr
					><td>10,000, one worker</td><td>0.803 s</td><td>0.279 s</td><td>0.357 s</td><td
						>463 MiB</td
					></tr
				>
				<tr
					><td>30,000, four workers</td><td>1.321 s</td><td>0.484 s</td><td>0.886 s</td
					><td>1,306 MiB</td></tr
				>
				<tr
					><td>30,000, repeat</td><td>1.174 s</td><td>0.526 s</td><td>0.912 s</td><td
						>1,329 MiB</td
					></tr
				>
				<tr
					><td>30,000, immediate</td><td>1.137 s</td><td>0.583 s</td><td>0.745 s</td><td
						>1,352 MiB</td
					></tr
				>
			</tbody>
		</table>
	</div>
	<p>
		Those six clean trials verified <strong>1.2 million answers</strong> with no loss, duplicate
		records or unexpected disconnects, and every player received every result. An earlier diagnostic
		trial needed one join retry and is excluded; installing handlers before the connection acknowledgement
		fixed that race.
	</p>
	<p>
		“Answer wave” means host question request until an independent Redis poll sees every answer,
		including delivery and think time. Poll resolution was about 50 ms. Result timing ends at
		the last player. With ten rounds, the reported p95 is the worst observed round; these short
		trials do not establish a long-run tail percentile.
	</p>
	<p>
		At 30,000 immediate answers, native handler-to-commit p95 reached 465 ms. Independent
		fixed-rate Python API probes measured 259 ms p95; direct Rust health probes measured 18 ms.
		The strict targets were one second for all answers/results and 100 ms HTTP p95, so 30,000
		did not pass the comfort target. Some HTTP/proxy queueing remains unisolated.
	</p>
	<p>
		The earlier Python toggle took up to 8.08 seconds for 10,000 players. A separate Python
		cache/uvloop/GC experiment reached 2.95 seconds. This comparison changes architecture,
		caching, threading and compression as well as language; it is not an isolated
		Rust-versus-Python speed measurement.
	</p>
	<h3 id="hardened-validation">Integrated build with recovery enabled</h3>
	<p>
		The following ten-round reruns include lease/generation fencing, persisted recovery indexes,
		per-answer acknowledgements and paged host delivery. All 400,000 answers were retained, with
		every player receiving every result and zero duplicates, unexpected disconnects, native
		errors, rejections or emit errors.
	</p>
	<div class="benchmark-table">
		<table>
			<thead
				><tr
					><th>Players</th><th>Worst answer wave</th><th>All question results p95</th><th
						>All finals</th
					><th>API HTTP p95</th><th>Rust RAM</th></tr
				></thead
			>
			<tbody
				><tr
					><td>10,000</td><td>0.730 s</td><td>0.123 s</td><td>0.232 s</td><td>43.8 ms</td
					><td>433 MiB</td></tr
				><tr
					><td>30,000</td><td>1.263 s</td><td>0.404 s</td><td>0.550 s</td><td>280.3 ms</td
					><td>1,309 MiB</td></tr
				></tbody
			>
		</table>
	</div>
	<p>
		Regular 0–500 ms think time, the same shared four-CPU server affinity and 2 GiB
		Python-plus-Rust container limit were retained. Native gameplay CPU averaged 57% and 113% of
		one core, respectively; including Python gives 60% and 117%. Redis and nginx also share the
		four CPUs and are excluded from those runtime percentages. These averages include one-second
		result pauses.
	</p>
	<p>
		Independent 10 Hz HTTP probes measured direct native health at 2.4 ms and 13.7 ms p95.
		Native commit p95 was 8.7 ms and 331 ms. Thus 10,000 passes the stated local targets; 30,000
		remains functional but exceeds both the one-second answer-wave and 100 ms API targets. One
		trial at each size is a regression check, not a long-term capacity certificate.
	</p>

	<h2 id="captcha">Captcha and large lobbies</h2>
	<p>
		<strong>TL;DR:</strong> captcha protects initial admission without changing answers, scores,
		results or live counts. It adds provider latency and sometimes a human challenge before joining.
		Already admitted players reconnect with their saved identity without solving again. A provider
		outage blocks new joins; the ongoing game continues.
	</p>
	<div class="benchmark-table">
		<table>
			<caption>Rust captcha enabled, simulated 200 ms provider, ten rounds</caption>
			<thead
				><tr
					><th>Players</th><th>All joins</th><th>Worst answer wave</th><th
						>All question results</th
					><th>All finals</th><th>Rust RAM</th></tr
				></thead
			>
			<tbody>
				<tr
					><td>10,000</td><td>60.34 s</td><td>0.688 s</td><td>0.131 s</td><td>0.207 s</td
					><td>448 MiB</td></tr
				>
				<tr
					><td>30,000</td><td>180.28 s</td><td>1.397 s</td><td>0.414 s</td><td>0.596 s</td
					><td>1,346 MiB</td></tr
				>
			</tbody>
		</table>
	</div>
	<p>
		Admission was deliberately spread over 60 and 180 seconds. All 400,000 answers and every
		result were verified, with no unexpected disconnects. One provider request per player was
		made; gameplay made none. Independent Python HTTP p95 was 38.4 ms at 10,000 and 274.2 ms at
		30,000. Native gameplay CPU averaged 55% and 113% of one core; Python added about 2–3%. The
		same four logical server CPUs and 2 GiB API-plus-native limit were used. The simulator and
		load generator ran on separate CPUs. These single trials preserve the earlier conclusion:
		10,000 meets our local comfort targets; 30,000 works but exceeds them.
	</p>
	<p>
		Rust uses one shared HTTP connection pool, with at most 128 concurrent checks, 256 waiting
		checks and a default rate of 200 verification starts per second, with an initial burst of
		128. The queue wait is limited to two seconds; provider calls have a two-second connect
		timeout and five-second total timeout. Excess arrivals receive a retry message. At the rate
		limit alone, 10,000 joins need roughly 50 seconds and 30,000 need 150 seconds, plus
		challenges, network time and retries. These are planning estimates, not provider throughput
		guarantees.
	</p>
	<p>
		Provider responses, tokens and queues are bounded. A token hash is claimed in Redis for 180
		seconds to prevent reuse. A successful proof can survive an interrupted admission for 60
		seconds, bound to the room generation, name, identity and captcha policy. The final join
		atomically checks room state and consumes that receipt. If the process crashes after the
		provider consumes a token but before the receipt is saved, the player must verify again.
		Changing keys or policy can require finishing existing rooms before restarting the service.
	</p>
	<p>
		hCaptcha validates the token against the configured site key. reCAPTCHA v3 additionally
		checks the expected hostname, the <code>classquiz_join</code> action and a configurable score
		threshold (default 0.5). Provider errors and quota errors fail closed. Captcha reduces automated
		abuse; it cannot guarantee one human per player or replace connection limits.
	</p>
	<p>
		The local tests use a separate fake provider with controlled delays and verdicts. They
		exercise admission overhead and failures, not a real provider's bot detection, global
		latency or burst allowance. Google scoring needs a real site key and representative human
		traffic. Mass load tests never send automated challenges to the public providers.
	</p>
	<p>
		As checked in October 2026, <a href="https://www.hcaptcha.com/pricing">hCaptcha Basic</a>
		has a free plan. New Google Cloud reCAPTCHA keys have
		<a href="https://docs.cloud.google.com/recaptcha/docs/billing-information"
			>10,000 free assessments per month per organization</a
		>; a single 10,000-player event can use that allowance. Paid tiers, billing and provider
		policies should be checked before a public event. Neither free plan should be assumed to
		guarantee 200 checks per second.
	</p>

	<h2 id="recovery">What happens after a crash?</h2>
	<p>
		With captcha enabled, a separate 1,000-player SIGKILL test restored the native service in
		13.9 seconds and all players in 21.3 seconds. All then answered and received finals. The
		provider saw only the original 1,000 checks, with none during reconnection. A separate
		provider-stall test rejected 1,000 new attempts safely and admitted all 1,000 after
		recovery. A small live hCaptcha check with published test credentials also passed. Browser
		SDK flows were tested with controlled substitutes; real human challenges and Google scoring
		still need site credentials and representative visitors.
	</p>
	<ol>
		<li>
			Python supervises one native binary in the realtime service and restarts unexpected
			exits with bounded backoff. The API and normal Python rooms use a separate service.
		</li>
		<li>
			Redis stores the room generation, phase, question token, original start/deadline,
			identities, answers and scores. Rust reconstructs its in-memory projections on admission
			after restart.
		</li>
		<li>
			A Redis lease lasts 15 seconds and renews every three seconds. A killed owner may leave
			a lease until expiry. Every native mutation checks ownership inside Redis; an old
			process cannot keep writing after a replacement takes ownership.
		</li>
		<li>
			Players resume using their saved identity token. The browser restores the current
			question, remaining time, submitted state or result screen. The host restores the
			roster, controls, count and result page.
		</li>
		<li>
			An answer awaiting acknowledgement is retried after reconnection only if that round is
			still open and not already answered. Atomic deduplication prevents a second score. The
			deadline never moves to compensate for downtime.
		</li>
	</ol>
	<p>
		In a separate deliberate SIGKILL test, the native service became ready after 13.1 seconds
		and all <strong>1,000 players rejoined within 20.2 seconds</strong>, including client
		backoff. All 1,000 then submitted and received final results. Transient disconnects and HTTP
		502s during that injected outage were expected and are separate from the clean capacity
		runs. Functional checks also killed the engine during a question, question results and
		finals, verifying unchanged deadlines, submitted state, rankings, host refresh, exports and
		PIN reuse. A 10,000/30,000-player reconnect storm and prolonged churn remain unmeasured.
	</p>
	<p>
		Consequently a restart can still cause an unanswered player to miss the deadline. Recovery
		cannot restore deleted Redis data. An engine-process crash preserves answers already
		committed to a surviving Redis; this is different from a VM power failure. Default Redis AOF <code
			>everysec</code
		> can lose roughly the latest second on a machine/storage failure. Stronger persistence needs
		separate configuration and benchmarking.
	</p>

	<h2 id="limits">Limits, features and remaining risks</h2>
	<ul>
		<li>
			The legacy live-data API and remote-host integration are unavailable for native rooms. A
			completed question cannot be reopened for a second scoring pass.
		</li>
		<li>
			One native owner serves this Redis deployment. This is restart recovery, not
			active-active clustering or seamless failover. A second owner cannot take over a live
			lease.
		</li>
		<li>
			Up to 30,000 registered players per room and 256 cached rooms are admitted by default.
			These are admission limits, not a guarantee that all those rooms fit the server's
			RAM/CPU. Expired rooms are removed from the cache.
		</li>
		<li>
			Questions must last 1–3,600 seconds. Active Redis room state expires after two hours
			without a control transition. Saved database results have the normal retention behavior.
		</li>
		<li>
			Players see their own answer, score and exact ordinal rank; final payloads include the
			top 10 and their own question scores. Ties use a deterministic username order. The host
			receives bounded result pages; full histories stay in Redis for export and database
			saving.
		</li>
		<li>
			Host answer counts can lag by 250 ms. An exact final count is sent when all registered
			players answer. Disconnected registrations remain in the room until kicked or expired,
			so they can prevent “everyone answered”.
		</li>
		<li>
			Engine.IO heartbeats remain enabled at a 25-second interval and 20-second timeout.
			Queues and packet sizes are bounded; slow or broken connections must reconnect rather
			than rely on unbounded buffering.
		</li>
		<li>
			WebSocket compression is absent. The earlier 30,000-player run received around 195 MiB
			of decoded application data over ten rounds; this is not wire throughput and excludes
			framing/TLS. Paged host delivery changes this traffic profile.
		</li>
		<li>
			Real browser rendering, large media downloads, TLS/CDN limits, uplink bandwidth, very
			long quizzes, sustained churn and multiple simultaneous huge rooms need separate
			capacity testing. CPU averages across result pauses are lower than burst peaks.
		</li>
	</ul>

	<h2 id="operations">Server setup and operation</h2>
	<p>
		Spreadsheet image fetches time out after 10 seconds per image. Missing or unsupported
		illustrations may be omitted; the recorded answers remain in the export. Large exports need
		extra Python CPU and memory.
	</p>
	<p>
		The repository's deployment image builds the pinned Rust binary. Compose runs it through the
		Python supervisor as a dedicated <code>realtime</code> service. Set
		<code>RUST_REALTIME_URL</code> on the API to its internal address. The option becomes available
		when its health check succeeds. Existing Rust rooms keep their native route during an outage;
		they never silently switch engines.
	</p>
	<p>
		The proxy sends <code>/socket.io/</code> to Python and <code>/socket.io-rust/</code> to the
		native service. Metadata chooses the path before room admission. Rust's metrics and health
		endpoints remain internal. Configure <code>CLASSQUIZ_ORIGIN</code> to the public site origin;
		no additional native port needs to be published.
	</p>
	<p>
		Allow enough file descriptors and proxy connection slots for both client and upstream
		sockets. At 30,000 players the initial Rust process used about 1.3 GiB, plus roughly 200 MiB
		Python, Redis, proxy buffers and kernel socket memory. The generator used about 1 GiB
		separately. Leave memory headroom and monitor native errors, emit errors, commit latency,
		Redis persistence and proxy limits.
	</p>
	<p>
		Native exports use frozen questions, scores, custom fields and answer history, so a reused
		PIN does not expose a new room's data through an old export token. Full spreadsheet assembly
		runs outside the API event loop, but large exports still need additional Python CPU and
		memory.
	</p>
	<p>
		For a local reproduction, see <code>tools/realtime-rust/README.md</code>, the benchmark
		evidence in <code>tools/realtime-rust/measurements.json</code>, and the lab scripts. Roll
		back by disabling new Rust rooms and letting existing rooms finish before stopping the
		realtime service. Preserve Redis/AOF and saved results; do not delete room state to restart
		the engine.
	</p>
</article>

<style>
	.benchmark-table {
		overflow-x: auto;
	}
	th,
	td {
		white-space: nowrap;
	}
	h2 {
		scroll-margin-top: 100px;
	}
</style>
