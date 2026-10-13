<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { PageData } from './$types';
	// import FileDahboard from "$lib/files/dashboard.svelte"

	interface Props {
		// import { thumbHashToDataURL } from 'thumbhash';
		data: PageData;
	}

	let { data }: Props = $props();
	const files = data.files;
</script>

<main class="tq-page" data-ui="legacy-files">
	<div class="grid grid-cols-2 w-full gap-4">
		{#each files as file}
			<div class="w-full flex" data-file-id={file.id}></div>
		{/each}
	</div>
</main>
