# Vector Joystick (4-corner morph) — Component Design

> Status: **shipped 🟢** as the `VectorJoystick` controlType. Original design
> notes follow.

## Shipped

An interactive XY pad — a draggable puck that blends four corner sources by
bilinear weight and drives X/Y axes, with spring-return-to-rest.

- Pure engine `utils/joystickLayout.js` (+ `test/joystickLayout.test.js`, 5
  tests): px round-trip, bilinear corner weights, bipolar/unipolar axis mapping,
  the fan-out port values, and the spring-return glide step.
- `JoystickRenderer.svelte`: pad grid, crosshair, corner markers + labels, the
  puck, and an optional fading motion trail. Visual-only.
- Model: `VectorJoystick` controlType + `Joystick` section + six ports
  (`x`, `y`, `cornerTL/TR/BL/BR`).
- Interaction (`PanelPreviewSurface`): absolute puck drag (click jumps the puck),
  live into a session copy, committed on release; **spring-return-to-centre** on
  release (rAF glide, per-axis, configurable speed) — the pitch/mod-wheel feel.
- **Fan-out binding:** the two axes + four corner blends are each a bindable
  port (via `controlPortValues`), so one joystick drives up to six device
  parameters at once (reuses the Envelope/Matrix mechanism).
- `JoystickEditor.svelte` inspector: rest position, bipolar, return-to-rest
  (axes + speed), corner labels, grid/crosshair/trail, colours.

**Remaining:** a corner-morph *output* value (the mixed A/B/C/D result as a
single signal) if a use case needs it — today each corner weight is its own
port, which covers vector-synth blending and XY modulation.

## Original design

> A new `controlType` reusing the XY-pad engine + the Ribbon's return behavior.

## What

A 2D control (joystick/pad) whose X/Y position is converted into **blend weights
for 4 corner sources** — vector synthesis (Prophet VS / Korg Wavestation /
Roland D-50 vector joystick). The output is "how much of each corner (TL/TR/BL/BR)
is mixed in" by proximity, not raw X/Y.

Four **labeled corners**, a draggable puck/crosshair, optional **spring-return to
center** (equal blend). Distinct from the plain XY Pad, which emits raw X/Y.

**Use cases:** vector synthesis morph · 4-way macro morph · **blending 4 patches/
snapshots** (→ Snapshot-Morph pad, see
[groundbreaking-components.md](./groundbreaking-components.md)) · 4-way crossfade.

## How

- **Position → corner weights.** Map (x, y in 0..1) to 4 weights that sum to 1:
  - **bilinear** (default): `wTL=(1-x)(1-y)`, `wTR=x(1-y)`, `wBL=(1-x)y`,
    `wBR=xy`; or
  - **radial**: weight by inverse distance to each corner.
- **Spring-return to center** on release (`returnMode: center`, instant or glide)
  — **reuse the Ribbon's return behavior** (`returnMode`/`returnTime`/`returnCurve`).
  See "Shared capability" below.
- **Engine reused:** the XY-pad primitives (`type:'xy-pad'`, `geometry:'xy'`, the
  `xy` dual-axis hit zone) from `utils/customComponentFactory.js` /
  `CustomBehaviorsEditor.svelte` — 2D pointer→position is already solved.
- **Rendering:** a 2D pad area + draggable puck + 4 corner labels; optional
  **weight visualization** (corner glow proportional to weight, or a filled
  quad). Reuses XY-pad rendering + corner decorations.

## Where (integration)

- **controlType:** `VectorPad`; **palette:** its own entry near XY Pad.
- **Engine reused:** XY-pad behavior/geometry/hit-zone; the Ribbon return behavior.
- **Files to change:**
  - `models/componentTypes.js` — `VectorPad` entry (square default, e.g. 160×160).
  - `models/interactionDefaults.js` / custom behavior — xy + **corner-mix mode** +
    **returnMode** + 4 corner labels/targets.
  - `models/componentPorts.js` — **4 corner-weight outputs** (`wTL/wTR/wBL/wBR`)
    via fan-out binding; or `x`/`y` continuous; or (snapshot mode) none — it
    computes per-parameter values and sends.
  - `layout/IconPanel.svelte` — "Vector Pad" palette button.
  - `editor/PanelPreviewSurface.svelte` — 2D drag + weight calc + return.
- **Schema:** `cornerMix` (bilinear/radial), `returnMode` (shared), 4 corner
  labels + targets/snapshots.

## When

- **vs XY Pad:** XY Pad emits **raw X/Y** (2 values — e.g. cutoff/res); Vector
  joystick emits **4 blend weights** (morph between 4 things). Both 2D, different
  semantics → separate components reusing one engine (per
  [ready-made-vs-custom.md](./ready-made-vs-custom.md)).
- **Emit/commit:** continuous weights while dragging; on release, return-to-center
  if set.
- **Snapshot-Morph mode (the flagship use):** assign a full patch **snapshot to
  each corner** → the joystick morphs the entire device state across 4 patches
  (value layer + DPD ranges). This is where it becomes groundbreaking.
- **Target-aware** MIDI out (weights drive params, or the morph computes per-param
  values and sends) — standalone port vs plugin host bus.

## Shared capability — factor out "return behavior"

Both the **Ribbon** (1D) and this (2D) need spring-return to a rest position; the
**pitch wheel** does too. Factor `returnMode` / `returnValue` / `returnTime` /
`returnCurve` into a **shared behavior capability** rather than reimplementing per
component — same "one capability, many components" pattern as fan-out binding and
the read-only display mode.

## Properties (editor)

corner-mix mode (bilinear/radial) · 4 corner labels + targets/snapshots · return
mode/time/curve · puck style · weight visualization (glow/quad) · X/Y min/max
(raw mode).

## States

active/dragging (puck glow) · focused · disabled.

## Verification

1. Insert → 2D pad, 4 corner labels, center puck.
2. Drag → corner weights update (corner glow tracks proximity); weights sum to 1.
3. Release → returns to center if `returnMode: center` (instant or glide).
4. Assign 4 snapshots → morph the whole patch across corners (value layer).
5. Bind the 4 weights to params (fan-out) → two-way; export as appropriate.

## Open questions / future

- bilinear vs radial vs custom mix curve.
- True 4-output fan-out vs compute-and-send (snapshot mode bypasses simple ports).
- Snapshot-corner integration with the value-layer snapshot model.
- Multi-touch / two-puck (dual morph) — out of scope v1.
