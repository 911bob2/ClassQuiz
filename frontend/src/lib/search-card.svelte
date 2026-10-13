<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import ImportedOrNot from '$lib/view_quiz/imported_or_not.svelte';

	const { t } = getLocalization();
	let { quiz } = $props();
</script>

<a href="/view/{quiz.id}" class="tq-panel tq-panel-body search-card" data-ui="quiz-card">
	<div class="tq-stack stack-3">
		<ImportedOrNot imported={quiz.imported_from_kahoot} />
		<h2 class="tq-section-title card-title">{@html quiz.title}</h2>
		{#if quiz.description}
			<div class="tq-muted card-description">{@html quiz.description}</div>
		{/if}
	</div>
	<p class="text-sm tq-muted card-author">
		{$t(
			quiz.imported_from_kahoot === true ? 'explore_page.imported_by' : 'explore_page.made_by'
		)}
		{@html quiz.user}
	</p>
</a>

<style>
	.stack-3 {
		gap: 12px;
	}
	.search-card {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 16px;
		height: 100%;
		color: inherit;
		text-decoration: none;
		transition: border-color 120ms;
	}
	.search-card:hover {
		border-color: var(--tq-accent);
	}
	.card-title {
		overflow-wrap: anywhere;
	}
	.card-description {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.card-author {
		margin: 0;
	}
	.search-card :global(mark) {
		border-radius: 2px;
		background: var(--tq-brand-soft);
		color: var(--tq-accent);
	}
</style>
