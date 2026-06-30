# Pad Grid (Drum / Performance) — Component Design

> Status: **design / ready to spec into build.** A versatile generative-MIDI grid
> reusing the generator-grid engine + note-emit substrate. Full what/how/where/
> when. Part of the [panel parts backlog](./README.md); mini-spec context in
> [conventional-components.md](./conventional-components.md).

## What

A grid of triggerable **pads** (rows × cols). Designed to be **versatile** within
the performance-triggering domain — one component, several *pad modes*:

- **Drum pads** — each pad sends a fixed MIDI note + velocity (momentary).
- **Melodic / scale pads** — pads laid out chromatically or **scale-locked** to a
  key (reads the shared panel key/scale context — see
  [chord-generator.md](./chord-generator.md)); isomorphic layouts (4ths/3rds,
  Launchpad/Linnstrument style).
- **Trigger pads** — each pad fires an action / CC / Program Change / SysEx
  (scene launch, preset recall, panic) — reuses the button trigger-action binding.

> Versatile **within its kind** (performance note/trigger output). It is a
> *separate component* from the **Mod matrix** (param routing) and **Step
> sequencer** (timed pattern), which share the same grid engine but are different
> *kinds* (per [ready-made-vs-custom.md](./ready-made-vs-custom.md)).

## How

- **Grid generation:** the custom-component **Generators** already emit grid cells
  (`rows × cols`, `parts = rows*cols` — `CustomGeneratorsEditor.svelte`) + the
  `Grid` section. Reuse for the pad layout.
- **Note emit:** reuse the arpeggiator note model + MIDI helpers
  (`utils/customComponentArpeggiator.js`) + the runtime MIDI-out path.
- **Velocity:** from click **position** (e.g. y within the pad), **pressure**
  (where supported), or **fixed**; optional accent.
- **Pad behavior:** momentary · toggle · one-shot; **choke groups** (one pad in a
  group silences the others); latch; optional **roll/repeat** (Timer-driven).
- **Banks / pages:** a bank selector remaps the whole grid's assignment → one grid
  covers many pad sets (4 drum kits, octave shifts, scene pages).
- **Pad LED feedback:** incoming MIDI lights pads (Launchpad-style) — this is the
  **read-only / value-driven display** capability applied per cell (see
  [meter-and-mod-matrix.md](./meter-and-mod-matrix.md)).
- **Rendering/styling:** per-pad label / color / icon via per-cell overrides
  (like radio-group `segmentStyle`); pressed/active/lit states.

## Where (integration)

- **controlType:** `PadGrid`; **palette:** its own entry (generative-MIDI family).
- **Engines reused:** generator-grid · note-emit substrate · button
  trigger-action binding · shared key/scale context · Timer (roll).
- **Files to change:**
  - `models/componentTypes.js` — `PadGrid` entry.
  - `models/interactionDefaults.js` — pad behavior (mode/velocity/choke/banks) +
    cell generation.
  - Generators / `Grid` — the cell layout.
  - `models/componentPorts.js` — per-pad **note/trigger outputs** (generative /
    fan-out), a **bank-select input**, optional per-pad **lit input**
    (device→pad LED).
  - `layout/IconPanel.svelte` — "Pad Grid" palette button.
  - `editor/PanelPreviewSurface.svelte` — pad press/velocity/emit + choke + lit.
- **Schema:** `padMode` (drum/melodic/trigger), `velocityMode`
  (position/pressure/fixed), `behavior` (momentary/toggle/oneShot), `chokeGroup`,
  `layout` (manual/chromatic/scale/isomorphic), `keySource`, banks.

## When

- **Use for:** drum triggering, clip/scene launch, scale-locked melodic playing,
  bank-switched performance surfaces.
- **vs Mod matrix:** PadGrid = note/trigger *output*; Mod matrix = parameter
  *routing*. Same grid engine, different kind → separate components.
- **vs Step sequencer:** PadGrid = manual triggering; sequencer = Timer-driven
  pattern playback. Separate (sequencer can reuse the grid + Timer later).
- **Emit/commit:** momentary note-on at press (velocity), note-off at release;
  trigger pads fire actions at press; toggle pads hold state.
- **Target-aware** MIDI out (standalone port vs plugin host bus).

## Touches three cross-cutting capabilities

The versatile PadGrid leans on all three enablers from the backlog:
**note-emit** (drum/melodic), **fan-out binding** (per-pad assignment), and
**read-only display** (pad-LED feedback). Building those unlocks it.

## Properties (editor)

rows/cols · `padMode` · per-pad assignment (note / trigger / label / color /
velocity) · `velocityMode` · pad `behavior` + `chokeGroup` + roll · `layout` +
`keySource` (shared key/scale) · banks/pages · styling.

## States

pad pressed · active/held · **lit** (from incoming note) · focused · disabled.

## Verification

1. Insert → grid of pads (configurable rows×cols).
2. Drum mode: press → note-on with velocity; release → note-off; choke groups cut.
3. Melodic mode: scale-locked layout plays in the panel's key; change key → re-maps.
4. Trigger mode: pad fires CC/PC/SysEx/action.
5. Banks: switching bank remaps the grid.
6. Pad-LED: incoming notes light the matching pads.

## Open questions / future

- Isomorphic layout math (interval-per-row/col).
- Bank model (stored assignment sets vs octave/transpose offsets).
- Per-pad LED feedback = the read-only display capability applied to cells.
- Relationship to Mod matrix & Step sequencer (shared engine, separate kinds).
