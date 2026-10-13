<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		question_count: number;
		final_results: Array<null> | Array<Array<PlayerAnswer>>;
	}

	let { question_count, final_results }: Props = $props();

	interface PlayerAnswer {
		username: string;
		answer: string;
		right: string;
	}

	let data_available = $state(false);
	let winners_arr: any = $state();

	const getWinnersSorted = () => {
		let winners = {};
		let q_count = question_count;
		console.log(
			JSON.stringify(final_results),
			JSON.stringify(final_results) === '{}',
			'HI!!!!!',
			JSON.stringify(final_results) === JSON.stringify({})
		);

		function sortObjectbyValue(obj) {
			const ret = {};
			Object.keys(obj)
				.sort((a, b) => obj[b] - obj[a])
				.forEach((s) => (ret[s] = obj[s]));
			return ret;
		}

		try {
			for (let i = 0; i < q_count; i++) {
				let q_res = final_results[i];
				if (!q_res) {
					continue;
				} else {
					q_res = final_results[String(i)];
					if (!q_res) {
						continue;
					}
				}
				console.log(q_res);
				for (let j = 0; j < q_res.length; j++) {
					let res = q_res[j];
					if (res['right']) {
						if (winners[res['username']] === undefined) {
							winners[res['username']] = 0;
						}
						winners[res['username']] += 1;
					}
				}
			}

			let close_to_res = sortObjectbyValue(winners);
			winners_arr = [];
			for (const i in close_to_res) {
				winners_arr.push([i, close_to_res[i]]);
			}

			winners_arr = winners_arr.sort(function (a, b) {
				return b[1] - a[1];
			});
			data_available = true;
			return close_to_res;
		} catch (e) {
			console.log(e);
			data_available = false;
		}
	};
	let winners = getWinnersSorted();
</script>

<main class="tq-page tq-page-narrow tq-stack">
	{#if data_available && winners_arr[0][0] !== undefined}
		<div class="tq-panel tq-table-wrap">
			<table class="tq-table">
				<thead>
					<tr>
						<th>{$t('telekom.rank', { defaultValue: 'Rank' })}</th>
						<th>{$t('words.name')}</th>
						<th>{$t('words.correct')}</th>
					</tr>
				</thead>
				<tbody>
					{#each winners_arr.slice(0, 3) as winner, i}
						<tr>
							<td>{i + 1}</td>
							<td>{winner[0]}</td>
							<td>{winner[1] ?? 0} / {question_count}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="tq-panel tq-empty">{$t('admin_page.no_answers')}</p>
	{/if}
</main>
