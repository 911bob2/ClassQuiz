<!-- SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
SPDX-License-Identifier: MPL-2.0 -->
<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import { signedIn } from '$lib/stores';
	import { page } from '$app/stores';
	import { beforeNavigate } from '$app/navigation';
	import { registration_disabled } from './config';
	import { theme, setTheme } from '$lib/theme.svelte';
	import LanguageToggle from './language-toggle.svelte';
	const { t } = getLocalization();
	let menuOpen = $state(false);
	beforeNavigate(() => {
		menuOpen = false;
	});
	const active = (path: string) => $page.url.pathname.startsWith(path);
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') menuOpen = false;
	}}
/>
<a href="#main-content" class="tq-button tq-skip-link">{$t('ui.skip_to_content')}</a>
<header class="tq-header">
	<div class="tq-header-inner">
		<a href="/" class="tq-brand" aria-label="Telekom Quiz">
			<span class="tq-brand-mark"
				><img src="/telekom/t-logo.svg" alt="" width="25" height="29" /></span
			>
			<span>Telekom Quiz</span>
		</a>
		<nav class="tq-desktop-nav" aria-label={$t('ui.navigation')}>
			{@render links()}
		</nav>
		<div class="tq-header-actions">
			<button
				type="button"
				class="tq-icon-button tq-button-ghost"
				onclick={() => setTheme(!theme.dark)}
				aria-label={theme.dark ? $t('ui.light_mode') : $t('ui.dark_mode')}
				title={theme.dark ? $t('ui.light_mode') : $t('ui.dark_mode')}
			>
				{#if theme.dark}
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.7"
						><circle cx="12" cy="12" r="4" /><path
							d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"
						/></svg
					>
				{:else}
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.7"
						><path d="M20.8 13.4A9 9 0 0 1 10.6 3.2 9 9 0 1 0 20.8 13.4Z" /></svg
					>
				{/if}
			</button>
			<div class="tq-desktop-account">
				{#if $signedIn}
					<a
						href="/account/settings"
						class="tq-nav-link"
						aria-current={active('/account/settings') ? 'page' : undefined}
						>{$t('ui.account')}</a
					>
					<a href="/api/v1/users/logout" class="tq-button">{$t('words.logout')}</a>
				{:else}
					{#if registration_disabled}<a href="/account/register" class="tq-nav-link"
							>{$t('words.register')}</a
						>{/if}
					<a
						href="/account/login?returnTo={encodeURIComponent($page.url.pathname)}"
						class="tq-button tq-button-primary">{$t('words.login')}</a
					>
				{/if}
			</div>
			<button
				type="button"
				class="tq-icon-button tq-mobile-toggle"
				aria-label={$t('ui.menu')}
				aria-expanded={menuOpen}
				aria-controls="mobile-navigation"
				onclick={() => (menuOpen = !menuOpen)}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.7"
				>
					{#if menuOpen}<path d="m6 6 12 12M6 18 18 6" />{:else}<path
							d="M4 6h16M4 12h16M4 18h16"
						/>{/if}
				</svg>
			</button>
		</div>
	</div>
	{#if menuOpen}
		<nav id="mobile-navigation" class="tq-mobile-nav" aria-label={$t('ui.navigation')}>
			{@render links()}
			{#if $signedIn}
				<a href="/account/settings" class="tq-nav-link">{$t('ui.account')}</a>
				<a href="/api/v1/users/logout" class="tq-nav-link">{$t('words.logout')}</a>
			{:else}
				<a
					href="/account/login?returnTo={encodeURIComponent($page.url.pathname)}"
					class="tq-nav-link">{$t('words.login')}</a
				>
				{#if registration_disabled}<a href="/account/register" class="tq-nav-link"
						>{$t('words.register')}</a
					>{/if}
			{/if}
			<LanguageToggle />
		</nav>
	{/if}
</header>

{#snippet links()}
	<a href="/play" class="tq-nav-link" aria-current={active('/play') ? 'page' : undefined}
		>{$t('words.play')}</a
	>
	<a href="/explore" class="tq-nav-link" aria-current={active('/explore') ? 'page' : undefined}
		>{$t('words.explore')}</a
	>
	<a href="/search" class="tq-nav-link" aria-current={active('/search') ? 'page' : undefined}
		>{$t('words.search')}</a
	>
	{#if $signedIn}
		<a
			href="/dashboard"
			class="tq-nav-link"
			aria-current={active('/dashboard') ? 'page' : undefined}>{$t('words.dashboard')}</a
		>
	{:else}
		<a href="/docs" class="tq-nav-link" aria-current={active('/docs') ? 'page' : undefined}
			>{$t('words.docs')}</a
		>
	{/if}
{/snippet}

<style>
	.tq-header {
		position: sticky;
		top: 0;
		z-index: 40;
		background: var(--tq-surface);
		border-bottom: 1px solid var(--tq-border);
	}
	.tq-header-inner {
		height: 64px;
		display: flex;
		align-items: center;
		gap: 32px;
		max-width: 1440px;
		margin-inline: auto;
		padding-inline: 24px;
	}
	.tq-brand {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		white-space: nowrap;
		font-size: 21px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.tq-brand-mark {
		display: grid;
		place-items: center;
		background: #e20074;
		width: 40px;
		height: 44px;
	}
	.tq-desktop-nav {
		display: flex;
		align-items: stretch;
		height: 100%;
		gap: 20px;
	}
	.tq-header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-inline-start: auto;
	}
	.tq-desktop-account {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.tq-nav-link {
		display: flex;
		align-items: center;
		min-height: 44px;
		color: var(--tq-muted);
		font-weight: 700;
		border-bottom: 3px solid transparent;
		padding: 8px 0 5px;
	}
	.tq-nav-link:hover {
		color: var(--tq-text);
	}
	.tq-nav-link[aria-current='page'] {
		color: var(--tq-accent);
		border-color: var(--tq-accent);
	}
	.tq-mobile-toggle,
	.tq-mobile-nav {
		display: none;
	}
	@media (max-width: 1023px) {
		.tq-header-inner {
			padding-inline: 16px;
			gap: 12px;
		}
		.tq-desktop-nav,
		.tq-desktop-account {
			display: none;
		}
		.tq-mobile-toggle {
			display: inline-flex;
		}
		.tq-mobile-nav {
			display: flex;
			flex-direction: column;
			gap: 4px;
			padding: 12px 24px 24px;
			border-top: 1px solid var(--tq-border);
			max-height: calc(100dvh - 64px);
			overflow: auto;
		}
		.tq-mobile-nav .tq-nav-link {
			padding-inline: 12px;
		}
		.tq-mobile-nav .tq-nav-link[aria-current='page'] {
			background: var(--tq-brand-soft);
			border-bottom-color: transparent;
			border-radius: 8px;
		}
	}
	@media (max-width: 380px) {
		.tq-brand {
			font-size: 18px;
			gap: 8px;
		}
	}
</style>
