<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		title: string;
		description: string;
		cover_image: string | undefined;
		username?: string;
	}

	let { title, description, cover_image, username }: Props = $props();
</script>

<main class="tq-page tq-page-narrow title-screen" data-ui="player-waiting">
	<section class="tq-panel tq-panel-body tq-stack">
		<div>
			<h1 class="tq-page-title">{@html title}</h1>
			{#if description}
				<div class="tq-prose title-description">{@html description}</div>
			{/if}
		</div>
		{#if cover_image}
			<img
				class="title-cover"
				src="/api/v1/storage/download/{cover_image}"
				alt={$t('telekom.cover_image', { defaultValue: 'Cover image' })}
			/>
		{/if}
		<div class="tq-alert title-status" role="status">
			<strong
				>{$t('telekom.waiting_for_host', {
					defaultValue: 'Waiting for the host to start'
				})}</strong
			>
			{#if username}
				<span class="tq-muted">
					{$t('telekom.playing_as', {
						username,
						defaultValue: 'Playing as {{username}}'
					})}
				</span>
			{/if}
		</div>
	</section>
</main>

<style>
	.title-screen {
		display: flex;
		align-items: center;
		min-height: 100dvh;
	}

	.title-screen > section {
		width: 100%;
	}

	.title-description {
		margin-block-start: 12px;
		font-size: 18px;
	}

	.title-cover {
		display: block;
		max-height: 40vh;
		width: auto;
		margin-inline: auto;
		border-radius: 8px;
		object-fit: contain;
	}

	.title-status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 4px 16px;
	}
</style>
