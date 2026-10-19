<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import VotingResults from './voting_results.svelte';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { getLocalization } from '$lib/i18n';
	import type { Question } from '$lib/quiz_types';
	import { QuizQuestionType } from '$lib/quiz_types';

	const { t } = getLocalization();

	interface Props {
		data: any;
		question: Question;
		new_data: Array<{
			username: string;
			answer: string;
			right: boolean;
			time_taken: number;
			score: number;
		}>;
	}

	let { data = $bindable(), question, new_data }: Props = $props();

	// let data_by_username = {};

	const group_username_by_score = (new_d: any[]): object => {
		let ret_data = {};
		for (const i of new_data) {
			ret_data[i.username] = i.score;
		}
		return ret_data;
	};
	let score_by_username = $derived(group_username_by_score(new_data));

	let player_names = $derived(
		Object.keys(data).sort((a, b) => {
			const scoreA = parseFloat(data[a]) || 0;
			const scoreB = parseFloat(data[b]) || 0;
			return scoreB - scoreA || (a < b ? -1 : a > b ? 1 : 0);
		})
	);

	if (JSON.stringify(data) === '{}') {
		for (const i of new_data) {
			data[i.username] = 0;
		}
	}

	let show_new_score_clicked = $state(false);

	const show_new_score = () => {
		for (const i of player_names) {
			if (isNaN(data[i])) {
				data[i] = 0;
			}
			console.log(score_by_username[i], '1');
			data[i] = (score_by_username[i] ?? 0) + data[i];
		}
		for (const i of new_data) {
			if (!data[i.username]) {
				data[i.username] = score_by_username[i.username];
			}
		}
		show_new_score_clicked = true;
		setTimeout(() => {
			data = data;
		}, 800);
	};

	onMount(() => {
		setTimeout(show_new_score, 1000);
	});

	// https://svelte.dev/repl/96a58afdea2248a5b7e489160ffba887?version=3.44.2
	let show_answers = $derived(
		[QuizQuestionType.ABCD, QuizQuestionType.VOTING, QuizQuestionType.TEXT].includes(
			question.type
		)
	);
</script>

<div class="tq-page results-grid" class:results-split={show_answers} data-ui="host-results">
	<section class="tq-panel results-board">
		<h2 class="tq-section-title results-heading">
			{$t('telekom.leaderboard', { defaultValue: 'Leaderboard' })}
		</h2>
		<div class="tq-table-wrap">
			<table class="tq-table results-table">
				<thead>
					<tr>
						<th class="results-rank">{$t('telekom.rank', { defaultValue: 'Rank' })}</th>
						<th>{$t('words.name')}</th>
						<th class="results-number">{$t('words.point_plural')}</th>
						{#if show_new_score_clicked}
							<th in:fly|global={{ x: 300 }} class="results-number">
								{$t('play_page.points_added')}
							</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each player_names.slice(0, 4) as player, i (player)}
						<tr animate:flip>
							<td class="results-rank">{i + 1}</td>
							<td>{player}</td>
							<td class="results-number">{data[player]}</td>
							{#if show_new_score_clicked}
								<td
									in:fly|global={{ x: 300 }}
									class="results-number results-added"
									class:results-none={score_by_username[player] === 0 ||
										score_by_username[player] === undefined}
								>
									+{score_by_username[player] ?? '0'}
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
	{#if show_answers}
		<VotingResults data={new_data} {question} />
	{/if}
</div>

<style>
	.results-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 24px;
		align-items: start;
		padding-block-start: 32px;
	}

	.results-split {
		grid-template-columns: minmax(0, 1fr);
	}

	@media (min-width: 1100px) {
		.results-split {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}

	.results-board {
		overflow: hidden;
	}

	.results-heading {
		padding: 20px 24px 12px;
	}

	.results-table {
		font-size: 20px;
	}

	.results-rank {
		width: 72px;
		font-variant-numeric: tabular-nums;
	}

	.results-number {
		text-align: end;
		font-variant-numeric: tabular-nums;
	}

	.results-added {
		color: var(--tq-success);
		font-weight: 700;
	}

	.results-none {
		color: var(--tq-muted);
	}
</style>
