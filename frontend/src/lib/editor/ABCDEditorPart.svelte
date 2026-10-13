<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Answer, EditorData } from '../quiz_types';
	import { QuizQuestionType } from '../quiz_types';
	import { reach } from 'yup';
	import { ABCDQuestionSchema } from '$lib/yupSchemas';
	import { getLocalization } from '$lib/i18n';
	import { answerStyle } from '$lib/answer-presentation';
	import AnswerGrid from '$lib/editor/AnswerGrid.svelte';
	import AnswerCard from '$lib/editor/AnswerCard.svelte';
	import AnswerColor from '$lib/editor/AnswerColor.svelte';
	import CorrectToggle from '$lib/editor/CorrectToggle.svelte';

	const { t } = getLocalization();

	interface Props {
		selected_question: number;
		check_choice?: boolean;
		data: EditorData;
	}

	let { selected_question, check_choice = false, data = $bindable() }: Props = $props();
	if (!Array.isArray(data.questions[selected_question].answers)) {
		data.questions[selected_question].answers = [];
	}
	let answers = $derived(data.questions[selected_question].answers as Answer[]);

	const save_colors = (data_local: EditorData) => {
		if (selected_question === 0) {
			const saved = data_local.questions[selected_question].answers as Answer[];
			for (let i = 0; i < saved.length; i++) {
				if (saved[i].color) {
					localStorage.setItem(`quiz_color:${i}:${data_local.title}`, saved[i].color);
				}
			}
		}
	};
	$effect(() => {
		save_colors(data);
	});

	// New answers keep their colour unset, so the theme colours apply.
	const get_empty_answer = (): Answer => {
		return {
			answer: '',
			right: false
		};
	};
	data.questions[selected_question].type =
		check_choice === true ? QuizQuestionType.CHECK : QuizQuestionType.ABCD;
</script>

<AnswerGrid
	count={answers.length}
	data_ui="abcd-answers"
	onadd={() => {
		data.questions[selected_question].answers = [...answers, { ...get_empty_answer() }];
	}}
>
	{#each answers as answer, index}
		{@const letter = String.fromCharCode(65 + index)}
		<AnswerCard
			badge={letter}
			invalid={!reach(ABCDQuestionSchema, 'answer').isValidSync(answer.answer)}
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
				<CorrectToggle bind:checked={answer.right} />
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
