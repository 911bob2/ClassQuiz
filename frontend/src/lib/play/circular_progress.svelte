<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		/** Elapsed share of the question time, 0 (just started) to 1 (time is up). */
		progress: number;
		text: string;
		color?: string;
		/** Diameter in px. */
		size?: number;
	}

	let { progress, text, color = 'var(--tq-accent)', size = 64 }: Props = $props();

	// The colored arc shows the time that is left.
	let remaining = $derived(Math.min(360, Math.max(0, 360 * (1 - progress)) || 0));
</script>

<div
	class="timer"
	role="timer"
	aria-label={`${$t('admin_page.time_left')}: ${text}`}
	style="--timer-size: {size}px; --timer-fill: {color}; --timer-angle: {remaining}deg"
>
	<span class="timer-value" aria-hidden="true">{text}</span>
</div>

<style>
	.timer {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: var(--timer-size);
		height: var(--timer-size);
		border-radius: 50%;
		background: conic-gradient(
			var(--timer-fill) 0deg var(--timer-angle),
			var(--tq-border) var(--timer-angle) 360deg
		);
		color: var(--tq-text);
		font-size: calc(var(--timer-size) * 0.34);
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		line-height: 1;
		transition: background 500ms linear;
	}

	.timer::before {
		content: '';
		position: absolute;
		inset: calc(var(--timer-size) * 0.12);
		border-radius: 50%;
		background: var(--tq-surface);
	}

	.timer-value {
		position: relative;
	}
</style>
