<!-- SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
SPDX-License-Identifier: MPL-2.0 -->
<script lang="ts">
	interface Props {
		headerText: string;
		expanded?: boolean;
		children?: import('svelte').Snippet;
	}
	let { headerText, expanded = $bindable(false), children }: Props = $props();
	const id = $props.id();
</script>

<section class="tq-panel overflow-hidden">
	<h3>
		<button
			type="button"
			class="tq-disclosure"
			aria-expanded={expanded}
			aria-controls={id}
			onclick={() => (expanded = !expanded)}
		>
			<span>{@html headerText}</span>
			<svg
				aria-hidden="true"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.7"
			>
				<path d="M5 12h14" />{#if !expanded}<path d="M12 5v14" />{/if}
			</svg>
		</button>
	</h3>
	<div {id} hidden={!expanded} class="tq-disclosure-body">{@render children?.()}</div>
</section>

<style>
	.tq-disclosure {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		padding: 16px;
		min-height: 56px;
		text-align: start;
		font-size: 16px;
	}
	.tq-disclosure:hover {
		background: var(--tq-surface-subtle);
	}
	.tq-disclosure[aria-expanded='true'] {
		border-bottom: 1px solid var(--tq-border);
	}
	.tq-disclosure-body {
		padding: 16px;
	}
</style>
