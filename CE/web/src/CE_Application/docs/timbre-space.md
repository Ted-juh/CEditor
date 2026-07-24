# Timbre Space — control a synth by meaning

> Status: **shipped 🟢** (v1). The headline "control by ear, not by knob"
> component: a 2D field whose axes are *musical intentions*, where one gesture
> morphs the whole patch. Part of the [panel parts backlog](./README.md); grew
> out of [groundbreaking-components.md](./groundbreaking-components.md).

## What it is

A wall of 60 knobs becomes **one gesture over perceptual axes**. You name the
axes (*dark ↔ bright*, *soft ↔ aggressive*), drop **anchors** — named patches
placed on the pad, each storing a value per morph target — and the **puck blends
them by distance**. Move toward "Screaming Lead" and the whole patch (cutoff,
resonance, drive, …) morphs that way; sit between anchors and you get the
in-between sound nobody saved. Nobody controls a hardware synth by "brightness";
this does.

## How it works

- **Pure engine** `utils/timbreLayout.js` (+ `test/timbreLayout.test.js`, 7 tests):
  everything is normalized 0..1. `anchorWeights` computes **inverse-distance
  weights** for the puck over the anchors (near an anchor its weight → ~1, so that
  patch wins); `targetValue` blends one target across the weighted anchors;
  `timbreOutputs` produces every target's value. Geometry + `pxToPuck`/`toPx` +
  anchor hit-test for dragging. Dynamic `target_N` ports + fan-out values.
  `timbreAddressableCount` powers the honesty readout.
- **`TimbreRenderer.svelte`** — each anchor paints a soft colour region (radial
  gradient), named dots, a glowing puck, axis labels, and a corner readout of how
  many targets are MIDI-addressable. Visual only.
- **Model** — `Timbre` controlType + `Timbre` section (`x`, `y`, `power`,
  `axisX`/`axisY`, the `targets[]` and `anchors[]` with a `values` map per
  target). **Dynamic ports**: one `target_N` per target, so DeviceBindings lists
  every dimension.
- **Preview** (`PanelPreviewSurface`) — drag the **puck** to blend (fan-out on
  move, naturally throttled by pointer events) or drag an **anchor** to reposition
  a patch on the pad; both commit on release. Runs live in the exported Player
  (same surface).
- **`TimbreEditor.svelte`** — axis names, blend sharpness, display toggles, a
  targets table, and an anchors table with a **per-target value grid** and X/Y.
  A live "N of M targets are MIDI-addressable" note. Loader, Properties tab and
  palette entry included.

## Compatibility (the honest bit)

Works wherever the target parameters are **MIDI-addressable in the device
profile** — the pad only morphs the addressable slice of a patch, and the corner
readout tells you exactly how much (e.g. "12/40 MIDI"). It shines on **USB-MIDI**;
on a DIN chain a big morph is bandwidth-heavy, so the fan-out is change-filtered
(only params that actually moved are sent). 7-bit CC targets can zipper on slow
morphs; NRPN/sysex targets morph cleanly.

## Possible next steps (v1 → v2)

- **Capture-from-patch** — a "set this anchor from the current device state"
  button, so anchors are grabbed by ear instead of typed into the value grid
  (needs a live patch/snapshot read). This is the biggest UX win.
- **Snapshot anchors** — back anchors with the reusable snapshot system so they
  round-trip with presets (shared with Snapshot-Morph).
- **Auto-axes** — derive a "brightness" direction from two captured patches via
  DPD instead of hand-placing anchors.
- **Contour rings / value tooltips** and a wander/auto-drift mode.
