<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();
	interface Props {
		quiz_id?: string | null;
	}

	let { quiz_id = $bindable(null) }: Props = $props();

	const handle_on_click = () => {
		quiz_id = null;
	};
	onMount(() => {
		const close_on_escape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				quiz_id = null;
			}
		};
		window.addEventListener('keydown', close_on_escape);
		return () => window.removeEventListener('keydown', close_on_escape);
	});

	const focus_on_mount = (node: HTMLElement) => {
		node.focus();
	};
</script>

{#if quiz_id}
	<div
		class="tq-overlay"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) handle_on_click();
		}}
		transition:fade={{ duration: 100 }}
	>
		<div
			class="tq-dialog tq-stack stack-5"
			role="dialog"
			aria-modal="true"
			aria-labelledby="download-title"
			data-ui="download-dialog"
			tabindex="-1"
			use:focus_on_mount
		>
			<header class="tq-page-heading flush">
				<h2 class="tq-section-title" id="download-title">
					{$t('downloader.select_download_type')}
				</h2>
				<button type="button" class="tq-button tq-button-ghost" onclick={handle_on_click}>
					{$t('words.close')}
				</button>
			</header>
			<div class="grid gap-3 sm:grid-cols-2">
				<a class="tq-button" href="/api/v1/eximport/{quiz_id}"
					>{$t('downloader.own_format')}</a
				>
				<a class="tq-button" href="/api/v1/eximport/excel/{quiz_id}">
					{$t('downloader.excel_format')}
				</a>
			</div>
			<p class="tq-muted text-sm">{$t('downloader.help')}</p>
		</div>
	</div>
{/if}

<style>
	.tq-dialog:focus-visible {
		outline: none;
	}
	.stack-5 {
		gap: 20px;
	}
	.flush {
		margin-bottom: 0;
	}
</style>
