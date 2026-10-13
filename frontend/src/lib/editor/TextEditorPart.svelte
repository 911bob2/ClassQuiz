<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { EditorData, TextQuizAnswer } from '$lib/quiz_types';
	import { getLocalization } from '$lib/i18n';
	import { reach } from 'yup';
	import { TextQuestionSchema } from '$lib/yupSchemas';
	import AnswerGrid from '$lib/editor/AnswerGrid.svelte';
	import AnswerCard from '$lib/editor/AnswerCard.svelte';

	interface Props {
		selected_question: number;
		data: EditorData;
	}

	let { selected_question, data = $bindable() }: Props = $props();

	const { t } = getLocalization();

	if (!Array.isArray(data.questions[selected_question].answers)) {
		data.questions[selected_question].answers = [];
	}

	for (let i = 0; i < data.questions[selected_question].answers.length; i++) {
		data.questions[selected_question].answers[i] = {
			answer: data.questions[selected_question].answers[i].answer,
			case_sensitive: false
		};
	}
	let answers = $derived(data.questions[selected_question].answers as TextQuizAnswer[]);

	const get_empty_answer = (): TextQuizAnswer => {
		return {
			answer: '',
			case_sensitive: false
		};
	};
</script>

<AnswerGrid
	count={answers.length}
	data_ui="text-answers"
	onadd={() => {
		data.questions[selected_question].answers = [...answers, { ...get_empty_answer() }];
	}}
>
	{#each answers as answer, index}
		<AnswerCard
			badge={String(index + 1)}
			invalid={!reach(TextQuestionSchema, 'answer').isValidSync(answer.answer)}
			onremove={() => {
				answers.splice(index, 1);
				data.questions[selected_question].answers = answers;
			}}
		>
			<input
				class="answer-field"
				type="text"
				bind:value={answer.answer}
				aria-label={$t('telekom.answer_number', {
					defaultValue: 'Answer {{number}}',
					number: index + 1
				})}
				placeholder={$t('editor.enter_answer')}
			/>
			{#snippet options()}
				<label class="case-sensitive">
					<input type="checkbox" bind:checked={answer.case_sensitive} />
					<span>{$t('telekom.case_sensitive', { defaultValue: 'Case sensitive' })}</span>
				</label>
			{/snippet}
		</AnswerCard>
	{/each}
</AnswerGrid>

<style>
	.case-sensitive {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
	}
</style>
