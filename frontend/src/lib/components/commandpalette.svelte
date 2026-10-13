<!-- SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
SPDX-License-Identifier: MPL-2.0 -->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { tinykeys } from '$lib/tinykeys';
	import { getLocalization } from '$lib/i18n';
	const { t } = getLocalization();
	let dialog: HTMLDialogElement;
	let searchInput: HTMLInputElement;
	let input = $state('');
	let selected = $state(0);
	const actions = [
		{
			command: 'newquiz',
			key: 'words.create',
			label: 'Create quiz',
			path: '/create',
			argument: 'title'
		},
		{
			command: 'import',
			key: 'words.import',
			label: 'Import',
			path: '/import',
			argument: 'url'
		},
		{
			command: 'newquiztivity',
			key: 'ui.create_activity',
			label: 'Create activity',
			path: '/quiztivity/create',
			argument: 'title'
		},
		{ command: 'results', key: 'words.results', label: 'Results', path: '/results' },
		{ command: 'explore', key: 'words.explore', label: 'Explore', path: '/explore' },
		{ command: 'dash', key: 'words.dashboard', label: 'Dashboard', path: '/dashboard' },
		{ command: 'docs', key: 'words.docs', label: 'Docs', path: '/docs' },
		{
			command: 'settings',
			key: 'words.settings',
			label: 'Settings',
			path: '/account/settings'
		},
		{ command: 'close', key: 'ui.close', label: 'Close' }
	];
	const label = (action: (typeof actions)[number]) =>
		$t(action.key, { defaultValue: action.label });
	const matches = $derived(
		actions.filter((action) => {
			const query = input.trim().toLowerCase();
			return query.startsWith('/')
				? action.command.startsWith(query.slice(1).split(' ')[0])
				: label(action).toLowerCase().includes(query) || action.command.includes(query);
		})
	);
	function close() {
		dialog.close();
	}
	async function toggle(event: KeyboardEvent) {
		event.preventDefault();
		if (dialog.open) {
			close();
			return;
		}
		input = '';
		selected = 0;
		dialog.showModal();
		await tick();
		searchInput.focus();
	}
	function execute(index = selected) {
		const action = matches[index];
		if (!action) return;
		close();
		if (!action.path) return;
		const argument = input.startsWith('/') ? input.trim().split(/\s+/).slice(1).join(' ') : '';
		window.location.assign(
			action.argument
				? action.path + '?' + action.argument + '=' + encodeURIComponent(argument)
				: action.path
		);
	}
	function navigate(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selected = Math.min(selected + 1, matches.length - 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selected = Math.max(0, selected - 1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			execute();
		}
	}
	onMount(() => tinykeys(window, { '$mod+k': toggle }));
</script>

<dialog bind:this={dialog} class="tq-dialog tq-command-dialog" aria-label={$t('ui.commands')}>
	<div class="flex justify-between items-center gap-4 mb-4">
		<h2 class="tq-section-title">{$t('ui.commands')}</h2>
		<button
			type="button"
			class="tq-icon-button tq-button-ghost"
			aria-label={$t('ui.close')}
			onclick={close}>×</button
		>
	</div>
	<input
		bind:this={searchInput}
		bind:value={input}
		type="search"
		class="tq-field"
		aria-label={$t('ui.search_commands')}
		placeholder={$t('ui.search_commands')}
		oninput={() => (selected = 0)}
		onkeydown={navigate}
	/>
	<div class="tq-command-list">
		{#each matches as action, index}
			<button
				type="button"
				class="tq-command-item"
				class:selected={index === selected}
				onclick={() => execute(index)}
				onmouseenter={() => (selected = index)}
			>
				<span>{label(action)}</span><code>/{action.command}</code>
			</button>
		{:else}
			<p class="tq-empty">{$t('ui.no_results')}</p>
		{/each}
	</div>
</dialog>

<style>
	.tq-command-dialog {
		max-width: min(560px, calc(100vw - 32px));
	}
	.tq-command-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 12px;
		max-height: 50dvh;
		overflow-y: auto;
	}
	.tq-command-item {
		min-height: 48px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		padding: 12px;
		border-radius: 8px;
		text-align: start;
	}
	.tq-command-item.selected,
	.tq-command-item:hover {
		background: var(--tq-brand-soft);
		color: var(--tq-accent);
	}
	code {
		font-size: 12px;
		color: var(--tq-muted);
	}
</style>
