<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { fade } from 'svelte/transition';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	let { title = $bindable(), time = $bindable() } = $props();
	let time_local = $state(120);
	/*eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }]*/
	$effect(() => {
		time = String(time_local);
	});
	if (time) {
		time_local = parseInt(time);
	}
</script>

<div class="slide-settings" data-ui="slide-settings" transition:fade|global={{ duration: 100 }}>
	<label class="field-block">
		<span class="tq-label">{$t('words.title')}</span>
		<input type="text" class="tq-field" bind:value={title} />
	</label>
	<label class="field-block">
		<span class="tq-label">{$t('editor.time_in_seconds')}</span>
		<input type="number" min="1" max="999" class="tq-field" bind:value={time} />
	</label>
</div>

<style>
	.slide-settings {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 200px;
		gap: 16px;
		margin-top: 16px;
		padding: 16px;
		border: 1px solid var(--tq-border);
		border-radius: 8px;
		background: var(--tq-surface-subtle);
	}
	.field-block {
		min-width: 0;
	}

	@media (max-width: 559px) {
		.slide-settings {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
