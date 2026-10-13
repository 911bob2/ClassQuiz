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
	<input
		bind:value={data}
		type="text"
		class="headline headline-input"
		aria-label={$t('editor.slide.headline')}
	/>
{:else}
	<h2 class="headline">
		{data}
	</h2>
{/if}

<style>
	.headline {
		width: 100%;
		height: 100%;
		min-height: fit-content;
		font-size: 30px;
		text-align: center;
	}
</style>
