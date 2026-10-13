<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { answerStyle } from '$lib/answer-presentation';
	import { kahoot_icons } from '$lib/play/kahoot_mode_assets/kahoot_icons';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		/** Position of the answer. Renders the A/B/C/D letter and its matching shape. */
		index?: number;
		label?: string;
		/** Saved quiz color. Missing colors use the current theme. */
		color?: string | null;
		size?: 'player' | 'host' | 'compact';
		/** Kahoot mode on the player: only the shape and the letter are shown. */
		shapeOnly?: boolean;
		selected?: boolean;
		status?: 'correct' | 'incorrect';
		dimmed?: boolean;
		disabled?: boolean;
		onclick?: () => void;
		children?: Snippet;
		[key: string]: any;
	}

	let {
		index,
		label = '',
		color,
		size = 'player',
		shapeOnly = false,
		selected = false,
		status,
		dimmed = false,
		disabled = false,
		onclick,
		children,
		...rest
	}: Props = $props();

	let letter = $derived(index === undefined ? '' : String.fromCharCode(65 + index));
	let shape = $derived(index === undefined ? undefined : kahoot_icons[index]);
</script>

{#snippet content()}
	{#if index !== undefined}
		<span class="marker" aria-hidden="true">
			<span class="letter">{letter}</span>
			{#if shape}
				<span class="shape" style:--shape={`url("${shape}")`}></span>
			{/if}
		</span>
	{/if}
	{#if shapeOnly}
		<span class="sr-only">{letter}</span>
	{:else}
		<span class="text">{label}</span>
	{/if}
	{#if status === 'correct'}
		<span class="chip chip-correct">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
			{$t('words.correct')}
		</span>
	{:else if status === 'incorrect'}
		<span class="chip chip-incorrect">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
			{$t('telekom.incorrect', { defaultValue: 'Incorrect' })}
		</span>
	{/if}
	{#if selected}
		<span class="selected-mark">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
			<span class="sr-only">{$t('words.selected')}</span>
		</span>
	{/if}
	{@render children?.()}
{/snippet}

{#if onclick}
	<button
		type="button"
		class="tq-answer tile tile-{size}"
		class:shape-only={shapeOnly}
		class:selected
		class:dimmed
		class:correct={status === 'correct'}
		class:incorrect={status === 'incorrect'}
		style={answerStyle(color)}
		aria-pressed={selected}
		{disabled}
		{onclick}
		{...rest}
	>
		{@render content()}
	</button>
{:else}
	<div
		class="tq-answer tile tile-{size}"
		class:selected
		class:dimmed
		class:correct={status === 'correct'}
		class:incorrect={status === 'incorrect'}
		style={answerStyle(color)}
		{...rest}
	>
		{@render content()}
	</div>
{/if}

<style>
	.tile {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 16px;
		width: 100%;
		min-width: 0;
		min-height: 88px;
		padding: 16px 20px;
		font-size: 18px;
		font-weight: 500;
		line-height: 1.3;
		text-align: start;
		overflow-wrap: break-word;
	}

	button.tile:not(:disabled):hover {
		box-shadow: 0 0 0 2px var(--tq-border-strong);
	}

	button.tile:disabled {
		opacity: 0.6;
	}

	button.tile:disabled.selected {
		opacity: 1;
	}

	.tile:focus-visible {
		outline: 3px solid var(--tq-accent);
		outline-offset: 3px;
	}

	.tile.selected {
		border-color: var(--tq-accent);
		outline: 3px solid var(--tq-accent);
		outline-offset: -3px;
	}

	.tile.dimmed {
		opacity: 0.65;
	}

	.tile.correct {
		border-color: var(--tq-success);
		box-shadow: inset 8px 0 0 var(--tq-success);
		padding-inline-start: 28px;
	}

	:global([dir='rtl']) .tile.correct {
		box-shadow: inset -8px 0 0 var(--tq-success);
	}

	.tile.incorrect {
		border-color: var(--tq-danger);
	}

	.text {
		flex: 1 1 8ch;
		min-width: 0;
	}

	.marker {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}

	.letter {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: 2px solid currentColor;
		border-radius: 8px;
		font-size: 18px;
		font-weight: 700;
		line-height: 1;
	}

	.shape {
		display: inline-block;
		width: 28px;
		height: 28px;
		background-color: currentColor;
		-webkit-mask: var(--shape) center / contain no-repeat;
		mask: var(--shape) center / contain no-repeat;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
		padding: 4px 10px;
		border: 1px solid currentColor;
		border-radius: 999px;
		font-size: 14px;
		font-weight: 700;
		line-height: 1.2;
	}

	.chip svg,
	.selected-mark svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.chip-correct {
		background: var(--tq-success-soft);
		color: var(--tq-success);
	}

	.chip-incorrect {
		background: var(--tq-danger-soft);
		color: var(--tq-danger);
	}

	.selected-mark {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--tq-accent);
		color: #fff;
	}

	.tile-host {
		min-height: 128px;
		gap: 24px;
		padding: 20px 28px;
		font-size: clamp(22px, 2.4vw, 36px);
		font-weight: 500;
	}

	.tile-host .letter {
		width: 52px;
		height: 52px;
		border-radius: 10px;
		font-size: 28px;
	}

	.tile-host .shape {
		width: 44px;
		height: 44px;
	}

	.tile-compact {
		min-height: 56px;
		padding: 10px 16px;
		gap: 12px;
		font-size: 16px;
	}

	.tile-compact .letter {
		width: 30px;
		height: 30px;
		font-size: 15px;
	}

	.tile-compact .shape {
		width: 22px;
		height: 22px;
	}

	/* Kahoot mode on the player: the answer text lives on the host screen. */
	.shape-only {
		flex-direction: column;
		flex-wrap: nowrap;
		justify-content: center;
		gap: 8px;
		min-height: 120px;
	}

	.shape-only .marker {
		flex-direction: column;
		gap: 12px;
	}

	/* The shape is the only answer cue in kahoot mode, so it scales with the screen. */
	.shape-only .shape {
		width: clamp(64px, 18vmin, 128px);
		height: clamp(64px, 18vmin, 128px);
	}

	.shape-only .selected-mark {
		position: absolute;
		inset-block-start: 10px;
		inset-inline-end: 10px;
	}

	@media (max-width: 600px) {
		.tile-host {
			min-height: 88px;
			font-size: 20px;
			padding: 14px 16px;
			gap: 14px;
		}

		.tile-host .letter {
			width: 40px;
			height: 40px;
			font-size: 20px;
		}

		.tile-host .shape {
			width: 32px;
			height: 32px;
		}

		.tile.correct {
			padding-inline-start: 22px;
		}
	}
</style>
