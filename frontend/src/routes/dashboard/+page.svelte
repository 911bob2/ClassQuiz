<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import DownloadQuiz from '$lib/components/DownloadQuiz.svelte';
	import type { QuizData } from '$lib/quiz_types';
	import { getLocalization } from '$lib/i18n';
	import Footer from '$lib/footer.svelte';
	import { signedIn } from '$lib/stores';
	import { navbarVisible } from '$lib/stores.svelte';
	import CommandpaletteNotice from '$lib/components/popover/commandpalettenotice.svelte';
	import Spinner from '$lib/Spinner.svelte';
	import Fuse from 'fuse.js';
	import type { PageData } from './$types';
	import StartGamePopup from '$lib/dashboard/start_game.svelte';
	import Analytics from './Analytics.svelte';
	import MediaComponent from '$lib/editor/MediaComponent.svelte';
	import { onMount } from 'svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	let search_term = $state('');
	let start_game = $state(null);
	let download_id: string | null = $state(null);
	let open_menu: string | null = $state(null);
	signedIn.set(true);
	navbarVisible.visible = true;
	const { t } = getLocalization();

	let items_to_show = $state([]);
	let all_items: Array<any> = $state();
	let fuse;

	let id_to_position_map = {};

	const getData = async (): Promise<{ items: Array<any>; fuse: Fuse<any> }> => {
		const items: any[] = [];

		for (const q of data.quizzes) items.push({ ...q, type: 'quiz' });
		for (const q of data.quiztivities) items.push({ ...q, type: 'quiztivity' });

		const f = new Fuse(items, {
			keys: ['title', 'description', 'questions.title'],
			findAllMatches: true
		});

		// return *all* derived data instead of mutating directly
		return { items, fuse: f };
	};

	const search = () => {
		if (search_term === '') {
			items_to_show = all_items;
			return;
		}

		const res = fuse.search(search_term);
		items_to_show = res.map((r) => r.item);
	};
	onMount(async () => {
		const { items, fuse: f } = await getData();
		all_items = items;
		items_to_show = items;
		fuse = f;

		// fill id_to_position_map
		id_to_position_map = {};
		for (let i = 0; i < items.length; i++) {
			id_to_position_map[items[i].id] = i;
		}
		search_term;
		search();
	});

	const deleteQuiz = async (to_delete: string, type: 'quiz' | 'quiztivity') => {
		if (!confirm('Do you really want to delete this quiz?')) {
			return;
		}
		if (type === 'quiz') {
			await fetch(`/api/v1/quiz/delete/${to_delete}`, {
				method: 'DELETE'
			});
		} else {
			await fetch(`/api/v1/quiztivity/${to_delete}`, {
				method: 'DELETE'
			});
		}
		window.location.reload();
	};

	let analytics_quiz_selected: undefined | QuizData = $state(undefined);

	const menu_key = (quiz: { type: string; id: string }) => `${quiz.type}:${quiz.id}`;

	const close_menu_on_outside_click = (event: MouseEvent) => {
		if (open_menu !== null && !(event.target as HTMLElement).closest('[data-menu-root]')) {
			open_menu = null;
		}
	};
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('telekom.library', { defaultValue: 'Quiz library' })}</title>
</svelte:head>

<svelte:window
	onclick={close_menu_on_outside_click}
	onkeydown={(event) => {
		if (event.key === 'Escape') open_menu = null;
	}}
/>

<Analytics bind:quiz={analytics_quiz_selected} />
<CommandpaletteNotice />
<main class="tq-page tq-stack" data-ui="library">
	<header class="tq-page-heading flush">
		<h1 class="tq-page-title">{$t('telekom.library', { defaultValue: 'Quiz library' })}</h1>
		<div class="tq-toolbar" data-ui="library-create">
			<a class="tq-button tq-button-primary" href="/create">{$t('dashboard.create_quiz')}</a>
			<a class="tq-button" href="/quiztivity/create">{$t('words.quiztivity')}</a>
			<a class="tq-button" href="/import">{$t('words.import')}</a>
		</div>
	</header>

	<nav class="tq-tabs" aria-label={$t('words.dashboard')}>
		<a class="tq-tab" href="/dashboard" aria-current="page">{$t('words.quiz')}</a>
		<a class="tq-tab" href="/results">{$t('words.results')}</a>
		<a class="tq-tab" href="/edit/files">{$t('words.files_library')}</a>
		<a class="tq-tab" href="/account/settings">{$t('words.settings')}</a>
	</nav>

	{#if !all_items}
		<Spinner />
	{:else if all_items.length === 0}
		<div class="tq-panel tq-empty" data-ui="library-empty">
			{$t('telekom.no_quizzes', { defaultValue: 'No quizzes' })}
		</div>
	{:else}
		<div class="library-search">
			<input
				data-ui="library-search"
				aria-label={$t('dashboard.search_for_own_quizzes')}
				class="tq-field"
				type="search"
				bind:value={search_term}
				oninput={search}
				placeholder={$t('dashboard.search_for_own_quizzes')}
			/>
			{#if search_term !== ''}
				<button
					type="button"
					class="tq-button"
					data-ui="library-search-clear"
					onclick={() => {
						search_term = '';
						search();
					}}
				>
					{$t('telekom.clear', { defaultValue: 'Clear' })}
				</button>
			{/if}
		</div>

		<div class="library-list">
			{#each items_to_show as quiz (menu_key(quiz))}
				<article class="tq-panel library-row" data-ui="library-item">
					{#if quiz.cover_image}
						<div class="library-cover">
							<MediaComponent
								src={quiz.cover_image}
								css_classes="library-cover-media"
								added_thumbhash_classes=""
							/>
						</div>
					{/if}
					<div class="library-info">
						<h2 class="library-title">{@html quiz.title}</h2>
						{#if quiz.description}
							<div class="tq-muted library-description">{@html quiz.description}</div>
						{/if}
						<span class="tq-badge">
							{$t(quiz.type === 'quiz' ? 'words.quiz' : 'words.quiztivity')}
						</span>
					</div>
					<div class="tq-toolbar library-actions">
						{#if quiz.type === 'quiz'}
							<button
								type="button"
								data-ui="library-start"
								class="tq-button"
								onclick={() => (start_game = quiz.id)}
							>
								{$t('start_game.start_game')}
							</button>
						{:else}
							<a class="tq-button" href="/quiztivity/play?id={quiz.id}">
								{$t('words.play')}
							</a>
						{/if}
						<a
							class="tq-button"
							data-ui="library-edit"
							href={quiz.type === 'quiz'
								? `/edit?quiz_id=${quiz.id}`
								: `/quiztivity/edit?id=${quiz.id}`}
						>
							{$t('words.edit')}
						</a>
						<div class="library-menu" data-menu-root>
							<button
								type="button"
								class="tq-button"
								data-ui="library-menu"
								aria-haspopup="true"
								aria-expanded={open_menu === menu_key(quiz)}
								onclick={() =>
									(open_menu =
										open_menu === menu_key(quiz) ? null : menu_key(quiz))}
							>
								{$t('telekom.actions', { defaultValue: 'Actions' })}
								<svg
									aria-hidden="true"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										d="M6 9l6 6 6-6"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</button>
							{#if open_menu === menu_key(quiz)}
								<div class="tq-panel library-menu-list" data-ui="library-menu-list">
									{#if quiz.type === 'quiz'}
										<a
											class="tq-button tq-button-ghost"
											aria-disabled={!quiz.public}
											tabindex={quiz.public ? undefined : -1}
											href={quiz.public ? `/view/${quiz.id}` : undefined}
										>
											{$t('telekom.view', { defaultValue: 'View' })}
										</a>
										<button
											type="button"
											class="tq-button tq-button-ghost"
											onclick={() => {
												analytics_quiz_selected = quiz;
												open_menu = null;
											}}
										>
											{$t('telekom.analytics', { defaultValue: 'Analytics' })}
										</button>
										<button
											type="button"
											class="tq-button tq-button-ghost"
											onclick={() => {
												download_id = quiz.id;
												open_menu = null;
											}}
										>
											{$t('words.download')}
										</button>
									{/if}
									<button
										type="button"
										class="tq-button tq-button-ghost tq-button-danger"
										onclick={() => {
											open_menu = null;
											deleteQuiz(quiz.id, quiz.type);
										}}
									>
										{$t('words.delete')}
									</button>
								</div>
							{/if}
						</div>
					</div>
				</article>
			{:else}
				<div class="tq-panel tq-empty">{$t('ui.no_results')}</div>
			{/each}
		</div>
	{/if}
</main>
<Footer />
{#if start_game !== null}
	<StartGamePopup bind:quiz_id={start_game} />
{/if}
<DownloadQuiz bind:quiz_id={download_id} />

<style>
	.flush {
		margin-bottom: 0;
	}
	.library-search {
		display: flex;
		gap: 12px;
		max-width: 640px;
	}
	.library-search input {
		flex: 1;
		min-width: 0;
	}
	.library-list {
		display: grid;
		gap: 12px;
	}
	.library-row {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 16px 20px;
	}
	.library-cover {
		width: 96px;
		height: 72px;
		flex-shrink: 0;
		overflow: hidden;
		border-radius: 8px;
		background: var(--tq-surface-subtle);
	}
	.library-cover :global(.library-cover-media) {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.library-info {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		min-width: 0;
	}
	.library-title {
		font-size: 18px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.library-description {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-size: 14px;
	}
	.library-actions {
		flex-shrink: 0;
		justify-content: flex-end;
		gap: 8px;
	}
	.library-menu {
		position: relative;
	}
	.library-menu-list {
		position: absolute;
		inset-block-start: calc(100% + 4px);
		inset-inline-end: 0;
		z-index: 20;
		display: grid;
		gap: 4px;
		min-width: 200px;
		padding: 8px;
		box-shadow: var(--tq-shadow);
	}
	.library-menu-list > :global(.tq-button) {
		justify-content: flex-start;
	}
	@media (max-width: 767px) {
		.library-row {
			flex-wrap: wrap;
			padding: 16px;
		}
		.library-cover {
			width: 64px;
			height: 64px;
		}
		.library-info {
			flex-basis: calc(100% - 88px);
		}
		.library-actions {
			width: 100%;
			justify-content: flex-start;
		}
		.library-search {
			flex-direction: column;
		}
	}
</style>
