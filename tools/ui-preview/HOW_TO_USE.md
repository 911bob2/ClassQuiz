# ClassQuiz Screen Studio

Open **http://localhost:9999**. The gallery renders the real ClassQuiz Svelte components with local sample data. No backend, Redis, or socket server is needed.

## Start

```powershell
cd C:\Users\Denis\Documents\AntiGravity\ClassQuiz\tools\ui-preview
npm install
npm run dev
```

The frontend dependencies must already be installed in `frontend/node_modules`. The preview reuses their exact versions, including one Svelte runtime. Its only additional dependency is Playwright; Chromium installs automatically on the first capture if needed. Override the port with `$env:UIP_PORT='9998'` before starting both server and CLI.

## Browse and interact

- Search by title, source filename, numeric ID, or slug. Choose a group to filter the grid.
- Open `/5003` or `/play.question.abcd` directly. IDs stay stable as new scenarios are added.
- Use previous/next, the arrow keys, or the slideshow (eight seconds per screen). `/` focuses search; Escape returns to the gallery.
- Choose desktop (1280 × 800), tablet (768 × 1024), or mobile (390 × 844), a theme, and a language. The frame scales to fit without changing its internal viewport.
- Click and type inside the page. Replay resets the sample and entrance animations. Pause timers reloads into a frozen initial state; Resume timers restarts it.
- Inspect overlays real source locations; clicking an element copies its reference. Sources & diagnostics shows frontend files, props, requests, socket events, navigation and errors, for either comparison pane.
- Open page opens only the interactive screen. Internal links in the gallery open the closest matching sample; unsupported navigation is reported locally.

All backend writes are mocked. Uploads, publishing, authentication and hardware integrations are not production operations. Live animations run normally; CLI captures finish animations and pause timers.

## Preview branches and commits

A **preview commit** saves `frontend/src`, `frontend/static`, dependency/config metadata, and the preview renderer, fixtures, scenario registry and shims. It records a parent commit, content hash, message, timestamp, changed files and Git provenance. A **preview branch** is a movable name pointing to a commit. These are local preview references, separate from the repository's Git branches. Saving or switching a preview never checks out, resets, stashes, commits, or stages repository files.

1. Expand **Preview history**, write a message, and **Commit working tree** to `main`.
2. Choose that commit as Before. Type `experiment/answers` and choose **Branch from before**.
3. Edit the real frontend. Working tree updates through HMR. Save the experiment to its preview branch.
4. Select any branches or commits as Before and After and choose **Compare live**. Both panes are interactive; actions in one pane do not replay in the other. Changing screen retains the revision pair.

The URL pins resolved commit IDs so sharing a comparison does not drift when branch pointers advance. `working` intentionally stays live. For example:

```text
http://localhost:9999/5003?before=main&after=working&mode=revisions&viewport=mobile&theme=dark
```

Opening that URL resolves `main` and replaces it with its immutable ID. History shows branch heads and parent links. Selecting a commit ID sets Before; View after sets After. Refresh branches & changes picks up commits created by another agent and recomputes changed files.

**Import Git revision** accepts a local Git ref such as `HEAD`, `HEAD~1`, or a commit SHA. It reads committed frontend files without changing the checkout, pairing them with today's preview harness. Import into a separate preview branch to preserve a useful working-tree branch. Rendering shares the **currently installed frontend packages and preview compiler**. Old source requiring different packages or incompatible fixtures can fail; inspect the visible error or run `check --revision`. This is source history, not a container or dependency-lockfile installer.

All history persists in `out/history/`. Commits and source trees are append-only; branch pointers advance. No automatic pruning runs. Copy this directory to back up history. Keep the tool and frontend dependencies alongside it to render it elsewhere. A process crash during a write can leave `out/history/write.lock`; stop the preview server before removing that lock and retrying.

## Screenshot checkpoints

Capture before saves the selected revision's **initial sample state**, viewport, theme and language as a PNG, not the state you have clicked into. Checkpoints are stored under `out/baselines/` and only offered for matching screen/settings. Side by side and Wipe compare a still reference with the selected interactive After revision. They complement the two-interactive-pane revision comparison.

## Agent CLI

Run from `tools/ui-preview`. Use `node cli/uip.mjs` when another program needs pure JSON stdout; `npm run uip --` adds npm's own banner. Progress goes to stderr. Commands reuse the server or start a shared background server that remains available for the gallery and other agents. Startup is serialized, with PID/log files at `out/server-<port>.pid` and `out/server-<port>.log`. Stop that process by its recorded PID when finished. Exit code 1 indicates an error or failed render.

```powershell
node cli/uip.mjs list --group player
node cli/uip.mjs inspect 5003 --interactive --annotate
node cli/uip.mjs inspect 3001 --selector button --styles all --depth 2
node cli/uip.mjs sources 5003
node cli/uip.mjs snap 5003 --theme dark --viewport mobile
node cli/uip.mjs check 5003 5004 5020
node cli/uip.mjs baseline 5003 --name "Before answer changes"

node cli/uip.mjs commit --branch main --message "Before answer redesign"
node cli/uip.mjs branch experiment/answers --from main
# Edit frontend/src, then:
node cli/uip.mjs commit --branch experiment/answers --message "Rounded answers"
node cli/uip.mjs log --branch experiment/answers
node cli/uip.mjs compare 5003 --from main --to experiment/answers
node cli/uip.mjs inspect 5003 --revision main --interactive
node cli/uip.mjs snap 5003 --revision experiment/answers
node cli/uip.mjs check 5003 --revision main

node cli/uip.mjs branch git/previous --from main
node cli/uip.mjs commit --branch git/previous --git-ref HEAD~1 --message "Previous Git revision"
```

`compare` writes before/after PNGs, interactive-element inspection JSON, source-change metadata and a pinned comparison URL. `--from` and `--to` accept a preview branch, unambiguous commit prefix (at least seven characters), full commit ID, or `working`. `--revision` works with list, snap, inspect, sources, baseline and check. A new branch must first be created with `branch`; the first-ever commit can initialize `main`.

Render options: `--viewport desktop|tablet|mobile`, `--theme light|dark`, `--lang en|de|sk|fr|es`, `--out <directory>` (relative to `tools/ui-preview`), `--full-page`. `inspect` also accepts `--selector`, `--text`, `--interactive`, `--styles key|all|none`, `--depth` and `--annotate`. Inspection depth is measured from the selector root, or body when no selector is given. `snap all` and `check` cover the complete registry.

Inspection entries contain `ref`, `tag`, text, bounding box, attributes, computed styles, `src` and `usedIn` (component call site). `.svelte` source lines are preserved through TypeScript preprocessing. Markdown-generated markup and third-party library DOM may not have exact original source locations; inspect their containing Svelte component.

## Screens and limitations

There are 105 scenarios: public/docs (1xxx), account (2xxx), dashboard (3xxx), editor (4xxx), player (5xxx), host (6xxx), results (7xxx), practice/activities/remote (8xxx). `list` is the authoritative catalogue. IDs include real internal states reached through socket events and interactions, not copied page mockups.

Warnings are explicit in the gallery and check reports. The legacy files route is empty in the frontend. The player has no SLIDE rendering branch. The host's slide export currently produces a blank image because it exports a hidden canvas before import finishes; use #4007 to inspect the editor. CKEditor itself renders; real uploads, FFmpeg encoding and WebAuthn are limited. A warning does not suppress an actual runtime error.

## Extend the registry

Edit `src/scenarios/index.ts`; preserve existing IDs/slugs. Choose the next unused ID in the area's range. Pass mock `data`/props, nested layouts, route parameters and per-scenario fetch responses. Use `run(ctx)` to fire socket events or click into a state, and `onEmit` for local responses to user interactions. Shared data lives in `src/mocks/data.ts`, API defaults in `src/mocks/api-defaults.ts`. Use a props factory or clone fixtures to prevent cross-screen mutation.

New library-component previews must be added to the intentionally narrow glob at the registry's top. Route components are discovered by the routes glob. Adding a route does not silently allocate an unstable ID; add an explicit registry entry. Add a limitation only for a real restriction, and never use it to hide a broken fixture.

## Verify the tool

```powershell
npm test
node cli/uip.mjs check
node cli/uip.mjs snap all --theme light --out out/light
node cli/uip.mjs snap all --theme dark --viewport mobile --out out/dark-mobile
node test/studio.mjs
```

The history tests use isolated temporary repositories under `out/tests`. The studio integration test exercises the GUI and both revision panes against a running server. `test/roundtrip.mjs` temporarily styles the answer buttons, verifies HMR and snapshot isolation, saves a clearly labelled demonstration branch, and restores the original frontend bytes in `finally`.

`tools/ui-preview/`, its source and saved preview history are tracked by Git. Dependencies, runtime logs/PIDs and temporary test repositories remain ignored. `.agents/` stays local. The tools directory is excluded from application Docker build contexts. Restart the server after editing its Node middleware/configuration; frontend, fixtures, and gallery edits use HMR. Existing preview snapshots retain their original layout and remain renderable after the move.
