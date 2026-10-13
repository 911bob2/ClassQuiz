#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {
  launchBrowser,
  renderPage,
  captureBaseline,
  viewports,
} from "../lib/browser.mjs";
import { PORT, UIP_ROOT } from "../uip.config.mjs";
import { ensureServer } from "../lib/server-control.mjs";
const args = process.argv.slice(2),
  command = args.shift() ?? "help",
  options = {},
  keys = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const k = args[i].slice(2);
    options[k] =
      args[i + 1] &&
      !args[i + 1].startsWith("--") &&
      !["json", "full-page", "interactive", "annotate"].includes(k)
        ? args[++i]
        : true;
  } else keys.push(args[i].replace(/^#/, ""));
}
const origin = `http://127.0.0.1:${PORT}`;
let browser;
const print = (data) =>
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
try {
  if (command === "help") {
    print({
      usage: "npm run uip -- <command>",
      commands: [
        "list [--group player]",
        "snap <id|slug|all> [--viewport mobile] [--theme dark] [--lang de] [--full-page] [--out dir]",
        "inspect <id> [--selector button] [--text Submit] [--interactive] [--styles all|key|none] [--depth N] [--annotate]",
        "sources <id>",
        "check [ids...] [--viewport mobile] [--theme dark]",
        'baseline <id> [--name "Before button change"]',
        'commit --branch main --message "Before answer redesign" [--git-ref HEAD]',
        "branch <name> [--from main]",
        "log [--branch main]",
        "compare <id> --from main --to working [--viewport mobile]",
        "All render commands accept --revision <branch|commit|working>",
      ],
      gallery: `http://localhost:${PORT}`,
    });
    process.exit(0);
  }
  if (
    ![
      "list",
      "snap",
      "inspect",
      "sources",
      "check",
      "baseline",
      "commit",
      "branch",
      "log",
      "compare",
    ].includes(command)
  )
    throw new Error("Unknown command: " + command);
  if (options.viewport && !viewports[options.viewport])
    throw new Error("Viewport must be desktop, tablet, or mobile");
  if (options.theme && !["light", "dark"].includes(options.theme))
    throw new Error("Theme must be light or dark");
  await ensureServer(UIP_ROOT, PORT);
  const api = async (url, body) => {
    const r = await fetch(
      origin + url,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
    );
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    return data;
  };
  if (command === "commit") {
    print(
      await api("/__uip/history/commit", {
        branch: options.branch ?? "main",
        message: options.message,
        gitRef: options["git-ref"],
      }),
    );
  } else if (command === "branch") {
    if (keys.length !== 1) throw new Error("branch requires one name");
    print(
      await api("/__uip/history/branch", {
        name: keys[0],
        from: options.from ?? "main",
      }),
    );
  } else if (command === "log") {
    print(
      await api(
        "/__uip/history" +
          (options.branch
            ? "?branch=" + encodeURIComponent(options.branch)
            : ""),
      ),
    );
  } else {
    if (options.revision)
      options.revision = (
        await api(
          "/__uip/history/resolve?ref=" + encodeURIComponent(options.revision),
        )
      ).id;
    const response = await fetch(
      origin +
        "/__uip/scenarios.json?revision=" +
        encodeURIComponent(options.revision ?? "working"),
    );
    const all = await response.json();
    if (!response.ok) throw new Error(all.error);
    let chosen = all.filter(
      (s) =>
        !options.group ||
        s.group.toLowerCase().includes(options.group.toLowerCase()),
    );
    if (keys.length && !keys.includes("all")) {
      for (const k of keys)
        if (!all.some((s) => String(s.id) === k || s.slug === k))
          throw new Error("Unknown screen: " + k);
      chosen = chosen.filter((s) =>
        keys.some((k) => String(s.id) === k || s.slug === k),
      );
    }
    if (command === "list") {
      print(chosen);
    } else if (command === "compare") {
      if (chosen.length !== 1 || keys.length !== 1)
        throw new Error("compare requires exactly one screen ID");
      const revisions = await Promise.all(
        [options.from ?? "main", options.to ?? "working"].map((ref) =>
          api("/__uip/history/resolve?ref=" + encodeURIComponent(ref)),
        ),
      );
      const difference = await api(
        "/__uip/history/diff?" +
          new URLSearchParams({ from: revisions[0].id, to: revisions[1].id }),
      );
      const url = new URL("/" + chosen[0].id, origin);
      url.search = new URLSearchParams({
        before: revisions[0].id,
        after: revisions[1].id,
        mode: "revisions",
        viewport: options.viewport ?? "desktop",
        theme: options.theme ?? "light",
        lang: options.lang ?? "en",
      }).toString();
      browser = await launchBrowser();
      const out = path.resolve(UIP_ROOT, options.out ?? "out/comparisons");
      await fs.mkdir(out, { recursive: true });
      const renders = [];
      for (let i = 0; i < revisions.length; i++) {
        const revision = revisions[i].id;
        let run;
        try {
          run = await renderPage(browser, origin, chosen[0], {
            ...options,
            revision,
          });
          if (run.failure) throw new Error(run.failure);
          const stem = `${chosen[0].id}-${i ? "after" : "before"}-${revision.slice(0, 12)}`;
          const screenshot = path.join(out, stem + ".png");
          await run.page.screenshot({
            path: screenshot,
            fullPage: !!options["full-page"],
            animations: "disabled",
          });
          const inspection = await run.page.evaluate(() =>
            window.__UIP_INSPECT__({ interactive: true, styles: "key" }),
          );
          await fs.writeFile(
            path.join(out, stem + ".json"),
            JSON.stringify(inspection, null, 2),
          );
          renders.push({ revision, screenshot, elements: inspection.elements });
        } finally {
          await run?.context.close();
        }
      }
      const result = {
        id: chosen[0].id,
        url: url.href,
        ...difference,
        renders,
      };
      const report = path.join(out, chosen[0].id + "-comparison.json");
      await fs.writeFile(report, JSON.stringify(result, null, 2));
      print({ ...result, report });
    } else {
      if (
        ["inspect", "sources", "baseline"].includes(command) &&
        (chosen.length !== 1 || !keys.length)
      )
        throw new Error(command + " requires exactly one screen ID or slug");
      if (command === "snap" && !keys.length)
        throw new Error("snap requires an ID, slug, or all");
      if (command === "baseline") {
        print(
          await captureBaseline({
            root: UIP_ROOT,
            origin,
            scenario: chosen[0],
            options,
            name: options.name ?? "Before change",
          }),
        );
      } else {
        browser = await launchBrowser();
        const out = path.resolve(UIP_ROOT, options.out ?? "out");
        await fs.mkdir(out, { recursive: true });
        const results = [];
        for (const sc of chosen) {
          let run;
          try {
            run = await renderPage(browser, origin, sc, options);
            const { page, state } = run;
            const warnings = [
              ...(sc.limitations ? [sc.limitations] : []),
              ...(state.unmocked ?? []).map(
                (r) => `Unmocked ${r.method} ${r.url}`,
              ),
              ...(state.warnings ?? []).filter(
                (w) =>
                  w.includes("scenario click") ||
                  w.includes("had no listeners"),
              ),
            ];
            const item = {
              id: sc.id,
              slug: sc.slug,
              status: run.failure ? "fail" : warnings.length ? "warn" : "ok",
              errors: run.failure ? [run.failure] : [],
              warnings,
              unmocked: state.unmocked ?? [],
              sources: state.sources ?? [],
            };
            const stem = `${sc.id}-${sc.slug}-${options.viewport ?? "desktop"}-${options.theme ?? "light"}-${options.lang ?? "en"}${options.revision && options.revision !== "working" ? "-" + options.revision.slice(0, 12) : ""}`;
            if (command === "inspect") {
              const inspection = await page.evaluate(
                (opts) => window.__UIP_INSPECT__(opts),
                {
                  selector: options.selector,
                  text: options.text,
                  interactive: !!options.interactive,
                  styles: options.styles ?? "key",
                  depth: options.depth ? Number(options.depth) : undefined,
                  max: 2000,
                },
              );
              item.inspection = path.join(out, stem + ".inspect.json");
              await fs.writeFile(
                item.inspection,
                JSON.stringify(inspection, null, 2),
              );
              if (options.annotate)
                await page.evaluate((elements) => {
                  for (const e of elements) {
                    if (!e.visibleInViewport) continue;
                    const box = document.createElement("div");
                    box.dataset.uipOverlay = "";
                    box.style.cssText = `position:absolute;pointer-events:none;z-index:2147483647;left:${e.box.x}px;top:${e.box.y}px;width:${e.box.w}px;height:${e.box.h}px;border:1px solid #dc2626;color:white;font:10px monospace;`;
                    const label = document.createElement("span");
                    label.style.background = "#dc2626";
                    label.textContent = e.ref;
                    box.append(label);
                    document.body.append(box);
                  }
                }, inspection.elements);
              item.count = inspection.count;
            }
            if (["snap", "inspect"].includes(command)) {
              item.screenshot = path.join(out, stem + ".png");
              await page.screenshot({
                path: item.screenshot,
                fullPage: !!options["full-page"],
                animations: "disabled",
              });
            }
            if (command === "sources")
              print({ id: sc.id, sources: state.sources });
            results.push(item);
            console.error(
              `[${results.length}/${chosen.length}] #${sc.id} ${item.status}${item.errors.length ? " " + item.errors.join("; ") : ""}`,
            );
          } catch (e) {
            results.push({
              id: sc.id,
              slug: sc.slug,
              status: "fail",
              errors: [String(e.message ?? e)],
              warnings: [],
            });
            console.error(`#${sc.id} fail: ${e.message}`);
          } finally {
            await run?.context.close();
          }
        }
        const summary = {
          command,
          createdAt: new Date().toISOString(),
          revision: options.revision ?? "working",
          settings: {
            viewport: options.viewport ?? "desktop",
            theme: options.theme ?? "light",
            lang: options.lang ?? "en",
          },
          total: results.length,
          ok: results.filter((r) => r.status === "ok").length,
          warnings: results.filter((r) => r.status === "warn").length,
          failed: results.filter((r) => r.status === "fail").length,
          results,
        };
        const reportPath = path.join(
          out,
          command === "check"
            ? options.revision && options.revision !== "working"
              ? "check-" + options.revision.slice(0, 12) + "-report.json"
              : "check-report.json"
            : command + "-report.json",
        );
        await fs.writeFile(reportPath, JSON.stringify(summary, null, 2));
        if (command !== "sources") print({ ...summary, report: reportPath });
        if (summary.failed) process.exitCode = 1;
      }
    }
  }
} catch (e) {
  print({ error: String(e.message ?? e) });
  process.exitCode = 1;
} finally {
  await browser?.close();
}
