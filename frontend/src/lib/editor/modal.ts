// SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
//
// SPDX-License-Identifier: MPL-2.0

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalOptions {
	onclose: () => void;
}

/**
 * Dialog behaviour for editor overlays. Put it on the full-screen overlay element: it focuses the
 * first control (or the one marked data-autofocus), keeps Tab inside, closes on Escape and returns
 * focus to the element that opened the dialog.
 */
export function modal(node: HTMLElement, options: ModalOptions) {
	const opener = document.activeElement as HTMLElement | null;
	node.tabIndex = -1;

	const focusable = () =>
		Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
			(el) => el.offsetParent !== null
		);

	const first = node.querySelector<HTMLElement>('[data-autofocus]') ?? focusable()[0];
	if (first) {
		first.focus();
	} else {
		node.focus();
	}

	const on_keydown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.stopPropagation();
			options.onclose();
			return;
		}
		if (e.key !== 'Tab') {
			return;
		}
		const items = focusable();
		if (items.length === 0) {
			e.preventDefault();
			return;
		}
		const start = items[0];
		const end = items[items.length - 1];
		if (e.shiftKey && document.activeElement === start) {
			e.preventDefault();
			end.focus();
		} else if (!e.shiftKey && document.activeElement === end) {
			e.preventDefault();
			start.focus();
		}
	};
	node.addEventListener('keydown', on_keydown);

	return {
		update(new_options: ModalOptions) {
			options = new_options;
		},
		destroy() {
			node.removeEventListener('keydown', on_keydown);
			opener?.focus?.();
		}
	};
}
