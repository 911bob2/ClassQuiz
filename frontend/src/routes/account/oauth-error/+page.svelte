<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import Footer from '$lib/footer.svelte';
	import AuthCard from '../AuthCard.svelte';

	const { t } = getLocalization();
	let { data } = $props();
	const { error } = data;
</script>

<svelte:head>
	<title>
		Telekom Quiz · {$t('telekom.authentication_error', {
			defaultValue: 'Error authenticating'
		})}
	</title>
</svelte:head>

<AuthCard
	title={$t('telekom.authentication_error', { defaultValue: 'Error authenticating' })}
	data_ui="oauth-error"
>
	<p class="tq-alert tq-alert-error" role="alert">
		{#if error === 'email'}
			{$t('telekom.oauth_error_email', {
				defaultValue:
					'GitHub did not respond with an email address. Make sure your email address is verified.'
			})}
		{:else}
			{$t('telekom.oauth_error_generic', {
				defaultValue:
					'There was an error authenticating you. Make sure your account has a verified email address.'
			})}
		{/if}
	</p>
	<div>
		<a class="tq-button tq-button-primary" href="/account/login">
			{$t('telekom.back_to_login', { defaultValue: 'Back to login' })}
		</a>
	</div>
	<p class="tq-muted text-sm">
		{@html $t('telekom.report_issue', {
			defaultValue: 'If the error persists, please open an {{link}}.',
			link: `<a class="tq-link" href="https://github.com/mawoka-myblock/ClassQuiz/issues/new?assignees=&labels=&template=Bug_report.md">${$t('telekom.github_issue', { defaultValue: 'issue on GitHub' })}</a>`
		})}
	</p>
</AuthCard>
<Footer />
