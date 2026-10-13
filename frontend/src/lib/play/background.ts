// SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
//
// SPDX-License-Identifier: MPL-2.0

import { get_foreground_color } from '$lib/helpers';

/**
 * Quiz authors may pick a background color for the live game screens.
 * Text that sits directly on that color needs a readable foreground; everything else
 * (panels, tiles, tables) uses theme surfaces and is unaffected.
 */
export const backgroundText = (bg_color?: string | null): string | undefined => {
	if (!bg_color) {
		return undefined;
	}
	if (/^#[0-9a-f]{6}$/i.test(bg_color)) {
		return get_foreground_color(bg_color);
	}
	return 'black';
};
