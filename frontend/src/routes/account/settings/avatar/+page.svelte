<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import Spinner from '$lib/Spinner.svelte';
	import Footer from '$lib/footer.svelte';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	const item_count = {
		skin_color: 7,
		top_type: 35,
		hair_color: 10,
		facial_hair_type: 6,
		facial_hair_color: 10,
		mouth_type: 12,
		eyebrow_type: 13,
		accessories_type: 7,
		hat_color: 15,
		clothe_type: 9,
		clothe_color: 15,
		clothe_graphic_type: 11
	};

	const translation_map = {
		skin_color: $t('avatar_settings.skin_color'),
		top_type: $t('avatar_settings.top_type'),
		hair_color: $t('avatar_settings.hair_color'),
		facial_hair_type: $t('avatar_settings.facial_hair_type'),
		facial_hair_color: $t('avatar_settings.facial_hair_color'),
		mouth_type: $t('avatar_settings.mouth_type'),
		eyebrow_type: $t('avatar_settings.eyebrow_type'),
		accessories_type: $t('avatar_settings.accessories_type'),
		hat_color: $t('avatar_settings.hat_color'),
		clothe_type: $t('avatar_settings.clothe_type'),
		clothe_color: $t('avatar_settings.clothe_color'),
		clothe_graphic_type: $t('avatar_settings.clothe_graphic_type')
	};

	let data = $state({
		skin_color: 0,
		top_type: 0,
		hair_color: 0,
		facial_hair_type: 0,
		facial_hair_color: 0,
		mouth_type: 0,
		eyebrow_type: 0,
		accessories_type: 0,
		hat_color: 0,
		clothe_type: 0,
		clothe_color: 0,
		clothe_graphic_type: 0
	});

	const data_keys = Object.keys(data);
	let index = $state(0);
	// let index = 10;
	let save_finished: undefined | boolean = $state(undefined);
	let finished = $state(false);
	const get_image_url = (input_data) => {
		return `/api/v1/avatar/custom?${new URLSearchParams(input_data).toString()}`;
	};

	let image_url = $derived(get_image_url(data));

	const save_avatar = async () => {
		save_finished = false;
		const res = await fetch(`/api/v1/avatar/save?${new URLSearchParams(data).toString()}`, {
			method: 'POST'
		});
		if (res.ok) {
			save_finished = true;
		}
	};

	const finish = () => {
		save_finished = undefined;
		finished = true;
	};

	const focus_on_mount = (node: HTMLElement) => {
		node.focus();
	};
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('settings_page.change_avatar')}</title>
</svelte:head>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') finished = false;
	}}
/>

<main class="tq-page tq-stack" data-ui="avatar-editor">
	<header class="tq-page-heading flush">
		<h1 class="tq-page-title">{$t('settings_page.change_avatar')}</h1>
		<a class="tq-button" href="/account/settings">{$t('avatar_settings.go_back')}</a>
	</header>

	<div class="layout">
		<aside class="tq-panel tq-panel-body preview">
			<img class="preview-image" src={image_url} alt="" />
		</aside>

		<section class="tq-panel tq-panel-body picker" aria-labelledby="step-title">
			<div class="step-header">
				<button
					type="button"
					class="tq-button"
					data-ui="avatar-back"
					disabled={index < 1}
					onclick={() => {
						index = index - 1;
					}}
				>
					{$t('words.back')}
				</button>
				<h2 class="tq-section-title step-title" id="step-title">
					{translation_map[data_keys[index]]}
					<span class="tq-muted step-count">({index + 1}/{data_keys.length})</span>
				</h2>
				<button
					type="button"
					class="tq-button tq-button-primary"
					data-ui="avatar-finish"
					disabled={index < 11}
					onclick={finish}
				>
					{$t('words.finish')}
				</button>
			</div>
			<div class="options" data-ui="avatar-options">
				{#each Array.from(Array(item_count[data_keys[index]]).keys()) as key}
					<button
						type="button"
						class="option"
						aria-pressed={data[data_keys[index]] === key}
						aria-label={`${translation_map[data_keys[index]]} ${key + 1}`}
						onclick={() => {
							data[data_keys[index]] = key;
							if (index < 11) {
								index++;
							} else {
								finish();
							}
						}}
					>
						<img src={get_image_url({ ...data, [data_keys[index]]: key })} alt="" />
					</button>
				{/each}
			</div>
		</section>
	</div>
</main>
<Footer />

{#if finished}
	<div
		class="tq-overlay"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) finished = false;
		}}
	>
		<div
			class="tq-dialog final"
			role="dialog"
			aria-modal="true"
			aria-labelledby="final-title"
			data-ui="avatar-final"
			tabindex="-1"
			use:focus_on_mount
		>
			<h2 class="tq-section-title" id="final-title">{$t('settings_page.change_avatar')}</h2>
			<img class="final-image" src={get_image_url(data)} alt="" />
			<div class="final-actions">
				<button
					type="button"
					class="tq-button tq-button-primary"
					data-ui="avatar-save"
					onclick={save_avatar}
					disabled={save_finished === true}
				>
					{#if save_finished === undefined}
						{$t('words.save')}
					{:else if save_finished === true}
						<svg
							width="20"
							height="20"
							aria-hidden="true"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M5 13l4 4L19 7"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						{$t('telekom.saved', { defaultValue: 'Saved' })}
					{:else if save_finished === false}
						<Spinner my_20={false} />
					{/if}
				</button>
				<button
					type="button"
					class="tq-button"
					onclick={() => {
						index = 0;
						finished = false;
					}}
				>
					{$t('avatar_settings.start_over')}
				</button>
				<a class="tq-button" href="/account/settings">{$t('avatar_settings.go_back')}</a>
				<button
					type="button"
					class="tq-button tq-button-ghost"
					onclick={() => {
						finished = false;
					}}
				>
					{$t('words.close')}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.flush {
		margin-bottom: 0;
	}
	.layout {
		display: grid;
		grid-template-columns: 280px minmax(0, 1fr);
		gap: 24px;
		align-items: start;
	}
	.preview {
		position: sticky;
		inset-block-start: calc(var(--tq-header-height) + 16px);
	}
	.preview-image {
		display: block;
		width: 100%;
		height: auto;
	}
	.picker {
		display: grid;
		gap: 24px;
	}
	.step-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.step-title {
		flex: 1;
		text-align: center;
	}
	.step-count {
		font-size: 16px;
		font-weight: 400;
	}
	.options {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 12px;
	}
	.option {
		display: block;
		padding: 4px;
		border: 1px solid var(--tq-border);
		border-radius: 12px;
		background: var(--tq-surface);
	}
	.option:hover {
		border-color: var(--tq-accent);
	}
	.option[aria-pressed='true'] {
		border-color: var(--tq-accent);
		outline: 2px solid var(--tq-accent);
		outline-offset: -2px;
	}
	.option img {
		display: block;
		width: 100%;
		height: auto;
	}
	.final {
		display: grid;
		justify-items: center;
		gap: 20px;
		max-width: 480px;
	}
	.final:focus-visible {
		outline: none;
	}
	.final-image {
		width: 240px;
		max-width: 100%;
		height: auto;
	}
	.final-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 12px;
	}
	@media (max-width: 767px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.preview {
			position: static;
			justify-self: center;
			width: 200px;
		}
		.step-title {
			order: -1;
			flex-basis: 100%;
		}
	}
</style>
