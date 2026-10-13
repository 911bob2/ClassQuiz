<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import type { Markdown } from '$lib/quiztivity/types';
	import DOMPurify from 'dompurify';
	import { marked } from 'marked';
	import { browser } from '$app/environment';

	interface Props {
		data: Markdown | undefined;
	}

	let { data }: Props = $props();

	let rendered_html = $derived(
		browser ? DOMPurify.sanitize(marked.parse(data.markdown ?? '', { async: false })) : ''
	);
</script>

<section class="tq-panel tq-panel-body" data-ui="activity-markdown">
	<div class="prose tq-prose max-w-none">
		{@html rendered_html}
	</div>
</section>
