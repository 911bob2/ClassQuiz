// Interactions against real Svelte components through the repository preview.
import assert from "node:assert/strict";
import { launchBrowser, renderPage } from "../../ui-preview/lib/browser.mjs";

const origin = process.env.UIP_ORIGIN ?? "http://127.0.0.1:9998";
const browser = await launchBrowser();
const checks = [];
try {
  let run = await renderPage(
    browser,
    origin,
    { id: 3003 },
    { viewport: "mobile" },
  );
  assert.equal(run.failure, "");
  await run.page.clock.resume();
  await run.page.locator("[data-ui=large-audience-toggle]").check();
  await run.page.locator("[data-ui=start-game-submit]").click();
  const requests = await run.page.evaluate(() =>
    window.__UIP__.fetchLog.map((r) => r.url),
  );
  assert(requests.some((url) => url.includes("large_audience=true")));
  checks.push(
    "Mobile toggle and reachable Start button submit the optimization setting",
  );
  await run.context.close();

  run = await renderPage(
    browser,
    origin,
    { id: 6004 },
    { viewport: "desktop" },
  );
  assert.equal(run.failure, "");
  await run.page.clock.resume();
  const rows = run.page.locator("[data-ui=host-roster] li");
  assert.equal(await rows.count(), 50);
  assert.match(await rows.first().innerText(), /Guest 1\b/);
  await run.page.getByRole("button", { name: "Next", exact: true }).click();
  assert.match(await rows.first().innerText(), /Guest 51\b/);
  await run.page
    .getByRole("searchbox", { name: "Search players" })
    .fill("Guest 2000");
  assert.equal(await rows.count(), 1);
  await rows.getByRole("button", { name: "Kick Guest 2000" }).click();
  const kick = await run.page.evaluate(() =>
    window.__UIP__.emits.findLast((e) => e.event === "kick_player"),
  );
  assert.equal(kick.args[0].username, "Guest 2000");
  checks.push(
    "2,000-player lobby renders only 50 rows; paging, search and kick work",
  );
  await run.context.close();

  for (const id of [5022, 5031]) {
    run = await renderPage(browser, origin, { id }, { viewport: "mobile" });
    assert.equal(run.failure, "");
    assert.match(await run.page.locator("#app").innerText(), /4200/);
    assert.match(await run.page.locator("#app").innerText(), /128/);
    if (id === 5031)
      assert.equal(await run.page.locator("tbody tr").count(), 10);
    await run.context.close();
  }
  checks.push(
    "Personal score/rank survives outside top 10; mobile final displays only 10 rows",
  );
  console.log(JSON.stringify({ passed: checks }, null, 2));
} finally {
  await browser.close();
}
