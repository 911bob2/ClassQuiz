<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { browser } from '$app/environment';
	import { getLocalization } from '$lib/i18n';
	import { fade } from 'svelte/transition';
	import { thumbHashToDataURL } from 'thumbhash';
	import Icon from '$lib/editor/Icon.svelte';
	import { modal } from '$lib/editor/modal';

	const { t } = getLocalization();

	interface Props {
		src: string;
		css_classes?: string;
		added_thumbhash_classes?: string;
		muted?: boolean;
		allow_fullscreen?: boolean;
	}

	let {
		src,
		css_classes = 'max-h-64 h-auto w-auto',
		added_thumbhash_classes = 'h-full',
		muted = true,
		allow_fullscreen = true
	}: Props = $props();
	let type: 'img' | 'video' | undefined = $state(undefined);

	let img_data = $state();
	let thumbhash_data: string = $state();

	function base64ToBytes(base64: string): Uint8Array {
		const binString = atob(base64);
		return Uint8Array.from(binString, (m) => m.codePointAt(0));
	}

	const get_media = async (_: string) => {
		if (!browser) {
			return;
		}
		const res = await fetch(`/api/v1/storage/info/${src}`);
		const fileType = res.headers.get('Content-Type');
		if (fileType?.includes('video')) {
			type = 'video';
		} else {
			type = 'img';
			const thumbhash = res.headers.get('x-thumbhash');
			thumbhash_data = thumbhash ? thumbHashToDataURL(base64ToBytes(thumbhash)) : undefined;
			const data = await fetch(`/api/v1/storage/download/${src}`);
			img_data = {
				data: URL.createObjectURL(await data.blob()),
				alt_text: res.headers.get('X-Alt-Text')
					? new TextDecoder().decode(base64ToBytes(res.headers.get('X-Alt-Text')))
					: ''
			};
			thumbhash_data = undefined;
		}
	};
	let media = $derived(get_media(src));

	let fullscreen_open = $state(false);

	const open_fullscreen = () => {
		if (!allow_fullscreen) {
			return;
		}
		fullscreen_open = true;
	};
</script>

{#await media}
	{#if thumbhash_data}
		<img src={thumbhash_data} alt="" class={`${css_classes} ${added_thumbhash_classes}`} />
	{/if}
{:then data}
	{#if type === 'img'}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<img
			in:fade|global={{ duration: 300 }}
			src={img_data.data}
			alt={img_data.alt_text ?? $t('file_dashboard.not_available')}
			class={css_classes}
			onclick={() => open_fullscreen()}
			role={allow_fullscreen ? 'button' : undefined}
			tabindex={allow_fullscreen ? 0 : undefined}
			onkeydown={(e) => {
				if (allow_fullscreen && (e.key === 'Enter' || e.key === ' ')) {
					e.preventDefault();
					open_fullscreen();
				}
			}}
		/>
	{:else if type === 'video'}
		<video
			class={css_classes}
			disablepictureinpicture
			x-webkit-airplay="deny"
			controls
			autoplay
			loop
			{muted}
			preload="metadata"
		>
			<source src="/api/v1/storage/download/{src}" />
		</video>
	{:else}
		<p>{$t('telekom.media_unavailable', { defaultValue: 'Media unavailable' })}</p>
	{/if}
{/await}

{#if fullscreen_open}
	<div
		class="tq-overlay media-fullscreen"
		role="presentation"
		use:modal={{ onclose: () => (fullscreen_open = false) }}
		transition:fade|global={{ duration: 80 }}
		onclick={() => (fullscreen_open = false)}
	>
		<button
			type="button"
			class="tq-icon-button media-fullscreen-close"
			aria-label={$t('words.close')}
			onclick={() => (fullscreen_open = false)}
		>
			<Icon name="close" />
		</button>
		<img
			src={img_data.data}
			alt={img_data.alt_text ?? $t('file_dashboard.not_available')}
			class="media-fullscreen-image"
		/>
	</div>
{/if}

<style>
	.media-fullscreen {
		z-index: 80;
	}
	.media-fullscreen-close {
		position: absolute;
		inset-block-start: 16px;
		inset-inline-end: 16px;
	}
	.media-fullscreen-image {
		max-width: 100%;
		max-height: 100%;
		margin: auto;
		border-radius: 8px;
		object-fit: contain;
	}
</style>
