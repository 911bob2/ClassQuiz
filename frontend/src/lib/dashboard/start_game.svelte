<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	// import { alertModal } from '$lib/stores';
	import { fade } from 'svelte/transition';
	import Spinner from '$lib/Spinner.svelte';
	import { onMount } from 'svelte';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();
	let { quiz_id = $bindable() } = $props();
	let captcha_selected = $state(false);
	let selected_game_mode = $state('kahoot');
	let loading = $state(false);
	let custom_field = $state('');
	let cqcs_enabled = $state(false);
	let randomized_answers = $state(false);
	let large_audience = $state(false);
	let rust_experimental = $state(false);
	let rust_available = $state(false);
	let start_error = $state('');
	let python_captcha = $state(false);
	let rust_captcha = $state(false);
	const captcha_available = $derived(rust_experimental ? rust_captcha : python_captcha);
	$effect(() => {
		if (!captcha_available) captcha_selected = false;
	});
	$effect(() => {
		if (rust_experimental) {
			large_audience = true;
			cqcs_enabled = false;
			selected_game_mode = 'kahoot';
		}
	});

	onMount(() => {
		fetch('/api/v1/quiz/realtime/capabilities')
			.then((r) => r.json())
			.then((d) => {
				rust_available = d.rust === true;
				python_captcha = !!d.captcha;
				rust_captcha = !!d.rust_captcha;
			})
			.catch(() => {});
		const ls_data = localStorage.getItem('custom_field');
		custom_field = ls_data ? ls_data : '';
	});

	const start_game = async (id: string) => {
		let res;
		loading = true;
		start_error = '';
		try {
			localStorage.setItem('custom_field', custom_field);
			const cqcs_enabled_parsed = cqcs_enabled ? 'True' : 'False';
			const randomized_answers_parsed = randomized_answers ? 'True' : 'False';
			if (captcha_available && captcha_selected) {
				res = await fetch(
					`/api/v1/quiz/start/${id}?captcha_enabled=True&game_mode=${selected_game_mode}&custom_field=${encodeURIComponent(custom_field)}&cqcs_enabled=${cqcs_enabled_parsed}&randomize_answers=${randomized_answers_parsed}&large_audience=${large_audience}&rust_experimental=${rust_experimental}`,
					{
						method: 'POST'
					}
				);
			} else {
				res = await fetch(
					`/api/v1/quiz/start/${id}?captcha_enabled=False&game_mode=${selected_game_mode}&custom_field=${encodeURIComponent(custom_field)}&cqcs_enabled=${cqcs_enabled_parsed}&randomize_answers=${randomized_answers_parsed}&large_audience=${large_audience}&rust_experimental=${rust_experimental}`,
					{
						method: 'POST'
					}
				);
			}
			if (res.status !== 200) {
				loading = false;
				const failure = await res.json().catch(() => ({}));
				start_error =
					typeof failure.detail === 'string'
						? failure.detail
						: 'Starting game failed. Please retry.';
				return;
			} else {
				const data = await res.json();
				window.location.assign(
					`/admin?token=${data.game_id}&pin=${data.game_pin}&connect=1&cqc_code=${data.cqc_code}`
				);
			}
		} catch {
			start_error = 'Connection failed. Please retry.';
		} finally {
			loading = false;
		}
	};

	const on_parent_click = (e: Event) => {
		if (e.target !== e.currentTarget) {
			return;
		}
		quiz_id = null;
	};
	const close_start_game_if_esc_is_pressed = (key: KeyboardEvent) => {
		if (key.code === 'Escape') {
			quiz_id = null;
		}
	};
	onMount(() => {
		document.body.addEventListener('keydown', close_start_game_if_esc_is_pressed);
		return () => {
			document.body.removeEventListener('keydown', close_start_game_if_esc_is_pressed);
		};
	});

	const focus_on_mount = (node: HTMLElement) => {
		node.focus();
	};
</script>

<div
	class="tq-overlay"
	role="presentation"
	onclick={on_parent_click}
	transition:fade|global={{ duration: 100 }}
>
	<div
		class="tq-dialog tq-stack stack-5"
		role="dialog"
		aria-modal="true"
		aria-labelledby="start-title"
		data-ui="start-game-dialog"
		tabindex="-1"
		use:focus_on_mount
	>
		<header class="tq-page-heading flush">
			<h2 class="tq-section-title" id="start-title">{$t('start_game.start_game')}</h2>
			<button
				type="button"
				class="tq-button tq-button-ghost"
				data-ui="start-game-close"
				onclick={() => (quiz_id = null)}
			>
				{$t('words.close')}
			</button>
		</header>

		<fieldset class="mode-group">
			<legend class="tq-label"
				>{$t('telekom.game_mode', { defaultValue: 'Game mode' })}</legend
			>
			<label
				class="tq-panel mode-option"
				class:mode-selected={selected_game_mode === 'kahoot'}
			>
				<input type="radio" bind:group={selected_game_mode} value="kahoot" />
				<span>
					<strong>{$t('words.normal')}</strong>
					<span class="tq-muted mode-description">
						{$t('start_game.normal_mode_description')}
					</span>
				</span>
			</label>
			<label
				class="tq-panel mode-option"
				class:mode-selected={selected_game_mode === 'normal'}
			>
				<input
					type="radio"
					bind:group={selected_game_mode}
					value="normal"
					disabled={rust_experimental}
				/>
				<span>
					<strong>{$t('start_game.old_school_mode')}</strong>
					<span class="tq-muted mode-description">
						{$t('start_game.old_school_mode_description')}
					</span>
				</span>
			</label>
		</fieldset>

		<div class="tq-field-group">
			<label class="tq-label" for="custom-field">{$t('result_page.custom_field')}</label>
			<input
				id="custom-field"
				data-ui="start-game-custom-field"
				class="tq-field"
				bind:value={custom_field}
				placeholder={$t('telekom.custom_field_placeholder', {
					defaultValue: 'Phone number or email'
				})}
			/>
		</div>

		<fieldset class="option-group">
			<legend class="tq-label">{$t('telekom.options', { defaultValue: 'Options' })}</legend>
			<label class="option-row">
				<input
					type="checkbox"
					disabled={!captcha_available}
					data-ui="captcha-toggle"
					bind:checked={captcha_selected}
				/>
				<span>Captcha</span>
			</label>
			{#if !captcha_available}<p class="tq-muted text-sm option-note">
					Captcha is not configured for this engine.
				</p>{/if}
			{#if captcha_selected}
				<p class="tq-muted text-sm option-note">{$t('start_game.captcha_message')}</p>
			{/if}
			<label class="option-row">
				<input type="checkbox" bind:checked={cqcs_enabled} disabled={rust_experimental} />
				<span>{$t('telekom.controllers', { defaultValue: 'Controllers' })}</span>
				<a class="tq-link text-sm" href="/controller" target="_blank" rel="noreferrer">
					{$t('telekom.learn_more', { defaultValue: 'Learn more' })}
				</a>
			</label>
			<label class="option-row">
				<input type="checkbox" bind:checked={randomized_answers} />
				<span>{$t('telekom.randomize_answers', { defaultValue: 'Randomize answers' })}</span
				>
			</label>
			<label class="option-row">
				<input
					type="checkbox"
					bind:checked={large_audience}
					disabled={rust_experimental}
					data-ui="large-audience-toggle"
					aria-describedby="large-audience-help"
				/>
				<span
					>{$t('telekom.large_audience', {
						defaultValue: 'Huge publicum optimization (300+ players)'
					})}</span
				>
			</label>
			<p class="tq-muted text-sm option-note" id="large-audience-help">
				{$t('telekom.large_audience_help', {
					defaultValue:
						'Players see their own score and rank, plus the top 10 at the end. The host keeps full results and exports.'
				})}
			</p>
			<div class="rust-option tq-panel tq-panel-body">
				<label class="option-row">
					<input
						type="checkbox"
						bind:checked={rust_experimental}
						disabled={!rust_available}
						data-ui="rust-engine-toggle"
						aria-describedby="rust-engine-help"
					/>
					<span>Experimental Rust engine (10,000+ players)</span>
				</label>
				<p class="tq-muted text-sm" id="rust-engine-help">
					{rust_available
						? 'For very large audiences. Includes personal scores and top 10 results. Requires normal mode and controllers off. Supports captcha when configured.'
						: 'The Rust engine is unavailable on this server. You can use the Python modes above.'}
					<a
						class="tq-link"
						data-ui="rust-learn-more"
						href="/docs/large-audiences"
						target="_blank"
						rel="noreferrer">Learn more</a
					>
				</p>
			</div>
		</fieldset>
		{#if start_error}<p class="tq-muted" role="alert">{start_error}</p>{/if}

		<div class="tq-toolbar dialog-actions">
			<button
				type="button"
				class="tq-button tq-button-primary"
				data-ui="start-game-submit"
				disabled={loading}
				onclick={() => start_game(quiz_id)}
			>
				{#if loading}
					<Spinner my_20={false} />
				{:else}
					{$t('start_game.start_game')}
				{/if}
			</button>
		</div>
	</div>
</div>

<style>
	.tq-dialog:focus-visible {
		outline: none;
	}
	.stack-5 {
		gap: 20px;
	}
	.flush {
		margin-bottom: 0;
	}
	.mode-group,
	.option-group {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.mode-group legend,
	.option-group legend {
		margin-bottom: 6px;
		padding: 0;
	}
	.mode-option {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 16px;
		cursor: pointer;
	}
	.mode-option input {
		margin-top: 3px;
		flex-shrink: 0;
	}
	.mode-selected {
		border-color: var(--tq-accent);
		background: var(--tq-brand-soft);
	}
	.mode-description {
		display: block;
		font-size: 14px;
	}
	.option-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
	}
	.option-note {
		margin: 0;
		padding-inline-start: 30px;
	}
	.dialog-actions {
		justify-content: flex-end;
	}
</style>
