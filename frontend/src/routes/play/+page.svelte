<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<!--suppress ALL -->
<script lang="ts">
	import { socket } from '$lib/socket';
	import JoinGame from '$lib/play/join.svelte';
	import type { Question as QuestionType } from '$lib/quiz_types';
	import ShowTitle from '$lib/play/title.svelte';
	import Question from '$lib/play/question.svelte';
	import { navbarVisible } from '$lib/stores.svelte.ts';
	import ShowEndScreen from '$lib/play/admin/final_results.svelte';
	import KahootResults from '$lib/play/results_kahoot.svelte';
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

	socket.on('time_sync', (data) => {
		socket.emit('echo_time_sync', data);
	});

	socket.on('connect', async () => {
		console.log('Connected!');
		const cookie_data = Cookies.get('joined_game');
		if (!cookie_data) {
			return;
		}
		const data = JSON.parse(cookie_data);
		socket.emit('rejoin_game', {
			old_sid: data.sid,
			username: data.username,
			game_pin: data.game_pin
		});
		const res = await fetch(`/api/v1/quiz/play/check_captcha/${game_pin}`);
		const json = await res.json();
		game_mode = json.game_mode;
	});

	// Socket-events
	socket.on('joined_game', (data) => {
		gameData = data;
		Cookies.set('joined_game', JSON.stringify({ sid: socket.id, username, game_pin }), {
			expires: 3600
		});
	});
	socket.on('rejoined_game', (data) => {
		gameData = data;
		if (data.started) {
			gameMeta.started = true;
		}
	});

	socket.on('game_not_found', () => {
		const cookie_data = Cookies.get('joined_game');
		if (cookie_data) {
			Cookies.remove('joined_game');
			window.location.reload();
			return;
		}
	});

	socket.on('set_question_number', (data) => {
		solution = undefined;
		restart();
		question = data.question;
		question_index = data.question_index;
		answer_results = undefined;
	});

	socket.on('start_game', () => {
		gameMeta.started = true;
	});

	socket.on('question_results', (data) => {
		restart();
		answer_results = data;
	});

	socket.on('username_already_exists', () => {
		window.alert('Username already exists!');
	});

	socket.on('kick', () => {
		window.alert('You got kicked');
		preventReload = false;
		game_pin = '';
		username = '';
		Cookies.set('kicked', 'value', { expires: 1 });
		window.location.reload();
	});
	socket.on('final_results', (data) => {
		final_results = data;
		Cookies.remove('joined_game');
	});

	socket.on('solutions', (data) => {
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
	{#if !gameMeta.started && gameData === undefined}
		<JoinGame bind:game_pin bind:game_mode bind:username />
	{:else if JSON.stringify(final_results) !== JSON.stringify([null])}
		<ShowEndScreen bind:data={scores} show_final_results={true} {username} />
	{:else if gameData !== undefined && question_index === ''}
		<ShowTitle
			title={gameData.title}
			description={gameData.description}
			cover_image={gameData.cover_image}
			{username}
		/>
	{:else if gameMeta.started && gameData !== undefined && question_index !== '' && answer_results === undefined}
		{#key unique}
			<Question bind:game_mode bind:question {question_index} {question_count} {solution} />
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
