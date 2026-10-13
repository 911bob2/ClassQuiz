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
	<section class="tq-panel tq-panel-body tq-stack stack-4" role="alert" data-ui="error-page">
		<span class="tq-badge self-start">{status}</span>
		<h1 class="tq-page-title">
			{status === 404
				? $t('telekom.not_found', { defaultValue: 'Page not found' })
				: $t('words.error')}
		</h1>
		<p class="tq-muted">
			{#if status === 404}
				{$t('telekom.not_found_text', {
					defaultValue: 'The page you requested does not exist or has been moved.'
				})}
			{:else}
				{page.error?.message ??
					$t('telekom.unexpected_error', {
						defaultValue: 'An unexpected error occurred.'
					})}
			{/if}
		</p>
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
	.stack-4 {
		gap: 16px;
	}
</style>
