<!-- SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
SPDX-License-Identifier: MPL-2.0 -->
<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	interface Props {
		title: string;
		body: string;
		open: boolean;
	}
	let { title, body, open = $bindable() }: Props = $props();
	let dialog: HTMLDialogElement;
	const { t } = getLocalization();
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	class="tq-dialog"
	aria-label={title}
	onclose={() => (open = false)}
	oncancel={() => (open = false)}
>
	<h2 class="tq-section-title">{title}</h2>
	{#if body}<p class="mt-4 tq-muted">{body}</p>{/if}
	<div class="flex justify-end mt-6">
		<button type="button" class="tq-button tq-button-primary" onclick={() => (open = false)}
			>{$t('ui.close')}</button
		>
	</div>
</dialog>
