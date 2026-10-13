<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Abcd } from '$lib/quiztivity/types';
	import AnswerTile from '$lib/play/answer_tile.svelte';

	interface Props {
		data: Abcd | undefined;
	}

	let { data }: Props = $props();

	let selected_answer: number | undefined = $state();

	const select_answer = (i: number) => {
		selected_answer = i;
		console.log(data);
	};

	// Once an answer is chosen, every right answer is marked and a wrong choice is flagged.
	const status_of = (i: number, correct: boolean): 'correct' | 'incorrect' | undefined => {
		if (selected_answer === undefined) {
			return undefined;
		}
		if (correct) {
			return 'correct';
		}
		return selected_answer === i ? 'incorrect' : undefined;
	};
</script>

<section class="tq-panel tq-panel-body tq-stack" data-ui="activity-abcd">
	<h1 class="tq-page-title abcd-question">{data.question}</h1>

	<div class="abcd-answers">
		{#each data.answers as answer, i}
			<AnswerTile
				index={i}
				label={answer.answer}
				selected={selected_answer === i}
				status={status_of(i, answer.correct)}
				dimmed={selected_answer !== undefined && !answer.correct && selected_answer !== i}
				onclick={() => {
					select_answer(i);
				}}
			/>
		{/each}
	</div>
</section>

<style>
	.abcd-question {
		font-size: clamp(22px, 4vw, 32px);
		overflow-wrap: anywhere;
	}

	.abcd-answers {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	@media (max-width: 700px) {
		.abcd-answers {
			grid-template-columns: 1fr;
		}
	}
</style>
