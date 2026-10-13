<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { PageData } from './$types';
	import { SaveStatus } from './commons';
	import SaveIndicator from './SaveIndicator.svelte';
	import Spinner from '$lib/Spinner.svelte';
	import Cookies from 'js-cookie';
	import { browser } from '$app/environment';
	import Footer from '$lib/footer.svelte';
	import SettingsNav from '../../SettingsNav.svelte';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();
	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	const controller = $state(data.controller);

	let newest_version: string | undefined = $state(undefined);

	let saved_status = $state(SaveStatus.Unchanged);

	let save_player_timer;
	const save_player_name_debounce = () => {
		clearTimeout(save_player_timer);
		save_player_timer = setTimeout(save_names, 750);
	};

	const save_names = async () => {
		if (!browser) {
			return;
		}
		saved_status = SaveStatus.Saving;
		const res = await fetch(`/api/v1/box-controller/web/modify`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				id: controller.id,
				player_name: controller.player_name,
				name: controller.name
			})
		});
		if (res.ok) {
			saved_status = SaveStatus.Saved;
		} else {
			saved_status = SaveStatus.Error;
		}
	};
	const get_latest_version = async () => {
		if (!browser) {
			return;
		}
		const cookie_data = Cookies.get('latest_cqc_version');
		if (cookie_data) {
			newest_version = cookie_data;
			return;
		}
		const res = await fetch(
			'https://api.github.com/repos/mawoka-myblock/ClassQuizController/releases'
		);
		const json = await res.json();
		newest_version = json[0].tag_name.replace('v', '');
		Cookies.set('latest_cqc_version', newest_version, { path: '', expires: 3600 });
	};

	const allow_update_to_version = async () => {
		if (newest_version === controller.os_version) {
			return;
		}
		let wanted_version;
		if (newest_version === controller.wanted_os_version) {
			wanted_version = controller.os_version;
		} else {
			wanted_version = newest_version;
		}
		await fetch('/api/v1/box-controller/web/set_update', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ id: controller.id, version: wanted_version })
		});
		window.location.reload();
	};
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('telekom.controller', { defaultValue: 'Controller' })}</title>
</svelte:head>

<main class="tq-page settings-page tq-stack" data-ui="controller-detail">
	<header class="tq-page-heading flush">
		<h1 class="tq-page-title">{$t('telekom.controller', { defaultValue: 'Controller' })}</h1>
		<a class="tq-button" href="/account/controllers">
			{$t('telekom.controllers', { defaultValue: 'Controllers' })}
		</a>
	</header>
	<SettingsNav current="controllers" />

	<section class="tq-panel tq-panel-body section" aria-labelledby="names-title">
		<div class="section-heading">
			<h2 class="tq-section-title" id="names-title">{$t('words.settings')}</h2>
			<SaveIndicator status={saved_status} />
		</div>
		<div class="fields">
			<div class="tq-field-group">
				<label class="tq-label" for="controller-name"
					>{$t('controllers.controller_name')}</label
				>
				<input
					id="controller-name"
					class="tq-field"
					bind:value={controller.name}
					onkeyup={save_player_name_debounce}
				/>
			</div>
			<div class="tq-field-group">
				<label class="tq-label" for="controller-player-name">
					{$t('controllers.player_name')}
				</label>
				<input
					id="controller-player-name"
					class="tq-field"
					bind:value={controller.player_name}
					onkeyup={save_player_name_debounce}
				/>
			</div>
		</div>
	</section>

	<section class="tq-panel tq-panel-body section" aria-labelledby="update-title">
		<h2 class="tq-section-title" id="update-title">{$t('words.update')}</h2>
		{#await get_latest_version()}
			<Spinner my_20={false} />
		{:then _}
			<p class="tq-muted">
				{$t('controllers.version_overview', {
					newest_version,
					current_version: controller.os_version
				})}
			</p>
		{/await}
		{#if newest_version && controller.os_version}
			<div>
				<button
					type="button"
					class="tq-button"
					data-ui="controller-update"
					disabled={newest_version === controller.os_version}
					onclick={allow_update_to_version}
				>
					{#if newest_version === controller.os_version}
						{$t('controllers.already_latest_version')}
					{:else if newest_version === controller.wanted_os_version}
						{$t('controllers.cancel_update')}
					{:else}
						{$t('controllers.update_from_to', {
							newest_version,
							current_version: controller.os_version
						})}
					{/if}
				</button>
			</div>
		{/if}
	</section>
</main>
<Footer />

<style>
	.settings-page {
		max-width: 960px;
	}
	.flush {
		margin-bottom: 0;
	}
	.section {
		display: grid;
		gap: 20px;
	}
	.section-heading {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 20px;
	}
	@media (max-width: 767px) {
		.fields {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
