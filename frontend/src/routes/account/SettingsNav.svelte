<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	interface Props {
		current: 'settings' | 'security' | 'controllers';
	}

	let { current }: Props = $props();
	const { t } = getLocalization();
</script>

<nav class="tq-tabs" aria-label={$t('words.settings')} data-ui="settings-nav">
	<a
		class="tq-tab"
		href="/account/settings"
		aria-current={current === 'settings' ? 'page' : undefined}
	>
		{$t('words.settings')}
	</a>
	<a
		class="tq-tab"
		href="/account/settings/security"
		aria-current={current === 'security' ? 'page' : undefined}
	>
		{$t('settings_page.security_settings')}
	</a>
	<a
		class="tq-tab"
		href="/account/controllers"
		aria-current={current === 'controllers' ? 'page' : undefined}
	>
		{$t('telekom.controllers', { defaultValue: 'Controllers' })}
	</a>
</nav>
