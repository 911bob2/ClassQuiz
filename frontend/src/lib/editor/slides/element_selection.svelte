<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { ElementTypes } from '$lib/quiz_types';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();
	let { selected_element = $bindable() } = $props();
	const keybinding_list = {
		t: ElementTypes.Text,
		h: ElementTypes.Headline,
		r: ElementTypes.Rectangle,
		c: ElementTypes.Circle
		// "i": ElementTypes.Image
	};

	const keypress_listener = (key: KeyboardEvent) => {
		if (selected_element !== null) {
			return;
		}
		const sel_type = keybinding_list[key.key];
		if (sel_type) {
			selected_element = sel_type;
		} else if (key.code === 'Escape') {
			selected_element = undefined;
		}
	};

	onMount(() => {
		document.body.addEventListener('keydown', keypress_listener);
		return () => document.body.removeEventListener('keydown', keypress_listener);
	});
	const element_list: Array<{
		name: string;
		description: string | undefined;
		type: ElementTypes;
		icon: string | undefined;
		shortcut: string;
	}> = [
		{
			name: $t('editor.slide.headline'),
			description: $t('editor.slide.headline_description'),
			type: ElementTypes.Headline,
			icon: undefined,
			shortcut: 'h'
		},
		{
			name: $t('editor.slide.text'),
			description: $t('editor.slide.text_description'),
			type: ElementTypes.Text,
			icon: undefined,
			shortcut: 't'
		},
		{
			name: $t('editor.slide.rectangle'),
			description: $t('editor.slide.rectangle_description'),
			type: ElementTypes.Rectangle,
			icon: undefined,
			shortcut: 'r'
		},
		{
			name: $t('telekom.slide_circle', { defaultValue: 'Circle' }),
			description: undefined,
			type: ElementTypes.Circle,
			icon: undefined,
			shortcut: 'c'
		}
	];
</script>

<div
	class="element-list"
	role="group"
	aria-label={$t('telekom.add_element', { defaultValue: 'Add element' })}
	data-ui="slide-element-list"
	transition:fade|global={{ duration: 100 }}
>
	{#each element_list as el}
		<button
			type="button"
			class="tq-button element-option"
			data-ui={'slide-element-' + el.type.toLowerCase()}
			title={el.description}
			onclick={() => (selected_element = el.type)}
		>
			<span>{el.name}</span>
			<kbd>{el.shortcut.toUpperCase()}</kbd>
		</button>
	{/each}
</div>

<style>
	.element-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 16px;
		padding: 12px;
		border: 1px solid var(--tq-border);
		border-radius: 8px;
		background: var(--tq-surface-subtle);
	}
	.element-option {
		justify-content: space-between;
		min-width: 128px;
	}
	kbd {
		padding: 1px 6px;
		border: 1px solid var(--tq-border-strong);
		border-radius: 4px;
		background: var(--tq-surface);
		color: var(--tq-muted);
		font-family: inherit;
		font-size: 12px;
		font-weight: 500;
	}
</style>
