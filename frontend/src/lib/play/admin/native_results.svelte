<script lang="ts">
	import { socket } from '$lib/socket';
	import { onDestroy, type Snippet } from 'svelte';
	let { summary, actions }: { summary: any; actions?: Snippet } = $props();
	let current = $state(summary);
	$effect(() => {
		current = summary;
	});
	const update = (page) => {
		current = page;
	};
	socket.on('host_results_page', update);
	onDestroy(() => socket.off('host_results_page', update));
	const move = (page: number) => socket.emit('get_host_page', { page });
</script>

<section class="tq-page tq-stack" data-ui="native-host-results">
	<header class="tq-page-heading">
		<div>
			<h1 class="tq-page-title">{current.final ? 'Final results' : 'Question results'}</h1>
			<p class="tq-muted">{current.player_count.toLocaleString()} players · 50 per page</p>
		</div>
		{#if actions}<div class="tq-toolbar">{@render actions()}</div>{/if}
	</header>
	<p class="tq-muted">
		Full answers are retained for saving and export. This view loads one page at a time.
	</p>
	<div class="tq-panel tq-table-wrap">
		<table class="tq-table">
			<thead
				><tr
					><th>Rank</th><th>Player</th><th>Score</th>{#if !current.final}<th>Answer</th
						>{/if}</tr
				></thead
			>
			<tbody
				>{#each current.rows as row (row.username)}<tr
						><td>{row.rank}</td><td>{row.username}</td><td>{row.score}</td
						>{#if !current.final}<td>{row.answer ?? 'No answer'}</td>{/if}</tr
					>{/each}</tbody
			>
		</table>
	</div>
	<nav class="tq-toolbar" aria-label="Result pages">
		<button
			class="tq-button"
			disabled={current.page === 0}
			onclick={() => move(current.page - 1)}>Previous</button
		>
		<span>Page {current.page + 1} of {Math.max(1, Math.ceil(current.player_count / 50))}</span>
		<button
			class="tq-button"
			disabled={(current.page + 1) * 50 >= current.player_count}
			onclick={() => move(current.page + 1)}>Next</button
		>
	</nav>
</section>
