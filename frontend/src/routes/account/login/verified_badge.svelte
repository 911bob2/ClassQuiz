<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	const { t } = getLocalization();
</script>

<div class="verified tq-alert tq-alert-success" role="status" data-ui="login-verified">
	<svg
		aria-hidden="true"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			d="M10.2426 16.3137L6 12.071L7.41421 10.6568L10.2426 13.4853L15.8995 7.8284L17.3137 9.24262L10.2426 16.3137Z"
			fill="currentColor"
		/>
		<path
			fill-rule="evenodd"
			clip-rule="evenodd"
			d="M1 12C1 5.92487 5.92487 1 12 1C18.0751 1 23 5.92487 23 12C23 18.0751 18.0751 23 12 23C5.92487 23 1 18.0751 1 12ZM12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21Z"
			fill="currentColor"
		/>
	</svg>
	<p>
		{$t('telekom.email_verified', {
			defaultValue: 'Your email address has been confirmed.'
		})}
	</p>
</div>

<style>
	.verified {
		display: flex;
		align-items: center;
		gap: 12px;
		width: calc(100% - 32px);
		max-width: 440px;
		margin: 24px auto 0;
	}
	svg {
		flex-shrink: 0;
	}
	p {
		margin: 0;
		font-weight: 500;
	}
</style>
