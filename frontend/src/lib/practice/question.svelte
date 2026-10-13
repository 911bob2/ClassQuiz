<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import AnswerTile from '$lib/play/answer_tile.svelte';
	import CircularTimer from '$lib/play/circular_progress.svelte';
	import OrderList from '$lib/play/order_list.svelte';
	import type { Answer, OrderQuizAnswer, Question, RangeQuizAnswer } from '$lib/quiz_types';
	import { QuizQuestionType } from '$lib/quiz_types';
	import { fly } from 'svelte/transition';
	import { getLocalization } from '$lib/i18n';
	import Spinner from '$lib/Spinner.svelte';
	import MediaComponent from '$lib/editor/MediaComponent.svelte';
	import { rangePipStep } from '$lib/play/range';

	interface Props {
		question: Question;
	}

	let { question = $bindable() }: Props = $props();

	const { t } = getLocalization();

	let selected_answer = $state(undefined);
	let timer_res = $state(question.time);
	let show_results = $state(false);

	// Stop the timer if the question is answered
	const timer = (time: string) => {
		let seconds = Number(time);
		let timer_interval = setInterval(() => {
			if (timer_res === '0') {
				clearInterval(timer_interval);

				return;
			} else {
				seconds--;
			}

			timer_res = seconds.toString();
		}, 1000);
	};
	// The answers of a question are a union that depends on its type.
	const range = (): RangeQuizAnswer => question.answers as RangeQuizAnswer;
	let choices = $derived(question.answers as Answer[]);
	let slider_value = $state([0]);
	if (question.type === QuizQuestionType.RANGE) {
		slider_value[0] = (range().max - range().min) / 2 + range().min;
	}
	let slider_values = $state([range().min_correct ?? 0, range().max_correct ?? 0]);

	let text_input = $state();
	timer(question.time);

	let check_choice_selected = $state([false, false, false, false]);

	function shuffleArray(a) {
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	let original_order: OrderQuizAnswer[] = [];

	if (question.type === QuizQuestionType.ORDER) {
		const order_answers = question.answers as OrderQuizAnswer[];
		for (let i = 0; i < order_answers.length; i++) {
			order_answers[i] = { ...order_answers[i], id: i };
		}
		original_order = [...order_answers];
		console.log(original_order);
		shuffleArray(order_answers);
	}

	let order_corrected = $state(false);
	const select_complex_answer = () => {
		/*		const correct_order_ids = []
                for (const e of original_order) {
                    correct_order_ids.push(e.id)
                }
                const user_set_ids = []
                for (const e of answer) {
                    correct_order_ids.push(e.id)
                }*/
		question.answers = original_order;
		order_corrected = true;
		timer_res = '0';
	};

	let circular_progress = $derived.by(() => {
		const total = parseInt(question.time);
		const left = parseInt(timer_res);
		return total > 0 && !isNaN(left) ? 1 - left / total : 0;
	});
</script>

<section
	class="tq-panel tq-panel-body practice-question"
	data-ui="practice-question"
	in:fly|global={{ x: 100 }}
	out:fly|global={{ x: -100 }}
>
	<header class="practice-head">
		<h1 class="practice-title">{@html question.question}</h1>
		<CircularTimer text={timer_res} progress={circular_progress} size={64} />
	</header>
	{#if question.image !== null}
		<div class="practice-media">
			<MediaComponent
				src={question.image}
				css_classes="max-h-[40vh] object-contain mx-auto w-auto rounded-lg"
			/>
		</div>
	{/if}

	{#if question.type === QuizQuestionType.ABCD}
		<div class="practice-answers">
			{#each choices as answer, i}
				{#if show_results}
					<AnswerTile
						index={i}
						label={answer.answer}
						color={answer.color}
						selected={i === selected_answer}
						status={answer.right ? 'correct' : 'incorrect'}
					/>
				{:else}
					<AnswerTile
						index={i}
						label={answer.answer}
						color={answer.color}
						selected={i === selected_answer}
						disabled={selected_answer !== undefined || timer_res === '0'}
						onclick={() => {
							selected_answer = i;
							timer_res = '0';
						}}
					/>
				{/if}
			{/each}
		</div>
		{#if !show_results && timer_res === '0'}
			<button
				class="tq-button tq-button-primary practice-action"
				type="button"
				onclick={() => {
					show_results = true;
				}}
			>
				{$t('admin_page.get_results')}
			</button>
		{/if}
	{:else if question.type === QuizQuestionType.RANGE}
		{#if timer_res === '0'}
			{#await import('svelte-range-slider-pips')}
				<Spinner />
			{:then c}
				<div class="grayscale pointer-events-none w-full practice-slider">
					<c.default
						bind:values={slider_values}
						min={range().min}
						max={range().max}
						pips
						float
						all="label"
						pipstep={rangePipStep(range().min, range().max)}
					/>
				</div>
			{/await}
		{:else}
			{#await import('svelte-range-slider-pips')}
				<Spinner />
			{:then c}
				<div
					class:pointer-events-none={selected_answer !== undefined}
					class="practice-slider"
				>
					<c.default
						bind:values={slider_value}
						min={range().min}
						max={range().max}
						pips
						float
						all="label"
						pipstep={rangePipStep(range().min, range().max)}
					/>
				</div>
				<button
					type="button"
					class="tq-button tq-button-primary practice-action"
					disabled={selected_answer !== undefined}
					onclick={() => {
						selected_answer = slider_value[0];
						timer_res = '0';
					}}
				>
					{$t('words.submit')}
				</button>
			{/await}
		{/if}
	{:else if question.type === QuizQuestionType.VOTING}
		<div class="practice-answers">
			{#each choices as answer, i}
				<AnswerTile
					index={i}
					label={answer.answer}
					color={answer.color}
					selected={i === selected_answer}
					disabled={selected_answer !== undefined || timer_res === '0'}
					onclick={() => {
						selected_answer = i;
						timer_res = '0';
					}}
				/>
			{/each}
		</div>
		{#if timer_res === '0'}
			<p class="tq-muted" role="status">
				{$t('telekom.answer_recorded', { defaultValue: 'Answer recorded' })}
			</p>
		{/if}
	{:else if question.type === QuizQuestionType.SLIDE}
		{#await import('$lib/play/admin/slide.svelte')}
			<Spinner my_20={false} />
		{:then c}
			<div class="max-h-[90%] max-w-[90%]">
				<c.default {question} />
			</div>
		{/await}
	{:else if question.type === QuizQuestionType.TEXT}
		{#if timer_res === '0'}
			<div class="practice-answers">
				{#each choices as answer}
					<AnswerTile label={answer.answer} color={answer.color} />
				{/each}
			</div>
		{:else}
			<div class="tq-field-group">
				<label class="tq-label" for="practice-text-answer">
					{$t('telekom.your_answer', { defaultValue: 'Your answer' })}
				</label>
				<input
					id="practice-text-answer"
					type="text"
					class="tq-field practice-text"
					bind:value={text_input}
					autocomplete="off"
				/>
			</div>
			<button
				type="button"
				disabled={!text_input}
				class="tq-button tq-button-primary practice-action"
				onclick={() => {
					selected_answer = text_input;
					timer_res = '0';
				}}
			>
				{$t('words.submit')}
			</button>
		{/if}
	{:else if question.type === QuizQuestionType.ORDER}
		<OrderList bind:answers={question.answers} disabled={order_corrected} />
		<button
			class="tq-button tq-button-primary practice-action"
			type="button"
			disabled={timer_res === '0'}
			onclick={() => {
				select_complex_answer();
			}}
		>
			{$t('words.submit')}
		</button>
	{:else if question.type === QuizQuestionType.CHECK}
		<p class="tq-muted practice-hint">
			{$t('telekom.select_all_that_apply', { defaultValue: 'Select all that apply' })}
		</p>
		<div class="practice-answers">
			{#each choices as answer, i}
				{#if show_results}
					<AnswerTile
						index={i}
						label={answer.answer}
						color={answer.color}
						selected={check_choice_selected[i]}
						status={answer.right ? 'correct' : 'incorrect'}
					/>
				{:else}
					<AnswerTile
						index={i}
						label={answer.answer}
						color={answer.color}
						selected={check_choice_selected[i]}
						disabled={selected_answer !== undefined || timer_res === '0'}
						onclick={() => {
							check_choice_selected[i] = !check_choice_selected[i];
						}}
					/>
				{/if}
			{/each}
		</div>
		{#if !show_results}
			<div class="tq-toolbar">
				<button
					type="button"
					class="tq-button tq-button-primary practice-action"
					disabled={timer_res === '0'}
					onclick={() => {
						timer_res = '0';
					}}
				>
					{$t('words.submit')}
				</button>
				{#if timer_res === '0'}
					<button
						type="button"
						class="tq-button practice-action"
						onclick={() => {
							show_results = true;
						}}
					>
						{$t('admin_page.get_results')}
					</button>
				{/if}
			</div>
		{/if}
	{/if}
</section>

<style>
	.practice-question {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.practice-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.practice-title {
		min-width: 0;
		font-size: clamp(22px, 4vw, 32px);
		font-weight: 700;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}

	.practice-title :global(p) {
		margin: 0;
	}

	.practice-media {
		display: flex;
		justify-content: center;
	}

	.practice-answers {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.practice-hint {
		margin: 0;
		font-size: 14px;
	}

	.practice-slider {
		padding-block: 40px 16px;
		padding-inline: 8px;
	}

	.practice-text {
		min-height: 56px;
		font-size: 20px;
	}

	.practice-action {
		align-self: flex-start;
		min-width: 160px;
	}

	@media (max-width: 600px) {
		.practice-action {
			align-self: stretch;
		}
	}
</style>
