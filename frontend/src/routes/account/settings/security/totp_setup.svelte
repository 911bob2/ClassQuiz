<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import QRCode from 'qrcode';
	import Spinner from '$lib/Spinner.svelte';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		totp_data: { url: string; secret: string } | undefined;
	}

	let { totp_data = $bindable() }: Props = $props();

	const get_image_url = async () => {
		return await QRCode.toDataURL(totp_data.url);
	};

	function openDialog(node: HTMLDialogElement) {
		node.showModal();
	}
</script>

<dialog
	class="tq-dialog dialog"
	use:openDialog
	onclose={() => (totp_data = undefined)}
	aria-labelledby="totp-title"
	data-ui="totp-dialog"
>
	<header class="dialog-header">
		<h2 id="totp-title" class="tq-section-title">
			{$t('security_settings.totp_setup.totp_setup')}
		</h2>
		<button
			type="button"
			class="tq-button tq-button-ghost"
			onclick={() => (totp_data = undefined)}
		>
			{$t('words.close')}
		</button>
	</header>
	<p>{$t('security_settings.totp_setup.scan_to_set_up')}</p>
	{#await get_image_url()}
		<Spinner my_20={false} />
	{:then data}
		<img
			src={data}
			alt={$t('security_settings.totp_setup.scan_to_set_up')}
			class="qr"
			width="224"
			height="224"
		/>
	{/await}
	<p class="tq-muted text-sm">
		{$t('security_settings.totp_setup.enter_as_secret_if_no_see_code')}
	</p>
	<code class="secret">{totp_data.secret}</code>
	<p class="tq-alert">{$t('security_settings.totp_setup.do_not_forget_backup_code')}</p>
</dialog>

<style>
	.dialog[open] {
		display: grid;
		gap: 16px;
	}
	.dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.qr {
		justify-self: center;
		width: 224px;
		height: 224px;
	}
	.secret {
		padding: 12px 16px;
		border: 1px solid var(--tq-border);
		border-radius: 8px;
		background: var(--tq-surface-subtle);
		overflow-wrap: anywhere;
		user-select: all;
	}
</style>
