<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	// import AudioPlayer from '$lib/play/audio_player.svelte';
	import ControllerCodeDisplay from '$lib/components/controller/code.svelte';
	import { getLocalization } from '$lib/i18n';
	import { SocketGameControls } from '$lib/play/admin/socket_game_controls.ts';
	import type { IGameState } from '$lib/play/admin/game_state';

	interface Props {
		game_pin: string;
		game_state: IGameState;
		socket_game_controls: SocketGameControls;
		cqc_code: string;
	}

	let {
		game_pin,
		game_state = $bindable(),
		socket_game_controls,
		cqc_code = $bindable()
	}: Props = $props();

	let fullscreen_open = $state(false);
	const { t } = getLocalization();
	let play_music = $state(false);
	let close_button: HTMLButtonElement | undefined = $state();

	if (cqc_code === 'null') {
		cqc_code = null;
	}

	$effect(() => {
		if (fullscreen_open) {
			close_button?.focus();
		}
	});
</script>

<svelte:window
	onkeydown={(event) => {
		if (fullscreen_open && event.key === 'Escape') {
			fullscreen_open = false;
		}
	}}
/>

<main class="tq-page lobby" data-ui="host-lobby">
	<header class="tq-page-heading">
		<div class="lobby-heading">
			<p class="tq-muted lobby-eyebrow">{$t('telekom.lobby', { defaultValue: 'Lobby' })}</p>
			<h1 class="tq-page-title">{@html game_state.quiz_data?.title}</h1>
		</div>
		<button
			class="tq-button tq-button-primary lobby-start"
			data-ui="host-start-game"
			disabled={game_state.players.length < 1}
			onclick={() => socket_game_controls.start_game()}
		>
			{$t('admin_page.start_game')}
		</button>
	</header>

	<section class="tq-panel tq-panel-body lobby-join">
		<div class="lobby-pin-block">
			<p class="tq-label">{$t('telekom.join_at', { defaultValue: 'Join at' })}</p>
			<p class="lobby-url">{window.location.host}/play</p>
			<p class="tq-label">{$t('words.game_pin')}</p>
			<p class="lobby-pin select-all" data-ui="host-pin">{game_pin}</p>
		</div>
		<button
			class="qr-button"
			data-ui="host-qr"
			onclick={() => (fullscreen_open = true)}
			aria-label={$t('telekom.enlarge_qr', { defaultValue: 'Enlarge QR code' })}
		>
			<img
				alt={$t('telekom.qr_alt', { defaultValue: 'QR code to join the game' })}
				src="/api/v1/utils/qr/{game_pin}"
			/>
		</button>
		{#if cqc_code}
			<div class="lobby-code">
				<p class="tq-label">
					{$t('telekom.controller_code', { defaultValue: 'Controller code' })}
				</p>
				<ControllerCodeDisplay code={cqc_code} />
			</div>
		{/if}
	</section>

	<section class="tq-panel tq-panel-body">
		<h2 class="tq-section-title lobby-players-heading">
			{$t('words.player_plural')}
			<span class="tq-badge tq-badge-brand">{game_state.players.length}</span>
		</h2>
		{#if game_state.players.length === 0}
			<p class="tq-empty">
				{$t('telekom.waiting_players', { defaultValue: 'Waiting for players' })}
			</p>
		{:else}
			<ul class="roster" data-ui="host-roster">
				{#each game_state.players as player}
					<li>
						<span class="roster-name">{player.username}</span>
						<button
							class="tq-button tq-button-ghost tq-button-danger"
							onclick={() =>
								socket_game_controls.kick_player(
									player.username,
									game_state.players
								)}
							aria-label={`${$t('words.kick')} ${player.username}`}
						>
							{$t('words.kick')}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

{#if fullscreen_open}
	<div
		class="tq-overlay lobby-overlay"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) fullscreen_open = false;
		}}
	>
		<div
			class="tq-dialog lobby-dialog"
			role="dialog"
			aria-modal="true"
			aria-label={$t('words.game_pin')}
		>
			<div class="tq-page-heading">
				<div>
					<p class="tq-label">{$t('words.game_pin')}</p>
					<p class="lobby-pin">{game_pin}</p>
				</div>
				<button
					class="tq-button"
					bind:this={close_button}
					onclick={() => (fullscreen_open = false)}
				>
					{$t('words.close')}
				</button>
			</div>
			<img
				alt={$t('telekom.qr_alt', { defaultValue: 'QR code to join the game' })}
				src="/api/v1/utils/qr/{game_pin}"
				class="lobby-qr-large"
			/>
		</div>
	</div>
{/if}

<style>
	.lobby {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.lobby :global(.tq-page-heading) {
		margin-block-end: 0;
	}

	.lobby-eyebrow {
		margin-block-end: 4px;
		font-size: 14px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.lobby-heading {
		min-width: 0;
	}

	.lobby-start {
		min-height: 56px;
		padding-inline: 32px;
		font-size: 18px;
	}

	.lobby-join {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 24px 48px;
	}

	.lobby-pin-block {
		min-width: 0;
	}

	.lobby-url {
		margin-block-end: 16px;
		font-size: clamp(20px, 2.4vw, 32px);
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.lobby-pin {
		font-size: clamp(44px, 9vw, 112px);
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		letter-spacing: 0.08em;
		line-height: 1.1;
		color: var(--tq-accent);
	}

	.qr-button {
		flex-shrink: 0;
		width: clamp(180px, 22vw, 280px);
		padding: 12px;
		border: 1px solid var(--tq-border);
		border-radius: 12px;
		background: #fff;
	}

	.qr-button img {
		display: block;
		width: 100%;
		height: auto;
	}

	.lobby-code {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.lobby-players-heading {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.roster {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 12px;
		margin: 24px 0 0;
		padding: 0;
		list-style: none;
	}

	.roster li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 52px;
		padding: 4px 4px 4px 16px;
		border: 1px solid var(--tq-border);
		border-radius: 8px;
	}

	.roster-name {
		min-width: 0;
		font-size: 18px;
		overflow-wrap: anywhere;
	}

	.lobby-overlay {
		align-items: center;
		justify-content: center;
	}

	.lobby-dialog {
		max-width: min(720px, calc(100vw - 32px));
	}

	.lobby-dialog .lobby-pin {
		font-size: clamp(32px, 7vw, 56px);
	}

	.lobby-qr-large {
		display: block;
		width: min(100%, 60vh);
		height: auto;
		margin-inline: auto;
		border-radius: 8px;
		background: #fff;
	}

	@media (max-width: 600px) {
		.lobby-start {
			width: 100%;
		}

		.lobby-join {
			flex-direction: column;
			align-items: stretch;
		}

		.qr-button {
			align-self: center;
		}
	}
</style>
