<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';
	import Spinner from '$lib/Spinner.svelte';
	import { DateTime } from 'luxon';
	import { browser } from '$app/environment';
	import SmallPopover from '$lib/components/popover/smalltop.svelte';
	import { PopoverTypes } from '$lib/components/popover/smalltop';
	import { fade, fly } from 'svelte/transition';
	import Icon from '$lib/editor/Icon.svelte';
	import { modal } from '$lib/editor/modal';

	const { t } = getLocalization();
	interface Props {
		open?: boolean;
		id: any;
	}

	let { open = $bindable(false), id }: Props = $props();
	let popover_open = $state(false);
	const load_shares = async (): Promise<{
		id: string;
		name?: string;
		expire_in?: number;
		quiztivity: { id: string };
		user: { id: string };
	}> => {
		const res = await fetch(`/api/v1/quiztivity/${id}/shares`);
		return await res.json();
	};
	const copyToClipboard = (str) => {
		try {
			navigator.clipboard.writeText(str);
		} catch {
			console.log('Async Clipboard not supported');
			const el = document.createElement('textarea');
			el.value = str;
			el.setAttribute('readonly', '');
			el.style.position = 'absolute';
			el.style.left = '-9999px';
			document.body.appendChild(el);
			const selected =
				document.getSelection().rangeCount > 0
					? document.getSelection().getRangeAt(0)
					: false;
			el.select();
			document.execCommand('copy');
			document.body.removeChild(el);
			if (selected) {
				document.getSelection().removeAllRanges();
				document.getSelection().addRange(<Range>selected);
			}
		} finally {
			popover_open = true;
			setTimeout(() => {
				popover_open = false;
			}, 2000);
		}
	};

	const close = () => {
		open = false;
	};
	const on_parent_click = (e: Event) => {
		if (e.target !== e.currentTarget) {
			return;
		}
		close();
	};
	let never_expires_checked = $state(true);
	let selected_date = $state(undefined);
	const create_share = async (e: Event) => {
		e.preventDefault();
		if (!selected_date && !never_expires_checked) {
			return;
		}
		console.log(selected_date);
		await fetch('/api/v1/quiztivity/shares/', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				name: undefined,
				quiztivity: id,
				expire_in: never_expires_checked
					? undefined
					: Math.floor(Math.abs(new Date() - new Date(selected_date)) / 1000 / 60)
			})
		});
		loaded_shares = load_shares();
	};
	let loaded_shares = $state(load_shares());

	const delete_share = async (id: string) => {
		if (
			!confirm(
				$t('telekom.confirm_delete_share', {
					defaultValue: 'Do you really want to delete this share?'
				})
			)
		) {
			return;
		}
		await fetch(`/api/v1/quiztivity/shares/${id}`, { method: 'DELETE' });
		loaded_shares = load_shares();
	};

	const share_available = (): boolean => {
		try {
			return browser
				? !navigator.canShare({
						title: 'title',
						url: `${window.location.origin}/quiztivity`
					})
				: false;
		} catch {
			return false;
		}
	};
	let add_shares_open = $state(false);
</script>

<SmallPopover bind:open={popover_open} type={PopoverTypes.Copy} />
<div
	class="tq-overlay"
	role="presentation"
	onclick={on_parent_click}
	use:modal={{ onclose: close }}
	transition:fade|global={{ duration: 100 }}
>
	<div
		class="tq-dialog shares-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="shares-title"
		data-ui="shares-dialog"
	>
		<div class="dialog-heading">
			<h2 id="shares-title" class="tq-section-title">
				{$t('telekom.shares', { defaultValue: 'Shares' })}
			</h2>
			<button
				type="button"
				class="tq-icon-button tq-button-ghost"
				aria-label={$t('words.close')}
				onclick={close}
			>
				<Icon name="close" />
			</button>
		</div>

		<div class="share-create">
			<button
				type="button"
				class="tq-button"
				data-ui="share-add"
				aria-expanded={add_shares_open}
				onclick={() => {
					add_shares_open = !add_shares_open;
				}}
			>
				<Icon name="plus" />
				{$t('quiztivity.editor.shares.add_new_share')}
			</button>
			{#if add_shares_open}
				<form
					class="share-form"
					transition:fly={{ duration: 100, y: -10 }}
					onsubmit={create_share}
				>
					<label class="share-date">
						<span class="tq-label"
							>{$t('telekom.expiry_date', { defaultValue: 'Expiry date' })}</span
						>
						<input
							type="datetime-local"
							class="tq-field"
							disabled={never_expires_checked}
							bind:value={selected_date}
						/>
					</label>
					<label class="share-never">
						<input type="checkbox" bind:checked={never_expires_checked} />
						<span>{$t('quiztivity.editor.shares.never_expires')}</span>
					</label>
					<button
						type="submit"
						class="tq-button tq-button-primary"
						disabled={!selected_date && !never_expires_checked}
					>
						{$t('words.submit')}
					</button>
				</form>
			{/if}
		</div>

		{#await loaded_shares}
			<Spinner />
		{:then shares}
			<ul class="share-list" data-ui="share-list">
				{#each shares as share}
					<li class="share-row" in:fade|global={{ duration: 50 }}>
						<p class="share-expiry">
							{#if share.expire_in}
								{$t('quiztivity.editor.shares.expires_on', {
									date: DateTime.now()
										.plus({ minutes: share.expire_in })
										.toJSDate()
										.toLocaleString()
								})}
							{:else}
								{$t('quiztivity.editor.shares.never_expires')}
							{/if}
						</p>
						<div class="share-actions">
							<button
								type="button"
								class="tq-icon-button"
								data-ui="share-native"
								aria-label={$t('telekom.share', { defaultValue: 'Share' })}
								title={$t('telekom.share', { defaultValue: 'Share' })}
								disabled={share_available()}
								onclick={() => {
									navigator.share({
										title: $t('telekom.share_title', {
											defaultValue: 'Quiztivity on Telekom Quiz'
										}),
										text: $t('telekom.share_text', {
											defaultValue: 'Play this Quiztivity now on Telekom Quiz'
										}),
										url: `${window.location.origin}/quiztivity/share/${share.id}?ref=share`
									});
								}}
							>
								<Icon name="share" />
							</button>
							<button
								type="button"
								class="tq-icon-button"
								data-ui="share-copy"
								aria-label={$t('telekom.copy_link', { defaultValue: 'Copy link' })}
								title={$t('telekom.copy_link', { defaultValue: 'Copy link' })}
								onclick={() => {
									copyToClipboard(
										`${window.location.origin}/quiztivity/share/${share.id}?ref=copy`
									);
								}}
							>
								<Icon name="copy" />
							</button>
							<button
								type="button"
								class="tq-button tq-button-danger"
								data-ui="share-delete"
								onclick={() => {
									delete_share(share.id);
								}}
							>
								<Icon name="trash" />
								{$t('words.delete')}
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/await}
	</div>
</div>

<style>
	.shares-dialog {
		max-width: min(720px, calc(100vw - 32px));
	}
	.dialog-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 20px;
	}
	.share-form {
		display: flex;
		align-items: flex-end;
		flex-wrap: wrap;
		gap: 12px 20px;
		margin-top: 12px;
		padding: 16px;
		border: 1px solid var(--tq-border);
		border-radius: 8px;
		background: var(--tq-surface-subtle);
	}
	.share-date {
		min-width: 220px;
	}
	.share-never {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
	}
	.share-list {
		display: flex;
		flex-direction: column;
		margin: 20px 0 0;
		padding: 0;
		list-style: none;
	}
	.share-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 0;
		border-top: 1px solid var(--tq-border);
	}
	.share-expiry {
		flex: 1;
		min-width: 160px;
		margin: 0;
	}
	.share-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
</style>
