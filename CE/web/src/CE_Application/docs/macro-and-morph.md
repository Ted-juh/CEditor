# Macro & Snapshot-Morph — Component Design

> Status: **Macro shipped 🟢** (per-assignment version). Snapshot-morph still
> design. Both are **compositions** of already-designed foundations. Part of the
> [panel parts backlog](./README.md); ideation in
> [groundbreaking-components.md](./groundbreaking-components.md).

## Macro — shipped

The per-assignment Macro is live: one knob → N destinations, each with its own
depth, curve and range, driven through the fan-out mechanism. It's a knob wired
into fan-out — assembly over the parts, exactly as this doc predicted.

- Pure engine `utils/macroLayout.js` (+ `test/macroLayout.test.js`, 5 tests):
  per-slot resolve (curve-shaped, inverted for negative depth, scaled by |depth|,
  mapped into [min,max]), the knob geometry/angle + hit-test, and the dynamic
  per-slot ports + fan-out values.
- `MacroRenderer.svelte`: knob dial (value arc + pointer + readout) and the
  assignment lanes (destination · colour meter · live value). Visual-only.
- Model: `Macro` controlType + `Macro` section (`value` + `slots[]` of
  `{ label, depth −1..1, curve, min, max, enabled, colour }`). **Dynamic ports** —
  `getComponentPorts` generates one `slot_N` port per assignment (like the Mod
  Matrix), so the DeviceBindings editor lists every destination.
- Interaction (`PanelPreviewSurface`): vertical knob drag → session copy →
  commit on release; every assignment emits its resolved value via the fan-out.
- `MacroEditor.svelte`: knob position + an assignment table (label · depth% ·
  curve · min · max · on/off · add/remove) + loader/tab/palette.

**Not built:** the **snapshot-morph** macro below (define the panel at 0% and
100% and morph between them) — a bigger feature that needs the snapshot system.

## Macro

- **What:** one source control (knob/fader) drives **many** targets, each with its
  own range / depth(±) / curve. Modern soft-synth macros; rare in device editors.
- **How:** a source control whose value feeds a **[Link Mapper](./link-mapper-component.md)**
  (fan-out). *Macro = Knob + Mapper.* No new engine.
- **Where:** either a **`Macro` controlType** = a knob with an **embedded route
  list**, or just the documented pattern (drop a Knob, add a Mapper). The embedded
  form is the nicer UX (one object, assignable targets).
- **When:** assignable, live-rideable performance macros. Cheap once the Mapper
  exists.
- **New work:** only the "macro packaging" (a control that owns a route list +
  an assign UI).

## Snapshot-Morph

- **What:** morph the **whole device state** between snapshots via a control —
  1D Crossfader (2 snapshots), 2D Vector pad (4 corners), or N weighted.
- **How:** the control's **position → weights** ([blend](./blend-morph.md)) →
  **[Snapshots morph](./snapshots-morph.md)** (`morphWeighted`). It's the
  Crossfader/Vector-pad in **morph mode** + the Snapshots capability.
- **Where:** a **morph mode** on the Crossfader / Vector Joystick (assign a
  snapshot per end/corner) + the snapshot store.
- **When:** performance morphing; A/B and 4-corner sound design.
- **New work:** the morph-mode binding (control → `morphWeighted`) + the
  snapshot-assignment UI; DPD-correct interpolation + MIDI throttling come from
  the Snapshots capability.

## Why they're listed as "groundbreaking" yet cheap

Both are **emergent** from the foundations: build the **Mapper** and **Snapshots**
(Phase 2 of the [roadmap](./roadmap.md)) and Macro + Snapshot-Morph are mostly
packaging + assign UIs. That's the payoff of factoring the cross-cutting
capabilities.

## Open questions

- Macro as its own controlType vs Knob+Mapper pattern (recommend embedded
  controlType for UX).
- Snapshot assignment UX (drag a snapshot onto an end/corner).
- N-way morph weighting beyond 2/4.
