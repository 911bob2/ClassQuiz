<script lang="ts">
	import type { Component } from 'svelte';
	import Nest from './Nest.svelte';

	interface Props {
		layouts: Component<any>[];
		Screen: Component<any>;
		screenProps: Record<string, unknown>;
	}
	let { layouts, Screen, screenProps }: Props = $props();
	const [Outer, ...rest] = layouts;
</script>

{#if Outer}
	<Outer>
		<Nest layouts={rest} {Screen} {screenProps} />
	</Outer>
{:else}
	<Screen {...screenProps} />
{/if}
