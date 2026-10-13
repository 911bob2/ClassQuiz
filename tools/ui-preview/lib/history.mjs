import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const posix = (value) => value.split(path.sep).join("/");
const branchName = /^[a-zA-Z][a-zA-Z0-9._/-]{0,79}$/;
const trackedRoots = ["frontend/src", "frontend/static"];
const configFiles = [
  "frontend/package.json",
  "frontend/pnpm-lock.yaml",
  "frontend/svelte.config.js",
  "frontend/tsconfig.json",
];

export function historyStore(root, repo) {
  const dir = path.join(root, "out/history");
  const harnessPrefix = posix(path.relative(repo, root)) + "/";
  const read = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
  const git = async (...args) =>
    (
      await exec("git", args, {
        cwd: repo,
        windowsHide: true,
        maxBuffer: 256 * 1024 * 1024,
        encoding: "buffer",
      })
    ).stdout;
  async function refs() {
    try {
      return await read(path.join(dir, "refs.json"));
    } catch (e) {
      if (e.code === "ENOENT") return {};
      throw e;
    }
  }
  async function writeRefs(value) {
    const tmp = path.join(dir, `refs-${randomUUID()}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(value, null, 2));
    await fs.rename(tmp, path.join(dir, "refs.json"));
  }
  async function locked(fn) {
    await fs.mkdir(dir, { recursive: true });
    let handle;
    for (let i = 0; i < 100; i++) {
      try {
        handle = await fs.open(path.join(dir, "write.lock"), "wx");
        break;
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!handle)
      throw new Error(
        "Preview history is busy. If the server crashed, remove out/history/write.lock after stopping it.",
      );
    try {
      return await fn();
    } finally {
      await handle.close();
      await fs.unlink(path.join(dir, "write.lock"));
    }
  }
  async function objects() {
    let names = [];
    try {
      names = await fs.readdir(path.join(dir, "commits"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    return Promise.all(
      names
        .filter((n) => /^[a-f0-9]{64}\.json$/.test(n))
        .map((n) => read(path.join(dir, "commits", n))),
    );
  }
  async function resolve(ref = "working") {
    if (ref === "working")
      return { id: "working", message: "Working tree", root: repo };
    const pointers = await refs();
    let id = Object.hasOwn(pointers, ref) ? pointers[ref] : undefined;
    if (!id) {
      if (!/^[a-f0-9]{7,64}$/.test(ref))
        throw new Error(`Unknown preview revision: ${ref}`);
      const matches = (await objects()).filter((c) => c.id.startsWith(ref));
      if (matches.length !== 1)
        throw new Error(`Unknown or ambiguous preview commit: ${ref}`);
      id = matches[0].id;
    }
    const commit = await read(path.join(dir, "commits", id + ".json"));
    return { ...commit, root: path.join(dir, "trees", commit.tree) };
  }
  async function filesFromDisk(base, folders, extras = []) {
    const files = new Map();
    async function walk(rel) {
      const file = path.join(base, rel);
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink())
        throw new Error(`Snapshots do not follow symlinks: ${rel}`);
      if (stat.isDirectory()) {
        for (const name of (await fs.readdir(file)).sort())
          await walk(posix(path.join(rel, name)));
      } else if (stat.isFile()) files.set(rel, await fs.readFile(file));
    }
    for (const folder of folders) await walk(folder);
    for (const file of extras) {
      try {
        await walk(file);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    return files;
  }
  async function sourceFiles(gitRef) {
    if (!gitRef)
      return { files: await filesFromDisk(repo, trackedRoots, configFiles) };
    if (typeof gitRef !== "string" || gitRef.startsWith("-"))
      throw new Error("Invalid Git ref");
    const sha = (await git("rev-parse", "--verify", `${gitRef}^{commit}`))
      .toString()
      .trim();
    const entries = (
      await git(
        "ls-tree",
        "-r",
        "-z",
        sha,
        "--",
        ...trackedRoots,
        ...configFiles,
      )
    )
      .toString()
      .split("\0")
      .filter(Boolean);
    const records = entries.map((entry) => {
      const [meta, file] = entry.split("\t");
      const [mode, type, oid] = meta.split(" ");
      if (
        type !== "blob" ||
        mode === "120000" ||
        file.split("/").includes("..")
      )
        throw new Error("Unsupported Git snapshot entry: " + file);
      return { file, oid };
    });
    // Batch all blobs through git's binary-safe framing; never invoke a shell.
    const { spawn } = await import("node:child_process");
    const output = await new Promise((resolve, reject) => {
      const child = spawn("git", ["cat-file", "--batch"], {
        cwd: repo,
        windowsHide: true,
      });
      const chunks = [],
        errors = [];
      child.stdout.on("data", (b) => chunks.push(b));
      child.stderr.on("data", (b) => errors.push(b));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0
          ? resolve(Buffer.concat(chunks))
          : reject(new Error(Buffer.concat(errors).toString())),
      );
      child.stdin.on("error", reject);
      child.stdin.end(records.map((r) => r.oid).join("\n") + "\n");
    });
    let cursor = 0;
    const files = new Map();
    for (const record of records) {
      const end = output.indexOf(10, cursor);
      const size = Number(
        output.subarray(cursor, end).toString().split(" ")[2],
      );
      if (!Number.isFinite(size)) throw new Error("Invalid Git blob response");
      cursor = end + 1;
      files.set(record.file, output.subarray(cursor, cursor + size));
      cursor += size + 1;
    }
    return { files, sha };
  }
  async function commit({ branch = "main", message, gitRef } = {}) {
    validateBranch(branch);
    if (!message?.trim()) throw new Error("A commit message is required");
    return locked(async () => {
      const pointers = await refs();
      if (Object.keys(pointers).length && !Object.hasOwn(pointers, branch))
        throw new Error(
          "Create the preview branch first with branch --from <revision>",
        );
      const parent = pointers[branch] ?? null;
      const { files, sha } = await sourceFiles(gitRef);
      // Freeze the harness as well: fixtures and shims are part of a reproducible preview.
      const harness = await filesFromDisk(
        root,
        ["src"],
        ["render.html", "index.html", "tsconfig.json"],
      );
      for (const [file, bytes] of harness)
        files.set(harnessPrefix + file, bytes);
      const manifest = Object.fromEntries(
        [...files]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([file, bytes]) => [
            file,
            { hash: hash(bytes), size: bytes.length },
          ]),
      );
      const tree = hash(JSON.stringify(manifest));
      const treeDir = path.join(dir, "trees", tree);
      try {
        await fs.access(path.join(treeDir, ".manifest.json"));
      } catch {
        const temp = treeDir;
        await fs.mkdir(temp, { recursive: true });
        for (const [file, bytes] of files) {
          const dest = path.join(temp, file);
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.writeFile(dest, bytes);
        }
        await fs.writeFile(
          path.join(temp, ".manifest.json"),
          JSON.stringify(manifest, null, 2),
        );
      }
      let gitHead = null,
        gitBranch = null;
      try {
        gitHead = (await git("rev-parse", "HEAD")).toString().trim();
        gitBranch = (await git("branch", "--show-current")).toString().trim();
      } catch {}
      const previous = parent
        ? await read(
            path.join(
              dir,
              "trees",
              (await resolve(parent)).tree,
              ".manifest.json",
            ),
          )
        : {};
      const changes = diffManifests(previous, manifest);
      const value = {
        schema: 1,
        parent,
        tree,
        branch,
        message: message.trim().slice(0, 500),
        createdAt: new Date().toISOString(),
        provenance: {
          kind: sha ? "git" : "working-tree",
          gitCommit: sha ?? gitHead,
          gitBranch,
          gitRef: gitRef ?? null,
        },
        changes,
      };
      value.id = hash(JSON.stringify(value));
      await fs.mkdir(path.join(dir, "commits"), { recursive: true });
      await fs.writeFile(
        path.join(dir, "commits", value.id + ".json"),
        JSON.stringify(value, null, 2),
        { flag: "wx" },
      );
      pointers[branch] = value.id;
      await writeRefs(pointers);
      return value;
    });
  }
  async function branch(name, from = "main") {
    validateBranch(name);
    return locked(async () => {
      const pointers = await refs();
      if (Object.hasOwn(pointers, name))
        throw new Error("Branch already exists: " + name);
      const resolved = await resolve(from);
      if (resolved.id === "working")
        throw new Error("Commit the working tree before creating a branch");
      pointers[name] = resolved.id;
      await writeRefs(pointers);
      return { name, commit: resolved.id };
    });
  }
  async function log(branch) {
    const pointers = await refs();
    let commits = await objects();
    if (branch) {
      let current = await resolve(branch),
        chain = [];
      while (current.id !== "working") {
        chain.push(current.id);
        if (!current.parent) break;
        current = await resolve(current.parent);
      }
      commits = commits.filter((c) => chain.includes(c.id));
    }
    return {
      schema: 1,
      branches: pointers,
      commits: commits.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }
  async function manifest(ref) {
    const revision = await resolve(ref);
    if (revision.id !== "working")
      return read(path.join(revision.root, ".manifest.json"));
    const files = await filesFromDisk(repo, trackedRoots, configFiles);
    const harness = await filesFromDisk(
      root,
      ["src"],
      ["render.html", "index.html", "tsconfig.json"],
    );
    for (const [file, bytes] of harness) files.set(harnessPrefix + file, bytes);
    return Object.fromEntries(
      [...files].map(([file, bytes]) => [
        file,
        { hash: hash(bytes), size: bytes.length },
      ]),
    );
  }
  async function diff(from, to) {
    const [a, b] = await Promise.all([resolve(from), resolve(to)]);
    return {
      from: a.id,
      to: b.id,
      changes: diffManifests(await manifest(from), await manifest(to)),
    };
  }
  return { commit, branch, log, resolve, diff };
}
function validateBranch(name) {
  if (
    !branchName.test(name) ||
    name.includes("..") ||
    name.endsWith("/") ||
    ["working", "__proto__", "constructor", "prototype"].includes(name) ||
    /^[a-f0-9]{7,64}$/.test(name)
  )
    throw new Error("Invalid preview branch name");
}
function diffManifests(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .sort()
    .filter((file) => a[file]?.hash !== b[file]?.hash)
    .map((file) => ({
      file,
      status: !a[file] ? "added" : !b[file] ? "deleted" : "modified",
    }));
}
