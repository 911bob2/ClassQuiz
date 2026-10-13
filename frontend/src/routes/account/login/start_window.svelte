<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import AuthCard from '../AuthCard.svelte';
	import OAuthBlock from './oauth_block.svelte';

	let { session_data = $bindable({}), step = $bindable() } = $props();

	const { t } = getLocalization();
	let email = $state('');
	let emailEmpty = $derived(email === '');
	let isSubmitting = $state(false);

	const start_login = async (e: Event): Promise<void> => {
		e.preventDefault();
		if (emailEmpty) {
			return;
		}
		isSubmitting = true;

		const res = await fetch('/api/v1/login/start', {
			method: 'post',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ email: email })
		});
		session_data = await res.json();
		step = 1;
	};
</script>

<AuthCard title={$t('words.login')} data_ui="login-start">
	<form class="form" onsubmit={start_login}>
		<div class="tq-field-group">
			<label class="tq-label" for="email">{$t('login_page.email_or_username')}</label>
			<input
				data-ui="login-email"
				id="email"
				name="email"
				type="text"
				class="tq-field"
				autocomplete="username"
				bind:value={email}
				required
			/>
		</div>
		<button
			class="tq-button tq-button-primary"
			disabled={emailEmpty || isSubmitting}
			type="submit"
		>
			{$t('words.continue')}
		</button>
		<a class="tq-link text-sm" href="/account/reset-password">
			{$t('register_page.forgot_password?')}
		</a>
	</form>
	<OAuthBlock />
	{#snippet below()}
		<span class="tq-muted">{$t('login_page.already_have_account')}</span>
		<a class="tq-link" href="/account/register">{$t('register_page.create_account')}</a>
	{/snippet}
</AuthCard>

<style>
	.form {
		display: grid;
		gap: 20px;
	}
</style>
