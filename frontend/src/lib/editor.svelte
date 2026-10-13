<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { tick } from 'svelte';
	import { dataSchema } from '$lib/yupSchemas';
	import type { EditorData } from './quiz_types';
	import Sidebar from '$lib/editor/sidebar.svelte';
	import SettingsCard from '$lib/editor/settings-card.svelte';
	import QuizCard from '$lib/editor/card.svelte';
	import AddNewQuestionPopup from '$lib/editor/AddNewQuestionPopup.svelte';
	import Icon from '$lib/editor/Icon.svelte';
	import { plain_text } from '$lib/editor/text';
	import Spinner from './Spinner.svelte';
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();

	let schemaInvalid = $state(false);
	let yupErrorMessage = $state('');

	interface Props {
		data: EditorData;
		quiz_id: string | null;
	}

	let { data = $bindable(), quiz_id }: Props = $props();
	let selected_question = $state(-1);

	const validateInput = async (data: EditorData) => {
		try {
			await dataSchema.validate(data, { abortEarly: false });
			schemaInvalid = false;
			yupErrorMessage = '';
		} catch (err) {
			schemaInvalid = true;
			yupErrorMessage = err.errors ? err.errors[0] : '';
		}
	};
	$effect(() => {
		validateInput(data);
	});
	let edit_id: string = $state();
	let confirm_to_leave = true;

	const getEditID = async () => {
		let res: Response;
		if (quiz_id === null) {
			res = await fetch(`/api/v1/editor/start?edit=false`, {
				method: 'POST'
			});
		} else {
			res = await fetch(`/api/v1/editor/start?edit=true&quiz_id=${quiz_id}`, {
				method: 'POST'
			});
		}
		if (res.status === 200) {
			const json = await res.json();
			edit_id = json.token;
		} else {
			alert('Error!');
		}
	};

	const confirmUnload = (event: BeforeUnloadEvent) => {
		if (!confirm_to_leave) {
			return;
		}
		event.preventDefault();
		event.returnValue = 'Are you sure you want to leave?';
		localStorage.setItem('edit_game', JSON.stringify(data));
		return 'unload';
	};
	const saveQuiz = async (e: Event) => {
		e.preventDefault();
		if (schemaInvalid) {
			return;
		}
		const res = await fetch(`/api/v1/editor/finish?edit_id=${edit_id}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		});
		if (res.ok) {
			confirm_to_leave = false;
			console.log(confirm_to_leave);
			window.location.href = '/dashboard';
		} else {
			alert('Error');
		}
	};

	// On narrow screens the question navigation is a drawer instead of a fixed column.
	let nav_open = $state(false);
	let nav_toggle: HTMLButtonElement | undefined = $state();
	let sidebar_el: HTMLElement | undefined = $state();
	let top_height = $state(72);
	let add_question_open = $state(false);

	const open_nav = async () => {
		nav_open = true;
		await tick();
		sidebar_el?.querySelector<HTMLElement>('button')?.focus();
	};
	const close_nav = () => {
		if (!nav_open) {
			return;
		}
		nav_open = false;
		nav_toggle?.focus();
	};
	const handle_keydown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			close_nav();
		}
	};
</script>

<svelte:window onbeforeunload={confirmUnload} onkeydown={handle_keydown} />
{#await getEditID()}
	<div class="editor-loading">
		<Spinner />
	</div>
{:then _}
	<form
		onsubmit={saveQuiz}
		class="editor-workspace"
		style:--editor-top="{top_height}px"
		data-ui="quiz-editor"
	>
		<div class="editor-top" bind:offsetHeight={top_height}>
			<header class="editor-header">
				<a href="/dashboard" class="tq-button tq-button-ghost editor-back">
					<Icon name="arrow-left" />
					<span>{$t('words.back')}</span>
				</a>
				<button
					type="button"
					class="tq-button editor-nav-toggle"
					data-ui="question-drawer-open"
					aria-label={$t('words.question_plural')}
					aria-controls="editor-sidebar"
					aria-expanded={nav_open}
					bind:this={nav_toggle}
					onclick={open_nav}
				>
					<Icon name="menu" />
					<span>{$t('words.question_plural')}</span>
					<span class="tq-badge">{data.questions.length}</span>
				</button>
				<div class="editor-heading">
					<span class="editor-kicker">{$t('words.quiz')}</span>
					<h1>{plain_text(data.title) || $t('editor.no_title')}</h1>
				</div>
				<button type="submit" class="tq-button tq-button-primary" disabled={schemaInvalid}>
					{$t('words.save')}
				</button>
			</header>
			{#if schemaInvalid}
				<p class="editor-validation tq-alert tq-alert-error" role="status">
					{yupErrorMessage}
				</p>
			{/if}
		</div>
		<div class="editor-layout">
			<aside
				id="editor-sidebar"
				class="editor-sidebar"
				class:open={nav_open}
				bind:this={sidebar_el}
			>
				<Sidebar
					bind:data
					bind:selected_question
					onnavigate={close_nav}
					onclose={close_nav}
					onaddquestion={() => (add_question_open = true)}
				/>
			</aside>
			{#if nav_open}
				<button
					type="button"
					class="editor-scrim"
					tabindex="-1"
					aria-label={$t('words.close')}
					onclick={close_nav}
				></button>
			{/if}
			<main class="editor-content">
				{#if selected_question === -1}
					<SettingsCard bind:data bind:edit_id />
				{:else}
					{#key selected_question}
						<QuizCard bind:data bind:selected_question bind:edit_id />
					{/key}
				{/if}
			</main>
		</div>
		{#if add_question_open}
			<AddNewQuestionPopup
				bind:questions={data.questions}
				bind:open={add_question_open}
				bind:selected_question
				onadd={close_nav}
			/>
		{/if}
	</form>
{/await}

<style>
	.editor-loading {
		min-height: 100dvh;
		display: grid;
		place-items: center;
	}
	.editor-workspace {
		min-height: 100dvh;
		background: var(--tq-surface-subtle);
	}
	.editor-top {
		position: sticky;
		top: 0;
		z-index: 30;
		background: var(--tq-surface);
		border-bottom: 1px solid var(--tq-border);
	}
	.editor-header {
		display: flex;
		align-items: center;
		gap: 16px;
		min-height: 72px;
		padding: 12px 24px;
	}
	.editor-heading {
		flex: 1;
		min-width: 0;
	}
	.editor-heading h1 {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 20px;
		font-weight: 700;
	}
	.editor-kicker {
		display: block;
		color: var(--tq-muted);
		font-size: 14px;
		line-height: 1.2;
	}
	.editor-nav-toggle {
		display: none;
	}
	.editor-validation {
		margin: 0;
		border-width: 1px 0 0;
		border-radius: 0;
		padding: 10px 24px;
		font-size: 14px;
	}
	.editor-layout {
		display: grid;
		grid-template-columns: 304px minmax(0, 1fr);
		align-items: start;
	}
	.editor-sidebar {
		position: sticky;
		top: var(--editor-top);
		height: calc(100dvh - var(--editor-top));
		overflow-y: auto;
		background: var(--tq-surface);
		border-inline-end: 1px solid var(--tq-border);
	}
	.editor-scrim {
		display: none;
	}
	.editor-content {
		min-width: 0;
		width: 100%;
		max-width: 1080px;
		margin-inline: auto;
		padding: 24px;
	}

	@media (max-width: 1023px) {
		.editor-layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.editor-nav-toggle {
			display: inline-flex;
		}
		.editor-sidebar {
			display: none;
		}
		.editor-sidebar.open {
			display: block;
			position: fixed;
			z-index: 50;
			inset-block: 0;
			inset-inline-start: 0;
			width: min(340px, calc(100vw - 48px));
			height: 100dvh;
			box-shadow: var(--tq-shadow);
		}
		.editor-scrim {
			display: block;
			position: fixed;
			z-index: 45;
			inset: 0;
			background: rgb(0 0 0 / 55%);
			cursor: pointer;
		}
	}
	@media (max-width: 767px) {
		.editor-header {
			gap: 8px;
			padding: 8px 16px;
			min-height: 64px;
		}
		.editor-back span {
			display: none;
		}
		.editor-back {
			width: 44px;
			padding: 10px;
		}
		.editor-kicker {
			display: none;
		}
		.editor-heading h1 {
			font-size: 17px;
		}
		.editor-nav-toggle > span:first-of-type {
			display: none;
		}
		.editor-validation {
			padding: 8px 16px;
		}
		.editor-content {
			padding: 16px;
		}
	}
</style>
