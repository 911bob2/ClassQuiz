<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { PageData } from './$types';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('words.results')}</title>
</svelte:head>

<main class="tq-page tq-stack" data-ui="results-list">
	<header class="tq-page-heading">
		<h1 class="tq-page-title">{$t('words.results')}</h1>
	</header>

	{#if data.results.length === 0}
		<p class="tq-panel tq-empty">{$t('results_page.no_results_so_far')}</p>
	{:else}
		<div class="tq-panel tq-table-wrap">
			<table class="tq-table results-table">
				<thead>
					<tr>
						<th>{$t('results_page.quiz_title')}</th>
						<th>{$t('results_page.date_played')}</th>
						<th class="results-count">{$t('results_page.player_count')}</th>
						<th>{$t('words.note')}</th>
					</tr>
				</thead>
				<tbody>
					{#each data.results as result}
						<tr>
							<td data-label={$t('results_page.quiz_title')}>
								<a href="/results/{result.id}" class="tq-link results-link"
									>{@html result.title}</a
								>
							</td>
							<td data-label={$t('results_page.date_played')}>
								{new Date(result.timestamp).toLocaleString()}
							</td>
							<td class="results-count" data-label={$t('results_page.player_count')}>
								{Object.keys(result.player_scores).length}
							</td>
							<td class:results-no-note={!result.note} data-label={$t('words.note')}>
								{#if result.note}
									{result.note}
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</main>

<style>
	.results-link {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-size: 18px;
		font-weight: 700;
	}

	.results-count {
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 700px) {
		.results-table,
		.results-table tbody,
		.results-table tr,
		.results-table td {
			display: block;
			width: 100%;
		}

		.results-table thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}

		.results-table tr {
			padding: 12px 16px;
			border-top: 1px solid var(--tq-border);
		}

		.results-table tr:first-child {
			border-top: 0;
		}

		.results-table td {
			display: flex;
			justify-content: space-between;
			gap: 16px;
			padding: 4px 0;
			border-top: 0;
			text-align: end;
		}

		.results-table td::before {
			content: attr(data-label);
			flex-shrink: 0;
			color: var(--tq-muted);
			font-size: 14px;
			text-align: start;
		}

		.results-table td.results-no-note {
			display: none;
		}
	}
</style>
