<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		data: string;
		editor?: boolean;
	}

	let { data = $bindable(), editor = true }: Props = $props();

	if (!data) {
		data = '#e20074';
	}
</script>

<!-- The fill is user-authored slide content, so it is applied as saved. -->
<div class="shape" style="background-color: {data}">
	{#if editor}
		<input
			type="color"
			bind:value={data}
			aria-label={$t('telekom.color', { defaultValue: 'Color' })}
		/>
	{/if}
</div>

<style>
	.shape {
		display: flex;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding: 8px;
	}
	input {
		margin: auto;
		cursor: pointer;
	}
</style>
