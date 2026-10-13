# Completed Screen Studio

Open [the gallery](http://localhost:9999/) or [screen #5003](http://localhost:9999/5003).

The gallery contains 105 real ClassQuiz screens and internal states. Search, slideshow, themes, languages and viewport controls make them browsable. The inspector identifies the real Svelte source files and component call sites.

## Interactive history

[Open the saved branch comparison](http://localhost:9999/5003?before=51df31f564d69e9f0f8ede0fc3b7759dc68dbc4bacc4c57284208b8409cd50d0&after=a683f237d61cd340e8a73760d028777e73db2b7cd9679243d55cefe96abecdde&mode=revisions).

Both sides are clickable. The right side is a clearly labelled demonstration commit with rounded answer buttons. The working frontend was restored after creating it. Expand Preview history to select branch heads or commits, follow parent links, inspect changed files, create branches, save commits or import Git source.

![Two interactive revisions](C:/Users/Denis/Documents/AntiGravity/ClassQuiz/tools/ui-preview/out/verification/version-comparison.png)

`main` contains the completed working preview; `git/head` contains the repository's committed frontend with local fixtures; `demo/rounded-answers` contains the saved style experiment. These preview branches are independent of Git branches. The source files and fixture harness are saved with each preview commit. Installed dependencies are shared.

## Verification

- Full render check: **105 screens, 0 failures, 19 documented limitations**.
- Full screenshots: **105 desktop/light + 105 mobile/dark**, with no remaining failed captures.
- GUI integration checks: pinned direct URLs, independent interactions, replay, responsive sizing, themes, language, reload, navigation/slideshow, source mapping/depth, historical source viewing, baseline capture and wipe, persistence, and search.
- Snapshot round trip: HMR changed only the working pane; a saved changed version stayed changed after the original frontend bytes were restored.
- History tests: parent chains, branch forks, Git imports without checkout, binary assets, excluded environment files, concurrent writes and disk persistence.
- Agent startup: two simultaneous clients shared one persistent server and returned valid JSON.
- Imported Git HEAD: landing, dashboard and player all render successfully.
- Gallery TypeScript check and workspace skill validation pass.
- **393 tracked frontend files retain their pre-task hashes.** Existing user modifications remain intact.

Reports and images live in `out/verification`, `out/check-report.json`, `out/light`, `out/dark-mobile`, `out/git-head-summary.json` and `out/comparisons`. The warning details are present on the affected gallery screens and in each report. A warning never suppresses a runtime failure.

## Use with an agent

From the repository root:

```powershell
node tools/ui-preview/cli/uip.mjs inspect 5003 --interactive --annotate
node tools/ui-preview/cli/uip.mjs commit --branch main --message "Before my next change"
node tools/ui-preview/cli/uip.mjs branch experiment/answers --from main
# Make the requested frontend changes, then:
node tools/ui-preview/cli/uip.mjs commit --branch experiment/answers --message "My answer changes"
node tools/ui-preview/cli/uip.mjs compare 5003 --from main --to experiment/answers
```

The CLI returns JSON and keeps the server available for the GUI and other agents. See [HOW_TO_USE.md](C:/Users/Denis/Documents/AntiGravity/ClassQuiz/tools/ui-preview/HOW_TO_USE.md) for the complete workflow, limitations and how to add screens.
