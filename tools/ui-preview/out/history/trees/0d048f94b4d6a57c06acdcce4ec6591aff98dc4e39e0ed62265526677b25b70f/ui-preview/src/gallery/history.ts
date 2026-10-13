type Commit = {
  id: string;
  parent: string | null;
  branch: string;
  message: string;
  createdAt: string;
  tree: string;
  changes: { file: string; status: string }[];
  provenance: { kind: string; gitCommit: string; gitRef: string | null };
};
type History = { branches: Record<string, string>; commits: Commit[] };
const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const initial = new URLSearchParams(location.search);
let data: History = { branches: {}, commits: [] };
let beforeRef = initial.get("before") ?? "main",
  afterRef = initial.get("after") ?? "working";
let before = "working",
  after = "working",
  branch = localStorage.getItem("uip-branch") ?? "main",
  changed: () => void,
  notice: (s: string, error?: boolean) => void;
let diff: { changes: { file: string; status: string }[] } | undefined;
let busy = false,
  historyOpen = false;
const api = async (url: string, body?: unknown) => {
  const r = await fetch(
    "/__uip/" + url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "History request failed");
  return d;
};
const resolve = async (ref: string) =>
  (await api("history/resolve?ref=" + encodeURIComponent(ref))).id;
export const revisions = () => ({ before, after });
export const historyQuery = () => ({ before, after });
export const revisionFrame = (url: string, ref = after) =>
  ref === "working" ? url : `/__uip/revisions/${ref}${url}`;
export const revisionLabel = (id: string) =>
  id === "working"
    ? "Working tree · live"
    : `${id.slice(0, 8)} · ${data.commits.find((c) => c.id === id)?.message ?? "Saved commit"}`;
async function refresh() {
  data = await api("history");
  if (!data.commits.length && beforeRef === "main" && !initial.has("before"))
    beforeRef = "working";
  [before, after] = await Promise.all([resolve(beforeRef), resolve(afterRef)]);
  diff = await api(
    "history/diff?" + new URLSearchParams({ from: before, to: after }),
  );
}
const option = (v: string, label: string, current: string) =>
  `<option value="${esc(v)}" ${current === v ? "selected" : ""}>${esc(label)}</option>`;
function choices(current: string) {
  return (
    option("working", "Working tree · live", current) +
    `<optgroup label="Preview branches">${Object.entries(data.branches)
      .map(([name, id]) => option(name, `${name} · ${id.slice(0, 8)}`, current))
      .join(
        "",
      )}</optgroup><optgroup label="Immutable commits">${data.commits.map((c) => option(c.id, `${c.id.slice(0, 8)} · ${c.message}`, current)).join("")}</optgroup>`
  );
}
export function historyControls(mode: string) {
  return `<section class="version-controls" aria-label="Revision comparison"><div class="version-title"><span class="history-icon">⑂</span><div><b>Compare versions</b><small>Browse a branch, a commit, or your live changes.</small></div></div><label>Before<select id="revision-before" data-history="before">${choices(beforeRef)}</select></label><button data-history-action="swap" title="Swap before and after" aria-label="Swap revisions">⇄</button><label>After<select id="revision-after" data-history="after">${choices(afterRef)}</select></label><button data-history-action="compare" class="${mode === "revisions" ? "selected" : ""}">${mode === "revisions" ? "One pane" : "Compare live"}</button></section>`;
}
export function historyTimeline() {
  return `<details class="revision-history" ${historyOpen ? "open" : ""}><summary>⑂ Preview history <span>${data.commits.length} commits · ${Object.keys(data.branches).length} branches</span></summary><div class="history-content"><p class="muted">A commit saves all frontend screens, fixtures and shims. Preview branches are separate from your Git checkout.</p><div class="commit-form"><label>Save to branch<input id="commit-branch" value="${esc(branch)}" placeholder="main" list="branch-names"></label><datalist id="branch-names">${Object.keys(
    data.branches,
  )
    .map((name) => `<option value="${esc(name)}">`)
    .join(
      "",
    )}</datalist><label class="grow">Commit message<input id="commit-message" placeholder="e.g. Softer answer buttons" maxlength="500"></label><button class="primary" data-history-action="commit" ${busy ? "disabled" : ""}>${busy ? "Saving…" : "＋ Commit working tree"}</button></div><div class="branch-form"><input id="new-branch" placeholder="e.g. experiment/answers" aria-label="New preview branch"><button data-history-action="branch" ${busy ? "disabled" : ""}>Branch from before</button><input id="git-ref" placeholder="Git ref, e.g. HEAD~1" aria-label="Git revision to import"><button data-history-action="import" ${busy ? "disabled" : ""}>Import Git revision</button></div><div class="history-help">Agent commands: <code>uip commit --branch main --message "…"</code> · <code>uip compare 5003 --from main --to working</code></div><div class="history-list">${
    data.commits
      .map(
        (c) =>
          `<article class="history-commit"><span class="commit-node"></span><div><div class="commit-head"><button class="commit-id" data-history-commit="${c.id}" title="Use as before">${c.id.slice(0, 8)}</button><strong>${esc(c.message)}</strong>${Object.entries(
            data.branches,
          )
            .filter(([, id]) => id === c.id)
            .map(([name]) => `<span class="branch-badge">⑂ ${esc(name)}</span>`)
            .join(
              "",
            )}</div><p>${esc(c.branch)} · ${new Date(c.createdAt).toLocaleString()} · ${c.changes.length} changed files ${c.parent ? `· parent <button class="parent-link" data-history-commit="${c.parent}">${c.parent.slice(0, 8)}</button>` : "· root commit"}</p><small>${c.provenance.kind === "git" ? "Imported Git revision" : "Working tree based on Git"} ${esc(c.provenance.gitRef ?? "")} ${esc(c.provenance.gitCommit?.slice(0, 10))}</small></div><button data-history-after="${c.id}">View after ↗</button></article>`,
      )
      .join("") ||
    '<p class="muted">Save your first commit to start a history.</p>'
  }</div><details class="changed-files"><summary>${diff?.changes.length ?? 0} files differ between before and after</summary><ul>${diff?.changes.map((c) => `<li><span>${esc(c.status)}</span><code>${esc(c.file)}</code></li>`).join("")}</ul></details><button data-history-action="refresh">↻ Refresh branches & changes</button><p class="capture-note">Source snapshots are immutable. Rendering uses the currently installed frontend dependencies; a Git revision that needs different packages may not render.</p></div></details>`;
}
export async function initHistory(
  onChange: () => void,
  onNotice: (s: string, error?: boolean) => void,
) {
  changed = onChange;
  notice = onNotice;
  await refresh();
  document.addEventListener(
    "toggle",
    (e) => {
      if ((e.target as HTMLElement).classList?.contains("revision-history"))
        historyOpen = (e.target as HTMLDetailsElement).open;
    },
    true,
  );
  document.addEventListener("change", async (e) => {
    const el = e.target as HTMLSelectElement;
    if (!el.dataset.history) return;
    try {
      if (el.dataset.history === "before") beforeRef = el.value;
      else afterRef = el.value;
      await refresh();
      changed();
    } catch (e: any) {
      notice(e.message, true);
    }
  });
  document.addEventListener("click", async (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-history-action],[data-history-commit],[data-history-after]",
    );
    if (!el || busy) return;
    const action = el.dataset.historyAction;
    try {
      if (el.dataset.historyCommit) {
        beforeRef = el.dataset.historyCommit;
        await refresh();
        changed();
        return;
      }
      if (el.dataset.historyAfter) {
        afterRef = el.dataset.historyAfter;
        await refresh();
        changed();
        return;
      }
      if (action === "compare") {
        document.dispatchEvent(new Event("uip-toggle-comparison"));
        return;
      }
      if (action === "swap") {
        [beforeRef, afterRef] = [afterRef, beforeRef];
        await refresh();
        changed();
        return;
      }
      if (action === "refresh") {
        await refresh();
        changed();
        notice("Preview history refreshed.");
        return;
      }
      const input = (id: string) =>
        (
          document.querySelector<HTMLInputElement>("#" + id)?.value ?? ""
        ).trim();
      if (action === "branch") {
        const name = input("new-branch");
        await api("history/branch", { name, from: before });
        branch = name;
        localStorage.setItem("uip-branch", branch);
        await refresh();
        changed();
        notice(`Created ${name} from ${before.slice(0, 8)}.`);
        return;
      }
      branch = input("commit-branch") || "main";
      localStorage.setItem("uip-branch", branch);
      const gitRef = action === "import" ? input("git-ref") : undefined;
      if (action === "import" && !gitRef)
        throw new Error("Enter a Git revision to import.");
      const message =
        input("commit-message") || (gitRef ? `Import ${gitRef}` : "");
      if (!message) throw new Error("Write a short commit message first.");
      if (!data.branches[branch] && data.commits.length)
        throw new Error(
          "Create that preview branch with “Branch from before” first.",
        );
      busy = true;
      (el as HTMLButtonElement).disabled = true;
      el.textContent = "Saving…";
      notice("Saving an immutable source snapshot…");
      const saved = await api("history/commit", { branch, message, gitRef });
      beforeRef = saved.id;
      afterRef = "working";
      await refresh();
      busy = false;
      changed();
      notice(
        `Saved ${saved.id.slice(0, 8)} on ${branch}. Both versions remain interactive.`,
      );
    } catch (e: any) {
      busy = false;
      changed();
      notice(e.message, true);
    }
  });
}
export async function restoreHistory() {
  const q = new URLSearchParams(location.search);
  beforeRef = q.get("before") ?? "main";
  afterRef = q.get("after") ?? "working";
  await refresh();
}
