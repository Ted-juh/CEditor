# CTRL49 control-surface tools (Phase 3)

Probe tooling and beauty-test assets for the CTRL49 screen integration. Design record:
[`tools/docs/screen-builder-design.md`](../docs/screen-builder-design.md). Byte-level
protocol ground truth is the external reverse-engineering handoff.

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

## Still requires hardware (open Phase-3 measurements)

- **RAM / object budget** — how many/large filmstrips fit in device RAM before upload or
  decode fails. Escalate PNG uploads until the screen stops updating.
- **Redraw-rate budget** — how fast `draw` calls can go before the link stutters (bounds
  smooth meters/animation).
- **Color depth** — whether gradients band on the panel (bake dithering if so).

Each is observed on the physical screen; the tooling above is the starting point.
