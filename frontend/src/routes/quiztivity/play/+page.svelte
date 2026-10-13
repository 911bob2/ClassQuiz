<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { PageData } from './$types';
	import type { Abcd, Markdown, Memory, QuizTivityPage } from '$lib/quiztivity/types';
	import { QuizTivityTypes } from '$lib/quiztivity/types';
	import NavigationBar from './navigation_bar.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	let quiztivity = $state(data.quiztivity);
	for (let i = 0; i < quiztivity.pages.length; i++) {
		const id = (Math.random() + 1).toString(36).substring(7);
		const type: QuizTivityTypes = quiztivity.pages[i].type as QuizTivityTypes;
		quiztivity.pages[i] = { ...quiztivity.pages[i], id, type };
	}

	let current_slide_index = $state(0);
	let current_slide: QuizTivityPage = $derived(quiztivity.pages[current_slide_index]);
</script>

<svelte:head>
	<title>Telekom Quiz · {quiztivity.title}</title>
</svelte:head>

<main class="tq-page tq-page-narrow tq-stack activity" data-ui="activity-play">
	<p class="tq-muted activity-title">{quiztivity.title}</p>
	<div class="activity-page">
		{#if current_slide?.type === QuizTivityTypes.MARKDOWN}
			{#await import('$lib/quiztivity/components/markdown/play.svelte') then c}
				<c.default data={current_slide.data as Markdown} />
			{/await}
		{:else if current_slide?.type === QuizTivityTypes.MEMORY}
			{#await import('$lib/quiztivity/components/memory/play.svelte') then c}
				<c.default data={current_slide.data as Memory} />
			{/await}
		{:else if current_slide?.type === QuizTivityTypes.ABCD}
			{#await import('$lib/quiztivity/components/abcd/play.svelte') then c}
				<c.default data={current_slide.data as unknown as Abcd} />
			{/await}
		{/if}
	</div>
	<NavigationBar bind:current_slide_index question_count={quiztivity.pages.length} />
</main>

<style>
	.activity {
		gap: 16px;
	}

	.activity-title {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
	}

	.activity-page {
		width: 100%;
	}
</style>
