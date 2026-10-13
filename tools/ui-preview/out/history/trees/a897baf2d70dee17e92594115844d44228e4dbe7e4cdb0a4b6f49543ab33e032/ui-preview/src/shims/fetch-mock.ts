// In-browser fetch interceptor. Routes look like:
//   'GET /api/v1/quiz/list*'            -> JSON body
//   'POST /api/v1/quiz/create'           -> (req) => ({ status: 200, json: {...} })
//   '/api/v1/users/me'                   -> any method
// '*' matches any run of characters. First matching route wins (scenario routes first).

export interface MockRequest {
  method: string;
  url: URL;
  path: string;
  body: unknown;
  init?: RequestInit;
}
export interface MockResponseSpec {
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
  delay?: number;
}
export type RouteHandler =
  | ((
      req: MockRequest,
    ) => MockResponseSpec | unknown | Promise<MockResponseSpec | unknown>)
  | MockResponseSpec
  | unknown;
export type FetchRoutes = Record<string, RouteHandler>;

export interface FetchLogEntry {
  method: string;
  url: string;
  status: number;
  mocked: boolean;
  route?: string;
}

const isSpec = (v: unknown): v is MockResponseSpec =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  ("json" in (v as object) ||
    "text" in (v as object) ||
    "status" in (v as object)) &&
  Object.keys(v as object).every((k) =>
    ["status", "json", "text", "headers", "delay"].includes(k),
  );

const compile = (pattern: string) => {
  let method: string | null = null;
  let p = pattern.trim();
  const m = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.*)$/i.exec(p);
  if (m) {
    method = m[1].toUpperCase();
    p = m[2];
  }
  const re = new RegExp(
    "^" + p.replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*/g, ".*") + "$",
  );
  return { method, re };
};

export const fetchLog: FetchLogEntry[] = [];
export const pending = new Set<Promise<unknown>>();

export function installFetchMock(routeSets: FetchRoutes[]) {
  const compiled: {
    key: string;
    method: string | null;
    re: RegExp;
    handler: RouteHandler;
  }[] = [];
  for (const set of routeSets)
    for (const [key, handler] of Object.entries(set))
      compiled.push({ key, ...compile(key), handler });

  const realFetch = window.fetch.bind(window);

  const mocked = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input), window.location.href);
    const method = (init?.method || req?.method || "GET").toUpperCase();

    // Let Vite / static assets / external resources through untouched
    const isApi =
      url.origin === window.location.origin && url.pathname.startsWith("/api/");
    if (!isApi && url.origin === window.location.origin) {
      return realFetch(input as RequestInfo, init);
    }

    const pathAndQuery = url.pathname + url.search;
    const route = compiled.find(
      (r) =>
        (!r.method || r.method === method) &&
        (r.re.test(url.href) ||
          r.re.test(pathAndQuery) ||
          r.re.test(url.pathname)),
    );

    let body: unknown = init?.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        /* keep string */
      }
    }

    if (!route) {
      fetchLog.push({ method, url: pathAndQuery, status: 404, mocked: false });
      console.warn(`[uip] unmocked request: ${method} ${pathAndQuery}`);
      return new Response(JSON.stringify({ detail: "uip: not mocked" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    let result: unknown = route.handler;
    if (typeof result === "function") {
      result = await (result as (r: MockRequest) => unknown)({
        method,
        url,
        path: url.pathname,
        body,
        init,
      });
    }
    const spec: MockResponseSpec = isSpec(result) ? result : { json: result };
    if (spec.delay) await new Promise((r) => setTimeout(r, spec.delay));
    const status = spec.status ?? 200;
    fetchLog.push({
      method,
      url: pathAndQuery,
      status,
      mocked: true,
      route: route.key,
    });
    const payload =
      spec.text !== undefined
        ? spec.text
        : spec.json === undefined
          ? ""
          : JSON.stringify(spec.json);
    return new Response(status === 204 ? null : payload, {
      status,
      headers: {
        "Content-Type":
          spec.text !== undefined ? "text/plain" : "application/json",
        ...(spec.headers || {}),
      },
    });
  };

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const p = mocked(input, init);
    pending.add(p);
    p.then(
      () => pending.delete(p),
      () => pending.delete(p),
    );
    return p;
  };
}

/** Resolves once there are no in-flight mocked requests (or after timeout). */
export async function settleFetches(timeout = 3000) {
  const end = Date.now() + timeout;
  while (pending.size && Date.now() < end) {
    await Promise.allSettled([...pending]);
    await new Promise((r) => setTimeout(r, 10));
  }
}
