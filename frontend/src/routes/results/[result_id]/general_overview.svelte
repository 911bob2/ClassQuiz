<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		scores: {
			[key: string]: string;
		};
		title: string;
		timestamp: string;
		question_count?: number;
	}

	let { scores, title, timestamp, question_count }: Props = $props();

	const usernames = Object.keys(scores);

	const get_average_final_score = () => {
		let score_data = 0;
		for (const username of usernames) {
			score_data += parseInt(scores[username]);
		}
		return score_data / usernames.length;
	};
</script>

<section class="tq-stack" data-ui="results-overview">
	<dl class="metrics">
		<div class="tq-panel tq-panel-body">
			<dt class="tq-label">{$t('words.player_plural')}</dt>
			<dd class="metric-value">{usernames.length}</dd>
		</div>
		{#if question_count !== undefined}
			<div class="tq-panel tq-panel-body">
				<dt class="tq-label">{$t('words.question_plural')}</dt>
				<dd class="metric-value">{question_count}</dd>
			</div>
		{/if}
		<div class="tq-panel tq-panel-body">
			<dt class="tq-label">
				{$t('telekom.average_score', { defaultValue: 'Average score' })}
			</dt>
			<dd class="metric-value">
				{usernames.length ? get_average_final_score().toFixed(0) : 0}
			</dd>
		</div>
		<div class="tq-panel tq-panel-body">
			<dt class="tq-label">
				{$t('telekom.highest_score', { defaultValue: 'Highest score' })}
			</dt>
			<dd class="metric-value">{Math.max(0, ...Object.values(scores).map(Number))}</dd>
		</div>
	</dl>
</section>

<style>
	.metrics {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 16px;
		margin: 0;
	}

	.metric-value {
		margin: 0;
		font-size: 40px;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		line-height: 1.1;
		color: var(--tq-accent);
	}
</style>
