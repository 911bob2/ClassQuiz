import fs from "node:fs/promises";
import path from "node:path";
import { captureBaseline, viewports } from "./browser.mjs";
import { historyStore } from "./history.mjs";
export function previewEndpoints({ root, repo, frontend, port }) {
  let capturing = false;
  const history = historyStore(root, repo),
    revisions = new Map();
  async function revisionServer(ref) {
    const revision = await history.resolve(ref);
    if (revision.id === "working")
      throw new Error("Working tree uses the main renderer");
    if (!revisions.has(revision.id))
      revisions.set(
        revision.id,
        (async () => {
          const { createConfig, loadVite } = await import("../uip.config.mjs");
          const { createServer } = await loadVite();
          let harnessRoot = path.join(revision.root, "tools/ui-preview");
          // Saved trees are immutable; older snapshots retain their original layout.
          try { await fs.access(harnessRoot); } catch (error) {
            if (error.code !== "ENOENT") throw error;
            harnessRoot = path.join(revision.root, "ui-preview");
          }
          return createServer(
            await createConfig({
              repo: revision.root,
              root: harnessRoot,
              base: `/__uip/revisions/${revision.id}/`,
              revision: revision.id,
            }),
          );
        })().catch((e) => {
          revisions.delete(revision.id);
          throw e;
        }),
      );
    return revisions.get(revision.id);
  }
  const readBody = async (req) => {
    if (
      req.headers.origin &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)
    )
      throw new Error("Local requests only");
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 8192) throw new Error("Request too large");
    }
    return JSON.parse(body);
  };
  return {
    name: "uip-api",
    configureServer(server) {
      server.httpServer?.once("close", () => {
        for (const promise of revisions.values())
          promise.then((s) => s.close()).catch(() => {});
      });
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const json = (data, status = 200) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(data));
        };
        try {
          if (url.pathname === "/__uip/health")
            return json({ tool: "classquiz-ui-preview", version: 1 });
          if (url.pathname === "/__uip/history" && req.method === "GET")
            return json(await history.log(url.searchParams.get("branch")));
          if (url.pathname === "/__uip/history/commit" && req.method === "POST")
            return json(await history.commit(await readBody(req)), 201);
          if (
            url.pathname === "/__uip/history/branch" &&
            req.method === "POST"
          ) {
            const input = await readBody(req);
            return json(await history.branch(input.name, input.from), 201);
          }
          if (url.pathname === "/__uip/history/resolve") {
            const revision = await history.resolve(
              url.searchParams.get("ref") ?? "working",
            );
            return json({ ...revision, root: undefined });
          }
          if (url.pathname === "/__uip/history/diff")
            return json(
              await history.diff(
                url.searchParams.get("from") ?? "main",
                url.searchParams.get("to") ?? "working",
              ),
            );
          const historical = /^\/__uip\/revisions\/([a-f0-9]{64})\//.exec(
            url.pathname,
          );
          if (historical) {
            if (url.pathname.endsWith("/@vite/client")) {
              res.setHeader("Content-Type", "text/javascript");
              res.end(
                await fs.readFile(path.join(root, "lib/frozen-client.mjs")),
              );
              return;
            }
            const child = await revisionServer(historical[1]);
            return child.middlewares(req, res, next);
          }
          if (url.pathname === "/__uip/scenarios.json") {
            const target = url.searchParams.get("revision");
            const source =
              target && target !== "working"
                ? await revisionServer(target)
                : server;
            const { manifest } = await source.ssrLoadModule(
              "/src/scenarios/index.ts",
            );
            return json(manifest());
          }
          if (url.pathname === "/__uip/status") {
            let report = {};
            try {
              report = JSON.parse(
                await fs.readFile(
                  path.join(root, "out/check-report.json"),
                  "utf8",
                ),
              );
            } catch {}
            return json(report);
          }
          if (url.pathname === "/__uip/source") {
            const revision = await history.resolve(
              url.searchParams.get("revision") ?? "working",
            );
            const file = path.resolve(
              revision.root,
              url.searchParams.get("file") ?? "",
            );
            const rel = path.relative(
              path.join(revision.root, "frontend/src"),
              file,
            );
            if (!rel || rel.startsWith("..") || path.isAbsolute(rel))
              return json({ error: "Source must be inside frontend/src" }, 400);
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(await fs.readFile(file));
            return;
          }
          if (url.pathname === "/__uip/baselines" && req.method === "GET") {
            const dir = path.join(root, "out/baselines");
            let names = [];
            try {
              names = await fs.readdir(dir);
            } catch {}
            const data = await Promise.all(
              names
                .filter((n) => n.endsWith(".json"))
                .map(async (n) =>
                  JSON.parse(await fs.readFile(path.join(dir, n), "utf8")),
                ),
            );
            return json(
              data.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
            );
          }
          if (url.pathname === "/__uip/baselines" && req.method === "POST") {
            if (
              req.headers.origin &&
              !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
                req.headers.origin,
              )
            )
              return json({ error: "Local requests only" }, 403);
            if (capturing)
              return json(
                {
                  error:
                    "Another capture is running. Try again when it finishes.",
                },
                409,
              );
            let body = "";
            for await (const chunk of req) {
              body += chunk;
              if (body.length > 4096)
                return json({ error: "Request too large" }, 413);
            }
            const input = JSON.parse(body);
            const { findScenario, manifest } = await server.ssrLoadModule(
              "/src/scenarios/index.ts",
            );
            const sc = findScenario(input.id);
            if (!sc) return json({ error: "Unknown scenario" }, 404);
            const options = {
              viewport: input.viewport ?? "desktop",
              theme: input.theme ?? "light",
              lang: input.lang ?? "en",
              revision: (await history.resolve(input.revision ?? "working")).id,
            };
            if (
              !viewports[options.viewport] ||
              !["light", "dark"].includes(options.theme) ||
              !/^[a-z-]{2,12}$/i.test(options.lang)
            )
              return json({ error: "Invalid capture settings" }, 400);
            capturing = true;
            try {
              return json(
                await captureBaseline({
                  root,
                  origin: `http://127.0.0.1:${port}`,
                  scenario: manifest().find((s) => s.id === sc.id),
                  options,
                  name: input.name,
                }),
              );
            } finally {
              capturing = false;
            }
          }
          if (/^\/__uip\/baselines\/[\w-]+\.png$/.test(url.pathname)) {
            res.setHeader("Content-Type", "image/png");
            res.end(
              await fs.readFile(
                path.join(root, "out/baselines", path.basename(url.pathname)),
              ),
            );
            return;
          }
          if (url.pathname.startsWith("/api/v1/utils/qr/")) {
            const qr = (await import("qrcode")).default;
            res.setHeader("Content-Type", "image/svg+xml");
            res.end(
              await qr.toString(`http://localhost:${port}/5001`, {
                type: "svg",
                margin: 1,
              }),
            );
            return;
          }
          if (
            url.pathname.startsWith("/__mock-assets/") ||
            url.pathname.startsWith("/api/v1/storage/download/") ||
            url.pathname.startsWith("/api/v1/users/avatar/") ||
            url.pathname.startsWith("/api/v1/avatar/custom")
          ) {
            const ref = /\/__uip\/revisions\/([a-f0-9]{64})\//.exec(
              req.headers.referer ?? "",
            );
            const source = ref ? await revisionServer(ref[1]) : server;
            const { artwork } = await source.ssrLoadModule(
              "/src/mocks/api-defaults.ts",
            );
            res.setHeader("Content-Type", "image/svg+xml");
            res.end(artwork(url.pathname.split("/").pop()));
            return;
          }
          // Absolute static URLs in an older screen must also come from its source tree.
          const referer = /\/__uip\/revisions\/([a-f0-9]{64})\//.exec(
            req.headers.referer ?? "",
          );
          if (referer && !url.pathname.startsWith("/__uip/")) {
            const revision = await history.resolve(referer[1]),
              base = path.join(revision.root, "frontend/static"),
              file = path.resolve(base, "." + url.pathname),
              rel = path.relative(base, file);
            if (
              !rel.startsWith("..") &&
              !path.isAbsolute(rel) &&
              (await fs.stat(file).then(
                (s) => s.isFile(),
                () => false,
              ))
            ) {
              req.url = `/__uip/revisions/${revision.id}${url.pathname}${url.search}`;
              return (await revisionServer(revision.id)).middlewares(
                req,
                res,
                next,
              );
            }
          }
          // Every native asset/API request is local and predictable, including XHR upload attempts.
          if (url.pathname.startsWith("/api/"))
            return json(
              { detail: "No backend in UI Preview; request was not mocked." },
              404,
            );
          if (
            url.searchParams.has("uip") &&
            req.headers.accept?.includes("text/html")
          )
            req.url = "/render.html" + url.search;
          next();
        } catch (e) {
          json({ error: String(e.message ?? e) }, 500);
        }
      });
    },
  };
}
