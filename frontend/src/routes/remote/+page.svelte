<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import AnswerTile from '$lib/play/answer_tile.svelte';
	import { page } from '$app/state';
	import { socket } from '$lib/socket';
	import type { Answer, QuizData } from '$lib/quiz_types';
	import { QuizQuestionType } from '$lib/quiz_types.js';
	import Spinner from '$lib/Spinner.svelte';
	import CircularTimer from '$lib/play/circular_progress.svelte';
	import { getLocalization } from '$lib/i18n';
	import { navbarVisible } from '$lib/stores.svelte.ts';

	const data = {
		game_pin: page.url.searchParams.get('game_pin'),
		game_id: page.url.searchParams.get('game_id')
	};

	navbarVisible.visible = false;

	const { t } = getLocalization();
	let timer_interval: NodeJS.Timeout;
	let timer_res = $state(undefined);
	let selected_question = $state(-1);
	let game_started = $state(false);
	let question_results = $state();
	let final_results = $state([null]);
	let warnToLeave = true;
	let dataexport_download_a: HTMLAnchorElement = $state();

	let players: Array<{ sid: string; username: string }> = $state([]);

	let game_data: QuizData = $state();
	let shown_question_now: number;
	let control_visible = $state(false);

	if (!data.game_id || !data.game_pin) {
		console.log('Error!');
	} else {
		if (!socket.connected) socket.connect();
		socket.emit('register_as_remote', data);
	}

	const timer = (time: string) => {
		let seconds = Number(time);
		timer_interval = setInterval(() => {
			if (timer_res === '0') {
				clearInterval(timer_interval);
				// socket.emit('show_solutions', {});
				return;
			} else {
				seconds--;
			}

			timer_res = seconds.toString();
		}, 1000);
	};

	const confirmUnload = (e: Event) => {
		if (warnToLeave) {
			e.preventDefault();
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			e.returnValue = '';
		}
	};

	const set_question_number = (q_number: number) => {
		socket.emit('set_question_number', q_number.toString());
	};

	const start_game = () => {
		socket.emit('start_game', '');
	};

	const get_question_results = () => {
		socket.emit('get_question_results', {
			question_number: shown_question_now
		});
	};

	const show_solutions = () => {
		socket.emit('show_solutions', {});
	};
	const get_final_results = () => {
		socket.emit('get_final_results', {});
	};

	const request_answer_export = async (e: Event) => {
		e.preventDefault();
		socket.emit('get_export_token');
	};

	const get_already_joined_players = async () => {
		const res = await fetch(
			`/api/v1/live/players?game_pin=${data.game_pin}&game_id=${data.game_id}`
		);
		if (res.ok) {
			players = await res.json();
		}
	};
	let circular_progress = $derived.by(() => {
		try {
			return (
				1 -
				((100 / parseInt(game_data.questions[selected_question].time)) *
					parseInt(timer_res)) /
					100
			);
		} catch {
			return 0;
		}
	});

	socket.on('solutions', (_) => {
		timer_res = '0';
		clearInterval(timer_interval);
	});
	socket.on('question_results', (_) => {
		timer_res = '0';
		clearInterval(timer_interval);
	});
	socket.on('registered_as_admin', (data) => {
		game_data = JSON.parse(data.game);
	});

	socket.on('start_game', (_) => {
		game_started = true;
	});

	socket.on('control_visibility', (data) => {
		control_visible = data.visible;
	});

	socket.on('question_results', (data) => {
		try {
			question_results = JSON.parse(data);
			timer_res = '0';
		} catch {
			question_results = undefined;
		}
	});
	socket.on('set_question_number', (data) => {
		timer_res = '0';
		clearInterval(timer_interval);
		question_results = null;
		shown_question_now = data.question_index;
		timer_res = game_data.questions[data.question_index].time;
		selected_question = selected_question + 1;
		timer(timer_res);
	});

	socket.on('final_results', (data) => {
		// data = JSON.parse(data);
		final_results = data;
	});

	socket.on('everyone_answered', (_) => {
		timer_res = '0';
	});

	socket.on('export_token', (int_data) => {
		warnToLeave = false;
		dataexport_download_a.href = `/api/v1/quiz/export_data/${int_data}?ts=${new Date().getTime()}&game_pin=${
			game_data.game_pin
		}`;
		dataexport_download_a.click();
		setTimeout(() => {
			warnToLeave = true;
		}, 200);
	});

	socket.on('player_joined', (data) => {
		players = [...players, data];
	});
</script>

<svelte:window onbeforeunload={confirmUnload} />
<svelte:head>
	<title>Telekom Quiz · Remote</title>
</svelte:head>

<main class="remote" data-ui="remote">
	<header class="remote-bar tq-panel">
		<p class="remote-progress">
			{#if !game_started || !game_data}
				{$t('telekom.lobby', { defaultValue: 'Lobby' })}
			{:else if selected_question === -1}
				{game_data.questions.length}
				{game_data.questions.length === 1
					? $t('words.question')
					: $t('words.question_plural')}
			{:else}
				{$t('telekom.question_progress', {
					current: selected_question + 1,
					total: game_data.questions.length,
					defaultValue: 'Question {{current}} of {{total}}'
				})}
			{/if}
		</p>
		{#if control_visible}
			<button
				class="tq-button"
				data-ui="remote-hide-controls"
				onclick={() => {
					socket.emit('set_control_visibility', { visible: false });
				}}
			>
				{$t('telekom.hide_controls', { defaultValue: 'Hide controls' })}
			</button>
		{:else}
			<button
				class="tq-button"
				data-ui="remote-show-controls"
				onclick={() => {
					socket.emit('set_control_visibility', { visible: true });
				}}
			>
				{$t('telekom.show_controls', { defaultValue: 'Show controls' })}
			</button>
		{/if}
	</header>

	{#if game_started}
		<div class="remote-actions">
			{#if selected_question + 1 === game_data.questions.length && ((timer_res === '0' && question_results !== null) || game_data?.questions?.[selected_question]?.type === QuizQuestionType.SLIDE)}
				{#if JSON.stringify(final_results) === JSON.stringify([null])}
					<button
						onclick={get_final_results}
						class="tq-button tq-button-primary"
						data-ui="remote-final-results"
					>
						{$t('admin_page.get_final_results')}
					</button>
				{:else}
					<button
						onclick={request_answer_export}
						class="tq-button tq-button-primary"
						data-ui="remote-export"
					>
						{$t('admin_page.export_results')}
					</button>
				{/if}
			{:else if timer_res === '0' || selected_question === -1}
				{#if (selected_question + 1 !== game_data.questions.length && question_results !== null) || selected_question === -1}
					<button
						onclick={() => {
							set_question_number(selected_question + 1);
						}}
						class="tq-button tq-button-primary"
						data-ui="remote-next-question"
					>
						{$t('admin_page.next_question', { question: selected_question + 2 })}
					</button>
				{/if}
				{#if question_results === null && selected_question !== -1}
					{#if game_data.questions[selected_question].type === QuizQuestionType.SLIDE}
						<button
							onclick={() => {
								set_question_number(selected_question + 1);
							}}
							class="tq-button tq-button-primary"
							data-ui="remote-next-question"
						>
							{$t('admin_page.next_question', { question: selected_question + 2 })}
						</button>
					{:else}
						<button
							onclick={get_question_results}
							class="tq-button tq-button-primary"
							data-ui="remote-show-results"
						>
							{$t('admin_page.show_results')}
						</button>
					{/if}
				{/if}
			{:else if selected_question !== -1}
				{#if game_data.questions[selected_question].type === QuizQuestionType.SLIDE}
					<button
						onclick={() => {
							set_question_number(selected_question + 1);
						}}
						class="tq-button tq-button-primary"
						data-ui="remote-next-question"
					>
						{$t('admin_page.next_question', { question: selected_question + 2 })}
					</button>
				{:else}
					<button
						onclick={show_solutions}
						class="tq-button tq-button-primary"
						data-ui="remote-stop-time"
					>
						{$t('admin_page.stop_time_and_solutions')}
					</button>
				{/if}
			{/if}
		</div>
		{#if selected_question === -1}
			<section class="tq-panel tq-panel-body tq-stack remote-intro">
				<h1 class="remote-title">{game_data.title}</h1>
				<p>{game_data.description}</p>
			</section>
		{:else if game_data.questions[selected_question].type === QuizQuestionType.SLIDE}
			{#await import('$lib/play/admin/slide.svelte')}
				<Spinner my_20={false} />
			{:then c}
				<c.default question={game_data.questions[selected_question]} />
			{/await}
		{:else}
			<section class="tq-panel tq-panel-body remote-question">
				<header class="remote-question-head">
					<h1 class="remote-title">
						{@html game_data.questions[selected_question].question}
					</h1>
					<CircularTimer text={timer_res} progress={circular_progress} size={64} />
				</header>
				{#if game_data.questions[selected_question].image !== null}
					<img
						src="/api/v1/storage/download/{game_data.questions[selected_question]
							.image}"
						class="remote-image"
						alt={$t('words.image')}
					/>
				{/if}
				{#if game_data.questions[selected_question].type === QuizQuestionType.ABCD || game_data.questions[selected_question].type === QuizQuestionType.VOTING}
					<div class="remote-answers">
						{#each game_data.questions[selected_question].answers as Answer[] as answer, i}
							<AnswerTile
								index={i}
								label={answer.answer}
								color={answer.color}
								dimmed={!answer.right &&
									game_data.questions[selected_question].type ===
										QuizQuestionType.ABCD}
							/>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		{#if timer_res === '0' && JSON.stringify(final_results) === JSON.stringify( [null] ) && game_data.questions[selected_question].type !== QuizQuestionType.SLIDE}
			{#if game_data.questions[selected_question].type === QuizQuestionType.VOTING && question_results}
				{#await import('$lib/play/admin/voting_results.svelte')}
					<Spinner />
				{:then c}
					<c.default
						data={question_results}
						question={game_data.questions[selected_question]}
					/>
				{/await}
			{/if}
		{/if}
	{:else}
		<button
			onclick={start_game}
			class="tq-button tq-button-primary remote-start"
			data-ui="remote-start"
		>
			{$t('admin_page.start_game')}
		</button>

		<section class="tq-panel tq-panel-body tq-stack">
			<h2 class="tq-section-title">{$t('words.player_plural')}</h2>
			{#await get_already_joined_players()}
				<Spinner my_20={false} />
			{:then _}
				<ul class="remote-players">
					{#each players as player}
						<li>{player.username}</li>
					{/each}
				</ul>
			{/await}
		</section>
	{/if}
</main>

<a
	onclick={request_answer_export}
	href="#"
	bind:this={dataexport_download_a}
	class="absolute -top-3/4 -left-3/4 opacity-0 hidden">Download</a
>

<style>
	.remote {
		display: flex;
		flex-direction: column;
		gap: 16px;
		width: 100%;
		max-width: 720px;
		min-height: 100dvh;
		margin-inline: auto;
		padding: 12px 16px 32px;
	}

	.remote-bar {
		position: sticky;
		inset-block-start: 8px;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 8px 8px 16px;
		box-shadow: var(--tq-shadow);
	}

	.remote-progress {
		font-weight: 700;
	}

	.remote-actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.remote-actions :global(.tq-button),
	.remote-start {
		width: 100%;
		min-height: 64px;
		font-size: 18px;
	}

	.remote-title {
		min-width: 0;
		font-size: clamp(20px, 5vw, 28px);
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.remote-title :global(p) {
		margin: 0;
	}

	.remote-question {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.remote-question-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.remote-image {
		display: block;
		max-height: 20vh;
		width: auto;
		margin-inline: auto;
		border-radius: 8px;
		object-fit: contain;
	}

	.remote-answers {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.remote-players {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.remote-players li {
		padding: 10px 14px;
		border: 1px solid var(--tq-border);
		border-radius: 8px;
		overflow-wrap: anywhere;
	}
</style>
