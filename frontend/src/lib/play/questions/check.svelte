<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Answer, Question } from '$lib/quiz_types';
	import { getLocalization } from '$lib/i18n';
	import AnswerTile from '$lib/play/answer_tile.svelte';

	const { t } = getLocalization();

	interface Props {
		question: Question;
		selected_answer?: string;
		game_mode: any;
		timer_res: any;
		circular_progress: any;
		disabled?: boolean;
	}

	let { question, selected_answer = $bindable(), game_mode, disabled = false }: Props = $props();
	let _selected_answers = $state([false, false, false, false]);

	const selectAnswer = (i: number) => {
		_selected_answers[i] = !_selected_answers[i];
		selected_answer = '';
		for (let i = 0; i < _selected_answers.length; i++) {
			if (_selected_answers[i]) {
				selected_answer += String(i);
			}
		}
		selected_answer = selected_answer;
		console.log(_selected_answers, selected_answer);
	};
</script>

<div class="check-answers">
	<p class="tq-muted check-hint">
		{$t('telekom.select_all_that_apply', { defaultValue: 'Select all that apply' })}
	</p>
	<div class="answer-grid" class:answer-grid-shapes={game_mode === 'kahoot'}>
		{#each question.answers as Answer[] as answer, i}
			<AnswerTile
				index={i}
				label={answer.answer}
				color={answer.color}
				shapeOnly={game_mode === 'kahoot'}
				selected={_selected_answers[i]}
				{disabled}
				onclick={() => selectAnswer(i)}
			/>
		{/each}
	</div>
</div>

<style>
	.check-answers {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.check-hint {
		margin: 0;
		font-size: 14px;
	}

	.answer-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}

	.answer-grid-shapes {
		grid-auto-rows: 1fr;
	}

	@media (max-width: 600px) {
		.answer-grid:not(.answer-grid-shapes) {
			grid-template-columns: 1fr;
		}

		.answer-grid {
			gap: 12px;
		}
	}
</style>
