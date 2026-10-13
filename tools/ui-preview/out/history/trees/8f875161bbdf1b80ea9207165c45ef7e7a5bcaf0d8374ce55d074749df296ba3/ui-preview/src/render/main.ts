// Renderer entry: renders exactly one scenario.
// URL form: <route>?uip=<id|slug>&theme=light|dark&lang=en&inspect=1
// (the dev server rewrites any HTML request carrying `uip=` to render.html)

// ---- capture timers early so scenarios can be frozen deterministically ----
const liveIntervals = new Set<number>();
const liveTimeouts = new Set<number>();
const _si = window.setInterval.bind(window);
const _ci = window.clearInterval.bind(window);
const _st = window.setTimeout.bind(window);
const _ct = window.clearTimeout.bind(window);
(window as any).setInterval = (
  fn: TimerHandler,
  ms?: number,
  ...a: unknown[]
) => {
  const id = _si(fn, ms, ...a);
  liveIntervals.add(id);
  return id;
};
(window as any).clearInterval = (id: number) => {
  liveIntervals.delete(id);
  _ci(id);
};
(window as any).setTimeout = (
  fn: TimerHandler,
  ms?: number,
  ...a: unknown[]
) => {
  const id = _st(
    (...args: unknown[]) => {
      liveTimeouts.delete(id);
      if (typeof fn === "function") (fn as (...x: unknown[]) => void)(...args);
    },
    ms,
    ...a,
  );
  liveTimeouts.add(id);
  return id;
};
(window as any).clearTimeout = (id: number) => {
  liveTimeouts.delete(id);
  _ct(id);
};
const freezeTimers = () => {
  liveIntervals.forEach((id) => _ci(id));
  liveIntervals.clear();
  // Scenario setup has settled; cancel remaining scheduled callbacks for deterministic captures.
  liveTimeouts.forEach((id) => _ct(id));
  liveTimeouts.clear();
};

// ---- error capture ----
const errors: { type: string; message: string; stack?: string }[] = [];
const warnings: string[] = [];
window.addEventListener("error", (e) =>
  errors.push({
    type: "error",
    message: String(e.message),
    stack: e.error?.stack,
  }),
);
window.addEventListener("unhandledrejection", (e) =>
  errors.push({
    type: "unhandledrejection",
    message: String(e.reason?.message ?? e.reason),
    stack: e.reason?.stack,
  }),
);
const _cerr = console.error.bind(console);
console.error = (...a: unknown[]) => {
  errors.push({
    type: "console.error",
    message: a
      .map((x) =>
        x instanceof Error
          ? x.message
          : typeof x === "string"
            ? x
            : JSON.stringify(x),
      )
      .join(" ")
      .slice(0, 2000),
  });
  _cerr(...a);
};
const _cwarn = console.warn.bind(console);
console.warn = (...a: unknown[]) => {
  warnings.push(a.map(String).join(" ").slice(0, 500));
  _cwarn(...a);
};

const navigations: { what: string; args: string[] }[] = [];
(window as any).__UIP__ = { ready: false, errors, warnings, navigations };
const navigate = (what: string, value?: unknown) => {
  const url = String(value ?? location.href);
  navigations.push({ what, args: [url] });
  if (what !== "reload")
    window.parent.postMessage({ type: "uip-navigation", url }, location.origin);
};
(window as any).__UIP_LOCATION__ = new Proxy(
  {},
  {
    get: (_, key) =>
      ["assign", "replace", "reload"].includes(String(key))
        ? (value: unknown) => navigate(String(key), value)
        : (location as any)[key],
    set: (_, key, value) => {
      navigate(String(key), value);
      return true;
    },
  },
);

// Never navigate away from the preview frame
window.addEventListener("click", (e) => {
  const a = (e.target as Element)?.closest?.(
    "a[href]",
  ) as HTMLAnchorElement | null;
  if (!a || e.defaultPrevented) return;
  if (a.target === "_blank") {
    e.preventDefault();
    navigations.push({ what: "open-blank", args: [a.href] });
    return;
  }
  e.preventDefault();
  navigations.push({ what: "link", args: [a.getAttribute("href") || ""] });
  window.parent.postMessage(
    { type: "uip-navigation", url: a.href },
    location.origin,
  );
});
window.addEventListener("submit", (e) => {
  if (!e.defaultPrevented) {
    e.preventDefault();
    navigations.push({
      what: "form-submit",
      args: [(e.target as HTMLFormElement).action],
    });
  }
});
window.open = ((url?: string) => {
  navigations.push({ what: "window.open", args: [String(url)] });
  return null;
}) as typeof window.open;
// Kill confirm/alert/prompt dialogs (they would block screenshots)
window.alert = (m?: unknown) =>
  navigations.push({ what: "alert", args: [String(m)] });
window.confirm = (m?: string) => (
  navigations.push({ what: "confirm", args: [String(m)] }),
  false
);
window.prompt = () => null;

import { mount, tick } from "svelte";
import { findScenario, scenarios } from "../scenarios";
import { installFetchMock, settleFetches, fetchLog } from "../shims/fetch-mock";
import { socket } from "../shims/socket";
import { configurePage } from "../shims/app-state";
import { apiDefaults } from "../mocks/api-defaults";
import { inspect, collectSources, locate } from "./inspect";
import { signedIn } from "$lib/stores";
import { navbarVisible } from "$lib/stores.svelte";
import Frame from "./Frame.svelte";
import type { ScenarioContext } from "../scenarios/types";
import { installOverlay } from "./overlay";

const params = new URLSearchParams(location.search);
const key = params.get("uip") ?? params.get("id") ?? "";
const theme = params.get("theme") === "dark" ? "dark" : "light";
const lang = params.get("lang") ?? "en";

const showError = (title: string, detail: string) => {
  const el = document.createElement("div");
  el.setAttribute("data-uip-overlay", "");
  el.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:#1b1020;color:#ffd7d7;font:13px/1.5 ui-monospace,Consolas,monospace;padding:24px;overflow:auto;white-space:pre-wrap";
  el.textContent = `UI PREVIEW: ${title}\n\n${detail}`;
  document.body.appendChild(el);
  window.parent?.postMessage({ type: "uip-ready", errors: 1 }, location.origin);
};

const wait = (ms = 0) => new Promise<void>((r) => _st(r, ms));

async function waitForDomStable(maxMs = 1500, quietMs = 120) {
  const start = Date.now();
  let last = Date.now();
  const mo = new MutationObserver(() => (last = Date.now()));
  mo.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  while (Date.now() - start < maxMs && Date.now() - last < quietMs)
    await wait(30);
  mo.disconnect();
}

async function main() {
  const sc = findScenario(key);
  if (!sc) {
    showError(
      `unknown scenario "${key}"`,
      "Known: " + scenarios.map((s) => `${s.id} ${s.slug}`).join("\n"),
    );
    (window as any).__UIP__.ready = true;
    (window as any).__UIP__.fatal = "unknown scenario";
    return;
  }
  document.title = `#${sc.id} ${sc.title} – UI Preview`;

  // ---- fresh, deterministic browser state ----
  for (const key of ["edit_game", "joined_game", "custom_field"])
    localStorage.removeItem(key);
  document.cookie =
    "joined_game=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  localStorage.setItem("theme", theme);
  localStorage.setItem("language", lang);
  // suppress first-visit popovers so they don't cover screens
  localStorage.setItem("commandpalette_notice_seen", "true");
  document.documentElement.classList.toggle("dark", theme === "dark");
  sc.setup?.();

  configurePage({
    url: new URL(sc.route ?? "/", location.origin).href,
    params: sc.params ?? {},
    status: sc.id === 1090 ? 404 : 200,
    routeId: sc.route?.split("?")[0],
  });
  signedIn.set(sc.signedIn ?? true);
  navbarVisible.visible = true;
  installFetchMock([sc.fetch ?? {}, apiDefaults]);
  socket.onEmit = sc.onEmit ?? null;

  let Screen;
  let layouts = [];
  try {
    const loader = sc.page ?? sc.component;
    if (!loader) throw new Error("scenario has neither page nor component");
    Screen = (await loader()).default;
    layouts = await Promise.all(
      (sc.layouts ?? []).map(async (l) => (await l()).default),
    );
  } catch (e: any) {
    showError(`failed to load component for #${sc.id}`, String(e?.stack ?? e));
    (window as any).__UIP__.fatal = String(e?.message ?? e);
    (window as any).__UIP__.ready = true;
    return;
  }

  const screenProps =
    typeof sc.props === "function" ? sc.props() : (sc.props ?? {});
  const target = document.getElementById("app")!;
  if (sc.background && sc.layout === "none")
    document.body.style.background = sc.background;

  try {
    mount(Frame, {
      target,
      props: {
        Screen,
        screenProps,
        useRootLayout: sc.layout !== "none",
        layouts,
        lang,
      },
    });
  } catch (e: any) {
    showError(`render error in #${sc.id}`, String(e?.stack ?? e));
    (window as any).__UIP__.fatal = String(e?.message ?? e);
  }

  await tick();
  await settleFetches();
  await tick();
  await waitForDomStable();

  const ctx: ScenarioContext = {
    socket,
    root: target,
    tick: async (ms = 0) => {
      await tick();
      await wait(ms);
      await tick();
    },
    $: (sel) => document.querySelector(sel),
    click: async (selOrText) => {
      let el: HTMLElement | null = null;
      const until = Date.now() + 5000;
      do {
        try {
          el = document.querySelector(selOrText);
        } catch {
          /* not a selector */
        }
        if (!el) {
          const all = Array.from(
            document.querySelectorAll<HTMLElement>(
              "button, a, [role=button], label, input[type=submit], div, span",
            ),
          );
          el =
            all.find(
              (e) =>
                e.innerText?.trim().toLowerCase() === selOrText.toLowerCase(),
            ) ??
            all.find((e) =>
              e.innerText
                ?.trim()
                .toLowerCase()
                .includes(selOrText.toLowerCase()),
            ) ??
            null;
        }
        if (!el) await wait(50);
      } while (!el && Date.now() < until);
      if (!el) {
        throw new Error(`Scenario click target not found: ${selOrText}`);
      }
      el.click();
      await tick();
      await settleFetches();
      await tick();
      return true;
    },
    type: async (sel, value) => {
      const el = document.querySelector<HTMLInputElement>(sel);
      if (!el) return false;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      await tick();
      return true;
    },
  };

  if (sc.run) {
    try {
      await sc.run(ctx);
    } catch (e: any) {
      errors.push({
        type: "scenario.run",
        message: String(e?.message ?? e),
        stack: e?.stack,
      });
    }
    await tick();
    await settleFetches();
    await tick();
  }

  await waitForDomStable();
  const freeze = params.get("freeze")
    ? params.get("freeze") !== "0"
    : !!sc.freezeTimers;
  if (freeze) freezeTimers();
  try {
    await (document as any).fonts?.ready;
  } catch {
    /* ignore */
  }
  await wait(50);

  Object.assign((window as any).__UIP__, {
    ready: true,
    scenario: {
      id: sc.id,
      slug: sc.slug,
      title: sc.title,
      group: sc.group,
      route: sc.route,
      sources: sc.sources ?? [],
      limitations: sc.limitations,
    },
    theme,
    lang,
    props: screenProps,
    fetchLog,
    get unmocked() {
      return fetchLog.filter(
        (f) => !f.mocked && f.route !== "external-blocked",
      );
    },
    emits: socket.emits,
    fired: socket.fired.map((f) => f.event),
    sources: collectSources(),
  });
  Object.defineProperty((window as any).__UIP__, "unmocked", {
    configurable: true,
    get: () => fetchLog.filter((f) => !f.mocked),
  });
  document.documentElement.setAttribute("data-uip-ready", "1");
  window.parent?.postMessage(
    { type: "uip-ready", id: sc.id, errors: errors.length },
    "*",
  );

  if (params.get("inspect") === "1") installOverlay(sc.id);
}

(window as any).__UIP_INSPECT__ = inspect;
(window as any).__UIP_LOCATE__ = (x: number, y: number) => {
  const el = document.elementFromPoint(x, y);
  return locate(el);
};

main().catch((e) => {
  errors.push({ type: "fatal", message: String(e?.message ?? e) });
  Object.assign((window as any).__UIP__, {
    ready: true,
    fatal: String(e?.message ?? e),
  });
  showError("Renderer failed", String(e?.stack ?? e));
});
