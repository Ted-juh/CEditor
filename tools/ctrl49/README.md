# CTRL49 control-surface tools

Probe tooling and assets for the CTRL49 screen integration. Design record:
[`docs/design/screen-builder-design.md`](../../docs/design/screen-builder-design.md). Byte-level
protocol ground truth is the external reverse-engineering handoff.

## The HoSTage screen, without the keyboard

`Hostage_MultiKnob.lua` is the page HoSTage uploads to the keyboard (embedded by
`embed_assets.cmake`). To see it without the keyboard:

```bash
cd CE/web
npm run dev            # then open http://localhost:5173/ctrl49.html
```

The preview runs **this file**, not a copy, in wasmoon against the firmware draw-API shim, fed
with payloads built the way the C++ builds them (`CE/web/src/CE_Application/screen/ctrl49Payloads.js`).
Save the `.lua` and the screen redraws, keeping what you typed. The scenes are the pages the
broker drives: splash (mode 0), control page, performance, browser. **Custom calls** takes any
call list (`set_values 1 64 0x7f`, `set_labels s"TITLE" s"one"`) so a new mode can be drawn
before any C++ exists for it. The bytes of every call are listed under the screen.

Adding a new kind of page:

1. Draw it in `Hostage_MultiKnob.lua` (a new `mode`, and whatever `set_*` calls it needs),
   and iterate on it in **Custom calls**.
2. Write its payload builder in C++ beside `Ctrl49RackDisplay` / `Ctrl49PerformanceDisplay`,
   with a byte test, and the same builder in `ctrl49Payloads.js` with a scene in the preview.
3. Give it a page in `Ctrl49SurfaceBroker`: `pages()`, `pumpInput()`, `refreshDisplay()`.

Checks: `node --test test/ctrl49Preview.test.js` (payload bytes, and that every function the
broker calls exists in the page) and `node browser-checks/ctrl49Screen.mjs` (every scene runs
the real page and draws; `CTRL49_SCREENSHOT=dir/` saves a PNG per scene).

What the preview cannot tell you: the device's fonts (9/10 are approximated), colour depth, RAM
for uploaded images, and redraw rate. Those need the keyboard.

## The product exe: Ctrl49Bridge (start here)

**`build/native/Debug/Ctrl49Bridge.exe`** is the self-contained bridge — every asset (the
merged display page, filmstrip, default GAIA assignment, preset bank, GAIA profile) is
embedded in the binary. No arguments, no files beside it, no CMD wrappers. Double-click it
and **both surfaces are live at once, switched from the keyboard's own mode buttons**:

- **MAIN button → knobs**: eight filmstrip knobs bound to GAIA filter/amp parameters, two
  pages (Page Left/Right).
- **BROWSER button → presets**: the patch list — data dial (or cursor keys) scrolls,
  pressing the dial loads the patch on the synth. Page L/R jumps by a screenful.
- If the synth port isn't found it lists the available ports and asks.
- **`--presets`** starts in the browser instead of the knobs.
- **`--selftest`**: verifies embedded assets, the merged page's entry points, and that
  every default binding compiles (in ctest as `Ctrl49BridgeSelfTest`).
- Optional overrides: `Ctrl49Bridge.exe my-rig.assignment.json "PORT"` replaces the knobs
  assignment; `Ctrl49Bridge.exe my-bank.presetbank.json "PORT"` replaces the preset bank
  (recognised by the `presetbank` in its name). The other stays embedded.

Connect the CTRL49, close VIP / your DAW, run. Ctrl+C (or closing the window) stops
cleanly; the keyboard's watchdog restores its normal screen. When double-clicked, the
window pauses before closing so messages stay readable.

The per-phase `Ctrl49*Test.exe` tools and their `Start_*.cmd` launchers below remain as
development harnesses for testing one layer in isolation; the bridge is what you actually
run.

---

These are **Phase-3 probes**, not the production path. In the shipped feature, filmstrips
are generated from CEditor's own renderer at bundle-compile time; this standalone Python
generator exists to answer the "will it look good / how big is it" questions before the
compiler is built.

## Filmstrip generator

```bash
python make_filmstrip.py knob_strip.png            # 64px frames, 128 frames, ~19 KB
python make_filmstrip.py big.png --frame 96 --frames 128
```

Produces a vertically stacked RGBA PNG: frame N is the arc knob swept to value N,
white-on-transparent so the device tints it per state at draw time (the VIP
`rotary_page.lua` technique). Pure standard library — no Pillow.

Finding: a 64px / 128-frame strip is **~19 KB**, squarely in VIP's proven arc-asset size
range (~13 KB). Consecutive frames are nearly identical, so PNG compresses them hard.

## On-hardware knob beauty test

`CEditor_Knob_Test.lua` is a display page that decodes the uploaded filmstrip (PNG object
id `0x0200`) and, on `set_value([0..127])`, crops+tints the matching frame. The
`Ctrl49KnobTest` host uploads both, opens the hidden input, and maps encoder 1 to the
value:

```bash
# built by CMake as a WIN32 target; run from a VS dev prompt with the CTRL49 connected
# and VIP / the DAW closed:
build/native/Debug/Ctrl49KnobTest.exe tools/ctrl49/CEditor_Knob_Test.lua tools/ctrl49/knob_strip.png
```

Turn Encoder 1: the pre-rendered, anti-aliased arc sweeps on the real 480×272 screen.
Ctrl+C restores the stock screen via the watchdog.

## Phase 4: CTRL49 -> real synth

`Ctrl49SynthTest` maps encoder 1 to a real synth parameter through CEditor's DeviceProfile
intent compiler: encoder value -> `compileSetParameter` -> MIDI transaction bytes -> synth
port, with the value shown on the filmstrip knob. The screen stays a pure renderer; the
host owns the value and the profile turns it into the exact bytes the synth expects.

```bash
# double-click launcher (prompts for the synth's MIDI-out port name):
tools/ctrl49/Start_CTRL49_Synth_Test.cmd

# or directly:
Ctrl49SynthTest.exe <profile.json> <knob.lua> <knob_strip.png> <synth-port-name> [paramId]
```

Default profile `CE/profiles/test/roland-gaia.ceditor-device.json`, param `filter.cutoff`
(GAIA, range 0..127, Roland DT1 SysEx). If the port name doesn't match, the tool prints
the available output ports so you can pick the right one. Swap the profile/param for the
SH-201 or AN1x (`roland-sh-201`, `yamaha-an1x-dpd`).

The profile->bytes seam is locked by the `Ctrl49SynthCompile` ctest (no hardware): it
asserts `filter.cutoff = 64` compiles to `F0 41 7F 00 00 41 12 10 00 01 0C 40 23 F7`.

## Phase 5: multi-knob page + assignment model

`Ctrl49MultiTest` drives eight encoders to eight assigned device parameters at once, shown
as eight filmstrip knobs; Page Left/Right switches assignment pages. Bindings come from an
**assignment file** (`gaia-filter-amp.assignment.json`) — the "assignments, not layouts"
model: pages of `{ slot -> { label, param } }` plus the profile and device role.

```bash
tools/ctrl49/Start_CTRL49_Multi_Test.cmd          # prompts for the synth port
# or:
Ctrl49MultiTest.exe <assignment.json> <CEditor_MultiKnob.lua> <knob_strip.png> <synth-port>
```

Encoder e (0..127) scales linearly into each parameter's range for the synth send; the
knob shows the encoder position. Point the assignment's `profile` at `roland-sh-201` or
`yamaha-an1x-dpd` (and edit the params) for the other synths.

The assignment model and every binding are locked by the `Ctrl49Assignment` ctest (no
hardware): it loads the shipped assignment and verifies all 16 bound params across both
pages compile to real synth bytes through the named profile.

First cut / known simplification: the knob value shown is the encoder position 0..127, not
the parameter's native units (fine for the 0..127 params; a later pass adds value-space
display).

## Phase 7: multi-synth "whole rig"

An assignment page can target a **different synth** than the assignment default, via per-page
`profile` / `role` / `port` fields (see `multi-synth-rig.assignment.json`: page 1 GAIA, page 2
SH-201). `Ctrl49MultiTest` loads one engine per distinct profile, opens one output per distinct
port, and routes each page's encoder sends to its own synth — so Page Left/Right walks the rig.

```bash
Ctrl49MultiTest.exe multi-synth-rig.assignment.json CEditor_MultiKnob.lua knob_strip.png <fallback-port>
```

The `<fallback-port>` is used for any page without its own `port`. Locked by the
`Ctrl49MultiSynth` ctest (no hardware): the two pages resolve to different profiles and the
same encoder value 64 compiles to GAIA bytes (`…41 12 10 00 01 0C 40 23…`) on page 1 and SH-201
bytes (`…16 12 10 00 01 13 40 1C…`) on page 2 — different model ids, addresses, device ids.

## Preset browser

`Ctrl49PresetTest` uploads a list page (`CEditor_PresetList.lua`) showing a **preset bank** —
a named list of patches with their Bank Select / Program Change addresses
(`gaia-patches.presetbank.json`). The data dial (and cursor up/down, Page L/R) scroll the
selection; pressing the data dial loads the patch on the synth's MIDI port.

```bash
tools/ctrl49/Start_CTRL49_Preset_Test.cmd            # prompts for a port override
# or:
Ctrl49PresetTest.exe gaia-patches.presetbank.json CEditor_PresetList.lua [synth-port]
```

The bank is authored JSON, so it works for any synth regardless of whether patch names can
be read over SysEx. `buildPresetSelect` (Bank Select MSB/LSB + Program Change) and the
`PresetBrowser` index math are covered by the `Ctrl49Preset` ctest; the bank loader and its
patch->bytes mapping by `Ctrl49PresetBank`.

Follow-up: auto-populating a bank from the synth (reading patch NAMES via SysEx dump request
+ parse) where the profile supports it — SH-201 and AN1x carry `dumpDefinitions` and
`patch.nameCharNN` params; the filter-only GAIA profile does not. And a wasmoon preview of
the list page in the Screen Builder (the device path is proven; VIP's own scripts use the
same `args:sub` + `get_byte` list pattern).

## Screen lab: how far PNGs go, and what the screen can take

`screen-lab/` answers two questions at once. **How far pre-rendered PNGs take the look** beyond
flat rectangles — and **how much the screen can draw** before it stutters or the watchdog gives
up (the open measurements below).

```bash
tools/ctrl49/Start_CTRL49_Screen_Lab.cmd                 # asks: 1 showcase, 2 stress
# or:
Ctrl49ScreenLab.exe showcase tools/ctrl49/screen-lab
Ctrl49ScreenLab.exe stress   tools/ctrl49/screen-lab
```

Close VIP, your DAW and HoSTage / CEditor first: only one program can own the screen.

**Showcase** (`Hostage_Showcase.lua`) — six pages, **Page < >** walks them:

| Page | What it shows | How |
|---|---|---|
| Faders | nine faders, B1–B8, pickup | rectangles + tinted white cap/button shapes; E1–E8 move the faders, and a fader only takes its parameter once it reaches it (the outline is the fader, the cap the value) |
| Pads | the 2×4 pads in their own colours, with layers | one white rounded square tinted per pad; strike a pad to light it |
| Sequencer | 16 glossy steps, velocity bars, playhead | full-colour baked steps; bars cropped from one gradient sprite; E1–E8 set steps 1–8 |
| Envelope | an ADSR with a gradient fill and a glowing curve | 4 px columns cropped from one sprite, glow dots along the curve; E1–E4 = A D S R |
| Meters | two analog VU meters | a baked face + a 48-frame needle filmstrip; E1 = level of a demo signal |
| Animation | a logo with a sweeping sheen, a spinner, a scrolling marquee, sliding preset cards, breathing buttons | flipbooks (frame N of a strip — what a GIF becomes), movement with easing, masking (the strip's ends painted over the text), tint; **E1 sets the redraw rate, 5–30/s** |

The device keeps no time: every animation frame is a redraw the host asks for, and the frame
counter the host sends is the only clock. There is no GIF on the device either, but a GIF is only
frames — `python make_lab_assets.py --gif in.gif out_strip.png [--width 120]` turns one into a
flipbook strip, and prints what it will cost in device memory.

The lab uploads ~290 KB of PNGs, far more than HoSTage does, so it sends a keepalive every 48
upload chunks to keep the watchdog fed during the upload (`keepaliveEveryUploadFrames`; HoSTage's
own startup is unchanged). A third argument, `--no-upload-keepalive`, uploads without them —
if the stock screen comes back during the upload that way and not the other, the upload length
is what the watchdog objects to.

**Stress** (`Hostage_Stress.lua`) — the encoders set the load, per redraw:
E1 rectangles (×16), E2 sprites (×8), E3 text boxes, E4 full-screen image blits (0–7),
E5 1 MB image blocks decoded (0–8, never freed), E6 redraws per second (1–30).
The console prints every load and how long each redraw took to send.

What to watch, and write down:

- **The orange bar under the header** moves 8 px per redraw. Gliding = the screen keeps up.
  Jerky = it does not: note the console's last `Load:` line.
- **The stock screen coming back** = the watchdog gave up; the console prints the last load.
- **The swatches along the bottom** are one per decoded 1 MB block. One that does not appear
  (or the keyboard giving up while E5 rises) is the image-memory ceiling. The knob filmstrip
  (~2 MB) and the VU needle (~4 MB) are the sizes this decides.
- **The envelope and sequencer pages** — whether the gradients band on the panel.
- **The animation page** — the lowest E1 rate at which the motion looks smooth, and whether it
  still keeps up at 30.

Raise one encoder at a time from zero; E6 last.

Everything the tool sends is built in `CE/src/ControlSurface/Ctrl49ScreenLab.h` (tested by the
`Ctrl49ScreenLab` ctest). `npm run test:screen-lab` in `CE/web` renders all six pages in the
editor's draw-API shim from the same bytes (`CTRL49_LAB_SHOTS=<dir>` writes PNGs of them), so a
page can be worked on without the keyboard. `python make_lab_assets.py` rebuilds the PNGs and
rewrites the pages' sprite tables; the PNGs are committed, so running the lab needs no Python.

## Still requires hardware (open Phase-3 measurements)

- **RAM / object budget** — how many/large filmstrips fit in device RAM before upload or
  decode fails. Escalate PNG uploads until the screen stops updating.
- **Redraw-rate budget** — how fast `draw` calls can go before the link stutters (bounds
  smooth meters/animation).
- **Color depth** — whether gradients band on the panel (bake dithering if so).

Each is observed on the physical screen; the tooling above is the starting point.
