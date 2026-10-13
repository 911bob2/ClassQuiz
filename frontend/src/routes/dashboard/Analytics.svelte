<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { QuizData } from '$lib/quiz_types';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	export let quiz: QuizData | undefined = undefined;

	const on_parent_click = (e: Event) => {
		if (e.target !== e.currentTarget) {
			return;
		}
		quiz = undefined;
	};
	const close_start_game_if_esc_is_pressed = (key: KeyboardEvent) => {
		if (key.code === 'Escape') {
			quiz = undefined;
		}
	};
	onMount(() => {
		document.body.addEventListener('keydown', close_start_game_if_esc_is_pressed);
		return () => {
			document.body.removeEventListener('keydown', close_start_game_if_esc_is_pressed);
		};
	});

	const focus_on_mount = (node: HTMLElement) => {
		node.focus();
	};
</script>

{#if quiz}
	<div
		class="tq-overlay"
		role="presentation"
		onclick={on_parent_click}
		transition:fade={{ duration: 100 }}
	>
		<div
			class="tq-dialog tq-stack stack-5"
			role="dialog"
			aria-modal="true"
			aria-labelledby="analytics-title"
			data-ui="analytics-dialog"
			tabindex="-1"
			use:focus_on_mount
		>
			<header class="tq-page-heading flush">
				<div>
					<h2 class="tq-section-title" id="analytics-title">{$t('words.analytics')}</h2>
					<p class="tq-muted text-sm">{@html quiz.title}</p>
				</div>
				<button
					type="button"
					class="tq-button tq-button-ghost"
					onclick={() => (quiz = undefined)}
				>
					{$t('words.close')}
				</button>
			</header>

			<dl class="stat-grid">
				<div class="tq-panel stat">
					<dt>{$t('words.like_plural')}</dt>
					<dd>{quiz.likes}</dd>
				</div>
				<div class="tq-panel stat">
					<dt>{$t('words.dislike_plural')}</dt>
					<dd>{quiz.dislikes}</dd>
				</div>
				<div class="tq-panel stat">
					<dt>{$t('words.view_plural')}</dt>
					<dd>{quiz.views}</dd>
				</div>
				<div class="tq-panel stat">
					<dt>{$t('words.play_plural')}</dt>
					<dd>{quiz.plays}</dd>
				</div>
			</dl>

			<section class="tq-stack stack-2">
				<h3 class="tq-label flush">{$t('words.info')}</h3>
				<p class="tq-muted text-sm">{$t('dashboard.info_analytics')}</p>
			</section>
		</div>
	</div>
{/if}

<style>
	.tq-dialog:focus-visible {
		outline: none;
	}
	.stack-2 {
		gap: 8px;
	}
	.stack-5 {
		gap: 20px;
	}
	.flush {
		margin-bottom: 0;
	}
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		margin: 0;
	}
	.stat {
		padding: 16px;
	}
	.stat dt {
		color: var(--tq-muted);
		font-size: 14px;
	}
	.stat dd {
		margin: 4px 0 0;
		font-size: 28px;
		font-weight: 700;
		line-height: 1.2;
	}
</style>
