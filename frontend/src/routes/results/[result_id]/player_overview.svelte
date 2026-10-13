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
		custom_field: {
			[key: string]: string;
		};
		answers: { [key: string]: any }[];
	}

	let { scores, custom_field, answers }: Props = $props();

	let usernames = $derived(
		Object.keys(scores).sort((a, b) => {
			const scoreA = parseFloat(scores[a]) || 0;
			const scoreB = parseFloat(scores[b]) || 0;
			return scoreB - scoreA;
		})
	);

	const correctCounts = {};
	answers.forEach((questionAnswers) => {
		questionAnswers.forEach((answer) => {
			const user = answer.username;
			if (!correctCounts[user]) {
				correctCounts[user] = 0;
			}
			if (answer.right) {
				correctCounts[user] += 1;
			}
		});
	});

	const has_custom_field = Object.keys(custom_field ?? {}).length !== 0;
</script>

<div class="tq-panel tq-table-wrap" data-ui="results-players">
	<table class="tq-table players-table">
		<thead>
			<tr>
				<th class="players-rank">{$t('telekom.rank', { defaultValue: 'Rank' })}</th>
				<th>{$t('result_page.player_name')}</th>
				<th class="players-number">{$t('result_page.player_correct_questions')}</th>
				<th class="players-number">{$t('result_page.player_score')}</th>
				{#if has_custom_field}
					<th>{$t('result_page.custom_field')}</th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each usernames as uname, i}
				<tr>
					<td class="players-rank">{i + 1}</td>
					<td>{uname}</td>
					<td class="players-number">{correctCounts[uname] ?? 0}</td>
					<td class="players-number"><strong>{scores[uname]}</strong></td>
					{#if has_custom_field}
						<td>{custom_field[uname] ?? '–'}</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.players-rank {
		width: 72px;
		font-variant-numeric: tabular-nums;
	}

	.players-number {
		text-align: end;
		font-variant-numeric: tabular-nums;
	}
</style>
