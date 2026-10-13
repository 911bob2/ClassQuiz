<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { startAuthentication } from '@simplewebauthn/browser';
	import { getLocalization } from '$lib/i18n';
	import Spinner from '$lib/Spinner.svelte';
	import AuthCard from '../AuthCard.svelte';
	// import { alertModal } from '$lib/stores';

	const { t } = getLocalization();
	let {
		session_data,
		selected_method = $bindable(),
		done = $bindable(),
		step = $bindable()
	} = $props();

	let isLoading = $state(false);

	const start_thing = async () => {
		const data = JSON.parse(session_data.webauthn_data);
		let asseResp;
		isLoading = true;
		try {
			asseResp = await startAuthentication({ optionsJSON: data });
		} catch (e) {
			console.error(e);
			/*			alertModal.set({
				open: true,
				body: e,
				title: 'Unknown error'
			});*/
			alert('Unknown error');
			isLoading = false;
		}
		const res = await fetch(
			`/api/v1/login/step/${step}?session_id=${session_data.session_id}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ auth_type: 'PASSKEY', data: asseResp })
			}
		);
		if (res.status === 200) {
			window.location.reload();
			done = true;
		} else if (res.status === 202) {
			step += 1;
			selected_method = null;
		} else if (res.status === 401) {
			let data;
			try {
				data = await res.json();
			} catch {
				/*				alertModal.set({
					open: true,
					body: "This shouldn't happen. Please try again.",
					title: 'Unknown error'
				});*/
				alert('Unknown error');
				window.location.reload();
			}
			if (data.detail === 'webauthn failed') {
				/*				alertModal.set({
					open: true,
					body: 'Webauthn failed. Please try again.',
					title: 'Webauthn Error'
				});*/
				alert('Webauthn failed');
			}
		}
		isLoading = false;
	};
</script>

<AuthCard
	title={$t('words.login')}
	subtitle={$t('telekom.security_key_prompt', {
		defaultValue: 'Start the security key verification.'
	})}
	data_ui="login-passkey"
>
	<div class="actions">
		<button
			type="button"
			class="tq-button tq-button-ghost"
			onclick={() => {
				selected_method = 'BACKUP';
			}}
		>
			{$t('login_page.use_backup_code')}
		</button>
		<button
			type="button"
			class="tq-button tq-button-primary"
			data-ui="login-passkey-start"
			disabled={isLoading}
			onclick={start_thing}
		>
			{#if isLoading}
				<Spinner my_20={false} />
			{:else}
				{$t('words.start')}
			{/if}
		</button>
	</div>
</AuthCard>

<style>
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
</style>
