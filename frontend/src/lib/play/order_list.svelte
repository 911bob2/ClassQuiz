<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { flip } from 'svelte/animate';
	import { answerStyle } from '$lib/answer-presentation';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		/** OrderQuizAnswer[]; items need an `id` and the list is reordered in place. */
		answers: any;
		disabled?: boolean;
	}

	let { answers = $bindable(), disabled = false }: Props = $props();

	const swapArrayElements = (arr, a: number, b: number) => {
		let _arr = [...arr];
		let temp = _arr[a];
		_arr[a] = _arr[b];
		_arr[b] = temp;
		return _arr;
	};
</script>

<ol class="order-list">
	{#each answers as answer, i (answer.id)}
		<li
			class="tq-answer order-item"
			animate:flip={{ duration: 100 }}
			style={answerStyle(answer.color)}
		>
			<span class="order-position" aria-hidden="true">{i + 1}</span>
			<span class="order-answer">{answer.answer}</span>
			<span class="order-buttons">
				<button
					onclick={() => {
						answers = swapArrayElements(answers, i, i - 1);
					}}
					class="tq-icon-button"
					type="button"
					aria-label={$t('telekom.move_up', { defaultValue: 'Move up' })}
					disabled={i === 0 || disabled}
				>
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M6 15l6-6 6 6"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
				<button
					onclick={() => {
						answers = swapArrayElements(answers, i, i + 1);
					}}
					class="tq-icon-button"
					type="button"
					aria-label={$t('telekom.move_down', { defaultValue: 'Move down' })}
					disabled={i === answers.length - 1 || disabled}
				>
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M6 9l6 6 6-6"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
			</span>
		</li>
	{/each}
</ol>

<style>
	.order-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.order-item {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 72px;
		padding-block: 8px;
		padding-inline: 16px 12px;
	}

	.order-position {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		border: 2px solid currentColor;
		border-radius: 8px;
		font-weight: 700;
	}

	.order-answer {
		flex: 1;
		min-width: 0;
		font-size: 20px;
		overflow-wrap: anywhere;
	}

	.order-buttons {
		display: flex;
		gap: 8px;
	}
</style>
