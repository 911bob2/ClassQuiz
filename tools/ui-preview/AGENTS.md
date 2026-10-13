# ClassQuiz preview workflow

Use this tool when changing ClassQuiz UI or when the user names a screen such as #5003. The gallery is http://localhost:9999; direct links support IDs and slugs. Read HOW_TO_USE.md for history, CLI options and scenario conventions.

From the repository root, invoke `node tools/ui-preview/cli/uip.mjs`. Stdout is JSON, stderr is progress. `list` locates screens. `inspect <id> --interactive --annotate` produces a PNG and JSON with real frontend `src` and `usedIn` locations. `sources <id>` reports participating files.

For a UI edit, capture the current version before changing it: `commit --branch main --message "Before <change>"`. If experimenting, create a preview branch with `branch <name> --from main`; commit later revisions to that branch. Preview references never switch the Git checkout. Use explicit commit IDs when multiple agents might advance a branch. Concurrent commits are serialized and preserve ancestry; source capture assumes nobody is writing those files at the same moment.

Edit `frontend/src` for actual UI changes. Do not alter fixtures or preview-only CSS to make an application defect appear fixed. Changing the preview infrastructure or adding missing fixtures/scenarios is appropriate when that is the task. Snapshot directories under `out/history/trees` are immutable artifacts, never edit targets.

After editing, use `snap <id>` and relevant `check` IDs. `compare <id> --from <saved-ref> --to working` returns both screenshots, element inspections, changed source paths and a pinned interactive comparison URL. A screen warning documents a real restriction; inspect its details. Check exits unsuccessfully on runtime errors even when a limitation exists.

`--revision <branch|commit|working>` selects source history for list/snap/inspect/sources/check/baseline. Git imports use `commit --git-ref <ref>` and reuse installed dependencies/current fixtures; old source can be incompatible. Do not present a failed historical render as a successful comparison.

Add explicit stable IDs/slugs to src/scenarios/index.ts for new screens, never renumber existing ones. Do not perform Git checkout/reset/stash to implement a preview comparison. Preserve unrelated working-tree changes.

When staging saved history for a repository Git commit, include every file declared by each completed tree's `.manifest.json`. Captured frontend `.gitignore` files can hide required snapshot assets; force-add only those declared paths, not runtime dependency junctions or caches. Keep the snapshot byte-preservation attributes intact. Temporary `.pending-*` trees and test repositories remain ignored.
