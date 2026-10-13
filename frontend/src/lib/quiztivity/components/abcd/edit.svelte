<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Abcd } from '$lib/quiztivity/types';
	import { getLocalization } from '$lib/i18n';
	import CorrectToggle from '$lib/editor/CorrectToggle.svelte';
	import Icon from '$lib/editor/Icon.svelte';

	interface Props {
		data: Abcd | undefined;
	}

	let { data = $bindable() }: Props = $props();

	if (!data) {
		data = {
			question: '',
			answers: []
		};
	}

	const { t } = getLocalization();
</script>

<div class="abcd-editor" data-ui="activity-abcd-editor">
	<label class="field-block">
		<span class="tq-label">{$t('words.question')}</span>
		<input
			class="tq-field question-field"
			placeholder={$t('words.question')}
			bind:value={data.question}
		/>
	</label>
	<div class="answer-grid">
		{#each data.answers as answer, index}
			{@const letter = String.fromCharCode(65 + index)}
			<div class="answer-card">
				<span class="answer-badge" aria-hidden="true">{letter}</span>
				<input
					bind:value={answer.answer}
					class="tq-field"
					aria-label={$t('telekom.answer_number', {
						defaultValue: 'Answer {{number}}',
						number: letter
					})}
					placeholder={$t('editor.enter_answer')}
				/>
				<CorrectToggle bind:checked={answer.correct} />
			</div>
		{/each}
		{#if data.answers.length < 4}
			<button
				type="button"
				class="tq-button add-answer"
				onclick={() => {
					data.answers = [...data.answers, { ...{ answer: '', correct: false } }];
				}}
			>
				<Icon name="plus" />
				{$t('editor_page.add_an_answer')}
			</button>
		{/if}
	</div>
</div>

<style>
	.abcd-editor {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.question-field {
		font-size: 18px;
	}
	.answer-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		align-items: start;
	}
	.answer-card {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px;
		padding: 12px;
		border: 1px solid var(--tq-border);
		border-radius: 12px;
		background: var(--tq-surface-subtle);
	}
	.answer-card .tq-field {
		flex: 1;
		min-width: 120px;
		width: auto;
	}
	.answer-badge {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: var(--tq-brand-soft);
		color: var(--tq-accent);
		font-weight: 700;
	}
	.add-answer {
		min-height: 64px;
		border-style: dashed;
		border-radius: 12px;
		color: var(--tq-muted);
	}
	.add-answer:hover {
		border-color: var(--tq-accent);
		color: var(--tq-accent);
		background: var(--tq-brand-soft);
	}

	@media (max-width: 767px) {
		.answer-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
