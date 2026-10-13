<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Answer, Question } from '$lib/quiz_types';
	import AnswerTile from '$lib/play/answer_tile.svelte';
	import { getLocalization } from '$lib/i18n';
	const { t } = getLocalization();
	import { QuizQuestionType } from '$lib/quiz_types';

	interface Props {
		data: any;
		question: Question;
	}

	let { data, question }: Props = $props();

	let quiz_answers = [];
	let quiz_colors = [];
	let answer_correct: boolean[] = [];

	for (const i of question.answers as Answer[]) {
		quiz_answers.push(i.answer);
		quiz_colors.push(i.color);
		answer_correct.push(i.right);
	}

	let sorted_data = $state({});
	for (const i of quiz_answers) {
		sorted_data[i] = 0;
	}
	for (const i of data) {
		sorted_data[i.answer] += 1;
	}

	const has_right_answers = question.type !== QuizQuestionType.VOTING;
	const has_letters = question.type !== QuizQuestionType.TEXT;
</script>

<section class="tq-panel tq-panel-body vote-panel" data-ui="answer-results">
	<h2 class="tq-section-title">{$t('telekom.answers', { defaultValue: 'Answers' })}</h2>
	<ul class="vote-list">
		{#each quiz_answers as answer, i}
			{@const is_correct = has_right_answers && answer_correct[i]}
			<li class="vote-row">
				<AnswerTile
					size="compact"
					index={has_letters ? i : undefined}
					label={answer}
					color={quiz_colors[i]}
					status={is_correct ? 'correct' : undefined}
				>
					<strong class="vote-count">{sorted_data[answer]}</strong>
				</AnswerTile>
				<div class="vote-track" aria-hidden="true">
					<div
						class="vote-bar"
						class:vote-bar-correct={is_correct}
						style="width: {data.length
							? (sorted_data[answer] / data.length) * 100
							: 0}%"
					></div>
				</div>
			</li>
		{/each}
	</ul>
</section>

<style>
	.vote-panel {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.vote-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vote-count {
		flex-shrink: 0;
		min-width: 2ch;
		font-size: 22px;
		font-variant-numeric: tabular-nums;
		text-align: end;
	}

	.vote-track {
		height: 10px;
		margin-block-start: 8px;
		border-radius: 5px;
		background: var(--tq-surface-hover);
		overflow: hidden;
	}

	.vote-bar {
		height: 100%;
		border-radius: 5px;
		background: var(--tq-accent);
		transition: width 400ms ease;
	}

	.vote-bar-correct {
		background: var(--tq-success);
	}
</style>
