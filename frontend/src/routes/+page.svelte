<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { navbarVisible } from '$lib/stores.svelte.ts';
	import { signedIn } from '$lib/stores';
	import { getLocalization } from '$lib/i18n';
	import Footer from '$lib/footer.svelte';

	const { t } = getLocalization();
	navbarVisible.visible = true;
	let pin = $state('');
</script>

<svelte:head>
	<title>Telekom Quiz</title>
	<meta name="description" content="Telekom Quiz" />
</svelte:head>

<main class="tq-page tq-stack" data-ui="home">
	<h1 class="tq-page-title">Telekom Quiz</h1>

	<div class="home-grid">
		<section class="tq-panel tq-panel-body tq-stack" aria-labelledby="join-title">
			<h2 class="tq-section-title" id="join-title">
				{$t('telekom.join_game', { defaultValue: 'Join a game' })}
			</h2>
			<form class="tq-stack stack-4" action="/play">
				<div class="tq-field-group">
					<label class="tq-label" for="game-pin">{$t('words.game_pin')}</label>
					<input
						id="game-pin"
						data-ui="home-pin"
						name="pin"
						class="tq-field pin-input"
						inputmode="numeric"
						autocomplete="off"
						bind:value={pin}
						required
					/>
				</div>
				<button class="tq-button tq-button-primary" type="submit">
					{$t('telekom.join_game', { defaultValue: 'Join a game' })}
				</button>
			</form>
		</section>

		<section class="tq-panel tq-panel-body tq-stack" aria-labelledby="quiz-title">
			<h2 class="tq-section-title" id="quiz-title">{$t('words.quiz')}</h2>
			<nav class="grid gap-3" aria-labelledby="quiz-title">
				{#if $signedIn}
					<a class="tq-button" href="/dashboard" data-ui="home-library">
						{$t('telekom.library', { defaultValue: 'Quiz library' })}
					</a>
				{:else}
					<a class="tq-button" href="/account/login" data-ui="home-login">
						{$t('words.login')}
					</a>
				{/if}
				<a class="tq-button" href="/create" data-ui="home-create">
					{$t('dashboard.create_quiz')}
				</a>
				<a class="tq-button" href="/import" data-ui="home-import">{$t('words.import')}</a>
				<a class="tq-button" href="/explore" data-ui="home-explore">
					{$t('words.explore')}
				</a>
			</nav>
		</section>
	</div>
</main>
<Footer />

<style>
	.stack-4 {
		gap: 16px;
	}
	.home-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
	}
	.pin-input {
		font-size: 24px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-align: center;
		min-height: 56px;
	}
	@media (max-width: 767px) {
		.home-grid {
			grid-template-columns: minmax(0, 1fr);
			gap: 16px;
		}
	}
</style>
