# Crossfader — Component Design

> Status: **design / ready to spec into build.** A new `controlType` reusing the
> (bipolar) slider engine + fan-out binding. The 1D sibling of the
> [Vector Joystick](./vector-joystick-component.md). Full what/how/where/when.
> Part of the [panel parts backlog](./README.md); mini-spec in
> [conventional-components.md](./conventional-components.md).

## What

A fader that **blends between two ends — A and B** — center = mix. Models a DJ
crossfader / A-B mixer / morph slider. Output is a blend position **and/or** two
inverse weights (A = 1−x, B = x).

Versatile within its kind:
- **Crossfade curve:** linear · constant-power (smooth center) · sharp/cut (DJ
  scratch) · custom.
- **N-way** (optional): more than two sources along the fader (pass through
  several patches) — a multi-source morph slider.
- **Morph mode:** blend two **snapshots** A↔B across the whole patch (the 1D
  cousin of the Vector Joystick's 4-corner morph — see
  [groundbreaking-components.md](./groundbreaking-components.md)).

**Use cases:** A/B patch morph, dual-parameter inverse control (one up as the
other down), wet/dry or layer balance, DJ-style cut.

## How

- **Engine:** slider — linear, **bipolar/center-origin** (`fillOrigin: center`);
  reuses `SliderFamilyRenderer`, `utils/sliderBehavior.js`.
- **Blend math (new):** position → A/B weights via the selected **crossfade
  curve** (linear / constant-power / sharp / custom).
- **Inverse dual-target binding (the defining feature):** weight A → target(s) A,
  weight B → target(s) B — needs **fan-out binding**.
- **Center detent (optional):** snap/notch at 50/50.
- **Orientation:** horizontal (default) or vertical.
- **Rendering:** reuse slider track/fill + A/B end labels; fill shows the blend.

## Where (integration)

- **controlType:** `Crossfader`; **palette:** its own entry near Slider/Ribbon.
- **Engines reused:** slider (bipolar) · fan-out binding · snapshot/morph (morph
  mode) · optionally the shared return behavior (a spring-return crossfader).
- **Files to change:**
  - `models/componentTypes.js` — `Crossfader` entry (wide, e.g. 220×32).
  - `models/interactionDefaults.js` — bipolar slider behavior + `crossfadeCurve`
    + `centerDetent` + A/B targets.
  - `models/componentPorts.js` — **A + B weight outputs** (fan-out), or a single
    `blend` value (downstream math), or N source weights (N-way).
  - `layout/IconPanel.svelte` — "Crossfader" palette button.
  - `editor/PanelPreviewSurface.svelte` — drag + center detent.
- **Schema:** `crossfadeCurve`, `centerDetent`, A/B labels + targets/snapshots,
  optional N-way source list, `morphMode`.

## When

- **vs Slider:** Slider sets one value; Crossfader blends **two targets inversely**
  (A/B). Same engine, different kind → separate component (per
  [ready-made-vs-custom.md](./ready-made-vs-custom.md)).
- **vs Vector Joystick:** 1D 2-end vs 2D 4-corner morph — same morph family.
- **Morph mode:** assign a snapshot to A and B → the fader morphs the entire
  device state between two patches (value layer + DPD ranges) along a 1D axis.
- **Emit/commit:** continuous A/B weights while dragging; center detent snaps to
  50/50. Target-aware MIDI out (standalone port vs plugin host bus).

## Shared capability — "blend / morph" (position → weights → targets)

Crossfader (1D, 2-point) and Vector Joystick (2D, 4-point) are the same idea:
**position → blend weights → fan-out to targets/snapshots.** Factor a shared
**blend/morph capability** rather than duplicating — same "one capability, many
components" pattern as fan-out binding, read-only display, and return behavior.

## Properties (editor)

orientation · `crossfadeCurve` · `centerDetent` · A/B labels + targets/snapshots ·
N-way sources (optional) · `morphMode` · styling · optional spring-return.

## States

active/dragging · at-detent (center) · focused · disabled.

## Verification

1. Insert → a fader with A/B end labels.
2. Drag → A/B weights crossfade per the curve (linear/constant-power/sharp).
3. Center detent snaps to 50/50.
4. Bind A and B to inverse targets (fan-out) → one rises as the other falls.
5. Morph mode: assign snapshots to A/B → blends the whole patch.

## Open questions / future

- Default curve (linear vs constant-power).
- N-way source model (positions of intermediate sources).
- Morph-snapshot integration with the value-layer snapshot model.
- Factor the shared blend/morph capability with the Vector Joystick.
