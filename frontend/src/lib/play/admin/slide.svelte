<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Question } from '$lib/quiz_types';
	import { onMount } from 'svelte';
	import Pikaso from 'pikaso';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	interface Props {
		question: Question;
	}

	let { question }: Props = $props();

	let canvas_el: HTMLDivElement | undefined = $state();
	let canvas: Pikaso;
	let img_src = $state('');

	onMount(() => {
		canvas = new Pikaso({
			container: canvas_el,
			snapToGrid: {},
			selection: {
				interactive: false
			}
		});
		if (typeof question.answers === 'string') {
			const data = JSON.parse(question.answers);
			canvas.import.json(data);
			img_src = canvas.export.toImage();
		}
	});
</script>

<div class="slide-screen" data-ui="host-slide">
	<div class="hidden">
		<div bind:this={canvas_el} class="w-full h-full block"></div>
	</div>
	<img class="slide-image" src={img_src} alt={$t('words.slide')} />
</div>

<style>
	.slide-screen {
		display: flex;
		justify-content: center;
		width: 100%;
		padding: 32px 24px;
	}

	.slide-image {
		display: block;
		min-width: min(100%, 480px);
		min-height: 240px;
		max-width: 100%;
		max-height: calc(100dvh - 160px);
		border: 1px solid var(--tq-border);
		border-radius: 12px;
		background: var(--tq-surface);
		color: var(--tq-muted);
		object-fit: contain;
	}
</style>
