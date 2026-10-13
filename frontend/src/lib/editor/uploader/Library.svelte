<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { PrivateImageData } from '$lib/quiz_types';
	import Spinner from '$lib/Spinner.svelte';
	import type { EditorData } from '$lib/quiz_types';

	import { getLocalization } from '$lib/i18n';

	interface Props {
		data: EditorData;
		selected_question?: number;
		modalOpen: boolean;
	}

	let { data = $bindable(), selected_question, modalOpen = $bindable() }: Props = $props();

	const { t } = getLocalization();

	const fetch_images = async (): Promise<PrivateImageData[]> => {
		const response = await fetch('/api/v1/storage/list/last?count=50');
		return await response.json();
	};
	let image_fetch = fetch_images();

	const set_image = (id: string) => {
		if (selected_question === undefined) {
			data.cover_image = id;
		} else if (selected_question === -1) {
			data.background_image = id;
		} else {
			data.questions[selected_question].image = id;
		}
		modalOpen = false;
	};
</script>

{#await image_fetch}
	<Spinner />
{:then images}
	<div class="library-grid" data-ui="media-library">
		{#each images as image}
			<button
				type="button"
				class="library-item"
				data-ui="media-library-select"
				onclick={() => set_image(image.id)}
			>
				<img
					src="/api/v1/storage/download/{image.id}"
					alt={image.alt_text ?? ''}
					loading="lazy"
				/>
				<span class="library-name">
					{image.filename ?? $t('file_dashboard.not_available')}
				</span>
				<span class="tq-link">{$t('words.select')}</span>
			</button>
		{:else}
			<p class="tq-empty library-empty">
				{$t('telekom.no_files', { defaultValue: 'No files' })}
			</p>
		{/each}
	</div>
{:catch}
	<p class="tq-alert tq-alert-error">
		{$t('telekom.files_load_error', { defaultValue: 'Could not load files' })}
	</p>
{/await}

<style>
	.library-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
	}
	.library-item {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
		padding: 12px;
		border: 1px solid var(--tq-border);
		border-radius: 8px;
		background: var(--tq-surface);
		text-align: start;
	}
	.library-item:hover {
		border-color: var(--tq-accent);
	}
	.library-item img {
		width: 100%;
		height: 140px;
		object-fit: contain;
		border-radius: 4px;
		background: var(--tq-surface-subtle);
	}
	.library-name {
		overflow-wrap: anywhere;
		font-size: 14px;
	}
	.library-empty {
		grid-column: 1 / -1;
	}

	@media (max-width: 600px) {
		.library-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 400px) {
		.library-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
