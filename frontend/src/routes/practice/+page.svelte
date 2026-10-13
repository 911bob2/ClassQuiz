<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->
<script lang="ts">
	import { page } from '$app/state';
	import { getLocalization } from '$lib/i18n';
	const { t } = getLocalization();
	import type { QuizData } from '$lib/quiz_types';
	import Spinner from '$lib/Spinner.svelte';
	import TitleScreen from '$lib/practice/title_screen.svelte';
	import Question from '$lib/practice/question.svelte';

	let quiz: QuizData = $state();
	let unique = $state({});

	let selected_question = $state(-1);

	const get_quiz = async () => {
		const res = await fetch(`/api/v1/quiz/get/public/${page.url.searchParams.get('quiz_id')}`);
		if (!res.ok) {
			throw res.status;
		}
		quiz = await res.json();
		return quiz;
	};
	const reload_q = () => {
		unique = {};
	};
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('words.practice')}</title>
</svelte:head>

{#await get_quiz()}
	<Spinner />
{:then q}
	<main class="tq-page tq-page-narrow tq-stack" data-ui="practice-page">
		{#if selected_question === -1}
			<TitleScreen bind:data={quiz} />
		{:else}
			{#key unique}
				<Question bind:question={quiz.questions[selected_question]} />
			{/key}
		{/if}

		<nav class="tq-toolbar practice-nav" aria-label={$t('words.practice')}>
			<button
				class="tq-button"
				data-ui="practice-previous"
				disabled={selected_question <= -1}
				onclick={() => {
					reload_q();
					selected_question -= 1;
				}}
			>
				{$t('telekom.previous', { defaultValue: 'Previous' })}
			</button>
			<p class="practice-progress" aria-live="polite">
				{#if selected_question >= 0}
					{$t('telekom.question_progress', {
						current: selected_question + 1,
						total: quiz.questions.length,
						defaultValue: 'Question {{current}} of {{total}}'
					})}
				{/if}
			</p>
			<button
				class="tq-button tq-button-primary"
				data-ui={selected_question === -1 ? 'practice-start' : 'practice-next'}
				disabled={selected_question >= quiz.questions.length - 1}
				onclick={() => {
					reload_q();
					selected_question += 1;
				}}
			>
				{selected_question === -1
					? $t('telekom.start_practice', { defaultValue: 'Start practice' })
					: $t('telekom.next', { defaultValue: 'Next' })}
			</button>
		</nav>
	</main>
{:catch e}
	<main class="tq-page tq-page-narrow">
		{#if e === 404 || e === 400}
			<p class="tq-alert tq-alert-error" role="alert">
				{$t('telekom.quiz_not_found', { defaultValue: 'Quiz not found' })}
			</p>
		{:else}
			<p class="tq-alert tq-alert-error" role="alert">
				{$t('telekom.load_failed', { defaultValue: 'Unable to load quiz' })}
			</p>
		{/if}
	</main>
{/await}

<style>
	.practice-nav {
		justify-content: space-between;
	}

	.practice-progress {
		flex: 1;
		font-weight: 700;
		text-align: center;
	}
</style>
