import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
export const viewports = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};
export async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    if (!/Executable doesn't exist/.test(String(e))) throw e;
    console.error("[uip] Installing Playwright Chromium for the first run…");
    await promisify(execFile)(
      process.execPath,
      [
        path.resolve(import.meta.dirname, "../node_modules/playwright/cli.js"),
        "install",
        "chromium",
      ],
      { windowsHide: true },
    );
    return chromium.launch({ headless: true });
  }
}
export function renderUrl(origin, scenario, opts = {}) {
  const url = new URL(
    opts.revision && opts.revision !== "working"
      ? `/__uip/revisions/${opts.revision}/render.html`
      : (scenario.route ?? "/"),
    origin,
  );
  url.searchParams.set("uip", String(scenario.id));
  url.searchParams.set("theme", opts.theme ?? "light");
  url.searchParams.set("lang", opts.lang ?? "en");
  url.searchParams.set("freeze", "1");
  return url.href;
}
export async function renderPage(browser, origin, scenario, opts = {}) {
  const viewport = viewports[opts.viewport ?? "desktop"];
  if (!viewport) throw new Error("Unknown viewport");
  const context = await browser.newContext({
    viewport,
    colorScheme: opts.theme ?? "light",
    locale: opts.lang ?? "en",
    timezoneId: "Europe/Bratislava",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  // A deterministic capture must not reload midway through a shot when Vite
  // discovers a dependency in another live gallery frame. Keep CSS injection.
  const frozenClient = await fs.readFile(
    path.join(import.meta.dirname, "frozen-client.mjs"),
    "utf8",
  );
  await page.route(/\/@vite\/client(?:\?|$)/, (route) =>
    route.fulfill({ contentType: "text/javascript", body: frozenClient }),
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (dialog) => dialog.dismiss());
  try {
    await page.goto(renderUrl(origin, scenario, opts), {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForFunction(
      () => window.__UIP__?.ready,
      {},
      { timeout: 90000 },
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((i) =>
          i.complete
            ? null
            : new Promise((r) => {
                i.onload = r;
                i.onerror = r;
                setTimeout(r, 3000);
              }),
        ),
      );
    });
    // Finish entrance animations before pausing the JS clock. Live gallery animations are unaffected.
    await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        try {
          a.finish();
        } catch {
          a.cancel();
        }
      }
    });
    await page.clock.install({ time: new Date("2026-10-12T10:00:00Z") });
    await page.clock.pauseAt(new Date("2026-10-12T10:00:00Z"));
    const state = await page.evaluate(() => ({
      ...window.__UIP__,
      text: document.querySelector("#app")?.textContent?.trim().slice(0, 1000),
      nodes: document.querySelectorAll("#app *").length,
    }));
    const media = await page.locator("#app canvas, #app img, #app svg").count();
    const failure =
      state.fatal ||
      state.errors?.map((e) => e.message).join("; ") ||
      errors.join("; ") ||
      (!state.text && !media && !scenario.allowBlank ? "Blank screen" : "");
    return { page, context, state, errors, failure };
  } catch (e) {
    await context.close();
    throw e;
  }
}
export async function captureBaseline({
  root,
  origin,
  scenario,
  options = {},
  name = "Before change",
}) {
  const browser = await launchBrowser();
  try {
    const run = await renderPage(browser, origin, scenario, options);
    if (run.failure) throw new Error(run.failure);
    const dir = path.join(root, "out", "baselines");
    await fs.mkdir(dir, { recursive: true });
    const key = `${scenario.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await run.page.screenshot({
      path: path.join(dir, key + ".png"),
      animations: "disabled",
    });
    const meta = {
      key,
      revision: options.revision ?? "working",
      name: String(name).slice(0, 120),
      id: scenario.id,
      slug: scenario.slug,
      createdAt: new Date().toISOString(),
      viewport: options.viewport ?? "desktop",
      theme: options.theme ?? "light",
      lang: options.lang ?? "en",
      width: viewports[options.viewport ?? "desktop"].width,
      height: viewports[options.viewport ?? "desktop"].height,
      image: `/__uip/baselines/${key}.png`,
    };
    await fs.writeFile(
      path.join(dir, key + ".json"),
      JSON.stringify(meta, null, 2),
    );
    await run.context.close();
    return meta;
  } finally {
    await browser.close();
  }
}
