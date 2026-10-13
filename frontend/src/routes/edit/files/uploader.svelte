<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import Spinner from '$lib/Spinner.svelte';
	import type { EditorData } from '$lib/quiz_types';

	let uppyOpen = $state(false);
	let selected_question = $state(undefined);
	// The uploader stores the new file in `cover_image`, which reloads the file list.
	let data = $state({ cover_image: undefined } as EditorData);

	$effect(() => {
		if (data.cover_image) {
			window.location.reload();
		}
	});
</script>

{#await import('$lib/editor/uploader.svelte')}
	<Spinner my_20={false} />
{:then c}
	<c.default
		bind:modalOpen={uppyOpen}
		{data}
		{selected_question}
		video_upload={true}
		library_enabled={false}
	/>
{/await}
