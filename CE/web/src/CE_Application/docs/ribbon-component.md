# Ribbon / Touch-strip — Component Design

> Status: **shipped 🟢** as the `Ribbon` controlType (covers ribbon + pitch/mod
> wheel). Original design notes follow.

## Shipped

A 1-D absolute-touch controller — touch anywhere and the value jumps there —
with return-to-rest, in two styles (flat strip / 3-D wheel). One component
covers the touch ribbon, the pitch wheel and the mod wheel (editor presets set
the right fields).

- Pure engine `utils/ribbonLayout.js` (+ `test/ribbonLayout.test.js`, 5 tests):
  geometry + px round-trip (horizontal + vertical), snap, the return target by
  mode (none/center/min/max/rest), the return glide (rate ≤ 0 = instant snap),
  and the fan-out port values (value + touch gate).
- `RibbonRenderer.svelte`: flat strip (groove + origin/centre fill + indicator +
  touch glow), a simple wheel, or a **realistic wheel** (`style: 'wheel3d'`) —
  a glossy cylinder with grip ridges that foreshorten toward the ends and scroll
  as the wheel turns (`wheelRidges`, tested), a recessed slot and centre detent;
  horizontal or vertical; optional readout + label. Visual-only. The Pitch/Mod
  presets use the realistic wheel.
- Model: `Ribbon` controlType + `Ribbon` section + two ports (`value`,
  `touch` gate).
- Interaction (`PanelPreviewSurface`): absolute touch (jump-to-finger) with snap,
  live into a session copy; on release a **touch-off gate** then latch / snap /
  glide to the rest value (`returnMode`). Reuses the shared return-glide pattern.
- **Fan-out binding:** `value` + `touch` each emit — bind value to pitch bend
  and touch to a gate/enable.
- `RibbonEditor.svelte` inspector with **Touch-ribbon / Pitch-wheel / Mod-wheel**
  quick presets, plus style, orientation, return mode/speed, snap, glow, colours.

Realizes the [return-to-rest](./return-to-rest.md) capability (the glide is now
shared across the Joystick, Crossfader and Ribbon).

## Original design

## What

A thin **1D continuous controller** where you touch *anywhere* along the strip
and the value jumps to that position (**absolute**), rather than grabbing a
handle and dragging (**relative**, like the Slider). Models hardware ribbon
controllers (Roland D-Beam/ribbon, Haken Continuum strip, Kurzweil ribbon,
modular touch strips).

It usually has **no grabbable handle** — just a position indicator at the
current value — and often **springs back to a rest position** on release.

**Use cases:** pitch slides, filter/macro sweeps, expressive gestural control,
a "scrub" strip, touch-to-gate performance. The spring-return makes it ideal for
**pitch-ribbon** behavior (center rest).

## How

- **Absolute jump on touch:** pointer-down sets the value to the position under
  the finger *immediately* (then tracks on drag). Reuses the slider's existing
  pointer→value math (`resolveSliderNormalizedFromPoint`); the new bit is
  applying it on press instead of select-handle-then-drag.
- **Return mode on release:** `none` (latch/hold) · `center` · `min` · `max` ·
  `rest` (a configured value). With optional **return time/curve** (instant snap
  vs glide — glide uses the [Timer system](./timer-system.md)). This is the
  genuinely new behavior — no spring/return exists in the slider engine today.
- **Orientation:** horizontal or vertical (thin strip).
- **Value model:** same as slider — normalized → min/max; **snap usually off**
  (continuous); **bipolar/center** option (center rest = pitch ribbon).
- **Rendering:** reuse `SliderFamilyRenderer` linear track/fill + a position
  indicator (line/dot); optional touch "glow". No handle by default.

## Where (integration)

- **controlType:** `Ribbon`; **palette:** its own entry near Slider/Range/Knob.
- **Engine reused:** slider — `SliderFamilyRenderer`, `utils/sliderGeometry.js`,
  `utils/sliderBehavior.js`, the `value` port, numeric export.
- **Files to change:**
  - `models/componentTypes.js` — `Ribbon` entry; thin default (e.g. 220×28 H /
    28×220 V); single-handle.
  - `models/interactionDefaults.js` — `Ribbon` behavior: `family:'range'`,
    `role:'ribbon'`, linear, `valueMode:'single'`, **`absoluteJump:true`**,
    **`returnMode`/`returnValue`/`returnTime`/`returnCurve`**; parts = thin track
    + indicator (no handle).
  - `models/componentPorts.js` — `value` (numeric, continuous); optional `touch`
    boolean output (is-being-touched) for gating.
  - `layout/IconPanel.svelte` — "Ribbon" palette button.
  - `editor/PanelPreviewSurface.svelte` (+ `sliderBehavior`) — jump-on-press and
    spring-return-on-release.
- **Schema additions** (extend `Behavior` in `sectionDefaults.js`):
  `absoluteJump`, `returnMode`, `returnValue`, `returnTime`, `returnCurve`. These
  also benefit the Slider (a slider could opt into click-to-jump).

## When

- **vs Slider:** Ribbon for **gestural, absolute, spring-loaded** control
  (performance, pitch/mod/filter sweeps); Slider for **precise set-and-hold**
  parameter editing.
- **Emit/commit:** continuous while touched (continuous binding); on release,
  if a return mode is set, emit the return value (and the glide if `returnTime`
  > 0). Inbound device value updates the indicator.
- **Target-aware:** sends via the panel runtime MIDI path (standalone port vs
  plugin host bus — see [midi-workbench.md](./midi-workbench.md)). Spring-return
  is what makes it behave like a hardware pitch ribbon.

## Properties (editor)

Reuse `SliderEditor` for track/fill/label styling; add Ribbon behavior fields:
orientation · min/max · bipolar/center · snap (default off) · `returnMode` +
`returnValue` + `returnTime`/`curve` · indicator style · optional `touch` output.

## States

Reuse slider states + a **touched/active** state (glow); focused; disabled.

## Verification

1. Insert → thin strip with a position indicator, no handle.
2. Touch anywhere → value jumps there; drag → tracks finger.
3. Release → returns per `returnMode` (instant or glide); `none` = holds.
4. Bipolar + `center` return = pitch ribbon.
5. Bind `value` to a numeric param → two-way; export → numeric parameter.

## Open questions / future

- **Pressure/velocity** (needs input support) — out of scope v1.
- **Multi-touch split** (Continuum-style multiple values) — out of scope v1.
- The optional **`touch`/gate output** — useful for touch-to-note-on; confirm the
  fan-out/note-emit path.
