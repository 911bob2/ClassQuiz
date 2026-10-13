<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		right: boolean;
	}

	let { right }: Props = $props();
</script>

<span class="verdict" class:verdict-right={right} class:verdict-wrong={!right}>
	<svg viewBox="0 0 24 24" aria-hidden="true">
		{#if right}
			<path d="M5 12.5l4.5 4.5L19 7.5" />
		{:else}
			<path d="M6 6l12 12M18 6L6 18" />
		{/if}
	</svg>
	{right ? $t('words.correct') : $t('telekom.incorrect', { defaultValue: 'Incorrect' })}
</span>

<style>
	.verdict {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		white-space: nowrap;
	}

	.verdict svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.verdict-right {
		color: var(--tq-success);
	}

	.verdict-wrong {
		color: var(--tq-danger);
	}
</style>
