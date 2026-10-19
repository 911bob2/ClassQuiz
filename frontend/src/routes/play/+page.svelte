<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<!--suppress ALL -->
<script lang="ts">
	import { roomEvents } from '$lib/room-socket';
	const listen = roomEvents();
	import { socket, connectRoom } from '$lib/socket';
	import { onMount, onDestroy } from 'svelte';
	import JoinGame from '$lib/play/join.svelte';
	import type { Question as QuestionType } from '$lib/quiz_types';
	import ShowTitle from '$lib/play/title.svelte';
	import Question from '$lib/play/question.svelte';
	import { navbarVisible } from '$lib/stores.svelte.ts';
	import ShowEndScreen from '$lib/play/admin/final_results.svelte';
	import KahootResults from '$lib/play/results_kahoot.svelte';
	import LargeAudienceResults from '$lib/play/large_audience_results.svelte';
	import { getLocalization } from '$lib/i18n';
	import Cookies from 'js-cookie';
	import { backgroundText } from '$lib/play/background';
	const { t } = getLocalization();

	interface Props {
		// Exports
		data: any;
	}

	let { data }: Props = $props();
	let { game_pin } = $state(data);

	// Types
	interface GameMeta {
		started: boolean;
	}

	let game_mode = $state();
	let final_results: Array<null> | Array<Array<PlayerAnswer>> = $state([null]);

	interface PlayerAnswer {
		username: string;
		answer: string;
		right: string;
	}

	// Variables init
	let question_index = $state('');
	let question_token: string | undefined = $state();
	let already_submitted = $state(false);
	let remaining_ms: number | undefined = $state();
	let reconnecting = $state(false);
	let connection_error = $state('');
	let restoring = false;
	let personal_result: any = $state();
	let personal_final: any = $state();
	let unique = $state({});
	navbarVisible.visible = false;
	let answer_results: any = $state();
	let gameData: any = $state();
	let solution: QuestionType = $state();
	let username = $state('');
	let scores = $state({});
	let gameMeta: GameMeta = $state({
		started: false
	});

	let question: QuestionType = $state();

	let preventReload = true;

	// Functions
	function restart() {
		unique = {};
	}

	const confirmUnload = (event: Event) => {
		if (preventReload) {
			event.preventDefault();
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			event.returnValue = '';
		}
	};

	listen('time_sync', (data) => {
		socket.emit('echo_time_sync', data);
	});

	const restorePlayer = async () => {
		if (restoring) return;
		const cookie_data = Cookies.get('joined_game');
		if (!cookie_data) {
			return;
		}
		restoring = true;
		try {
			const data = JSON.parse(cookie_data);
			game_pin = data.game_pin;
			username = data.username;
			const metadata = await connectRoom(game_pin);
			game_mode = metadata.game_mode;
			socket.emit(data.pending ? 'join_game' : 'rejoin_game', {
				old_sid: data.sid,
				username: data.username,
				game_pin: data.game_pin,
				resume_token: data.resume_token
			});
			connection_error = '';
		} catch (error) {
			connection_error = error.message;
		} finally {
			restoring = false;
		}
	};
	listen('connect', restorePlayer);
	const disconnected = () => {
		if (gameData?.realtime_engine === 'rust') reconnecting = true;
	};
	listen('disconnect', disconnected);
	onMount(() => {
		if (socket.connected) restorePlayer();
	});
	onDestroy(() => {
		socket.off('connect', restorePlayer);
		socket.off('disconnect', disconnected);
	});
	const rememberPlayer = (data) => {
		const old = JSON.parse(Cookies.get('joined_game') || '{}');
		Cookies.set(
			'joined_game',
			JSON.stringify({
				sid: socket.id,
				username,
				game_pin,
				resume_token: data.resume_token || old.resume_token
			}),
			{ expires: 1, sameSite: 'lax' }
		);
		reconnecting = false;
		connection_error = '';
	};
	listen('error', () => {
		connection_error = 'The quiz request failed. Check the connection and retry.';
	});
	listen('room_full', () => {
		connection_error = 'This room has reached its player limit.';
		Cookies.remove('joined_game');
	});
	listen('game_already_started', () => {
		connection_error = 'This quiz has already started.';
		Cookies.remove('joined_game');
	});

	// Socket-events
	listen('joined_game', (data) => {
		gameData = data;
		rememberPlayer(data);
	});
	listen('rejoined_game', (data) => {
		gameData = data;
		rememberPlayer(data);
		if (data.started) {
			gameMeta.started = true;
		}
	});

	listen('game_not_found', () => {
		const cookie_data = Cookies.get('joined_game');
		if (cookie_data) {
			Cookies.remove('joined_game');
			window.location.reload();
			return;
		}
	});

	listen('set_question_number', (data) => {
		solution = undefined;
		restart();
		question = data.question;
		question_index = data.question_index;
		question_token = data.question_token;
		already_submitted = false;
		remaining_ms = undefined;
		personal_result = undefined;
		answer_results = undefined;
	});
	listen('room_state', (data) => {
		gameMeta.started = data.started === true;
		if (data.question_index >= 0 && data.question) {
			question_index = data.question_index;
			question_token = data.question_token;
			question = data.question;
			already_submitted = data.answered;
			remaining_ms = data.remaining_ms;
			solution = data.solution;
			personal_result = undefined;
			answer_results = undefined;
			restart();
		}
		reconnecting = false;
	});
	listen('answer_committed', (data) => {
		if (data.question_index === Number(question_index)) already_submitted = true;
	});

	listen('start_game', () => {
		gameMeta.started = true;
	});

	listen('question_results', (data) => {
		restart();
		answer_results = data;
	});
	listen('personal_question_results', (data) => {
		if (data.version === 1 && data.question_index === Number(question_index)) {
			personal_result = data;
		}
	});
	listen('personal_final_results', (data) => {
		if (data.version === 1) {
			personal_final = data;
			preventReload = false;
			Cookies.remove('joined_game');
		}
	});

	listen('username_already_exists', () => {
		window.alert('Username already exists!');
	});

	listen('kick', () => {
		window.alert('You got kicked');
		preventReload = false;
		game_pin = '';
		username = '';
		Cookies.set('kicked', 'value', { expires: 1 });
		window.location.reload();
	});
	listen('final_results', (data) => {
		final_results = data;
		Cookies.remove('joined_game');
	});

	listen('solutions', (data) => {
		solution = data;
	});

	let bg_color = $derived(gameData ? gameData.background_color : undefined);
	let text_color = $derived(backgroundText(bg_color));
	// The server sends question_count; the preview fixtures send the questions themselves.
	let question_count = $derived(
		gameData ? (gameData.question_count ?? gameData.questions?.length) : undefined
	);

	// The rest
</script>

<svelte:window onbeforeunload={confirmUnload} />
<svelte:head>
	<title>Telekom Quiz · {$t('words.play')}</title>
</svelte:head>
<div
	class="play-root"
	style="background: {bg_color ? bg_color : 'transparent'}"
	style:color={text_color}
>
	{#if reconnecting || connection_error}
		<p class="tq-panel tq-panel-body" role="status">
			{connection_error ||
				'Reconnecting… Your stored answers are safe; the question timer keeps running.'}
		</p>
	{/if}
	{#if !gameMeta.started && gameData === undefined}
		<JoinGame bind:game_pin bind:game_mode bind:username />
	{:else if personal_final}
		<LargeAudienceResults result={personal_final} final={true} />
	{:else if JSON.stringify(final_results) !== JSON.stringify([null])}
		<ShowEndScreen bind:data={scores} show_final_results={true} {username} />
	{:else if gameData !== undefined && question_index === ''}
		<ShowTitle
			title={gameData.title}
			description={gameData.description}
			cover_image={gameData.cover_image}
			{username}
		/>
	{:else if personal_result}
		<LargeAudienceResults result={personal_result} />
	{:else if gameMeta.started && gameData !== undefined && question_index !== '' && answer_results === undefined}
		{#key unique}
			<Question
				bind:game_mode
				bind:question
				{question_index}
				{question_token}
				{question_count}
				{solution}
				{already_submitted}
				{remaining_ms}
			/>
		{/key}
	{:else if gameMeta.started && answer_results !== undefined}
		{#if answer_results === null}
			<main class="tq-page tq-page-narrow play-status">
				<p class="tq-panel tq-panel-body play-status-text">{$t('admin_page.no_answers')}</p>
			</main>
		{:else}
			{#key unique}
				<KahootResults {username} question_results={answer_results} bind:scores />
			{/key}
		{/if}
	{/if}
</div>

<style>
	.play-root {
		min-height: 100dvh;
		min-width: 100%;
	}

	.play-status {
		display: flex;
		align-items: center;
		min-height: 100dvh;
	}

	.play-status-text {
		width: 100%;
		font-size: 24px;
		font-weight: 700;
		text-align: center;
	}
</style>
