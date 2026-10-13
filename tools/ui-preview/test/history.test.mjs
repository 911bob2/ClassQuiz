import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { historyStore } from "../lib/history.mjs";

for (const toolFolder of ["ui-preview", "tools/ui-preview"]) {
test(`source snapshots, forks, Git imports and concurrent commits preserve ancestry and bytes (${toolFolder})`, async () => {
  const base = path.resolve(import.meta.dirname, "../out/tests");
  await fs.mkdir(base, { recursive: true });
  const repo = await fs.mkdtemp(path.join(base, "history-")),
    root = path.join(repo, toolFolder);
  for (const folder of ["frontend/src", "frontend/static", `${toolFolder}/src`])
    await fs.mkdir(path.join(repo, folder), { recursive: true });
  const source = path.join(repo, "frontend/src/page.svelte");
  await fs.writeFile(source, "<button>Before</button>");
  const bytes = Buffer.from([0, 1, 255, 0, 128, 10, 13]);
  await fs.writeFile(path.join(repo, "frontend/static/binary.png"), bytes);
  await fs.writeFile(
    path.join(root, "src/fixture.ts"),
    'export const title="Sample";',
  );
  await fs.writeFile(path.join(repo, "frontend/.env"), "NOT INCLUDED");
  const git = async (...args) =>
    (
      await promisify(execFile)("git", args, { cwd: repo, windowsHide: true })
    ).stdout.trim();
  await git("init", "-q");
  await git("add", "frontend/src", "frontend/static");
  await git(
    "-c",
    "user.name=Preview Test",
    "-c",
    "user.email=preview@example.invalid",
    "commit",
    "-qm",
    "Original",
  );
  const head = await git("rev-parse", "HEAD");
  const store = historyStore(root, repo);
  const a = await store.commit({ message: "Before" });
  assert.equal((await store.resolve(a.id.slice(0, 8))).id, a.id);
  assert.equal((await store.resolve("main")).id, a.id);
  const aRoot = (await store.resolve(a.id)).root;
  assert.deepEqual(
    await fs.readFile(path.join(aRoot, "frontend/static/binary.png")),
    bytes,
  );
  await assert.rejects(fs.access(path.join(aRoot, "frontend/.env")));
  await store.branch("experiment/answers", "main");
  await fs.writeFile(source, "<button>After</button>");
  await fs.writeFile(
    path.join(root, "src/fixture.ts"),
    'export const title="Changed fixture";',
  );
  const b = await store.commit({
    branch: "experiment/answers",
    message: "After",
  });
  assert.equal(b.parent, a.id);
  assert.equal((await store.resolve("main")).id, a.id);
  assert.equal(
    await fs.readFile(path.join(aRoot, "frontend/src/page.svelte"), "utf8"),
    "<button>Before</button>",
  );
  assert.deepEqual(
    (await store.diff(a.id, b.id)).changes.map((c) => c.file),
    ["frontend/src/page.svelte", `${toolFolder}/src/fixture.ts`],
  );
  await store.branch("git/original", a.id);
  const imported = await store.commit({
    branch: "git/original",
    message: "Git HEAD",
    gitRef: "HEAD",
  });
  assert.equal(imported.provenance.gitCommit, head);
  assert.equal(
    await fs.readFile(
      path.join(
        (await store.resolve(imported.id)).root,
        "frontend/src/page.svelte",
      ),
      "utf8",
    ),
    "<button>Before</button>",
  );
  assert.equal(await fs.readFile(source, "utf8"), "<button>After</button>");
  assert.equal(await git("rev-parse", "HEAD"), head);
  await assert.rejects(store.branch("../escape", "main"));
  await assert.rejects(store.branch("working", "main"));
  await assert.rejects(store.branch("main", "main"));
  await assert.rejects(store.resolve("bogus"));
  await assert.rejects(
    store.commit({ branch: "missing", message: "No implicit fork" }),
  );
  const concurrent = await Promise.all([
    store.commit({ message: "One" }),
    store.commit({ message: "Two" }),
  ]);
  const tip = concurrent.find((c) => concurrent.some((p) => p.id === c.parent));
  assert.ok(tip);
  const reopened = historyStore(root, repo);
  assert.equal((await reopened.resolve("main")).id, tip.id);
  assert.equal((await reopened.log("experiment/answers")).commits.length, 2);
});
}
