<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { run } from 'svelte/legacy';

	import type { Question } from '$lib/quiz_types';
	import { ElementTypes, QuizQuestionType } from '$lib/quiz_types';
	import ElementSelection from './slides/element_selection.svelte';
	import SettingsMenu from './slides/settings_menu.svelte';
	import { onMount } from 'svelte';
	import Pikaso from 'pikaso';
	import EditMenu from './slides/edit_menu.svelte';
	import type { Konva, ShapeModel } from 'pikaso';
	import { browser } from '$app/environment';
	import { getLocalization } from '$lib/i18n';
	import Icon from '$lib/editor/Icon.svelte';

	const { t } = getLocalization();

	interface Props {
		data?: Question;
	}

	let {
		data = $bindable({
			type: QuizQuestionType.SLIDE,
			time: '120',
			question: '',
			image: undefined,
			answers: ''
		})
	}: Props = $props();
	let selected_element = $state(undefined);
	let canvas_el: HTMLDivElement | undefined = $state();
	let canvas: Pikaso;
	let selected_el: null | ShapeModel<Konva.Shape | Konva.Group, Konva.ShapeConfig> = $state(null);

	let elements_binds: Array<HTMLElement> | undefined = [];
	let main_el: undefined | HTMLElement = $state();
	let settings_menu_open = $state(false);

	const set_correct_height = new ResizeObserver((e) => {
		for (const i of e) {
			const id = parseInt(i.target.getAttribute('el_id'));
			data.answers[id].width = i.contentRect.width / main_el.offsetWidth;
			data.answers[id].height = i.contentRect.height / main_el.offsetHeight;
		}
	});

	// The theme class is set on <html> by the app shell.
	let darkMode = false;
	if (browser) {
		darkMode = document.documentElement.classList.contains('dark');
	}
	const add_text_field = () => {
		if (selected_element === ElementTypes.Text) {
			canvas.shapes.label.insert({
				container: {
					x: 40,
					y: 40
				},
				text: {
					text: $t('words.text'),
					fontFamily: 'TeleNeo',
					fill: darkMode ? '#ffffff' : '#171719',
					fontSize: 20
				}
			});
		} else if (selected_element === ElementTypes.Headline) {
			canvas.shapes.label.insert({
				container: {
					x: 40,
					y: 40
				},
				text: {
					text: $t('editor.slide.headline'),
					fontFamily: 'TeleNeo',
					fill: darkMode ? '#ffffff' : '#171719',
					fontSize: 35
				}
			});
		} else if (selected_element === ElementTypes.Circle) {
			canvas.shapes.circle.insert({
				x: 40,
				y: 40,
				radius: 50,
				fill: '#e20074'
			});
		} else if (selected_element === ElementTypes.Rectangle) {
			canvas.shapes.rect.insert({
				x: 40,
				y: 40,
				width: 50,
				height: 50,
				fill: '#e20074'
			});
		}
	};

	run(() => {
		if (selected_element) {
			add_text_field();
		}
	});
	const assign_resize_handlers = () => {
		for (let i = 0; i < elements_binds.length; i++) {
			set_correct_height.observe(elements_binds[i]);
		}
	};

	/*	if (data.answers.length !== 0) {
			for (let i = 0; i < data.answers.length; i++) {
				data.answers[i].width = data.answers[i].width * main_el.offsetWidth;
				data.answers[i].height = data.answers[i].height * main_el.offsetHeight;
			}
		}*/

	run(() => {
		elements_binds;
		assign_resize_handlers();
	});

	onMount(() => {
		/*		setTimeout(() => {
					for (let i = 0; i < data.answers.length; i++) {
						elements_binds[i].style.height = `${
							data.answers[i].height * main_el.offsetHeight
						}px`;
						elements_binds[i].style.width = `${data.answers[i].width * main_el.offsetWidth}px`;
					}
				}, 200);*/
		canvas = new Pikaso({
			container: canvas_el,
			snapToGrid: {},
			/*			transformer: {
							borderStroke: "#00ff00",
							anchorStroke: "#00ff00"
						},
						cropper: {
							transformer: {
								borderStroke: "#00ff00",
								// anchorFill: "#00ff00",
								anchorStroke: "#00ff00"
							},
							guides: {
								color: "#00ff00"
							}
						},*/
			selection: {
				transformer: {
					borderStroke: darkMode ? '#fff' : '#000000',
					anchorStroke: darkMode ? '#fff' : '#000000'
				}
			}
			/*			selection: {
							interactive: false
						}*/
		});
		if (data.answers) {
			if (typeof data.answers === 'string') {
				canvas.import.json(JSON.parse(data.answers));
			}
		}
		canvas.on('*', () => {
			data.answers = JSON.stringify(canvas.export.toJson());
		});
		canvas.on('selection:change', (data) => {
			/*			data.shapes[0].update({fill: "#ffffff"})
						console.log(data.shapes[0])*/
			// console.log(canvas.board.shapes)
			if (data.shapes.length > 0) {
				selected_el = data.shapes[0];
			} else {
				selected_el = null;
			}
		});
	});
</script>

<div class="slide-workspace" bind:this={main_el} data-ui="slide-editor">
	<div class="slide-toolbar">
		<button
			type="button"
			class="tq-button"
			data-ui="slide-settings-toggle"
			aria-expanded={settings_menu_open}
			onclick={() => (settings_menu_open = !settings_menu_open)}
		>
			<Icon name="sliders" />
			{$t('telekom.slide_settings', { defaultValue: 'Slide settings' })}
		</button>
		<EditMenu {selected_el} />
		<button
			type="button"
			class="tq-button tq-button-primary slide-add"
			data-ui="slide-add-element"
			aria-expanded={selected_element === null}
			onclick={() => (selected_element = selected_element === null ? undefined : null)}
		>
			<Icon name="plus" />
			{$t('telekom.add_element', { defaultValue: 'Add element' })}
		</button>
	</div>
	{#if settings_menu_open}
		<SettingsMenu bind:time={data.time} bind:title={data.question} />
	{/if}
	{#if selected_element === null}
		<ElementSelection bind:selected_element />
	{/if}
	<div class="canvas-shell">
		<div bind:this={canvas_el} class="slide-canvas"></div>
	</div>
</div>

<style>
	.slide-workspace {
		padding: 20px 24px 24px;
	}
	.slide-toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px 24px;
	}
	.slide-add {
		margin-inline-start: auto;
	}
	.canvas-shell {
		margin-top: 16px;
		overflow: hidden;
		border: 1px solid var(--tq-border);
		border-radius: 8px;
		background: var(--tq-surface-subtle);
	}
	.slide-canvas {
		width: 100%;
		height: 520px;
	}

	@media (max-width: 767px) {
		.slide-workspace {
			padding: 16px;
		}
		.slide-canvas {
			height: 360px;
		}
	}
</style>
