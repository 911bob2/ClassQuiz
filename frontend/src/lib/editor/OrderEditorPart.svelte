<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import type { EditorData, OrderQuizAnswer } from '$lib/quiz_types';
	import { flip } from 'svelte/animate';
	import { reach } from 'yup';
	import { VotingQuestionSchema } from '$lib/yupSchemas';
	import { answerStyle } from '$lib/answer-presentation';
	import AnswerGrid from '$lib/editor/AnswerGrid.svelte';
	import AnswerCard from '$lib/editor/AnswerCard.svelte';
	import AnswerColor from '$lib/editor/AnswerColor.svelte';
	import Icon from '$lib/editor/Icon.svelte';

	const { t } = getLocalization();

	interface Props {
		selected_question: number;
		data: EditorData;
	}

	let { selected_question, data = $bindable() }: Props = $props();

	const swapArrayElements = (arr: OrderQuizAnswer[], a: number, b: number): Array<any> => {
		let _arr = [...arr];
		let temp = _arr[a];
		_arr[a] = _arr[b];
		_arr[b] = temp;
		return _arr;
	};

	const move_item = (up: boolean, index: number) => {
		if (up) {
			data.questions[selected_question].answers = swapArrayElements(
				data.questions[selected_question].answers as OrderQuizAnswer[],
				index,
				index - 1
			);
		} else {
			data.questions[selected_question].answers = swapArrayElements(
				data.questions[selected_question].answers as OrderQuizAnswer[],
				index,
				index + 1
			);
		}
	};

	if (!Array.isArray(data.questions[selected_question].answers)) {
		data.questions[selected_question].answers = [];
	}
	for (let i = 0; i < data.questions[selected_question].answers.length; i++) {
		data.questions[selected_question].answers[i] = {
			answer: data.questions[selected_question].answers[i].answer,
			color: data.questions[selected_question].answers[i].color ?? undefined,
			id: [i]
		};
	}
	let answers = $derived(data.questions[selected_question].answers as OrderQuizAnswer[]);
</script>

<AnswerGrid
	count={answers.length}
	single
	data_ui="order-answers"
	onadd={() => {
		// New answers keep their colour unset, so the theme colours apply.
		data.questions[selected_question].answers = [
			...answers,
			{
				...{
					answer: '',
					color: undefined,
					id: answers.length
				}
			}
		];
	}}
>
	{#each answers as answer, index (answer.id)}
		<div class="order-item" animate:flip={{ duration: 200 }}>
			<AnswerCard
				badge={String(index + 1)}
				invalid={!reach(VotingQuestionSchema, 'answer').isValidSync(answer.answer)}
				onremove={() => {
					answers.splice(index, 1);
					data.questions[selected_question].answers = answers;
				}}
			>
				<input
					class="answer-field"
					type="text"
					bind:value={answer.answer}
					style={answerStyle(answer.color)}
					aria-label={$t('telekom.answer_number', {
						defaultValue: 'Answer {{number}}',
						number: index + 1
					})}
					placeholder={$t('editor.enter_answer')}
				/>
				{#snippet options()}
					<div class="order-controls">
						<button
							type="button"
							class="tq-icon-button"
							data-ui="answer-move-up"
							aria-label={$t('telekom.move_up', { defaultValue: 'Move up' })}
							disabled={index === 0}
							onclick={() => move_item(true, index)}
						>
							<Icon name="arrow-up" />
						</button>
						<button
							type="button"
							class="tq-icon-button"
							data-ui="answer-move-down"
							aria-label={$t('telekom.move_down', { defaultValue: 'Move down' })}
							disabled={index === answers.length - 1}
							onclick={() => move_item(false, index)}
						>
							<Icon name="arrow-down" />
						</button>
					</div>
					<AnswerColor
						bind:color={answer.color}
						label={$t('telekom.answer_color', {
							defaultValue: 'Color of answer {{number}}',
							number: index + 1
						})}
					/>
				{/snippet}
			</AnswerCard>
		</div>
	{/each}
</AnswerGrid>

<style>
	.order-controls {
		display: flex;
		gap: 8px;
	}
</style>
