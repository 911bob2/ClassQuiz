<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		subtitle?: string;
		data_ui?: string;
		children?: Snippet;
		below?: Snippet;
	}

	let { title, subtitle, data_ui, children, below }: Props = $props();
	const title_id = $props.id();
</script>

<main class="auth-wrap">
	<div class="auth-column">
		<section
			class="tq-panel tq-panel-body auth-card"
			aria-labelledby={title_id}
			data-ui={data_ui}
		>
			<header class="auth-header">
				<h1 class="tq-page-title" id={title_id}>{title}</h1>
				{#if subtitle}
					<p class="tq-muted">{subtitle}</p>
				{/if}
			</header>
			{@render children?.()}
		</section>
		{#if below}
			<div class="auth-below">
				{@render below()}
			</div>
		{/if}
	</div>
</main>

<style>
	.auth-wrap {
		display: flex;
		justify-content: center;
		padding: 40px 16px 48px;
	}
	.auth-column {
		display: grid;
		gap: 16px;
		width: 100%;
		max-width: 440px;
	}
	.auth-card {
		display: grid;
		gap: 24px;
	}
	.auth-header {
		display: grid;
		gap: 8px;
	}
	.auth-below {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		justify-content: center;
		font-size: 14px;
	}
	@media (max-width: 767px) {
		.auth-wrap {
			padding-block: 24px 32px;
		}
	}
</style>
