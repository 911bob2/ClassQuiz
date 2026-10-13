<!-- SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
SPDX-License-Identifier: MPL-2.0 -->
<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import { PopoverTypes } from './smalltop';
	const { t } = getLocalization();
	interface Props {
		open?: boolean;
		type: PopoverTypes;
		data?: { game_pin: number | string; game_id: string } | string;
	}
	let { open = $bindable(false), type, data }: Props = $props();
</script>

{#if open}
	<div class="tq-toast" role="status">
		<div>
			{#if type === PopoverTypes.Copy}
				{$t('components.popover.copied_to_clipboard')}
			{:else if type === PopoverTypes.GameInLobby && typeof data === 'object' && data}
				<a class="tq-link" href="/remote?game_pin={data.game_pin}&game_id={data.game_id}"
					>{$t('ui.open_remote', { defaultValue: 'Open remote controls' })}</a
				>
			{:else if type === PopoverTypes.Generic && typeof data === 'string'}
				{@html data}
			{/if}
		</div>
		<button
			type="button"
			class="tq-icon-button tq-button-ghost"
			aria-label={$t('ui.close')}
			onclick={() => (open = false)}>×</button
		>
	</div>
{/if}

<style>
	.tq-toast {
		position: fixed;
		inset-block-start: 80px;
		inset-inline-end: 16px;
		z-index: 65;
		display: flex;
		align-items: center;
		gap: 16px;
		max-width: min(420px, calc(100vw - 32px));
		padding-block: 12px;
		padding-inline: 20px 12px;
		background: var(--tq-surface);
		color: var(--tq-text);
		border: 1px solid var(--tq-border);
		border-radius: 12px;
		box-shadow: var(--tq-shadow);
	}
</style>
