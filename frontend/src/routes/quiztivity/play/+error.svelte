<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { navbarVisible } from '$lib/stores.svelte.ts';
	import { page } from '$app/state';
	import { getLocalization } from '$lib/i18n';
	import Footer from '$lib/footer.svelte';

	navbarVisible.visible = true;
	let status = page.status;
	const { t } = getLocalization();
</script>

<svelte:head>
	<title>{$t('words.error')} {status} · Telekom Quiz</title>
</svelte:head>

<main class="tq-page tq-page-narrow">
	<section class="tq-panel tq-panel-body tq-stack error-panel" role="alert" data-ui="error-page">
		<span class="tq-badge self-start">{status}</span>
		<h1 class="tq-page-title">
			{#if status === 404}
				{$t('telekom.activity_not_found', { defaultValue: 'Activity not found' })}
			{:else if status === 410}
				{$t('quiztivity.share_expired')}
			{:else}
				{$t('words.error')}
			{/if}
		</h1>
		{#if status !== 404 && status !== 410}
			<p class="tq-muted">
				{page.error?.message ??
					$t('telekom.unexpected_error', {
						defaultValue: 'An unexpected error occurred.'
					})}
			</p>
		{/if}
		<div class="tq-toolbar">
			<a class="tq-button tq-button-primary" href="/">
				{$t('telekom.home', { defaultValue: 'Home' })}
			</a>
			<a class="tq-button" href="/dashboard">
				{$t('telekom.library', { defaultValue: 'Quiz library' })}
			</a>
		</div>
	</section>
</main>
<Footer />

<style>
	.error-panel {
		gap: 16px;
	}
</style>
