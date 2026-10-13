<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { getLocalization } from '$lib/i18n';
	import Footer from '$lib/footer.svelte';
	import Spinner from '$lib/Spinner.svelte';
	import AuthCard from '../../AuthCard.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	const { t } = getLocalization();
	let input_data = $state({
		player_name: data.username,
		name: ''
	});

	let isValid = $derived(input_data.name.length !== 0 && input_data.player_name.length !== 0);
	let isSubmitting = false;

	const submit = async (e: Event) => {
		e.preventDefault();
		if (!isValid) {
			return;
		}
		const res = await fetch('/api/v1/box-controller/web/setup', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(input_data)
		});
		if (res.ok) {
			const json = await res.json();
			goto(`/account/controllers/add/wait?id=${json.id}&code=${json.code}`);
		}
	};
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('controllers.add_new_controller')}</title>
</svelte:head>

<AuthCard title={$t('controllers.add_new_controller')} data_ui="controller-add">
	<form class="form" onsubmit={submit}>
		<div class="tq-field-group">
			<label class="tq-label" for="player_name">{$t('controllers.player_name')}</label>
			<input
				id="player_name"
				name="player_name"
				type="text"
				class="tq-field"
				bind:value={input_data.player_name}
				aria-invalid={input_data.player_name.length === 0 ? 'true' : undefined}
			/>
		</div>
		<div class="tq-field-group">
			<label class="tq-label" for="name">{$t('controllers.controller_name')}</label>
			<input
				id="name"
				name="name"
				type="text"
				class="tq-field"
				bind:value={input_data.name}
				aria-invalid={input_data.name.length === 0 ? 'true' : undefined}
			/>
		</div>
		<div>
			<button
				class="tq-button tq-button-primary"
				disabled={!isValid || isSubmitting}
				type="submit"
			>
				{#if isSubmitting}
					<Spinner my_20={false} />
				{:else}
					{$t('telekom.add', { defaultValue: 'Add' })}
				{/if}
			</button>
		</div>
	</form>
	{#snippet below()}
		<a class="tq-link" href="/controller"
			>{$t('telekom.learn_more', { defaultValue: 'Learn more' })}</a
		>
	{/snippet}
</AuthCard>
<Footer />

<style>
	.form {
		display: grid;
		gap: 20px;
	}
</style>
