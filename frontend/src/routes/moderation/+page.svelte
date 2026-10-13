<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { PageData } from './$types';
	import { getLocalization } from '$lib/i18n';
	import { navbarVisible } from '$lib/stores.svelte.ts';
	import Footer from '$lib/footer.svelte';

	navbarVisible.visible = true;
	const { t } = getLocalization();

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('telekom.moderation', { defaultValue: 'Moderation' })}</title>
</svelte:head>

<main class="tq-page tq-stack" data-ui="moderation">
	<h1 class="tq-page-title">{$t('telekom.moderation', { defaultValue: 'Moderation' })}</h1>

	{#if data.quizzes.length === 0}
		<div class="tq-panel tq-empty">{$t('ui.no_results')}</div>
	{:else}
		<div class="quiz-list">
			{#each data.quizzes as quiz}
				<article class="tq-panel quiz-row" data-ui="moderation-item">
					{#if quiz.cover_image}
						<img
							class="quiz-cover"
							src="/api/v1/storage/download/{quiz.cover_image}"
							alt=""
							loading="lazy"
						/>
					{/if}
					<div class="quiz-info">
						<h2 class="quiz-title">{@html quiz.title}</h2>
						{#if quiz.description}
							<div class="tq-muted quiz-description">{@html quiz.description}</div>
						{/if}
						<span class="tq-badge"
							>{$t('words.question_plural')}: {quiz.questions.length}</span
						>
					</div>
					<a
						class="tq-button"
						href="/view/{quiz.id}?mod=true&autoExpand=true&autoReturn=true"
					>
						{$t('words.view')}
					</a>
				</article>
			{/each}
		</div>
	{/if}

	<nav class="pagination" aria-label={$t('telekom.pagination', { defaultValue: 'Pagination' })}>
		<a
			class="tq-button"
			aria-disabled={data.page === '1'}
			tabindex={data.page === '1' ? -1 : undefined}
			href={data.page === '1' ? undefined : `/moderation?page=${parseInt(data.page) - 1}`}
		>
			{$t('uploader.previous_page')}
		</a>
		<span class="tq-muted">
			{$t('telekom.page_number', { defaultValue: 'Page {{page}}', page: data.page })}
		</span>
		<a
			class="tq-button"
			aria-disabled={data.quizzes.length !== 20}
			tabindex={data.quizzes.length !== 20 ? -1 : undefined}
			href={data.quizzes.length !== 20
				? undefined
				: `/moderation?page=${parseInt(data.page) + 1}`}
		>
			{$t('uploader.next_page')}
		</a>
	</nav>
</main>
<Footer />

<style>
	.quiz-list {
		display: grid;
		gap: 12px;
	}
	.quiz-row {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 16px 20px;
	}
	.quiz-cover {
		width: 96px;
		height: 72px;
		flex-shrink: 0;
		border-radius: 8px;
		object-fit: cover;
		background: var(--tq-surface-subtle);
	}
	.quiz-info {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		min-width: 0;
	}
	.quiz-title {
		font-size: 18px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.quiz-description {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-size: 14px;
	}
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
	}
	@media (max-width: 767px) {
		.quiz-row {
			flex-wrap: wrap;
			padding: 16px;
		}
		.quiz-cover {
			width: 64px;
			height: 64px;
		}
		.quiz-info {
			flex-basis: calc(100% - 88px);
		}
	}
</style>
