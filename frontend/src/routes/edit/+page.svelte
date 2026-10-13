<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import Editor from '$lib/editor.svelte';
	import Spinner from '$lib/Spinner.svelte';
	import { getLocalization } from '$lib/i18n';
	import { navbarVisible } from '$lib/stores.svelte.ts';
	import { QuizQuestionType } from '$lib/quiz_types';

	navbarVisible.visible = false;

	const { t } = getLocalization();

	interface Data {
		public: boolean;
		title: string;
		description: string;
		questions: Question[];
	}

	interface Question {
		question: string;
		time: string;
		answers: Answer[];
	}

	interface Answer {
		right: boolean;
		answer: string;
	}

	let { data } = $props();
	let { quiz_id } = $state(data);
	let quiz_data: Data = $state();

	const get_quiz = async (): Promise<void> => {
		const response = await fetch(`/api/v1/quiz/get/${quiz_id}`);
		if (response.status === 404) {
			throw new Error('Quiz not found');
		} else if (response.status === 200) {
			let temp_data = await response.json();
			for (let i = 0; i < temp_data.questions.length; i++) {
				let question = temp_data.questions[i];
				if (question.type === undefined) {
					temp_data.questions[i].type = QuizQuestionType.ABCD;
				} else {
					temp_data.questions[i].type = QuizQuestionType[question.type];
				}
			}
			quiz_data = temp_data;
			return;
		}
	};
</script>

<svelte:head>
	<title>Telekom Quiz - Edit</title>
</svelte:head>
{#await get_quiz()}
	<Spinner />
{:then _}
	{#if quiz_data !== undefined}
		<Editor bind:data={quiz_data} {quiz_id} />
	{/if}
{:catch err}
	<main class="tq-page tq-page-narrow">
		<div class="tq-panel tq-panel-body tq-stack" data-ui="editor-error">
			<h1 class="tq-section-title">{err.message}</h1>
			<div>
				<a href="/dashboard" class="tq-button">{$t('words.dashboard')}</a>
			</div>
		</div>
	</main>
{/await}
