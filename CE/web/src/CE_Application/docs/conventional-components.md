# Conventional Components — Mini-Specs

> Status: **specs.** Additional placeable components, each its **own palette
> entry / `controlType`** reusing an existing engine (per
> [ready-made-vs-custom.md](./ready-made-vs-custom.md)). Part of the
> [panel parts backlog](./README.md); see [component-gaps.md](./component-gaps.md).

Common touchpoints (from the Knob/Listbox traces): `models/componentTypes.js`
(type entry), `models/interactionDefaults.js` (behavior/parts branch),
`models/componentPorts.js` (ports), `layout/IconPanel.svelte` (palette button),
and sometimes `editor/PanelPreviewSurface.svelte` (interaction).

---

## 1. Ribbon / Touch-strip

- **What:** a thin 1D continuous controller — touch *anywhere* jumps to that
  position (not drag-from-handle); optional spring-return-to-center or latch;
  a position indicator rather than a grabbable handle.
- **Engine:** slider (linear geometry) — `SliderFamilyRenderer`, `sliderBehavior`.
- **New:** an **absolute-jump-on-touch** interaction mode + a **return mode**
  (`none` / `center` / `latch`). Mostly a behavior option on the slider engine.
- **Port:** `value` (numeric, continuous).
- **Files:** `componentTypes` (Ribbon), `interactionDefaults` (Ribbon behavior:
  linear + `absoluteJump` + `returnMode`), `componentPorts`, `IconPanel`,
  `PanelPreviewSurface` (absolute-jump + spring-return).

## 2. Vector Joystick (4-corner morph)

- **What:** a 2D pad whose position is a **blend of 4 corner sources** (vector
  synthesis); spring-return-to-center; 4 labeled corner targets.
- **Engine:** xy-pad (2D position) — the existing `xy-pad` behavior + `xy` hit
  zone.
- **New:** position → **4-corner weight** math + spring-return + **4 outputs**
  (needs fan-out binding) or 2 outputs (x/y) with downstream math.
- **Ports:** 4 corner weights (fan-out) — or `x`/`y` continuous.
- **Files:** `componentTypes` (VectorPad), `interactionDefaults`/custom behavior
  (xy + return + corner mix), `componentPorts`, `IconPanel`, preview (return).
- **Ties to:** fan-out binding; and **Snapshot-Morph** (4 snapshots at the
  corners → a vector morph pad). See
  [groundbreaking-components.md](./groundbreaking-components.md).

## 3. Drum / Performance Pad Grid

- **What:** a grid of velocity-sensitive **momentary pads that emit notes**;
  part of the generative-MIDI family.
- **Engine:** generator-grid (rows×cols, `parts = rows*columns`) + the note-emit
  substrate (`utils/customComponentArpeggiator.js`) + runtime MIDI out.
- **New:** per-pad note assignment, **velocity from click position/pressure**,
  momentary note-on/off, optional latch / choke groups.
- **Ports:** note/trigger outputs (generative); target-aware MIDI out.
- **Files:** `componentTypes` (PadGrid), `interactionDefaults` (pad behavior),
  Generators (grid), `componentPorts`, `IconPanel`, preview (velocity + emit).
- **Family:** generative MIDI (with chord generator, arpeggiator, keyboard).

## 4. Crossfader

- **What:** an A↔B blend fader (bipolar, center-origin) — drives two targets
  inversely (A up as B down), or a morph position.
- **Engine:** slider (linear, bipolar, `fillOrigin: center`).
- **New:** **A/B dual-target binding** (one fades up as the other fades down) —
  fan-out (2 inverse targets). Visually close to a bipolar slider.
- **Ports:** A + B outputs (fan-out), or a single `blend` value (downstream math).
- **Files:** `componentTypes` (Crossfader), `interactionDefaults` (bipolar slider
  behavior), `componentPorts`, `IconPanel`.
- **Ties to:** fan-out binding / morph.

## 5. Chord / Scale Trigger Pad

- **Already specified** as a form of the chord generator — see
  [chord-generator.md](./chord-generator.md) (form 1: "chord pad"). It's its own
  palette entry in the generative-MIDI family; not duplicated here.

---

## Recurring theme

Vector joystick, crossfader, and the pad grid all lean on the two cross-cutting
enablers already flagged (see [component-gaps.md](./component-gaps.md)):
**fan-out (multi-target) binding** and the **note-emit substrate**. Building
those unlocks this set too — same conclusion as the synth-tier and groundbreaking
investigations.
