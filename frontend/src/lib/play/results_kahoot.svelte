<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	function sortObjectbyValue(obj) {
		const ret = {};
		Object.keys(obj)
			.sort((a, b) => obj[b] - obj[a])
			.forEach((s) => (ret[s] = obj[s]));
		return ret;
	}

	interface Props {
		scores: any;
		question_results: Array<{
			username: string;
			answer: string;
			right: boolean;
			time_taken: number;
			score: number;
		}>;
		username: any;
	}

	let { scores = $bindable(), question_results, username }: Props = $props();
	let score_by_username = $state({});

	if (JSON.stringify(scores) === '{}') {
		for (const i of question_results) {
			scores[i.username] = 0;
		}
	}
	for (const i of question_results) {
		score_by_username[i.username] = i.score;
	}
	for (const username of Object.keys(score_by_username)) {
		scores[username] = (score_by_username[username] ?? 0) + (scores[username] ?? 0);
	}
	scores = scores;
	let sorted_scores = $derived(sortObjectbyValue(scores));

	let own_result = $derived(question_results.find((r) => r.username === username));
	let rank = $derived(Object.keys(sorted_scores).indexOf(username) + 1);
</script>

<main class="tq-page tq-page-narrow result-screen" data-ui="player-result">
	<h1 class="tq-section-title">{$t('words.result_plural')}</h1>
	<section class="tq-panel tq-panel-body result-card">
		{#if own_result}
			<p
				class="result-verdict"
				class:result-right={own_result.right}
				class:result-wrong={!own_result.right}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					{#if own_result.right}
						<path d="M5 12.5l4.5 4.5L19 7.5" />
					{:else}
						<path d="M6 6l12 12M18 6L6 18" />
					{/if}
				</svg>
				{own_result.right
					? $t('words.correct')
					: $t('telekom.incorrect', { defaultValue: 'Incorrect' })}
			</p>
		{/if}
		<dl class="result-stats">
			<div>
				<dt>{$t('play_page.points_added')}</dt>
				<dd class:result-points={(score_by_username[username] ?? 0) > 0}>
					+{score_by_username[username] ?? '0'}
				</dd>
			</div>
			<div>
				<dt>{$t('words.score')}</dt>
				<dd>{sorted_scores[username] ?? '0'}</dd>
			</div>
			{#if rank > 0}
				<div>
					<dt>{$t('telekom.rank', { defaultValue: 'Rank' })}</dt>
					<dd>{rank}</dd>
				</div>
			{/if}
		</dl>
	</section>
</main>

<style>
	.result-screen {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 16px;
		min-height: 100dvh;
	}

	.result-card {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.result-verdict {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		align-self: flex-start;
		padding: 8px 16px;
		border: 1px solid currentColor;
		border-radius: 999px;
		font-size: 18px;
		font-weight: 700;
	}

	.result-verdict svg {
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.result-right {
		background: var(--tq-success-soft);
		color: var(--tq-success);
	}

	.result-wrong {
		background: var(--tq-danger-soft);
		color: var(--tq-danger);
	}

	.result-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 16px;
		margin: 0;
	}

	.result-stats dt {
		color: var(--tq-muted);
		font-size: 14px;
	}

	.result-stats dd {
		margin: 4px 0 0;
		font-size: 36px;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		line-height: 1.1;
	}

	.result-points {
		color: var(--tq-success);
	}
</style>
