import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// CLI clients share a persistent process. One finishing command must not stop
// a gallery or another agent's in-progress capture.
export async function ensureServer(root, port) {
  const origin = `http://127.0.0.1:${port}`;
  async function healthy() {
    let response;
    try {
      response = await fetch(origin + "/__uip/health", {
        signal: AbortSignal.timeout(1000),
      });
    } catch {
      return false;
    }
    const data = await response.json().catch(() => null);
    if (data?.tool !== "classquiz-ui-preview")
      throw new Error(`Port ${port} is used by another server`);
    return true;
  }
  if (await healthy()) return;
  // A manually launched npm run dev may still be initializing.
  for (let i = 0; i < 6; i++) {
    await wait(250);
    if (await healthy()) return;
  }
  const out = path.join(root, "out");
  await fs.mkdir(out, { recursive: true });
  const lock = path.join(out, `server-${port}.lock`);
  let handle;
  for (let attempt = 0; attempt < 160; attempt++) {
    if (await healthy()) return;
    try {
      handle = await fs.open(lock, "wx");
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const age = await fs.stat(lock).then(
        (s) => Date.now() - s.mtimeMs,
        () => 0,
      );
      if (age > 60000) {
        await fs.unlink(lock).catch(() => {});
        continue;
      }
      await wait(250);
    }
  }
  if (!handle)
    throw new Error(`Timed out waiting for the preview server on port ${port}`);
  try {
    if (await healthy()) return;
    const log = await fs.open(path.join(out, `server-${port}.log`), "a");
    let child, error;
    try {
      child = spawn(process.execPath, [path.join(root, "server.mjs")], {
        cwd: root,
        windowsHide: true,
        detached: true,
        stdio: ["ignore", log.fd, log.fd],
        env: { ...process.env, UIP_PORT: String(port), UIP_QUIET: "1" },
      });
      child.on("error", (e) => {
        error = e;
      });
      child.unref();
      if (child.pid)
        await fs.writeFile(
          path.join(out, `server-${port}.pid`),
          String(child.pid),
        );
    } finally {
      await log.close();
    }
    for (let attempt = 0; attempt < 120; attempt++) {
      if (error) throw error;
      if (await healthy()) return;
      await wait(250);
    }
    throw new Error(`Preview startup timed out. See out/server-${port}.log`);
  } finally {
    await handle.close();
    await fs.unlink(lock).catch(() => {});
  }
}
