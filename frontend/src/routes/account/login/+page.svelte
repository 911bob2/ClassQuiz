<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { alertModal } from '$lib/stores';
	import { navbarVisible } from '$lib/stores.svelte';
	import { slide } from 'svelte/transition';
	import Footer from '$lib/footer.svelte';
	import { getLocalization } from '$lib/i18n';
	import VerifiedBadge from './verified_badge.svelte';
	import StartWindow from './start_window.svelte';
	import SelectMethod from './select_method.svelte';
	import PasswordComponent from './password_component.svelte';
	import WebauthnComponent from './webauthn_component.svelte';
	import BackupComponent from './backup_component.svelte';
	import TotpComponent from './totp_component.svelte';
	import { browserSupportsWebAuthn } from '@simplewebauthn/browser';

	navbarVisible.visible = true;
	const { t } = getLocalization();

	let { data } = $props();
	let { verified } = data;

	let session_data: any = $state({});
	let step = $state(0);
	let selected_method = $state(null);
	let done = $state(false);

	const redirect_back = (done_var: boolean) => {
		if (done_var) {
			setTimeout(() => {
				window.location.reload();
			}, 100);
		}
	};
	let alertModalOpen = false;
	$effect(() => {
		redirect_back(done);
	});

	alertModal.subscribe((data) => {
		if (!alertModalOpen && data.open) {
			alertModalOpen = true;
		}
		if (alertModalOpen && !data.open) {
			window.location.reload();
		}
	});

	const check_auto = (stp: number) => {
		if (stp === 1) {
			if (!browserSupportsWebAuthn()) {
				for (let i = 0; i < session_data.step_1.length; i++) {
					if (session_data.step_1[i] === 'PASSKEY') {
						session_data.step_1.splice(i, 1);
					}
				}
				session_data.step_1 = session_data.step_1;
			}
			if (session_data.step_1.length === 1) {
				selected_method = session_data.step_1[0];
			}
		}
		if (stp === 2) {
			if (!browserSupportsWebAuthn()) {
				for (let i = 0; i < session_data.step_2.length; i++) {
					if (session_data.step_2[i] === 'PASSKEY') {
						session_data.step_2.splice(i, 1);
					}
				}
				session_data.step_2 = session_data.step_2;
			}
			if (session_data.step_2.length === 1) {
				selected_method = session_data.step_2[0];
			}
		}
	};
	$effect(() => check_auto(step));
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('words.login')}</title>
</svelte:head>

{#if verified}
	<VerifiedBadge />
{/if}

{#if step === 0}
	<div transition:slide|global>
		<StartWindow bind:session_data bind:step />
	</div>
{:else if selected_method === null}
	<div transition:slide|global>
		<SelectMethod {session_data} {step} bind:selected_method />
	</div>
{:else if selected_method === 'PASSWORD'}
	<div transition:slide|global>
		<PasswordComponent {session_data} bind:done bind:step bind:selected_method />
	</div>
{:else if selected_method === 'PASSKEY'}
	<div transition:slide|global>
		<WebauthnComponent {session_data} bind:done bind:step bind:selected_method />
	</div>
{:else if selected_method === 'BACKUP'}
	<div transition:slide|global>
		<BackupComponent {session_data} bind:done bind:step bind:selected_method />
	</div>
{:else if selected_method === 'TOTP'}
	<div transition:slide|global>
		<TotpComponent {session_data} bind:done bind:step bind:selected_method />
	</div>
{/if}
<Footer />
