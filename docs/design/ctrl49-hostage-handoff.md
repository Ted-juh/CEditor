# CTRL49 + HoSTage — handoff

Branch: `ccr-afa36ff6-0e0ifw`, draft **PR #28** into `main`. Everything below is pushed. Start by
reading this file, then `CLAUDE.md`, then `tools/ctrl49/README.md` and
`tools/ctrl49/hardware-checklist.md`.

Paste the section [Prompt for Claude Code](#prompt-for-claude-code) to start the next session.

---

## Where things stand (2026-10-06, evening)

- **PR #28** is a draft. Last commit `e348a5c`; the previous one (`a2e6d5a`) was green under MSVC.
- **The owner's local work is merged in** (`5d77495`). Their local `main` is still 8 commits ahead
  of `origin/main` with those same commits: once PR #28 merges, reset it to `origin/main`.
- **Nothing since the owner last pulled has been on the keyboard.** Everything below runs in
  software only (C++ tests over a fake keyboard cable, the Lua pages in a firmware stand-in, the
  browser previews). The owner cannot test on hardware right now; every check waits in
  `tools/ctrl49/hardware-checklist.md`, sections 1-8.
- **The owner's decisions (2026-10-06):** the four HoSTage Live mockups become real pages where
  they suit HoSTage; Section paints over the plug-in's knob cap; do what can be done without the
  keyboard. Done: LIVE and METERS are real, Section's cap painting is in the mockup and the scan.
  Section and Labels wait on hardware results (below).

### Done in the last session, newest first

| Commit | What |
|---|---|
| `e348a5c` | `Ctrl49Session::uploadPng` (a PNG to a running page) and `Ctrl49ScreenLab upload`, the probe Section and Labels wait on (checklist §8) |
| `5a2c0b9` | LIVE and METERS as real HoSTage pages (switches on the CTRL49 card); `ArpEngine::takeNotes` for the arp's notes |
| `3a1e3c8` | The stress page decodes a flat and a textured 1 MB block, early and late, so one run says why its swatches never drew (checklist §7) |
| `c4e0abd` | The sound browser on the keyboard: no more 127/0 under the knobs; the sound under the cursor in the bottom strip |
| `958bdce` | Section mockup paints over each knob's cap; the panel scan records each knob's `cap` and `pointer` colour |
| `e628051` | The page script is uploaded without comments or indentation (`Ctrl49LuaStrip.h`): 62 KB in the repo, 42 KB sent |
| `a2e6d5a` | Knob pages: the plug-in's own values, symbols for the ASCII marks, empty knobs, a bottom strip, easing |
| `7ed6c18` | Smooth envelope curves (anti-aliased line pieces) in the designs |
| `b6703ff` | HoSTage Live mockups: Live, Section, Labels, Meters |
| `8ed03e3` | The panel scan tool (`Ctrl49PanelScan.exe`) |

---

## What is on the branch

**Seven real HoSTage pages on the CTRL49** — CUE, LIVE, LAYERS, METERS, SOUNDCHECK, DISCOVER,
CHANGES. Each is off until switched on in the app (File > Hostage..., Controller tab, CTRL49 card
at the bottom: switches Cue, Live, Layers, Meters, Soundcheck, Discover, Changes), then follows the
performance page in that order. Each is one Lua call with one payload.

| Where | What |
|---|---|
| `CE/src/ControlSurface/Ctrl49StagePages.{h,cpp}` | the payload builders; byte goldens shared with JS |
| `CE/src/ControlSurface/Ctrl49SurfaceBroker.{h,cpp}` | page order, cursors, encoder/pad handling, pad lights |
| `CE/src/InstrumentHost/InstrumentHostService.{h,cpp}` | the service commands (`cueOnSurface` etc.), surfacePages state, load-time measuring |
| `tools/ctrl49/Hostage_MultiKnob.lua` | the page script the keyboard runs (62 KB, uploaded stripped as 42 KB by `Ctrl49LuaStrip.h`; was 9 KB on `main`) |
| `CE/web/src/CE_Application/screen/ctrl49Payloads.js` | the same payloads in JS, and readers |
| `CE/web/src/CE_Application/sections/Ctrl49ScreenCard.svelte` | the app's CTRL49 card and its switches |
| `CE/web/src/ctrl49Preview/` | the browser preview (`npm run dev`, `/ctrl49.html`), a scene per page |
| `CE/tests/InstrumentHostServiceTests.cpp` | `testCtrl49StagePages`, `testCtrl49Live`, `testCtrl49Meters`, `testCtrl49Discover`, `testCtrl49Cue`, `testCtrl49Changes`, broker-over-fake-cable checks |

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

**Open:** the Stress page's memory swatches never drew on the keyboard in three builds, although
`mem_usage(0)` showed the blocks decoded. Offline since: the PNG is valid (lodepng, stb_image and
miniz streaming all read it exactly); what it shares with no image that draws is its build (430:1,
19 literal codes) and that every build decoded late, where every page that draws decodes in its
first redraws. The page now tests both in one run (checklist §7). Do not change it again before
that run.

---

## What is next

1. **Wait for the owner's hardware results**; do not ask them to rerun anything that failed
   before. The order to give them (each section of the checklist has its exact steps):
   1. §3 script size (`Ctrl49ScreenLab size`).
   2. §1 HoSTage's pages on the keyboard (Cue, Layers, Soundcheck, Discover, Changes).
   3. §6 the knob pages, the browser, LIVE and METERS.
   4. §7 the stress page's blocks (which of EARLY/LATE, F/T show).
   5. §8 the upload probe (does a picture sent while a page runs draw; how fast).
   6. §4 and §5 the mockups and the smooth envelope, when they like.
   7. The panel scan on three of their plug-ins (steps below; no keyboard needed).
2. **With §3:** record the script limit in `tools/ctrl49/README.md` and the checklist; decide
   whether the preset rule's 64 KB Lua cap (`kPresetMaxLuaBytes` in `Ctrl49ScreenLabPreset.h`, and
   `CE/web/browser-checks/ctrl49EraPresets.mjs`) should follow it.
3. **With §1 and §6:** fix what they find; then the PR can leave draft.
4. **With §7:** if EARLY T draws and EARLY F not, it was the image: make the stress block textured
   and the memory test works as meant. If only EARLY draws: decoding late is the problem, which
   matters for Section and Labels (see 5). Record it in the README's "Why the blocks did not draw".
5. **With §8 and the panel scan:** if late uploads draw, build **SECTION** (the scan inside the
   plug-in worker, which already opens editors; results kept per plug-in class id in the library;
   the section's picture uploaded with `uploadPng` when its part comes up; the page as the
   HoSTage Live mockup's Section page, cap painted over in the scanned colours) and **LABELS**
   (words rendered in JUCE with the app's Barlow font as grey-palette PNGs, uploaded when the set
   changes). If late uploads do not draw, say so and put them in the startup upload instead.
6. Ideas with the measured headroom: images on HoSTage's pages (knob filmstrips, panels, as
   Machined Metal does), 15 redraws/s for METERS. Keep text counts down: text is the tight budget.

**How the new pages work** (details in `tools/ctrl49/README.md`, "The stage pages"):

- **LIVE** (`set_live`, page kind 9): the rack's focused part's arp lane (16 steps from
  `ArpSettings`), every part's zone over 49 keys, held keys, the arp's notes
  (`ArpEngine::takeNotes`, lock-free bits set on the audio thread, read via
  `MidiInsertRack::arpNotes` / `InstrumentRackHost::arpLiveNotes`), playhead from `patternStep`.
  E1 step, E2-E5 velocity/octave/ratchet/chance, E6 gate, E7 rate, E8 mode (off before UP), pads
  toggle steps. Edits go through `setPartArp`. Broker: `livePart`, `applyLiveTurns`.
- **METERS** (`set_meters`, page kind 8): five part strips + master; levels from the rack's own
  meters (the pump keeps the loudest per id between redraws: `takeSurfaceMeters`); faders through
  `setPartMixer` / `setMasterLevel`, half a dB a detent (`metersNudgeVolume`); E7 scrolls parts.
- **Browser** (`set_values` kind 7, `buildBrowseStatePayload`): no numbers on rings, no easing,
  the current sound's name and detail in the strip.
- Page order after Performance: CUE, LIVE, LAYERS, METERS, SOUNDCHECK, DISCOVER, CHANGES, browser.

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

**Knob pages, browser, LIVE, METERS, stress blocks, upload probe:** give the steps of
checklist §6, §7 and §8 exactly as written there (they already follow "Working with the owner").
Before any of them: `git pull`, then
`cmake --build --preset native-release --target CEditor Ctrl49ScreenLab` in the VS 2022 prompt.

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
ctest --test-dir build/native -C Release --output-on-failure            # every test
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
> #28). Read `docs/design/ctrl49-hostage-handoff.md` first, then `CLAUDE.md`,
> `tools/ctrl49/README.md` and `tools/ctrl49/hardware-checklist.md`. Nothing from the last session
> has been on the CTRL49 yet: the owner will bring results from the checklist's sections 1-8 and
> the panel scan. Record each result where the handoff's "What is next" says, fix what they find,
> and build SECTION and LABELS only once the upload probe (§8) and the panel scan say they can
> work. Follow "Working with the owner" to the letter: exact, complete, ordered steps, physical
> controls named, logs into a file, never ask for a failed hardware run again. Go straight to
> implementation rather than long design discussion.
