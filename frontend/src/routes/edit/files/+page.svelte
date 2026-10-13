<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { PageData } from './$types';
	import { fade } from 'svelte/transition';
	// import MediaComponent from '$lib/editor/MediaComponent.svelte';

	import Uploader from './uploader.svelte';
	import Icon from '$lib/editor/Icon.svelte';
	import { modal } from '$lib/editor/modal';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	let edit_popup = $state(null);
	const images = data.images;

	const close_popup_handler = (e: Event) => {
		if (e.target !== e.currentTarget) return;
		edit_popup = null;
	};

	const save_image_metadata = async (e: Event) => {
		e.preventDefault();
		await fetch(`/api/v1/storage/meta/${edit_popup.id}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ filename: edit_popup.filename, alt_text: edit_popup.alt_text })
		});
		edit_popup = null;
		window.location.reload();
	};

	const delete_image = async (id: string) => {
		await fetch(`/api/v1/storage/meta/${id}`, { method: 'DELETE' });
		window.location.reload();
	};

	const storage_percent = Math.min(
		100,
		(data.storage_usage.used / data.storage_usage.limit) * 100
	);
</script>

<svelte:head>
	<title>Telekom Quiz - {$t('words.files_library')}</title>
</svelte:head>

<main class="tq-page" data-ui="file-dashboard">
	<div class="tq-page-heading">
		<h1 class="tq-page-title">{$t('words.files_library')}</h1>
		<a href="/dashboard" class="tq-button">
			<Icon name="arrow-left" />
			{$t('words.back')}
		</a>
	</div>

	<section class="storage-panel tq-panel tq-panel-body">
		<div class="storage-usage">
			<p class="storage-text">
				{$t('file_dashboard.storage_usage', {
					used: (data.storage_usage.used / (1024 * 1024)).toFixed(2),
					total: (data.storage_usage.limit / (1024 * 1024)).toFixed(0),
					percent: ((data.storage_usage.used / data.storage_usage.limit) * 100).toFixed(0)
				})}
			</p>
			<div
				class="storage-meter"
				role="progressbar"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={Math.round(storage_percent)}
			>
				<span style:width="{storage_percent}%"></span>
			</div>
		</div>
		<Uploader />
	</section>

	<div class="file-grid">
		{#each images as image}
			<article class="tq-panel file-card" data-ui="file-card">
				<div class="file-preview">
					<img
						src="/api/v1/storage/download/{image.id}"
						alt={image.alt_text || $t('file_dashboard.not_available')}
						loading="lazy"
					/>
				</div>
				<div class="file-details">
					<h2>{image.filename ?? $t('file_dashboard.unset')}</h2>
					<p class="tq-muted">
						{$t('file_dashboard.size', {
							size: (image.size / (1024 * 1024)).toFixed(2)
						})}
					</p>
					<p>
						{$t('file_dashboard.caption', {
							caption: image.alt_text ?? $t('file_dashboard.unset')
						})}
					</p>
					<p class="tq-muted file-meta">
						{$t('file_dashboard.uploaded', {
							date: new Date(image.uploaded_at).toLocaleString()
						})}
					</p>
					<p class="tq-muted file-meta">
						{$t('file_dashboard.imported', {
							yes_or_no: image.imported ? $t('words.yes') : $t('words.no')
						})}
					</p>
					<div class="tq-toolbar file-actions">
						<button
							type="button"
							class="tq-button"
							data-ui="file-edit-details"
							onclick={() => (edit_popup = image)}
						>
							<Icon name="pencil" />
							{$t('file_dashboard.edit_details')}
						</button>
						{#if image.quiztivities.length === 0 && image.quizzes.length === 0}
							<button
								type="button"
								class="tq-button tq-button-danger"
								data-ui="file-delete"
								onclick={() => delete_image(image.id)}
							>
								<Icon name="trash" />
								{$t('file_dashboard.delete_image')}
							</button>
						{/if}
					</div>
				</div>
			</article>
		{:else}
			<p class="tq-empty file-empty">
				{$t('telekom.no_files', { defaultValue: 'No files' })}
			</p>
		{/each}
	</div>
</main>

{#if edit_popup}
	<div
		class="tq-overlay"
		onclick={close_popup_handler}
		role="presentation"
		use:modal={{ onclose: () => (edit_popup = null) }}
		transition:fade={{ duration: 100 }}
	>
		<div
			class="tq-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="file-meta-title"
			data-ui="file-metadata-dialog"
		>
			<div class="dialog-heading">
				<h2 id="file-meta-title" class="tq-section-title">
					{$t('file_dashboard.edit_the_image')}
				</h2>
				<button
					type="button"
					class="tq-icon-button tq-button-ghost"
					aria-label={$t('words.close')}
					onclick={() => (edit_popup = null)}
				>
					<Icon name="close" />
				</button>
			</div>
			<form onsubmit={save_image_metadata} class="tq-stack metadata-form">
				<label>
					<span class="tq-label">{$t('file_dashboard.filename_word')}</span>
					<input
						class="tq-field"
						type="text"
						data-autofocus
						bind:value={edit_popup.filename}
					/>
				</label>
				<label>
					<span class="tq-label">{$t('file_dashboard.alt_text')}</span>
					<input class="tq-field" type="text" bind:value={edit_popup.alt_text} />
				</label>
				<div class="tq-toolbar">
					<button type="submit" class="tq-button tq-button-primary">
						{$t('words.save')}
					</button>
					<button type="button" class="tq-button" onclick={() => (edit_popup = null)}>
						{$t('words.close')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.storage-panel {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 260px;
		gap: 24px;
		align-items: center;
		margin-bottom: 24px;
	}
	.storage-text {
		margin: 0 0 12px;
		font-weight: 500;
	}
	.storage-meter {
		height: 8px;
		overflow: hidden;
		border-radius: 4px;
		background: var(--tq-surface-hover);
	}
	.storage-meter span {
		display: block;
		height: 100%;
		background: var(--tq-brand);
	}
	.file-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
	}
	.file-card {
		overflow: hidden;
	}
	.file-preview {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 200px;
		padding: 16px;
		overflow: hidden;
		background: var(--tq-surface-subtle);
		border-bottom: 1px solid var(--tq-border);
	}
	.file-preview img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	.file-details {
		padding: 20px;
		overflow-wrap: anywhere;
	}
	.file-details h2 {
		margin-bottom: 8px;
		font-size: 20px;
		font-weight: 700;
	}
	.file-details p {
		margin: 0 0 4px;
	}
	.file-meta {
		font-size: 14px;
	}
	.file-actions {
		margin-top: 16px;
	}
	.file-empty {
		grid-column: 1 / -1;
	}
	.dialog-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 20px;
	}

	@media (max-width: 767px) {
		.storage-panel,
		.file-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.storage-panel {
			gap: 16px;
		}
	}
</style>
