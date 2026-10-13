import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { launchBrowser } from "../lib/browser.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  origin = `http://127.0.0.1:${process.env.UIP_PORT ?? 9999}`;
const file = path.resolve(root, "../../frontend/src/lib/play/question.svelte"),
  original = await fs.readFile(file);
const modified = Buffer.concat([
  original,
  Buffer.from(
    "\n<style>button {border-radius:32px; border:6px solid white; box-shadow:inset 0 0 0 8px #ffffff22; transform:scale(.94);}</style>\n",
  ),
]);
const api = async (route, body) => {
  const r = await fetch(
    origin + "/__uip/" + route,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  return d;
};
const browser = await launchBrowser(),
  page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
const out = path.join(root, "out/verification");
await fs.mkdir(out, { recursive: true });
let edited = false;
try {
  const saved = await api("history/resolve?ref=main");
  await page.goto(
    origin + `/5003?before=${saved.id}&after=working&mode=revisions`,
  );
  await page.locator("#before-frame").waitFor();
  const before = await (
      await page.locator("#before-frame").elementHandle()
    ).contentFrame(),
    after = await (
      await page.locator("#live-frame").elementHandle()
    ).contentFrame();
  for (const frame of [before, after])
    await frame.waitForFunction(
      () => window.__UIP__?.ready,
      {},
      { timeout: 90000 },
    );
  const originalRadius = await before
    .locator("#app button")
    .first()
    .evaluate((el) => getComputedStyle(el).borderRadius);
  await fs.writeFile(file, modified);
  edited = true;
  await after.waitForFunction(
    () =>
      getComputedStyle(document.querySelector("#app button")).borderRadius ===
      "32px",
    {},
    { timeout: 15000 },
  );
  assert.equal(
    await before
      .locator("#app button")
      .first()
      .evaluate((el) => getComputedStyle(el).borderRadius),
    originalRadius,
  );
  const history = await api("history");
  if (!history.branches["demo/rounded-answers"])
    await api("history/branch", {
      name: "demo/rounded-answers",
      from: saved.id,
    });
  const demo = await api("history/commit", {
    branch: "demo/rounded-answers",
    message:
      "DEMO: rounded answers (working files restored after verification)",
  });
  const diff = await api(
    "history/diff?" + new URLSearchParams({ from: saved.id, to: demo.id }),
  );
  assert.ok(
    diff.changes.some(
      (c) => c.file === "frontend/src/lib/play/question.svelte",
    ),
  );
  await page.screenshot({
    path: path.join(out, "hmr-isolation.png"),
    fullPage: true,
  });
  await fs.writeFile(file, original);
  edited = false;
  await after.waitForFunction(
    () =>
      getComputedStyle(document.querySelector("#app button")).borderRadius !==
      "32px",
    {},
    { timeout: 15000 },
  );
  const url =
    origin + `/5003?before=${saved.id}&after=${demo.id}&mode=revisions`;
  await page.goto(url);
  await page.locator("#live-frame").waitFor();
  const frozenAfter = await (
    await page.locator("#live-frame").elementHandle()
  ).contentFrame();
  await frozenAfter.waitForFunction(
    () => window.__UIP__?.ready,
    {},
    { timeout: 90000 },
  );
  assert.equal(
    await frozenAfter
      .locator("#app button")
      .first()
      .evaluate((el) => getComputedStyle(el).borderRadius),
    "32px",
  );
  await page.screenshot({
    path: path.join(out, "version-comparison.png"),
    fullPage: true,
  });
  await fs.writeFile(
    path.join(root, "out/demo.json"),
    JSON.stringify(
      { before: saved.id, after: demo.id, url, branch: "demo/rounded-answers" },
      null,
      2,
    ),
  );
  assert.deepEqual(await fs.readFile(file), original);
  console.log(
    JSON.stringify({
      passed: true,
      hmr: true,
      immutableBefore: true,
      immutableAfter: true,
      restored: true,
      url,
    }),
  );
} finally {
  if (edited) {
    const current = await fs.readFile(file);
    if (current.equals(modified)) await fs.writeFile(file, original);
    else
      console.error(
        "The frontend file changed concurrently. Preserving that newer content instead of overwriting it.",
      );
  }
  await browser.close();
}
