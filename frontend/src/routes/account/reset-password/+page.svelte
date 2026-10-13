<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import { navbarVisible } from '$lib/stores.svelte.ts';
	import Footer from '$lib/footer.svelte';
	import Spinner from '$lib/Spinner.svelte';
	import AuthCard from '../AuthCard.svelte';

	navbarVisible.visible = true;

	const { t } = getLocalization();

	let isSubmitting = $state(false);

	const submit = async (e: Event) => {
		e.preventDefault();
		isSubmitting = true;
		const res = await fetch('/api/v1/users/forgot-password', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email: email
			})
		});
		if (res.status === 200) {
			alert('Email was sent! Please check your inbox.');
			return;
		} else if (res.status === 404) {
			alert('user not found!');
		}
		isSubmitting = false;
	};

	let email = $state('');
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('password_reset_page.reset_password')}</title>
</svelte:head>

<AuthCard
	title={$t('password_reset_page.reset_password')}
	subtitle={$t('telekom.reset_password_hint', {
		defaultValue: 'Enter your email address to receive a link for choosing a new password.'
	})}
	data_ui="reset-password"
>
	<form class="form" onsubmit={submit}>
		<div class="tq-field-group">
			<label class="tq-label" for="email">{$t('words.email')}</label>
			<input
				id="email"
				bind:value={email}
				name="email"
				type="email"
				class="tq-field"
				autocomplete="email"
			/>
		</div>
		<button class="tq-button tq-button-primary" disabled={email === ''} type="submit">
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
