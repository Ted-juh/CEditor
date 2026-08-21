# CLAUDE.md

Working notes for Claude Code in this repository. Read this before touching anything, and read
[the CI budget section](#ci-minutes-are-a-hard-budget) before you push.

---

## CI minutes are a hard budget

This account's GitHub Actions allowance is the binding constraint on this repo. It is close to
exhausted and it only resets once a month. Overrunning it does not queue — it bills.

Why it drains so fast:

- The only workflow is `.github/workflows/ci.yml`, and it runs on `windows-latest`. **Windows
  runners bill at 2× minutes.** A 25-minute run costs 50 minutes of allowance. The job's ceiling is
  `timeout-minutes: 90`, so a hung run can cost 180.
- It builds the whole thing: `npm ci`, the web test suite, the Vite bundle, a full MSVC Release
  build of every CMake target, then CTest. There is no fast path and no cheap subset.
- It triggers on push to `main`, on **every** `pull_request` — drafts included — and on manual
  dispatch. Once a PR is open, *each push to that branch starts another full run.* Ten small
  "just one more fix" pushes is ten full Windows builds.

So: a CI run is something you spend, not something you get for free. The rules below follow from
that and are not negotiable without asking first.

### Rules

1. **Verify locally, then push.** Everything except the Windows-only targets runs on this machine —
   see [Local verification](#local-verification). Do that work before involving GitHub, every time.
2. **Batch your commits.** Commit locally as often as you like; that is free. Push when the change
   is *finished and locally green*, not when a file is saved. One push per completed change.
3. **Do not push work-in-progress to a branch that has an open PR.** That is the most expensive
   habit available. If the work needs several rounds, keep them local and push the result.
4. **Open the PR last**, after local verification passes. A draft PR is not a saving — this
   workflow has no `types:` filter, so drafts run CI in full exactly like ready PRs.
5. **Use `[skip ci]` for changes that cannot affect the build.** Markdown and docs, comments,
   `.gitignore`, `LICENSE`, review notes. Put it in the commit message:

   ```
   git commit -m "docs: correct the export gate ordering [skip ci]"
   ```

   GitHub honours `[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]` and `[actions skip]` on
   `push` and `pull_request` events. What counts is the **head commit of the push** — so if you are
   pushing several commits, the marker must be on the last one. Never put it on the final commit of
   a change that does need verifying; a skipped run on real code is worse than no run, because it
   looks green.
6. **Never spend a run to look at something.** No `workflow_dispatch` to "check", no empty commit
   to kick CI, no close-and-reopen of a PR. If you want to know whether something builds, build it
   locally.
7. **When CI is red, fix it in one push.** Read the job log, reproduce the failure locally, fix
   everything you can see, verify locally, push once. Do not iterate against the runner. Note that
   `concurrency: cancel-in-progress` is set, so a second push cancels the first run mid-flight —
   that limits the damage, but the cancelled run still bills for the minutes it burned.
8. **Do not widen CI without asking.** No new workflow, no extra job, no build matrix, no
   `schedule:` trigger, no `push:` on all branches, no self-hosted anything. If a change seems to
   call for it, propose it and wait.

### What actually needs CI

Only what cannot be built here: WebView2, `juceaide` and the generated binary data, the app,
standalone player and VST3 plugin targets, and MSVC-specific compile errors that Clang/GCC accept.
That is a real reason to spend a run — **once**, on the finished change.

Remaining allowance is visible under the account's Settings → Billing → Plans and usage. If you are
about to do something that will cost several runs, say what it will cost before you do it.

---

## Local verification

Run these instead of pushing. Nothing here needs Windows — every command below was run on a plain
Linux container, and the notes about what breaks there are from that run, not from guesswork.

### Web (mirrors CI's first three steps exactly)

```bash
cd CE/web
npm ci
npm run test:all     # node --test suite + script-export validation
npm run build        # the bundle CMakeLists globs into PlayerWebData
```

The node suite takes about three and a half minutes here. `validate-script-exports` reports
`SKIP` for any language whose toolchain is absent (commonly Lua and C#) — a skip is not a
failure, but do not read a run full of skips as coverage.

`npm run test:browser` additionally drives Playwright over the built bundle. It is not in CI; run it
locally when you touch rendering, the player inbound path or the learn chips.

### C++ tests, off Windows

```bash
cmake --preset native
cmake --build --preset native-release -- -k 0
ctest --test-dir build/native -C Release --output-on-failure
```

`CEDITOR_BUILD_APP` defaults to **OFF** on non-Windows, so a bare `--preset native` configures the
test executables and nothing else — no WebView2, no `juceaide`, no plugin bundles. Most of the test
targets are plain executables over `juce_core` with `JUCE_USE_CURL=0` and `JUCE_WEB_BROWSER=0`,
which is why they need no GTK or WebKit development packages. From cold this is roughly six minutes
of build and a fraction of a second of tests.

**The `-- -k 0` matters.** Two targets pull JUCE modules that need system development headers:

| Target | Module | Package |
| --- | --- | --- |
| `CEditorDeviceProfileTests` | `juce_audio_devices` | `libasound2-dev` |
| `CEditorPanelParametersTests` | `juce_gui_basics` | `libxrandr-dev` (and the rest of the X11 dev set) |

Without those packages, both fail at the first `#include` — and plain `ninja` stops the whole build
at the first failure, so you get *zero* executables and a `ctest` run where all eleven tests report
`Not Run`. That reads like catastrophe and is nothing of the kind. `-k 0` tells ninja to keep going,
and the other nine targets build and pass.

If you cannot install the packages, exclude the two by name and know what you gave up:

```bash
ctest --test-dir build/native -C Release --output-on-failure -E "DeviceProfileEngine|PanelParameters"
```

That leaves the device-profile engine and the panel-parameter model unverified locally. If your
change touches `CE/src/DeviceProfile/` or panel parameters, that is a real gap — say so rather than
reporting a green run.

CI configures with `-DCEDITOR_SCRIPTING=ON -DCEDITOR_DEV_MODE=OFF`. Match that when your change
touches `CE/src/Scripting/` or the player's script integration — otherwise the scripting,
Python-engine and player-script tests are not configured at all and a green local `ctest` proves
less than it appears to. The first configure with scripting on needs network: FetchContent pulls
Lua and sol2.

### Node-side toolchain checks (fast, no build)

```bash
node tools/scripts/nativeHandlers/verify-all.mjs
node tools/toolchains/languages.mjs status
```

`docs/verify-end-to-end.md` is the full gated checklist for the export toolchain, most of which is
Windows-only. Gates 0 and 1 run anywhere and are the cheapest way to catch a broken script/export
path.

---

## Git etiquette

- Work on the branch you were given. Create it locally if it does not exist.
- Commit messages describe what changed and why, in the repo's existing voice: a short title
  line, then prose that explains the problem before the fix. Read `git log` before writing one.
  Keep the `Co-authored-by: Claude <noreply@anthropic.com>` trailer the history already uses;
  do not put a model version in a commit, a PR body or a code comment.
- Push with `git push -u origin <branch>`. Retry only on network failure.
- Do not open a pull request unless asked for one.

---

## Repo orientation

`README.md` has the architecture and project layout; `docs/README.md` indexes the rest. The short
version: Svelte for all UI, JUCE 8 for the non-visual backend, WebView2 bridging the two, and panel
scripting in seven languages over one shared API.

```
CE/src/      C++ backend (JUCE) — bridge, DeviceProfile, Player, Scripting, Export
CE/web/      Svelte frontend — CE_Application (editor), CE_Panel (renderers), Player
CE/tests/    C++ test sources; targets and add_test() live in the root CMakeLists.txt
tools/       Export, packaging, toolchain provisioning and QA scripts
docs/        Scripting manual, cookbook, design and review notes
```

`CMakeLists.txt` is heavily commented and those comments are load-bearing history — several of them
record a trap somebody already fell into (the vendored `JUCE/bin` helpers versus the blanket `*.exe`
ignore rule, the `CEDITOR_BUILD_APP` guard that used to refuse to configure anywhere but Windows).
Read the comment before changing the thing it sits above.
