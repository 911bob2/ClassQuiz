<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		data: any;
		username?: any;
		show_final_results: boolean;
		/** Host-only controls (export, save) shown next to the heading. */
		actions?: Snippet;
	}

	let { data = $bindable(), username, show_final_results, actions }: Props = $props();

	let player_names = $derived(
		Object.keys(data).sort((a, b) => {
			const scoreA = parseFloat(data[a]) || 0;
			const scoreB = parseFloat(data[b]) || 0;
			return scoreB - scoreA;
		})
	);

	let own_rank = $derived(username ? player_names.indexOf(username) + 1 : 0);
</script>

{#if show_final_results}
	<main class="tq-page final-page tq-stack" data-ui="final-results">
		<header class="tq-page-heading">
			<div>
				<h1 class="tq-page-title">
					{$t('telekom.final_results', { defaultValue: 'Final results' })}
				</h1>
				<p class="tq-muted final-count">
					{player_names.length}
					{player_names.length === 1 ? $t('words.player') : $t('words.player_plural')}
				</p>
			</div>
			{#if actions}
				<div class="tq-toolbar">{@render actions()}</div>
			{/if}
		</header>

		{#if username && data[username] !== undefined}
			<section class="tq-panel tq-panel-body own-card" aria-label={username}>
				<div>
					<p class="tq-muted">{$t('words.score')}</p>
					<p class="own-value">{data[username]}</p>
				</div>
				{#if own_rank > 0}
					<div>
						<p class="tq-muted">{$t('telekom.rank', { defaultValue: 'Rank' })}</p>
						<p class="own-value">{own_rank}</p>
					</div>
				{/if}
			</section>
		{/if}

		<div class="tq-panel tq-table-wrap">
			<table class="tq-table final-table">
				<thead>
					<tr>
						<th class="final-rank">{$t('telekom.rank', { defaultValue: 'Rank' })}</th>
						<th>{$t('words.name')}</th>
						<th class="final-points">{$t('words.point_plural')}</th>
					</tr>
				</thead>
				<tbody>
					{#each player_names as player, i}
						<tr class:own-result={player === username}>
							<td class="final-rank">{i + 1}</td>
							<td>{player}</td>
							<td class="final-points"><strong>{data[player]}</strong></td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if player_names.length === 0}
				<p class="tq-empty">{$t('admin_page.no_answers')}</p>
			{/if}
		</div>
	</main>
{/if}

<style>
	.final-page {
		max-width: 960px;
	}

	.final-count {
		margin-block-start: 4px;
	}

	.own-card {
		display: flex;
		flex-wrap: wrap;
		gap: 24px 48px;
	}

	.own-value {
		font-size: 36px;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		line-height: 1.1;
	}

	.final-table {
		font-size: 18px;
	}

	.final-rank {
		width: 72px;
		font-variant-numeric: tabular-nums;
	}

	.final-points {
		text-align: end;
		font-variant-numeric: tabular-nums;
	}

	.own-result {
		background: var(--tq-brand-soft);
	}
</style>
