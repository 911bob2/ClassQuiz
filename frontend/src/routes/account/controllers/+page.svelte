<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { PageData } from './$types';
	import { getLocalization } from '$lib/i18n';
	import Footer from '$lib/footer.svelte';
	import SettingsNav from '../SettingsNav.svelte';
	const { t } = getLocalization();
	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('telekom.controllers', { defaultValue: 'Controllers' })}</title>
</svelte:head>

<main class="tq-page settings-page tq-stack" data-ui="controllers">
	<header class="tq-page-heading flush">
		<h1 class="tq-page-title">{$t('telekom.controllers', { defaultValue: 'Controllers' })}</h1>
		<a
			class="tq-button tq-button-primary"
			href="/account/controllers/add"
			data-ui="add-controller"
		>
			{$t('controllers.add_new_controller')}
		</a>
	</header>
	<SettingsNav current="controllers" />

	{#if data.controllers.length === 0}
		<div class="tq-panel tq-empty">
			{$t('telekom.no_controllers', { defaultValue: 'No controllers' })}
		</div>
	{:else}
		<div class="tq-panel table-panel">
			<div class="tq-table-wrap">
				<table class="tq-table">
					<thead>
						<tr>
							<th>{$t('words.name')}</th>
							<th>{$t('controllers.player_name')}</th>
							<th>{$t('controllers.first_seen')}</th>
							<th>{$t('controllers.last_seen')}</th>
							<th>{$t('words.version')}</th>
						</tr>
					</thead>
					<tbody>
						{#each data.controllers as controller}
							<tr>
								<td>
									<a
										class="tq-link font-bold"
										href="/account/controllers/{controller.id}"
									>
										{controller.name}
									</a>
								</td>
								<td>{controller.player_name}</td>
								<td>
									{controller.first_seen
										? new Date(controller.first_seen).toLocaleString()
										: $t('words.never')}
								</td>
								<td>
									{controller.last_seen
										? new Date(controller.last_seen).toLocaleString()
										: $t('words.never')}
								</td>
								<td>{controller.os_version ?? $t('words.unknown')}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</main>
<Footer />

<style>
	.settings-page {
		max-width: 960px;
	}
	.flush {
		margin-bottom: 0;
	}
	.table-panel {
		overflow: hidden;
	}
</style>
