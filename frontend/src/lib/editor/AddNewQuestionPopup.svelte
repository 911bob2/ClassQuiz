<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Answers, Question } from '$lib/quiz_types';
	import { QuizQuestionType } from '$lib/quiz_types';
	import { fade } from 'svelte/transition';
	import { getLocalization } from '$lib/i18n';
	import Icon from '$lib/editor/Icon.svelte';
	import { modal } from '$lib/editor/modal';

	interface Props {
		questions: Question[];
		open: boolean;
		selected_question: number;
		/** Called after a question was added. */
		onadd?: () => void;
	}

	let {
		questions = $bindable(),
		open = $bindable(),
		selected_question = $bindable(),
		onadd
	}: Props = $props();

	const { t } = getLocalization();

	const close = () => {
		open = false;
	};
	const on_parent_click = (e: Event) => {
		if (e.target === e.currentTarget) {
			open = false;
		}
	};

	const question_types: {
		name: string;
		description: string;
		answers: Answers;
		type: QuizQuestionType;
	}[] = [
		{
			name: $t('words.multiple_choice'),
			description: $t('editor.abcd_description'),
			answers: [],
			type: QuizQuestionType.ABCD
		},
		{
			name: $t('words.voting'),
			description: $t('editor.voting_description'),
			answers: [],
			type: QuizQuestionType.VOTING
		},
		{
			name: $t('words.check_choice'),
			description: $t('editor.check_choice_description'),
			answers: [],
			type: QuizQuestionType.CHECK
		},
		{
			name: $t('words.order'),
			description: $t('editor.order_description'),
			answers: [],
			type: QuizQuestionType.ORDER
		},
		{
			name: $t('words.text'),
			description: $t('editor.text_description'),
			answers: [],
			type: QuizQuestionType.TEXT
		},
		{
			name: $t('words.range'),
			description: $t('editor.range_description'),
			answers: {
				max: 10,
				min: 0,
				max_correct: 7,
				min_correct: 3
			},
			type: QuizQuestionType.RANGE
		}
	];

	const add_question = (index: number) => {
		const empty_question: Question = {
			type: question_types[index].type,
			time: '20',
			question: '',
			image: undefined,
			answers: question_types[index].answers
		};
		questions = [...questions, { ...empty_question }];
		selected_question = questions.length - 1;
		open = false;
		onadd?.();
	};
</script>

<div
	class="tq-overlay"
	onclick={on_parent_click}
	role="presentation"
	use:modal={{ onclose: close }}
	transition:fade|global={{ duration: 100 }}
>
	<div
		class="tq-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="question-type-title"
		data-ui="question-type-dialog"
	>
		<div class="dialog-heading">
			<h2 id="question-type-title" class="tq-section-title">
				{$t('telekom.select_question_type', { defaultValue: 'Select question type' })}
			</h2>
			<button
				type="button"
				class="tq-icon-button tq-button-ghost"
				aria-label={$t('words.close')}
				onclick={close}
			>
				<Icon name="close" />
			</button>
		</div>
		<div class="type-grid">
			{#each question_types as qt, i}
				<button
					type="button"
					class="type-option"
					data-autofocus={i === 0 ? '' : undefined}
					data-ui={'question-type-' + qt.type.toLowerCase()}
					onclick={() => add_question(i)}
				>
					<span class="type-name">{qt.name}</span>
					<span class="type-description">{qt.description}</span>
				</button>
			{/each}
		</div>
		<p class="dialog-help">
			{$t('editor.need_more_help')}
			<a class="tq-link" href="/docs/quiz/question-types" target="_blank">
				{$t('editor.visit_docs')}
			</a>
		</p>
	</div>
</div>

<style>
	.dialog-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 20px;
	}
	.type-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.type-option {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		min-height: 88px;
		padding: 16px;
		border: 1px solid var(--tq-border-strong);
		border-radius: 8px;
		background: var(--tq-surface);
		text-align: start;
	}
	.type-option:hover {
		border-color: var(--tq-accent);
		background: var(--tq-brand-soft);
	}
	.type-name {
		font-weight: 700;
	}
	.type-description {
		color: var(--tq-muted);
		font-size: 14px;
	}
	.dialog-help {
		margin: 20px 0 0;
		color: var(--tq-muted);
		font-size: 14px;
	}

	@media (max-width: 560px) {
		.type-grid {
			grid-template-columns: 1fr;
		}
		.type-option {
			min-height: 72px;
		}
	}
</style>
