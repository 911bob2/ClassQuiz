<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { QuizQuestionType } from '$lib/quiz_types';
	import type { Answer, QuizData } from '$lib/quiz_types';
	import AnswerTile from '$lib/play/answer_tile.svelte';
	import CircularTimer from '$lib/play/circular_progress.svelte';
	import MediaComponent from '$lib/editor/MediaComponent.svelte';
	import { getLocalization } from '$lib/i18n';

	interface Props {
		quiz_data: QuizData;
		selected_question: number;
		timer_res: string;
		answer_count: number;
		default_colors: string[];
	}

	let {
		quiz_data,
		selected_question,
		timer_res = $bindable(),
		answer_count,
		default_colors
	}: Props = $props();

	const { t } = getLocalization();

	let question = $derived(quiz_data.questions[selected_question]);
	// The answers of a question are a union that depends on its type.
	let choices = $derived(question.answers as Answer[]);
	let revealed = $derived(timer_res === '0');
	let has_choices = $derived(
		question.type === QuizQuestionType.ABCD ||
			question.type === QuizQuestionType.VOTING ||
			question.type === QuizQuestionType.CHECK
	);

	let circular_progress = $derived.by(() => {
		try {
			return (
				1 -
				((100 / parseInt(quiz_data.questions[selected_question].time)) *
					parseInt(timer_res)) /
					100
			);
		} catch {
			return 0;
		}
	});

	// Wrong answers are marked once the solutions are shown; votes have no right answer.
	const answer_status = (right: boolean): 'correct' | 'incorrect' | undefined => {
		if (!revealed || question.type === QuizQuestionType.VOTING) {
			return undefined;
		}
		return right ? 'correct' : 'incorrect';
	};
</script>

<section class="tq-page host-question" data-ui="host-question">
	<header class="host-head">
		<h1 class="host-title">{@html question.question}</h1>
		<div class="host-status tq-panel">
			<CircularTimer text={timer_res} progress={circular_progress} size={96} />
			<p class="host-count">
				{$t('admin_page.answers_submitted', { answer_count: answer_count })}
			</p>
		</div>
	</header>

	{#if question.image !== null}
		<div class="host-media">
			<MediaComponent
				src={question.image}
				muted={false}
				css_classes="max-h-[28vh] object-contain mx-auto w-auto rounded-lg"
			/>
		</div>
	{/if}

	{#if has_choices}
		<div class="host-answers">
			{#each choices as answer, i}
				<AnswerTile
					size="host"
					index={i}
					label={answer.answer}
					color={answer.color}
					status={answer_status(answer.right)}
					dimmed={revealed &&
						!answer.right &&
						(question.type === QuizQuestionType.ABCD ||
							question.type === QuizQuestionType.CHECK)}
				/>
			{/each}
		</div>
	{:else if question.type === QuizQuestionType.TEXT}
		{#if revealed}
			<div class="host-answers">
				{#each choices as answer}
					<AnswerTile size="host" label={answer.answer} color={answer.color} />
				{/each}
			</div>
		{:else}
			<p class="tq-panel tq-panel-body host-instruction">
				{$t('admin_page.enter_answer_into_field')}
			</p>
		{/if}
	{/if}
</section>

<style>
	.host-question {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding-block-start: 32px;
	}

	.host-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
	}

	.host-title {
		flex: 1;
		min-width: 0;
		font-size: clamp(28px, 3.6vw, 56px);
		font-weight: 700;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}

	.host-title :global(p) {
		margin: 0;
	}

	.host-status {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
		min-width: 180px;
		padding: 16px 20px;
		text-align: center;
	}

	.host-count {
		font-size: 18px;
		font-weight: 700;
	}

	.host-media {
		display: flex;
		justify-content: center;
	}

	.host-answers {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}

	.host-instruction {
		font-size: 24px;
		text-align: center;
	}

	@media (max-width: 800px) {
		.host-head {
			flex-direction: column;
		}

		.host-status {
			flex-direction: row;
			align-self: stretch;
			justify-content: center;
			text-align: start;
		}

		.host-answers {
			grid-template-columns: 1fr;
		}
	}
</style>
