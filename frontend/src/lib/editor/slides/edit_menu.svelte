<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { run } from 'svelte/legacy';

	import type { Konva, ShapeModel } from 'pikaso';
	import { getLocalization } from '$lib/i18n';
	import Icon from '$lib/editor/Icon.svelte';

	const { t } = getLocalization();

	interface Props {
		selected_el: null | ShapeModel<Konva.Shape | Konva.Group, Konva.ShapeConfig>;
	}

	let { selected_el }: Props = $props();

	let available_modifiers: Array<string> = $state([]);

	const set_available_modifiers = () => {
		available_modifiers = [];
		if (!selected_el) {
			return;
		}
		switch (selected_el.type) {
			case 'label':
				available_modifiers.push('font_size', 'text_color');
				break;
			case 'circle':
				available_modifiers.push('fill_color');
				break;
			case 'rect':
				available_modifiers.push('fill_color');
				break;
		}
	};

	run(() => {
		selected_el;
		set_available_modifiers();
	});

	const change_color = (e: Event) => {
		if (available_modifiers.includes('text_color')) {
			selected_el.updateText({
				fill: (e.currentTarget as HTMLInputElement).value
			});
		} else if (available_modifiers.includes('fill_color')) {
			selected_el.update({ fill: (e.currentTarget as HTMLInputElement).value });
		}
	};

	const change_fontsize = (e: Event) => {
		selected_el.updateText({
			fontSize: (e.currentTarget as HTMLInputElement).value
		});
	};

	// The colour picker starts at the colour the selected element already has.
	const current_color = (): string => {
		const fill = available_modifiers.includes('text_color')
			? selected_el?.node?.children?.[1]?.attrs?.fill
			: selected_el?.node?.attrs?.fill;
		return typeof fill === 'string' && /^#[0-9a-f]{6}$/i.test(fill) ? fill : '#000000';
	};

	let can_change_color = $derived(
		available_modifiers.includes('fill_color') || available_modifiers.includes('text_color')
	);
</script>

<div class="element-controls" data-ui="slide-element-controls">
	<label class="tool-field">
		<span class="tool-label">{$t('telekom.color', { defaultValue: 'Color' })}</span>
		<input
			type="color"
			class="tool-color"
			disabled={!can_change_color}
			value={current_color()}
			onchange={change_color}
		/>
	</label>
	<label class="tool-field">
		<span class="tool-label">{$t('telekom.font_size', { defaultValue: 'Font size' })}</span>
		<input
			type="range"
			class="tool-range"
			onchange={change_fontsize}
			value={selected_el?.node?.children?.[1]?.attrs?.fontSize ?? 20}
			disabled={!available_modifiers.includes('font_size')}
			min="10"
			max="250"
		/>
	</label>
	<div class="tool-field">
		<button
			type="button"
			class="tq-icon-button"
			data-ui="slide-bring-forward"
			disabled={!selected_el}
			aria-label={$t('telekom.bring_forward', { defaultValue: 'Bring forward' })}
			title={$t('telekom.bring_forward', { defaultValue: 'Bring forward' })}
			onclick={() => {
				selected_el.update({ zIndex: selected_el.node.getZIndex() + 1 });
			}}
		>
			<Icon name="arrow-up" />
		</button>
		<button
			type="button"
			class="tq-icon-button"
			data-ui="slide-send-backward"
			disabled={!selected_el}
			aria-label={$t('telekom.send_backward', { defaultValue: 'Send backward' })}
			title={$t('telekom.send_backward', { defaultValue: 'Send backward' })}
			onclick={() => {
				selected_el.update({ zIndex: selected_el.node.getZIndex() - 1 });
			}}
		>
			<Icon name="arrow-down" />
		</button>
	</div>
</div>

<style>
	.element-controls {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 20px;
	}
	.tool-field {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.tool-label {
		font-size: 14px;
		font-weight: 700;
	}
	.tool-color {
		width: 44px;
		height: 44px;
		padding: 4px;
		border: 1px solid var(--tq-border-strong);
		border-radius: 8px;
		background: var(--tq-surface);
	}
	.tool-range {
		width: 120px;
		min-height: 44px;
	}
	input:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
