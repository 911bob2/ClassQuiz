<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { QuizQuestionType } from '$lib/quiz_types';
	import { getLocalization } from '$lib/i18n';
	import { SocketGameControls } from '$lib/play/admin/socket_game_controls.ts';
	import type { IGameState } from '$lib/play/admin/game_state.ts';

	interface Props {
		bg_color: string;
		socket_game_controls: SocketGameControls;
		game_token: string;
		game_state: IGameState;
	}

	let { bg_color, socket_game_controls, game_token, game_state = $bindable() }: Props = $props();

	const { t } = getLocalization();

	const show_solutions = () => {
		socket_game_controls.show_solutions();
		game_state.timer_res = '0';
	};
</script>

<div class="host-controls" data-ui="host-controls">
	<p class="host-progress">
		{#if game_state.selected_question === -1}
			{game_state.quiz_data.questions.length}
			{game_state.quiz_data.questions.length === 1
				? $t('words.question')
				: $t('words.question_plural')}
		{:else}
			{$t('telekom.question_progress', {
				current: game_state.selected_question + 1,
				total: game_state.quiz_data.questions.length,
				defaultValue: 'Question {{current}} of {{total}}'
			})}
		{/if}
	</p>
	<div class="tq-toolbar">
		{#if game_state.selected_question + 1 === game_state.quiz_data.questions.length && ((game_state.timer_res === '0' && game_state.question_results !== null) || game_state.quiz_data?.questions?.[game_state.selected_question]?.type === QuizQuestionType.SLIDE)}
			{#if JSON.stringify(game_state.final_results) === JSON.stringify([null])}
				<button
					onclick={() => socket_game_controls.get_final_results()}
					class="tq-button tq-button-primary"
					data-ui="host-final-results"
				>
					{$t('admin_page.get_final_results')}
				</button>
			{/if}
		{:else if game_state.timer_res === '0' || game_state.selected_question === -1}
			{#if (game_state.selected_question + 1 !== game_state.quiz_data.questions.length && game_state.question_results !== null) || game_state.selected_question === -1}
				<button
					onclick={() => {
						socket_game_controls.set_question_number(game_state.selected_question + 1);
					}}
					class="tq-button tq-button-primary"
					data-ui="host-next-question"
				>
					{$t('admin_page.next_question', {
						question: game_state.selected_question + 2
					})}
				</button>
			{/if}
			{#if game_state.question_results === null && game_state.selected_question !== -1}
				{#if game_state.quiz_data.questions[game_state.selected_question].type === QuizQuestionType.SLIDE}
					<button
						onclick={() => {
							socket_game_controls.set_question_number(
								game_state.selected_question + 1
							);
						}}
						class="tq-button tq-button-primary"
						data-ui="host-next-question"
					>
						{$t('admin_page.next_question', {
							question: game_state.selected_question + 2
						})}
					</button>
				{:else if game_state.quiz_data.questions[game_state.selected_question]?.hide_results === true}
					<button
						onclick={() => {
							socket_game_controls.get_question_results(
								game_token,
								game_state.shown_question_now
							);
							setTimeout(() => {
								socket_game_controls.set_question_number(
									game_state.selected_question + 1
								);
							}, 200);
						}}
						class="tq-button tq-button-primary"
						data-ui="host-next-question"
					>
						{$t('admin_page.next_question', {
							question: game_state.selected_question + 2
						})}
					</button>
				{:else}
					<button
						onclick={() =>
							socket_game_controls.get_question_results(
								game_token,
								game_state.shown_question_now
							)}
						class="tq-button tq-button-primary"
						data-ui="host-show-results"
					>
						{$t('admin_page.show_results')}
					</button>
				{/if}
			{/if}
		{:else if game_state.selected_question !== -1}
			{#if game_state.quiz_data.questions[game_state.selected_question].type === QuizQuestionType.SLIDE}
				<button
					onclick={() => {
						socket_game_controls.set_question_number(game_state.selected_question + 1);
					}}
					class="tq-button tq-button-primary"
					data-ui="host-next-question"
				>
					{$t('admin_page.next_question', {
						question: game_state.selected_question + 2
					})}
				</button>
			{:else}
				<button
					onclick={show_solutions}
					class="tq-button tq-button-primary"
					data-ui="host-stop-time"
				>
					{$t('admin_page.stop_time_and_solutions')}
				</button>
			{/if}
		{/if}
	</div>
</div>

<style>
	.host-controls {
		position: sticky;
		inset-block-start: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px 24px;
		min-height: 72px;
		padding: 12px 24px;
		border-block-end: 1px solid var(--tq-border);
		background: var(--tq-surface);
		color: var(--tq-text);
	}

	.host-progress {
		font-size: 18px;
		font-weight: 700;
	}

	@media (max-width: 600px) {
		.host-controls {
			flex-wrap: wrap;
			padding: 12px 16px;
		}

		.host-controls .tq-toolbar {
			flex: 1 1 100%;
		}

		.host-controls :global(.tq-button) {
			flex: 1 1 auto;
		}
	}
</style>
