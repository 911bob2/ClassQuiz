<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	let { data = $bindable() } = $props();

	const { t } = getLocalization();

	let question_count = $derived(data.questions?.length ?? 0);
</script>

<section class="tq-panel tq-panel-body tq-stack" data-ui="practice-title">
	<div>
		<span class="tq-badge">{$t('words.practice')}</span>
		<h1 class="tq-page-title practice-quiz-title">{@html data.title}</h1>
	</div>
	{#if data.description}
		<div class="tq-prose">{@html data.description}</div>
	{/if}
	{#if data.cover_image}
		<img
			src="/api/v1/storage/download/{data.cover_image}"
			alt={$t('telekom.cover_image', { defaultValue: 'Cover image' })}
			class="practice-cover"
		/>
	{/if}
	<p class="tq-muted">
		{question_count}
		{question_count === 1 ? $t('words.question') : $t('words.question_plural')}
	</p>
</section>

<style>
	.practice-quiz-title {
		margin-block-start: 12px;
	}

	.practice-cover {
		display: block;
		max-height: 288px;
		width: auto;
		margin-inline: auto;
		border-radius: 8px;
		object-fit: contain;
	}
</style>
