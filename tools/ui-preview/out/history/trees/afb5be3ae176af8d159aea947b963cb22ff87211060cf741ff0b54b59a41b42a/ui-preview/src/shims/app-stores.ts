// Shim for SvelteKit's legacy $app/stores (not used by ClassQuiz today, provided for safety)
import { readable } from 'svelte/store';
import { page as pageState } from './app-state';

export const page = readable(pageState);
export const navigating = readable(null);
export const updated = { subscribe: readable(false).subscribe, check: async () => false };
export const getStores = () => ({ page, navigating, updated });
