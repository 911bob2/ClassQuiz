<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { roomEvents } from '$lib/room-socket';
	const listen = roomEvents();
	import { socket, connectRoom } from '$lib/socket';
	import { getLocalization } from '$lib/i18n';
	import { navbarVisible } from '$lib/stores.svelte.ts';
	import SomeAdminScreen from '$lib/admin.svelte';
	import GameNotStarted from '$lib/play/admin/game_not_started.svelte';
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';
	import FinalResults from '$lib/play/admin/final_results.svelte';
	import NativeResults from '$lib/play/admin/native_results.svelte';
	import { page } from '$app/state';
	import { SocketGameControls } from '$lib/play/admin/socket_game_controls.ts';
	import type { IGameState, NativeHostSummary } from '$lib/play/admin/game_state.ts';
	import { QuizQuestionType, type QuizData } from '$lib/quiz_types';
	import type { Player, PlayerAnswer } from '$lib/admin';
	import { tinykeys } from '$lib/tinykeys';
	import { backgroundText } from '$lib/play/background';

	navbarVisible.visible = false;

	const { t } = getLocalization();

	// let gameData = {
	// 	game_id: 'a7ddb6af-79ab-45e0-b996-6254c1ad9818',
	// 	game_pin: '66190765'

	interface Props {
		// };
		data: any;
	}

	class GameState implements IGameState {
		public game_id: string;
		public players: Player[];
		public player_scores: Record<string, number>;
		public selected_question: number;
		public timer_res: string;
		public question_results: any;
		public answer_count: number;
		public shown_question_now: number;
		public final_results: Array<null> | Array<Array<PlayerAnswer>> | NativeHostSummary;
		public game_started: boolean;
		public quiz_data: QuizData;
		public control_visible: boolean;

		constructor(game_id: string) {
			this.game_id = game_id;
			this.players = $state([]);
			this.player_scores = $state({});
			this.selected_question = $state(-1);
			this.timer_res = $state(undefined);
			this.quiz_data = $state(null);
			this.control_visible = $state(true);
			this.shown_question_now = $state(-1);
			this.final_results = $state([null]);
			this.game_started = $state(false);
			this.question_results = $state(null);
			this.answer_count = $state(0);
		}

		is_game_ready_to_start(): boolean {
			return !this.game_started && this.players.length > 0;
		}

		is_game_starting(): boolean {
			return this.game_started && this.selected_question === -1;
		}

		is_active_question_last_question(): boolean {
			return this.selected_question + 1 === this.quiz_data.questions.length;
		}

		is_question_results_visible(): boolean {
			return this.timer_res === '0' && this.question_results !== null;
		}

		is_active_question_slide(): boolean {
			return (
				this.quiz_data?.questions?.[this.selected_question]?.type === QuizQuestionType.SLIDE
			);
		}

		is_question_ended(): boolean {
			return (
				this.timer_res === '0' &&
				this.question_results === null &&
				this.selected_question !== -1
			);
		}

		is_question_still_ongoing(): boolean {
			return this.timer_res !== '0' && this.selected_question !== -1;
		}
	}

	let { data }: Props = $props();
	let game_mode = $state();
	let { auto_connect, game_token } = $state(data);
	const game_pin = data.game_pin;
	let errorMessage = $state('');
	let success = $state(false);
	let dataexport_download_a = $state();
	let warnToLeave = true;
	let export_token = $state(undefined);

	const socket_game_controls: SocketGameControls = new SocketGameControls(socket);
	let game_state: GameState = $state(new GameState(game_token));
	let connecting = false;
	let registeredSID = '';
	let reconnecting = $state(false);

	const connect = async () => {
		if (connecting) return;
		connecting = true;
		try {
			const metadata = await connectRoom(game_pin);
			game_mode = metadata.game_mode;
			if (registeredSID === socket.id) return;
			registeredSID = socket.id;
			const key = `quiz-host-client:${game_pin}`;
			let client_id = sessionStorage.getItem(key);
			if (!client_id) {
				client_id = crypto.randomUUID();
				sessionStorage.setItem(key, client_id);
			}
			socket.emit('register_as_admin', {
				game_pin: game_pin,
				game_id: game_token,
				client_id
			});
		} catch (error) {
			errorMessage = error.message;
		} finally {
			connecting = false;
		}
	};
	const reconnectHost = () => {
		// Python keeps the host registered across a reconnect and would answer a
		// second registration with already_registered_as_admin.
		if (success && game_state.quiz_data?.realtime_engine !== 'rust') return;
		if (success || auto_connect) connect();
	};
	listen('host_replaced', () => {
		errorMessage = 'This host session moved to another tab. Refresh to take control again.';
		success = false;
	});
	const hostDisconnected = () => {
		if (game_state.quiz_data?.realtime_engine === 'rust') reconnecting = true;
	};
	listen('connect', reconnectHost);
	listen('disconnect', hostDisconnected);
	onDestroy(() => {
		socket.off('connect', reconnectHost);
		socket.off('disconnect', hostDisconnected);
	});
	onMount(() => {
		if (auto_connect) {
			connect();
		}
		return tinykeys(window, {
			Enter: next_action,
			Space: next_action
		});
	});
	listen('session_id', (d) => {
		const session_id = d.session_id;
	});

	listen('registered_as_admin', (data) => {
		game_state.quiz_data = JSON.parse(data['game']);
		console.log(game_state.quiz_data);
		success = true;
		reconnecting = false;
		errorMessage = '';
	});
	listen('error', () => {
		errorMessage = 'The quiz request failed. Check the connection and retry.';
		reconnecting = false;
	});
	// The route owns durable view state. Child components may mount after several
	// messages in one polling response; they must not be required to catch them.
	listen('set_question_number', (data) => {
		game_state.selected_question = data.question_index;
		game_state.shown_question_now = data.question_index;
		game_state.timer_res = game_state.quiz_data.questions[data.question_index].time;
		game_state.question_results = null;
		game_state.answer_count = 0;
	});
	listen('question_results', (data) => {
		game_state.question_results = data;
		game_state.timer_res = '0';
	});
	listen('final_results', (data) => {
		game_state.final_results = data;
		game_state.timer_res = '0';
	});
	listen('solutions', () => {
		game_state.timer_res = '0';
	});
	listen('player_answer', (data) => {
		if (data.question_index === game_state.shown_question_now)
			game_state.answer_count = Math.max(game_state.answer_count, data.count);
	});
	listen('everyone_answered', (data) => {
		if (
			data?.question_index === undefined ||
			data.question_index === game_state.shown_question_now
		)
			game_state.timer_res = '0';
	});
	listen('room_state', (data) => {
		game_state.players = data.players || [];
		game_state.game_started = data.started === true;
		game_state.selected_question = data.question_index;
		game_state.shown_question_now = data.question_index;
		game_state.answer_count = data.answer_count;
		game_state.timer_res =
			data.question_index < 0 ? undefined : String(Math.ceil(data.remaining_ms / 1000));
		game_state.question_results = null;
		game_state.player_scores = data.player_scores || {};
		reconnecting = false;
	});
	listen('player_joined', (int_data) => {
		game_state.players.push(int_data);
	});
	listen('already_registered_as_admin', () => {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		errorMessage = $t('admin_page.already_registered_as_admin');
	});

	listen('start_game', (_) => {
		game_state.game_started = true;
	});

	listen('control_visibility', (data) => {
		game_state.control_visible = data.visible;
	});

	/*	listen('question_results', (int_data) => {
        try {
            int_data = JSON.parse(int_data);
        } catch (e) {
            console.error('Failed to parse question results');
            return;
        }
        question_results = int_data;
    });*/
	listen('export_token', (int_data) => {
		warnToLeave = false;
		export_token = int_data;

		setTimeout(() => {
			warnToLeave = true;
		}, 200);
	});

	listen('results_saved_successfully', (_) => {
		results_saved = true;
	});

	const confirmUnload = () => {
		if (warnToLeave) {
			event.preventDefault();
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			event.returnValue = '';
		}
	};

	const request_answer_export = (e: Event) => {
		e.preventDefault();
		socket.emit('get_export_token');
	};
	const save_quiz = async () => {
		if (game_state.quiz_data?.realtime_engine === 'rust') {
			const response = await fetch(`/api/v1/quiz/realtime/${game_pin}/save`, {
				method: 'POST',
				headers: { 'X-Quiz-Host-Token': game_token }
			});
			if (response.ok) results_saved = true;
			else errorMessage = (await response.json()).detail || 'Saving failed. Please retry.';
			return;
		}
		socket.emit('save_quiz');
	};

	let darkMode = false;
	if (browser) {
		darkMode =
			localStorage.theme === 'dark' ||
			(!('theme' in localStorage) &&
				window.matchMedia('(prefers-color-scheme: dark)').matches);
	}

	let bg_color = $derived(
		game_state.quiz_data ? game_state.quiz_data.background_color : undefined
	);
	let bg_image = $derived(
		game_state.quiz_data ? game_state.quiz_data.background_image : undefined
	);
	let results_saved = $state(false);
	let text_color = $derived(backgroundText(bg_color));

	let show_final_results = $derived(
		JSON.stringify(game_state.final_results) !== JSON.stringify([null])
	);

	// This function in called in every keyboard event in this page
	const next_action = () => {
		if (
			game_state.is_active_question_last_question() &&
			(game_state.is_question_results_visible() || game_state.is_active_question_slide())
		) {
			socket_game_controls.get_final_results();
		} else if (
			game_state.is_game_starting() ||
			game_state.is_question_results_visible() ||
			game_state.is_active_question_slide()
		) {
			socket_game_controls.set_question_number(game_state.selected_question + 1);
		} else if (game_state.is_question_still_ongoing()) {
			socket_game_controls.show_solutions();
			game_state.timer_res = '0';
		} else if (game_state.is_question_ended()) {
			socket_game_controls.get_question_results(game_token, game_state.shown_question_now);
		} else {
			console.warn('No action available for this event');
		}
	};
</script>

<svelte:window onbeforeunload={confirmUnload} />
<svelte:head>
	<title>Telekom Quiz · Host</title>
</svelte:head>
{#if success && errorMessage}<p class="tq-panel tq-panel-body" role="alert">{errorMessage}</p>{/if}
{#if reconnecting}<p class="tq-panel tq-panel-body" role="status">
		Reconnecting to the quiz… Stored answers are retained. The timer keeps running.
	</p>{/if}
<div
	class="host-root"
	style="background-repeat: no-repeat;background-size: 100% 100%;background-image: {bg_image
		? `url('${bg_image}')`
		: `unset`}; background-color: {bg_color ? bg_color : 'transparent'}"
	style:color={text_color}
>
	{#if !success}
		{#if errorMessage !== ''}
			<main class="tq-page tq-page-narrow">
				<p class="tq-alert tq-alert-error" role="alert">{errorMessage}</p>
			</main>
		{/if}
	{:else if !game_state.game_started}
		<GameNotStarted
			{game_pin}
			bind:game_state
			{socket_game_controls}
			cqc_code={page.url.searchParams.get('cqc_code')}
		/>
	{:else}
		<SomeAdminScreen {game_token} {bg_color} bind:game_state />
	{/if}
	{#if show_final_results}
		{#snippet actions()}
			{#if game_state.control_visible}
				{#if export_token === undefined}
					<button
						class="tq-button"
						data-ui="host-request-export"
						onclick={request_answer_export}
					>
						{$t('admin_page.request_export_results')}
					</button>
				{:else}
					<a
						class="tq-button"
						data-ui="host-download-export"
						target="_blank"
						href="/api/v1/quiz/export_data/{export_token}?ts={new Date().getTime()}&game_pin={game_pin}"
					>
						{$t('admin_page.download_export_results')}
					</a>
				{/if}
				<button
					class="tq-button tq-button-primary"
					data-ui="host-save-results"
					onclick={save_quiz}
					disabled={results_saved}
				>
					{#if results_saved}
						<svg
							class="save-check"
							aria-hidden="true"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							viewBox="0 0 24 24"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M5 13l4 4L19 7"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						{$t('telekom.results_saved', { defaultValue: 'Results saved' })}
					{:else}
						{$t('admin_page.save_results')}
					{/if}
				</button>
			{/if}
		{/snippet}
		{#if 'native_summary' in game_state.final_results}
			<NativeResults summary={game_state.final_results} {actions} />
		{:else}
			<FinalResults bind:data={game_state.player_scores} {show_final_results} {actions} />
		{/if}
	{/if}
</div>
<a
	onclick={request_answer_export}
	href="#"
	target="_blank"
	bind:this={dataexport_download_a}
	download=""
	class="absolute size-px overflow-hidden whitespace-nowrap opacity-0">Download</a
>

<style>
	.host-root {
		min-height: 100dvh;
		min-width: 100%;
	}

	.save-check {
		width: 20px;
		height: 20px;
	}
</style>
