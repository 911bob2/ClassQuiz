<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { navbarVisible } from '$lib/stores.svelte.ts';
	import { getLocalization } from '$lib/i18n';
	import SearchCard from '$lib/search-card.svelte';
	import Footer from '$lib/footer.svelte';
	import type { PageData } from './$types';

	navbarVisible.visible = true;

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	const { t } = getLocalization();

	const hits = data.results?.hits ?? [];
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('words.explore')}</title>
</svelte:head>

<main class="tq-page tq-stack" data-ui="explore">
	<header class="tq-page-heading flush">
		<h1 class="tq-page-title">{$t('words.explore')}</h1>
		<a class="tq-button" href="/search" data-ui="explore-search">{$t('words.search')}</a>
	</header>
	{#if hits.length}
		<div class="quiz-grid">
			{#each hits as quiz}
				<SearchCard {quiz} />
			{/each}
		</div>
	{:else}
		<div class="tq-panel tq-empty">{$t('ui.no_results')}</div>
	{/if}
</main>
<Footer />

<style>
	.flush {
		margin-bottom: 0;
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
	}
</style>
