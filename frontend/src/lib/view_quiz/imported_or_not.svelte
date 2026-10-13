<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	interface Props {
		imported: boolean | undefined;
	}

	let { imported }: Props = $props();
	const { t } = getLocalization();
</script>

{#if imported === true}
	<span class="tq-badge self-start" data-ui="quiz-origin">
		{$t('telekom.imported_from_kahoot', { defaultValue: 'Imported from Kahoot!' })}
	</span>
{:else if imported === false}
	<span class="tq-badge self-start" data-ui="quiz-origin">
		{$t('telekom.original_quiz', { defaultValue: 'Original quiz' })}
	</span>
{/if}
