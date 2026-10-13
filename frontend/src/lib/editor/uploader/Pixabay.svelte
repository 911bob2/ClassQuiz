<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { EditorData } from '$lib/quiz_types';
	import Spinner from '$lib/Spinner.svelte';

	import { getLocalization } from '$lib/i18n';

	interface Props {
		data: EditorData;
		selected_question?: number;
		modalOpen: boolean;
	}

	let { data = $bindable(), selected_question, modalOpen = $bindable() }: Props = $props();

	let page = $state(1);
	let search_term = $state('');
	let loading = $state(false);

	const { t } = getLocalization();

	const set_image = async (id: string) => {
		loading = true;
		const res = await fetch(`/api/v1/pixabay/save?id=${id}`, {
			method: 'POST'
		});
		const json = await res.json();
		const storage_id = json.id;
		if (selected_question === undefined) {
			data.cover_image = storage_id;
		} else if (selected_question === -1) {
			data.background_image = storage_id;
		} else {
			data.questions[selected_question].image = storage_id;
		}
		modalOpen = false;
	};

	const fetch_data = async () => {
		const res = await fetch(`/api/v1/pixabay/images?page=${page}&query=${search_term}`);
		return await res.json();
	};

	let fetched_data = $state(fetch_data());

	const search = () => {
		page = 1;
		fetched_data = fetch_data();
	};
</script>

<div data-ui="pixabay-picker">
	<div class="pixabay-heading">
		<h3 class="tq-section-title">{$t('uploader.images_by_pixabay')}</h3>
		<a href="https://pixabay.com" target="_blank" rel="noreferrer" class="tq-link">
			{$t('uploader.visit_pixabay')}
		</a>
	</div>
	<div class="pixabay-search">
		<input
			class="tq-field"
			type="search"
			aria-label={$t('words.search')}
			bind:value={search_term}
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					search();
				}
			}}
		/>
		<button type="button" class="tq-button" onclick={search}>{$t('words.search')}</button>
	</div>
	<p class="tq-muted pixabay-note">{$t('uploader.search_english_only')}</p>
	{#await fetched_data}
		<Spinner />
	{:then results}
		{#if loading}
			<Spinner />
		{:else}
			<div class="pixabay-grid">
				{#each results.hits as image}
					<button
						type="button"
						class="pixabay-item"
						data-ui="pixabay-select"
						onclick={() => set_image(image.id)}
					>
						<img src={image.webformatURL} alt={image.tags ?? ''} loading="lazy" />
						<span class="tq-link">{$t('words.select')}</span>
					</button>
				{/each}
			</div>
			<div class="tq-toolbar pixabay-pages">
				<button
					type="button"
					class="tq-button"
					disabled={page < 2}
					onclick={() => {
						page -= 1;
						fetched_data = fetch_data();
					}}
				>
					{$t('uploader.previous_page')}
				</button>
				<button
					type="button"
					class="tq-button"
					onclick={() => {
						page += 1;
						fetched_data = fetch_data();
					}}
				>
					{$t('uploader.next_page')}
				</button>
			</div>
		{/if}
	{:catch}
		<p class="tq-alert tq-alert-error pixabay-error">
			{$t('telekom.files_load_error', { defaultValue: 'Could not load files' })}
		</p>
	{/await}
</div>

<style>
	.pixabay-heading {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px 16px;
		margin-bottom: 16px;
	}
	.pixabay-search {
		display: flex;
		gap: 8px;
	}
	.pixabay-search input {
		flex: 1;
		min-width: 0;
	}
	.pixabay-note {
		margin: 8px 0 0;
		font-size: 14px;
	}
	.pixabay-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
		margin-top: 20px;
	}
	.pixabay-item {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
		padding: 12px;
		border: 1px solid var(--tq-border);
		border-radius: 8px;
		background: var(--tq-surface);
	}
	.pixabay-item:hover {
		border-color: var(--tq-accent);
	}
	.pixabay-item img {
		width: 100%;
		height: 140px;
		object-fit: contain;
	}
	.pixabay-pages {
		margin-top: 16px;
	}
	.pixabay-error {
		margin-top: 16px;
	}

	@media (max-width: 600px) {
		.pixabay-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
