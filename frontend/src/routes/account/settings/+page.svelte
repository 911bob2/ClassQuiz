<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import { DateTime } from 'luxon';
	import { UAParser } from 'ua-parser-js';
	import Spinner from '$lib/Spinner.svelte';
	import { onMount } from 'svelte';
	import Footer from '$lib/footer.svelte';
	import SettingsNav from '../SettingsNav.svelte';

	const { t } = getLocalization();

	interface UserAccount {
		id: string;
		email: string;
		username: string;
		verified: boolean;
		created_at: string;
	}

	interface ChangePasswordData {
		oldPassword: string;
		newPassword: string;
		newPasswordConfirm: string;
	}

	let changePasswordData: ChangePasswordData = $state({
		oldPassword: '',
		newPassword: '',
		newPasswordConfirm: ''
	});

	let this_session: any = $state();

	let passwordChangeDataValid = $derived(
		changePasswordData.newPassword === changePasswordData.newPasswordConfirm &&
			changePasswordData.newPassword.length >= 8 &&
			changePasswordData.oldPassword !== changePasswordData.newPassword &&
			changePasswordData.oldPassword !== ''
	);

	const changePassword = async (e: Event) => {
		e.preventDefault();
		if (!passwordChangeDataValid) {
			return;
		}
		const res = await fetch('/api/v1/users/password/update', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				old_password: changePasswordData.oldPassword,
				new_password: changePasswordData.newPassword
			})
		});
		if (res.status === 200) {
			alert('Password changed');
			window.location.assign('/account/login');
		} else {
			alert('Password change failed');
		}
	};

	const getUser = async (): Promise<UserAccount> => {
		const response = await fetch('/api/v1/users/me', {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		});
		if (response.status === 200) {
			return await response.json();
		} else {
			window.location.assign('/account/login');
		}
	};

	onMount(() => {
		api_keys = get_api_keys();
	});

	const get_api_keys = async (): Promise<Array<{ key: string }>> => {
		const res = await fetch('/api/v1/users/api_keys');
		const api_keys_temp = await res.json();
		console.log(api_keys_temp);
		return api_keys_temp;
	};

	let api_keys: Promise<Array<{ key: string }>> | undefined = $state();

	const add_api_key = async () => {
		await fetch('/api/v1/users/api_keys', { method: 'POST' });
		api_keys = get_api_keys();
	};
	const formatDate = (date: string): string => {
		const dt = DateTime.fromISO(date);
		return dt.toLocaleString(DateTime.DATETIME_MED);
	};

	const delete_api_key = async (key: string) => {
		if (confirm('Do you really want to delete this API-Key?')) {
			await fetch(`/api/v1/users/api_keys?api_key=${key}`, { method: 'DELETE' });
			api_keys = get_api_keys();
		}
	};

	const getSessions = async (): Promise<any[]> => {
		const res = await fetch('/api/v1/users/sessions/list');
		if (res.status === 200) {
			const res2 = await fetch('/api/v1/users/session');
			if (res2.status === 200) {
				this_session = await res2.json();
			}
			return await res.json();
		} else {
			window.location.assign('/account/login?returnTo=/account/settings');
		}
		return await res.json();
	};

	const getFormattedUserAgent = (userAgent: string): string => {
		const parser = new UAParser(userAgent);
		const result = parser.getResult();
		return `${result.browser.name} ${result.browser.version} (${result.os.name})`;
	};

	const deleteSession = async (session_id: string) => {
		const res = await fetch(`/api/v1/users/sessions/${session_id}`, {
			method: 'DELETE'
		});
		if (res.status === 200) {
			window.location.reload();
		}
	};
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('words.settings')}</title>
</svelte:head>

<main class="tq-page settings-page tq-stack" data-ui="account-settings">
	<h1 class="tq-page-title">{$t('words.settings')}</h1>
	<SettingsNav current="settings" />

	{#await getUser()}
		<Spinner />
	{:then user}
		{#if user}
			<section class="tq-panel tq-panel-body profile" aria-label={$t('ui.account')}>
				<img class="avatar" src="/api/v1/users/avatar" alt="" />
				<div class="profile-info">
					<h2 class="tq-section-title">{user.username}</h2>
					<p class="tq-muted">{user.email}</p>
				</div>
				<div class="tq-toolbar">
					<a class="tq-button" href="/account/settings/avatar"
						>{$t('settings_page.change_avatar')}</a
					>
					<a class="tq-button" href="/user/{user.id}">
						{$t('telekom.public_profile', { defaultValue: 'Public profile' })}
					</a>
				</div>
			</section>
		{/if}
	{/await}

	<section class="tq-panel tq-panel-body section" aria-labelledby="password-title">
		<h2 class="tq-section-title" id="password-title">
			{$t('telekom.change_password', { defaultValue: 'Change password' })}
		</h2>
		<form class="password-form" onsubmit={changePassword}>
			<div class="tq-field-group">
				<label class="tq-label" for="old-password">{$t('settings_page.old_password')}</label
				>
				<input
					id="old-password"
					class="tq-field"
					type="password"
					autocomplete="current-password"
					bind:value={changePasswordData.oldPassword}
				/>
			</div>
			<div class="tq-field-group">
				<label class="tq-label" for="new-password">{$t('settings_page.new_password')}</label
				>
				<input
					id="new-password"
					class="tq-field"
					type="password"
					autocomplete="new-password"
					bind:value={changePasswordData.newPassword}
				/>
				{#if changePasswordData.newPassword !== '' && changePasswordData.newPassword.length < 8}
					<p class="tq-field-error">
						{$t('telekom.password_too_short', {
							defaultValue: 'Password must be at least 8 characters long.'
						})}
					</p>
				{:else if changePasswordData.newPassword !== '' && changePasswordData.newPassword === changePasswordData.oldPassword}
					<p class="tq-field-error">
						{$t('telekom.password_unchanged', {
							defaultValue: 'The new password must differ from the old password.'
						})}
					</p>
				{/if}
			</div>
			<div class="tq-field-group">
				<label class="tq-label" for="repeat-password"
					>{$t('settings_page.repeat_password')}</label
				>
				<input
					id="repeat-password"
					class="tq-field"
					type="password"
					autocomplete="new-password"
					bind:value={changePasswordData.newPasswordConfirm}
				/>
				{#if changePasswordData.newPasswordConfirm !== '' && changePasswordData.newPassword !== changePasswordData.newPasswordConfirm}
					<p class="tq-field-error">
						{$t('telekom.passwords_mismatch', {
							defaultValue: 'Passwords do not match.'
						})}
					</p>
				{/if}
			</div>
			<div class="form-actions">
				<button
					class="tq-button tq-button-primary"
					disabled={!passwordChangeDataValid}
					type="submit"
				>
					{$t('telekom.change_password', { defaultValue: 'Change password' })}
				</button>
			</div>
		</form>
	</section>

	<section class="tq-panel tq-panel-body section" aria-labelledby="api-keys-title">
		<div class="section-heading">
			<h2 class="tq-section-title" id="api-keys-title">
				{$t('telekom.api_keys', { defaultValue: 'API keys' })}
			</h2>
			<button type="button" class="tq-button" data-ui="add-api-key" onclick={add_api_key}>
				{$t('settings_page.add_api_key')}
			</button>
		</div>
		{#await api_keys}
			<Spinner my_20={false} />
		{:then keys}
			<ul class="key-list">
				{#each keys ?? [] as key}
					<li class="key-row">
						<code class="key-value">{key.key}</code>
						<button
							type="button"
							class="tq-button tq-button-danger"
							onclick={() => delete_api_key(key.key)}
						>
							{$t('words.delete')}
						</button>
					</li>
				{:else}
					<li class="tq-muted">
						{$t('telekom.no_api_keys', { defaultValue: 'No API keys' })}
					</li>
				{/each}
			</ul>
		{/await}
	</section>

	<section class="tq-panel section-table" aria-labelledby="sessions-title">
		<h2 class="tq-section-title table-title" id="sessions-title">
			{$t('telekom.sessions', { defaultValue: 'Sessions' })}
		</h2>
		{#await getSessions()}
			<Spinner my_20={false} />
		{:then sessions}
			<div class="tq-table-wrap">
				<table class="tq-table" data-ui="sessions-table">
					<thead>
						<tr>
							<th>{$t('overview_page.created_at')}</th>
							<th>{$t('settings_page.last_seen')}</th>
							<th>{$t('words.browser')}</th>
							<th>{$t('settings_page.this_session?')}</th>
							<th>
								<span class="sr-only"
									>{$t('telekom.actions', { defaultValue: 'Actions' })}</span
								>
							</th>
						</tr>
					</thead>
					<tbody>
						{#each sessions as session}
							<tr>
								<td>{formatDate(session.created_at)}</td>
								<td>{formatDate(session.last_seen)}</td>
								<td>{getFormattedUserAgent(session.user_agent)}</td>
								<td>
									{#if session.id === this_session?.id}
										<span class="tq-badge tq-badge-brand"
											>{$t('words.yes')}</span
										>
									{:else}
										<span class="tq-muted">{$t('words.no')}</span>
									{/if}
								</td>
								<td>
									<button
										type="button"
										class="tq-button tq-button-danger"
										onclick={() => deleteSession(session.id)}
									>
										{$t('words.delete')}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/await}
	</section>
</main>
<Footer />

<style>
	.settings-page {
		max-width: 960px;
	}
	.profile {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 20px;
	}
	.avatar {
		width: 80px;
		height: 80px;
		flex-shrink: 0;
		border-radius: 50%;
		object-fit: cover;
		background: var(--tq-surface-subtle);
	}
	.profile-info {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.section {
		display: grid;
		gap: 20px;
	}
	.password-form {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 20px;
		align-items: start;
	}
	.form-actions {
		grid-column: 1 / -1;
	}
	.section-heading {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.key-list {
		display: grid;
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.key-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.key-value {
		flex: 1;
		min-width: 0;
		padding: 10px 12px;
		border: 1px solid var(--tq-border);
		border-radius: 8px;
		background: var(--tq-surface-subtle);
		font-size: 14px;
		overflow-wrap: anywhere;
	}
	.section-table {
		overflow: hidden;
	}
	.table-title {
		padding: 24px 24px 16px;
	}
	@media (max-width: 767px) {
		.password-form {
			grid-template-columns: minmax(0, 1fr);
		}
		.table-title {
			padding: 16px 16px 8px;
		}
		.key-row {
			flex-wrap: wrap;
		}
	}
</style>
