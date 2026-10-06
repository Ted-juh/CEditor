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
broker drives: splash (mode 0), control page, performance, browser, layers, soundcheck, discover. **Custom calls** takes any
call list (`set_values 1 64 0x7f`, `set_labels s"TITLE" s"one"`) so a new mode can be drawn
before any C++ exists for it. The bytes of every call are listed under the screen.

Adding a new kind of page:

1. Draw it in `Hostage_MultiKnob.lua` (a new `mode`, and whatever `set_*` calls it needs),
   and iterate on it in **Custom calls**.
2. Write its payload builder in C++ beside `Ctrl49RackDisplay` / `Ctrl49PerformanceDisplay`,
   with a byte test, and the same builder in `ctrl49Payloads.js` with a scene in the preview.
3. Give it a page in `Ctrl49SurfaceBroker`: `pages()`, `pumpInput()`, `refreshDisplay()`.

### The stage pages: CUE, LAYERS, SOUNDCHECK, DISCOVER and CHANGES

Five pages that are not knob pages, mocked up first in `screen-lab/feature-mockups` and now
real: three a player reads on stage, two to go to between songs. Like the browser, none is on the
keyboard until it is asked for — the **Cue**, **Layers**, **Soundcheck**, **Discover** and
**Changes** switches on the app's CTRL49 screen card (`cueOnSurface`, `layersOnSurface`,
`soundcheckOnSurface`, `discoverOnSurface`, `changesOnSurface`) — and then they follow the
performance page in that order. Each is one call with one payload (`set_cue`, `set_layers`,
`set_check`, `set_discover`, `set_changes`; `CE/src/ControlSurface/Ctrl49StagePages.h` has the
byte layouts) where a knob page takes two. CUE is the mockups' Stage page, renamed because "stage
pages" already names this group.

| Page | Shows | Encoders and pads |
| --- | --- | --- |
| CUE | the song on stage, N of M, and its tempo; the section playing with its bar and the bars left (or the song's notes when it has no sections); the song's clock against the time planned, and the set's; what comes next and how much of its rig has preloaded | E1 picks a song, pad 1 goes to it; Shift + Page still steps the set from any page |
| LAYERS | every part's key zone over 49 keys, its velocity range and transpose, muted parts and parts fed by another part; layer groups (`L1 V`: group 1 by velocity) with each member's share and crossfades drawn as LayerRouter weighs them; the notes held now, on the zones that would sound them | E1 picks the part, E2-E6 turn its lowest key, highest key, transpose, lowest and highest velocity |
| SOUNDCHECK | the set: each song ready, with problems, or not checked, its measured level and how long it took to load when last recalled (slow ones marked); the selected song's problems in the check's own words, and whether it loaded preloaded | E1 walks the set, E8 checks it again (once a second at most) |
| DISCOVER | what you own and have never opened, nearest first to what you load (`unplayedLikeHabits`), eight at a time; a map of brightness against attack with YOU (the load-weighted centre) and the sounds you load most; the selected sound's likeness and which of your regulars it is nearest | E1 picks, E2 reaches eight further, E3 keeps the list to one kind, E4 keeps the sound as a favourite (clockwise) or lets it go; pad N auditions row N |
| CHANGES | the focused part's sound against a save of it: each parameter that moved, from what to what; which save, and when | E1 listens anywhere between the save and now, E2 picks a change, E3 puts it back (the other way takes it back, one a turn), E4 walks back through the saves to the original |

A zone edit goes through `setPartMidiRules`, a re-check through `checkSetlistSoundcheck`, a
song change through `setlistGo`, a keep through `setLibraryUserMetadata`, an audition through
`auditionRecord` and a change put back through `setParameter`: the commands the app's own
buttons send, so Stage Lock refuses the edits there and the edition decides whether there is a
set (CUE and SOUNDCHECK need scenes and setlists; the other three are for anyone). DISCOVER says
when it has too little to go on (fewer than five measured sounds ever loaded) rather than
guessing, and reads the library at most every two seconds while it is up.

CHANGES reads a save as `diffVersions` does — it puts the save on the plug-in, reads every
parameter, and puts back what was there — once per save, then keeps it. Listening is a
parameter blend, as `morphVersions` is: anything else done to the rig (a save, a load, a
parameter set, leaving the page) first puts back exactly what was there, so a save never
captures the blend.

A song's load time runs from `setlistGo` to the last processor of its rig being ready, and is
kept beside its soundcheck. Over five seconds without preloading reads as slow, with "turn
preload on" when the setlist preloads nothing.

**The page script has grown with them.** `Hostage_MultiKnob.lua` was 9 KB on `main` and is
40.6 KB with all five, more than the slim stress builds (30-39 KB) that the mockups use to find
the keyboard's limit. [`hardware-checklist.md`](hardware-checklist.md) is how to find out
whether it fits.

Checks: `node --test test/ctrl49Preview.test.js` (payload bytes, and that every function the
broker calls exists in the page) and `node browser-checks/ctrl49Screen.mjs` (every scene runs
the real page and draws; `CTRL49_SCREENSHOT=dir/` saves a PNG per scene).

What the preview cannot tell you: the device's fonts (Aileron, asked for by weight, falls back
to a system sans), colour depth, RAM for uploaded images, and redraw rate. Those need the keyboard.

## What the firmware says

Read statically on 2026-09-26 from the Akai ADVANCE Firmware Updater 1.0.10, whose firmware runs
the same VIP display runtime as the CTRL49 (same Lua globals, same command families; our captured
CTRL49 frames decode against its dispatcher). Nothing was run and nothing was sent to a device.
It is not the CTRL49's own firmware, so each point is "very likely the same" until the keyboard
shows it. The first one already has.

**Images and tint (confirmed on the CTRL49).** `draw_image`'s colour applies only to an image that
decodes to an 8-bit buffer: an 8-bit grey palette PNG (grey = coverage, no transparency), decoded
with a colour. An RGBA PNG decodes to colour and is drawn as it is. `make_filmstrip.py` writes the
tintable kind; the preview (`screenDrawApi.js`) follows the same rule. A large decode blocks the
device while it runs, so decode big images after the splash is up, not in `init`.

**Limits.** At most **1000 bytes** of payload per frame (`kMaxPayloadBytes`; `buildFrame` refuses
more instead of building a frame the keyboard drops). Target, widget, canvas and decoded-buffer
ids below **1024**. A text object keeps about **100 characters**; labels are capped at 90 so the
nine strings of a `set_labels` call always fit one frame.

**Replies.** Every type-02 command except 02/11 and 02/23 is acknowledged with 02/3D
`[route][route][command][status]`. Status: `0x40` OK, `0x41` bad argument, `0x42` out of memory,
`0x4C` not found, `0x4D` Lua script error, `0x4E` error. HoSTage shows a refusal on the CTRL49
screen card, and the startup trace (`%APPDATA%\CEditor\ctrl49-trace.log`) names every reply.

**Commands we had not named.** 02/31 creates an off-screen canvas, 02/32 selects or resizes one,
02/33 decodes a PNG into one; 02/11 writes a control/colour state; 02/23 sets a device parameter.
The canvas family is unused by CEditor (it redraws per frame) and is noted for later.

**Lua functions.** The full registered set: `get_byte`, `print`, `mem_usage(selector)`,
`clear_errors()` (clears the on-screen Lua error), `set_hook_enabled(id, on)`,
`led_control_set_level(_midi)`, `lua_ifc_load_script`, `draw_rect`, `draw_image`, `decode_image`,
`draw_text`, **`draw_system_text`** (earlier notes had it as `draw_system`),
`lua_widget_make_dirty`, `asset_get_valid`, `text_data.new/set`. Hook 2 is MIDI notes: with
`set_hook_enabled(2, 1)` the firmware calls the page's `note(args)` with the three MIDI bytes
(status, note, velocity). The preview runtime implements all of these (`note()` fires the hook).

**Text.** `text_data.set` reads `text, color, font, font_size, just_hor, just_ver, padding_hor,
padding_ver, bk_color, border_color, border_width_left/top/right/bottom`. `padding_hor/ver` inset
the justification box. `font` indexes sixteen Aileron faces in alphabetical order (0 Black …
9 Regular, 10 SemiBold … 15 UltraLight Italic); `font_size` is a real point size.

**Firmware update protocol.** The Advance updater sends its images as Akai SysEx `F0 47 00 2E 70
… F7`. It is described here only so nobody mistakes it for something to try: it is a different
device's protocol and must never be sent to the CTRL49.

### Probe: does the CTRL49 carry images of its own?

The ADVANCE's asset flash holds 512 tintable knob frames and other sprites, under asset types
other than the 14/18 a host uploads. If the CTRL49 has them too, pages could draw them with no
upload and no decode. `Start_CTRL49_Asset_Probe.cmd` finds out, read-only: its page
(`CEditor_Asset_Probe.lua`) only asks `asset_get_valid(type, id)` for each type the ADVANCE
uses (ids 0..600) and tries `draw_image` on the first few, plain and tinted orange. It writes
nothing to the keyboard. Close HoSTage/CEditor, VIP and your DAW first; turn encoder 1 to step
through the types that have images. Result: not yet run.

### The VIP screen keyboards and their ids

VIP's own device table (`VIP_x64.dll`, 2018) names exactly five keyboards with a VIP screen. The
port names are the MIDI ports `VIP_x64.exe` looks for. Checked 2026-09-26.

| Keyboard | VIP code | MIDI port VIP opens | USB VID:PID | SysEx header | Source |
|---|---|---|---|---|---|
| M-Audio CTRL49 | `CTL49` | `CTRL 49 USB` (VIP's string; the Windows port is `CTRL49 USB`) | `0763:3108` | `F0 00 01 05 31 08` | proven: this PC's USB history; the August USB captures |
| Akai ADVANCE25 | `ADV25` | `ADVANCE25 USB PORT 1` | `09E8:002F` | `F0 47 00 2F …` | proven: Advance firmware |
| Akai ADVANCE49 | `ADV49` | `ADVANCE49 USB PORT 1` | `09E8:002E` | `F0 47 00 2E …` | proven: Advance firmware |
| Akai ADVANCE61 | `ADV61` | `ADVANCE61 USB PORT 1` | `09E8:0030` | `F0 47 00 30 …` | proven: Advance firmware |
| Alesis VX49 | `VX49` | `VX49 USB Port 1` | `13B2:????` | `F0 00 00 0E …` ? | **unknown**: vendor id and SysEx maker are Alesis's registered ids, not evidence |

How the Advance numbers are known: the firmware detects its model, then writes one value — `0x2F`
(25), `0x2E` (49) or `0x30` (61) — into both the USB device descriptor's product id and the product
byte of its SysEx. The `00 01 05`, `47` and `00 00 0E` makers are the MIDI manufacturer ids of
M-Audio, Akai and Alesis; `0763`, `09E8` and `13B2` are their USB vendor ids.

The CTRL49 driver (MAudioCTRL49 7.0.0.3505, `oem112.inf`) names four ports — `CTRL49 USB`,
`CTRL49 MIDI`, `CTRL49 VIP`, `CTRL49 Mackie/HUI` — and publishes only three to Windows. `CTRL49 VIP`
is the hidden one, which is why the display's input has to come through the private capture
while that driver is installed.

What is not known: anything about the VX49 beyond its name and port, and what the CTRL49's
`31 08` after M-Audio's maker id encodes. VIP builds its headers at run time inside a packed
binary, so they are not readable statically. The cheapest ways to fill the VX49 row: an Alesis
VX49 firmware updater, analysed the way the Advance one was; or the Hardware Ids of a connected
VX49 in Device Manager.

The other controllers VIP supports (Akai MPK, Alesis V/VI, M-Audio Code/Oxygen) are plain MIDI
maps in `C:\ProgramData\VIP\midimaps` with no screen, and are not part of this protocol.

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
Ctrl49ScreenLab.exe preset   tools/ctrl49/screen-lab/era-presets/walnut-1971/Design.ctrl49preset
Ctrl49ScreenLab.exe preset   <manifest> --check          # the manifest and its files, no keyboard
```

**Preset mode** runs a design made elsewhere: a folder with a manifest (`Design.ctrl49preset`),
a Lua page and its PNGs. `screen-lab/era-presets`, `screen-lab/feature-mockups`,
`screen-lab/design-presets` and `screen-lab/machined-metal` are such designs, the first two and
the last with launchers of their own (`Start_CTRL49_Era_Designs.cmd`,
`Start_CTRL49_Feature_Mockups.cmd`, `Start_CTRL49_Machined_Metal.cmd`). The manifest's rules
(Lua of at most 64 KiB, one to eight PNGs with ids 512-1023, at most 8192 px a side, 8 MiB
decoded), and what the page is sent each redraw, are at the top of
`CE/src/ControlSurface/Ctrl49ScreenLabPreset.h`; the `Ctrl49ScreenLab` ctest loads every
committed design with the tool's own loader, and `npm run test:screen-eras` and
`npm run test:screen-lab` render them. In every mode the console prints each command the keyboard refuses as it happens (out of
memory, a Lua script error, ...); preset mode also counts the keyboard's answers after the upload
and every ten seconds, beside the redraws a second that actually went out.

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

## Machined Metal preset (480 x 272)

`Start_CTRL49_Machined_Metal.cmd` runs the compact skeuomorphic preset. Close other CTRL49
owners first. **Page Left / Right** selects Controls, Mixer, or Amp Envelope. **E1-E4** operate
the four knob/envelope parameters; **E1-E8** operate mixer faders. Values persist across page
changes for the session. Mixer meters are animated demonstration data, not audio measurements.
The hardware's linear Mackie faders are not opened by this test; use the encoders. Ctrl+C stops
the host and lets the keyboard watchdog restore the stock screen.

```
Ctrl49ScreenLab.exe preset screen-lab/machined-metal/MachinedMetal.ctrl49preset
Ctrl49ScreenLab.exe preset screen-lab/machined-metal/MachinedMetal.ctrl49preset --check
```

The reusable `.ctrl49preset` is an INI manifest consumed by the lab host, not a synthesizer
patch or an assignment JSON. It declares the Lua page, PNG object IDs, page count, encoder
counts, initial values and redraw rate. Its companion Lua implements the existing `set_frame`
and `set_envelope` payloads. This does not replace HoSTage's standard renderer or add a theme
importer to Screen Builder. Keep the manifest, Lua and three PNGs together when copying it.

The skin uses one 64-frame 80px knob filmstrip, three native-size backgrounds in an atlas and
small translated slider/meter sprites. All three PNGs total 3,210 KiB at RGBA decode depth;
the page stages their decoding after the loading screen and reuses them across page changes.
`fps=15` is the initial test rate; lower it to `10` or `5` in the preset for a slow unit.
`--check` validates the manifest, files, PNG headers and conservative decoded-image budget
without opening MIDI. Real font appearance, device decode latency and sustained redraw rate
still need the CTRL49. `python screen-lab/machined-metal/make_assets.py` regenerates the assets
(Pillow required). `npm run test:screen-lab` checks the actual Lua at min/mid/max values,
sprite bounds, text widths, decode reuse and meter animation, and can capture native PNGs.

### Three additional design presets

`screen-lab/design-presets/` contains three further skins, each with Controls, Mixer and
Amp Envelope pages and the same encoder mapping as Machined Metal:

- **Neon Glass**: cyan illuminated rings, glass-faced knobs, angular recessed panels.
- **Studio 1978**: brushed aluminium, navy enamel header, blue knobs and ivory fader caps.
- **Bakelite 1936**: molded brown cabinet, scalloped rotary knobs, brass trim and parchment scope.

Run `Ctrl49ScreenLab.exe preset <skin-folder>/Design.ctrl49preset`, or use the packaged
launchers. They reuse the existing executable, payloads, staged loading, 15 Hz redraw rate
and 3,210 KiB decoded image budget. One preset is loaded per hardware session. Machined
Metal has now been confirmed responsive by the user on the physical CTRL49; these new skins
have passed preview/native manifest validation and still await their own hardware test.

`python screen-lab/design-presets/make_designs.py` regenerates all three from the original
Machined Metal renderer and manifest. No manual edits to generated `Skin.lua` files: make
shared behavior changes in `machined-metal/MachinedMetal.lua` and rerun the generator.
The browser check renders all nine new pages at all 128 control positions, including mixed
ADSR extremes, and checks source crops, screen bounds, text widths and image reuse.

## Panel scan: a plug-in's own sections as keyboard pages

`Ctrl49PanelScan.exe` finds a VST3's sections (its units, or its parameter names) and where each
control sits on its own GUI (by asking the editor's `IParameterFinder`, or by moving the parameter
and watching what redraws), and draws the 480 × 272 page each section would make: the section cut
from the plug-in's window, a knob ring, fader cap, button light or selector mark on each control,
numbered for the CTRL49's eight knobs. No keyboard needed. Spec:
[`docs/design/ctrl49-panel-scan.md`](../../docs/design/ctrl49-panel-scan.md).

```bat
cmake --build --preset native-release --target Ctrl49PanelScan
build\native\Release\Ctrl49PanelScan.exe selftest            :: the test plug-in, checked
build\native\Release\Ctrl49PanelScan.exe list                :: installed VST3s, numbered
build\native\Release\Ctrl49PanelScan.exe scan diva 12 serum  :: by name or number
```

Results per plug-in in `%TEMP%\ctrl49-panel-scan\<plug-in>\`: `editor.png`, `scan.png` (a box per
control and per page), `pages\*.png` (the keyboard pages), `scan.json`, `log.txt`; one line per
plug-in in `%TEMP%\ctrl49-panel-scan\summary.txt`. Each plug-in runs in its own process with five
minutes; a crash or a hang is a line in the summary. Do not cover or move the scan window.

The self-test passes under Wine with the window captured from the screen; on Windows itself
`PrintWindow` is tried first. Not yet run on the owner's plug-ins.

## Still requires hardware (open Phase-3 measurements)

[`hardware-checklist.md`](hardware-checklist.md) is the list to take to a CTRL49 now: HoSTage's
pages on the keyboard, including CUE, LAYERS, SOUNDCHECK, DISCOVER and CHANGES, then the mockups' stress test, with what to
write down at each step. The measurements below are the older, open ones.

**Measured on the CTRL49, 2026-10-05** (the screen lab's Stress page, one kind of call at a time,
at 9 redraws a second, until the bar under the header stopped gliding):

| Call | Stutters at, per redraw | Per second |
|---|---|---|
| `draw_rect` (16 x 10) | 880 | about 7,900 |
| `draw_image`, a 26 x 14 sprite | 504 | about 4,500 |
| `draw_text` | 124 (still smooth; the knob stops at 127) | about 1,100 |
| redraws a second, empty page | still smooth at 30 | |

Sprites are the budget that binds: the full mockups ask for about 4,100-4,200 calls a second, the
slim ones about 2,000. Seven full-screen blits a redraw (an RGBA `lab_bg.png`, 480 x 272 each)
stayed smooth.

**The feature mockups and Red Lead, same day.** All four mockup builds and Red Lead 1997 loaded
and ran smoothly, every page, with no refusal from the keyboard: every Lua call and every draw
was answered ok, and every redraw asked for went out (10 or 15 a second). The largest script was
Rig full's 58 KB, the most decoded image memory Red Lead's 4,502 KiB, the busiest redraws about
280 calls at 15 a second (Motion, Effects) and Red Lead's Envelope at about 420 (some 6,300
calls a second, mixed rectangles, sprites and text; more than the sprite-only figure above, so
mixed pages cost less than sprites alone). Upload and startup took 2.8-4.6 s. HoSTage's page
script (40.6 KB, 10 redraws a second) is well inside all of it.

**The largest page script: `Ctrl49ScreenLab size`.** 58 KB is only the largest tried. The
protocol carries an object's size in 28 bits, so the limit is the keyboard's memory. The size
mode finds it on its own: pages of real code (small distinct functions, so the keyboard parses,
compiles and holds all of it, not padding), 64 KB first, doubling until the keyboard refuses one
or 2048 KB passes, then the gap halved three times. Each page shows its size, how many functions
it holds and what two of them return, so a page that ran is told from one that only arrived. A
size passes when the keyboard bound the page and answered its init and draw with no refusal; a
keyboard that answers nothing stops the test rather than being read as a limit. On a PC the
2048 KB probe holds 29,008 functions in about 11 MB of Lua memory, so the keyboard is expected to
stop somewhere below it. The preset loader's 64 KB rule is a rule of ours, not the keyboard's;
the result says how far it can go.

**Image memory.** Eight 1 MB blocks decoded on top of the page's own, with no refusal and no
watchdog: `mem_usage(0)` went from 12,263,424 to 20,783,104, up 8.1 MB. So at least 8 MB of
decoded images fit beside a page, and `mem_usage(0)` counts them. None of the eight could be
drawn, though, in three builds: RGB blocks, RGBA blocks from eight uploads drawn in the redraw
that decoded them, and RGBA blocks from one upload decoded last and drawn a second later (the
way Machined Metal decodes, which does draw). The swatches are therefore not a measure on this
keyboard; `mem_usage(0)` is. Why these blocks decode and do not draw is open. What they still
differ in from every image that draws is the image itself: 256 x 1024 of flat colour bands,
which deflates 430 to 1. That is to be found without the keyboard before anyone is asked to run
the page again.

- **RAM / object budget** — how many/large filmstrips fit in device RAM before upload or
  decode fails. The Stress page's E5 decodes 1 MB blocks, up to 8.
- **Redraw-rate budget** — how fast `draw` calls can go before the link stutters (bounds
  smooth meters/animation). Measured per kind of call above; mixed pages are the mockups' test.
- **Color depth** — whether gradients band on the panel (bake dithering if so).

Each is observed on the physical screen; the tooling above is the starting point.
