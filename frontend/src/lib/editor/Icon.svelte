<!--
SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)

SPDX-License-Identifier: MPL-2.0
-->

<script lang="ts">
	// Small outline icon set shared by the authoring screens. Icons inherit the text colour.
	const paths = {
		trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3',
		'check-circle': 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zM8 12.5l2.5 2.5L16 9.5',
		'x-circle': 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.5 9.5l5 5M14.5 9.5l-5 5',
		check: 'M5 12.5l4.5 4.5L19 7.5',
		'chevron-up': 'M6 15l6-6 6 6',
		'chevron-down': 'M6 9l6 6 6-6',
		'arrow-up': 'M12 19V5M6 11l6-6 6 6',
		'arrow-down': 'M12 5v14M6 13l6 6 6-6',
		'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
		'arrow-right': 'M5 12h14M13 6l6 6-6 6',
		plus: 'M12 5v14M5 12h14',
		close: 'M6 6l12 12M18 6L6 18',
		menu: 'M4 6h16M4 12h16M4 18h16',
		sliders:
			'M4 8h10M18 8h2M4 16h2M10 16h10M16 6a2 2 0 100 4 2 2 0 000-4zM8 14a2 2 0 100 4 2 2 0 000-4z',
		image: 'M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zM4 16l4.5-4.5 3 3 3-3L20 17M15.5 8.5h.01',
		clock: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zM12 7v5l3 2',
		warning: 'M12 4l9 16H3L12 4zM12 10v4M12 17h.01',
		globe: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
		lock: 'M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z',
		pencil: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
		share: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z',
		copy: 'M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3'
	};

	interface Props {
		name: keyof typeof paths;
		size?: number;
	}

	let { name, size = 20 }: Props = $props();
</script>

<svg
	aria-hidden="true"
	focusable="false"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
>
	<path d={paths[name]} />
</svg>
