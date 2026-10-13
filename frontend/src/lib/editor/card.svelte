<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { run } from 'svelte/legacy';

	import type { EditorData } from '$lib/quiz_types';
	import { QuizQuestionType } from '$lib/quiz_types';
	import RangeEditor from '$lib/editor/RangeSelectorEditorPart.svelte';
	import { reach } from 'yup';
	import { dataSchema } from '$lib/yupSchemas';
	import Spinner from '../Spinner.svelte';

	import { getLocalization } from '$lib/i18n';
	import MediaComponent from '$lib/editor/MediaComponent.svelte';
	import Icon from '$lib/editor/Icon.svelte';
	import { modal } from '$lib/editor/modal';
	import { question_type_keys, question_type_description_keys } from '$lib/editor/text';
	import { fade } from 'svelte/transition';

	const { t } = getLocalization();

	interface Props {
		data: EditorData;
		selected_question: number;
		edit_id: string;
	}

	let {
		data = $bindable(),
		selected_question = $bindable(),
		edit_id = $bindable()
	}: Props = $props();

	let advanced_options_open = $state(false);

	let uppyOpen = $state(false);
	let unique = $state({});

	/*eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }]*/
	const correctTimeInput = (_) => {
		let time = data.questions[selected_question].time;
		if (time === null || time === undefined) {
			data.questions[selected_question].time = '';
			time = '';
		}
		if (data.questions[selected_question].time > 3) {
			data.questions[selected_question].time = data.questions[selected_question].time
				.toString()
				.slice(0, 3);
		}
	};
	const set_unique = () => {
		unique = {};
	};
	run(() => {
		correctTimeInput(data.questions[selected_question].time);
	});
	run(() => {
		selected_question;
		set_unique();
	});
	let image_url = $state('');

	const update_image_url = () => {
		image_url = data.questions[selected_question].image;
	};
	run(() => {
		update_image_url();
		selected_question;
		data.questions;
	});

	const type_name = (type: string | undefined) =>
		$t(question_type_keys[String(type)] ?? 'words.slide');
</script>

<section class="tq-panel question-editor" data-ui="question-editor">
	<header class="question-header">
		<div>
			<span class="question-kicker">
				{#if data.questions[selected_question].type === QuizQuestionType.SLIDE}
					{$t('words.slide')}
				{:else}
					{$t('words.question')}
				{/if}
				{selected_question + 1}
			</span>
			<h2 class="tq-section-title">{type_name(data.questions[selected_question].type)}</h2>
		</div>
		<button
			type="button"
			class="tq-button"
			data-ui="advanced-settings-open"
			onclick={() => (advanced_options_open = true)}
		>
			<Icon name="sliders" />
			{$t('editor.advanced_settings')}
		</button>
	</header>

	{#if data.questions[selected_question].type === QuizQuestionType.SLIDE}
		{#await import('./slide.svelte')}
			<Spinner my_20={false} />
		{:then c}
			<c.default bind:data={data.questions[selected_question]} />
		{/await}
	{:else}
		{@const type = data.questions[selected_question].type}
		<div class="question-body">
			<div class="field-block">
				<span class="tq-label">{$t('words.question')}</span>
				{#key unique}
					{#await import('$lib/inline-editor.svelte')}
						<Spinner my_20={false} />
					{:then c}
						<c.default
							bind:text={data.questions[selected_question].question}
							label={$t('words.question')}
							invalid={!reach(dataSchema, 'questions[].question').isValidSync(
								data.questions[selected_question].question
							)}
						/>
					{/await}
				{/key}
			</div>

			<div class="question-details">
				<div class="field-block">
					<span class="tq-label">{$t('telekom.media', { defaultValue: 'Media' })}</span>
					{#if data.questions[selected_question].image}
						<div class="media-preview">
							<div class="media-frame">
								<MediaComponent src={image_url} />
							</div>
							<button
								type="button"
								class="tq-button tq-button-danger"
								data-ui="media-remove"
								onclick={() => {
									data.questions[selected_question].image = null;
								}}
							>
								<Icon name="trash" />
								{$t('telekom.remove_media', { defaultValue: 'Remove media' })}
							</button>
						</div>
					{:else}
						{#await import('$lib/editor/uploader.svelte')}
							<Spinner my_20={false} />
						{:then c}
							<c.default
								bind:modalOpen={uppyOpen}
								{data}
								{selected_question}
								video_upload={true}
							/>
						{/await}
					{/if}
				</div>
				<label class="field-block time-field">
					<span class="tq-label">{$t('editor.time_in_seconds')}</span>
					<input
						type="number"
						max="999"
						min="1"
						class="tq-field"
						bind:value={data.questions[selected_question].time}
					/>
				</label>
			</div>

			<section class="answers-section">
				<div class="answers-heading">
					<h3 class="tq-section-title">{$t('words.answer_plural')}</h3>
					{#if question_type_description_keys[String(type)]}
						<p class="tq-muted">{$t(question_type_description_keys[String(type)])}</p>
					{/if}
				</div>
				{#if type === QuizQuestionType.ABCD || type === QuizQuestionType.CHECK}
					{#await import('$lib/editor/ABCDEditorPart.svelte')}
						<Spinner my_20={false} />
					{:then c}
						<c.default
							bind:data
							{selected_question}
							check_choice={type === QuizQuestionType.CHECK}
						/>
					{/await}
				{:else if type === QuizQuestionType.RANGE}
					<RangeEditor {selected_question} bind:data />
				{:else if type === QuizQuestionType.VOTING}
					{#await import('$lib/editor/VotingEditorPart.svelte')}
						<Spinner my_20={false} />
					{:then c}
						<c.default bind:data {selected_question} />
					{/await}
				{:else if type === QuizQuestionType.TEXT}
					{#await import('$lib/editor/TextEditorPart.svelte')}
						<Spinner my_20={false} />
					{:then c}
						<c.default bind:data {selected_question} />
					{/await}
				{:else if type === QuizQuestionType.ORDER}
					{#await import('$lib/editor/OrderEditorPart.svelte')}
						<Spinner my_20={false} />
					{:then c}
						<c.default bind:data {selected_question} />
					{/await}
				{/if}
			</section>
		</div>
	{/if}
</section>

{#if advanced_options_open}
	<div
		class="tq-overlay"
		role="presentation"
		use:modal={{ onclose: () => (advanced_options_open = false) }}
		onclick={(e) => {
			if (e.target === e.currentTarget) {
				advanced_options_open = false;
			}
		}}
		transition:fade|global={{ duration: 150 }}
	>
		<div
			class="tq-dialog advanced-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="advanced-question-title"
			data-ui="advanced-settings-dialog"
		>
			<div class="dialog-heading">
				<h2 id="advanced-question-title" class="tq-section-title">
					{$t('editor.advanced_settings')}
				</h2>
				<button
					type="button"
					class="tq-icon-button tq-button-ghost"
					aria-label={$t('words.close')}
					onclick={() => (advanced_options_open = false)}
				>
					<Icon name="close" />
				</button>
			</div>
			<label class="setting-row">
				<span>{$t('editor.hide_question_results')}</span>
				<input
					type="checkbox"
					data-autofocus
					bind:checked={data.questions[selected_question]['hide_results']}
				/>
			</label>
			<div class="dialog-actions">
				<button
					type="button"
					class="tq-button tq-button-primary"
					onclick={() => (advanced_options_open = false)}
				>
					{$t('words.close')}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.question-editor {
		overflow: hidden;
	}
	.question-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 20px 24px;
		border-bottom: 1px solid var(--tq-border);
	}
	.question-kicker {
		display: block;
		color: var(--tq-muted);
		font-size: 14px;
	}
	.question-body {
		display: flex;
		flex-direction: column;
		gap: 32px;
		padding: 24px;
	}
	.field-block {
		min-width: 0;
	}
	.question-details {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 220px;
		gap: 24px;
		align-items: start;
	}
	.media-preview {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		padding: 16px;
		border: 1px solid var(--tq-border);
		border-radius: 8px;
		background: var(--tq-surface-subtle);
	}
	.media-frame {
		max-width: 100%;
	}
	.time-field input {
		max-width: 160px;
	}
	.answers-section {
		padding-top: 24px;
		border-top: 1px solid var(--tq-border);
	}
	.answers-heading {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px 16px;
		margin-bottom: 16px;
	}
	.answers-heading p {
		margin: 0;
		font-size: 14px;
	}
	.dialog-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 8px;
	}
	.advanced-dialog {
		max-width: min(480px, calc(100vw - 32px));
	}
	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		min-height: 56px;
		border-block: 1px solid var(--tq-border);
	}
	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 20px;
	}

	@media (max-width: 767px) {
		.question-header {
			flex-wrap: wrap;
			padding: 16px;
		}
		.question-body {
			gap: 24px;
			padding: 16px;
		}
		.question-details {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
