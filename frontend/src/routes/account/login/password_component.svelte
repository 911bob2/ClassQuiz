<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import Spinner from '$lib/Spinner.svelte';
	import AuthCard from '../AuthCard.svelte';

	let {
		session_data,
		selected_method = $bindable(),
		done = $bindable(),
		step = $bindable()
	} = $props();

	const { t } = getLocalization();
	let isSubmitting;
	let password = $state();

	const continue_in_login = async (e: Event) => {
		e.preventDefault();
		if (!password) {
			return;
		}
		const res = await fetch(`/api/v1/login/step/1?session_id=${session_data.session_id}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ auth_type: 'PASSWORD', data: password })
		});
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
				alert("This shouldn't happen");
				window.location.reload();
			}
			if (data.detail === 'wrong credentials') {
				/*				alertModal.set({
					open: true,
					body: 'Please try again. Your email and or password were incorrect.',
					title: 'Wrong Credentials'
				});*/
				alert('Wrong credentials');
			}
		}
	};
</script>

<AuthCard title={$t('words.login')} data_ui="login-password">
	<form class="form" onsubmit={continue_in_login}>
		<div class="tq-field-group">
			<label class="tq-label" for="password">{$t('words.password')}</label>
			<input
				id="password"
				bind:value={password}
				name="password"
				type="password"
				class="tq-field"
				autocomplete="current-password"
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
			<button class="tq-button tq-button-primary" disabled={!password} type="submit">
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
