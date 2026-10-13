<!-- SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
SPDX-License-Identifier: MPL-2.0 -->
<script lang="ts">
	interface Props {
		disabled?: boolean;
		flex?: boolean;
		href?: string;
		target?: string;
		type?: 'button' | 'submit' | 'reset';
		children?: import('svelte').Snippet;
		onclick?: (event: MouseEvent) => void;
	}
	// Preserve the native submit default used by existing forms.
	let {
		disabled = false,
		flex = false,
		href,
		target = '_self',
		type = 'submit',
		children,
		onclick
	}: Props = $props();
</script>

{#if href}
	<a
		href={disabled ? undefined : href}
		{target}
		aria-disabled={disabled || undefined}
		tabindex={disabled ? -1 : undefined}
		class="tq-button w-full"
		{onclick}
	>
		{@render children?.()}
	</a>
{:else}
	<button {disabled} {type} class="tq-button w-full" {onclick}>
		{@render children?.()}
	</button>
{/if}
