<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getLocalization } from '$lib/i18n';
	import Icon from '$lib/editor/Icon.svelte';

	const { t } = getLocalization();

	interface Props {
		/** Letter or number shown in front of the answer. */
		badge: string;
		/** Marks an incomplete answer (for example an empty text). */
		invalid?: boolean;
		onremove: () => void;
		/** The main control, normally the answer text field (give it the `answer-field` class). */
		children: Snippet;
		/** Secondary controls such as correctness and colour. */
		options?: Snippet;
	}

	let { badge, invalid = false, onremove, children, options }: Props = $props();
</script>

<div class="answer-card" class:invalid data-ui="answer-card">
	<div class="answer-main">
		<span class="answer-badge" aria-hidden="true">{badge}</span>
		<div class="answer-input">
			{@render children()}
		</div>
		<button
			type="button"
			class="tq-icon-button tq-button-ghost answer-remove"
			data-ui="answer-delete"
			aria-label={$t('editor.delete_answer')}
			onclick={onremove}
		>
			<Icon name="trash" />
		</button>
	</div>
	{#if invalid}
		<p class="answer-hint">
			<Icon name="warning" size={16} />
			{$t('telekom.answer_required', { defaultValue: 'Enter an answer' })}
		</p>
	{/if}
	{#if options}
		<div class="answer-options">
			{@render options()}
		</div>
	{/if}
</div>

<style>
	.answer-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-width: 0;
		padding: 12px;
		border: 1px solid var(--tq-border);
		border-radius: 12px;
		background: var(--tq-surface-subtle);
	}
	.answer-card.invalid {
		border-color: var(--tq-danger);
	}
	.answer-main {
		display: flex;
		align-items: center;
		gap: 12px;
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
	.answer-input {
		flex: 1;
		min-width: 0;
	}
	.answer-input :global(.answer-field) {
		width: 100%;
		min-height: 56px;
		padding: 12px 14px;
		border: 1px solid var(--tq-border-strong);
		border-radius: 8px;
		font-weight: 500;
	}
	.answer-input :global(.answer-field:focus-visible) {
		outline-offset: 2px;
	}
	.answer-remove {
		color: var(--tq-muted);
	}
	.answer-remove:hover {
		color: var(--tq-danger);
		background: var(--tq-danger-soft);
	}
	.answer-hint {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		color: var(--tq-danger);
		font-size: 14px;
		font-weight: 500;
	}
	.answer-options {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
		padding-inline-start: 48px;
	}

	@media (max-width: 479px) {
		.answer-options {
			padding-inline-start: 0;
		}
	}
</style>
