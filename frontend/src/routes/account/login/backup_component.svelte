<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import Spinner from '$lib/Spinner.svelte';
	import AuthCard from '../AuthCard.svelte';

	const { t } = getLocalization();
	let {
		session_data,
		selected_method = $bindable(),
		done = $bindable(),
		step = $bindable()
	} = $props();

	let backup_code = $state('');
	let isSubmitting = $state(false);

	let backup_code_valid = $derived(backup_code.length === 64);

	const continue_in_login = async (e: Event) => {
		e.preventDefault();
		if (!backup_code_valid) {
			return;
		}
		isSubmitting = true;
		const res = await fetch(`/api/v1/login/step/1?session_id=${session_data.session_id}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ auth_type: 'BACKUP', data: backup_code })
		});
		if (res.status === 200) {
			window.location.reload();
			done = true;
		} else {
			step += 1;
			selected_method = null;
		}
	};
</script>

<AuthCard title={$t('words.login')} data_ui="login-backup">
	<form class="form" onsubmit={continue_in_login}>
		<div class="tq-field-group">
			<label class="tq-label" for="backup_code">{$t('words.backup_code')}</label>
			<input
				id="backup_code"
				bind:value={backup_code}
				name="backup_code"
				type="text"
				class="tq-field"
				autocomplete="off"
			/>
		</div>
		<div>
			<button class="tq-button tq-button-primary" disabled={!backup_code_valid} type="submit">
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
</style>
