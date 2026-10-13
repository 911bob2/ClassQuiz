<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { PageData } from './$types';
	import CodeDisplay from '$lib/components/controller/code.svelte';
	import Spinner from '$lib/Spinner.svelte';
	import Footer from '$lib/footer.svelte';
	import { getLocalization } from '$lib/i18n';
	import { onMount } from 'svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	const { t } = getLocalization();
	let controller_seen = $state(false);
	let check_tick = $state(0);
	let interval;

	const check_if_controller_was_seen = async () => {
		const res = await fetch(`/api/v1/box-controller/web/controller?id=${data.id}`);
		const json = await res.json();
		controller_seen = Boolean(json.first_seen);
		if (controller_seen) {
			clearInterval(interval);
		}
	};

	onMount(async () => {
		await check_if_controller_was_seen();
		interval = setInterval(async () => {
			check_tick += 1;
			if (check_tick === 5) {
				await check_if_controller_was_seen();
				check_tick = 0;
			}
		}, 1000);
	});
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('controllers.add_new_controller')}</title>
</svelte:head>

<main class="tq-page tq-page-narrow" data-ui="controller-wait">
	<section class="tq-panel tq-panel-body wait" aria-labelledby="wait-title">
		<h1 class="tq-page-title" id="wait-title">{$t('controllers.add_new_controller')}</h1>
		<CodeDisplay code={data.code} />
		<div class="status" role="status" aria-live="polite">
			{#if controller_seen}
				<p class="success">
					{$t('telekom.controller_connected', {
						defaultValue: 'Controller set up successfully.'
					})}
				</p>
				<a class="tq-button tq-button-primary" href="/account/controllers">
					{$t('telekom.controllers', { defaultValue: 'Controllers' })}
				</a>
			{:else}
				<p class="tq-muted">
					{$t('telekom.controller_checking', {
						defaultValue:
							'Checking if the controller has connected in {{seconds}} seconds.',
						seconds: 5 - check_tick
					})}
				</p>
				<Spinner my_20={false} />
			{/if}
		</div>
	</section>
</main>
<Footer />

<style>
	.wait {
		display: grid;
		justify-items: center;
		gap: 32px;
		text-align: center;
	}
	.status {
		display: grid;
		justify-items: center;
		gap: 16px;
	}
	.status p {
		margin: 0;
	}
	.success {
		color: var(--tq-success);
		font-weight: 700;
	}
</style>
