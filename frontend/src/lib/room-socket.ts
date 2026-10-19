import { onDestroy } from 'svelte';
import { socket } from '$lib/socket';

/** Keep a page/component's socket subscriptions within its own lifetime. */
export function roomEvents() {
	const handlers: Array<[string, (...args: any[]) => void]> = [];
	onDestroy(() => {
		for (const [event, handler] of handlers) socket.off(event, handler);
	});
	return (event: string, handler: (...args: any[]) => void) => {
		handlers.push([event, handler]);
		socket.on(event, handler);
	};
}
