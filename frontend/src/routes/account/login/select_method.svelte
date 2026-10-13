<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->
<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import AuthCard from '../AuthCard.svelte';

	let { session_data = {}, step, selected_method = $bindable() } = $props();
	const { t } = getLocalization();

	const set_available_methods = (step_var: number): string => {
		if (step_var === 1) {
			return session_data.step_1;
		} else if (step_var === 2) {
			return session_data.step_2;
		}
	};
	let available_methods = $derived(set_available_methods(step));
</script>

<AuthCard
	title={$t('words.login')}
	subtitle={$t('telekom.choose_sign_in_method', {
		defaultValue: 'Choose how you want to sign in.'
	})}
	data_ui="login-select-method"
>
	<ul class="methods">
		{#if available_methods.includes('PASSKEY')}
			<li>
				<button
					type="button"
					class="method"
					data-ui="login-method-passkey"
					onclick={() => {
						selected_method = 'PASSKEY';
					}}
				>
					<!-- heroicons/key -->
					<svg
						aria-hidden="true"
						class="method-icon"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
						/>
					</svg>
					<span>
						<strong
							>{$t('telekom.security_key', { defaultValue: 'Security key' })}</strong
						>
						<span class="tq-muted method-description">
							{$t('telekom.security_key_description', {
								defaultValue: 'Authenticate using a security key'
							})}
						</span>
					</span>
				</button>
			</li>
		{/if}
		{#if available_methods.includes('PASSWORD')}
			<li>
				<button
					type="button"
					class="method"
					data-ui="login-method-password"
					onclick={() => {
						selected_method = 'PASSWORD';
					}}
				>
					<!-- iconoir/password-cursor -->
					<svg
						aria-hidden="true"
						class="method-icon"
						stroke-width="2"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M21 13V8a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h7"
							stroke="currentColor"
							stroke-width="2.03"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
						<path
							clip-rule="evenodd"
							d="M20.879 16.917c.494.304.463 1.043-.045 1.101l-2.567.291-1.151 2.312c-.228.459-.933.234-1.05-.334l-1.255-6.116c-.099-.48.333-.782.75-.525l5.318 3.271z"
							stroke="currentColor"
							stroke-width="2.03"
						/>
						<path
							d="M12 11.01l.01-.011M16 11.01l.01-.011M8 11.01l.01-.011"
							stroke="currentColor"
							stroke-width="2.03"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					<span>
						<strong>{$t('words.password')}</strong>
						<span class="tq-muted method-description">
							{$t('telekom.password_description', {
								defaultValue: 'Authenticate using a password'
							})}
						</span>
					</span>
				</button>
			</li>
		{/if}
		{#if available_methods.includes('TOTP')}
			<li>
				<button
					type="button"
					class="method"
					data-ui="login-method-totp"
					onclick={() => {
						selected_method = 'TOTP';
					}}
				>
					<!-- heroicons/clock -->
					<svg
						aria-hidden="true"
						class="method-icon"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span>
						<strong>{$t('security_settings.totp')}</strong>
						<span class="tq-muted method-description">
							{$t('telekom.totp_description', {
								defaultValue: 'Authenticate using a one-time password'
							})}
						</span>
					</span>
				</button>
			</li>
		{/if}
	</ul>
</AuthCard>

<style>
	.methods {
		display: grid;
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.method {
		display: flex;
		align-items: center;
		gap: 16px;
		width: 100%;
		min-height: 72px;
		padding: 12px 16px;
		border: 1px solid var(--tq-border-strong);
		border-radius: 12px;
		background: var(--tq-surface);
		color: var(--tq-text);
		text-align: start;
		transition:
			background-color 120ms,
			border-color 120ms;
	}
	.method:hover {
		border-color: var(--tq-accent);
		background: var(--tq-surface-subtle);
	}
	.method-icon {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		color: var(--tq-accent);
	}
	.method-description {
		display: block;
		font-size: 14px;
	}
</style>
