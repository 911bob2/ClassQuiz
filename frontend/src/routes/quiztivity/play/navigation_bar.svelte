<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	interface Props {
		current_slide_index: number;
		question_count: number;
	}

	let { current_slide_index = $bindable(), question_count }: Props = $props();

	const { t } = getLocalization();
</script>

<nav class="tq-toolbar activity-nav" aria-label={$t('words.quiztivity')} data-ui="activity-nav">
	<button
		type="button"
		class="tq-button"
		data-ui="activity-previous"
		disabled={current_slide_index < 1}
		onclick={() => {
			current_slide_index -= 1;
		}}
	>
		{$t('words.back')}
	</button>
	<p class="activity-progress" aria-live="polite">
		{current_slide_index + 1} / {question_count}
	</p>
	<button
		type="button"
		class="tq-button tq-button-primary"
		data-ui="activity-next"
		disabled={current_slide_index >= question_count - 1}
		onclick={() => {
			current_slide_index += 1;
		}}
	>
		{$t('words.next')}
	</button>
</nav>

<style>
	.activity-nav {
		justify-content: space-between;
	}

	.activity-progress {
		flex: 1;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		text-align: center;
	}
</style>
