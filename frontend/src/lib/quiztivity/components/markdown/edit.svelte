<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Markdown } from '$lib/quiztivity/types';
	import { marked } from 'marked';
	import { browser } from '$app/environment';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		data: Markdown | undefined;
	}

	let { data = $bindable() }: Props = $props();

	if (!data) {
		data = {
			markdown: ''
		};
	}

	let rendered_html = $derived(browser ? marked.parse(data.markdown) : '');
</script>

<div class="markdown-editor" data-ui="activity-markdown-editor">
	<label class="markdown-pane">
		<span class="tq-label">Markdown</span>
		<textarea class="tq-field markdown-input" bind:value={data.markdown}></textarea>
	</label>
	<div class="markdown-pane">
		<span class="tq-label">{$t('telekom.preview', { defaultValue: 'Preview' })}</span>
		<div class="markdown-preview prose tq-prose max-w-none">
			{@html rendered_html}
		</div>
	</div>
</div>

<style>
	.markdown-editor {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
	}
	.markdown-pane {
		display: block;
		min-width: 0;
	}
	.markdown-input {
		min-height: 420px;
		resize: vertical;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 14px;
	}
	.markdown-preview {
		min-height: 420px;
		padding: 12px 16px;
		overflow: auto;
		border: 1px solid var(--tq-border);
		border-radius: 8px;
		background: var(--tq-surface);
	}

	@media (max-width: 767px) {
		.markdown-editor {
			grid-template-columns: minmax(0, 1fr);
		}
		.markdown-input,
		.markdown-preview {
			min-height: 240px;
		}
	}
</style>
