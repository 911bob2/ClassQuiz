<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Memory } from '$lib/quiztivity/types';
	import { getLocalization } from '$lib/i18n';
	import { flip } from 'svelte/animate';
	import Icon from '$lib/editor/Icon.svelte';

	const { t } = getLocalization();

	interface Props {
		data: Memory | undefined;
	}

	let { data = $bindable() }: Props = $props();
	let new_pair_data = $state({
		text_1: '',
		text_2: ''
	});

	if (!data) {
		data = {
			cards: []
		};
	}
	const arraymove = (arr: any[], fromI: number, toI: number) => {
		const el = arr[fromI];
		arr.splice(fromI, 1);
		arr.splice(toI, 0, el);
	};
	const move_card_left = (selected_slide: number) => {
		arraymove(data.cards, selected_slide, selected_slide - 1);
		data.cards = data.cards;
	};

	const move_card_right = (selected_slide: number) => {
		arraymove(data.cards, selected_slide, selected_slide + 1);
		data.cards = data.cards;
	};

	const add_card = () => {
		if (!new_pair_data.text_1 || !new_pair_data.text_2) {
			return;
		}
		const id = (Math.random() + 1).toString(36).substring(7);
		data.cards = [
			...data.cards,
			[
				{ id, text: new_pair_data.text_1 },
				{ id, text: new_pair_data.text_2 }
			]
		];
		new_pair_data = {
			text_1: '',
			text_2: ''
		};
	};

	// $: console.log(new_pair_data.text_1.replaceAll("\n", "7"))
</script>

<div class="memory-editor" data-ui="activity-memory-editor">
	<section class="add-card">
		<h2 class="tq-section-title">{$t('quiztivity.memory.editor.add_card')}</h2>
		<div class="pair-fields">
			<div class="side">
				<label class="tq-field-group">
					<span class="tq-label">
						{$t('telekom.card_number', { defaultValue: 'Card {{number}}', number: 1 })}
					</span>
					<textarea class="tq-field" rows="3" bind:value={new_pair_data.text_1}
					></textarea>
				</label>
				<button type="button" class="tq-button" disabled>
					{$t('quiztivity.memory.editor.upload_image')}
				</button>
			</div>
			<div class="side">
				<label class="tq-field-group">
					<span class="tq-label">
						{$t('telekom.card_number', { defaultValue: 'Card {{number}}', number: 2 })}
					</span>
					<textarea class="tq-field" rows="3" bind:value={new_pair_data.text_2}
					></textarea>
				</label>
				<button type="button" class="tq-button" disabled>
					{$t('quiztivity.memory.editor.upload_image')}
				</button>
			</div>
		</div>
		<div>
			<button
				type="button"
				class="tq-button tq-button-primary"
				data-ui="memory-add-pair"
				onclick={add_card}
				disabled={!new_pair_data.text_1 || !new_pair_data.text_2}
			>
				<Icon name="plus" />
				{$t('quiztivity.memory.editor.add_pair')}
			</button>
		</div>
	</section>

	<div class="pair-grid">
		{#each data.cards as card_pair, i (card_pair[0].id)}
			<article class="pair-card" animate:flip={{ duration: 200 }} data-ui="memory-pair">
				<div class="pair-texts">
					{#each card_pair as card}
						<p>{card.text}</p>
					{/each}
				</div>
				<div class="pair-actions">
					<button
						type="button"
						class="tq-button"
						onclick={() => {
							move_card_left(i);
						}}
						disabled={i === 0}
					>
						<Icon name="arrow-left" />
						{$t('quiztivity.editor.move_left')}
					</button>
					<button
						type="button"
						class="tq-button"
						onclick={() => {
							move_card_right(i);
						}}
						disabled={i + 1 === data.cards.length}
					>
						{$t('quiztivity.editor.move_right')}
						<Icon name="arrow-right" />
					</button>
				</div>
			</article>
		{/each}
	</div>
</div>

<style>
	.memory-editor {
		display: flex;
		flex-direction: column;
		gap: 32px;
	}
	.add-card {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px;
		border: 1px solid var(--tq-border);
		border-radius: 12px;
		background: var(--tq-surface-subtle);
	}
	.pair-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}
	.side {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}
	.side label {
		width: 100%;
	}
	.pair-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 16px;
	}
	.pair-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		border: 1px solid var(--tq-border);
		border-radius: 12px;
		background: var(--tq-surface);
	}
	.pair-texts {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	.pair-texts p {
		margin: 0;
		padding: 12px;
		border-radius: 8px;
		background: var(--tq-surface-subtle);
		text-align: center;
		overflow-wrap: anywhere;
	}
	.pair-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.pair-actions .tq-button {
		padding-inline: 8px;
		font-size: 14px;
	}

	@media (max-width: 559px) {
		.pair-fields {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
