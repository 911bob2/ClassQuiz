<!-- SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
SPDX-License-Identifier: MPL-2.0 -->
<script lang="ts">
	import LanguageToggle from './language-toggle.svelte';
	import { getLocalization } from '$lib/i18n';
	const { t } = getLocalization();
</script>

<footer class="tq-footer">
	<div>
		<span class="font-bold">Telekom Quiz</span>
		<nav aria-label={$t('ui.footer')}>
			<a href="/docs">{$t('words.docs')}</a><a href="/docs/privacy-policy"
				>{$t('ui.privacy')}</a
			><a href="/docs/attribution">{$t('ui.attribution')}</a>
		</nav>
		<LanguageToggle />
	</div>
</footer>

<style>
	.tq-footer {
		width: 100%;
		border-top: 1px solid var(--tq-border);
		color: var(--tq-muted);
		margin-top: auto;
		background: var(--tq-surface);
	}
	.tq-footer > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		flex-wrap: wrap;
		max-width: 1280px;
		margin-inline: auto;
		padding: 24px;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
		font-size: 14px;
	}
	a:hover {
		color: var(--tq-accent);
		text-decoration: underline;
	}
	@media (max-width: 767px) {
		.tq-footer > div {
			padding: 24px 16px;
			gap: 16px;
		}
	}
</style>
