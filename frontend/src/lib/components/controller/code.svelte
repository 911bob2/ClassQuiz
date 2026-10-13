<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	// The colors are the button colors of the physical controller, not theme colors.
	let color_map = {
		r: 'red',
		g: 'green',
		y: 'yellow',
		b: 'blue'
	};
	interface Props {
		code: string;
	}

	let { code }: Props = $props();
</script>

<div class="code" role="img" aria-label={code}>
	{#each code as c}
		<div class="code-key">
			<p class="code-letter">{c}</p>
			<span
				class="code-bar"
				style="background-color: {color_map[c.toLowerCase()]}; height: {c.toLowerCase() == c
					? '2'
					: '4'}rem"
			></span>
		</div>
	{/each}
</div>

<style>
	.code {
		display: flex;
		flex-direction: row;
		gap: 12px;
		margin-inline: auto;
	}

	.code-key {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		gap: 4px;
	}

	.code-letter {
		font-size: 16px;
		font-weight: 700;
		line-height: 1;
	}

	.code-bar {
		display: block;
		width: 2rem;
		border: 1px solid var(--tq-border-strong);
		border-radius: 4px;
	}
</style>
