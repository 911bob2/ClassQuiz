<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();
	let { backup_code = $bindable() } = $props();

	let already_downloaded = false;

	const download_code = (force = false) => {
		if (already_downloaded && !force) {
			return;
		}
		const el = document.createElement('a');
		el.setAttribute('href', `data:text/plain;charset=utf-8,${backup_code}`);
		el.setAttribute('download', 'Telekom-Quiz-Backup-Code.txt');
		el.style.display = 'none';
		document.body.appendChild(el);
		el.click();
		document.body.removeChild(el);
		already_downloaded = true;
	};

	function openDialog(node: HTMLDialogElement) {
		node.showModal();
	}
</script>

<dialog
	class="tq-dialog dialog"
	use:openDialog
	onclose={() => (backup_code = undefined)}
	aria-labelledby="backup-code-title"
	data-ui="backup-dialog"
>
	<header class="dialog-header">
		<h2 class="tq-section-title" id="backup-code-title">
			{$t('security_settings.backup_codes.your_backup_code')}
		</h2>
		<button
			type="button"
			class="tq-button tq-button-ghost"
			onclick={() => (backup_code = undefined)}
		>
			{$t('words.close')}
		</button>
	</header>
	<code class="code">{backup_code}</code>
	<p class="tq-muted">{$t('security_settings.backup_codes.save_somewhere_save')}</p>
	<div>
		<button
			type="button"
			class="tq-button tq-button-primary"
			onclick={() => download_code(true)}
		>
			{$t('security_settings.backup_codes.download_code')}
		</button>
	</div>
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
	.code {
		padding: 12px 16px;
		border: 1px solid var(--tq-border);
		border-radius: 8px;
		background: var(--tq-surface-subtle);
		overflow-wrap: anywhere;
		user-select: all;
	}
</style>
