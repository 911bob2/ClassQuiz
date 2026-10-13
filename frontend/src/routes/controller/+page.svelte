<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();
</script>

<svelte:head>
	<title>Telekom Quiz Controller</title>
</svelte:head>

<main class="tq-page tq-page-narrow">
	<section class="tq-panel tq-panel-body tq-stack" data-ui="controller-info">
		<h1 class="tq-page-title">Telekom Quiz Controller</h1>
		<p>
			{$t('telekom.controller_intro', {
				defaultValue: 'Play a quiz with a physical controller instead of a touchscreen.'
			})}
		</p>
		<div class="tq-toolbar">
			<a class="tq-button tq-button-primary" href="/account/controllers">
				{$t('telekom.your_controllers', { defaultValue: 'Your controllers' })}
			</a>
			<a class="tq-button" href="/docs/classquizcontroller">{$t('words.docs')}</a>
		</div>
	</section>
</main>
