<!-- SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
SPDX-License-Identifier: MPL-2.0 -->
<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import Navbar from '$lib/navbar.svelte';
	import { pathname } from '$lib/stores';
	import { navbarVisible } from '$lib/stores.svelte';
	import { initLocalizationContext } from '$lib/i18n';
	import { browser } from '$app/environment';
	import CommandPalette from '$lib/components/commandpalette.svelte';
	import { initializeTheme } from '$lib/theme.svelte';
	interface Props {
		children?: import('svelte').Snippet;
	}
	let { children }: Props = $props();
	if (browser) pathname.set(window.location.pathname);
	const startLanguage = browser ? (localStorage.getItem('language') ?? 'en') : 'en';
	if (browser) {
		document.documentElement.lang = startLanguage;
		document.documentElement.dir = ['he', 'prs', 'ps'].includes(startLanguage) ? 'rtl' : 'ltr';
	}
	initLocalizationContext(startLanguage);
	onMount(initializeTheme);
</script>

{#if navbarVisible.visible}
	<Navbar />
{/if}
<div id="main-content" tabindex="-1">
	{@render children?.()}
</div>
<CommandPalette />
