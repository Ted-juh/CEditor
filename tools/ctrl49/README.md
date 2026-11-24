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

### The knob pages: values, symbols, the bottom strip

- **Values as the plug-in writes them.** A control page's `set_values` carries, after its nine
  bytes, the page's number and count and each knob's value as the plug-in formats it
  (`buildRackStatePayload` with a page, `Ctrl49RackDisplay.h`; `rackStatePayload` in JS, the same
  bytes): "2.40 kHz" in the ring instead of 88, smaller when it is longer. A page that ignores the
  extension still reads the first nine bytes. A slot the plug-in gave no text shows its position.
- **Symbols, not characters.** The keyboard's text is ASCII, so the host marks states with
  characters: "> 3.2 122" playing, "*clip" running, ">clip" waiting, "!label" not connected. The
  page draws a play or stop triangle, a lit or hollow dot, a warning sign in their place. The
  symbols sit under the logo in `hostage_logo.png` (now 440 x 100; `make_symbols.py` adds them and
  keeps the logo pixel for pixel), so they cost no upload of their own, and are tinted as drawn.
- **Empty knobs** (no label, no value) are a faint ring with no number.
- **The bottom strip** on a control page: the knob turned last, larger, and PAGE n / m.
- **No easing, and why.** Rings are drawn at their value at once. They used to sweep when a value
  jumped, which needs the keyboard to redraw when the page asks (`lua_widget_make_dirty`), and the
  page asked at the end of its first knob draws to find out whether it would. On the CTRL49
  (2026-10-07) that call, made from `draw()`, froze the keyboard: see
  [Measured on the CTRL49, 2026-10-07](#measured-on-the-ctrl49-2026-10-07). A page must never
  call it from `draw()`; `ctrl49KnobPage.test.js` holds the page to that.
- **DISCOVER's map** draws round dots, and YOU's word clear of its ring.
- **The browser** says it is the browser (`set_values` kind 7, `buildBrowseStatePayload`;
  `browseStatePayload` in JS): its rings mark the cursor and carry no numbers (they read "127"
  and "0"), a sound that cannot
  load gets the warning sign, and the bottom strip has the sound under the cursor, its whole name
  and where it comes from.

`CE/web/test/ctrl49KnobPage.test.js` runs the page in Lua and checks each of these.

### The stage pages: CUE, LIVE, LAYERS, METERS, SOUNDCHECK, DISCOVER and CHANGES

Seven pages that are not knob pages, mocked up first in `screen-lab/feature-mockups` and now
real: five a player reads or plays from on stage, two to go to between songs. Like the browser,
none is on the keyboard until it is asked for — the **Cue**, **Live**, **Layers**, **Meters**,
**Soundcheck**, **Discover** and **Changes** switches on the app's CTRL49 screen card
(`cueOnSurface`, `liveOnSurface`, `layersOnSurface`, `metersOnSurface`, `soundcheckOnSurface`,
`discoverOnSurface`, `changesOnSurface`) — and then they follow the performance page in that
order. Switching one on also shows it, on the keyboard and in the card, once: the switch is how
the page is asked for, and one that was switched on and did not appear looked like a switch that
did nothing (`consumeSurfaceStagePageRequest`). Each is one call with one payload (`set_cue`, `set_live`, `set_layers`, `set_meters`,
`set_check`, `set_discover`, `set_changes`; `CE/src/ControlSurface/Ctrl49StagePages.h` has the
byte layouts) where a knob page takes two. CUE is the mockups' Stage page, renamed because "stage
pages" already names this group.

| Page | Shows | Encoders and pads |
| --- | --- | --- |
| CUE | the song on stage, N of M, and its tempo; the section playing with its bar and the bars left (or the song's notes when it has no sections); the song's clock against the time planned, and the set's; what comes next and how much of its rig has preloaded | E1 picks a song, pad 1 goes to it; Shift + Page still steps the set from any page. CUE stays up when the song changes: a song's own control page is recalled from every other page, not from here |
| LIVE | the rack's focused part's arpeggiator: its sixteen steps (velocity as a bar, ratchets as dots, octave and chance where they are not the plain ones) with the step that last sounded outlined; every part's zone over 49 keys; the keys held, in the colour of the part that plays them, and the notes the arp plays from them marked | E1 picks a step, E2-E5 turn its velocity (four a detent; 0 is a rest), octave, ratchets and chance (five a detent), E6 the gate, E7 the rate, E8 the mode, with off before UP; pad N turns step N of the half the cursor is in on or off, and Shift + pad N ends the lane at that step |
| LAYERS | every part's key zone over 49 keys, its velocity range and transpose, muted parts and parts fed by another part; layer groups (`L1 V`: group 1 by velocity) with each member's share and crossfades drawn as LayerRouter weighs them; the notes held now, on the zones that would sound them; the picked part's range once more as a band right on top of the keys, with the white keys outside it greyed, so the keys E2 / E3 are selecting are seen and not read | E1 picks the part, E2-E6 turn its lowest key, highest key, transpose, lowest and highest velocity |
| METERS | five parts and the master on strips: each part's level after its inserts and fader, left and right (the rack's own meters, the loudest peak since the last redraw), peak hold, a clip lamp, the fader on the meter's scale and in decibels, muted parts; the master's last five seconds | E1-E5 the faders of the parts shown, E6 the master, half a decibel a detent; E7 shows the next parts when there are more than five |
| SOUNDCHECK | the set: each song ready, with problems, or not checked, its measured level and how long it took to load when last recalled (slow ones marked); the selected song's problems in the check's own words, and whether it loaded preloaded | E1 walks the set, E8 checks it again (once a second at most) |
| DISCOVER | what you own and have never opened, nearest first to what you load (`unplayedLikeHabits`), eight at a time; a map of brightness against attack with YOU (the load-weighted centre) and the sounds you load most; the selected sound's likeness and which of your regulars it is nearest | E1 picks, E2 reaches eight further, E3 keeps the list to one kind, E4 keeps the sound as a favourite (clockwise) or lets it go; pad N auditions row N |
| CHANGES | the focused part's sound against a save of it: each parameter that moved, from what to what; which save, and when | E1 listens anywhere between the save and now, E2 picks a change, E3 puts it back (the other way takes it back, one a turn), E4 walks back through the saves to the original |

A zone edit goes through `setPartMidiRules`, a re-check through `checkSetlistSoundcheck`, a
song change through `setlistGo`, a keep through `setLibraryUserMetadata`, an audition through
`auditionRecord`, a fader through `setPartMixer` or `setMasterLevel`, an arp edit through
`setPartArp` and a change put back through `setParameter`: the commands the app's own
buttons send, so Stage Lock refuses the edits there and the edition decides whether there is a
set (CUE and SOUNDCHECK need scenes and setlists; the other five are for anyone). DISCOVER says
when it has too little to go on (fewer than five measured sounds ever loaded) rather than
guessing, and reads the library at most every two seconds while it is up.

CHANGES reads a save as `diffVersions` does — it puts the save on the plug-in, reads every
parameter, and puts back what was there — once per save, then keeps it. Listening is a
parameter blend, as `morphVersions` is: anything else done to the rig (a save, a load, a
parameter set, leaving the page) first puts back exactly what was there, so a save never
captures the blend.

LIVE draws the arp's lane as ArpSettings keeps it, every row read to the longest one's length
(the engine cycles each row on its own). Without a drawn lane every step plays as played, and the
page shows sixteen plain steps and says so; the first step edit draws one, all five rows sixteen
long at velocity 100, so the app's step editor shows what the keyboard drew. The notes the arp
plays come from the engine itself (`ArpEngine::takeNotes`: the notes sounding, and every note
started since the page last asked, so a step shorter than a redraw still shows once), and the
playhead is `patternStep`, which the app's grid already used. A lane longer than sixteen shows
its first sixteen.

`patternStep` is -1 for a plain arp, so **no step is outlined until a lane is drawn**; on the
keyboard that read as the outline not working (2026-10-08). A pad rests a step and cannot make
the lane shorter, so Shift + pad N ends the lane at step N of the cursor's half: every row is cut
to that length, or made longer with the steps it had, which is what the engine was playing there
anyway. The page draws sixteen places whatever the length: a bar after the last step, a faint
mark in each place past it, a line under the eight the pads are, and the cursor walks all of
them (past the end E2-E5 and the pads do nothing; Shift + pad is how the lane comes back).

METERS takes the levels the app's mixer is sent (`instrumentHostMeters`): the service keeps the
loudest of the pump's 30 Hz drains until the page takes them at its 10, so no transient falls
between two redraws. Peak hold (1.5 s), the clip lamps (3 s) and the master's history the page
keeps itself, counted in frames from the host, so a redraw the keyboard makes on its own does not
age them. It is the HoSTage Live mockups' Meters page; the levels are no longer simulated.

A song's load time runs from `setlistGo` to the last processor of its rig being ready, and is
kept beside its soundcheck. Over five seconds without preloading reads as slow, with "turn
preload on" when the setlist preloads nothing.

**The page script has grown with them.** `Hostage_MultiKnob.lua` was 9 KB on `main` and is
about 61 KB now, with all seven and the knob page work above. HoSTage uploads it without
comments and indentation (`Ctrl49LuaStrip.h`): about 42 KB, inside the 58 KB Rig full build that
ran on the keyboard.
[`hardware-checklist.md`](hardware-checklist.md) is how to find out how far it can grow.

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
`0x4C` not found, `0x4D` Lua script error, `0x4E` error; the
[fifth reading](#fifth-reading-2026-11-23-native-knobs-scenes-and-the-type-03-replies) adds
`0x45`, `0x46`, `0x47`, `0x4A` and `0x50`. HoSTage shows a refusal on the CTRL49
screen card, and the startup trace (`%APPDATA%\CEditor\ctrl49-trace.log`) names every reply.

**Commands we had not named.** 02/31 creates an off-screen canvas, 02/32 selects or resizes one,
02/33 decodes a PNG into one; 02/11 most likely attaches an object to a canvas (first read as a
control/colour state; VIP's frames say otherwise, see
[the fourth reading](#fourth-reading-2026-11-23-the-usb-captures-of-vip)); 02/23 binds a screen
control to show a device setting (it does not change the setting: 04/01 does, see
[the second reading](#second-reading-2026-11-21)). The canvas family is unused by CEditor (it
redraws per frame) and is noted for later.

**Lua functions.** The full registered set: `get_byte`, `print`, `mem_usage(selector)`,
`clear_errors()` (clears the on-screen Lua error), `set_hook_enabled(id, on)`,
`led_control_set_level(_midi)`, `draw_rect`, `draw_image`, `decode_image`,
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

### Second reading (2026-11-21)

Read again from the same updater, this time down to the machine code, for what HoSTage can use.
M-Audio publishes no CTRL49 firmware, so everything here is the Advance's; the CTRL49 runs the same
runtime and, by everything seen so far, the same hardware (the Alesis VX49 very likely too). Treat
each point as "very likely the same" until the CTRL49 shows it. Nothing was run and nothing was
sent; no firmware bytes are in this repository.

**How it was read.** The download is an InstallShield setup: its appended `ISSetupStream` holds
three files, each XOR-scrambled with a key made from its own name and then zlib-compressed. One is
an MSI; its cabinet holds `advanced_firmware_updater.exe`, whose data section carries the
firmware as two Intel HEX texts: the application at `0x08040000` (566 KB, after a 256 KB
bootloader) and a 4 MB resource image at `0x08100000` (2.75 MB used) that goes to an external
flash chip.

**The chip.** An STM32F429 or F439 (Cortex-M4F; the two differ only in a crypto block). Flash at
`0x0800_0000`, RAM at `0x2000_0000`, exactly the F42x/F43x interrupt table (91 device IRQs, with
the firmware's own handlers on 88 LTDC and 90 DMA2D), the F4-only CCM RAM, and no Cortex-M7 cache
control. SysTick reloads every 21,000 cycles for an 8 kHz tick, which puts the core at 168 MHz.
External SDRAM sits at `0xC000_0000`; the code's top address is `0xC200_0000`, so most likely
32 MB, which fits the 20.8 MB `mem_usage(0)` that drew no refusal. The 480×272 screen is double
buffered: the LCD controller scans one buffer while DMA2D draws into the other, swapped on
vertical blank.

**The software.** No operating system: one main loop plus a 15-task scheduler run off the 8 kHz
tick. Lua 5.2 with the whole standard library (string, table, math, coroutine, bit32, os, io,
debug, package); PNG decoding is LodePNG, text is FreeType. That settles the open question in
[the stress pages](#the-stress-pages-memory-blocks): LodePNG reads the stress block, so the blocks
that did not draw fail after decoding.

**Device settings: 04/01 sets, 04/02 reads.** The firmware keeps a table of settings, each with
an id, a current value, a minimum, a default and a maximum. 04/01 is `[id: 1 byte][value: 4
base-128 digits]`; the value is offset by 2^27 on the wire (send `value + 0x0800_0000`), so
negatives work. The firmware clamps to the setting's range and acts only on a change. 04/02 is
`[id: 1 byte]` and replies 04/02 with the id and the value in the same form. **The id is not
bounds-checked**: an id past the table reads a wild pointer, so send only ids from this table.

| Id | Setting | Range (default) |
|---|---|---|
| 0 | Current page | |
| 1 / 2 / 3 | Bank / cursor preset / active preset | 0–3 / 0–31 / 0–31 |
| 4 / 5 / 6 / 7 | Stop-or-play / arp on / arp latch / note repeat | 0–1 |
| 8 | Pad full level | 0–1 |
| 10 / 11 / 12 | Time-div state / shift state / time-div value | 0–1 / 0–1 / 0–7 |
| 16 | **Disable VIP timeout** | 0–1 (0) |
| 17 | "Lua Hooks" (a 32-bit value; not found connected to `set_hook_enabled`, see below) | 32-bit |
| 18 | Common channel | 1–32 (1) |
| 19 | Note display type | 0–1 |
| 20 | **Screen brightness** | 1–10 (10) |
| 21 | Transport format (MMC, MIDI, PTEX …) | 0–4 |
| 22 / 23 | **Octave / transpose** | −4…4 / −36…36 |
| 24 / 25 | Keybed curve / sensitivity | 0–4 / 1–10 (5) |
| 26 / 27 / 28 | Pad threshold / curve / sensitivity | 0–15 (5) / 0–4 / 1–10 (5) |
| 29 | **Internal tempo**, 16.16 fixed point | 30–300 BPM (120) |
| 30 / 31 / 32 | Tap average / tempo LED / clock source | 2–4 (3) / 0–1 (1) / 0–1 |
| 34 / 35 | Firmware version / boot ROM | read only (`0x125` / `0x112`) |

**Never send** 13 (the firmware mode); 14 with any value but 1 or 2 (14 is the requested mode:
VIP sends 2 to enter VIP mode and 1 to leave it, HoSTage sends 2 at start, and 3 is how the
keyboard is switched toward update mode); 15 with any value but 0 (VIP writes 0 at
every start); 33 (save global settings: a flash write), 36 (factory reset) or 37 (send program).
9 has no readable name and is left alone too. The values VIP sends for 14 and 15 are in
[the fourth reading](#fourth-reading-2026-11-23-the-usb-captures-of-vip); this line first ruled
out 13–15 whole, which would have refused HoSTage's own start.

Uses for HoSTage: per-song octave, transpose and velocity curve from the setlist; the keyboard's
tempo, arp and tempo LED following the song; dimming the screen on a dark stage; reading the
firmware version to know what it talks to.

**The VIP timeout.** The keyboard falls back from the VIP screen when no valid SysEx frame has
arrived for **3 seconds** (any accepted frame resets the clock; the 03/00 keepalive every ~900 ms
is a 3× margin), and only while setting 13 says VIP mode (2). Setting 16 = 1 turns the fallback
off: a host stall such as a heavy song load no longer drops the screen, at the price of a stale
screen if the host dies.

**Lua hooks.** `set_hook_enabled(id, on)` sets bit `id` of a mask held in RAM (setting 17 carries
the name but no code was found joining the two). The firmware then calls the
page's Lua global of the hook's name:

| Hook | Lua function called | When |
|---|---|---|
| 0 | `post_page_draw()` | after the built-in page has drawn |
| 1 | `post_dma2d_queue_empty()` | when the drawing queue has emptied |
| 2 | `note(args)` | a note was generated (status, note, velocity); HoSTage uses this one |

The only other Lua functions the firmware calls are `draw(args)` and the ones a host names in
02/3C. (This line first added 02/2C as the same call aimed at one widget; the
[ninth reading](#ninth-reading-2026-11-24-the-commands-nobody-had-mapped) shows it moves a
widget's text instead.) Akai's own pages used names such as `set_widget_id(args)` and
`arp_program_line_zero(args)`; those came from VIP over SysEx, not from the keyboard.

**No clock, but frames.** `os.clock()` is unusable: the C library's `_times` is a stub that fills
nothing, so it returns leftover stack values. A page measures time in frames. It can, however,
make its own frames: the screen loop is paced by vertical blank and draws what is queued, and
Akai's one built-in Lua page (resource type 16 id 0, a falling-notes visualiser) ends `draw()`
with `lua_widget_make_dirty(WID)`, so it redraws every frame with no host traffic. Its fade uses a
translucent rectangle, `draw_rect(x, y, w, h, 0x20000000)`: colours are `0xAARRGGBB` with alpha.
Not yet tried on the CTRL49; if it holds, peak hold, meter decay and marquees could run on the
keyboard and the host would send only changes.

**Nothing persists.** Uploaded objects go to RAM. The flash writes found reachable in normal
operation are the settings and presets (setting 33) and an erase that sits with the built-in
debug page's output; the firmware itself is only rewritten in update mode. This paragraph first
said no command stores a page: one does (05/00 with a storage state other than 4, then 05/02),
and the [eleventh reading](#eleventh-reading-2026-11-24-objects-storage-and-the-commands-that-reboot)
says why not to use it yet.

**Extending what a page can draw.** Lua itself draws nothing; a page draws only through the
firmware's functions (rectangles with alpha, text in the sixteen faces, images and crops of
them), and there is no line, arc, circle, gradient or pixel primitive. What can be added, and how:

- *Lua helpers, inside the page.* Lines, rounded rectangles, filled circles and rings (one rect
  per row), gradients (bands of translucent rects), bars and sparklines, all built on `draw_rect`.
  The firmware sees only more calls, so the cost is the per-redraw budget measured on the CTRL49:
  stutter at about 880 rects a redraw at 9 redraws/s. A filled circle of radius 20 is about 40.
- *Code sent while the page runs.* `load()` is in the firmware, so a page can compile Lua handed
  to it as text through 02/3C and add or replace functions without re-uploading itself or
  re-decoding its images. One frame carries at most 1000 bytes, so longer code goes in parts.
- *Shapes the firmware cannot draw* (arcs, waveforms, logos, smooth gradients): render them on the
  PC into 8-bit grey filmstrips, as HoSTage does for knobs. Heavy once (upload, decode, memory),
  one cheap DMA2D blit per frame after that.
- *Not possible:* new built-in (C) functions. Lua cannot load native code (the firmware carries
  "dynamic libraries not enabled"), and adding primitives means replacing the firmware.
- *Untested:* if a page can draw into one of the off-screen canvases (02/31–02/33), something
  expensive could be built once and redrawn as a single image every frame.

**The command map.** Type 02 implements 51 commands: 00–06, 0D–1C, 21–3C; the gaps (07–0C,
1D–20) fall through to an error reply. Type 04: 00, 01 (set setting), 02 (read setting), 04, 05
(LED level), 06 (pad RGB), 07 and 08; 03 is not implemented. 04/00, 04/04, 04/07 and 04/08 work
on controls and the active preset: the
[ninth reading](#ninth-reading-2026-11-24-the-commands-nobody-had-mapped) maps them, with type
01. Types 01, 03, 05 and 06 have handlers of their own; 03 includes the request for update mode.

### Third reading (2026-11-22): what HoSTage does not use yet

The same image, read for what it offers beyond the commands HoSTage already sends. Same caveat:
this is the Advance's firmware. Three earlier statements are corrected by it: `lua_ifc_load_script`
is not callable from Lua (it is the C loader's name in an error message; the preview's stub that
throws behaves as the keyboard's missing global would), the hook mask is a RAM word and not
setting 17, and a page's functions are called through 02/3C, not 02/00 (this line first said
"02/3C and 02/2C"; 02/2C is not a call, see the ninth reading).

**The firmware has widgets of its own, with their art in flash.** It can draw knobs and pads in C
from 8-bit coverage images it already holds and tints. VIP does not use those two on the CTRL49:
[its captured frames](#fourth-reading-2026-11-23-the-usb-captures-of-vip) show pages built from
Lua (twenty scripts, 43 PNGs) with native text objects for the left column, and no knob or pad
command at all. HoSTage draws its knobs in Lua from a filmstrip it uploads.

| Commands | Widget | Art in flash | What the commands carry |
|---|---|---|---|
| 02/12–1C | **Knob**, up to 1024 | type 11 id 0: a 74×71 base, 256 frames of 66×62 (two arc weights × 128 values) and 256 of 48×45 (an arc and a pie × 128) | 12 create (id, art id, two bytes); 13 and 14 a byte pair each, second ≥ first (defaults 0–0 and 0–127); 15, 16, 17 three colours; 18 a mode byte; 19 and 1B a string each; 1A and 1C a 14-bit value each |
| 02/00–06 | **Pad**, up to 1024 | type 8 id 0: 74×74, off and on | 00 create (id, art id, byte); 01 a state byte; 02, 05, 06 three colours; 03 a string; 04 a value |
| 02/21–22 | **Text object** | the Aileron faces | 21 create (id, width, height, most likely a capacity); 22 set the string. VIP's frames for them are in the fourth reading |
| 02/24–2B | properties of an object addressed by (id, kind, text number) | | strings, colours and bytes; 2C moves one of a widget's texts (first read here as a Lua call; see the ninth reading) |
| 02/2D–2F | **Button**, kind 8 (matched in the ninth reading) | type 13: 73×33 off and on, a 75×9 bar and a 6×10 marker | 2D create, 2E a min/value/max, 2F three colours |

A colour is sent as A, R, G, B, each a two-digit base-128 number 0–255, as 04/06 sends its RGB.
The knob's defaults are `0x7F804000`, `0xFFFF0000` and `0xFFFF0000`. Replies are the usual 02/3D;
`0x46` is a status not seen before: a pair sent with the second below the first. This paragraph
first called 2D–2F, 34 and 38 unmapped and 30, 35, 36 and 37 do-nothings; the ninth reading maps
all of them, and only 35–37 really do nothing.

What it would give HoSTage's knob pages: nothing to upload or decode at connect, a value change
that is one 15-byte frame (four bytes of payload), and drawing that costs no Lua. The VIP captures
do not have the recipe: this paragraph first said they held 02/12–1C frames for VIP's knob page,
and [the fourth reading](#fourth-reading-2026-11-23-the-usb-captures-of-vip) found not one
02/00–06 or 02/12–1C frame in any of them. Akai's own code has it instead:
[the fifth reading](#fifth-reading-2026-11-23-native-knobs-scenes-and-the-type-03-replies) reads
what each value means, how a knob is put in a scene, and a test sequence. Whether the CTRL49
carries the art at all, `asset_get_valid(11, 0)` in the asset probe says directly.

**The device functions, as the code has them.**

- `print(a, b)` does not reach the host: it writes its strings to the screen, on the overlay Lua
  errors use, and `clear_errors()` wipes that. A page can show its own diagnostics on the keyboard.
- `mem_usage(n)` returns field `n` of the C library's heap report: 0 is the heap claimed so far
  (what the stress page read), **7 is bytes in use and 8 is bytes free**. `n` is not checked.
- `led_control_set_level(id, level)` and `led_control_set_level_midi(id, level)` set an LED from
  Lua, with no host round trip. Ids run 1–58 through a table: 42–45 are the pad-bank buttons (the
  ids HoSTage sends in 04/05), 1–8 and 19–26 are two rows of eight, and ids with no LED are ignored.
- Fonts are loaded once at start-up from resource type 15. An uploaded font is not picked up.

**Liveness.** 06/02 is a ping: the keyboard answers 06/03 with one zero byte. 04/02 (read a
setting) answers too. Either closes the gap noted under "Still requires hardware": the app can
tell a keyboard that has stopped answering from one that is merely quiet. **06/00 and 06/01,
beside it, mark the firmware for renewal and restart the keyboard: never send them** (eleventh
reading).

**Session commands (type 03).** 00 keepalive, 08 identity. **03/06 asks for update mode and must
never be sent**; 03/07 puts the previous mode back; **03/02 restarts the keyboard**. 03/03 is the heap report, and the identity is
the chip's serial number, not a version: both in
[the fifth reading](#fifth-reading-2026-11-23-native-knobs-scenes-and-the-type-03-replies).

**The other VIP keyboards.** The image serves the ADVANCE25, 49 and 61 alike, and its frame check
is only the Akai maker byte. Everything HoSTage sends to a CTRL49 an Advance should take with its
own header and ports (the table below); the VX49 very likely too. Untested: it needs one of them.

**In order of what it buys HoSTage:**

1. Native knobs and pads: the fastest and lightest pages. The knob's recipe is read from Akai's
   own code in the fifth reading, with a test sequence; not yet tried on the CTRL49.
2. Native text objects and 02/23 readouts, VIP's working recipe in
   [the fourth reading](#fourth-reading-2026-11-23-the-usb-captures-of-vip): labels that cost no
   Lua, and octave and transpose shown by the keyboard itself.
3. Settings over 04/01: octave, transpose, velocity curve, tempo, clock source and brightness per
   song; the VIP timeout off during a heavy song load. **The builders exist (2026-11-24):**
   `buildSetSetting` and `buildReadSetting` in `Ctrl49Protocol`, the ids named in
   `ctrl49::setting`, `parseSettingReply` for the answer, and the 16.16 tempo helpers; checked
   against VIP's captured writes, reads and the keyboard's captured answers. Nothing in HoSTage
   calls them yet.
4. Pages that redraw themselves (`lua_widget_make_dirty` from `draw()`): meters, peak hold and
   marquees on the keyboard, the host sending only changes.
5. A ping, so a dead keyboard is noticed; the keepalive's own reply already says whether the
   keyboard is still in VIP mode. **Built (2026-11-24):** `buildPing` and `isPingReply`. What
   remains is the app side: sending it and noticing when no answer comes back.
6. LEDs set from Lua, for feedback that does not wait for the host.
7. `load()` for patching a running page; a Lua drawing library; `print` and `mem_usage(7)` while
   developing pages.
8. **Built (2026-11-24):** `refusalReason` in `Ctrl49Protocol`. `buildFrame` will not build a
   refused frame and `Ctrl49Session` will not send one; the protocol tests check every refusal and
   the reducer tests run a whole session through it. It refuses what must never go out: 03/06 and
   03/07; setting 13; 14 with any
   value but 1 or 2; 15 with any value but 0; 33, 36, 37; setting ids outside the table; and
   04/00, 04/04, 04/07 and 04/08, which act on the panel and the stored presets (ninth reading);
   03/02, 05/02, 05/04, 05/06, 06/00 and 06/01, which restart the keyboard or write its flash, and
   any 05/00 whose flags byte is not 4 (eleventh reading). (First written as "settings 13–15",
   which would refuse the 14 = 2 HoSTage starts with.)
9. The Advance keyboards and the VX49 as further devices.

### Fourth reading (2026-11-23): the USB captures of VIP

The August USB captures, read frame by frame: VIP starting four times (once reopened without a
power cycle, once driven by hand through its pages), two replays of VIP's start by a test tool,
and single test frames, thirteen USBPcap files in all. [`capture-reading/`](capture-reading/) does
the reading (below). Unlike the three readings above, this is the CTRL49 itself answering VIP, so
what is here holds on this keyboard. Nothing was sent to make it. The captures stay on the owner's
machine.

**No native knobs or pads.** Not one 02/00–06 or 02/12–1C frame is in any of the thirteen. The
type-02 commands VIP sends are 0D, 0E, 10, 11, 21–23, 25–2B, 31–33 and 39–3C, and no others. The
third reading's "VIP sent it" was wrong; it was most likely read from the engineering handoff's
list of VIP's uploaded PNGs, whose object keys run `00 0E 02 02` to `00 0E 02 3F` and so contain
`02 12` … `02 1C`. VIP's pages on the CTRL49 are Lua: twenty scripts, 43 PNGs, about 120 calls
through 02/3C at each start.

**Native text objects: VIP's whole recipe.** VIP's left column (the preset's name, the plug-in's,
and "MIDI Ch / Oct / Trans" with their values) is eight text objects the firmware draws itself.
Every frame of them was answered 02/3D OK (`0x40`). The label "MIDI Ch", in the order VIP sends it:

| Frame | Payload | What it sets |
|---|---|---|
| 02/21 | `02 03` `00 50` `00 14` `14` | create text object 0x103: width 80, height 20, and most likely a capacity of 20 characters |
| 02/22 | `02 03` `4D 49 44 49 20 43 68` `00` | the string, `MIDI Ch`: plain ASCII and a closing zero, not MIDI-7 |
| 02/27 | `02 03 03 00` `00 01` | justification, across then down |
| 02/2B | `02 03 03 00` `04 00` | padding, across then down |
| 02/26 | `02 03 03 00` `09 0E` | face 9 (Aileron Regular) at 14 points |
| 02/2A | `02 03 03 00` `00 00 00 00` | border widths: left, top, right, bottom |
| 02/28 | `02 03 03 00` `00 00 01 7F 01 7F 01 7F` | background colour `0x00FFFFFF`, transparent |
| 02/25 | `02 03 03 00` `01 7F 00 68 00 68 00 68` | text colour `0xFF686868` |
| 02/29 | `02 03 03 00` `01 7F 00 00 00 00 00 00` | border colour `0xFF000000` |
| 02/0E | `21 03 02 03` `00 0E` `01 77` | in scene 0x21, kind 3, put it at x 14, y 247 |

- **Addressing.** After the 02/21 that makes it, an object is addressed as (id, kind, 0): the id
  in two base-128 digits, a kind byte, and a zero VIP never varies. 02/0E names the kinds: 3 a
  text object, 9 a canvas, `0x0D` a Lua target. That is the `0x0D` `buildSetLayerPosition` sends
  as a constant, and the `0x02` before every target number is the id's high digit (VIP's targets
  are 0x102–0x106). Ids count per kind: VIP's canvas 0x101 and its text object 0x101 exist side
  by side.
- **The properties follow `text_data.set`'s fields**: 22 text, 25 colour, 26 face and size,
  27 justification, 28 background colour, 29 border colour, 2A the four border widths, 2B padding.
  VIP never sends 24. A colour is A, R, G, B in two base-128 digits each, as the third reading has
  it.
- **02/21's last byte** is most likely the capacity: VIP gives 64 to its two name lines, 20 to the
  labels and 4 to the values.
- **Positions are whole-screen**, not relative to the canvas the objects sit on: the values at
  y 228, the labels at y 247.
- **A string changes with one 02/22.** VIP creates the two name lines empty and then sets them
  ("(Custom)", "Nerve"); on its DAW page it adds a ninth object, 0x109, 480 × 29, for the title
  "DAW Control".

| Id | Shows | Size, capacity | At | Face, size | Colour |
|---|---|---|---|---|---|
| 0x102 | the preset's name | 193 × 48, 64 | 0, 147 | 10 SemiBold, 14 | white |
| 0x101 | the plug-in's name | 193 × 24, 64 | 0, 183 | 9 Regular, 14 | grey `0x68` |
| 0x106 / 0x107 / 0x108 | channel, octave, transpose | 50 × 20, 4 | 15 / 93 / 140, 228 | 9 Regular, 14 | white |
| 0x103 / 0x104 / 0x105 | "MIDI Ch", "Oct", "Trans" | 80 / 50 / 50 × 20, 20 | 14 / 92 / 139, 247 | 9 Regular, 14 | grey `0x68` |

**Readouts the keyboard fills in: 02/23.** `02/23 [id: 2 digits][setting]` ties a text object to
a device setting. VIP ties its three value fields to 18, 22 and 23 (`02 06 12`, `02 07 16`,
`02 08 17`) under "MIDI Ch", "Oct" and "Trans", and never sends them a string afterwards (the
channel's field gets "1" once before it is tied, the other two an empty string), so the values VIP's
screen shows come from the keyboard. That is VIP using the second reading's ids for what its table
names them: 18 (common channel), 22 (octave) and 23 (transpose) hold on the CTRL49. 02/23 gets no
02/3D, as the firmware reading said. Not in the captures: whether a field follows a press of the
octave buttons at once (no such press happened while they ran). If it does, any HoSTage page can
show octave and transpose with no traffic from the host.

**Entering and leaving VIP mode.** VIP's first 04/01 is setting 14 = 2, `0E 40 00 00 02`, which
HoSTage sends too (`Ctrl49Session.cpp`). Closing VIP sends 14 = 1, `0E 40 00 00 01` (four times,
in the capture of VIP closing). Every start also writes 15 = 0, `0F 40 00 00 00`, after the
screen is built. So 14 is not a setting never to send: 2 enters VIP mode, 1 leaves it, and 3 is
the value that leads toward update mode. The list under
[the second reading](#second-reading-2026-11-21) now says so. HoSTage never sends 14 = 1, so when
it closes, the keyboard leaves VIP mode only by the 3 s timeout.

**The keepalive's reply says which mode the keyboard is in.** 03/01, the answer to every 03/00,
carries one byte: 1 until 14 = 2 has taken effect, 2 from then on, in every start captured. It is
setting 13, the current mode: the firmware's 03/00 handler reads 13 and sends it (fifth reading).
A host that reads it can tell a keyboard that has fallen back from VIP mode from one still showing
its page, with no extra traffic.

**Other replies.** Every 05/00, 05/01 and 05/0B of an object upload is answered with the same
command and the object's key, `0x40` added to its third byte: `00 10 42 01` for Lua object 0x101,
`00 0E 42 22` for PNG 0x122. 01/00 `01 7F 00 00 00 00 00 00`, sent before each 02/10 that
activates a scene and not named, is answered 01/0A `00 00 40`.

**The canvas, and 02/11.** VIP's left column sits on an off-screen canvas. 02/31
`02 01 41 46 41 71 41 46 41 71` creates canvas 0x101 with four signed 14-bit numbers (`40 00` is
zero): 198, 241, 198, 241, most likely its size twice. 02/33 `02 01 0E 02 3D 40 00 40 00` decodes
PNG object 0x13D (VIP's largest, 25 KB) into it at 0, 0, and 02/32 `02 01 40 00 40 00` comes
after the create and again after the decode. 02/0E `21 09 02 01 00 00 00 1F` puts the canvas at
y 31, filling the 198 × 241 under the header.
Then ten 02/11 frames, `[02 01 09][id, kind]`, name canvas 0x101 with each of the eight text
objects and Lua targets 0x105 and 0x106: most likely attaching them to it. So 02/11 is not the
control/colour state the first reading took it for. It gets no reply.

**Setting 29 reads 43, not 120.** At every start VIP reads settings 10, 18, 22, 23 and 29. The
keyboard answers 0, 1, 0, 0, and for 29 `41 2C 00 00`: `0x2B0000`, which is 43.0 in the 16.16
format the Advance's table gives its internal tempo, whose default is 120. Either 29 is something
else on the CTRL49, or its tempo stood at 43 through every capture. A read of 29 while the
keyboard shows its own tempo settles it. (The eleventh reading found the Advance's range is 30–300,
so 43 is a legal tempo: most likely the second.)

**Reading the captures again.** Python 3, nothing to install; it reads files and sends nothing:

```
python capture-reading/pcapsysex.py frames.jsonl CTRL_49_01_VIP_startup.pcapng ...   # every SysEx frame, one JSON line each
python capture-reading/frames.py frames.jsonl                                        # counts per capture, direction, command
python capture-reading/frames.py frames.jsonl "02/2[1-9A-B]" CTRL49_09               # VIP's text objects, in order
```

`pcapsysex.py` decodes only the USB device that carries CTRL49 frames, so other devices on the
same hub do not leak in.

### Fifth reading (2026-11-23): native knobs, scenes and the type-03 replies

The Advance's application image again, for what the captures could not give. Same caveat as the
first three readings: it is the Advance's firmware, untried on the CTRL49 except where a capture
says otherwise. The disassembly came from LLVM's objdump, which Visual Studio's Clang carries:
`firmware-reading/llvmdis.py LLVM_BIN_DIR APP_IMAGE OUT` writes it with every literal resolved.

**Scenes.** What VIP does with 02/0D, 02/0E and 02/10, read from the handlers:

- `02/0D [scene][slots]` creates scene `scene` (0–127) with room for 1–512 objects (`0x45`
  outside that, `0x42` out of memory). Creating a scene that already exists first destroys every
  object in it. VIP's `02/0D 21 0D` is thirteen slots, and it then places exactly thirteen objects.
- `02/0E [scene][kind][id: 2][x: 2][y: 2]` puts an object in the scene's next free slot. It does
  not check that the object exists. `0x4A`: the scene is full; `0x50`: the object already sits in
  another scene; `0x41`: no such scene.
- `02/0F`, the same payload, moves an object that is already in the scene (`0x46` if it is not).
- `02/10 [scene]` shows the scene, and is always answered OK.
- The kinds, from the routine that empties a scene: 1 pad, 3 text, 5 knob, 8 button, 9 canvas,
  13 Lua target; 11 and 12 can be drawn and destroyed but nothing in this firmware creates one.
  (This line first listed 7, 8, 11 and 12 as unnamed: 8 is the button of the ninth reading, and 7
  and 10 appear only as the kind in some commands' error replies.)

**Every command from 02/00 to 02/3A has a fixed payload length** (a minimum, for those that carry
a string; 02/3B and 02/3C carry their own lengths), and any other length is answered `0x47`:

| Length | Commands |
|---|---|
| 1 | 02/10 |
| 2 | 02/0D, 02/39 |
| 3 | 02/01, 02/18 |
| 4 | 02/00, 02/04, 02/13, 02/14, 02/1A, 02/1C, 02/2D, 02/36 |
| 5 | 02/12, 02/2E, 02/30, 02/35, 02/3A |
| 6 | 02/11, 02/26, 02/27, 02/2B, 02/2C, 02/32 |
| 7 | 02/21 |
| 8 | 02/0E, 02/0F, 02/2A |
| 9 | 02/33 |
| 10 | 02/02, 02/05, 02/06, 02/15, 02/16, 02/17, 02/31 |
| 11 | 02/38 |
| 12 | 02/25, 02/28, 02/29 |
| 18 | 02/34 |
| 26 | 02/2F, 02/37 |
| more than 2 | 02/03, 02/19, 02/1B, 02/22, 02/23 |
| more than 4 | 02/24 |

**The knob.** Each knob is a 56-byte record, one per id below 1024. The commands, with what Akai's
own pages send (at `0x0805538c`, where the firmware makes knobs itself and then calls each setter
in turn):

| Command | Payload | What it does | Default | Akai's pages |
|---|---|---|---|---|
| 02/12 | `[id: 2][art][a][b]` | create. `art` is the id of a type-11 resource in flash; the knob's two texts are made with room for the larger of `a` and `b`, most likely in characters. Creating an id again replaces the knob | | art 0, 128 and 128 |
| 02/13 | `[id: 2][from][to]` | the value arc, from `from` to `to` (0–127; `to` below `from` is `0x46`) | 0, 0 | 0, 127 |
| 02/14 | `[id: 2][from][to]` | a second, outer ring, drawn the same way | 0, 127 | 0, 127 |
| 02/15 | `[id: 2]` A R G B | the base's tint, and the colour that covers the arcs below `from` | `0x7F804000` | `0xFF000000` |
| 02/16 | `[id: 2]` A R G B | the value arc's colour | `0xFFFF0000` | `0xFF00AEFF` |
| 02/17 | `[id: 2]` A R G B | the outer ring's colour | `0xFFFF0000` | `0xFF03FF00` |
| 02/18 | `[id: 2][mode]` | low four bits: 0 the arc from `from` to `to` with the ring; 1 the arc from the centre to `to`, with the ring; 2 and up, from the centre without the ring. `0x10` runs the arcs the other way; `0x20` hides both texts | 0 | 0 |
| 02/19 / 02/1B | `[id: 2]` text `00` | the name and the value text, plain ASCII as in 02/22 | | "name", "value" |
| 02/1A / 02/1C | `[id: 2][offset: 2]` | an offset for the name and for the value text, most likely how far below the knob's top each sits | | 92 and 52 |

- **How it draws.** The art's first frame is the knob's base, tinted with the 02/15 colour. The
  rest is four equal strips of frames: the value arc, its cover, the ring and its cover. A value
  of 0–127 picks a frame in its strip. The arc is drawn up to `to` in its colour, and then covered
  up to `from` in the 02/15 colour. Without the type-11 art in flash a knob has nothing to draw,
  which is what the asset probe's `asset_get_valid(11, 0)` checks.
- **A knob's texts take the text-property commands**, addressed with kind 5 and the text's
  number: `02/26 [id][05][00][face][size]` sets the name's face and size, `[01]` the value's.
  Akai's pages set both to 14 pt. Pads (kind 1) and buttons (kind 8) work the same way; a text object
  (kind 3) ignores the third byte, which is why VIP always sends 0 there.

**A test sequence.** Untried, and nothing was sent to make it. Knob 0x101 in a new scene 0x30, in
the middle of the screen, the value at 64, then a change to 100. Showing scene 0x30 hides whatever
scene was up (HoSTage's page included) until that one is shown again, and the keepalive has to
keep running throughout:

```
F0 00 01 05 31 08 02 0D 00 02 30 01 F7                           02/0D scene 0x30, one slot
F0 00 01 05 31 08 02 12 00 05 02 01 00 20 08 F7                  02/12 knob 0x101, art 0, texts of 32
F0 00 01 05 31 08 02 0E 00 08 30 05 02 01 01 4B 00 50 F7         02/0E kind 5 at 203, 80
F0 00 01 05 31 08 02 19 00 09 02 01 43 55 54 4F 46 46 00 F7      02/19 name "CUTOFF"
F0 00 01 05 31 08 02 1B 00 05 02 01 36 34 00 F7                  02/1B value text "64"
F0 00 01 05 31 08 02 1A 00 04 02 01 00 5C F7                     02/1A name 92 px down
F0 00 01 05 31 08 02 1C 00 04 02 01 00 34 F7                     02/1C value text 52 px down
F0 00 01 05 31 08 02 14 00 04 02 01 00 7F F7                     02/14 ring 0–127
F0 00 01 05 31 08 02 13 00 04 02 01 00 40 F7                     02/13 arc 0–64
F0 00 01 05 31 08 02 18 00 03 02 01 00 F7                        02/18 mode 0
F0 00 01 05 31 08 02 15 00 0A 02 01 01 7F 00 00 00 00 00 00 F7   02/15 0xFF000000
F0 00 01 05 31 08 02 16 00 0A 02 01 01 7F 00 00 01 2E 01 7F F7   02/16 0xFF00AEFF
F0 00 01 05 31 08 02 17 00 0A 02 01 01 7F 00 03 01 7F 00 00 F7   02/17 0xFF03FF00
F0 00 01 05 31 08 02 26 00 06 02 01 05 00 09 0E F7               02/26 name: face 9, 14 pt
F0 00 01 05 31 08 02 26 00 06 02 01 05 01 09 0E F7               02/26 value text: face 9, 14 pt
F0 00 01 05 31 08 02 10 00 01 30 F7                              02/10 show scene 0x30
F0 00 01 05 31 08 02 13 00 04 02 01 00 64 F7                     a value change: arc 0–100
```

Each frame should be answered 02/3D with `0x40`. A `0x41` to 02/12 means the id is out of range;
a knob that answers OK and draws nothing most likely means the CTRL49 lacks the art. The value
text does not follow the arc by itself: a host sends 02/1B with the new number as well.

**Type 03, as the firmware answers it.**

- 03/00, the keepalive: answered 03/01 with setting 13, the current mode, and only when its
  payload is empty. That settles the fourth reading's mode byte.
- 03/03: answered 03/04 with the heap report, three 28-bit numbers: the heap claimed, the bytes
  in use and the number of free blocks (the C library's `mallinfo`, the same report `mem_usage`
  reads). It only reads, so a host can watch a page's memory with no Lua at all.
- 03/06 reads setting 13, keeps it, and writes 14 = 3: the request for update mode, never to be
  sent. 03/07 writes the kept value back to 14.
- 03/08: answered 03/09 with the chip's 96-bit unique ID, the twelve bytes every STM32F4 carries
  at `0x1FFF7A10`, in the LSB-first MIDI-7 packing CEditor uses for bulk data. It is a serial
  number, not a version. The CTRL49's reply in the captures decodes to ST's layout exactly (the
  die's X and Y on the wafer, the wafer number, a seven-letter ASCII lot code), so the CTRL49 is
  an STM32F4 running this same identity code. The values are this keyboard's serial and are left
  out here.
- 03/01, 03/04 and 03/05 do nothing. 03/02 restarts the keyboard (eleventh reading).

### Sixth reading (2026-11-23): the board's pins, and a second chip

Which pin of the STM32F429 goes to what, read from the Advance application's own set-up. The
firmware is built on ST's peripheral library, so every pin passes through `GPIO_Init`
(`0x0806db38`: pins, mode, speed, output type, pull) or `GPIO_PinAFConfig` (`0x0806dbf4`: pin
and alternate function). `firmware-reading/pinmap.py` finds all 123 such calls, recovers their
arguments and names each alternate function from the datasheet's table (DS9405 table 12). The
devices behind the pins come from the code that drives them. Same caveat as the other readings:
this is the Advance's board. The CTRL49 very likely shares it (same runtime, same identity code),
and nothing here has been checked against a CTRL49's board.

| Device | Pins | What the code says |
|---|---|---|
| SDRAM (FMC bank 1) | data PD14/15, PD0/1, PE7–15, PD8–10; address PF0–5, PF12–15, PG0–2; banks PG4/5; PC0 (SDNWE), PC2 (SDNE0), PC3 (SDCKE0), PF11 (SDNRAS), PG15 (SDNCAS), PG8 (SDCLK), PE0/1 (NBL0/1) | 16-bit, 13 row and 9 column address bits, 4 banks: **32 MB**, now confirmed. Clock HCLK / 2 (84 MHz), CAS latency 2 |
| Screen (LCD-TFT) | red PH2, PH3, PC10, PB0, PH10, PH11, PB1, PG6; green PE5, PE6, PH13, PH14, PB10, PB11, PC7, PD3; blue PE4, PG12, PG10, PG11, PI4–7; PC6 HSYNC, PA4 VSYNC, PF10 DE, PG7 CLK | 24-bit RGB, 480 × 272. Horizontal sync 42 clocks, back porch 1, front porch 2; vertical sync 11 lines, back porch 1, front porch 4. Pixel clock 12 MHz (the second PLL ×192, ÷2, ÷8), about 79 frames a second |
| USB | PA11, PA12 (OTG FS) | the USB socket |
| DIN MIDI | PD5 TX, PD6 RX (USART2) | **31,250 baud**, 8N1: the five-pin MIDI ports |
| Asset flash | PF7 SCK, PF8 MISO, PF9 MOSI (SPI5); **PF6** chip select | A serial NOR flash: commands `03` (read, 24-bit address), `9F` (ID), `06` (write enable), `05` (status). A built-in debug page prints its ID ("Flash RDID 0x%x"). The flash writer refuses anything at or below `0x0803FFFF`, so the 256 KB bootloader is safe, and sends `0x08100000`–`0x084FFFFF` here |
| Shift-register chain | PB13 SCK, PB14 MISO, PB15 MOSI (SPI2); **PI2** latch | Full duplex by DMA, 7 bytes (56 bits) a transfer, PI2 pulsed low and high before each: 56 LED outputs with software PWM, and 40 buttons read back on MISO (eighth reading) |
| Analog inputs | PA0, PA1, PA2, PC1, PC4 (ADC1); PA3, PA5, PA6, PA7 (ADC2) | Both converters together, by DMA, five channels each (ADC2's fifth is channel 18, which has no pin), the highest of four readings kept |
| Analog multiplexer | **PH4, PH5, PC5** | After each scan the code steps a four-position select on these three, so the nine inputs give up to 36 readings: pads, wheels and pedals, most likely |
| Model straps | **PC8, PD13** (inputs, pull-down) | Read as a two-bit number at start: 2 is "ADVANCE61", 1 the 25, otherwise "ADVANCE49". This is where the model, and with it the USB and SysEx product id, comes from |
| Second chip | **PB5**, **PG9**, **PG13**; PB6 TX, PB7 RX (USART1) | Its reset, BOOT0 and BOOT1, and a serial link to it (below) |
| Clock output | PB9 (TIM4 CH4) | A 1 MHz square wave (toggle mode, timer at 84 MHz ÷ 2 ÷ 21), set up in the routine that starts the second chip; that chip's own set-up fits a 1 MHz clock input (seventh reading), so most likely its clock, not measured |

**The last four.** PH9 is most likely the LED chain's output enable (eighth reading). PA9 (an
output, cleared at start), PB3 (an output, held low at start) and PI10 (an input with pull-down)
are set once at start and never touched again, neither through the library nor through their
registers directly: most likely unused or tied to a fixed state on this board.

**A second microcontroller.** At start the main chip holds PB5 low, sets PG9 high and PG13 low,
releases PB5, and greets the other chip over USART1 with ST's bootloader handshake (`0x7F`,
answered `0x79`): it is starting a second STM32 in its own ROM bootloader, the way AN2606
describes. It then reads four bytes at `0x08003FEC` of that chip's flash, and if they are not
`00 00 02 01` it writes the 16 KB image the main firmware carries at `0x080addcc` and verifies it
(the main firmware stops if that fails). The image is for an STM32F1-class part with 16 KB of
flash and 4 KB of RAM (its stack starts at `0x20000FD8`, and it addresses the F1's port
registers at `0x40010800` onward); its version block reads `VersionStart` … `---VersionEnd---`.
[The seventh reading](#seventh-reading-2026-11-24-the-second-chip-is-the-keybed-scanner) reads
that image: it is the keybed scanner. Three things follow:

- New firmware for the main chip also has to start and listen to this one: four-byte messages at
  460,800 baud, in the seventh reading.
- The second chip is reprogrammed only through the main chip, so it is not a separate risk.
- The CTRL49 very likely has one too. Its own firmware for it is not in M-Audio's driver package.

**Pins for sound.** Every SAI and I2S signal, checked against the pins above and the ones the
chip needs anyway (PH0/PH1 for the 25 MHz crystal, PA13/PA14 for SWD, PB2 for BOOT1):

- **SAI1:** no. Block A's frame and clock pins are screen lines and its data pins are the MIDI
  input and a screen line; block B's frame and clock pins are the asset flash's SPI5.
- **I2S3:** no. Its clock is on PB3 (an output) or PC10 (screen red bit 2).
- **The DAC:** no. Its outputs are PA4 (VSYNC) and PA5 (an analog input).
- **I2S2:** yes, on PI1 (clock), PI0 or PB12 (word select) and PI3 (data), all unused. But I2S2
  is SPI2's hardware, which runs the shift-register chain, so the chain would have to move, and
  its master-clock pin is PC6 (HSYNC), so the DAC would have to make its own clock (a PCM5102A
  does). "Unused" means the Advance application never sets the pin up; whether it is wired to
  anything needs the board.

**What only the board can settle.** Pins the application never sets up (anything the 256 KB
bootloader uses, which is not in the updater); which connector each line reaches; the part numbers
of the flash, the shift registers and the second chip; and whether the CTRL49's board is this one.
Photographs of both sides, a multimeter, and a logic analyser on SPI2, SPI5 and USART1 would
settle most of it. Reading the CTRL49's own firmware, if its protection level allows, would settle
all of it: `pinmap.py` then runs on the real thing.

```
python firmware-reading/llvmdis.py "<VS>/VC/Tools/Llvm/x64/bin" images/hex00_08040000.bin app.lst
python firmware-reading/pinmap.py app.lst docs/STM32F429/DS_stm32f427vg.pdf
```

### Seventh reading (2026-11-24): the second chip is the keybed scanner

The 16 KB image the Advance application carries for its second chip (at `0x080addcc`),
disassembled at its own load address: `llvmdis.py LLVM_BIN_DIR coproc.bin coproc.lst 08000000`.
It is small and plain: ST's F1 peripheral library, one interrupt, one job. Same caveat: the
Advance's board, unchecked on a CTRL49.

**The chip.** Its vector table has 43 interrupt slots, which is an STM32F101, F102 or F103 of low
or medium density. 16 KB of flash (the image fills it), at least 4 KB of RAM (the stack starts at
`0x20000FD8`). Only USART1 (interrupt 37) has a handler of its own; everything else runs from a
main loop and the SysTick interrupt.

**What it does: scans the keybed and measures each key's speed.**

- **Rows PA0–PA7** are push-pull outputs, one pulled low at a time. **Columns PB0–PB15** are
  inputs with pull-ups. That is 8 × 16 = 128 switches. Between rows it turns port B into outputs
  for a moment and back, which drains the lines so a key does not show up in the next row. JTAG is
  switched off (SWD kept) so PB3 and PB4 can be columns.
- **The whole matrix is scanned in the SysTick interrupt**, every 720 clocks.
- **Each key has two contacts**, on neighbouring rows of the same column (switch numbers n and
  n + 16). Per key, a small state machine stores the time the first contact closes and, when the
  second closes, sends the difference. The main chip turns that time into a velocity. Key numbers
  are (row with its low bit cleared) × 16 + column: room for 64 keys, which covers the ADVANCE61.
- **An independent watchdog** is set at start and refreshed in the main loop.

**The link: one way, four bytes a message.**

| Message | Bytes |
|---|---|
| Key down | `FF`, key, time high, time low. The time is the gap between the two contacts in scan periods (the scan counts itself up by one at the end of every pass), capped at `0xEEEE` |
| Key up | `FE`, key, `00`, `00` |

The second chip sets its UART up to send only. On the main chip, after it has checked or
rewritten the second chip, USART1 listens at **460,800 baud** into a circular DMA buffer, and a
parser (`0x08053c84`) turns each message into a note: the key number through a table to a note
(the table pointer is set per model, most likely), the time through a curve (`0x08053bf8`) to a
velocity.

**Link-speed straps.** PC13 and PC14 (inputs with pull-ups) pick the second chip's baud rate: 0 is
9,600, 1 is 28,800, 2 is 115,200 and 3 is 460,800. The main chip listens at 460,800, so on the
Advance both straps are left open.

**Its clock most likely comes from the main chip.** The second chip's PLL multiplies its external
clock input by 12, and it runs with zero flash wait states, which the F1 allows only up to 24 MHz.
So that input is at most 2 MHz. The main chip's PB9 puts out exactly 1 MHz, from the routine that
starts this chip. If that is the clock, it runs at 12 MHz and scans every 60 µs, so the key time
is in 60 µs steps (up to about 3.7 s). Not measured. (It also sets its oscillator up for a
crystal, where AN2867 asks for bypass mode with an external clock; it apparently works.)

**Its pins:**

| Second chip | Goes to |
|---|---|
| PA0–PA7 | keybed rows |
| PB0–PB15 | keybed columns. PB2 is also its BOOT1, which the main chip's PG13 holds low while starting it |
| PA9 (TX), PA10 (RX): USART1, the pins its ROM bootloader uses | main chip PB7 (RX), PB6 (TX) |
| NRST, BOOT0 | main chip PB5, PG9 |
| OSC_IN | main chip PB9 (1 MHz), most likely |
| PC13, PC14 | link-speed straps |
| PA13, PA14 | SWD, left on |

**What follows.**

- **Only the keybed goes through this chip.** The pads, wheels and pedals are the main chip's
  analog inputs, and the buttons are on SPI2's chain (eighth reading).
- **For firmware of our own, the keybed is the easy part.** Leave this chip running its stock
  image, or start it the way the main firmware does, and parse four-byte messages at 460,800 baud.
  Its image is Akai's (it ships inside every updater), so our firmware would rely on the chip
  already holding version 2.1 rather than carry it.
- **The CTRL49**, if its board is this one, has the same scanner and the same messages, with its
  own key table. Not checked.

### Eighth reading (2026-11-24): the panel, the last pins and velocity

What the main chip does with the shift-register chain, the analog readings and the keybed's
times. One limit first: **the CTRL49's control section is not the Advance's.** The CTRL49 has
faders (the engineering handoff's mapper found them on the Mackie/HUI port) and the Advance has
none, so the buttons, knobs and analog layout below describe the Advance only. What carries over
is the core: the chip, SDRAM, screen, asset flash, USB, MIDI and the keybed scanner.

**The shift-register chain (SPI2).**

- **56 LED outputs with brightness.** The transmit side is 32 frames of 7 bytes at `0x20010aa4`,
  sent one after another. `0x0805f690` sets an LED by turning a 0–127 level into how many of the
  32 frames its bit is on: software PWM. Its only callers are in "set an LED" (`0x0805bc80`), the
  routine behind the 58-entry LED id table, so 04/05 and `led_control_set_level` most likely end
  up here.
- **40 buttons.** Five of the seven bytes read back (`0x0805f714`, inverted: active low) go
  through a debouncer (`0x0806854c`). Each press or release is then mapped through one of two
  layout tables, chosen by the model number, to a per-button entry at `0x2000fca8` that sends a note
  (`0x90`) or a CC (`0xB0`). Buttons 24, 26 and 39 are handled specially. The other two input
  bytes are not read by that routine.
- **PH9 is most likely the chain's output enable.** Every time the firmware pauses the 8 kHz task
  table (it saves and clears the enable mask at `0x200069e4`: object uploads, settings writes,
  mode changes) it also switches PH9 off, and the LED PWM is one of those tasks. Blanking the LEDs
  while their refresh is stopped is the obvious reason.

**The analog side.** The 36 readings (nine inputs × four multiplexer positions) are handed out by
`0x0805c264`, each to a handler by control type: through a 2,048-entry curve at `0x2000d80c` or a
×1.25 scale, into a 1,024-entry event queue at `*0x20010280`. Which reading is which knob, pad or
wheel was not followed, for the reason above.

**Velocity, from the keybed's time** (`0x08053bf8`, per key-down message):

1. speed = scale × 50 ÷ time, where time is the scanner's count of scans between the two contacts
   and scale a float at `0x20000004`;
2. **white keys × 1.414**: the bit mask `0xAB5` over note % 12 marks exactly the seven white
   keys, so the firmware compensates for their different travel;
3. offset + speed × gain (floats at `0x200038cc` and `0x20000008`), clamped to 0–2047;
4. a 2,048-entry curve at `0x200058d0`, shifted right by 7: the velocity, 0–127.

The curve lives in RAM, so it is built at run time, most likely from the keybed curve and
sensitivity settings (ids 24 and 25); that link was not followed.

### Ninth reading (2026-11-24): the commands nobody had mapped

Every command the earlier readings left open, read from its handler. Same caveat: the Advance's
firmware. Each handler's error reply also names a kind, which is how 02/35–37 were found to
belong to a kind with no code behind it.

**Type 01: the screen itself.**

| Command | Payload | What it does |
|---|---|---|
| 01/00 | A, R, G, B (14-bit each) | Sets the LCD controller's background colour (its `BCCR` register, the colour wherever no layer covers the screen). VIP sends opaque black (`01 7F 00 00 00 00 00 00`) before showing each scene. Answered 01/0A `00 00 40` |
| 01/01 | | Answered OK, does nothing else |
| 01/02 | | Redraws a full-screen image when one is waiting; not followed further |
| 01/03 | type, id, x, y, A, R, G, B (16 bytes) | Draws an asset from the keyboard's store at x, y, tinted, through the same routine as 01/02: most likely, not tried |
| 01/04, 01/05, 01/07 | | Nothing, no answer |
| 01/06 | 2 bytes | Answers with 0 |
| 01/08 | | Answered 01/09 with 0 |

A type-01 command of the wrong length is answered with status `0x43`.

**Type 02: widgets, texts and canvases.**

| Command | Payload | What it does |
|---|---|---|
| 02/24 | `[id: 2][kind][text]` text `00` | Sets one of a widget's texts; for a text object (kind 3) the object itself. The general form of 02/19, 02/1B and 02/22 |
| 02/2C | `[id: 2][kind][text][offset: 2]` | Sets one of a widget's text offsets (pads, knobs, buttons). The general form of 02/1A and 02/1C; not a Lua call |
| 02/2D | `[id: 2][art][capacity]` | Creates a **button** (kind 8) from the type-13 art: the "button art" the third reading found in flash. Its texts get room for `capacity` |
| 02/2E | `[id: 2][min][value][max]` | The button's range (max below min is `0x46`), which most likely drives its bar and marker |
| 02/2F | `[id: 2]` three colours, A R G B each | The button's colours (defaults `0xFF000000`, `0xFF00BB00`, `0xFF0000BB`) |
| 02/30 | `[id: 2][kind][flags][1 set / 0 clear]` | Sets or clears state flags on a pad, text, knob or button. On a knob, flag `0x08` dims it (drawn at alpha `0x35` instead of `0xFF`) |
| 02/34 | `[canvas: 2]` x, y, w, h (signed 14-bit), A R G B | Fills a rectangle of an off-screen canvas with a colour |
| 02/35, 02/36, 02/37 | | Stubs: decoded and answered `0x4E`. Their kind, 10, has no code |
| 02/38 | `[id: 2][kind][width: 4][height: 4]` | The size of a widget's text box (pads, knobs, buttons); Akai's knobs use 119 × 40 |

**Type 04: controls and presets.**

| Command | Payload | What it does |
|---|---|---|
| 04/00 | `[state: 2][control: 2]` | Acts on panel control 0–37 through the same routine the panel uses; state 1 takes a path of its own, most likely the press |
| 04/04 | an object key | Finds an uploaded object and hands it to the active preset (setting 3): most likely preset data through the object upload |
| 04/07 | a short packed block | VIP's on-keyboard preset editor. A first byte 0–8 sets one preset field (table, two indexes checked against the table's size, value); `FE` with bytes 2 and 3 sets character `i` of the name being edited to `c`; `FF` redraws, most likely to apply |
| 04/08 | | Stores the edited name into the active preset, with the task table paused as for flash writes |

04/00 does whatever the panel control does on this firmware, and 04/04, 04/07 and 04/08 change the
keyboard's own presets. **Leave all four alone**, as with setting 33: the refuse list under the
third reading should hold them too.

**Kinds 11 and 12** have a draw routine in the scene loop, a destroy routine and one byte that can
be read and written, but nothing in this firmware creates one and their setters are never called:
leftovers. Kinds 7 and 10 appear only as the kind in error replies.

**What HoSTage could use from this.** 01/00 for the screen behind its pages; 02/30 to dim a knob
or button that is out of range; 02/24, 02/2C and 02/38 to label native widgets; 02/34 to paint on a
canvas without Lua; and the native button (02/2D–2F) beside the native knob, both untried on the
CTRL49.

### Tenth reading (2026-11-24): what the rest of ST's documents add

The ST documents in `docs/STM32F429/` that the earlier readings had not used, read for what bears
on the keyboard: TN1433 (chip markings), ES0206 (errata), the BSDL files (boundary scan), TN1489
(physical attacks) and AN2867 (oscillators). The others (packaging, WLCSP, RTC, RNG, timers,
self-test, functional safety, CAN, evaluation tools, IBIS models) say nothing about it; the SVD
files could label peripheral registers in the listings.

**Which chip, from its top.** A photograph of the chip, once the case is open, settles three
things at once:

- **The part.** STM32F4**29** or **39**, then a pin-count letter, a flash letter and a package
  letter (the datasheet's ordering code). Only packages with at least 169 pins carry every pin
  the firmware uses (checked against ST's BSDL file for each package): A (169), I (176), B (208)
  or N (216), with T for LQFP and H for BGA. The flash letter is G (1 MB) or I (2 MB; E, 512 KB,
  is too small for the layout), and two independent hints say G: the Advance's layout fills
  exactly 1 MB, and its flash writer sends `0x08100000` and up to the external flash, where a
  2 MB part keeps its second internal bank.
- **F429 or F439.** The firmware never touches the F439's crypto or hash blocks (nor the random
  number generator), so only the marking tells.
- **The silicon revision.** TN1433 shows where each package carries its revision code, and
  ES0206 (table 2) maps it: A, Y, 1, 3, or 4/5/B, the `REV_ID` `0x1000` … `0x2003` a debugger
  also reads from `DBGMCU_IDCODE`.

**What the revision decides** (ES0206; there are no errata at all for the LCD controller or DMA2D):

| Erratum | Revisions | Why it matters here |
|---|---|---|
| 2.2.14: flash reads corrupted while PA12 is in use, on 2 MB parts or with dual bank on | A, Y, 1 | PA12 is the board's USB D+. Harmless on a 1 MB part with dual bank off: one more reason Akai's layout points to the G |
| 2.3.4: a CPU burst read interrupted at the end of an SDRAM row | A, Y, 1 | Avoided with the SDRAM read FIFO, which the Advance turns on |
| 2.3.5: corrupted reads when the FMC holds stack or heap | A only | The Lua heap lives in SDRAM (`mem_usage(0)` reported 20.8 MB) |
| 2.3.9 and 2.3.15: SDRAM burst-read corruption (2.3.15 only with the read FIFO on) | all | They bite the stock firmware as much as one of ours. Firmware of our own applies ST's workaround (a precharge before switching SDRAM banks, or no FIFO) |

**Boundary scan: the real board's pins without its firmware.** The chip has a boundary-scan TAP
in series with its debug TAP (RM0090 section 38.5; ID code `0x06419041` for the F42x/43x).
ST's BSDL files, one per package, describe it: SAMPLE reads every pin, EXTEST drives any pin, and
both are meant to run with **NRST held low** ("Keep the NRST pin low", in the files' compliance
pattern). So the stock firmware is not running and cannot be harmed, and nothing is read from
flash. RM0090 switches boundary scan off only at read protection Level 2, so even at Level 1,
where the firmware cannot be read, a JTAG adapter on JTMS, JTCK, JTDI, JTDO and NJTRST (PA13,
PA14, PA15, PB3, PB4; dedicated to JTAG after every reset) can, on the CTRL49's own board:

- read the model straps (PC8, PD13) and anything wired straight to a pin;
- drive one pin at a time and see what answers: an LED, the backlight, a chip select;
- clock the SPI2 shift-register chain by hand (PB13, PB15, the PI2 latch) and read its buttons
  back on PB14.

It needs the case open and the JTAG pads found, and it writes nothing to the chip. Together with
the read-protection check it decides how far the pin map above holds for the CTRL49.

**Physical attacks (TN1489).** ST's bulletin is general: an STM32 part without a SESIP or PSA
certification covering physical attacks (none is claimed for the F429) should not be considered
resistant to them. It names no
attack and changes nothing here: at Level 1 there is no ordinary way to a backup, and Level 1 is
not to be lowered.

### Eleventh reading (2026-11-24): objects, storage and the commands that reboot

The object family (type 05), the rest of types 03 and 06, and the settings table, read from
their handlers. Same caveat: the Advance's firmware. Several of these write flash or restart the
keyboard, so this section is first of all a list of what never to send.

**Never send** (all of them would reach the CTRL49 if it runs this runtime):

| Command | What it does |
|---|---|
| 03/02 | Restarts the keyboard at once (a system reset through the core's reset register) |
| 06/00 | Writes a word into the last four bytes of the application's flash (`0x080FFFFC`), clears the asset flash's "valid" word, and restarts: most likely into update mode, with application and assets both marked for renewal |
| 06/01 | The same without touching the assets: the application alone marked for renewal, then a restart |
| 05/06 | Writes the asset flash's "valid" word (`0x12345678` at its last four bytes, offset `0x3FFFFC`), which the firmware checks at start. Most likely the updater's last step |
| 05/04 | Erases one of the persistent storage areas (64 KB block erases on the external flash) |
| 05/02 | Writes an object into its persistent storage area, or compacts the areas (an erase and a rewrite) |

**The rest of type 05.** Every 05 command answers with the same command and a short status
(0 OK, 2 not found, 4 not an uploaded object):

- **05/00's "flags" byte is the object's storage state.** It is stored straight into the object
  and decides where it lives: **4 is RAM only**, which is what VIP and HoSTage send. 0–3 are
  persistent areas. Two of them, 2 and 3, are a ping-pong pair of 64 KB in the external flash at
  offsets `0x3D0000` and `0x3E0000`; the active one starts with `0x10101010`, and a compaction
  moves everything to the other. The keyboard's own presets live there too (resource type 32;
  04/08's save ends in the same commit as 05/02).
- **05/07 reads part of an object back:** `[key][length: 4 digits][offset: 4 digits]`, answered
  with the bytes (MIDI-7 packed, so a frame holds about 850 of them). It reads only what is already in the RAM table (status 2 otherwise), and a
  resource from flash gets there when something loads it, a knob's art when the knob is created,
  for example.
- **05/09** frees every uploaded (state 4) object; **05/0A** most likely frees one (its key was
  not traced). Both are RAM only.
- 05/03, 05/05 and 05/08 are empty.

**So a page can be stored, and should not be yet.** Uploading with a flags byte of 2 or 3 instead
of 4 and then sending 05/02 would keep a page in flash across power cycles: a connect without the
3–5 s upload, only the bind and the scene. This is what the "Nothing persists" paragraph under the
second reading did not find. But the store is 64 KB, shared with the presets, and written by
erase and rewrite. HoSTage's page alone is about 42 KB before its images. Leave it until a backup
of the stock firmware exists.

**Setting 29 is the internal tempo on the Advance.** The settings table (32-byte rows from
`0x080ca020`, each with its name) gives "Internal Tempo": 16.16 fixed point, minimum 30, default
120, maximum 300. The CTRL49's 43.0 (fourth reading) is inside that range, so most likely its
stored tempo rather than a different setting. The table also names 14 and 15 both "Requested FW
Mode", and confirms 9 has no name.

**For HoSTage:** the refuse list in `Ctrl49Protocol` (`refusalReason`, built the same day)
refuses all of these, the settings listed under the second reading and the type-04 commands of
the ninth, and any 05/00 whose storage state is not 4. It also refuses any frame that is not one
well-formed CTRL49 frame, so the Akai updater's `F0 47 …` cannot go out through the session either.

### Changing the firmware, and sound (assessed 2026-11-22)

What new firmware would add for HoSTage: native drawing (lines, arcs, gradients through DMA2D), a
working clock for Lua, encoders and buttons delivered to Lua so pages navigate without a round
trip, pages kept in flash so the screen appears at power-on with no 3–5 s upload, and larger
frames than 1000 bytes. Everything else the host already does.

**Patching Akai's image** is technically within reach (the application fills 566 KB of a 768 KB
slot, and the updater shows no sign of signing), but: no CTRL49 firmware exists to patch, so it
would mean cross-flashing a patched Advance image; the CTRL49's own bootloader and update protocol
are unknown; a patched vendor firmware cannot be distributed, so it could never be a HoSTage
feature; and nothing would restore a CTRL49 to stock.

**Firmware of our own** is shippable and starts with a head start (the chip, memory, screen
timing and peripherals above, and the pin map in
[the sixth reading](#sixth-reading-2026-11-23-the-boards-pins-and-a-second-chip)), but it
is months of work (key velocity scanning, pads, encoders, LEDs, display, USB and DIN MIDI, the
flash chip), needs the case open, and is one-way without a backup of the stock firmware. The sixth
and seventh readings take one item off that list: the keybed is scanned, velocity included, by a
second microcontroller with firmware of its own, and the main chip only listens to four-byte
messages from it.

**The decisive first step, and it only reads.** Every STM32F42x/43x carries ST's system
bootloader in its system memory ([AN2606](https://www.st.com/resource/en/application_note/cd00167594-stm32-microcontroler-system-memory%20-Boot-mode-stmicroelectronics.pdf),
chapter 41), written by ST in production and outside the user flash that any erase touches. With
BOOT0 high and BOOT1 (PB2) low at reset it runs, and listens for USB DFU on PA11/PA12 and serial on
USART1 (PA9/PA10), as well as USART3, CAN2 and I2C1 (its version 9 adds I2C2, I2C3 and SPI1, 2
and 4). The Advance firmware puts its USB socket on exactly those pins (GPIOA 11 and 12 set to
AF10, which the datasheet's alternate-function table gives as OTG_FS_DM and OTG_FS_DP; the OTG FS
clock enabled), so DFU should appear on the keyboard's own USB cable, on one condition:

- **DFU needs the board's crystal.** The bootloader chooses its interface on the internal
  oscillator, but runs DFU (and CAN) on the external clock, which must be a whole number of MHz
  from 4 to 26. It measures that clock against the internal one, and ST notes a low crystal
  (8 MHz) is measured more reliably than a high one (25 MHz). A board whose clock fails this gets
  no DFU, and the way in is USART1 instead: a 3.3 V serial adapter on PA9/PA10, 8 bits, even
  parity, the speed taken from the host's first `0x7F`. PA9 is also the USB VBUS-sense pin: if
  the board wires the socket's 5 V to it, it is not free for that.
- **The Advance's crystal is 25 MHz** (read 2026-11-23 from the application image). Its start-up
  code, `SystemInit` at `0x0805e690`, switches the external oscillator on with bypass off, so a
  crystal rather than a clock module, waits for it, and writes `0x07405419` to the PLL register:
  source HSE, ÷25, ×336, then ÷2 for 168 MHz and ÷7 for USB's 48 MHz. Only 25 MHz gives exactly
  that: the PLL's input must be 1–2 MHz, so ÷25 needs 25–50 MHz, and the chip takes 26 at most.
  The routine that reports the clocks, at `0x0806de60`, carries the same 25 MHz as its crystal
  value, beside 16 MHz for the internal oscillator. 25 MHz meets the bootloader's condition, but
  it is the very value ST names as detected less reliably than 8 MHz: if DFU does not appear,
  power the keyboard off and on and try again, then use USART1. The CTRL49 has the same crystal
  if it shares the Advance's board, as everything read so far suggests; that is not checked.

STM32CubeProgrammer, free from ST, then connects and shows which of the three read-protection
levels the chip is at. The level is the RDP option byte:

- **Level 0** (`0xAA`): everything reads. The whole internal flash, the CTRL49's own bootloader
  included, can be read: a backup, the real CTRL49 image, and a way back from any experiment. That
  is 1 MB on an F429xG and 2 MB on an F429xI; the Advance's layout, a 256 KB bootloader and a
  768 KB application slot, fills exactly 1 MB, which leans toward the xG.
- **Level 1** (any value but `0xAA` and `0xCC`, `0xFF` included; also the level after an
  option-byte erase): the bootloader still connects, but every read of the flash and the backup
  SRAM is refused, from a debugger too. **Do not lower it to 0**: that mass-erases the user flash
  and the backup SRAM, and the stock firmware is gone for good.
- **Level 2** (`0xCC`): the chip no longer boots into its system memory at all, so with BOOT0 high
  it starts its own firmware as usual and nothing answers on DFU or the serial port; JTAG and SWD
  are off for good too. It cannot be undone. Firmware work on the CTRL49 is closed.

It needs the case open and BOOT0 held at 3.3 V through power-up or a reset (on the pin or its
pull-down resistor): the boot pins are latched on the fourth clock edge after reset. Connect and
read only: no download, no erase, no option-byte change. With the case open, photograph the chip
and look for the JTAG pads too:
[the tenth reading](#tenth-reading-2026-11-24-what-the-rest-of-sts-documents-add) says what the
marking settles and what boundary scan can map even at Level 1.

Checked on 2026-11-23 against ST's own documents: AN2606 rev 71 (chapter 41, tables 2, 90 and
92), RM0090 rev 22 (section 2.4 on boot, 3.7.3 on read protection) and the F427/F429 datasheet
DS9405 rev 14 (tables 10 and 12, the ordering code). This paragraph first said a level reading
`0xFF` was Level 2: `0xFF` is Level 1. It also missed the DFU crystal condition, which the Advance's 25 MHz meets.

**Sound.** The STM32F429 is audio-capable: a serial audio interface (SAI), two I2S ports, an
audio PLL, a two-channel 12-bit DAC, and DSP instructions. The board uses none of it for sound.
The SAI and the DAC are never touched, and SPI2, the one I2S-capable port in use, is set up by
`SPI_Init` as an SPI master (software chip select, clock / 16): it drives a shift-register chain,
most likely the LEDs (the asset flash is on SPI5; see the sixth reading). Sound would take a DAC
board, a jack and firmware of our own, and the pins are tight: of the audio interfaces only I2S2
has free pins, and only if SPI2's chain moves elsewhere (the sixth reading has the detail). The chip
is in the class of known open synth hardware (the Axoloti Core: an STM32F427 at 168 MHz with SDRAM
and a codec; Mutable Instruments' Clouds and Elements: an STM32F405 at 168 MHz), so real synthesis
and sample playback, never VST3s. That would be a different product from HoSTage.

**ST's tools, if it ever comes to that.** STM32CubeProgrammer for the read above; STM32CubeIDE
and STM32CubeMX for pins, clocks and building; STM32CubeF4's drivers and examples for the
STM32F429I-Discovery (LTDC, DMA2D, SDRAM, USB device); TouchGFX Designer, ST's GUI framework for
LTDC and DMA2D screens. None of them changes what a page can do under the stock firmware.

### Probe: does the CTRL49 carry images of its own?

The ADVANCE's asset flash holds 512 tintable knob frames and other sprites, under asset types
other than the 14/18 a host uploads. If the CTRL49 has them too, pages could draw them with no
upload and no decode. `Start_CTRL49_Asset_Probe.cmd` finds out, read-only: its page
(`CEditor_Asset_Probe.lua`) only asks `asset_get_valid(type, id)` for each type the ADVANCE
uses (ids 0..600) and tries `draw_image` on the first few, plain and tinted orange. It writes
nothing to the keyboard. Close HoSTage/CEditor, VIP and your DAW first; turn encoder 1 to step
through the types that have images. Result: not yet run.

What the probe should find, if the CTRL49's resource flash matches the ADVANCE's (read
2026-11-21; each record is `type, id`, a checksum, then the data):

| Type | Ids | What |
|---|---|---|
| 20 | 0–13 | PNGs: a 480×272 RGBA screen (0); a 33×4191 knob strip, 127 frames of 33×33 (11); meter faces with dB scales, 118×177 and 118×205 (4, 5); 24-px bars (2, 8, 9, 12, 13); small icons and arrows (1, 3, 6, 7, 10) |
| 1 | 0–16 | containers holding the splash screens and the DAW cards (Ableton, Bitwig, Cubase, FL Studio, Logic, Reaper, Pro Tools, Studio One, MPC, User), which will be M-Audio's own on the CTRL49 |
| 11 | 0 | one 1.6 MB container, most likely the tintable knob frames |
| 15 | 0–15 | the sixteen Aileron faces, OpenType |
| 16 | 0 | Lua source: the falling-notes visualiser |
| 19 | 0 | text (arp mode names and the like) |
| 3, 8, 13 | 0 | small containers (the boot image and two others) |

The generic ones (type 20's strip, meter faces and bars) are the ones worth drawing from flash.

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

The device keeps no time: `os.clock()` returns garbage, and the frame counter the host sends is
the only clock the lab uses. Every animation frame here is a redraw the host asks for; the
firmware suggests a page could also drive its own frames (see
[the second reading](#second-reading-2026-11-21)), which is untested. There is no GIF on the device either, but a GIF is only
frames — `python make_lab_assets.py --gif in.gif out_strip.png [--width 120]` turns one into a
flipbook strip, and prints what it will cost in device memory.

The lab uploads ~290 KB of PNGs, far more than HoSTage does, so it sends a keepalive every 48
upload chunks to keep the watchdog fed during the upload (`keepaliveEveryUploadFrames`; HoSTage's
own startup is unchanged). A third argument, `--no-upload-keepalive`, uploads without them —
if the stock screen comes back during the upload that way and not the other, the upload length
is what the watchdog objects to.

**Stress** (`Hostage_Stress.lua`) — the encoders set the load, per redraw:
E1 rectangles (×16), E2 sprites (×8), E3 text boxes, E4 full-screen image blits (0–7),
E5 1 MB image blocks decoded (0–6 on top of two decoded at the start, never freed), E6 redraws
per second (1–30).
The console prints every load and how long each redraw took to send.

What to watch, and write down:

- **The orange bar under the header** moves 8 px per redraw. Gliding = the screen keeps up.
  Jerky = it does not: note the console's last `Load:` line.
- **The stock screen coming back** = the watchdog gave up; the console prints the last load.
- **The swatches along the bottom** are one per decoded 1 MB block, F flat and T textured,
  EARLY (the two decoded at the start) and LATE (E5's). Which of them appear is the question the
  section [Image memory](#the-stress-pages-memory-blocks) below leaves open; the keyboard giving up
  while E5 rises is the image-memory ceiling.
- **The envelope and sequencer pages** — whether the gradients band on the panel.
- **The animation page** — the lowest E1 rate at which the motion looks smooth, and whether it
  still keeps up at 30.

Raise one encoder at a time from zero; E6 last.

**Upload** (`Hostage_Upload.lua`, `Ctrl49ScreenLab upload <screen-lab dir>`, launcher choice 3)
— pictures uploaded while a page runs. Every image on the keyboard so far went up before the
page started; two pages HoSTage could have need them made and sent later: SECTION (a plug-in's
own window, cut out by the panel scan, uploaded when its part comes up) and LABELS (every word
drawn in the app's own typeface, uploaded when the set changes). The probe keeps the page
redrawing ten times a second from one thread and uploads six PNGs from another, 2 KB to 106 KB
(`Ctrl49Session::uploadPng` sends a frame at a time and lets go of the cable between them, so
the redraws and the keepalive get through), then has the page decode each and show a piece of it
in a row of its own. The console prints each upload's time, its rate and how many redraws went
out during it; the keyboard shows whether each picture decoded and drew. It answers three things
at once: how fast a picture goes up, whether the screen keeps moving meanwhile, and whether an
image decoded after the page has been running draws at all (no page has done that on the keyboard
yet, which may be what the stress page's blocks ran into).

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

**A smooth envelope.** The screen has no lines and no anti-aliasing, only rectangles and image
crops, and the host sends the envelope as heights 4 px apart. Drawn a rectangle a column, it was
a staircase (the ten era designs); drawn in 1 px slivers, its edges were hard (Machined Metal and
the three design presets). Now every 4 px column of the curve is one pre-rendered anti-aliased
piece for its slope, from `screen-lab/smooth_curve.py`, baked into the empty corner of each
design's `parts.png` in the curve's colour: 49 pieces, one for every slope from 24 px down to
24 px up. A flat run is one rectangle, and a column steeper than that (a fast attack) keeps
1 px slivers, which look right on a near-vertical line. Under a filled curve, a wedge piece fills
up to the line. It costs fewer draw calls, not more: Machined Metal's envelope went from about
500 calls a redraw to about 140, Midnight's from 283 to 171. Rhythm Box 1980 snaps its curve to
a coarse grid on purpose and keeps its steps. The pieces are RGBA with soft edges, the same kind
of image as the glow the keyboard already draws.

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
`PrintWindow` is tried first.

**On the owner's plug-ins (Windows, 2026-10-06).** The self-test passed, 16 of 16, captured by
`PrintWindow`. Then three plug-ins; none of their editors answers `IParameterFinder`, so every
control was left to watching:

| Plug-in | Controls | Sections | Placed | What the picture shows |
|---|---|---|---|---|
| Spire | 725 | 41, from names | 0 | Nothing moved on screen, to the scan or to the eye; 280 controls tried before the 200 s ran out |
| TB-303 | 151 | 2, from units: Root, Others | 11 | The boxes sit on the right controls: the six top knobs, waveform, shuffle, scale, play mode, volume |
| Zebra3 | 4,273 | 139, from units | 78 | 280 controls tried before the 200 s ran out; many boxes are on the wrong panel (LFO 1's on Env 3, LFO 2's on the LFO 1 panel) |

What that says about the scan as it stands:

- **Spire's window ignores the scan's writes.** The scan moves a parameter with
  `IEditController::setParamNormalized` only. A host also sends the change through the processor
  (`process()` with the parameter change), and Spire's window appears to draw from that side. The
  scan activates the component and never calls `process()`.
- **200 seconds is not enough for a large plug-in.** Zebra3 got through 7 % of its controls.
- **A window that shows one module at a time misplaces the others.** On Zebra3 a control of a
  module that is not on screen was boxed where the visible module of that kind sits. Seen in the
  picture; the cause is read from it, not traced.
- **Units are not always sections.** TB-303's two units say nothing about its panel.

So the scan as built gives a usable page for a simple panel (TB-303) and not for the other two.

**What a HoSTage SECTION page waits on.** The page itself is decided (the HoSTage Live mockup's
Section page, painting over each knob's cap: `scan.json` now carries each knob's cap and pointer
colours). Two things stand between it and HoSTage, and neither can be settled without the
keyboard or the owner's plug-ins: whether a picture uploaded after startup draws, and how long it
takes (the screen lab's upload probe); and how the scan does on real plug-ins (`scan` above). With
both, the scan moves into the plug-in worker (which already opens the editors), its results are
kept beside the plug-in in the library, and the page uploads a section's picture when its part
comes up. LABELS waits on the same probe: drawing the words in JUCE is the easy half.

## Still requires hardware (open Phase-3 measurements)

[`hardware-checklist.md`](hardware-checklist.md) is the list to take to a CTRL49 now: HoSTage's
pages on the keyboard, including CUE, LAYERS, SOUNDCHECK, DISCOVER and CHANGES, then the mockups' stress test, with what to
write down at each step. The measurements below are the older, open ones.

<a id="measured-on-the-ctrl49-2026-10-07"></a>**Measured on the CTRL49, 2026-10-07.** The first
run of HoSTage's own 42 KB page, and the script-size test.

- **`lua_widget_make_dirty` from `draw()` freezes the keyboard.** HoSTage's page uploaded, bound
  and drew its logo. The first knob page then never appeared: the logo stayed up and the keyboard
  answered nothing more, not even a keepalive, until it was switched off and on. Every command
  before that had been acknowledged OK, so the app's card went on saying "Showing on the keyboard
  too". The knob draw ended by calling `lua_widget_make_dirty` under `pcall` (the easing probe);
  with that one call taken out, the same page, with its fifteen `text_data` objects, ran. The
  acknowledgements arrive when a command is received, not when it has been drawn: two draws and a
  keepalive were answered within 3 ms of each other, so an OK does not say the draw finished.
  The note hook still calls it from `note()`, outside a draw. A key held on LAYERS the next day
  did not freeze the keyboard, which does not settle it: the host sends the held notes as well,
  and nothing shows whether this keyboard calls the hook at all.
- **The app does not notice a keyboard that has stopped answering.** It sent keepalives into the
  silence for as long as it ran. `%APPDATA%\CEditor\ctrl49-trace.log` is where it showed.
- **Script size.** 64 KB and 128 KB loaded and ran (upload and startup 2 s and 3 s). At 256 KB
  the keyboard acknowledged the scene and its target and then answered nothing, and had to be
  switched off and on; the test stops there, so the gap was not narrowed. The limit is between
  128 and 256 KB. HoSTage's page and the 64 KB preset rule are inside it.
- **HoSTage's pages, as far as the session went.** The knob pages draw; Page Left and Right walk
  them and the app's card follows. CUE: NO SONG ON STAGE YET, E1 picks a song (GO TO, pad 1
  lit), pad 1 goes to it, and on the song the name, its notes, the clock counting against the
  time planned and NEXT are right, with nothing cut off. LAYERS draws its row, the part's range
  and the keys, and the pads go dark. Not reached: playing notes on LAYERS, its encoders,
  SOUNDCHECK, DISCOVER, CHANGES, LIVE, METERS, the browser.
- **Going to a song from CUE leaves CUE.** A setlist song recalls its control page, so pad 1 on
  CUE put the keyboard on that page, six presses of Page Right away from CUE. Working as the
  page recall was written. The owner's call the next day: CUE stays up when the song changes,
  and from any other page a song recalls its page as before. Built, with the two other things
  asked for at the keyboard: a page switched on is shown at once, and LAYERS draws the picked
  part's range on top of the keys. None of the three has been on the keyboard yet.

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
script (about 42 KB as uploaded, 10 redraws a second) is well inside all of it.

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
that decoded them, and RGBA blocks from one upload decoded last and drawn a second later.

<a id="the-stress-pages-memory-blocks"></a>**Why the blocks did not draw: what was found without
the keyboard.** The block (`stress_block.png`) is a valid PNG: lodepng, stb_image and miniz
streaming through pngle, the decoders embedded firmware is built from, read it byte for byte as
Pillow does. (upng refuses the HoSTage knob strip, which draws, so the keyboard's decoder is not
upng.) What it shares with no image that has drawn on the keyboard is how it is built: 430 to 1
where the rest are 5 to 83, one deflate block with nineteen literal codes and four distances
(every other image here: 150 or more, and 24 or more), matches no further back than two rows.
And one thing about the page: every page that draws decodes in its first redraws, behind a
loading frame (Machined Metal, HoSTage while its splash is up), and all three builds decoded
late, when E5 rose. So the stress page now asks both questions in one run:

| Swatch | Image | Decoded | Into |
|---|---|---|---|
| EARLY F | the flat block | in the second redraw | the id after its upload, as the pages that draw do |
| EARLY T | `stress_textured.png`: Machined Metal's panels cut to 256 x 1024 and turned orange, so built like the images that draw (38 to 1, full tables) | in the third redraw | the same |
| LATE F, T | each from a second upload of its own | when E5 rises | the id after that upload |
| LATE F, T, F, T | the first uploads again | when E5 rises further | a buffer each |

EARLY T appearing and EARLY F not: the image (then the swatches use the textured block, and the
memory test is what it was meant to be). Both EARLY and no LATE: decoding late. LATE from their
own upload and not from a shared one: decoding one upload twice. None at all: none of these, and
what is left is the block's shape, 256 x 1024 (the images that draw are 480, 440, 80 and 64
wide), for the next build. The total is eight megabytes, as before: two early and E5's six.

- **RAM / object budget** — how many/large filmstrips fit in device RAM before upload or
  decode fails. The Stress page's E5 decodes 1 MB blocks, up to 8.
- **Redraw-rate budget** — how fast `draw` calls can go before the link stutters (bounds
  smooth meters/animation). Measured per kind of call above; mixed pages are the mockups' test.
- **Color depth** — whether gradients band on the panel (bake dithering if so).

Each is observed on the physical screen; the tooling above is the starting point.
