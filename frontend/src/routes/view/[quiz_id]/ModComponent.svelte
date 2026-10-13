<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	interface Props {
		autoReturn?: boolean;
		quiz_id: string;
	}

	let { autoReturn = false, quiz_id }: Props = $props();
	let mod_rating: number | null | undefined = $state();

	const ratings: { value: number | null; label: string }[] = [
		{ value: null, label: 'Not Checked' },
		{ value: 0, label: 'Ok' },
		{ value: 1, label: 'Attention' },
		{ value: 2, label: 'NSFW' },
		{ value: 3, label: 'Plausibility Checked' },
		{ value: 4, label: 'Fact Checked' },
		{ value: 5, label: 'Exceptional' }
	];

	const submit = async () => {
		const res = await fetch(`/api/v1/moderation/rating/set/${quiz_id}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ rating: mod_rating })
		});
		if (res.ok && autoReturn) {
			window.history.back();
		}
		if (!res.ok) {
			alert('Setting rating failed');
		}
	};
</script>

<section class="tq-panel tq-panel-body tq-stack stack-4" data-ui="moderation-rating">
	<h2 class="tq-section-title">Moderation</h2>
	<div class="tq-toolbar" role="group" aria-label="Moderation rating">
		{#each ratings as rating}
			<button
				type="button"
				class="tq-button rating-option"
				aria-pressed={mod_rating === rating.value}
				onclick={() => (mod_rating = rating.value)}
			>
				{rating.label}
			</button>
		{/each}
	</div>
	<div>
		<button
			type="button"
			class="tq-button tq-button-primary"
			onclick={submit}
			disabled={mod_rating === undefined}
		>
			Submit
		</button>
	</div>
</section>

<style>
	.stack-4 {
		gap: 16px;
	}
	.rating-option[aria-pressed='true'] {
		border-color: var(--tq-accent);
		background: var(--tq-brand-soft);
		color: var(--tq-accent);
	}
</style>
