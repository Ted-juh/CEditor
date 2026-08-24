# CLAUDE.md

Working notes for Claude Code in this repository. Read this before touching anything, and read
[the CI section](#ci-is-free-here-and-that-is-not-a-licence-to-iterate-against-it) before you push.

---

## CI is free here, and that is not a licence to iterate against it

**This repository is public, so GitHub Actions costs nothing.** Standard GitHub-hosted runners are
free and unmetered on public repositories, and `windows-latest` is a standard runner. There is no
allowance to exhaust and no 2× multiplier to pay.

Checked rather than assumed, on 2026-08-23:

- The repo API reports `"private": false, "visibility": "public"`.
- `GET /repos/Ted-juh/CEditor/actions/runs/32562104194/timing` — run #161, a full Windows build
  that took 21.9 minutes of wall clock — returns `billable.WINDOWS.total_ms: 0`. Nothing to bill is
  what zero billable milliseconds means.

### Why this file used to say the opposite

It is worth recording, because the claim was emphatic and somebody will be tempted to put it back.
Commit `e91a55f` (2026-08-21) introduced a section headed "CI minutes are a hard budget", stating
that the allowance was "close to exhausted" and that Windows runners "bill at 2× minutes". The
second half is true of private repositories and irrelevant to a public one.

Whether the repo was private then and has since been flipped, or whether the allowance was asserted
without checking visibility, is not recoverable from here — GitHub does not expose a history of it.
Either way the rules were derived from a cost that is not being charged today, and the lesson is the
same in both cases: the premise was never in the file, only the conclusion, so nobody could check
it. That is why the evidence above is written down with the run number in it.

**The condition that brings it back.** If this repository is ever made private, all of it becomes
true again the same minute — Windows at 2×, a monthly allowance, and a hung run at
`timeout-minutes: 90` costing 180 minutes. Larger or custom runners bill even on a public repo. If
either changes, restore the budget framing; until then, do not reason about CI as if it were
metered.

### The rules that survive, and what actually justifies them

Most of the old rules were right for the wrong reason. A CI run costs no money and still costs
twenty minutes of somebody's attention and a main branch that may be broken while they wait.

1. **Verify locally, then push.** Unchanged, and it was never really about minutes: a red run is
   twenty minutes of *your* wall clock before you learn anything, and everything except the
   Windows-only targets runs on this machine — see [Local verification](#local-verification).
2. **Batch your commits.** Commit locally as often as you like. Push when the change is *finished
   and locally green*. One push per completed change keeps the run history a record of changes
   rather than of keystrokes.
3. **Do not iterate against the runner.** `concurrency: cancel-in-progress` is set, so a second
   push kills the first run mid-flight. Pushing three speculative fixes does not get you three
   answers — it gets you one, twenty minutes later, and you will not know which fix produced it.
4. **Use `[skip ci]` for changes that cannot affect the build.** Markdown and docs, comments,
   `.gitignore`, `LICENSE`, review notes. Not a saving any more — a signal-to-noise one. A run
   history where every entry means something is a history somebody reads.

   ```
   git commit -m "docs: correct the export gate ordering [skip ci]"
   ```

   GitHub honours `[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]` and `[actions skip]` on
   `push` and `pull_request` events. What counts is the **head commit of the push** — so if you are
   pushing several commits, the marker must be on the last one. Never put it on the final commit of
   a change that does need verifying; a skipped run on real code is worse than no run, because it
   looks green.
5. **When CI is red, reproduce it locally before pushing a fix.** Read the job log, make the
   failure happen here, fix everything you can see, then push once. You may now push a second time
   without it costing anything, which is exactly why the discipline has to come from somewhere
   else: a fix you have not reproduced is a guess, and guessing at twenty minutes a turn is slow
   however free it is.
6. **Do not widen CI without asking.** Kept, with a different justification — not cost, but that
   the shape of the project's automation is the owner's call, and every job added is time on
   every future PR. No new workflow, no extra job, no build matrix, no `schedule:` trigger, no
   `push:` on all branches, no self-hosted anything. Propose it and wait.

Dropped outright: the old rules 3 and 4 (never push WIP to a branch with an open PR; open the PR
last). Both existed only to avoid paying for runs. Push work in progress and open a draft PR
whenever it is useful — a draft still runs CI in full, and that is now a feature.

**Do check the premise if something feels off.** `visibility` on the repo API and
`billable.*.total_ms` on a run's timing endpoint are the two facts this section rests on. They take
a moment to look up and they beat inheriting an assumption, which is the whole lesson of this
section.

### What actually needs CI

Less than this file used to claim, and the difference matters — "it needs Windows" was doing a lot
of work here as an excuse not to check anything at all off it.

**Only two things genuinely need the runner:**

1. **The final link of the app, player and plugin targets.** One library: `dwmapi`. That is the
   whole of it.
2. **MSVC's opinion of the source.** Not a formality — commit `ba41774` fixed a `C3861` that both
   GCC and Clang accept, caused by a function sitting behind the wrong `#if`. A clean local
   compile is a strong check and is not a substitute for this.

**Everything else builds here**, and did all along:

- All thirty translation units of the `CEditor` target, `Main.cpp` included, with the real app
  defines (`JUCE_WEB_BROWSER=1`, `JUCE_USE_WIN_WEBVIEW2=1`). WebView2LoaderStatic.lib even goes
  through the linker without complaint.
- `juceaide` and the generated binary data. The vendored `.exe` runs under Wine and bakes
  `BinaryData.h` correctly. See [the app target off Windows](#the-app-target-off-windows).

So a change to `CE/src/**` that never gets compiled locally is a choice, not a limitation. Compile
it first; the run then confirms the two things above rather than telling you something a local
build would have told you twenty minutes sooner.

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

### C++ *on* Windows: use a Developer shell, or you will get MinGW

The `native` preset asks for Ninja, and Ninja asks CMake for a compiler, and CMake takes the first
one on `PATH`. `cl.exe` is only on `PATH` inside a Visual Studio Developer shell. So in a plain
PowerShell the configure quietly picks up whatever MinGW happens to be installed, succeeds, and the
mistake surfaces hundreds of lines into the build as `#error "MinGW is not supported."` from
`juce_TargetPlatform.h` — under a pile of consequences (a `(4 == 8)` static assert, an undersized
`CRITICAL_SECTION`, undeclared `memset`/`strlen`/`__cpuid`, a sol2 template error) that all look
like repo bugs and are not.

`CMakeLists.txt` now stops at configure time with that explanation, but the fix is the same either
way. Delete the cache first — it has the compiler pinned:

```powershell
Remove-Item -Recurse -Force build/native
```

then either open **x64 Native Tools Command Prompt for VS 2022** (or run `Launch-VsDevShell.ps1
-Arch amd64`) and configure there, or stay put and name the generator:

```powershell
cmake -S . -B build/native -G "Visual Studio 17 2022" -A x64 -DCEDITOR_SCRIPTING=ON -DCEDITOR_DEV_MODE=OFF
```

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

**Install them and you get eleven of eleven** — there is no permanent gap here, both targets build
and pass on Linux:

```bash
apt-get install -y libasound2-dev libxrandr-dev libxinerama-dev libxcursor-dev libxcomposite-dev
```

`CEditorPanelParametersTests` needs that whole X11 set, not just `libxrandr-dev` as the table says.

**Install the packages BEFORE you configure.** This is the trap, and it will cost you an hour.
JUCE resolves `juce_audio_devices`' ALSA dependency through pkg-config *at configure time*
(`linuxPackages: alsa` in the module header, consumed by `JUCEModuleSupport.cmake:640-646`).
Install `libasound2-dev` into a build tree that was already configured without it and CMake will
not notice — it does not re-run because a system package appeared — so the pkgconfig target is
never created, and the target then compiles and fails to *link* with a page of
`undefined reference to 'snd_pcm_open'`. That reads exactly like a missing `target_link_libraries`
in this file, and is not: it is a stale configure. `rm -rf` the build directory and configure again.

If you genuinely cannot install them, exclude the two by name and know what you gave up:

```bash
ctest --test-dir build/native -C Release --output-on-failure -E "DeviceProfileEngine|PanelParameters"
```

That leaves the device-profile engine and the panel-parameter model unverified. If your change
touches `CE/src/DeviceProfile/` or panel parameters, that is a real gap — say so rather than
reporting a green run.

### The app target off Windows

The app, player and plugin targets compile here. Only the link fails, on `dwmapi`. Do this before
spending a CI run on anything under `CE/src/**`:

```bash
apt-get install -y wine libgtk-3-dev libwebkit2gtk-4.1-dev libcurl4-openssl-dev \
                   libasound2-dev libxrandr-dev libxinerama-dev libxcursor-dev libxcomposite-dev

# juceaide is vendored as a Windows .exe and there is no source to build a native one from.
# It runs under Wine, so wrap it. The wrappers keep the .exe names: JUCEConfig.cmake hardcodes
# that suffix, and nothing requires the file behind it to be a Windows binary.
mkdir -p /tmp/juce-wine && export WINEPREFIX=/tmp/juce-wine/prefix WINEDEBUG=-all
for h in juceaide juce_lv2_helper juce_vst3_helper; do
  printf '#!/bin/sh\nexport WINEDEBUG=-all WINEPREFIX=/tmp/juce-wine/prefix\nexec wine %s "$@"\n' \
    "$PWD/JUCE/bin/JUCE-8.0.7/$h.exe" > /tmp/juce-wine/$h.exe
  chmod +x /tmp/juce-wine/$h.exe
done

cmake -B build/app -G Ninja -DCMAKE_BUILD_TYPE=Release -DCEDITOR_BUILD_APP=ON \
      -DCEDITOR_JUCE_HELPER_DIR=/tmp/juce-wine \
      -DCMAKE_CXX_FLAGS="$(pkg-config --cflags gtk+-3.0 webkit2gtk-4.1)"
cmake --build build/app --target CEditor -- -k 0
```

Expected result: **every translation unit compiles**, then `/usr/bin/ld: cannot find -ldwmapi` and
nothing else. That line is success — it means the whole app is semantically clean under the real
app defines. Anything above it is a genuine error you have just saved a Windows run on.

For a single file, `-fsyntax-only` is faster than standing the whole thing up, and catches the same
class of mistake:

```bash
g++ -fsyntax-only -std=gnu++23 -I CE/src -I JUCE/include/JUCE-8.0.7/modules \
    -I /usr/include/freetype2 -I /usr/include/libpng16 \
    -DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1 -DJUCE_WEB_BROWSER=1 -DJUCE_USE_CURL=0 \
    -DJUCE_STANDALONE_APPLICATION=1 -DLINUX=1 -DNDEBUG=1 \
    $(for m in core audio_basics audio_devices midi_ci data_structures events graphics \
               gui_basics gui_extra; do printf -- '-DJUCE_MODULE_AVAILABLE_juce_%s=1 ' $m; done) \
    CE/src/ValueTreeBridgeHandlers.cpp
```

Two things this does **not** cover, and you should say so rather than claim a clean build:
`#if JUCE_WINDOWS` branches are not compiled, and GCC is not MSVC.

### Matching CI's configure

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
