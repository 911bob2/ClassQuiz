<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { QuizTivityTypes } from './types';
	import { getLocalization } from '$lib/i18n';
	import { fade } from 'svelte/transition';
	import Icon from '$lib/editor/Icon.svelte';
	import { modal } from '$lib/editor/modal';
	import { page_type_description, page_type_name } from './page-types';

	const { t } = getLocalization();
	interface Props {
		type: QuizTivityTypes | undefined;
	}

	let { type = $bindable() }: Props = $props();

	const PageTypes = [
		/*		{
			name: 'Pdf',
			description: 'Upload a PDF!',
			type: QuizTivityTypes.PDF,
			svg: undefined
		},*/
		{
			type: QuizTivityTypes.MEMORY
		},
		{
			type: QuizTivityTypes.MARKDOWN
		},
		{
			type: QuizTivityTypes.ABCD
		}
	];

	// Closing without a choice keeps the editor as it was.
	const close = () => {
		type = undefined;
	};
</script>

<div
	class="tq-overlay"
	role="presentation"
	use:modal={{ onclose: close }}
	onclick={(e) => {
		if (e.target === e.currentTarget) {
			close();
		}
	}}
	transition:fade|global={{ duration: 100 }}
>
	<div
		class="tq-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="page-type-title"
		data-ui="page-type-dialog"
	>
		<div class="dialog-heading">
			<h2 id="page-type-title" class="tq-section-title">
				{$t('quiztivity.editor.select_page_type')}
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
			{#each PageTypes as pt, i}
				<button
					type="button"
					class="type-option"
					data-ui={'page-type-' + pt.type.toLowerCase()}
					data-autofocus={i === 0 ? '' : undefined}
					onclick={() => {
						type = pt.type;
					}}
				>
					<span class="type-name">{page_type_name($t, pt.type)}</span>
					<span class="type-description">{page_type_description($t, pt.type)}</span>
				</button>
			{/each}
		</div>
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
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}
	.type-option {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		min-height: 96px;
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

	@media (max-width: 640px) {
		.type-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
