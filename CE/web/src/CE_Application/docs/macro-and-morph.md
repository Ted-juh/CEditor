# Macro & Snapshot-Morph — Component Design

> Status: **design.** The headline groundbreaking controls — and both are
> **compositions** of already-designed foundations. Part of the
> [panel parts backlog](./README.md); ideation in
> [groundbreaking-components.md](./groundbreaking-components.md).

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
