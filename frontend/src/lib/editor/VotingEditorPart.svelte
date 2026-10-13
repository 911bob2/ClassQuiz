<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { EditorData, VotingAnswer } from '../quiz_types';
	import { reach } from 'yup';
	import { getLocalization } from '$lib/i18n';
	import { VotingQuestionSchema } from '$lib/yupSchemas';
	import { answerStyle } from '$lib/answer-presentation';
	import AnswerGrid from '$lib/editor/AnswerGrid.svelte';
	import AnswerCard from '$lib/editor/AnswerCard.svelte';
	import AnswerColor from '$lib/editor/AnswerColor.svelte';

	const { t } = getLocalization();

	interface Props {
		selected_question: number;
		data: EditorData;
	}

	let { selected_question, data = $bindable() }: Props = $props();

	if (!Array.isArray(data.questions[selected_question].answers)) {
		data.questions[selected_question].answers = [];
	}
	try {
		if (typeof data.questions[selected_question].answers[0].right === 'boolean') {
			data.questions[selected_question].answers = [];
		}
		// eslint-disable-next-line no-empty
	} catch {}
	let answers = $derived(data.questions[selected_question].answers as VotingAnswer[]);
</script>

<AnswerGrid
	count={answers.length}
	data_ui="voting-answers"
	onadd={() => {
		// New answers keep their colour unset, so the theme colours apply.
		data.questions[selected_question].answers = [
			...answers,
			{
				...{
					answer: '',
					image: undefined
				}
			}
		];
	}}
>
	{#each answers as answer, index}
		{@const letter = String.fromCharCode(65 + index)}
		<AnswerCard
			badge={letter}
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
					number: letter
				})}
				placeholder={$t('editor.enter_answer')}
			/>
			{#snippet options()}
				<AnswerColor
					bind:color={answer.color}
					label={$t('telekom.answer_color', {
						defaultValue: 'Color of answer {{number}}',
						number: letter
					})}
				/>
			{/snippet}
		</AnswerCard>
	{/each}
</AnswerGrid>
