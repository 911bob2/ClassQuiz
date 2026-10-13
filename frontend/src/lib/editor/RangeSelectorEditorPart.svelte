<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { run } from 'svelte/legacy';

	import type { EditorData, RangeQuizAnswer } from '../quiz_types';
	import Spinner from '../Spinner.svelte';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		selected_question: number;
		data: EditorData;
	}

	let { selected_question, data = $bindable() }: Props = $props();

	let question = data.questions[selected_question];
	if (
		(question.answers as RangeQuizAnswer).max === undefined ||
		(question.answers as RangeQuizAnswer).min_correct === undefined
	) {
		question.answers = {
			max: 10,
			min: 0,
			max_correct: 7,
			min_correct: 3
		};
	}

	let answer = question.answers as RangeQuizAnswer;
	let range_arr = $state([answer.min_correct, answer.max_correct]);
	let range = $derived(data.questions[selected_question].answers as RangeQuizAnswer);
	run(() => {
		range.min_correct = range_arr[0];
	});
	run(() => {
		range.max_correct = range_arr[1];
	});
	run(() => {
		range.min = range.min === null ? 0 : range.min;
	});
	run(() => {
		range.max = range.max === null ? 0 : range.max;
	});

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
</script>

<div class="range-editor" data-ui="range-answers">
	<div class="range-fields">
		<label class="tq-field-group">
			<span class="tq-label">{$t('telekom.minimum', { defaultValue: 'Minimum' })}</span>
			<input type="number" class="tq-field" max={range.max - 2} bind:value={range.min} />
		</label>
		<label class="tq-field-group">
			<span class="tq-label">{$t('telekom.maximum', { defaultValue: 'Maximum' })}</span>
			<input type="number" class="tq-field" min={range.min + 2} bind:value={range.max} />
		</label>
	</div>

	<p class="range-summary">
		<span class="tq-label">
			{$t('telekom.correct_range', { defaultValue: 'Correct range' })}
		</span>
		<span class="range-values">{range_arr[0]} – {range_arr[1]}</span>
	</p>
	<div class="range-control">
		{#await import('svelte-range-slider-pips')}
			<Spinner my_20={false} />
		{:then c}
			{#await sleep(100)}
				<Spinner my_20={false} />
			{:then _}
				<c.default
					id="pips-slider"
					bind:values={range_arr}
					bind:min={range.min}
					bind:max={range.max}
					pips
					float
					all="label"
					range
				/>
			{/await}
		{/await}
	</div>
</div>

<style>
	.range-editor {
		max-width: 760px;
	}
	.range-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 200px));
		gap: 16px;
	}
	.range-summary {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin: 24px 0 0;
	}
	.range-summary .tq-label {
		margin: 0;
	}
	.range-values {
		color: var(--tq-accent);
		font-size: 20px;
		font-weight: 700;
	}
	.range-control {
		padding: 24px 12px 48px;
	}

	@media (max-width: 479px) {
		.range-fields {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
