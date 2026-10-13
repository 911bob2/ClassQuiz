import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { launchBrowser } from "../lib/browser.mjs";
const origin = `http://127.0.0.1:${process.env.UIP_PORT ?? 9999}`;
const browser = await launchBrowser(),
  page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const out = path.resolve(import.meta.dirname, "../out/verification");
await fs.mkdir(out, { recursive: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function ready(selector = "#live-frame") {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.waitForFunction(
        (sel) => document.querySelector(sel)?.contentWindow?.__UIP__?.ready,
        selector,
        { timeout: 90000 },
      );
      const frame = await (
        await page.locator(selector).elementHandle()
      ).contentFrame();
      const state = await frame.evaluate(() => window.__UIP__);
      assert.equal(state.fatal, undefined);
      assert.deepEqual(state.errors, []);
      return frame;
    } catch (e) {
      if (attempt === 2 || !String(e).includes("detached")) throw e;
    }
  }
}
try {
  await page.goto(
    origin + "/play.question.abcd?before=main&after=working&mode=revisions",
  );
  await page.locator("#live-frame").waitFor();
  let after = await ready(),
    before = await ready("#before-frame");
  assert.match(page.url(), /\/5003\?/);
  assert.match(page.url(), /before=[a-f0-9]{64}/);
  // Both revisions have their own real socket state and remain clickable.
  await before.locator("#app button").first().click();
  assert.ok(
    await before.evaluate(() =>
      window.__UIP__.emits.some((e) => e.event === "submit_answer"),
    ),
  );
  assert.equal(
    await after.evaluate(() =>
      window.__UIP__.emits.some((e) => e.event === "submit_answer"),
    ),
    false,
  );
  await after.locator("#app button").first().click();
  assert.ok(
    await after.evaluate(() =>
      window.__UIP__.emits.some((e) => e.event === "submit_answer"),
    ),
  );
  await page.getByRole("button", { name: "↻ Replay", exact: true }).click();
  after = await ready();
  await page.getByRole("button", { name: "Mobile", exact: true }).click();
  after = await ready();
  assert.equal(await after.evaluate(() => innerWidth), 390);
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  after = await ready();
  assert.ok(
    await after.locator("html").evaluate((el) => el.classList.contains("dark")),
  );
  await page.getByLabel("Language", { exact: true }).selectOption("de");
  after = await ready();
  assert.equal(await after.evaluate(() => window.__UIP__.lang), "de");
  await page.reload();
  after = await ready();
  assert.equal(await after.evaluate(() => innerWidth), 390);
  assert.equal(await after.evaluate(() => window.__UIP__.theme), "dark");
  await page.getByRole("button", { name: "Next screen", exact: true }).click();
  after = await ready();
  assert.equal(await after.evaluate(() => window.__UIP__.scenario.id), 5004);
  assert.ok(await page.locator("#before-frame").count());
  await page
    .getByRole("button", { name: "Previous screen", exact: true })
    .click();
  after = await ready();
  assert.equal(await after.evaluate(() => window.__UIP__.scenario.id), 5003);
  await page.getByRole("button", { name: "▶ Slideshow", exact: true }).click();
  await page.waitForURL(/\/5004\?/, { timeout: 12000 });
  await page.getByRole("button", { name: "Ⅱ Pause", exact: true }).click();
  await page.goto(origin + "/5003?before=main&after=working&mode=revisions");
  after = await ready();
  before = await ready("#before-frame");
  const inspection = await after.evaluate(() =>
    window.__UIP_INSPECT__({ interactive: true }),
  );
  const buttons = inspection.elements.filter((e) => e.tag === "button");
  assert.equal(buttons.length, 4);
  for (const e of buttons) {
    const [, file, line] = /^(.*):(\d+):(\d+)$/.exec(e.src);
    const source = await fs.readFile(
      path.resolve(import.meta.dirname, "../../../", file),
      "utf8",
    );
    assert.ok(source.split("\n")[Number(line) - 1].includes("<button"));
  }
  assert.equal(
    await after.evaluate(
      () => window.__UIP_INSPECT__({ selector: "#app button", depth: 0 }).count,
    ),
    4,
  );
  await page.locator(".diagnostics summary").click();
  await page.getByLabel("Inspect revision").selectOption("before");
  await page.locator("#sources .source-link").first().click();
  await page.locator("#source-dialog").waitFor();
  assert.ok(
    (await page.locator("#source-content").textContent()).includes("<script"),
  );
  await page.getByRole("button", { name: "Close source" }).click();
  await page.getByLabel("Baseline name").fill("Verification checkpoint");
  await page
    .getByRole("button", { name: "＋ Capture before", exact: true })
    .click();
  await page
    .locator("#notice")
    .filter({ hasText: "Before saved." })
    .waitFor({ timeout: 90000 });
  const baseline = await page.getByLabel("Saved baseline").inputValue();
  assert.ok(baseline);
  await page.getByRole("button", { name: "Wipe", exact: true }).click();
  assert.equal(await page.locator(".wipe-image").count(), 1);
  await page.getByLabel("Before after divider").fill("25");
  assert.match(await page.locator(".wipe-image").getAttribute("style"), /75%/);
  await page.reload();
  await ready();
  assert.equal(await page.getByLabel("Saved baseline").inputValue(), baseline);
  await page.getByRole("button", { name: "▦ Gallery", exact: true }).click();
  await page.getByLabel("Search screens").fill("play.question.abcd");
  await page
    .getByRole("button", { name: "Open #5003 Player · ABCD", exact: true })
    .waitFor();
  assert.equal(await page.locator(".card").count(), 1);
  await page
    .getByRole("button", { name: "Open #5003 Player · ABCD", exact: true })
    .click();
  await ready();
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(out, "studio.png"), fullPage: true });
  await fs.writeFile(
    path.join(out, "studio-test.json"),
    JSON.stringify(
      {
        passed: true,
        checks: [
          "slug and ID deep links",
          "pinned refs",
          "independent before/after interactions",
          "replay",
          "mobile viewport",
          "dark theme",
          "language",
          "reload persistence",
          "previous/next",
          "slideshow",
          "source locations",
          "depth filter",
          "historical source dialog",
          "capture",
          "wipe",
          "baseline persistence",
          "gallery search",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Studio integration checks passed.");
} finally {
  await browser.close();
}
