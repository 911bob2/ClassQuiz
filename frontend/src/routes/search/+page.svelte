<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import { navbarVisible } from '$lib/stores.svelte.ts';
	import SearchCard from '$lib/search-card.svelte';
	import Footer from '$lib/footer.svelte';
	import { onMount } from 'svelte';

	navbarVisible.visible = true;
	const { t } = getLocalization();
	let search_term = $state('');
	let resp_data = $state(null);

	const submit = async () => {
		const res = await fetch('/api/v1/search/', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				q: search_term,
				attributesToHighlight: ['*']
			})
		});
		if (res.status === 200) {
			let resp_data_temp: string = await res.text();
			resp_data_temp = resp_data_temp.replaceAll('<em>', '<mark>');
			resp_data_temp = resp_data_temp.replaceAll('</em>', '</mark>');
			resp_data = JSON.parse(resp_data_temp);
			const url = new URLSearchParams(window.location.search);
			url.set('q', search_term);
			history.pushState(null, null, '?' + url.toString());
		} else {
			console.error('Error!', res.status);
		}
	};
	onMount(() => {
		const url = new URLSearchParams(window.location.search);
		search_term = url.get('q') ?? '';
		submit();
	});
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('words.search')}</title>
</svelte:head>

<main class="tq-page tq-stack" data-ui="search">
	<h1 class="tq-page-title">{$t('words.search')}</h1>
	<form
		class="search-form"
		role="search"
		onsubmit={(e: Event) => {
			e.preventDefault();
			submit();
		}}
	>
		<input
			data-ui="quiz-search"
			class="tq-field"
			type="search"
			bind:value={search_term}
			aria-label={$t('words.search')}
			placeholder={$t('search_page.at_least_3_characters')}
		/>
		<button
			class="tq-button tq-button-primary"
			disabled={search_term.length <= 2}
			type="submit"
		>
			{$t('words.search')}
		</button>
	</form>

	{#if resp_data}
		{#if resp_data.hits.length}
			<div class="quiz-grid">
				{#each resp_data.hits as quiz}
					<SearchCard quiz={quiz._formatted} />
				{/each}
			</div>
		{:else}
			<div class="tq-panel tq-panel-body tq-stack stack-4" data-ui="search-empty">
				<p>{$t('ui.no_results')}</p>
				<div class="tq-toolbar">
					<a
						class="tq-button"
						href="https://create.kahoot.it/search?query={encodeURIComponent(
							search_term
						)}&tags=test&filter=filter%3D1"
						target="_blank"
						rel="noreferrer"
					>
						{$t('telekom.search_on_kahoot', { defaultValue: 'Search on Kahoot!' })}
					</a>
					<a class="tq-button" href="/import">{$t('words.import')}</a>
				</div>
			</div>
		{/if}
	{/if}
</main>
<Footer />

<style>
	.stack-4 {
		gap: 16px;
	}
	.search-form {
		display: flex;
		gap: 12px;
		max-width: 720px;
	}
	.search-form input {
		flex: 1;
		min-width: 0;
	}
	.quiz-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
	}
	@media (max-width: 1023px) {
		.quiz-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 639px) {
		.quiz-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.search-form {
			flex-direction: column;
		}
	}
</style>
