// Shim for SvelteKit's $app/navigation. Navigation never leaves the preview frame.
const log = (what: string, ...a: unknown[]) => {
	console.info(`[uip] ${what}`, ...a);
	(globalThis as any).__UIP__?.navigations?.push({ what, args: a.map(String) });
};

export const goto = async (url: string | URL, opts?: unknown) => { log('goto', url, opts); window.parent.postMessage({type:'uip-navigation',url:String(url)},location.origin); };
export const invalidate = async (_: unknown) => {};
export const invalidateAll = async () => {};
export const preloadData = async (_: unknown) => ({ type: 'loaded', status: 200, data: {} });
export const preloadCode = async (..._: unknown[]) => {};
export const beforeNavigate = (_: unknown) => {};
export const afterNavigate = (_: unknown) => {};
export const onNavigate = (_: unknown) => {};
export const disableScrollHandling = () => {};
export const pushState = (url: string, _s: unknown) => log('pushState', url);
export const replaceState = (url: string, _s: unknown) => log('replaceState', url);
