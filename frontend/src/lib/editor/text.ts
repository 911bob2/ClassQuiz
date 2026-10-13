// SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
//
// SPDX-License-Identifier: MPL-2.0

/** Converts the rich-text HTML stored for titles and questions into plain text for labels. */
export function plain_text(html: string | null | undefined): string {
	if (!html) {
		return '';
	}
	if (typeof DOMParser === 'undefined') {
		return html.replace(/<[^>]*>/g, '').trim();
	}
	const doc = new DOMParser().parseFromString(html, 'text/html');
	return (doc.body.textContent ?? '').trim();
}

/** Translation key of the display name of each question type. */
export const question_type_keys: Record<string, string> = {
	ABCD: 'words.multiple_choice',
	CHECK: 'words.check_choice',
	VOTING: 'words.voting',
	ORDER: 'words.order',
	TEXT: 'words.text',
	RANGE: 'words.range',
	SLIDE: 'words.slide'
};

/** Translation key of the one-line explanation of each question type. */
export const question_type_description_keys: Record<string, string> = {
	ABCD: 'editor.abcd_description',
	CHECK: 'editor.check_choice_description',
	VOTING: 'editor.voting_description',
	ORDER: 'editor.order_description',
	TEXT: 'editor.text_description',
	RANGE: 'editor.range_description'
};
