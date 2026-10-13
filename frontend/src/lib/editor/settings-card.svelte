<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { EditorData } from '$lib/quiz_types';
	import { reach } from 'yup';
	import { dataSchema } from '$lib/yupSchemas';
	import { getLocalization } from '$lib/i18n';
	import Spinner from '$lib/Spinner.svelte';
	import AnswerColor from '$lib/editor/AnswerColor.svelte';
	import Icon from '$lib/editor/Icon.svelte';

	const { t } = getLocalization();

	let uppyOpen = $state(false);
	let bg_uppy_open = $state(false);

	interface Props {
		edit_id: string;
		data: EditorData;
	}

	let { edit_id = $bindable(), data = $bindable() }: Props = $props();
</script>

<section class="tq-panel quiz-settings" data-ui="quiz-settings">
	<header class="settings-header">
		<h2 class="tq-section-title">
			{$t('telekom.quiz_settings', { defaultValue: 'Quiz settings' })}
		</h2>
	</header>

	<div class="settings-section">
		<h3 class="settings-heading">{$t('telekom.details', { defaultValue: 'Details' })}</h3>
		<div class="field-block">
			<span class="tq-label">{$t('words.title')}</span>
			{#await import('$lib/inline-editor.svelte')}
				<Spinner my_20={false} />
			{:then c}
				<c.default
					bind:text={data.title}
					label={$t('words.title')}
					invalid={!reach(dataSchema, 'title').isValidSync(data.title)}
				/>
			{/await}
		</div>
		<label class="field-block">
			<span class="tq-label">{$t('words.description')}</span>
			<textarea
				class="tq-field"
				rows="4"
				aria-invalid={!reach(dataSchema, 'description').isValidSync(data.description)
					? 'true'
					: undefined}
				bind:value={data.description}
			></textarea>
		</label>
	</div>

	<div class="settings-section">
		<h3 class="settings-heading">{$t('telekom.visibility', { defaultValue: 'Visibility' })}</h3>
		<label class="visibility-setting">
			<input type="checkbox" bind:checked={data.public} />
			<Icon name={data.public ? 'globe' : 'lock'} />
			<span>{$t('words.public')}</span>
		</label>
	</div>

	<div class="settings-section">
		<h3 class="settings-heading">{$t('telekom.images', { defaultValue: 'Images' })}</h3>
		<div class="settings-media-grid">
			<div class="field-block">
				<span class="tq-label"
					>{$t('telekom.cover_image', { defaultValue: 'Cover image' })}</span
				>
				{#if data.cover_image}
					<div class="settings-image">
						<img
							src="/api/v1/storage/download/{data.cover_image}"
							alt={$t('telekom.cover_image', { defaultValue: 'Cover image' })}
						/>
						<button
							type="button"
							class="tq-button tq-button-danger"
							data-ui="cover-remove"
							onclick={() => (data.cover_image = null)}
						>
							<Icon name="trash" />
							{$t('telekom.remove_media', { defaultValue: 'Remove media' })}
						</button>
					</div>
				{:else}
					{#await import('$lib/editor/uploader.svelte')}
						<Spinner my_20={false} />
					{:then c}
						<c.default bind:modalOpen={uppyOpen} {data} video_upload={false} />
					{/await}
				{/if}
			</div>
			<div class="field-block">
				<span class="tq-label">{$t('editor.bg_image')}</span>
				{#if data.background_image}
					<div class="settings-image">
						<img
							src="/api/v1/storage/download/{data.background_image}"
							alt={$t('editor.bg_image')}
						/>
						<button
							type="button"
							class="tq-button tq-button-danger"
							data-ui="background-remove"
							onclick={() => (data.background_image = undefined)}
						>
							<Icon name="trash" />
							{$t('telekom.remove_background_image', {
								defaultValue: 'Remove background image'
							})}
						</button>
					</div>
				{:else}
					{#await import('$lib/editor/uploader.svelte')}
						<Spinner my_20={false} />
					{:then c}
						<c.default
							bind:modalOpen={bg_uppy_open}
							{data}
							selected_question={-1}
							video_upload={false}
						/>
					{/await}
				{/if}
			</div>
		</div>
	</div>

	<div class="settings-section">
		<h3 class="settings-heading">{$t('telekom.appearance', { defaultValue: 'Appearance' })}</h3>
		<div class="field-block">
			<span class="tq-label">
				{$t('telekom.custom_background', { defaultValue: 'Custom background color' })}
			</span>
			<AnswerColor
				bind:color={data.background_color}
				label={$t('telekom.custom_background', { defaultValue: 'Custom background color' })}
			/>
		</div>
	</div>
</section>

<style>
	.quiz-settings {
		overflow: hidden;
	}
	.settings-header {
		padding: 20px 24px;
		border-bottom: 1px solid var(--tq-border);
	}
	.settings-section {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 24px;
	}
	.settings-section + .settings-section {
		border-top: 1px solid var(--tq-border);
	}
	.settings-heading {
		font-size: 18px;
		font-weight: 700;
	}
	.field-block {
		min-width: 0;
	}
	.visibility-setting {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		font-weight: 700;
	}
	.settings-media-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
		align-items: start;
	}
	.settings-image {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}
	.settings-image img {
		max-width: 100%;
		max-height: 200px;
		object-fit: contain;
		border-radius: 8px;
	}

	@media (max-width: 767px) {
		.settings-header,
		.settings-section {
			padding: 16px;
		}
		.settings-media-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
