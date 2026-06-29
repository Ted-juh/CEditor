# Envelope / Curve Editor — Investigation

> Status: **investigation / design.** "ADSR" is one preset of a much larger
> family; the flexible answer is a single breakpoint/curve engine with presets.
> Part of the [panel parts backlog](./README.md); see
> [component-gaps.md](./component-gaps.md) and
> [ready-made-vs-custom.md](./ready-made-vs-custom.md).

## The family (ADSR is just one member)

**Stage-based envelopes:** AR · AD · ASR · **ADSR** · DADSR · AHDSR/**DAHDSR**
(delay/hold) · Roland-style ADBDR / ADBSSR (break points) · Yamaha DX
**4-rate/4-level** (rate+level pairs).

**Free multi-segment:** **MSEG** (arbitrary breakpoints, per-segment curve — the
modern general case) · looping envelopes / function generators (loop start/end,
one-shot vs loop) · trapezoid.

**Cyclic / LFO shapes:** LFO with waveform select (sine/tri/saw/square/pulse/
S&H/random) · **custom-shape LFO** (draw-your-own cycle = a looping MSEG) ·
**step LFO / step-mod sequencer** · rate/sync/phase/depth/fade.

**Transfer / response curves (not time-based):** velocity curve · key-tracking /
keyboard-scaling · pitch-bend / aftertouch response · waveshaper transfer
function · pan / crossfade curves.

## Insight: one engine, many presets

Nearly all of the above are the **same primitive — a draggable multi-point
editor over a 2D area with per-segment curve shapes** — differing only in:

- axis meaning (time vs input-value vs phase),
- point constraints (fixed stages for ADSR vs free for MSEG),
- markers (sustain point, loop start/end),
- looping / tempo-sync,
- how points map to parameters.

So the "ready-made but flexible" answer is **one Envelope/Curve editor** whose
**presets are** ADSR, AR, DAHDSR, LFO-shape, velocity-curve, MSEG, step. Build
the breakpoint engine once; ship the presets.

## Reusable vs genuinely new

**Reusable primitives (already in the codebase):**
- `components/GradientEditor.svelte` — a draggable **stop/breakpoint editor**
  (points along an axis with position + value + interpolation). Closest analog.
- Flow-path editing in `editor/CanvasControl.svelte` + `sections/TextEditor.svelte`
  — draggable polyline / bezier control points on the canvas.
- `editor/SliderFamilyRenderer.svelte` point/geometry math; the Animations
  keyframe concept (`sections/AnimationsEditor.svelte`).

**Genuinely new:**
- A **segment/curve model** — points + per-segment shape (linear/exp/log/S-curve),
  plus **markers** (sustain, loop start/end).
- **Multi-parameter binding (the distinguishing requirement).** An envelope maps
  to *many* device parameters at once (attack time, decay time, sustain level,
  …) — unlike every single-value control so far. Needs the custom component's
  multi-channel `PublishedProperties` / `ValueChannels`, or a native multi-port
  control. This is the real architectural lift.

## Recommendation

1. Build/define a **breakpoint-curve engine** (points + per-segment curve +
   markers), reusing the gradient-stop drag mechanics and flow-path editing.
2. Ship **presets**: ADSR / AR / DAHDSR (constrained stages), MSEG (free),
   LFO-shape (looping), velocity/response curve (input→output axis), step.
3. Solve **multi-parameter binding** (per-node → device parameter) — likely the
   first control to need many ports; lean on the custom-component multi-channel
   model or define a multi-port native control.
4. Per [ready-made-vs-custom.md](./ready-made-vs-custom.md): unlike the XY pad,
   there are **no envelope primitives today**, so this is real new capability —
   but doing it as one engine + presets avoids building N fixed widgets.

## Open questions

- Native control vs a custom-component library preset? (Custom gives multi-channel
  binding for free but lacks the breakpoint-drag UI; native needs new binding.)
- Tempo-sync for LFO shapes — out of scope per the timer system (wall-clock only);
  tempo-locked modulation would need a clock source (not a timer concern).
- How per-node values map to DPD parameters (a per-node binding table).
