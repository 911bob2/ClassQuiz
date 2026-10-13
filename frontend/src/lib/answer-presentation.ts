import { get_foreground_color } from './helpers';

/** Missing colors use the current theme; explicit quiz colors remain user data. */
export function answerStyle(color?: string | null): string {
	return color
		? `background-color: ${color}; color: ${get_foreground_color(color)}`
		: 'background-color: var(--tq-surface); color: var(--tq-text)';
}
