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

**Full design → [ribbon-component.md](./ribbon-component.md).** In brief: a thin
1D touch-to-position controller (absolute, no handle, optional spring-return),
reusing the slider engine. New work: absolute-jump-on-press (reuses the existing
pointer→value math) + a spring **return mode** (genuinely new — no return exists
in the slider engine). Own `controlType`; `value` port (+ optional `touch`
gate).

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
