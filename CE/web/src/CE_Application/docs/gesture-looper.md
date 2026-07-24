# Gesture Looper — record your motion, loop it into the synth

> Status: **shipped 🟢**. The **human** counterpart to the
> [Orbit Modulator](./orbit-modulator.md): where the Orbit is geometric,
> mathematically perfect motion, the Looper replays *your own hand*. Part of the
> [panel parts backlog](./README.md).

## What it is

A stack of **lanes**. Press-and-move inside a lane and it captures your motion as
a **value-over-loop gesture**; release and it **loops on the clock**, replaying
into a bound parameter. Layer several lanes (cutoff sweep + a resonance wobble +
a slow drive swell) and you've drawn a living, personal modulation rig — no LFO
menus, no step grids. It's the most direct way to make a patch *breathe the way
you played it*.

## How it works

- **Pure engine** `utils/looperLayout.js` (+ `test/looperLayout.test.js`, 8 tests):
  normalized time (`phase ∈ [0,1]` across one loop) and value (`v ∈ [0,1]`).
  `laneValueAt` interpolates the recorded points **and wraps across the loop
  seam** so the loop is gap-free; `recordAppend` grows a take while deduping
  near-identical timestamps; geometry + `pxToLane`/`laneToPx` map the lane rows;
  dynamic `lane_N` ports + fan-out values at the current phase.
- **`LooperRenderer.svelte`** — each lane draws its gesture as a filled curve
  with a per-lane playhead dot, plus a shared sweeping playhead and a REC dot on
  the lane being recorded. Visual only.
- **Model** — `Looper` controlType + `Looper` section (`loopSeconds`, `running`,
  the `lanes[]` of `{ label, points, rest, enabled, colour }`). **Dynamic ports**:
  one `lane_N` per lane, so DeviceBindings lists every lane.
- **Self-running clock + recording** (`PanelPreviewSurface`) — the same lazy rAF
  ticker as the Orbit advances `phase` by `dt / loopSeconds` and fans out each
  lane (rate-capped + change-filtered via the shared `emitClockFanout`, so a loop
  never floods MIDI). Pressing inside a lane records a fresh take (x = loop
  position, y = value); it commits on release. Because the exported **Player
  mounts the same surface**, the loops run as a **live source driving real MIDI**.
- **`LooperEditor.svelte`** — Run / loop-length / display toggles + a lane table
  (label · colour · point-count · on/off · clear · add/remove · rest). Loader,
  Properties tab and palette entry included.
- **Value divisions** (optional) draw a value-scale across each lane using the
  **same `buildSliderTickStops` generator the sliders' ticks use** — one shared
  scale system across the app (also on the Turing, Macro and Router meters).

## Compatibility (the honest bit)

Works on **essentially any** MIDI synth with a device profile — the traffic is
light (you loop a few params, not dozens), the params are continuous (no zipper-
prone structural changes), and there's **no input dependency** (unlike the
Expression Router, nothing external needs to transmit). Over a DIN chain or USB
alike it's comfortable. It only drives parameters the profile exposes.

## Possible next steps

- **Record-any-control mode** — arm the Looper, then wiggle a *different* control
  and have the Looper capture that control's session stream (cross-control), on
  top of the current draw-in-lane mode.
- **Tempo sync** — lock `loopSeconds` to host bars/beats and retrigger on
  transport, instead of free-running seconds.
- **Per-lane quantize / smooth** — snap points to a grid, or slew the output.
