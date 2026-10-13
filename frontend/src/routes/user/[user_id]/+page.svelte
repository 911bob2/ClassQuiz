<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { PageData } from './$types';
	import { getLocalization } from '$lib/i18n';
	import { onMount } from 'svelte';
	import { signedIn } from '$lib/stores';
	import StartGamePopup from '$lib/dashboard/start_game.svelte';
	import Footer from '$lib/footer.svelte';

	const { t } = getLocalization();
	let start_game = $state(null);

	const close_start_game_if_esc_is_pressed = (key: KeyboardEvent) => {
		if (key.code === 'Escape') {
			start_game = null;
		}
	};
	onMount(() => {
		document.body.addEventListener('keydown', close_start_game_if_esc_is_pressed);
		return () => {
			document.body.removeEventListener('keydown', close_start_game_if_esc_is_pressed);
		};
	});
	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>
		Telekom Quiz · {data.user?.username
			? `@${data.user.username}`
			: $t('public_user_page.user_not_found')}
	</title>
</svelte:head>

<main class="tq-page profile" data-ui="profile">
	<aside class="tq-panel tq-panel-body profile-card">
		{#if data.user?.username === undefined}
			<h1 class="tq-section-title">{$t('public_user_page.user_not_found')}</h1>
		{:else}
			<img
				class="profile-avatar"
				src={`/api/v1/users/avatar/${data.user.id}`}
				alt={data.user.username}
			/>
			<div class="profile-meta">
				<h1 class="tq-section-title">@{data.user.username}</h1>
				<p class="tq-muted text-sm">
					{$t('public_user_page.joined_on', {
						date: new Date(data.user.created_at).toLocaleDateString()
					})}
				</p>
			</div>
		{/if}
	</aside>

	<section class="tq-stack stack-4 profile-quizzes" aria-label={$t('words.quiz')}>
		{#if !$signedIn && data.quizzes?.length}
			<p class="text-sm tq-muted">
				{$t('telekom.sign_in_to_start', {
					defaultValue: 'Sign in to start a game or download this quiz.'
				})}
			</p>
		{/if}
		{#if !data.quizzes?.length}
			<div class="tq-panel tq-empty">{$t('public_user_page.no_original_quizzes')}</div>
		{:else}
			<div class="quiz-list">
				{#each data.quizzes as quiz}
					<article class="tq-panel quiz-row" data-ui="profile-quiz">
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
								<div class="tq-muted quiz-description">
									{@html quiz.description}
								</div>
							{/if}
						</div>
						<div class="tq-toolbar quiz-actions">
							<a class="tq-button" href="/view/{quiz.id}">{$t('words.view')}</a>
							{#if $signedIn}
								<button
									type="button"
									class="tq-button"
									data-ui="profile-start"
									onclick={() => {
										start_game = quiz.id;
									}}
								>
									{$t('words.start')}
								</button>
								<a class="tq-button" href="/api/v1/eximport/{quiz.id}">
									{$t('words.download')}
								</a>
							{:else}
								<button type="button" class="tq-button" disabled
									>{$t('words.start')}</button
								>
								<button type="button" class="tq-button" disabled>
									{$t('words.download')}
								</button>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</main>
<Footer />
{#if start_game !== null}
	<StartGamePopup bind:quiz_id={start_game} />
{/if}

<style>
	.stack-4 {
		gap: 16px;
	}
	.profile {
		display: grid;
		grid-template-columns: 280px minmax(0, 1fr);
		gap: 32px;
		align-items: start;
	}
	.profile-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		text-align: center;
	}
	.profile-avatar {
		width: 160px;
		height: 160px;
		border-radius: 50%;
		object-fit: cover;
		background: var(--tq-surface-subtle);
	}
	.profile-meta {
		min-width: 0;
		overflow-wrap: anywhere;
	}
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
		flex: 1;
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
		margin-top: 4px;
		font-size: 14px;
	}
	.quiz-actions {
		flex-shrink: 0;
		justify-content: flex-end;
		gap: 8px;
	}
	@media (max-width: 767px) {
		.profile {
			grid-template-columns: minmax(0, 1fr);
			gap: 24px;
		}
		.profile-card {
			flex-direction: row;
			text-align: start;
		}
		.profile-avatar {
			width: 72px;
			height: 72px;
		}
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
		.quiz-actions {
			width: 100%;
			justify-content: flex-start;
		}
	}
</style>
