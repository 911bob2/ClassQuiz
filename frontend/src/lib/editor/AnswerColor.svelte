<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		/** Explicit answer colour. Unset means the theme colours are used. */
		color?: string | null;
		label?: string;
	}

	let { color = $bindable(), label }: Props = $props();

	const reset = () => {
		color = undefined;
	};
</script>

<div class="answer-color" data-ui="answer-color">
	<label class="swatch" class:unset={!color} style:background-color={color || undefined}>
		<input
			type="color"
			value={color || '#ffffff'}
			aria-label={label ?? $t('telekom.color', { defaultValue: 'Color' })}
			oninput={(e) => (color = e.currentTarget.value)}
			oncontextmenu={(e) => {
				e.preventDefault();
				reset();
			}}
		/>
	</label>
	<span class="color-state">
		{#if color}
			<bdi>{color.toUpperCase()}</bdi>
		{:else}
			{$t('telekom.theme_color', { defaultValue: 'Theme color' })}
		{/if}
	</span>
	<button
		type="button"
		class="tq-button reset"
		data-ui="answer-color-reset"
		disabled={!color}
		onclick={reset}
	>
		{$t('ui.reset_color')}
	</button>
</div>

<style>
	.answer-color {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
	}
	.swatch {
		position: relative;
		display: block;
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		overflow: hidden;
		border: 1px solid var(--tq-border-strong);
		border-radius: 8px;
		background: var(--tq-surface);
	}
	.swatch.unset::after {
		content: '';
		position: absolute;
		inset-block-start: 50%;
		inset-inline: -4px;
		border-block-start: 2px solid var(--tq-muted);
		transform: rotate(-45deg);
		pointer-events: none;
	}
	.swatch input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
		border: 0;
		opacity: 0;
		cursor: pointer;
	}
	.swatch:has(input:focus-visible) {
		outline: 3px solid var(--tq-accent);
		outline-offset: 3px;
	}
	.color-state {
		color: var(--tq-muted);
		font-size: 14px;
	}
	.reset {
		padding-inline: 12px;
		font-size: 14px;
		white-space: nowrap;
	}
</style>
