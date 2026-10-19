<svelte:head>
	<title>Telekom Quiz · Large audiences</title>
	<meta
		name="description"
		content="Which setting to use for a large quiz, measured capacity and the limits to plan for."
	/>
</svelte:head>

<article class="prose tq-prose" data-ui="large-audience-docs">
	<h1>Large audiences</h1>

	<h2>Which setting should I use?</h2>
	<div class="benchmark-table">
		<table>
			<thead>
				<tr><th>Setting</th><th>Comfortable up to</th><th>What players see</th></tr>
			</thead>
			<tbody>
				<tr>
					<td>Default</td>
					<td>about 300 players</td>
					<td>The usual experience</td>
				</tr>
				<tr>
					<td>Large audience optimization</td>
					<td>about 1,000 players</td>
					<td>Their own score and exact rank; the top 10 at the end</td>
				</tr>
				<tr>
					<td>Experimental Rust engine</td>
					<td>about 10,000 players</td>
					<td>Same as large audience optimization</td>
				</tr>
			</tbody>
		</table>
	</div>
	<p>
		The Rust engine needs normal game mode with controllers off, and remote host control is not
		available. All answer types, slides, images, scoring, saved results and exports work.
	</p>

	<h2 id="benchmarks">Measured performance</h2>
	<p>
		Measured in October 2026 with simulated players who each answered within half a second of
		seeing the question, over ten questions. The server was limited to four CPU cores of a fast
		desktop PC; a rented server with four cores is usually slower.
	</p>
	<div class="benchmark-table">
		<table>
			<caption>Rust engine</caption>
			<thead>
				<tr
					><th>Players</th><th>All answers stored</th><th>All results shown</th><th
						>Final results</th
					><th>Memory</th></tr
				>
			</thead>
			<tbody>
				<tr><td>10,000</td><td>0.73 s</td><td>0.12 s</td><td>0.23 s</td><td>433 MiB</td></tr
				>
				<tr><td>30,000</td><td>1.26 s</td><td>0.40 s</td><td>0.55 s</td><td>1.3 GiB</td></tr
				>
			</tbody>
		</table>
	</div>
	<p>
		No answers were lost or counted twice. At 10,000 players the rest of the site stayed fast.
		At 30,000 the game still worked, but answers took over a second to collect and other pages
		slowed down, so treat 10,000 as the comfortable limit. For comparison, 10,000 players on the
		large audience optimization took up to 8 seconds per question.
	</p>

	<h2 id="limits">Limits to plan for</h2>
	<ul>
		<li>
			A room holds at most 30,000 players. Each question lasts 1 to 3,600 seconds, and a room
			closes after two hours without the host moving on.
		</li>
		<li>
			The host sees results 50 rows at a time. The full list is in the export and the saved
			results.
		</li>
		<li>
			The live answer count can lag by a quarter of a second. Players who left but were not
			kicked keep the question open until the timer ends, because not everyone has answered.
		</li>
		<li>
			Answers that arrive more than 5 seconds after the timer ends are not counted, and the
			player is told so.
		</li>
		<li>
			If the server uses a captcha, each player solves it once when joining. Joining then
			takes longer: plan for about one minute per 10,000 players.
		</li>
		<li>
			Large images in questions multiply the download for every player. Keep media small, or
			leave it out.
		</li>
		<li>
			Only one large room at a time has been tested, with simulated players. Real phones,
			school Wi-Fi and the server's internet bandwidth have not been measured at this scale.
		</li>
	</ul>

	<h2 id="recovery">If the engine restarts</h2>
	<p>
		The engine restarts on its own. In tests, the engine was back after about 15 seconds and all
		1,000 test players had rejoined within 22 seconds, without doing anything. Answers already
		given and the scores are kept. The question timer keeps running during the outage, so a
		player who had not answered yet may run out of time.
	</p>

	<h2>Tips for a big event</h2>
	<ul>
		<li>Run a test game with a few people on the real server beforehand.</li>
		<li>Open the room early, so joining is spread out instead of everyone joining at once.</li>
		<li>Prefer short quizzes with small or no media.</li>
		<li>Avoid updating the server while a quiz is running; the running game would stop.</li>
	</ul>
</article>

<style>
	.benchmark-table {
		overflow-x: auto;
	}
	td:not(:last-child),
	th {
		white-space: nowrap;
	}
	h2 {
		scroll-margin-top: 100px;
	}
</style>
