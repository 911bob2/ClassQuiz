<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { socket } from '$lib/socket';
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import * as Sentry from '@sentry/browser';
	import { getLocalization } from '$lib/i18n';
	import Cookies from 'js-cookie';
	import { hcaptcha_site_key, recaptcha_key, sentry_dsn } from '$lib/config';

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
	let captcha_enabled = $state();

	let hcaptchaSitekey = hcaptcha_site_key;

	let hcaptcha = {
		execute: async (_a, _b) => ({ response: '' }), // eslint-disable-line @typescript-eslint/no-unused-vars
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		render: (_a, _b) => {} // eslint-disable-line @typescript-eslint/no-unused-vars
	};
	let hcaptchaWidgetID;

	onMount(() => {
		if (browser) {
			prefetch_username();
			hcaptcha = (window as any).hcaptcha;
			if (hcaptcha.render) {
				hcaptchaWidgetID = hcaptcha.render('hcaptcha', {
					sitekey: hcaptchaSitekey,
					size: 'invisible',
					theme: 'dark'
				});
			}
		}
	});

	onDestroy(() => {
		if (browser) {
			hcaptcha = {
				execute: async () => ({ response: '' }),
				// eslint-disable-next-line @typescript-eslint/no-empty-function
				render: () => {}
			};
		}
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
		if (username.length <= 3) {
			return;
		}
		let captcha_resp: string;
		if (Cookies.get('kicked')) {
			console.log("%cYou're Banned!", 'font-size:6rem');
			return;
		}

		if (captcha_enabled) {
			if (hcaptchaSitekey) {
				try {
					const { response } = await hcaptcha.execute(hcaptchaWidgetID, {
						async: true
					});
					captcha_resp = response;
					socket.emit('join_game', {
						username: username,
						game_pin: game_pin,
						captcha: captcha_resp,
						custom_field: custom_field ? custom_field_value : undefined
					});
				} catch (e) {
					if (sentry_dsn !== null) {
						Sentry.captureException(e);
					}
					/*					alertModal.set({
                        open: true,
                        body: "The captcha failed, which is normal, but most of the time it's fixed by reloading!",
                        title: 'Captcha failed'
                    });*/
					alert('Captcha failed!');
					window.location.reload();
				}
			} else if (recaptcha_key) {
				// eslint-disable-next-line no-undef
				(window as any).grecaptcha.ready(() => {
					// eslint-disable-next-line no-undef
					(window as any).grecaptcha
						.execute(recaptcha_key, { action: 'submit' })
						.then(function (token) {
							socket.emit('join_game', {
								username: username,
								game_pin: game_pin,
								captcha: token,
								custom_field: custom_field ? custom_field_value : undefined
							});
						});
				});
			}
		} else {
			socket.emit('join_game', {
				username: username,
				game_pin: game_pin,
				captcha: undefined,
				custom_field: custom_field ? custom_field_value : undefined
			});
		}
	};
	socket.on('game_not_found', () => {
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

<svelte:head>
	{#if captcha_enabled && hcaptchaSitekey}
		<script src="https://js.hcaptcha.com/1/api.js" async defer></script>
	{/if}
	{#if recaptcha_key && captcha_enabled}
		<script src="https://www.google.com/recaptcha/api.js?render={recaptcha_key}"></script>
	{/if}
</svelte:head>

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
					disabled={username.length <= 3}
				>
					{$t('telekom.join_game', { defaultValue: 'Join game' })}
				</button>
			</form>
		{/if}
	</div>
</main>
<div
	id="hcaptcha"
	class="h-captcha"
	data-sitekey={hcaptchaSitekey}
	data-size="invisible"
	data-theme="dark"
></div>

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
