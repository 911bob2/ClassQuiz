<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import Icon from '$lib/editor/Icon.svelte';

	const { t } = getLocalization();

	interface Props {
		checked?: boolean;
	}

	let { checked = $bindable(false) }: Props = $props();
</script>

<!--
	Correctness is shown with an icon and a word, not just a colour. The checkbox keeps a fixed
	accessible name so screen readers announce "Correct answer, checked / not checked".
-->
<label class="correctness" class:correct={checked} data-ui="answer-correct">
	<input
		type="checkbox"
		class="sr-only"
		bind:checked
		aria-label={$t('telekom.correct_answer', { defaultValue: 'Correct answer' })}
	/>
	<Icon name={checked ? 'check-circle' : 'x-circle'} />
	<span>
		{checked ? $t('words.correct') : $t('telekom.incorrect', { defaultValue: 'Incorrect' })}
	</span>
</label>

<style>
	.correctness {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 8px 14px;
		border: 1px solid var(--tq-border-strong);
		border-radius: 8px;
		background: var(--tq-surface);
		font-weight: 700;
		cursor: pointer;
	}
	.correctness :global(svg) {
		color: var(--tq-danger);
	}
	.correctness.correct {
		border-color: var(--tq-success);
		background: var(--tq-success-soft);
		color: var(--tq-success);
	}
	.correctness.correct :global(svg) {
		color: var(--tq-success);
	}
	.correctness:has(input:focus-visible) {
		outline: 3px solid var(--tq-accent);
		outline-offset: 3px;
	}
</style>
