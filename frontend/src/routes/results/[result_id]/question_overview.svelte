<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Question } from '$lib/quiz_types';
	import { fly } from 'svelte/transition';
	import QuestionTab from './question_tab_dropdown.svelte';
	import { QuizQuestionType } from '$lib/quiz_types';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		questions: Question[];
		answers: {
			username: string;
			answer: string;
			right: boolean;
			time_taken: number;
			score: number;
		}[][];
	}

	let { questions, answers }: Props = $props();

	const get_average_score = (q_index: number): number => {
		const q_answers = answers[q_index];
		if (!q_answers?.length) {
			return 0;
		}
		let summed_up_scores = 0;
		for (const answer of q_answers) {
			summed_up_scores = summed_up_scores + answer.score;
		}
		return summed_up_scores / q_answers.length;
	};

	const get_number_of_correct_answers = (q_index: number): number => {
		const q_answers = answers[q_index] ?? [];
		let correct_answer = 0;
		for (const answer of q_answers) {
			if (answer.right) {
				correct_answer++;
			}
		}
		return correct_answer;
	};

	const toggle_dropdown = (q_index: number) => {
		if (question_open === q_index) {
			question_open = false;
		} else {
			question_open = q_index;
		}
	};
	let question_open: number | boolean = $state(false);
</script>

<ol class="question-list" data-ui="results-questions">
	{#each questions as question, i}
		<li class="tq-panel question-item">
			<button
				type="button"
				class="question-toggle"
				data-ui="results-question-toggle"
				aria-expanded={question_open === i}
				aria-controls="question-detail-{i}"
				onclick={() => {
					toggle_dropdown(i);
				}}
			>
				<span class="question-index" aria-hidden="true">{i + 1}</span>
				<span class="question-text">{@html question.question}</span>
				{#if question.type !== QuizQuestionType.VOTING}
					<span class="question-stats">
						<span>
							{$t('result_page.average_score', {
								average_score: get_average_score(i).toFixed(0)
							})}
						</span>
						<span class="question-correct">
							{get_number_of_correct_answers(i)} / {answers[i]?.length ?? 0}
							{$t('words.correct')}
						</span>
					</span>
				{/if}
				<svg class="question-chevron" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M6 9l6 6 6-6" />
				</svg>
			</button>
			{#if question_open === i}
				<div id="question-detail-{i}" class="question-detail" in:fly={{ y: -10 }}>
					<QuestionTab {question} answers={answers[i]} />
				</div>
			{/if}
		</li>
	{/each}
</ol>

<style>
	.question-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.question-toggle {
		display: flex;
		align-items: center;
		gap: 16px;
		width: 100%;
		min-height: 64px;
		padding: 12px 16px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: inherit;
		text-align: start;
	}

	.question-toggle:hover {
		background: var(--tq-surface-subtle);
	}

	.question-index {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: var(--tq-surface-hover);
		color: var(--tq-muted);
		font-size: 14px;
		font-weight: 700;
	}

	.question-text {
		flex: 1;
		min-width: 0;
		font-size: 18px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.question-text :global(p) {
		margin: 0;
	}

	.question-stats {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		flex-shrink: 0;
		color: var(--tq-muted);
		font-size: 14px;
	}

	.question-chevron {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: transform 150ms;
	}

	.question-toggle[aria-expanded='true'] .question-chevron {
		transform: rotate(180deg);
	}

	.question-detail {
		padding: 0 16px 16px;
		border-block-start: 1px solid var(--tq-border);
	}

	@media (max-width: 700px) {
		.question-toggle {
			display: grid;
			grid-template-columns: auto minmax(0, 1fr) auto;
			align-items: start;
		}

		.question-chevron {
			grid-column: 3;
			grid-row: 1;
		}

		.question-stats {
			grid-column: 2 / -1;
			flex-direction: row;
			flex-wrap: wrap;
			gap: 4px 16px;
			align-items: flex-start;
		}
	}
</style>
