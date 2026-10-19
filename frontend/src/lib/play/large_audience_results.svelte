<!-- SPDX-License-Identifier: MPL-2.0 -->
<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	const { t } = getLocalization();
	interface Standing {
		username: string;
		score: number;
		rank: number;
	}
	interface Result extends Standing {
		player_count: number;
		answer?: { right: boolean; score: number } | null;
		leaderboard?: Standing[];
	}
	let { result, final = false }: { result: Result; final?: boolean } = $props();
</script>

<main class="tq-page tq-page-narrow tq-stack audience-results" data-ui="large-audience-results">
	<h1 class="tq-page-title">
		{final
			? $t('telekom.final_results', { defaultValue: 'Final results' })
			: $t('words.result_plural')}
	</h1>
	<section class="tq-panel tq-panel-body tq-stack">
		{#if !final && result.answer}
			<p class="verdict" class:right={result.answer.right}>
				{result.answer.right
					? $t('words.correct')
					: $t('telekom.incorrect', { defaultValue: 'Incorrect' })}
			</p>
		{/if}
		<dl class="stats">
			{#if !final}
				<div>
					<dt>{$t('play_page.points_added')}</dt>
					<dd>+{result.answer?.score ?? 0}</dd>
				</div>
			{/if}
			<div>
				<dt>{$t('words.score')}</dt>
				<dd>{result.score}</dd>
			</div>
			<div>
				<dt>{$t('telekom.rank', { defaultValue: 'Rank' })}</dt>
				<dd>{result.rank}</dd>
			</div>
		</dl>
		<p class="tq-muted">{result.player_count} {$t('words.player_plural')}</p>
	</section>
	{#if final && result.leaderboard}
		<section class="tq-panel tq-panel-body tq-stack">
			<h2 class="tq-section-title">
				{$t('telekom.top_players', { defaultValue: 'Top 10 players' })}
			</h2>
			<table class="tq-table">
				<thead
					><tr
						><th>{$t('telekom.rank', { defaultValue: 'Rank' })}</th><th
							>{$t('words.name')}</th
						><th>{$t('words.score')}</th></tr
					></thead
				>
				<tbody>
					{#each result.leaderboard as player (player.username)}
						<tr class:own={player.username === result.username}
							><td>{player.rank}</td><td>{player.username}</td><td>{player.score}</td
							></tr
						>
					{/each}
				</tbody>
			</table>
			<p class="tq-muted">
				{$t('telekom.full_results_host', {
					defaultValue: 'The host has the complete results.'
				})}
			</p>
		</section>
	{/if}
</main>

<style>
	.audience-results {
		padding-block: 32px;
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 24px 40px;
		margin: 0;
	}
	dt {
		color: var(--tq-muted);
	}
	dd {
		margin: 0;
		font-size: 36px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.verdict {
		color: var(--tq-danger);
		font-size: 24px;
		font-weight: 700;
	}
	.right {
		color: var(--tq-success);
	}
	.own {
		background: var(--tq-brand-soft);
	}
</style>
