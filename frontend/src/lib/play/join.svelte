<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { roomEvents } from '$lib/room-socket';
	const listen = roomEvents();
	import { socket, connectRoom } from '$lib/socket';
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { getLocalization } from '$lib/i18n';
	import Cookies from 'js-cookie';
	import { captchaWidget, captchaMessage, type CaptchaPolicy } from '$lib/captcha';

	const { t } = getLocalization();

	interface Props {
		game_pin: string;
		game_mode: any;
		username: any;
	}

	let {
		game_pin = $bindable(),
		game_mode = $bindable(),
		username = $bindable()
	}: Props = $props();
	let custom_field = $state();
	let custom_field_value = $state();
	let captcha_enabled = $state(false);
	let captcha_policy: CaptchaPolicy | null = $state(null);
	let captcha_element: HTMLDivElement;
	let joining = $state(false);
	let join_error = $state('');
	let join_timeout: ReturnType<typeof setTimeout>;
	const verifier = captchaWidget();
	onMount(() => {
		prefetch_username();
	});
	onDestroy(() => {
		clearTimeout(join_timeout);
		verifier.destroy();
	});
	const done = () => {
		joining = false;
		clearTimeout(join_timeout);
	};
	listen('captcha_error', (data) => {
		done();
		join_error = captchaMessage(data.code);
		verifier.reset();
	});
	for (const event of [
		'joined_game',
		'rejoined_game',
		'error',
		'disconnect',
		'room_full',
		'game_already_started',
		'game_not_found'
	])
		listen(event, done);
	listen('username_already_exists', () => {
		done();
		join_error = 'That name is already in use. Please choose another.';
	});

	const prefetch_username = async () => {
		const res = await fetch('/api/v1/users/me');
		if (res.status !== 200) {
			return;
		}
		const json = await res.json();
		username = json.username;
	};

	const set_game_pin = async () => {
		let process_var;
		try {
			process_var = process;
		} catch {
			process_var = { env: { API_URL: undefined } };
		}

		const res = await fetch(
			`${process_var.env.API_URL ?? ''}/api/v1/quiz/play/check_captcha/${game_pin}`
		);
		const json = await res.json();
		game_mode = json.game_mode;
		if (res.status === 200) {
			captcha_enabled = json.enabled;
			captcha_policy = json.captcha_policy;
			custom_field = json.custom_field;
		}
		if (res.status === 404) {
			/*			alertModal.set({
                open: true,
                title: 'Game not found',
                body: 'The game pin you entered seems invalid.'
            });*/
			if (browser) {
				alert('Game not found');
			}
			game_pin = '';
			return;
		}
		if (res.status !== 200) {
			/*			alertModal.set({
                open: true,
                body: `Unknown error with response-code ${res.status}`,
                title: 'Unknown Error'
            });*/
			alert('Unknown error');
			return;
		}
	};

	$effect(() => {
		if (game_pin.length > 5) {
			set_game_pin();
		}
	});

	const setUsername = async (e: Event) => {
		e.preventDefault();
		if (username.length <= 3 || joining) return;
		joining = true;
		join_error = '';
		try {
			const metadata = await connectRoom(game_pin);
			captcha_enabled = metadata.enabled;
			captcha_policy = metadata.captcha_policy;
			let previous: any = {};
			try {
				previous = JSON.parse(Cookies.get('joined_game') || '{}');
			} catch {
				/* replace an invalid cookie */
			}
			const resume_token =
				previous.username === username &&
				previous.game_pin === game_pin &&
				previous.pending &&
				previous.resume_token
					? previous.resume_token
					: crypto.randomUUID() + crypto.randomUUID();
			if (metadata.realtime_engine === 'rust')
				Cookies.set(
					'joined_game',
					JSON.stringify({ username, game_pin, resume_token, pending: true }),
					{ expires: 1, sameSite: 'lax' }
				);
			if (Cookies.get('kicked')) throw new Error('You have been removed from this quiz.');
			let captcha: string | undefined;
			if (captcha_enabled) {
				if (!captcha_policy)
					throw new Error('Verification is not configured. Please contact the host.');
				captcha = await verifier.token(captcha_policy, captcha_element);
			}
			socket.emit('join_game', {
				username,
				game_pin,
				captcha,
				custom_field: custom_field ? custom_field_value : undefined,
				resume_token
			});
			join_timeout = setTimeout(() => {
				done();
				join_error = 'Joining timed out. Please retry.';
			}, 15000);
		} catch (error) {
			done();
			join_error =
				error instanceof Error ? error.message : 'Verification failed. Please retry.';
		}
	};
	listen('game_not_found', () => {
		game_pin = '';
		if (browser) {
			alert('Game not found');
		}
	});
	$effect(() => {
		const cleaned = game_pin.replace(/\D/g, '');
		if (game_pin.replace(/\D/g, '') === game_pin) {
			return;
		}
		game_pin = cleaned;
	});
</script>

<main class="join-screen">
	<div class="join-card tq-panel">
		<div class="join-brand">
			<img src="/telekom/app-icon.svg" alt="" width="36" height="36" />
			<span>Telekom Quiz</span>
		</div>
		<h1 class="join-title">{$t('telekom.join_game', { defaultValue: 'Join game' })}</h1>

		{#if game_pin === '' || game_pin.length < 6}
			<form class="tq-field-group join-form" onsubmit={(e) => e.preventDefault()}>
				<label class="tq-label" for="join-game-pin">{$t('words.game_pin')}</label>
				<input
					id="join-game-pin"
					class="tq-field join-pin"
					bind:value={game_pin}
					maxlength="6"
					inputmode="numeric"
					autocomplete="off"
					aria-describedby="join-pin-hint"
				/>
				<p id="join-pin-hint" class="tq-muted join-hint">
					{$t('telekom.enter_pin_hint', {
						defaultValue: 'Enter the PIN shown on the host screen.'
					})}
				</p>
			</form>
		{:else}
			<form class="join-form" onsubmit={setUsername}>
				<div class="join-pin-summary">
					<span class="tq-muted">{$t('words.game_pin')}</span>
					<strong class="join-pin-value">{game_pin}</strong>
					<button
						type="button"
						class="tq-link join-change"
						data-ui="join-change-pin"
						onclick={() => (game_pin = '')}
					>
						{$t('telekom.change_pin', { defaultValue: 'Change PIN' })}
					</button>
				</div>
				<div class="tq-field-group">
					<label class="tq-label" for="join-username">{$t('words.username')}</label>
					<input
						id="join-username"
						class="tq-field"
						bind:value={username}
						maxlength="17"
						autocomplete="nickname"
						aria-describedby="join-username-hint"
					/>
					<p id="join-username-hint" class="tq-muted join-hint">
						{$t('telekom.username_hint', { defaultValue: 'At least 4 characters.' })}
					</p>
				</div>
				{#if custom_field}
					<div class="tq-field-group">
						<label class="tq-label" for="join-custom-field">{custom_field}</label>
						<input
							id="join-custom-field"
							class="tq-field"
							bind:value={custom_field_value}
						/>
					</div>
				{/if}
				<button
					type="submit"
					class="tq-button tq-button-primary join-submit"
					disabled={username.length <= 3 || joining}
				>
					{joining
						? captcha_enabled
							? 'Verifying�'
							: 'Joining�'
						: $t('telekom.join_game', { defaultValue: 'Join game' })}
				</button>
				{#if join_error}<p role="alert" data-ui="captcha-error" class="tq-muted">
						{join_error}
					</p>{/if}
				{#if captcha_enabled && captcha_policy}
					<p class="tq-muted text-sm">
						Protected by {captcha_policy.provider === 'hcaptcha'
							? 'hCaptcha'
							: 'reCAPTCHA'}.
						<a
							href={captcha_policy.provider === 'hcaptcha'
								? 'https://www.hcaptcha.com/privacy'
								: 'https://policies.google.com/privacy'}
							target="_blank"
							rel="noreferrer">Privacy</a
						>
						�
						<a
							href={captcha_policy.provider === 'hcaptcha'
								? 'https://www.hcaptcha.com/terms'
								: 'https://policies.google.com/terms'}
							target="_blank"
							rel="noreferrer">Terms</a
						>
					</p>
				{/if}
			</form>
		{/if}
	</div>
</main>
<div bind:this={captcha_element} data-ui="captcha-widget"></div>

<style>
	.join-screen {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px 16px;
		background: var(--tq-surface-subtle);
	}

	.join-card {
		width: min(100%, 440px);
		padding: 32px;
		box-shadow: var(--tq-shadow);
	}

	.join-brand {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-block-end: 24px;
		font-weight: 700;
	}

	.join-title {
		margin-block-end: 24px;
		font-size: 28px;
		font-weight: 700;
	}

	.join-form {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.join-pin {
		min-height: 64px;
		font-size: 32px;
		font-weight: 700;
		letter-spacing: 0.3em;
		text-align: center;
	}

	.join-hint {
		margin: 0;
		font-size: 14px;
	}

	.join-pin-summary {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 12px;
		padding: 12px 16px;
		border-radius: 8px;
		background: var(--tq-surface-subtle);
	}

	.join-pin-value {
		font-size: 20px;
		letter-spacing: 0.15em;
	}

	.join-change {
		margin-inline-start: auto;
		min-height: 44px;
		padding: 0 4px;
		background: none;
		border: 0;
		font-size: 14px;
		font-weight: 700;
	}

	.join-submit {
		width: 100%;
		min-height: 52px;
	}

	@media (max-width: 480px) {
		.join-card {
			padding: 24px 20px;
		}
	}
</style>
