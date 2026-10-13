<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { PageData } from './$types';
	import PlayerOverview from './player_overview.svelte';
	import QuestionOverview from './question_overview.svelte';
	import GeneralOverview from './general_overview.svelte';
	import { fade } from 'svelte/transition';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const SelectedTab = { Overview: 0, Players: 1, Questions: 2 } as const;
	type SelectedTab = (typeof SelectedTab)[keyof typeof SelectedTab];

	let selected_tab: SelectedTab = $state(SelectedTab.Overview);

	const tabs = $derived([
		{ id: SelectedTab.Overview, ui: 'results-overview-tab', label: $t('words.overview') },
		{ id: SelectedTab.Players, ui: 'results-players-tab', label: $t('words.player_plural') },
		{
			id: SelectedTab.Questions,
			ui: 'results-questions-tab',
			label: $t('words.question_plural')
		}
	]);

	// Arrow keys move between tabs, as in the WAI-ARIA tabs pattern.
	const onTabKeydown = (event: KeyboardEvent, index: number) => {
		let next = index;
		if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
		else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = tabs.length - 1;
		else return;
		event.preventDefault();
		selected_tab = tabs[next].id;
		(document.getElementById(`results-tab-${tabs[next].id}`) as HTMLElement | null)?.focus();
	};
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('words.results')}</title>
</svelte:head>

<main class="tq-page tq-stack" data-ui="results-detail">
	<header class="tq-page-heading">
		<div>
			<h1 class="tq-page-title">{@html data.results?.title ?? $t('words.results')}</h1>
			{#if data.results?.timestamp}
				<p class="tq-muted results-date">
					{new Date(data.results.timestamp).toLocaleString()}
				</p>
			{/if}
		</div>
		<a class="tq-button" href="/results" data-ui="results-back">
			{$t('telekom.all_results', { defaultValue: 'All results' })}
		</a>
	</header>

	{#if !data.results}
		<p class="tq-alert tq-alert-error" role="alert">
			{$t('telekom.result_not_found', { defaultValue: 'Result not found' })}
		</p>
	{:else}
		<div class="tq-tabs" role="tablist" aria-label={$t('words.results')}>
			{#each tabs as tab, index}
				<button
					type="button"
					role="tab"
					id="results-tab-{tab.id}"
					class="tq-tab"
					data-ui={tab.ui}
					aria-selected={selected_tab === tab.id}
					aria-controls="results-panel"
					tabindex={selected_tab === tab.id ? 0 : -1}
					onclick={() => (selected_tab = tab.id)}
					onkeydown={(event) => onTabKeydown(event, index)}
				>
					{tab.label}
				</button>
			{/each}
		</div>
		<div id="results-panel" role="tabpanel" aria-labelledby="results-tab-{selected_tab}">
			{#if selected_tab === SelectedTab.Overview}
				<div in:fade|global={{ duration: 150 }}>
					<GeneralOverview
						scores={data.results.player_scores}
						title={data.results.title}
						timestamp={data.results.timestamp}
						question_count={data.results.questions?.length}
					/>
				</div>
			{:else if selected_tab === SelectedTab.Questions}
				<div in:fade|global={{ duration: 150 }}>
					<QuestionOverview
						questions={data.results.questions}
						answers={data.results.answers}
					/>
				</div>
			{:else if selected_tab === SelectedTab.Players}
				<div in:fade|global={{ duration: 150 }}>
					<PlayerOverview
						custom_field={data.results.custom_field_data}
						scores={data.results.player_scores}
						answers={data.results.answers}
					/>
				</div>
			{/if}
		</div>
	{/if}
</main>

<style>
	.results-date {
		margin-block-start: 4px;
	}
</style>
