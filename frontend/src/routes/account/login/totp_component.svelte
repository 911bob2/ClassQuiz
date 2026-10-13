<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import Spinner from '$lib/Spinner.svelte';
	import AuthCard from '../AuthCard.svelte';

	interface Props {
		session_data: any;
		selected_method: any;
		done: any;
		step: any;
	}

	let {
		session_data,
		selected_method = $bindable(),
		done = $bindable(),
		step = $bindable()
	}: Props = $props();

	const { t } = getLocalization();
	let isSubmitting: boolean;
	let totp = $state('');

	let totp_valid = $derived(totp.length === 6);

	const continue_in_login = async (e: Event) => {
		e.preventDefault();
		if (!totp_valid) {
			return;
		}
		const res = await fetch(
			`/api/v1/login/step/${step}?session_id=${session_data.session_id}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ auth_type: 'TOTP', data: totp })
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
			if (data.detail === 'totp wrong') {
				/*				alertModal.set({
					open: true,
					body: 'Wrong Totp-Code. please try again.',
					title: 'Totp Error'
				});*/
				alert('TOTP code was incorrect');
				totp = '';
			}
		}
	};
</script>

<AuthCard title={$t('words.login')} data_ui="login-totp">
	<form class="form" onsubmit={continue_in_login}>
		<div class="tq-field-group">
			<label class="tq-label" for="totp">{$t('security_settings.totp')}</label>
			<input
				id="totp"
				bind:value={totp}
				name="totp"
				type="text"
				class="tq-field"
				inputmode="numeric"
				autocomplete="one-time-code"
			/>
		</div>
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
			<button class="tq-button tq-button-primary" disabled={!totp_valid} type="submit">
				{#if isSubmitting}
					<Spinner my_20={false} />
				{:else}
					{$t('words.continue')}
				{/if}
			</button>
		</div>
	</form>
</AuthCard>

<style>
	.form {
		display: grid;
		gap: 20px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
</style>
