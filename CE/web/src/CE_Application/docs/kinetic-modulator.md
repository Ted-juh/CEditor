# Kinetic Modulator — physics you fling

> Status: **shipped 🟢**. The **physical** member of the clock-driven modulation
> family: after the Orbit (geometric), the [Gesture Looper](./gesture-looper.md)
> (human) and the [Turing](./turing-modulator.md) (generative), this is motion
> that obeys *physics*. Part of the [panel parts backlog](./README.md).

## What it is

A ball in a box. **Gravity** pulls it, **walls bounce** it (restitution), **air
drag** slows it — and you **fling it** with the pointer. Its position and speed
become modulation: bind **X**, **Y**, **Speed**, and a **Bounce** gate that
pulses on every wall hit. Set gravity to zero for a perpetual billiard drift;
turn it up for a falling-and-settling bounce; crank restitution to 100 % for
endless motion. Organic, physical, alive — a modulation source with real inertia.

## How it works

- **Pure engine** `utils/kineticLayout.js` (+ `test/kineticLayout.test.js`, 8
  tests): the physics **step is a pure function** — `stepKinetic(state, dt,
  params)` integrates velocity, applies gravity + drag, reflects off the four
  walls with restitution, clamps speed, and flags a `bounced` frame. `kineticKick`
  (also pure, randoms passed in) re-energizes a stalled ball. Geometry + px
  round-trip, speed normalize, static `x`/`y`/`speed`/`bounce` ports + fan-out
  values from the injected state.
- **`KineticRenderer.svelte`** — the box + walls, a fading comet trail, the ball
  (glow + radius grow with speed) and a gravity-direction hint. Visual only.
- **Model** — `Kinetic` controlType + `Kinetic` section (`gravity`, `restitution`,
  `friction`, `keepAlive`, the `initial` state). Static ports in `componentPorts`.
- **Physics ticker + fling** (`PanelPreviewSurface`) — the shared rAF clock
  integrates each running ball (state + trail in plain maps, since physics is
  stateful) and fans out `x`/`y`/`speed`/`bounce` (rate-capped via
  `emitClockFanout`). A **keep-alive** kick keeps a stalled ball lively.
  **Flinging**: dragging moves the ball and derives a throw velocity from the
  pointer's recent motion; on release it flies off and the ticker takes over.
  Generative state stays **ephemeral** (never saved). Runs live in the exported
  Player (same surface).
- **`KineticEditor.svelte`** — Run / Fling toggles, a Reset button, and sliders
  for **Gravity / Bounce / Drag / Keep-alive**, plus appearance colours and the
  four output-port chips. Loader, Properties tab and palette entry included.

## Compatibility

Works on **any** MIDI synth with a device profile. The `bounce` gate pairs
naturally with a switch/boolean parameter (e.g. retrigger, sync); `x`/`y`/`speed`
are continuous. Traffic is rate-capped like the other clock sources. No input
dependency.

## Possible next steps

- **Tempo-locked kicks** — sync the keep-alive kick (or a periodic impulse) to
  the beat for rhythmic bounces. *Partly* addressed: *Kinetic → Sync to
  transport* now advances the simulation in musical time off the
  [Transport](./transport.md), so tempo scales the motion and stopping freezes
  the ball. It does **not** put the bounces on the beat — this is an
  integrator, not a phase, so unlike the other synced components it can't be
  recomputed from the position and won't re-align after a stall. A kick fired
  on a step boundary is still the missing piece.
- **Multiple balls** — a small swarm, each a fan-out port (like the Orbit's
  satellites).
- **Shaped fields** — circular / angled walls, attractors, or a paddle you can
  place; a "pinball" mode.
