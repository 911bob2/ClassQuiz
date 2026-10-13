<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import Footer from '$lib/footer.svelte';
	import Spinner from '$lib/Spinner.svelte';
	import AuthCard from '../AuthCard.svelte';

	const { t } = getLocalization();
	let { data } = $props();
	let { token }: { token: string } = data;
	let isSubmitting = $state(false);
	interface PasswordData {
		password1: string;
		password2: string;
	}
	let passwordData: PasswordData = $state({
		password1: '',
		password2: ''
	});
	let passwordsValid = $derived(
		passwordData.password1 === passwordData.password2 && passwordData.password1.length >= 8
	);

	const submit = async (e: Event) => {
		e.preventDefault();
		if (!passwordsValid) {
			return;
		}
		isSubmitting = true;
		const response = await fetch('/api/v1/users/reset-password', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				password: passwordData.password1,
				token
			})
		});
		const data = await response.json();
		if (response.status === 200) {
			window.location.assign('/account/login');
		} else {
			alert(data.detail);
		}
		isSubmitting = false;
	};
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('password_reset_page.reset_password')}</title>
</svelte:head>

<AuthCard title={$t('password_reset_page.reset_password')} data_ui="password-reset">
	<form class="form" onsubmit={submit}>
		<div class="tq-field-group">
			<label class="tq-label" for="password1">{$t('settings_page.new_password')}</label>
			<input
				id="password1"
				bind:value={passwordData.password1}
				name="password1"
				type="password"
				class="tq-field"
				autocomplete="new-password"
				aria-invalid={passwordData.password1 !== '' && passwordData.password1.length < 8
					? 'true'
					: undefined}
			/>
			{#if passwordData.password1 !== '' && passwordData.password1.length < 8}
				<p class="tq-field-error">
					{$t('telekom.password_too_short', {
						defaultValue: 'Password must be at least 8 characters long.'
					})}
				</p>
			{/if}
		</div>
		<div class="tq-field-group">
			<label class="tq-label" for="password2">{$t('words.repeat_password')}</label>
			<input
				id="password2"
				name="password2"
				type="password"
				bind:value={passwordData.password2}
				class="tq-field"
				autocomplete="new-password"
				aria-invalid={passwordData.password2 !== '' &&
				passwordData.password1 !== passwordData.password2
					? 'true'
					: undefined}
			/>
			{#if passwordData.password2 !== '' && passwordData.password1 !== passwordData.password2}
				<p class="tq-field-error">
					{$t('telekom.passwords_mismatch', { defaultValue: 'Passwords do not match.' })}
				</p>
			{/if}
		</div>
		<button class="tq-button tq-button-primary" disabled={!passwordsValid} type="submit">
			{#if isSubmitting}
				<Spinner my_20={false} />
			{:else}
				{$t('words.submit')}
			{/if}
		</button>
		<a class="tq-link text-sm" href="/account/login">
			{$t('register_page.already_have_account?')}
		</a>
	</form>
	{#snippet below()}
		<span class="tq-muted">{$t('login_page.already_have_account')}</span>
		<a class="tq-link" href="/account/register">{$t('words.register')}</a>
	{/snippet}
</AuthCard>
<Footer />

<style>
	.form {
		display: grid;
		gap: 20px;
	}
</style>
