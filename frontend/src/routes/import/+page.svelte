<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import { navbarVisible } from '$lib/stores.svelte.ts';
	import Footer from '$lib/footer.svelte';
	import Spinner from '$lib/Spinner.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	navbarVisible.visible = true;

	const { t } = getLocalization();
	let url_input = $state('');
	let file_input: FileList | undefined = $state();
	let kahoot_regex = /^https:\/\/create\.kahoot\.it\/details\/.*\/?([a-zA-Z-\d]{36})\/?$/;

	let url_valid = $derived(kahoot_regex.test(url_input));
	let is_loading = $state(false);
	let source: 'kahoot' | 'file' = $state('kahoot');

	const submit = async (e: Event) => {
		e.preventDefault();
		if (!url_valid) {
			return;
		}
		is_loading = true;
		const regex_res = kahoot_regex.exec(url_input);
		const res = await fetch(`/api/v1/quiz/import/${regex_res[1]}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (res.status === 200) {
			window.location.href = '/dashboard';
		} else if (res.status === 400) {
			/*			alertModal.set({
				open: true,
				title: 'Import failed',
				body: "This quiz isn't (yet) supported!"
			});*/
			alert("This quiz isn't (yet) supported!");
		} else if (res.status === 403) {
			/*			alertModal.set({
				open: true,
				title: 'Import failed',
				body: 'Unknown error while importing the quiz!'
			});*/
			alert('Quiz is probably private!');
		} else {
			alert(`Kahoot replied with ${res.status}`);
		}
		is_loading = false;
	};

	const file_submit = async (e: Event) => {
		e.preventDefault();
		is_loading = true;
		const formdata = new FormData();
		formdata.append('file', file_input[0]);
		let res;
		if (file_input[0].name.includes('.xlsx')) {
			res = await fetch('/api/v1/quiz/excel-import', {
				method: 'POST',
				body: formdata
			});
		} else if (file_input[0].name.includes('.cqa')) {
			res = await fetch('/api/v1/eximport/', {
				method: 'POST',
				body: formdata
			});
		} else {
			alert('Wrong file type');
			is_loading = false;
			return;
		}

		if (res.status === 200) {
			window.location.href = '/dashboard';
		} else {
			/*			alertModal.set({
				open: true,
				title: 'Import failed',
				body: 'Something went wrong!'
			});*/
			alert('Something went wrong!');
		}
		is_loading = false;
	};

	onMount(() => {
		let url_from_path = page.url.searchParams.get('url');
		if (url_from_path === '') {
			url_from_path = null;
		}
		url_input = url_from_path ?? '';
	});
</script>

<svelte:head>
	<title>Telekom Quiz · {$t('words.import')}</title>
</svelte:head>

<main class="tq-page tq-page-narrow tq-stack" data-ui="import">
	<h1 class="tq-page-title">{$t('words.import')}</h1>

	<div class="tq-tabs" role="tablist" aria-label={$t('words.import')}>
		<button
			type="button"
			role="tab"
			id="tab-kahoot"
			class="tab"
			data-ui="import-tab-kahoot"
			aria-selected={source === 'kahoot'}
			aria-controls="panel-import"
			onclick={() => (source = 'kahoot')}
		>
			{$t('import_page.a_kahoot_quiz')}
		</button>
		<button
			type="button"
			role="tab"
			id="tab-file"
			class="tab"
			data-ui="import-tab-file"
			aria-selected={source === 'file'}
			aria-controls="panel-import"
			onclick={() => (source = 'file')}
		>
			{$t('import_page.classquiz_quiz')}
		</button>
	</div>

	<div
		class="tq-panel tq-panel-body"
		id="panel-import"
		role="tabpanel"
		aria-labelledby={source === 'kahoot' ? 'tab-kahoot' : 'tab-file'}
	>
		{#if source === 'kahoot'}
			<form class="tq-stack stack-4" onsubmit={submit} data-ui="import-kahoot">
				<p class="tq-muted">{$t('import_page.side_import_kahoot')}</p>
				<div class="tq-field-group">
					<label class="tq-label" for="url">{$t('words.url')}</label>
					<input
						class="tq-field"
						id="url"
						name="url"
						type="url"
						bind:value={url_input}
						placeholder="https://create.kahoot.it/details/…"
						aria-invalid={url_input !== '' && !url_valid}
						aria-describedby="url-hint"
					/>
					<p class="text-sm tq-muted" id="url-hint">
						{$t('import_page.url_should_look_like_this')}
					</p>
				</div>
				<div>
					<button
						class="tq-button tq-button-primary"
						type="submit"
						disabled={!url_valid || is_loading}
					>
						{#if is_loading}
							<Spinner my_20={false} />
						{:else}
							{$t('words.import')}
						{/if}
					</button>
				</div>
			</form>
		{:else}
			<form class="tq-stack stack-4" onsubmit={file_submit} data-ui="import-file">
				<p class="tq-muted">
					{$t('import_page.this_side_classquiz')}
					{$t('import_page.this_side_classquiz_excel')}
				</p>
				<div class="tq-field-group">
					<label class="tq-label" for="file">{$t('words.upload')}</label>
					<input
						class="tq-field"
						id="file"
						name="file"
						type="file"
						accept=".cqa,.xlsx"
						bind:files={file_input}
						aria-describedby="file-hint"
					/>
					<p class="text-sm tq-muted" id="file-hint">
						{$t('import_page.upload_file_ending')}
					</p>
				</div>
				<div>
					<button
						class="tq-button tq-button-primary"
						type="submit"
						disabled={!file_input?.length || is_loading}
					>
						{#if is_loading}
							<Spinner my_20={false} />
						{:else}
							{$t('words.import')}
						{/if}
					</button>
				</div>
			</form>
		{/if}
	</div>

	<p class="text-sm tq-muted">
		{$t('import_page.need_help')}
		<a class="tq-link" href="/docs/import-from-kahoot">{$t('import_page.visit_docs')}</a>
	</p>
</main>
<Footer />

<style>
	.stack-4 {
		gap: 16px;
	}
	.tab {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		min-height: 48px;
		padding: 12px 0;
		border-width: 0 0 3px;
		border-style: solid;
		border-color: transparent;
		background: transparent;
		color: var(--tq-muted);
		font-weight: 700;
	}
	.tab[aria-selected='true'] {
		border-bottom-color: var(--tq-accent);
		color: var(--tq-accent);
	}
	input[type='file'] {
		height: auto;
		padding: 8px 12px;
	}
</style>
