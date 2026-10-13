<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->
<script lang="ts">
	import { SaveStatus } from './commons';
	import Spinner from '$lib/Spinner.svelte';
	import { getLocalization } from '$lib/i18n';

	interface Props {
		status: SaveStatus;
	}

	let { status }: Props = $props();
	const { t } = getLocalization();
</script>

<div class="indicator" role="status" aria-live="polite">
	{#if status === SaveStatus.Saved}
		<svg
			class="icon saved"
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			viewBox="0 0 24 24"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
		<span class="saved">{$t('telekom.saved', { defaultValue: 'Saved' })}</span>
	{:else if status === SaveStatus.Saving}
		<span class="spinner"><Spinner my_20={false} /></span>
		<span class="tq-muted">{$t('telekom.saving', { defaultValue: 'Saving…' })}</span>
	{:else if status === SaveStatus.Error}
		<span class="error">{$t('telekom.save_failed', { defaultValue: 'Saving failed' })}</span>
	{/if}
</div>

<style>
	.indicator {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 24px;
		font-size: 14px;
	}
	.icon {
		width: 20px;
		height: 20px;
	}
	.spinner {
		display: inline-flex;
		width: 20px;
		height: 20px;
	}
	.spinner :global(svg) {
		width: 20px;
		height: 20px;
	}
	.saved {
		color: var(--tq-success);
	}
	.error {
		color: var(--tq-danger);
	}
</style>
