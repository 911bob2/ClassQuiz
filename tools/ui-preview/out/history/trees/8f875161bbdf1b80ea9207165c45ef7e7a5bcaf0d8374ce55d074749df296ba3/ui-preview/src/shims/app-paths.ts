// Shim for SvelteKit's $app/paths
export const base = "";
export const assets = "";
export const resolve = (p: string, params?: Record<string, string>) => {
  if (!params) return p;
  return p.replace(/\[(\.\.\.)?(\w+)\]/g, (_, __, k) => params[k] ?? "");
};
export const resolveRoute = resolve;
export const asset = (p: string) => p;
