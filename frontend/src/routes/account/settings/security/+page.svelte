<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import Spinner from '$lib/Spinner.svelte';
	import { browser } from '$app/environment';
	import { startRegistration } from '@simplewebauthn/browser';
	import TotpSetup from './totp_setup.svelte';
	import BackupCodes from './backup_codes.svelte';
	import Footer from '$lib/footer.svelte';
	import SettingsNav from '../../SettingsNav.svelte';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	let user_data: any = $state();
	let security_keys: Array<{ id: number }> | undefined = $state();
	let totp_activated: boolean | undefined = $state();
	let totp_data: { url: string; secret: string } | undefined = $state();
	let backup_code = $state();

	const get_data = async () => {
		const res1 = await fetch('/api/v1/users/me');
		user_data = await res1.json();
		const res2 = await fetch('/api/v1/users/webauthn/list');
		security_keys = await res2.json();
		const res3 = await fetch('/api/v1/users/2fa/totp');
		totp_activated = (await res3.json()).activated;
	};
	let data = $state(get_data());

	const save_password_required = async () => {
		console.log(user_data?.require_password, 'here');
		if (!browser || user_data?.require_password === undefined) {
			return;
		}
		const pw = require_password();
		const res = await fetch('/api/v1/users/2fa/require_password', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ require_password: user_data?.require_password, password: pw })
		});
		user_data.require_password = (await res.json()).require_password;
	};

	const require_password = (): string | null => {
		return prompt('Please enter your password to continue');
	};

	const add_security_key = async () => {
		const pw = require_password();
		if (!pw) return;
		const res1 = await fetch('/api/v1/users/webauthn/add_key_init', {
			method: 'POST',
			body: JSON.stringify({ password: pw }),
			headers: { 'Content-Type': 'application/json' }
		});
		if (res1.status === 401) {
			alert('Password probably wrong');
			return;
		}
		if (!res1.ok) {
			throw Error('Response not ok');
		}
		let attResp;
		const resp_data = await res1.json();
		// eslint-disable-next-line no-useless-catch
		try {
			resp_data.authenticatorSelection.authenticatorAttachment = 'cross-platform';
			for (let i = 0; i++; i < resp_data.excludeCredentials.length) {
				resp_data.excludeCredentials[i].transports = undefined;
			}
			attResp = await startRegistration({ optionsJSON: resp_data });
		} catch (e) {
			throw e;
		}
		await fetch('/api/v1/users/webauthn/add_key', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(attResp)
		});
		data = get_data();
	};

	const remove_security_key = async (key_id: number) => {
		const pw = require_password();
		if (!pw) return;
		const res = await fetch(`/api/v1/users/webauthn/key/${key_id}`, {
			method: 'DELETE',
			body: JSON.stringify({ password: pw }),
			headers: { 'Content-Type': 'application/json' }
		});
		if (res.status === 401) {
			alert('Password probably wrong');
			return;
		}
		data = get_data();
	};

	const disable_totp = async () => {
		const pw = require_password();
		if (!pw) return;
		const res = await fetch(`/api/v1/users/2fa/totp`, {
			method: 'DELETE',
			body: JSON.stringify({ password: pw }),
			headers: { 'Content-Type': 'application/json' }
		});
		if (res.status === 401) {
			alert('Password probably wrong');
			return;
		}
		data = get_data();
	};

	const enable_totp = async () => {
		const pw = require_password();
		if (!pw) return;
		const res = await fetch('/api/v1/users/2fa/totp', {
			method: 'POST',
			body: JSON.stringify({ password: pw }),
			headers: { 'Content-Type': 'application/json' }
		});
		if (res.status === 401) {
			alert('Password probably wrong');
			return;
		}
		data = get_data();
		totp_data = await res.json();
	};

	const get_backup_code = async () => {
		const pw = require_password();
		if (!pw) return;
		if (!confirm('If you continue, your old backup-code will be removed.')) {
			return;
		}
		const res = await fetch('/api/v1/users/2fa/backup_code', {
			method: 'POST',
			body: JSON.stringify({ password: pw }),
			headers: { 'Content-Type': 'application/json' }
		});
		if (res.status === 401) {
			alert('Password probably wrong');
			return;
		}
		backup_code = (await res.json()).code;
	};
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('settings_page.security_settings')}</title>
</svelte:head>

<main class="tq-page settings-page tq-stack" data-ui="account-security">
	<h1 class="tq-page-title">{$t('settings_page.security_settings')}</h1>
	<SettingsNav current="security" />

	{#await data}
		<Spinner my_20={false} />
	{:then _}
		<div class="security-grid">
			<section
				class="tq-panel tq-panel-body security-card"
				aria-labelledby="totp-title"
				data-ui="security-totp"
			>
				<h2 class="tq-section-title" id="totp-title">{$t('security_settings.totp')}</h2>
				<p class="tq-muted">
					{$t(
						totp_activated
							? 'security_settings.totp_available'
							: 'security_settings.totp_unavailable'
					)}
				</p>
				<div class="card-actions">
					{#if totp_activated}
						<button
							type="button"
							class="tq-button tq-button-danger"
							onclick={disable_totp}
						>
							{$t('security_settings.disable_totp')}
						</button>
					{:else}
						<button type="button" class="tq-button" onclick={enable_totp}>
							{$t('security_settings.enable_totp')}
						</button>
					{/if}
				</div>
			</section>

			<section
				class="tq-panel tq-panel-body security-card"
				aria-labelledby="2fa-title"
				data-ui="security-2fa"
			>
				<h2 class="tq-section-title" id="2fa-title">
					{$t('security_settings.activate_2fa')}
				</h2>
				<label class="switch-row">
					<input
						type="checkbox"
						disabled={!totp_activated}
						checked={user_data.require_password}
						onchange={() => {
							user_data.require_password = !user_data.require_password;
							save_password_required();
						}}
					/>
					<span>
						{$t(
							user_data.require_password
								? 'security_settings.2fa_activated'
								: 'security_settings.2fa_deactivated'
						)}
					</span>
				</label>
			</section>

			<section
				class="tq-panel tq-panel-body security-card"
				aria-labelledby="webauthn-title"
				data-ui="security-webauthn"
			>
				<h2 class="tq-section-title" id="webauthn-title">
					{$t('security_settings.webauthn')}
				</h2>
				<p class="tq-muted">
					{$t(
						security_keys.length
							? 'security_settings.webauthn_available'
							: 'security_settings.webauthn_unavailable'
					)}
				</p>
				{#if security_keys.length}
					<ul class="key-list">
						{#each security_keys as key, i}
							<li class="key-row">
								<span>{$t('security_settings.webauthn')} {i + 1}</span>
								<button
									type="button"
									class="tq-button tq-button-danger"
									onclick={() => remove_security_key(key.id)}
								>
									{$t('words.delete')}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				<div class="card-actions">
					<button
						type="button"
						class="tq-button"
						data-ui="add-security-key"
						onclick={add_security_key}
					>
						{$t('security_settings.add_security_key')}
					</button>
				</div>
			</section>

			<section
				class="tq-panel tq-panel-body security-card"
				aria-labelledby="backup-title"
				data-ui="security-backup"
			>
				<h2 class="tq-section-title" id="backup-title">
					{$t('security_settings.backup_code')}
				</h2>
				<div class="card-actions">
					<button
						type="button"
						class="tq-button"
						data-ui="get-backup-code"
						onclick={get_backup_code}
					>
						{$t('security_settings.get_backup_code')}
					</button>
				</div>
			</section>
		</div>
	{/await}
</main>
<Footer />

{#if totp_data}
	<TotpSetup bind:totp_data />
{/if}
{#if backup_code}
	<BackupCodes bind:backup_code />
{/if}

<style>
	.settings-page {
		max-width: 960px;
	}
	.security-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		align-items: start;
	}
	.security-card {
		display: grid;
		gap: 16px;
	}
	.security-card p {
		margin: 0;
	}
	.switch-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
	}
	.card-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}
	.key-list {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.key-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	@media (max-width: 767px) {
		.security-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
