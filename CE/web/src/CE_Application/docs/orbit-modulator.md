# Orbit Modulator — a spatial poly-LFO

> Status: **shipped 🟢**. A genuinely new control category for this editor: a
> modulation **source** that animates *itself* and that you *choreograph in
> space*. Part of the [panel parts backlog](./README.md); grew out of the
> "truly unique, boundary-pushing" ideation in
> [groundbreaking-components.md](./groundbreaking-components.md).

## What it is

Every other native control here is **user-driven** — a knob, a puck, a fader you
grab. The Orbit is the first that **runs on its own**: satellites sit in a
circular field and orbit the centre, each at its own rate and direction. Each
satellite emits a live **0–1 modulation value from its position**, and each is a
**bindable port** — so one Orbit fans out to many device parameters at once. It's
a modulation source you can **see and arrange**, not a hidden LFO in a menu.

Think "poly-LFO you choreograph": drag a satellite out to a big radius for a
wide sweep, spin it fast for a tremolo, park two at different angles for a
phase-offset pair, invert one for a counter-sweep.

## How it works

- **Pure engine** `utils/orbitLayout.js` (+ `test/orbitLayout.test.js`, 10 tests):
  a global `phase` (0–1, looping) is the clock. Each satellite has a `radius`
  (0–1), a base `angle`, a `ratio` (orbits per global cycle; sign = direction),
  an `output` mode and a `depth`. `nodeAngle`/`nodePos` place it; `nodeToPx`/
  `pxToOrbit` convert to/from pixels (round-trip tested) for dragging;
  `nodeProjection`/`nodeOutput` turn its position into the emitted value.
- **Output modes** — the satellite's value comes from **Y** (vertical),
  **X** (horizontal), **Sine** (of its live angle) or **Radius** (static
  distance), scaled by depth, optionally **inverted**.
- **`OrbitRenderer.svelte`** — faint dashed orbit rings, a centre hub, a spoke to
  each satellite, comet trails, and the glowing satellites (halo + body grows
  with the live value). Visual only; reads `Orbit.__phase` / `__drag`.
- **Model** — `Orbit` controlType + `Orbit` section (`phase`, `running`, `rate`,
  the `nodes[]`, display toggles). **Dynamic ports**: `getComponentPorts`
  generates one `node_N` port per satellite (like the Mod Matrix / Macro), so the
  DeviceBindings editor lists every satellite.
- **Self-running clock** (`PanelPreviewSurface`) — a lazy rAF ticker advances
  each running Orbit's phase by `rate·dt`, re-renders, and **fans out every
  satellite's value** to its bound parameter. It self-stops when no running Orbit
  remains (the Meter peak-hold pattern). Because the exported **Player mounts the
  same surface** (with `dryRun=false`), the Orbit runs as a **live modulation
  source driving real MIDI** — not just an editor animation. The fan-out is
  **rate-capped (~40 Hz) and change-filtered** per port, so a free-running
  modulator never floods the device and a parked satellite stays silent.
  Satellites can also be **dragged** to a new radius/angle (its base angle is
  back-solved so it sits under the cursor at the current phase), committed on
  release.
- **`OrbitEditor.svelte`** — a Run toggle + global Rate + display toggles, and a
  satellite table (label · colour · on/off · radius% · angle° · speed · output ·
  depth% · invert · add/remove).

## Why it fits this substrate

Pure parameter math + the **fan-out binding** — no DSP. The whole thing is
position → value → many MIDI parameters, exactly the cross-cutting capability the
Envelope / Mod Matrix / Macro already ride. It just adds the one new idea those
lacked: **time**. The clock lives in the preview surface, so the design surface
stays declarative and the engine stays pure and testable.

## Possible next steps

- **Phase sync** — bind the global phase to a host tempo / MIDI clock instead of
  free-running seconds (bars/beats, retrigger on transport).
- **Shapes beyond circles** — elliptical / Lissajous fields, or a "gravity" mode
  where satellites perturb each other.
- **Per-satellite smoothing** — optional slew so a fast satellite emits a rounded
  rather than stepped stream at the send cap.
