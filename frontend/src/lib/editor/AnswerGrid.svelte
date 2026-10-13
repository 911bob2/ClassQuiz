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
		/** Number of answers that already exist. */
		count: number;
		/** The "add answer" button disappears once this many answers exist. */
		max?: number;
		/** Show answers in a single column, for example when their order matters. */
		single?: boolean;
		onadd: () => void;
		data_ui?: string;
		children: Snippet;
	}

	let { count, max = 4, single = false, onadd, data_ui, children }: Props = $props();
</script>

<div class="answer-grid" class:single data-ui={data_ui}>
	{@render children()}
	{#if count < max}
		<button type="button" class="tq-button add-answer" data-ui="answer-add" onclick={onadd}>
			<Icon name="plus" />
			{$t('editor_page.add_an_answer')}
		</button>
	{/if}
</div>

<style>
	.answer-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		align-items: start;
	}
	.answer-grid.single {
		grid-template-columns: minmax(0, 1fr);
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
