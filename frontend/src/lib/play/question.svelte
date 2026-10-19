<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { roomEvents } from '$lib/room-socket';
	const listen = roomEvents();
	import type { Answer, OrderQuizAnswer, Question, RangeQuizAnswer } from '$lib/quiz_types';
	import { QuizQuestionType } from '$lib/quiz_types';
	import { socket, sendAnswer } from '$lib/socket';
	import { onDestroy } from 'svelte';
	import Spinner from '../Spinner.svelte';
	import { getLocalization } from '$lib/i18n';
	import CircularTimer from '$lib/play/circular_progress.svelte';
	import AnswerTile from '$lib/play/answer_tile.svelte';
	import OrderList from '$lib/play/order_list.svelte';
	import MediaComponent from '$lib/editor/MediaComponent.svelte';
	import { rangePipStep } from '$lib/play/range';

	const { t } = getLocalization();

	interface Props {
		question: Question;
		game_mode: any;
		question_index: string | number;
		question_token?: string;
		question_count?: number;
		solution: any;
		already_submitted?: boolean;
		remaining_ms?: number;
	}

	let {
		question = $bindable(),
		game_mode = $bindable(),
		question_index,
		question_token,
		question_count,
		solution,
		already_submitted = false,
		remaining_ms
	}: Props = $props();

	if (question.type === undefined) {
		question.type = QuizQuestionType.ABCD;
	} else {
		question.type = QuizQuestionType[question.type];
	}

	let timer_res = $state(
		remaining_ms === undefined ? question.time : String(Math.ceil(remaining_ms / 1000))
	);
	let selected_answer: any = $state();
	// Presentation only: true as soon as any answer was sent.
	let submitted = $state(already_submitted);
	if (already_submitted) selected_answer = 'submitted';
	$effect(() => {
		if (already_submitted) {
			submitted = true;
			selected_answer ??= 'submitted';
		}
	});
	let timer_interval: ReturnType<typeof setInterval>;

	// Stop the timer if the question is answered
	const timer = (time: string) => {
		let seconds = Number(time);
		timer_interval = setInterval(() => {
			if (timer_res === '0') {
				clearInterval(timer_interval);
				return;
			} else {
				seconds--;
			}

			timer_res = seconds.toString();
		}, 1000);
	};
	const everyone_answered = (data) => {
		if (data?.question_index === undefined || data.question_index === Number(question_index)) {
			timer_res = '0';
		}
	};
	listen('everyone_answered', everyone_answered);
	// The server closed the question before this answer arrived.
	let rejected = $state(false);
	listen('question_not_active', () => {
		if (submitted) rejected = true;
	});
	onDestroy(() => {
		clearInterval(timer_interval);
		socket.off('everyone_answered', everyone_answered);
	});

	timer(timer_res);

	$effect(() => {
		if (solution !== undefined) {
			timer_res = '0';
		}
	});

	const selectAnswer = (answer: string | number) => {
		selected_answer = answer;
		submitted = true;
		sendAnswer({
			question_index: question_index,
			question_token,
			answer: answer
		});
	};

	const select_complex_answer = (data) => {
		selected_answer = 'a';
		submitted = true;
		const new_array = [];
		for (let i = 0; i < data.length; i++) {
			new_array.push({ answer: data[i].answer });
		}
		sendAnswer({
			question_index: question_index,
			question_token,
			answer: 'a',
			complex_answer: new_array
		});
	};

	let text_input = $state('');

	let slider_value = $state([0]);
	// The answers of a question are a union that depends on its type.
	const range = (): RangeQuizAnswer => question.answers as RangeQuizAnswer;
	let choices = $derived(question.answers as Answer[]);
	if (question.type === QuizQuestionType.RANGE) {
		slider_value[0] = (range().max - range().min) / 2 + range().min;
	}
	const set_answer_if_not_set_range = (time) => {
		if (question.type !== QuizQuestionType.RANGE) {
			return;
		}
		if (selected_answer === undefined && time === '0') {
			selected_answer = `${slider_value[0]}`;
			selectAnswer(selected_answer);
		}
	};

	if (question.type === QuizQuestionType.ORDER) {
		const order_answers = question.answers as OrderQuizAnswer[];
		for (let i = 0; i < order_answers.length; i++) {
			order_answers[i] = { ...order_answers[i], id: i };
		}
	}

	$effect(() => {
		set_answer_if_not_set_range(timer_res);
	});
	let circular_progress = $derived.by(() => {
		try {
			return 1 - ((100 / parseInt(question.time)) * parseInt(timer_res)) / 100;
		} catch {
			return 0;
		}
	});

	let question_number = $derived(Number(question_index) + 1);
	let kahoot_mode = $derived(game_mode === 'kahoot');
</script>

<!-- Slides are only sent to the host; there is no player screen for them. -->
{#if question.type !== QuizQuestionType.SLIDE}
	<main class="play-shell" data-ui="player-question">
		<header class="play-bar tq-panel">
			<div class="play-bar-text">
				<p class="play-progress">
					{#if question_count}
						{$t('telekom.question_progress', {
							current: question_number,
							total: question_count,
							defaultValue: 'Question {{current}} of {{total}}'
						})}
					{:else}
						{$t('telekom.question_number', {
							current: question_number,
							defaultValue: 'Question {{current}}'
						})}
					{/if}
				</p>
				{#if rejected}
					<p class="play-status" role="status">
						{$t('telekom.answer_too_late', {
							defaultValue: 'Too late: this answer was not counted'
						})}
					</p>
				{:else if submitted && timer_res !== '0'}
					<p class="play-status" role="status">
						{$t('telekom.answer_submitted', { defaultValue: 'Answer submitted' })}
					</p>
				{/if}
			</div>
			<CircularTimer text={timer_res} progress={circular_progress} size={56} />
		</header>

		{#if !kahoot_mode}
			<section class="tq-panel tq-panel-body play-question-panel">
				<h1 class="play-question">{@html question.question}</h1>
				{#if question.image !== null}
					<div class="play-media">
						<MediaComponent
							src={question.image}
							css_classes="object-contain mx-auto max-h-[30vh] rounded-lg"
						/>
					</div>
				{/if}
			</section>
		{/if}

		{#if timer_res !== '0'}
			{#if question.type === QuizQuestionType.ABCD || question.type === QuizQuestionType.VOTING}
				<div class="answer-grid" class:answer-grid-shapes={kahoot_mode}>
					{#each choices as answer, i}
						<AnswerTile
							index={i}
							label={answer.answer}
							color={answer.color}
							shapeOnly={kahoot_mode}
							selected={selected_answer === answer.answer}
							disabled={selected_answer !== undefined}
							onclick={() => selectAnswer(answer.answer)}
						/>
					{/each}
				</div>
			{:else if question.type === QuizQuestionType.RANGE}
				{#await import('svelte-range-slider-pips')}
					<Spinner />
				{:then c}
					<section class="tq-panel tq-panel-body play-control">
						<div
							class:pointer-events-none={selected_answer !== undefined}
							class="slider-wrap"
						>
							<c.default
								bind:values={slider_value}
								min={range().min}
								max={range().max}
								id="pips-slider"
								pips
								float
								all="label"
								pipstep={rangePipStep(range().min, range().max)}
							/>
						</div>
						<button
							type="button"
							class="tq-button tq-button-primary play-submit"
							disabled={selected_answer !== undefined}
							onclick={() => selectAnswer(slider_value[0])}
						>
							{$t('words.submit')}
						</button>
					</section>
				{/await}
			{:else if question.type === QuizQuestionType.TEXT}
				<section class="tq-panel tq-panel-body play-control">
					<div class="tq-field-group">
						<label for="player-text-answer" class="tq-label">
							{$t('telekom.your_answer', { defaultValue: 'Your answer' })}
						</label>
						<input
							type="text"
							id="player-text-answer"
							class="tq-field play-text-input"
							bind:value={text_input}
							disabled={selected_answer !== undefined}
							autocomplete="off"
						/>
					</div>
					<button
						type="button"
						class="tq-button tq-button-primary play-submit"
						disabled={!text_input ||
							text_input.length === 0 ||
							selected_answer !== undefined}
						onclick={() => {
							selectAnswer(text_input);
						}}
					>
						{$t('words.submit')}
					</button>
				</section>
			{:else if question.type === QuizQuestionType.ORDER}
				<section class="tq-stack play-control" style="gap: 12px">
					<OrderList
						bind:answers={question.answers}
						disabled={Boolean(selected_answer)}
					/>
					<button
						type="button"
						class="tq-button tq-button-primary play-submit"
						disabled={Boolean(selected_answer)}
						onclick={() => {
							select_complex_answer(question.answers);
						}}
					>
						{$t('words.submit')}
					</button>
				</section>
			{:else if question.type === QuizQuestionType.CHECK}
				{#await import('./questions/check.svelte')}
					<Spinner />
				{:then c}
					<section class="tq-stack play-control" style="gap: 16px">
						<c.default
							{question}
							bind:selected_answer
							{game_mode}
							{timer_res}
							{circular_progress}
							disabled={submitted}
						/>
						<button
							type="button"
							class="tq-button tq-button-primary play-submit"
							disabled={selected_answer === undefined || submitted}
							onclick={() => selectAnswer(selected_answer)}
						>
							{$t('words.submit')}
						</button>
					</section>
				{/await}
			{/if}
		{:else}
			<section class="tq-alert play-wait" role="status">
				<strong>
					{#if submitted}
						{$t('telekom.answer_submitted', { defaultValue: 'Answer submitted' })}
					{:else}
						{$t('telekom.time_up', { defaultValue: 'Time is up' })}
					{/if}
				</strong>
				<span class="tq-muted">
					{$t('telekom.waiting_for_results', { defaultValue: 'Waiting for results' })}
				</span>
			</section>
		{/if}
	</main>
{/if}

<style>
	.play-shell {
		display: flex;
		flex-direction: column;
		gap: 16px;
		width: 100%;
		max-width: 960px;
		min-height: 100dvh;
		margin-inline: auto;
		padding: 12px 16px 24px;
	}

	.play-bar {
		position: sticky;
		inset-block-start: 8px;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 10px 16px;
		box-shadow: var(--tq-shadow);
	}

	.play-bar-text {
		min-width: 0;
	}

	.play-progress {
		font-size: 16px;
		font-weight: 700;
	}

	.play-status {
		color: var(--tq-success);
		font-size: 14px;
		font-weight: 700;
	}

	.play-question-panel {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.play-question {
		font-size: clamp(20px, 5vw, 32px);
		font-weight: 700;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}

	.play-question :global(p) {
		margin: 0;
	}

	.play-media {
		display: flex;
		justify-content: center;
	}

	.play-control {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.slider-wrap {
		padding-block: 40px 16px;
		padding-inline: 8px;
	}

	.play-submit {
		width: 100%;
		min-height: 56px;
		font-size: 18px;
	}

	.play-text-input {
		min-height: 56px;
		font-size: 20px;
	}

	.play-wait {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 18px;
	}

	.answer-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}

	.answer-grid-shapes {
		flex: 1;
		grid-auto-rows: 1fr;
	}

	@media (max-width: 600px) {
		.answer-grid:not(.answer-grid-shapes) {
			grid-template-columns: 1fr;
		}

		.answer-grid {
			gap: 12px;
		}
	}
</style>
