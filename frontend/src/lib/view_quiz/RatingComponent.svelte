<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	import { getLocalization } from '$lib/i18n';

	interface Props {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		quiz: any;
	}

	let { quiz = $bindable() }: Props = $props();
	const { t } = getLocalization();

	const complete_action = async (positive: boolean) => {
		const res = await fetch(`/api/v1/community/rate/${quiz.id}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ type: positive ? 'LIKE' : 'DISLIKE' })
		});
		if (res.status === 409) {
			alert("You've already rated this quiz!");
			return;
		} else if (!res.ok) {
			return;
		}
		if (positive) {
			quiz.likes += 1;
		} else {
			quiz.dislikes += 1;
		}
	};
</script>

<section class="tq-toolbar rating" aria-label={$t('words.rating')} data-ui="quiz-rating">
	<button
		type="button"
		class="tq-button"
		data-ui="quiz-like"
		aria-label={$t('words.like')}
		onclick={() => complete_action(true)}
	>
		<!-- heroicons/thumb-up -->
		<svg
			aria-hidden="true"
			width="20"
			height="20"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			viewBox="0 0 24 24"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
			/>
		</svg>
		<span>{quiz.likes}</span>
	</button>
	<button
		type="button"
		class="tq-button"
		data-ui="quiz-dislike"
		aria-label={$t('words.dislike')}
		onclick={() => complete_action(false)}
	>
		<!-- heroicons/thumb-down -->
		<svg
			aria-hidden="true"
			width="20"
			height="20"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			viewBox="0 0 24 24"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"
			/>
		</svg>
		<span>{quiz.dislikes}</span>
	</button>

	<dl class="stats tq-muted">
		<div class="stat">
			<dt>{$t('words.play_plural')}</dt>
			<dd>{quiz.plays}</dd>
		</div>
		<div class="stat">
			<dt>{$t('words.view_plural')}</dt>
			<dd>{quiz.views}</dd>
		</div>
	</dl>
</section>

<style>
	.rating {
		gap: 12px;
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 24px;
		margin: 0;
		margin-inline-start: 12px;
		font-size: 14px;
	}
	.stat {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.stat dt::after {
		content: ':';
	}
	.stat dd {
		margin: 0;
		color: var(--tq-text);
		font-weight: 700;
	}
</style>
