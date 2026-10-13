<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Memory, MemoryCard } from '$lib/quiztivity/types';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();
	interface Props {
		data: Memory | undefined;
	}

	let { data }: Props = $props();

	const shuffle = <Type,>(a: Array<Type>): Array<Type> => {
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	};

	let card_opened = $state({});

	const get_all_cards_as_single_array = (): MemoryCard[] => {
		console.log('data', data.cards);
		let final_arr: MemoryCard[] = [];
		for (let i = 0; i < data.cards.length; i++) {
			const pair = data.cards[i];
			console.log('pair', pair);
			for (let c = 0; c < pair.length; c++) {
				final_arr.push({ ...pair[c], id: `${i}:${c}` });
				card_opened[`${i}:${c}`] = false;
			}
		}
		console.log(final_arr);
		return final_arr;
	};

	const all_cards_array: MemoryCard[] = get_all_cards_as_single_array();

	const random_card_order = shuffle(all_cards_array);
	console.log(random_card_order);

	const found_cards: string[] = [];
	let opened_active_cards: string[] = [];
	let try_count = $state(0);
	let game_finished = false;
	const flip_card = (id: string) => {
		if (found_cards.includes(id) || game_finished) {
			return;
		}
		card_opened[id] = true;
		opened_active_cards.push(id);

		if (opened_active_cards.length === 2) {
			const [pair_1_id, card_1_id] = opened_active_cards[0].split(':');
			if (!pair_1_id || !card_1_id) {
				throw "Mustn't happen";
			}
			const [pair_2_id, card_2_id] = opened_active_cards[1].split(':');
			if (!pair_2_id || !card_2_id) {
				throw "Mustn't happen";
			}
			if (pair_2_id === pair_1_id) {
				found_cards.push(opened_active_cards[0]);
				found_cards.push(opened_active_cards[1]);
				opened_active_cards = [];
			}
		}
		if (opened_active_cards.length === 3) {
			card_opened[opened_active_cards[0]] = false;
			card_opened[opened_active_cards[1]] = false;
			opened_active_cards.splice(0, 2);
			try_count += 1;
		}
		game_finished = random_card_order.length === found_cards.length;
	};
</script>

<section class="tq-panel tq-panel-body tq-stack" data-ui="activity-memory">
	<p class="memory-tries tq-badge tq-badge-brand">
		{$t('quiztivity.play.memory.try_count', { try_count })}
	</p>
	<div class="memory-grid">
		{#each random_card_order as card}
			<button
				type="button"
				class="tq-answer memory-card"
				class:memory-card-open={card_opened[card.id]}
				aria-pressed={card_opened[card.id]}
				aria-label={card_opened[card.id]
					? card.text
					: $t('telekom.reveal_card', { defaultValue: 'Reveal card' })}
				onclick={() => {
					flip_card(card.id);
				}}
			>
				{#if card_opened[card.id]}
					<span class="memory-text">{card.text}</span>
				{:else}
					<img src="/telekom/t-logo.svg" alt="" class="memory-back" />
				{/if}
			</button>
		{/each}
	</div>
</section>

<style>
	.memory-tries {
		align-self: flex-start;
		margin: 0;
		font-size: 14px;
		font-variant-numeric: tabular-nums;
	}

	.memory-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
		gap: 12px;
	}

	.memory-card {
		display: flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 1;
		min-height: 0;
		padding: 8px;
		background: var(--tq-brand);
		border-color: var(--tq-brand);
		overflow-wrap: anywhere;
		text-align: center;
	}

	.memory-card[aria-pressed='true'] {
		outline: none;
	}

	.memory-card-open {
		background: var(--tq-surface);
		border-color: var(--tq-border-strong);
		font-weight: 700;
	}

	.memory-back {
		width: 32px;
		height: auto;
	}
</style>
