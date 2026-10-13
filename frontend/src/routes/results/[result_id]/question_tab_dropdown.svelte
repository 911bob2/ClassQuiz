<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { QuizQuestionType } from '$lib/quiz_types';
	import { getLocalization } from '$lib/i18n';
	import type { Answer as QuizAnswer, Question } from '$lib/quiz_types';
	import Verdict from './verdict.svelte';

	const { t } = getLocalization();

	interface Answer {
		username: string;
		answer: string;
		right: boolean;
		time_taken: number;
		score: number;
	}

	interface Props {
		question: Question;
		answers: Answer[];
	}

	let { question, answers }: Props = $props();

	// The answers of a question are a union that depends on its type.
	const choices = question.answers as QuizAnswer[];

	const get_answer_count_for_answer = (answer: string): number => {
		let count = 0;
		let answer_id = 0;
		if (question.type === QuizQuestionType.CHECK) {
			for (let i = 0; i < choices.length; i++) {
				if (answer === choices[i].answer) {
					answer_id = i;
					break;
				}
			}
		}
		for (let i = 0; i < answers.length; i++) {
			const a = answers[i];
			if (question.type === QuizQuestionType.CHECK) {
				if (a.answer.includes(String(answer_id))) {
					count++;
				}
			} else if (a.answer === answer) {
				count++;
			}
		}
		return count;
	};

	const has_right_answers =
		question.type !== QuizQuestionType.VOTING && question.type !== QuizQuestionType.TEXT;
</script>

<div class="detail" data-ui="results-question-detail">
	{#if question.type !== QuizQuestionType.ORDER && question.type !== QuizQuestionType.RANGE}
		<ul class="distribution">
			{#each choices as answer}
				{@const count = get_answer_count_for_answer(answer.answer)}
				<li class="distribution-row">
					<span class="distribution-label">{answer.answer}</span>
					<span class="distribution-track" aria-hidden="true">
						<span
							class="distribution-bar"
							class:distribution-bar-right={has_right_answers && answer.right}
							style="width: {answers.length ? (count / answers.length) * 100 : 0}%"
						></span>
					</span>
					<span class="distribution-count">{count}</span>
					{#if has_right_answers}
						<Verdict right={answer.right} />
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	<div class="tq-table-wrap">
		<table class="tq-table detail-table">
			<thead>
				<tr>
					<th>{$t('result_page.player_name')}</th>
					{#if question.type !== QuizQuestionType.VOTING}
						<th class="detail-number">{$t('words.score')}</th>
					{/if}
					<th class="detail-number">{$t('result_page.time_taken')}</th>
					<th>{$t('words.answer')}</th>
					{#if question.type !== QuizQuestionType.VOTING}
						<th>{$t('words.correct')}?</th>
					{/if}
				</tr>
			</thead>
			<tbody>
				{#each answers as answer}
					<tr>
						<td>{answer.username}</td>
						{#if question.type !== QuizQuestionType.VOTING}
							<td class="detail-number">{answer.score}</td>
						{/if}
						<td class="detail-number">{(answer.time_taken / 1000).toFixed(3)}s</td>
						<td>{answer.answer}</td>
						{#if question.type !== QuizQuestionType.VOTING}
							<td><Verdict right={answer.right} /></td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.detail {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding-block-start: 16px;
	}

	.distribution {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.distribution-row {
		display: grid;
		grid-template-columns: minmax(80px, 1fr) minmax(80px, 2fr) 3ch auto;
		align-items: center;
		gap: 12px;
	}

	.distribution-label {
		overflow-wrap: anywhere;
	}

	.distribution-track {
		display: block;
		height: 10px;
		border-radius: 5px;
		background: var(--tq-surface-hover);
		overflow: hidden;
	}

	.distribution-bar {
		display: block;
		height: 100%;
		border-radius: 5px;
		background: var(--tq-accent);
	}

	.distribution-bar-right {
		background: var(--tq-success);
	}

	.distribution-count {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		text-align: end;
	}

	.detail-table {
		font-size: 15px;
	}

	.detail-number {
		text-align: end;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 600px) {
		.distribution-row {
			grid-template-columns: 1fr 3ch auto;
		}

		.distribution-label {
			grid-column: 1 / -1;
		}

		.distribution-track {
			grid-column: 1;
		}
	}
</style>
