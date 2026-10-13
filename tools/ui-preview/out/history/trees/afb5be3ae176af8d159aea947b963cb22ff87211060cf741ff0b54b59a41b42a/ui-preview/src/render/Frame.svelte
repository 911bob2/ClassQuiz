<!--
Renders one scenario: [root +layout.svelte] > [nested layouts...] > page/component
-->
<script lang="ts">
	import type { Component } from 'svelte';
	import RootLayout from '$routes/+layout.svelte';
	import Nest from './Nest.svelte';
	import { initLocalizationContext } from '$lib/i18n';

	interface Props {
		Screen: Component<any>;
		screenProps: Record<string, unknown>;
		useRootLayout: boolean;
		layouts: Component<any>[];
		lang: string;
	}
	let { Screen, screenProps, useRootLayout, layouts, lang }: Props = $props();

	// Without the root layout we still need the i18n context the components expect.
	if (!useRootLayout) initLocalizationContext(lang);
</script>

{#if useRootLayout}
	<RootLayout>
		<Nest {layouts} {Screen} {screenProps} />
	</RootLayout>
{:else}
	<Nest {layouts} {Screen} {screenProps} />
{/if}
