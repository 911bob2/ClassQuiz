// SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
//
// SPDX-License-Identifier: MPL-2.0

const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/**
 * Number of slider steps between two labelled pips. Labels for every value of a wide range
 * overlap on phones, so aim for at most about eight labels.
 */
export const rangePipStep = (min: number, max: number): number => {
	const span = Math.abs(Number(max) - Number(min));
	if (!Number.isFinite(span) || span <= 8) {
		return 1;
	}
	const wanted = span / 8;
	return NICE_STEPS.find((step) => step >= wanted) ?? Math.ceil(wanted);
};
