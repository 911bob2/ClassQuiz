<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Data, QuizTivityPage } from './types';
	import { getLocalization } from '$lib/i18n';
	import AddNewSlide from './add_new_slide.svelte';
	import { QuizTivityTypes } from './types';
	import PdfEdit from './components/pdf/edit.svelte';
	import MemoryEdit from './components/memory/edit.svelte';
	import MarkdownEdit from './components/markdown/edit.svelte';
	import AbcdEdit from './components/abcd/edit.svelte';
	import { flip } from 'svelte/animate';
	import { createEventDispatcher } from 'svelte';
	import SharesPopover from '$lib/quiztivity/shares_popover.svelte';
	import Icon from '$lib/editor/Icon.svelte';
	import { page_type_name } from './page-types';

	const { t } = getLocalization();
	const dispatch = createEventDispatcher();

	interface Props {
		data: Data;
		saving: boolean;
	}

	let { data = $bindable(), saving }: Props = $props();

	let selected_slide = $state(null);
	let opened_slide = $state(null);
	let selected_type = $state(undefined);
	let shares_menu_open = $state(false);

	for (let i = 0; i < data.pages.length; i++) {
		const id = (Math.random() + 1).toString(36).substring(7);
		const type: QuizTivityTypes = data.pages[i].type as QuizTivityTypes;
		data.pages[i] = { ...data.pages[i], id, type };
	}
	const handle_slide_add = (type: QuizTivityTypes | undefined | null) => {
		if (!type) {
			return;
		}
		const id = (Math.random() + 1).toString(36).substring(7);
		data.pages.push({ title: undefined, data: undefined, type, id });
		opened_slide = data.pages.length - 1;
	};
	$effect(() => {
		handle_slide_add(selected_type);
	});

	const delete_slide = () => {
		console.log(selected_slide);
		data.pages.splice(selected_slide, 1);
		data.pages = data.pages;
		selected_slide = null;
	};

	const arraymove = (arr: any[], fromI: number, toI: number) => {
		const el = arr[fromI];
		arr.splice(fromI, 1);
		arr.splice(toI, 0, el);
	};
	const move_slide_left = () => {
		arraymove(data.pages, selected_slide, selected_slide - 1);
		selected_slide -= 1;
		data.pages = data.pages;
	};

	const move_slide_right = () => {
		arraymove(data.pages, selected_slide, selected_slide + 1);
		selected_slide += 1;
		data.pages = data.pages;
	};

	// A short preview of what a page contains, taken from the user's own content.
	const page_summary = (page: QuizTivityPage): string => {
		const content = page.data as any;
		if (!content) {
			return '';
		}
		switch (page.type) {
			case QuizTivityTypes.ABCD:
				return content.question ?? '';
			case QuizTivityTypes.MARKDOWN:
				return (content.markdown ?? '').trim().split('\n')[0];
			case QuizTivityTypes.MEMORY:
				return (content.cards ?? [])
					.slice(0, 2)
					.map((pair: { text?: string }[]) => pair.map((card) => card.text).join(' / '))
					.join(', ');
			default:
				return '';
		}
	};
</script>

<main class="tq-page" data-ui="activity-editor">
	{#if opened_slide === null}
		<div class="tq-page-heading">
			<label class="activity-title">
				<span class="tq-label">{$t('words.title')}</span>
				<input
					class="tq-field"
					placeholder={$t('quiztivity.editor.title_placeholder')}
					bind:value={data.title}
				/>
			</label>
			<div class="tq-toolbar">
				{#if data.id}
					<button
						type="button"
						class="tq-button"
						data-ui="open-shares"
						onclick={() => {
							shares_menu_open = true;
						}}
					>
						<Icon name="share" />
						{$t('quiztivity.editor.open_shares_menu')}
					</button>
				{/if}
				<button
					type="button"
					class="tq-button tq-button-primary"
					data-ui="activity-save"
					onclick={() => {
						dispatch('save');
					}}
					disabled={!data.title || saving}
				>
					{$t('words.save')}
				</button>
			</div>
		</div>

		<section class="tq-panel pages-panel">
			<div class="tq-toolbar page-toolbar" role="toolbar" aria-label={$t('words.quiztivity')}>
				<button
					type="button"
					class="tq-button tq-button-primary"
					data-ui="activity-add-page"
					onclick={() => {
						selected_type = null;
					}}
				>
					<Icon name="plus" />
					{$t('quiztivity.editor.add_new')}
				</button>
				<button
					type="button"
					class="tq-button tq-button-danger"
					onclick={delete_slide}
					disabled={selected_slide === null}
				>
					<Icon name="trash" />
					{$t('quiztivity.editor.delete')}
				</button>
				<button
					type="button"
					class="tq-button"
					onclick={move_slide_left}
					disabled={selected_slide === null || selected_slide === 0}
				>
					<Icon name="arrow-left" />
					{$t('quiztivity.editor.move_left')}
				</button>
				<button
					type="button"
					class="tq-button"
					onclick={move_slide_right}
					disabled={selected_slide === null || selected_slide === data.pages.length - 1}
				>
					{$t('quiztivity.editor.move_right')}
					<Icon name="arrow-right" />
				</button>
			</div>
			{#if data.pages.length > 0}
				<div class="page-grid">
					{#each data.pages as page, i (page.id)}
						<article
							class="page-card"
							class:selected={selected_slide === i}
							animate:flip={{ duration: 200 }}
							data-ui="activity-page"
						>
							<div class="page-heading">
								<span class="tq-badge">{i + 1}</span>
								<strong class="page-type">{page_type_name($t, page.type)}</strong>
							</div>
							<p class="page-summary">{page_summary(page)}</p>
							<div class="page-actions">
								<button
									type="button"
									class="tq-button"
									aria-pressed={selected_slide === i}
									onclick={() => {
										selected_slide = selected_slide === i ? null : i;
									}}
								>
									{#if selected_slide === i}{$t('words.selected')}{:else}{$t(
											'words.select'
										)}{/if}
								</button>
								<button
									type="button"
									class="tq-button"
									data-ui="activity-page-edit"
									onclick={() => {
										opened_slide = i;
									}}
								>
									{$t('words.edit')}
								</button>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{:else}
		{@const sel_t = data.pages[opened_slide].type}
		<div class="tq-page-heading">
			<div class="tq-toolbar">
				<button
					type="button"
					class="tq-button"
					data-ui="activity-page-back"
					onclick={() => {
						opened_slide = null;
					}}
				>
					<Icon name="arrow-left" />
					{$t('words.back')}
				</button>
				<h1 class="tq-section-title">
					{opened_slide + 1} · {page_type_name($t, sel_t)}
				</h1>
			</div>
		</div>
		<section class="tq-panel tq-panel-body">
			{#if sel_t === QuizTivityTypes.PDF}
				<PdfEdit />
			{:else if sel_t === QuizTivityTypes.MEMORY}
				<MemoryEdit bind:data={data.pages[opened_slide].data} />
			{:else if sel_t === QuizTivityTypes.MARKDOWN}
				<MarkdownEdit bind:data={data.pages[opened_slide].data} />
			{:else if sel_t === QuizTivityTypes.ABCD}
				<AbcdEdit bind:data={data.pages[opened_slide].data} />
			{:else}
				<p class="tq-alert tq-alert-error">{$t('words.error')}</p>
			{/if}
		</section>
	{/if}
</main>

{#if selected_type === null}
	<AddNewSlide bind:type={selected_type} />
{/if}
{#if shares_menu_open}
	<SharesPopover id={data.id} bind:open={shares_menu_open} />
{/if}

<style>
	.activity-title {
		flex: 1;
		min-width: min(100%, 280px);
		max-width: 520px;
	}
	.pages-panel {
		overflow: hidden;
	}
	.page-toolbar {
		padding: 16px;
	}
	.page-toolbar:not(:last-child) {
		border-bottom: 1px solid var(--tq-border);
	}
	.page-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 16px;
		padding: 16px;
	}
	.page-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 180px;
		padding: 16px;
		border: 1px solid var(--tq-border);
		border-radius: 12px;
		background: var(--tq-surface);
	}
	.page-card.selected {
		border-color: var(--tq-accent);
		outline: 2px solid var(--tq-accent);
		outline-offset: -2px;
	}
	.page-heading {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.page-summary {
		flex: 1;
		margin: 0;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		color: var(--tq-muted);
		font-size: 14px;
		overflow-wrap: anywhere;
	}
	.page-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
</style>
