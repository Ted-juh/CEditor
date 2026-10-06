# CTRL49 + HoSTage — handoff

Branch: `ccr-afa36ff6-0e0ifw`, draft **PR #28** into `main`. Everything below is pushed. Start by
reading this file, then `CLAUDE.md`, then `tools/ctrl49/README.md` and
`tools/ctrl49/hardware-checklist.md`.

Paste the section [Prompt for Claude Code](#prompt-for-claude-code) to start the next session.

---

## Where things stand (2026-10-06)

- **PR #28** is a draft, mergeable. Last green CI under MSVC: run 322 at `79d09db`. Run 323 at
  `234df3e` (the script-size test) was building when this was written; check it first.
- **The owner's local work is merged in** (`5d77495`): eight commits that sat on their local `main`
  unpushed (the security pass, the animation tab's sequence timeline) and their Machined Metal and
  design-preset work in progress. They were backed up to `local-work-2026-10-05` first; that
  branch is now fully contained in this one. The owner's local `main` is still 8 commits ahead of
  `origin/main` with those same commits: once PR #28 merges, their local `main` should be reset to
  `origin/main`.
- **The owner's PC is in sync** with this branch: they pulled, built under MSVC, ran the web tests,
  the full build and CTest (all passed), and ran Machined Metal on the CTRL49 through the merged
  preset mode (works).
- **Two hardware tests are waiting for the owner** (they are away from the PC). Both are in the
  hardware checklist:
  1. **Script size** (section 3): `Ctrl49ScreenLab size`, one command, runs by itself.
  2. **HoSTage's five pages on the keyboard** (section 1): Cue, Layers, Soundcheck, Discover,
     Changes.

---

## What is on the branch

**Five real HoSTage pages on the CTRL49** — CUE, LAYERS, SOUNDCHECK, DISCOVER, CHANGES. Each is
off until switched on in the app (File > Hostage..., Controller tab, CTRL49 card at the bottom:
switches Cue, Layers, Soundcheck, Discover, Changes), then follows the performance page in that
order. Each is one Lua call with one payload.

| Where | What |
|---|---|
| `CE/src/ControlSurface/Ctrl49StagePages.{h,cpp}` | the payload builders; byte goldens shared with JS |
| `CE/src/ControlSurface/Ctrl49SurfaceBroker.{h,cpp}` | page order, cursors, encoder/pad handling, pad lights |
| `CE/src/InstrumentHost/InstrumentHostService.{h,cpp}` | the service commands (`cueOnSurface` etc.), surfacePages state, load-time measuring |
| `tools/ctrl49/Hostage_MultiKnob.lua` | the page script the keyboard runs (40.6 KB; was 9 KB on `main`) |
| `CE/web/src/CE_Application/screen/ctrl49Payloads.js` | the same payloads in JS, and readers |
| `CE/web/src/CE_Application/sections/Ctrl49ScreenCard.svelte` | the app's CTRL49 card and its switches |
| `CE/web/src/ctrl49Preview/` | the browser preview (`npm run dev`, `/ctrl49.html`), a scene per page |
| `CE/tests/InstrumentHostServiceTests.cpp` | `testCtrl49StagePages`, `testCtrl49Discover`, `testCtrl49Cue`, `testCtrl49Changes`, broker-over-fake-cable checks |

**The screen lab** (`Ctrl49ScreenLab.exe`, Windows only; `CE/src/ControlSurface/Ctrl49ScreenLab.cpp`):

- `showcase` / `stress <tools\ctrl49\screen-lab>` — the showcase pages and the Stress page.
- `preset <name.ctrl49preset> [--check]` — runs a design. One loader,
  `Ctrl49ScreenLabPreset.h`, pure std and tested over all 18 committed designs (era-presets,
  feature-mockups, design-presets, machined-metal). Rules: Lua 1-65536 bytes, 1-8 PNGs, ids
  512-1023, at most 8192 px a side, 8 MiB decoded; `envelopePage=-1` means none.
- `size` — new, untested on the keyboard: pages of real code from 64 KB, doubling until refused or
  2048 KB passes, then the gap halved three times; judged by the keyboard's own answers
  (`buildSizeProbe`, `SizeSweep` in `Ctrl49ScreenLab.h`).
- Every mode prints what the keyboard refuses ("The keyboard refused ...").

Designs: `tools/ctrl49/screen-lab/era-presets` (ten), `feature-mockups` (Features and Rig, slim and
full), `design-presets` (three of the owner's), `machined-metal` (the owner's, confirmed on the
keyboard).

---

## Measured on the CTRL49 (2026-10-05)

Recorded in `tools/ctrl49/README.md` ("Still requires hardware"):

| | Result |
|---|---|
| Stress page, one kind of call at 9 redraws/s | stutters at ~880 rects, ~504 sprites, 124+ texts a redraw (~7,900 / 4,500 / 1,100 a second) |
| Redraw rate, empty page | smooth at 30/s |
| Full-screen blits | 7 a redraw smooth |
| Image memory | 8 × 1 MB decoded with no refusal; `mem_usage(0)` 12,263,424 → 20,783,104 |
| Four mockup builds + Red Lead 1997 | all loaded and smooth, every call answered ok: 58 KB script, 4.5 MB decoded images, ~420 mixed calls a redraw at 15/s |
| Upload and startup | 2.8-4.6 s |

HoSTage's own pages, counted in the preview: knob pages ~27 calls a redraw, Cue 26, Soundcheck 40,
Changes 56 (32 text), Discover 113 (34 text), Layers 131 (mostly rects), at 10 redraws/s. Text is
the tightest budget (about a third of the limit on Discover and Changes); everything else has 5×
or more headroom.

**Open:** the Stress page's memory swatches never drew on the keyboard, in three builds (RGB
blocks; RGBA from eight uploads drawn in the decoding redraw; RGBA from one upload decoded last
and drawn a second later), although `mem_usage(0)` shows the blocks decoded. Real designs draw
their images fine. What still differs is the image itself (256 × 1024 of flat colour bands,
deflating 430:1). **Find it without the keyboard before asking the owner to run that page
again**; they ran it five times.

---

## What is next

1. Check CI run 323 on `234df3e`; if red, reproduce locally first (`CLAUDE.md`, rule 5).
2. When the owner is back: the script-size test, then the HoSTage pages test (exact steps below).
3. After the size test: record the limit in `tools/ctrl49/README.md` and the checklist, and decide
   whether the preset rule's 64 KB Lua cap (`kPresetMaxLuaBytes` in `Ctrl49ScreenLabPreset.h`, and
   the same rule in `CE/web/browser-checks/ctrl49EraPresets.mjs`) should follow the keyboard's
   real limit.
4. After the pages test: fix what it finds; then the PR can leave draft.
5. Ideas with the headroom measured: images on HoSTage's pages (knob filmstrips, panels, as
   Machined Metal does) and 15 redraws/s for meters. Keep text counts down.
6. **Panel scan** (`docs/design/ctrl49-panel-scan.md`, `Ctrl49PanelScan.exe`): a plug-in's own
   sections as keyboard pages, the section cut from its GUI with overlays on its controls. The
   scan tool is built and its self-test passes under Wine; the owner runs it on their own
   plug-ins (steps below) and judges `scan.png` and `pages\*.png`. Next after that: a Lua page
   that shows one section (background image + overlays), and HoSTage keeping the scan per class
   id, inside the worker process.
7. **HoSTage Live mockups** (`screen-lab/feature-mockups/hostage-live`, README there): Live (the
   keys and the arp's step lane), Section (the panel scan's page, with the plug-in's frozen
   pointer shown on purpose), Labels (every word a picture: no firmware text) and Meters.
   Software-checked; on the keyboard via `Start_CTRL49_Feature_Mockups.cmd`, choice 5
   (hardware checklist section 4). The owner picks which become real pages.

### The owner's steps for the tests (give them exactly like this)

**Script size:**
1. Close CEditor/HoSTage, VIP and your DAW.
2. Switch the CTRL49 off and on (unplug USB, 10 seconds, plug in, wait for its normal screen).
3. In the VS 2022 prompt, in your CEditor folder: `git pull`
4. `cmake --build --preset native-release --target Ctrl49ScreenLab`
5. `build\native\Release\Ctrl49ScreenLab.exe size > %TEMP%\size-log.txt 2>&1` — wait until the
   prompt comes back (a few minutes); don't touch the keyboard.
6. `notepad %TEMP%\size-log.txt`, Ctrl+A, Ctrl+C, paste it. The last line is the answer.
7. If the keyboard's normal screen does not come back, switch it off and on.

**HoSTage pages:** needs a setlist with a few songs (one with sections), two parts with
different key ranges, five or more library sounds played, and a library sound saved then
changed. Start `build\native\CEditor_artefacts\Release\CEditor.exe`, File > Hostage...,
Controller tab, then for each page: switch it on on the card, Page Right/Left to it on the
keyboard, and check what `tools/ctrl49/hardware-checklist.md` section 1 lists. Ask for, per page:
looked right, smooth, anything cut off; and any red "The keyboard refused" line, copied exactly.

**Panel scan** (no keyboard needed; close nothing):
1. In the VS 2022 prompt, in your CEditor folder: `git pull`
2. `cmake --build --preset native-release --target Ctrl49PanelScan`
3. `build\native\Release\Ctrl49PanelScan.exe selftest > %TEMP%\panelscan-selftest.txt 2>&1` — a
   window with knobs and a moving green wave opens for about 15 seconds; do not cover or move it.
   Wait until the prompt comes back.
4. `build\native\Release\Ctrl49PanelScan.exe list > %TEMP%\panelscan-list.txt 2>&1`, then
   `notepad %TEMP%\panelscan-list.txt`, and pick three plug-ins (their numbers).
5. `build\native\Release\Ctrl49PanelScan.exe scan <n1> <n2> <n3> > %TEMP%\panelscan-scan.txt 2>&1`
   — each plug-in's window opens in turn, up to 5 minutes each; do not cover or move it, and
   leave the mouse alone. Wait until the prompt comes back.
6. `explorer %TEMP%\ctrl49-panel-scan`: per plug-in, open `scan.png` and the `pages` folder.
7. Paste `notepad %TEMP%\panelscan-selftest.txt` and `notepad %TEMP%\ctrl49-panel-scan\summary.txt`,
   and say per plug-in: do the boxes sit on the right controls, are the sections the plug-in's own.

---

## Working with the owner

This matters as much as the code. From this conversation:

- **Exact, complete, ordered steps.** Every check goes in the list at its place (a `git status`
  before a switch is step 4, not a remark after the list). Never add "but first ..." afterwards.
  They said so plainly and were right.
- **Name physical things.** "Knob 1" is the leftmost of the CTRL49's eight round knobs in a row
  (the ones VIP uses for its eight on-screen parameters); not the sliders, not the big dial (it
  changes whichever knob was turned last), not the wheels. "Page Left / Right" are the buttons
  they used for Machined Metal. Say what they will see, where on the screen, and how many clicks
  before anything changes (the Stress page's knobs 4 and 5 need 16 clicks a step).
- **Logs into a file.** Run tools with `> %TEMP%\name.txt 2>&1` and have them paste from Notepad;
  copying from the console was unclear.
- **Do not make them repeat a hardware run that has failed.** Fix it offline, or drop it and say
  what was learned anyway.
- They work on Windows, in the **x64 Native Tools Command Prompt for VS 2022**, on branch
  `ccr-afa36ff6-0e0ifw`. They have run what CI runs (`npm test` and `npm run test:script-exports`
  in `CE/web`, `cmake --build --preset native-release`, `ctest`) and can again.
- Short answers. Tables for results. No "I apologise" paragraphs; fix and say what changed.

---

## Verifying here (Linux)

`CLAUDE.md` has the full set. What this work used:

```bash
cmake --preset native -DCEDITOR_SCRIPTING=ON -DCEDITOR_DEV_MODE=OFF   # ALSA/X11 dev packages first
cmake --build --preset native-release -- -k 0
ctest --test-dir build/native -C Release --output-on-failure            # 38 tests
build/native/Release/CEditorCtrl49ScreenLabTests                         # the lab, presets, size probe

cd CE/web && npm ci && npm test && npm run build && npm run lint
node browser-checks/ctrl49Screen.mjs        # every HoSTage page in the preview and the app's card
node browser-checks/ctrl49ScreenLab.mjs     # showcase, stress (swatch colours), design presets, Machined Metal
node browser-checks/ctrl49EraPresets.mjs    # era designs and feature mockups, manifest rules

# The Windows-only lab tool: syntax, or a full link
x86_64-w64-mingw32-g++-posix -fsyntax-only -Wall -Wextra -std=gnu++23 -municode \
  -I CE/src -I CE/src/ControlSurface CE/src/ControlSurface/Ctrl49ScreenLab.cpp
build/native/_deps/lua-build/Release/luac -p <script.lua>               # Lua syntax

# The panel scan, end to end under Wine (apt: g++-mingw-w64-x86-64-posix wine64; Xvfb running)
SDK=JUCE/include/JUCE-8.0.7/modules/juce_audio_processors/format_types/VST3_SDK
x86_64-w64-mingw32-g++-posix -std=gnu++23 -municode -I CE/src -I $SDK -static \
  CE/src/ControlSurface/Ctrl49PanelScan.cpp -o out/Ctrl49PanelScan.exe -lole32 -lgdi32 -luser32
x86_64-w64-mingw32-g++-posix -std=gnu++23 -shared -I CE/src -I $SDK -static \
  CE/src/ControlSurface/Ctrl49PanelScanFixture.cpp -o out/Ctrl49PanelScanFixture.vst3 -lgdi32 -luser32
DISPLAY=:97 wine out/Ctrl49PanelScan.exe selftest    # 16 PASS; Wine captures from the screen
```

`security.mjs` needs `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` here, and
`animationTab.mjs` needs `npm run test:browser`'s scenery build first. `pluginPresets.mjs` writes a
screenshot to `C:/tmp/...`, which on Linux becomes a folder named `C:` in `CE/web`: delete it, do
not commit it.

Commits: the repo's voice (`git log`), trailer `Co-authored-by: Claude <noreply@anthropic.com>`,
no model names; `[skip ci]` on documentation-only pushes; push with
`git push -u origin ccr-afa36ff6-0e0ifw`.

---

## Prompt for Claude Code

> Continue the CTRL49 / HoSTage work on branch `ccr-afa36ff6-0e0ifw` of Ted-juh/CEditor (draft PR
> #28). Read `docs/design/ctrl49-hostage-handoff.md` first, then `CLAUDE.md`. Check PR #28's CI on
> its latest code commit and act on it; subscribe to the PR's activity. The owner has two tests to
> run on the CTRL49 (the script-size test and HoSTage's five pages); when they bring results,
> record them as the handoff says, and fix what they find. Follow "Working with the owner" in the
> handoff to the letter: exact, complete, ordered steps, physical controls named, logs into a file.
