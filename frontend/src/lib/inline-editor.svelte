<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { run } from 'svelte/legacy';

	import {
		BalloonEditor,
		Essentials,
		Autoformat,
		Bold,
		Italic,
		Paragraph,
		TextTransformation,
		Superscript,
		Subscript,
		Strikethrough
	} from 'ckeditor5';
	import 'ckeditor5/ckeditor5.css';
	import { getLocalization } from '$lib/i18n';

	const triggerChange = () => {
		text = editor.getData();
	};

	import { onMount } from 'svelte';
	interface Props {
		// import Autoformat from "@ckeditor/ckeditor5-autoformat/src/autoformat"
		text?: string;
		/** Accessible name of the editable area. */
		label?: string;
		/** Highlights the field when its content does not pass validation. */
		invalid?: boolean;
	}

	const { t } = getLocalization();

	let { text = $bindable(''), label, invalid = false }: Props = $props();

	let html_el = $state();

	run(() => {
		text = text.replace('<p>', '').replace('</p>', '');
	});
	let editor;
	onMount(() => {
		class Editor extends BalloonEditor {
			static builtinPlugins = [
				Essentials,
				Autoformat,
				Bold,
				Italic,
				Paragraph,
				TextTransformation,
				Strikethrough,
				Subscript,
				Superscript
			];

			static defaultConfig = {
				language: 'en'
			};
		}
		// BalloonEditor.builtinPlugins = [Strikethrough]
		Editor.create(html_el, {
			licenseKey: 'GPL',
			// plugins: [Strikethrough],
			config: {
				enterMode: BalloonEditor.ENTER_DIV,
				shiftEnterMode: BalloonEditor.ENTER_BR
			},
			toolbar: [
				'bold',
				'italic',
				'strikethrough',
				'superscript',
				'subscript',
				'|',
				'undo',
				'redo'
			]
		})
			.then((newEditor) => {
				editor = newEditor;
				editor.setData(text);
				editor.model.document.on('change:data', () => {
					triggerChange();
				});
			})
			.catch((error) => {
				console.error('There was a problem initializing the editor.', error);
			});
	});
</script>

<div class="tq-inline-editor" class:invalid>
	<div
		bind:this={html_el}
		contenteditable="true"
		role="textbox"
		aria-label={label ?? $t('words.text')}
		aria-invalid={invalid ? 'true' : undefined}
		class="tq-inline-content"
	></div>
</div>

<style>
	.tq-inline-editor {
		--ck-font-face: var(--font-sans);
		width: 100%;
		border: 1px solid var(--tq-border-strong);
		border-radius: 8px;
		background: var(--tq-surface);
		color: var(--tq-text);
	}
	.tq-inline-editor.invalid {
		border-color: var(--tq-danger);
		box-shadow: inset 0 0 0 1px var(--tq-danger);
	}
	.tq-inline-editor:focus-within {
		border-color: var(--tq-accent);
		outline: 3px solid var(--tq-accent);
		outline-offset: 2px;
	}
	.tq-inline-content {
		min-height: 48px;
		padding: 12px 14px;
		border-radius: 8px;
		line-height: 1.5;
	}
	.tq-inline-editor :global(.ck.ck-content) {
		font-family: var(--font-sans);
		font-size: 16px;
		color: var(--tq-text);
	}
	.tq-inline-editor :global(.ck.ck-editor__editable.ck-focused:not(.ck-editor__nested-editable)) {
		border-color: transparent;
		box-shadow: none;
	}
	:global(.ck-powered-by) {
		display: none;
	}
</style>
