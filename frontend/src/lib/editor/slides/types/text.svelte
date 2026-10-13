<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		data: any;
		editor?: boolean;
	}

	let { data = $bindable(), editor = true }: Props = $props();
</script>

{#if editor}
	<textarea bind:value={data} class="text-input" aria-label={$t('words.text')}></textarea>
{:else}
	<p>{data}</p>
{/if}

<style>
	.text-input {
		width: 100%;
		height: 100%;
		resize: none;
	}
</style>
