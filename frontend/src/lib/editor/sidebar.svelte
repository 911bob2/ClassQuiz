<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { EditorData, Question } from '../quiz_types';
	import { QuizQuestionType } from '$lib/quiz_types';
	import { reach } from 'yup';
	import { dataSchema } from '../yupSchemas';

	import { getLocalization } from '$lib/i18n';
	import Icon from '$lib/editor/Icon.svelte';
	import { plain_text, question_type_keys } from '$lib/editor/text';

	const { t } = getLocalization();

	interface Props {
		data: EditorData;
		selected_question?: any;
		/** Called after a question was chosen, so a drawer can close itself. */
		onnavigate?: () => void;
		/** Shown as a close button when the navigation is displayed as a drawer. */
		onclose?: () => void;
		/** Asks the editor to open the "select question type" dialog. */
		onaddquestion?: () => void;
	}

	let {
		data = $bindable(),
		selected_question = $bindable(-1),
		onnavigate,
		onclose,
		onaddquestion
	}: Props = $props();

	let reorder_mode = $state(false);

	const empy_slide: Question = {
		type: QuizQuestionType.SLIDE,
		time: '120',
		question: 'Slide',
		image: undefined,
		answers: ''
	};

	const swapArrayElements = (arr, a: number, b: number) => {
		let _arr = [...arr];
		let temp = _arr[a];
		_arr[a] = _arr[b];
		_arr[b] = temp;
		return _arr;
	};

	const setSelectedQuestion = (index: number): void => {
		if (!reorder_mode) {
			selected_question = index;
			onnavigate?.();
		}
	};
	const moveQuestion = (index: number, direction: number) => {
		data.questions = swapArrayElements(data.questions, index, index + direction);
		if (selected_question === index) {
			selected_question += direction;
		} else if (selected_question === index + direction) {
			selected_question = index;
		}
	};
	const deleteQuestion = (index: number) => {
		if (
			confirm(
				$t('telekom.confirm_delete_question', {
					defaultValue: 'Do you really want to delete this question?'
				})
			)
		) {
			selected_question = -1;
			data.questions.splice(index, 1);
			data.questions = data.questions;
		}
	};
	const addSlide = () => {
		data.questions = [...data.questions, { ...empy_slide }];
		selected_question = data.questions.length - 1;
		onnavigate?.();
	};
</script>

<nav class="question-nav" aria-label={$t('words.question_plural')}>
	<div class="question-nav-heading">
		<h2>{$t('words.question_plural')}</h2>
		<span class="tq-badge">{data.questions.length}</span>
		{#if onclose}
			<button
				type="button"
				class="tq-icon-button tq-button-ghost drawer-close"
				data-ui="question-drawer-close"
				aria-label={$t('words.close')}
				onclick={onclose}
			>
				<Icon name="close" />
			</button>
		{/if}
	</div>

	<button
		type="button"
		class="question-link settings-link"
		class:active={selected_question === -1}
		aria-current={selected_question === -1 ? 'true' : undefined}
		data-ui="quiz-settings-select"
		onclick={() => setSelectedQuestion(-1)}
	>
		<span class="question-index"><Icon name="sliders" size={18} /></span>
		<span class="question-summary">
			<span class="question-title">
				{$t('telekom.quiz_settings', { defaultValue: 'Quiz settings' })}
			</span>
			<span class="question-meta">
				<Icon name={data.public ? 'globe' : 'lock'} size={14} />
				{data.public ? $t('words.public') : $t('words.private')}
			</span>
		</span>
	</button>

	<ol class="question-list">
		{#each data.questions as question, index}
			{@const valid = reach(dataSchema, 'questions[].question').isValidSync(
				question.question
			)}
			<li class="question-item" class:active={index === selected_question}>
				<div class="question-row">
					<button
						type="button"
						class="question-link"
						aria-current={index === selected_question ? 'true' : undefined}
						aria-disabled={reorder_mode ? 'true' : undefined}
						data-ui="question-select"
						onclick={() => setSelectedQuestion(index)}
					>
						<span class="question-index">{index + 1}</span>
						<span class="question-summary">
							<span class="question-title">
								{plain_text(question.question) || $t('editor.no_title')}
							</span>
							<span class="question-meta">
								{$t(question_type_keys[String(question.type)] ?? 'words.question')}
								{#if !valid}
									<span class="question-invalid">
										<Icon name="warning" size={14} />
										{$t('telekom.incomplete', { defaultValue: 'Incomplete' })}
									</span>
								{/if}
							</span>
						</span>
					</button>
					<button
						type="button"
						class="tq-icon-button tq-button-ghost question-delete"
						data-ui="question-delete"
						aria-label={$t('editor.delete_question')}
						onclick={() => deleteQuestion(index)}
					>
						<Icon name="trash" />
					</button>
				</div>
				{#if reorder_mode}
					<div class="question-reorder">
						<button
							type="button"
							class="tq-button"
							disabled={index === 0}
							aria-label={$t('telekom.move_up', { defaultValue: 'Move up' })}
							onclick={() => moveQuestion(index, -1)}
						>
							<Icon name="arrow-up" />
						</button>
						<button
							type="button"
							class="tq-button"
							disabled={index === data.questions.length - 1}
							aria-label={$t('telekom.move_down', { defaultValue: 'Move down' })}
							onclick={() => moveQuestion(index, 1)}
						>
							<Icon name="arrow-down" />
						</button>
					</div>
				{/if}
			</li>
		{/each}
	</ol>

	<div class="question-nav-controls">
		<button
			type="button"
			class="tq-button tq-button-primary"
			data-ui="add-question"
			onclick={() => onaddquestion?.()}
		>
			<Icon name="plus" />
			{$t('words.question')}
		</button>
		<button type="button" class="tq-button" data-ui="add-slide" onclick={addSlide}>
			<Icon name="plus" />
			{$t('words.slide')}
		</button>
		<button
			type="button"
			class="tq-button tq-button-ghost"
			data-ui="reorder-toggle"
			aria-pressed={reorder_mode}
			onclick={() => (reorder_mode = !reorder_mode)}
		>
			{reorder_mode ? $t('editor.disable_reorder') : $t('editor.enable_reorder')}
		</button>
	</div>
</nav>

<style>
	.question-nav {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 100%;
		padding: 16px 12px 0;
	}
	.question-nav-heading {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-inline: 4px;
	}
	.question-nav-heading h2 {
		font-size: 18px;
		font-weight: 700;
	}
	.drawer-close {
		display: none;
		margin-inline-start: auto;
	}
	.question-list {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.question-link {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 64px;
		padding: 10px 12px;
		border-radius: 8px;
		text-align: start;
	}
	.settings-link {
		width: 100%;
		flex: none;
		border: 1px solid var(--tq-border);
	}
	.question-item {
		border: 1px solid var(--tq-border);
		border-radius: 8px;
		background: var(--tq-surface);
	}
	.question-row {
		display: flex;
		align-items: center;
	}
	.question-row .question-link {
		padding-inline-end: 4px;
	}
	.question-link:hover,
	.question-item:hover {
		background: var(--tq-surface-hover);
	}
	.question-link[aria-disabled='true'] {
		cursor: default;
	}
	.question-item.active,
	.settings-link.active {
		border-color: var(--tq-accent);
		background: var(--tq-brand-soft);
	}
	.question-item.active .question-link,
	.question-item.active .question-delete {
		background: transparent;
	}
	.question-index {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: var(--tq-surface-hover);
		font-size: 14px;
		font-weight: 700;
	}
	.active .question-index {
		background: var(--tq-surface);
		color: var(--tq-accent);
	}
	.question-summary {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.question-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 15px;
		font-weight: 700;
	}
	.question-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px 10px;
		color: var(--tq-muted);
		font-size: 13px;
	}
	.question-invalid {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--tq-danger);
		font-weight: 700;
	}
	.question-delete {
		border-color: transparent;
		color: var(--tq-muted);
	}
	.question-delete:hover {
		color: var(--tq-danger);
		background: var(--tq-danger-soft);
	}
	.question-reorder {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		padding: 0 8px 8px;
	}
	.question-nav-controls {
		position: sticky;
		bottom: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-inline: -12px;
		padding: 12px;
		background: var(--tq-surface);
		border-top: 1px solid var(--tq-border);
	}

	@media (max-width: 1023px) {
		.drawer-close {
			display: inline-flex;
		}
	}
</style>
