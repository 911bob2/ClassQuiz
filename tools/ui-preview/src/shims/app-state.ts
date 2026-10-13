// Shim for SvelteKit's $app/state. Populated by the renderer before mounting a scenario.
export const page = {
  url: new URL(globalThis.location?.href ?? "http://localhost/"),
  params: {} as Record<string, string>,
  route: { id: null as string | null },
  status: 200,
  error: null as null | { message: string },
  data: {} as Record<string, unknown>,
  form: null as unknown,
  state: {} as Record<string, unknown>,
};

export const navigating = {
  from: null,
  to: null,
  type: null,
  willUnload: false,
  delta: null,
  complete: null,
};
export const updated = { current: false, check: async () => false };

export function configurePage(opts: {
  url?: string;
  params?: Record<string, string>;
  routeId?: string;
  status?: number;
  error?: { message: string } | null;
  data?: Record<string, unknown>;
}) {
  if (opts.url) page.url = new URL(opts.url, globalThis.location.origin);
  if (opts.params) page.params = opts.params;
  if (opts.routeId) page.route = { id: opts.routeId };
  if (opts.status) page.status = opts.status;
  if (opts.error !== undefined) page.error = opts.error;
  if (opts.data) page.data = opts.data;
}
