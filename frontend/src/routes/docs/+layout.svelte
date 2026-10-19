<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import Footer from '$lib/footer.svelte';
	import { navbarVisible } from '$lib/stores.svelte.ts';
	import { page } from '$app/state';
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	navbarVisible.visible = true;

	const groups = [
		{
			title: 'Using Telekom Quiz',
			links: [
				{ href: '/docs/quiz/question-types', label: 'Question types' },
				{ href: '/docs/features', label: 'Features' },
				{ href: '/docs/large-audiences', label: 'Large audiences & Rust' },
				{ href: '/docs/import-from-kahoot', label: 'Import from Kahoot' },
				{ href: '/docs/classquizcontroller', label: 'ClassQuizController' }
			]
		},
		{
			title: 'Operation',
			links: [
				{ href: '/docs/self-host', label: 'Self-hosting' },
				{ href: '/docs/develop', label: 'Development setup' },
				{ href: '/docs/roadmap', label: 'Roadmap' },
				{ href: '/docs/pow', label: 'Proof of work' }
			]
		},
		{
			title: 'Legal',
			links: [
				{ href: '/docs/privacy-policy', label: 'Privacy policy' },
				{ href: '/docs/tos', label: 'Terms of service' },
				{ href: '/docs/attribution', label: 'Attribution' }
			]
		}
	];

	const is_current = (href: string): boolean => {
		const path = page.url.pathname.replace(/\/$/, '');
		return path === href || path.startsWith(href + '/');
	};
</script>

<div class="tq-page docs-layout">
	<nav class="docs-nav" aria-label="Documentation" data-ui="docs-nav">
		<a
			class="docs-link docs-home"
			href="/docs"
			aria-current={page.url.pathname.replace(/\/$/, '') === '/docs' ? 'page' : undefined}
		>
			Documentation
		</a>
		{#each groups as group}
			<div class="docs-group">
				<p class="docs-group-title">{group.title}</p>
				<ul>
					{#each group.links as link}
						<li>
							<a
								class="docs-link"
								href={link.href}
								aria-current={is_current(link.href) ? 'page' : undefined}
							>
								{link.label}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</nav>
	<main class="docs-content" id="docs-content">
		{@render children?.()}
	</main>
</div>
<Footer />

<style>
	.docs-layout {
		display: grid;
		grid-template-columns: 240px minmax(0, 1fr);
		gap: 48px;
		align-items: start;
	}
	.docs-nav {
		position: sticky;
		inset-block-start: calc(var(--tq-header-height) + 24px);
		display: grid;
		gap: 24px;
	}
	.docs-group-title {
		margin: 0 0 8px;
		padding-inline: 15px;
		color: var(--tq-muted);
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.docs-group ul {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.docs-link {
		display: flex;
		align-items: center;
		min-height: 44px;
		padding-inline: 12px;
		border-inline-start: 3px solid transparent;
		color: var(--tq-text);
		font-weight: 500;
	}
	.docs-home {
		font-weight: 700;
	}
	.docs-link:hover {
		background: var(--tq-surface-subtle);
	}
	.docs-link[aria-current='page'] {
		border-inline-start-color: var(--tq-accent);
		background: var(--tq-brand-soft);
		color: var(--tq-accent);
		font-weight: 700;
	}
	.docs-content {
		min-width: 0;
	}
	.docs-content :global(.tq-prose) {
		--tw-prose-hr: var(--tq-border);
		--tw-prose-quote-borders: var(--tq-border-strong);
		--tw-prose-captions: var(--tq-muted);
		--tw-prose-lead: var(--tq-muted);
		--tw-prose-kbd: var(--tq-text);
		max-width: 72ch;
		margin: 0;
	}
	.docs-content :global(.tq-prose h1) {
		font-size: 32px;
		letter-spacing: -0.025em;
	}
	.docs-content :global(.tq-prose :not(pre) > code) {
		padding: 2px 6px;
		border-radius: 4px;
		background: var(--tq-surface-hover);
		font-weight: 500;
	}
	.docs-content :global(.tq-prose :not(pre) > code::before),
	.docs-content :global(.tq-prose :not(pre) > code::after) {
		content: none;
	}
	.docs-content :global(.tq-prose pre) {
		border-radius: 8px;
		background: var(--tq-text);
		color: var(--tq-page);
	}
	.docs-content :global(.tq-prose pre code) {
		background: transparent;
		color: inherit;
	}
	:global(html.dark) .docs-content :global(.tq-prose pre) {
		border: 1px solid var(--tq-border);
		background: var(--tq-surface-subtle);
		color: var(--tq-text);
	}
	@media (max-width: 767px) {
		.docs-layout {
			display: block;
		}
		.docs-nav {
			position: static;
			display: flex;
			gap: 4px;
			margin-bottom: 24px;
			padding-bottom: 8px;
			border-bottom: 1px solid var(--tq-border);
			overflow-x: auto;
		}
		.docs-group {
			display: contents;
		}
		.docs-group-title {
			display: none;
		}
		.docs-group ul {
			display: contents;
		}
		.docs-link {
			flex-shrink: 0;
			padding-inline: 12px;
			border-radius: 8px;
			border-inline-start-width: 0;
			white-space: nowrap;
		}
	}
</style>
