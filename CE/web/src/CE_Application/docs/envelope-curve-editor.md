# Envelope / Curve Editor — Investigation

> Status: **core shipped 🟢** (Envelope component with the breakpoint engine +
> presets). Multi-parameter fan-out binding + LFO/response-curve sibling
> components remain — see "Remaining" below. Original design notes follow.

## Shipped

An interactive **Envelope** palette component built on one reusable
breakpoint-curve engine (as the doc recommends — not a one-off ADSR widget):

- Pure engine `utils/envelopeLayout.js` (+ `test/envelopeLayout.test.js`, 9
  tests): normalized points, px round-trip, per-segment curve sampling
  (linear/exp/log/scurve/hold), `envValueAt`, node hit-test, drag with x-monotonic
  + end + y-lock constraints, add/remove, and presets.
- Presets: **ADSR / AR / AD / DAHDSR** (constrained stages) + **MSEG / Free**
  (every node moves). Sustain marker; loop start/end markers.
- `EnvelopeRenderer.svelte`: SVG grid, filled area, per-segment curve line,
  draggable nodes, sustain + loop markers, moving playhead dot.
- Interaction (`PanelPreviewSurface`): drag a node (live session copy, committed
  to the model on release), double-click to add / remove, optional x/y snap.
- `EnvelopeEditor.svelte` inspector: preset picker, per-node x/y/curve table,
  sustain node, loop, snap, playhead source, full styling. Model:
  `Envelope` controlType + section + stage ports (attack/decay/sustain/release).

**Remaining:** full per-node → device-parameter **fan-out binding** (the doc's
"real architectural lift"; the four stage ports cover the common ADSR case for
now), and the **LFO** / **response-curve** sibling components that reuse the same
engine.

## Original investigation

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

So the "ready-made but flexible" answer is **one breakpoint engine** reused
across these. But apply the shared-engine-separate-components principle
([ready-made-vs-custom.md](./ready-made-vs-custom.md)):

- **Envelope shapes are genuinely one category** (ADSR / AR / AD / DAHDSR / MSEG /
  step are all "an envelope") → one **Envelope** component with these as internal
  presets. ✅ legitimate preset use.
- **LFO** and **transfer/response curve** are arguably *different kinds* of
  control (cyclic modulator; input→output map) even though they share the
  breakpoint engine → lean toward **separate palette components** (LFO, Curve)
  that reuse the same engine, rather than folding them into "Envelope".

Build the breakpoint engine once; decide grouping by category, not by engine.

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
