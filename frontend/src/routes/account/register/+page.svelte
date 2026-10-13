<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { createForm } from 'felte';
	import { getLocalization } from '$lib/i18n';
	import { validateSchema } from '@felte/validator-yup';
	import { navbarVisible } from '$lib/stores.svelte.ts';
	import Footer from '$lib/footer.svelte';
	import AuthCard from '../AuthCard.svelte';
	import Spinner from '$lib/Spinner.svelte';

	const { t } = getLocalization();

	navbarVisible.visible = true;
	import * as yup from 'yup';

	const registerSchema = yup.object({
		email: yup.string().email('Email must be valid!').required(),
		password1: yup
			.string()
			.required()
			.min(8, 'Password must be at least 8 characters long!')
			.max(100, 'Password must be at most 100 characters long!'),
		password2: yup
			.string()
			.required()
			.test('equal', 'Passwords do not match!', function (v) {
				const ref = yup.ref('password1');
				return v === this.resolve(ref);
			}),
		username: yup
			.string()
			.required()
			.min(3, 'Username must be at least 3 characters long')
			.max(20, 'Username must be at most 20 characters long'),
		privacy_accept: yup
			.boolean()
			.oneOf([true], 'You must accept the privacy policy to register!'),
		tos_accept: yup.boolean().oneOf([true], 'You must accept the terms of service to register!')
	});

	const { form, errors, isValid, isSubmitting } = createForm<
		yup.InferType<typeof registerSchema>
	>({
		validate: validateSchema(registerSchema),
		onSubmit: async (values) => {
			const res = await fetch('/api/v1/users/create', {
				method: 'post',
				body: JSON.stringify({
					email: values.email,
					password: values.password1,
					username: values.username
				}),
				headers: {
					'Content-Type': 'application/json'
				}
			});
			if (res.status === 200) {
				responseData.data = '200';
			} else if (res.status === 409) {
				responseData.data = '409';
			} else if (res.status === 400) {
				responseData.data = '400';
			} else {
				responseData.data = 'error';
			}
			responseData.open = true;
		}
	});
	let responseData = $state({
		open: false,
		data: ''
	});

	const focus_on_mount = (node: HTMLElement) => {
		node.focus();
	};
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('words.register')}</title>
</svelte:head>

<AuthCard title={$t('register_page.create_account')} data_ui="register">
	<form class="form" use:form>
		<div class="tq-field-group">
			<label class="tq-label" for="email">{$t('words.email')}</label>
			<input
				id="email"
				name="email"
				type="email"
				class="tq-field"
				autocomplete="email"
				aria-invalid={$errors.email ? 'true' : undefined}
				aria-describedby={$errors.email ? 'email-error' : undefined}
			/>
			{#if $errors.email}
				<p class="tq-field-error" id="email-error">{$errors.email[0]}</p>
			{/if}
		</div>
		<div class="tq-field-group">
			<label class="tq-label" for="username">{$t('words.username')}</label>
			<input
				id="username"
				name="username"
				type="text"
				class="tq-field"
				autocomplete="username"
				aria-invalid={$errors.username ? 'true' : undefined}
				aria-describedby={$errors.username ? 'username-error' : undefined}
			/>
			{#if $errors.username}
				<p class="tq-field-error" id="username-error">{$errors.username[0]}</p>
			{/if}
		</div>
		<div class="tq-field-group">
			<label class="tq-label" for="password1">{$t('words.password')}</label>
			<input
				id="password1"
				name="password1"
				type="password"
				class="tq-field"
				autocomplete="new-password"
				aria-invalid={$errors.password1 ? 'true' : undefined}
				aria-describedby={$errors.password1 ? 'password1-error' : undefined}
			/>
			{#if $errors.password1}
				<p class="tq-field-error" id="password1-error">{$errors.password1[0]}</p>
			{/if}
		</div>
		<div class="tq-field-group">
			<label class="tq-label" for="password2">{$t('words.repeat_password')}</label>
			<input
				id="password2"
				name="password2"
				type="password"
				class="tq-field"
				autocomplete="new-password"
				aria-invalid={$errors.password2 ? 'true' : undefined}
				aria-describedby={$errors.password2 ? 'password2-error' : undefined}
			/>
			{#if $errors.password2}
				<p class="tq-field-error" id="password2-error">{$errors.password2[0]}</p>
			{/if}
		</div>

		<div class="tq-field-group">
			<label class="check-row">
				<input
					type="checkbox"
					name="privacy_accept"
					aria-invalid={$errors.privacy_accept ? 'true' : undefined}
					aria-describedby={$errors.privacy_accept ? 'privacy-error' : undefined}
				/>
				<span>
					{@html $t('telekom.accept_privacy', {
						defaultValue: 'I have read the {{link}}.',
						link: `<a class="tq-link" href="/docs/privacy-policy">${$t('telekom.privacy_policy', { defaultValue: 'Privacy policy' })}</a>`
					})}
				</span>
			</label>
			{#if $errors.privacy_accept}
				<p class="tq-field-error" id="privacy-error">{$errors.privacy_accept[0]}</p>
			{/if}
		</div>
		<div class="tq-field-group">
			<label class="check-row">
				<input
					type="checkbox"
					name="tos_accept"
					aria-invalid={$errors.tos_accept ? 'true' : undefined}
					aria-describedby={$errors.tos_accept ? 'tos-error' : undefined}
				/>
				<span>
					{@html $t('telekom.accept_tos', {
						defaultValue: 'I agree to the {{link}}.',
						link: `<a class="tq-link" href="/docs/tos">${$t('telekom.terms_of_service', { defaultValue: 'Terms of Service' })}</a>`
					})}
				</span>
			</label>
			{#if $errors.tos_accept}
				<p class="tq-field-error" id="tos-error">{$errors.tos_accept[0]}</p>
			{/if}
		</div>

		<button
			class="tq-button tq-button-primary"
			disabled={!$isValid || $isSubmitting}
			type="submit"
		>
			{#if $isSubmitting}
				<Spinner my_20={false} />
			{:else}
				{$t('words.register')}
			{/if}
		</button>
		<a class="tq-link text-sm" href="/account/reset-password">
			{$t('register_page.forgot_password?')}
		</a>
	</form>
	{#snippet below()}
		<span class="tq-muted">{$t('register_page.already_have_account?')}</span>
		<a class="tq-link" href="/account/login">{$t('words.login')}</a>
	{/snippet}
</AuthCard>
<Footer />

{#if responseData.open}
	<div class="tq-overlay" role="presentation">
		<div
			class="tq-dialog dialog"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="register-result-title"
			aria-describedby="register-result-text"
			data-ui="register-result"
			tabindex="-1"
			use:focus_on_mount
		>
			<h2
				class="tq-section-title"
				class:result-error={responseData.data !== '200'}
				id="register-result-title"
			>
				{#if responseData.data === '409'}
					{$t('telekom.account_exists', { defaultValue: 'Account already exists' })}
				{:else if responseData.data === '200'}
					{$t('telekom.account_created', { defaultValue: 'Account created' })}
				{:else if responseData.data === '400'}
					{$t('telekom.invalid_email', { defaultValue: 'Invalid email address' })}
				{:else}
					{$t('login_page.modal.error.unexpected')}
				{/if}
			</h2>
			<p id="register-result-text">
				{#if responseData.data === '200'}
					{$t('telekom.account_created_text', {
						defaultValue:
							'You signed up successfully. Please check your mailbox to confirm your email address.'
					})}
				{:else if responseData.data === '409'}
					{$t('telekom.account_exists_text', {
						defaultValue: 'An account with that email address already exists.'
					})}
				{:else if responseData.data === '400'}
					{$t('telekom.invalid_email_text', {
						defaultValue: 'This email address does not exist.'
					})}
				{:else}
					{$t('telekom.unexpected_error', {
						defaultValue: 'An unexpected error occurred.'
					})}
				{/if}
			</p>
			<div class="dialog-actions">
				<button
					type="button"
					class="tq-button tq-button-primary"
					onclick={() => {
						responseData.open = false;
						if (responseData.data === '200') {
							window.location.assign('/');
						} else {
							window.location.reload();
						}
					}}
				>
					{$t('words.close')}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.form {
		display: grid;
		gap: 20px;
	}
	.check-row {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		font-size: 14px;
	}
	.check-row input {
		flex-shrink: 0;
		margin-top: 2px;
	}
	.dialog {
		display: grid;
		gap: 16px;
	}
	.dialog:focus-visible {
		outline: none;
	}
	.dialog-actions {
		display: flex;
		justify-content: flex-end;
	}
	.result-error {
		color: var(--tq-danger);
	}
</style>
