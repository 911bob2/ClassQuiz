<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->
<script lang="ts">
	import { Dashboard as SvelteDashboard } from '@uppy/svelte';
	import Uppy from '@uppy/core';
	import DropTarget from '@uppy/drop-target';
	import XHRUpload from '@uppy/xhr-upload';
	import ImageEditor from '@uppy/image-editor';
	import Dashboard from '@uppy/dashboard';
	import Compressor from '@uppy/compressor';
	import { fade } from 'svelte/transition';

	// CSS imports
	import '@uppy/core/dist/style.css';
	import '@uppy/dashboard/dist/style.css';
	import '@uppy/drop-target/dist/style.css';
	import '@uppy/image-editor/dist/style.css';
	import type { EditorData } from '../quiz_types';
	import { getLocalization } from '$lib/i18n';
	import { onMount } from 'svelte';
	import Library from '$lib/editor/uploader/Library.svelte';
	import Pixabay from '$lib/editor/uploader/Pixabay.svelte';
	import Icon from '$lib/editor/Icon.svelte';
	import { modal } from '$lib/editor/modal';

	const { t } = getLocalization();
	let {
		modalOpen = $bindable(),
		data,
		selected_question,
		video_upload = false,
		library_enabled = true
	}: {
		modalOpen: boolean;
		data: EditorData;
		selected_question?: number;
		video_upload: boolean;
		library_enabled?: boolean;
	} = $props();

	// eslint-disable-next-line no-undef
	let video_popup: null | WindowProxy = $state(null);

	let selected_type: AvailableUploadTypes | null = $state(null);

	// eslint-disable-next-line no-unused-vars
	enum AvailableUploadTypes {
		// eslint-disable-next-line no-unused-vars
		Image,
		// eslint-disable-next-line no-unused-vars
		Video,
		// eslint-disable-next-line no-unused-vars
		Library,
		// eslint-disable-next-line no-unused-vars
		Pixabay
	}

	const uppy = new Uppy()
		.use(DropTarget, {
			target: document.body
		})
		.use(Dashboard)
		.use(ImageEditor, {
			target: Dashboard,
			quality: 0.8
		})
		.use(Compressor, {
			quality: 0.6
		})
		.use(XHRUpload, {
			endpoint: `/api/v1/storage/`
		});
	const properties = {
		inline: true,
		restrictions: {
			maxFileSize: 10_490_000,
			maxNumberOfFiles: 1,
			allowedFileTypes: ['image/*']
			// allowedFileTypes: ['.gif', '.jpg', '.jpeg', '.png', '.svg', '.webp']
		}
	};
	let image_id: string;
	uppy.on('upload-success', (file, response) => {
		image_id = response.body.id;
	});
	uppy.on('complete', (_) => {
		if (!image_id) {
			return;
		}
		if (selected_question === undefined) {
			data.cover_image = image_id;
		} else if (selected_question === -1) {
			data.background_image = image_id;
		} else {
			data.questions[selected_question].image = image_id;
		}

		modalOpen = false;
		selected_type = null;
	});

	onMount(() => {
		const handle_storage = (e: StorageEvent) => {
			if (e.key !== 'video_upload_id') {
				return;
			}
			localStorage.removeItem('video_upload_id');
			if (selected_question !== undefined && selected_question >= 0) {
				data.questions[selected_question].image = e.newValue;
			} else {
				data.cover_image = e.newValue;
			}
			modalOpen = false;
			selected_type = null;
		};
		window.addEventListener('storage', handle_storage);
		return () => window.removeEventListener('storage', handle_storage);
	});

	const upload_video = async () => {
		video_popup = window.open(
			'/edit/videos',
			'_blank',
			'popup=true,toolbar=false,menubar=false,location=false,'
		);
		video_popup?.addEventListener('beforeunload', () => {
			video_popup = null;
		});
	};

	const close = () => {
		modalOpen = false;
		selected_type = null;
	};

	const handle_on_click = (e: Event) => {
		if (e.target === e.currentTarget) {
			close();
		}
	};
</script>

{#if modalOpen}
	<div
		class="tq-overlay"
		onclick={handle_on_click}
		role="presentation"
		use:modal={{ onclose: close }}
		transition:fade={{ duration: 100 }}
	>
		<div
			class="tq-dialog upload-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="upload-title"
			data-ui="upload-dialog"
		>
			<div class="dialog-heading">
				<h2 id="upload-title" class="tq-section-title">
					{$t('uploader.select_upload_type')}
				</h2>
				<button
					type="button"
					class="tq-icon-button tq-button-ghost"
					aria-label={$t('words.close')}
					onclick={close}
				>
					<Icon name="close" />
				</button>
			</div>
			<div class="upload-sources" role="group" aria-label={$t('uploader.select_upload_type')}>
				<button
					type="button"
					class="tq-button"
					class:selected={selected_type === AvailableUploadTypes.Image}
					aria-pressed={selected_type === AvailableUploadTypes.Image}
					data-ui="upload-source-image"
					data-autofocus
					onclick={() => (selected_type = AvailableUploadTypes.Image)}
				>
					{$t('words.image')}
				</button>
				<button
					type="button"
					class="tq-button"
					class:selected={selected_type === AvailableUploadTypes.Video}
					aria-pressed={selected_type === AvailableUploadTypes.Video}
					data-ui="upload-source-video"
					disabled={!video_upload}
					onclick={() => (selected_type = AvailableUploadTypes.Video)}
				>
					{$t('words.video')}
				</button>
				{#if library_enabled}
					<button
						type="button"
						class="tq-button"
						class:selected={selected_type === AvailableUploadTypes.Library}
						aria-pressed={selected_type === AvailableUploadTypes.Library}
						data-ui="upload-source-library"
						onclick={() => (selected_type = AvailableUploadTypes.Library)}
					>
						{$t('words.library')}
					</button>
				{/if}
				<button
					type="button"
					class="tq-button"
					class:selected={selected_type === AvailableUploadTypes.Pixabay}
					aria-pressed={selected_type === AvailableUploadTypes.Pixabay}
					data-ui="upload-source-pixabay"
					onclick={() => (selected_type = AvailableUploadTypes.Pixabay)}
				>
					Pixabay
				</button>
			</div>
			<div class="upload-content">
				{#if selected_type === AvailableUploadTypes.Image}
					<SvelteDashboard {uppy} width="100%" {properties} />
				{:else if selected_type === AvailableUploadTypes.Video}
					<h3 class="tq-label">{$t('uploader.upload_a_video')}</h3>
					{#if video_popup}
						<p role="status">{$t('uploader.upload_video_popup_notice')}</p>
					{:else}
						<button
							type="button"
							class="tq-button tq-button-primary"
							onclick={upload_video}
						>
							{$t('uploader.upload_video')}
						</button>
					{/if}
				{:else if selected_type === AvailableUploadTypes.Library}
					<Library bind:data {selected_question} bind:modalOpen />
				{:else if selected_type === AvailableUploadTypes.Pixabay}
					<Pixabay bind:data {selected_question} bind:modalOpen />
				{/if}
			</div>
		</div>
	</div>
{/if}
<button
	type="button"
	class="tq-button upload-trigger"
	data-ui="upload-open"
	onclick={() => (modalOpen = true)}
>
	<Icon name="image" />
	{$t('uploader.add_image')}
</button>

<style>
	.dialog-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 20px;
	}
	.upload-dialog {
		max-width: min(900px, calc(100vw - 32px));
	}
	.upload-sources {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.upload-sources .selected {
		color: var(--tq-accent);
		border-color: var(--tq-accent);
		background: var(--tq-brand-soft);
	}
	.upload-content:not(:empty) {
		margin-top: 24px;
	}
	.upload-content :global(.uppy-Dashboard-inner) {
		width: 100% !important;
		max-width: 100%;
		border-radius: 8px;
	}
	.upload-content :global(.uppy-Dashboard-browse) {
		color: var(--tq-accent);
	}
	.upload-trigger {
		width: 100%;
		min-height: 88px;
		border-style: dashed;
		color: var(--tq-muted);
	}
	.upload-trigger:hover {
		border-color: var(--tq-accent);
		color: var(--tq-accent);
		background: var(--tq-brand-soft);
	}
</style>
