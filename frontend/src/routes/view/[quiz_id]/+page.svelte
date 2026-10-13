<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { answerStyle } from '$lib/answer-presentation';
	import DownloadQuiz from '$lib/components/DownloadQuiz.svelte';
	import { getLocalization } from '$lib/i18n';
	import CollapsSection from '$lib/collapsible.svelte';
	import ImportedOrNot from '$lib/view_quiz/imported_or_not.svelte';
	import { QuizQuestionType } from '$lib/quiz_types.js';
	import StartGamePopup from '$lib/dashboard/start_game.svelte';
	import { onMount } from 'svelte';
	import Spinner from '$lib/Spinner.svelte';
	import MediaComponent from '$lib/editor/MediaComponent.svelte';
	import RatingComponent from '$lib/view_quiz/RatingComponent.svelte';
	import { page } from '$app/state';
	import ModComponent from './ModComponent.svelte';
	import Footer from '$lib/footer.svelte';

	let start_game = $state(null);
	let download_id: string | null = $state(null);
	const urlparams = page.url.searchParams;
	const mod_view = Boolean(urlparams.get('mod'));
	const auto_expand = Boolean(urlparams.get('autoExpand'));
	const auto_return = Boolean(urlparams.get('autoReturn'));
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

	const { t } = getLocalization();
	let { data } = $props();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let { quiz, logged_in }: { quiz: any; logged_in: boolean } = $state(data);
</script>

<svelte:head>
	<title>Telekom Quiz · {quiz.title}</title>
</svelte:head>

<main class="tq-page tq-stack" data-ui="quiz-overview">
	<section class="tq-panel tq-panel-body quiz-header">
		<div class="quiz-summary tq-stack">
			<div class="tq-stack quiz-title-block">
				<ImportedOrNot imported={quiz.imported_from_kahoot} />
				<h1 class="tq-page-title">{@html quiz.title}</h1>
				{#if quiz.description}
					<div class="tq-muted quiz-description">{@html quiz.description}</div>
				{/if}
				{#if quiz.user_id?.username}
					<p class="text-sm tq-muted">
						{$t('view_quiz_page.made_by')}
						<a class="tq-link" href="/user/{quiz.user_id.id}"
							>@{quiz.user_id.username}</a
						>
					</p>
				{/if}
			</div>

			<div class="tq-toolbar" data-ui="quiz-actions">
				<button
					type="button"
					class="tq-button tq-button-primary"
					data-ui="quiz-start"
					disabled={!logged_in}
					onclick={() => (start_game = quiz.id)}
				>
					{$t('start_game.start_game')}
				</button>
				<a class="tq-button" href="/practice?quiz_id={quiz.id}">{$t('words.practice')}</a>
				<button
					type="button"
					class="tq-button"
					data-ui="quiz-download"
					disabled={!logged_in}
					onclick={() => (download_id = quiz.id)}
				>
					{$t('words.download')}
				</button>
				{#if quiz.imported_from_kahoot && quiz.kahoot_id}
					<a
						class="tq-link"
						href="https://create.kahoot.it/details/{quiz.kahoot_id}"
						target="_blank"
						rel="noreferrer"
					>
						{$t('view_quiz_page.view_on_kahoot')}
					</a>
				{/if}
			</div>
			{#if !logged_in}
				<p class="text-sm tq-muted">
					{$t('telekom.sign_in_to_start', {
						defaultValue: 'Sign in to start a game or download this quiz.'
					})}
				</p>
			{/if}
		</div>

		{#if quiz.cover_image}
			<div class="quiz-cover">
				<MediaComponent
					src={quiz.cover_image}
					css_classes="quiz-cover-media"
					added_thumbhash_classes=""
				/>
			</div>
		{/if}
	</section>

	<RatingComponent bind:quiz />

	{#if mod_view}
		<ModComponent autoReturn={auto_return} quiz_id={quiz.id} />
	{/if}

	<section class="tq-stack stack-4" aria-labelledby="questions-title">
		<h2 class="tq-section-title" id="questions-title">
			{$t('words.question_plural')}
			<span class="tq-badge">{quiz.questions.length}</span>
		</h2>
		<div class="grid gap-3">
			{#each quiz.questions as question, index_question}
				<div data-ui="quiz-question">
					<CollapsSection
						headerText="{index_question + 1}. {question.question}"
						expanded={auto_expand}
					>
						<div class="tq-stack stack-4">
							{#if question.image}
								<div class="question-media">
									<MediaComponent
										css_classes="mx-auto"
										src={question.image}
										muted={true}
									/>
								</div>
							{/if}
							<p class="question-time tq-muted">
								<svg
									aria-hidden="true"
									width="20"
									height="20"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<span>{question.time}s</span>
							</p>

							{#if question.type === QuizQuestionType.ABCD || question.type === undefined || question.type === QuizQuestionType.CHECK}
								<div class="answer-grid">
									{#each question.answers as answer}
										<div
											class="tq-answer answer-tile"
											class:answer-correct={answer.right}
											style={answerStyle(answer.color)}
										>
											<span class="answer-text">{answer.answer}</span>
											{#if answer.right}
												<span class="answer-flag">
													<svg
														aria-hidden="true"
														width="16"
														height="16"
														fill="none"
														stroke="currentColor"
														stroke-width="2.5"
														viewBox="0 0 24 24"
													>
														<path
															d="M5 13l4 4L19 7"
															stroke-linecap="round"
															stroke-linejoin="round"
														/>
													</svg>
													{$t('words.correct')}
												</span>
											{/if}
										</div>
									{/each}
								</div>
							{:else if question.type === QuizQuestionType.RANGE}
								<p class="tq-panel p-4">
									{$t('telekom.range_summary', {
										defaultValue:
											'Correct answers: {{min_correct}} to {{max_correct}}. Players can select values from {{min}} to {{max}}.',
										min_correct: question.answers.min_correct,
										max_correct: question.answers.max_correct,
										min: question.answers.min,
										max: question.answers.max
									})}
								</p>
							{:else if question.type === QuizQuestionType.ORDER}
								<ol class="order-list">
									{#each question.answers as answer}
										<li class="tq-answer order-item">{answer.answer}</li>
									{/each}
								</ol>
							{:else if question.type === QuizQuestionType.VOTING || question.type === QuizQuestionType.TEXT}
								<div class="answer-grid">
									{#each question.answers as answer}
										<div class="tq-answer answer-tile">
											<span class="answer-text">{answer.answer}</span>
										</div>
									{/each}
								</div>
							{:else if question.type === QuizQuestionType.SLIDE}
								{#await import('$lib/play/admin/slide.svelte')}
									<Spinner my_20={false} />
								{:then c}
									<div class="max-h-[90%] max-w-[90%]">
										<c.default question={quiz.questions[index_question]} />
									</div>
								{/await}
							{/if}
						</div>
					</CollapsSection>
				</div>
			{/each}
		</div>
	</section>
</main>
<Footer />

{#if start_game !== null}
	<StartGamePopup bind:quiz_id={start_game} />
{/if}

<DownloadQuiz bind:quiz_id={download_id} />

<style>
	.stack-4 {
		gap: 16px;
	}
	.quiz-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 320px);
		gap: 32px;
		align-items: start;
	}
	.quiz-title-block {
		gap: 12px;
	}
	.quiz-description {
		overflow-wrap: anywhere;
	}
	.quiz-cover {
		display: flex;
		justify-content: center;
		overflow: hidden;
		border-radius: 12px;
		background: var(--tq-surface-subtle);
	}
	.quiz-cover :global(.quiz-cover-media) {
		display: block;
		width: 100%;
		max-height: 240px;
		object-fit: cover;
	}
	.question-time {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 14px;
	}
	.answer-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	.answer-tile {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.answer-text {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.answer-correct {
		border-color: var(--tq-success);
		border-width: 2px;
	}
	.answer-flag {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		gap: 4px;
		border-radius: 4px;
		padding: 2px 8px;
		background: var(--tq-success-soft);
		color: var(--tq-success);
		font-size: 13px;
		font-weight: 700;
	}
	.order-list {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style-position: inside;
	}
	.order-item {
		display: list-item;
		min-height: 0;
		padding: 12px 16px;
	}
	@media (max-width: 767px) {
		.quiz-header {
			grid-template-columns: minmax(0, 1fr);
			gap: 24px;
		}
		.quiz-cover {
			order: -1;
		}
		.answer-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
