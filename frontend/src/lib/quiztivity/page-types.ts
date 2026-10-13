// SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
//
// SPDX-License-Identifier: MPL-2.0

import { QuizTivityTypes } from './types';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Display name of an activity page type. */
export function page_type_name(t: Translate, type: QuizTivityTypes | string): string {
	switch (type) {
		case QuizTivityTypes.MEMORY:
			return t('telekom.activity_memory', { defaultValue: 'Memory' });
		case QuizTivityTypes.MARKDOWN:
			return 'Markdown';
		case QuizTivityTypes.ABCD:
			return t('words.multiple_choice');
		case QuizTivityTypes.PDF:
			return 'PDF';
		case QuizTivityTypes.SLIDE:
			return t('words.slide');
		default:
			return String(type);
	}
}

/** One-line explanation of an activity page type, shown when adding a page. */
export function page_type_description(t: Translate, type: QuizTivityTypes | string): string {
	switch (type) {
		case QuizTivityTypes.MEMORY:
			return t('telekom.activity_memory_description', {
				defaultValue: 'Matching pairs game'
			});
		case QuizTivityTypes.MARKDOWN:
			return t('telekom.activity_markdown_description', {
				defaultValue: 'Formatted text written in Markdown'
			});
		case QuizTivityTypes.ABCD:
			return t('telekom.activity_abcd_description', {
				defaultValue: 'One question with up to four answers'
			});
		default:
			return '';
	}
}
