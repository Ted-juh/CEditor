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
- **Velocity & expression:** see the dedicated section below (radial/positional
  velocity, zones, rolls, held expression).
- **Pad behavior:** momentary · toggle · one-shot; **choke groups** (one pad in a
  group silences the others); latch.
- **Banks / pages:** a bank selector remaps the whole grid's assignment → one grid
  covers many pad sets (4 drum kits, octave shifts, scene pages).
- **Pad LED feedback:** incoming MIDI lights pads (Launchpad-style) — this is the
  **read-only / value-driven display** capability applied per cell (see
  [meter-and-mod-matrix.md](./meter-and-mod-matrix.md)).
- **Rendering/styling:** per-pad label / color / icon via per-cell overrides
  (like radio-group `segmentStyle`); pressed/active/lit states.

## Velocity & expression (per-pad)

Turn a flat pad into an **expressive surface** — hit position drives dynamics.
All from the pointer/touch point + pad geometry (no audio needed).

- **Velocity source** (`velocityMode`):
  - `fixed` — constant.
  - `vertical` — y within the pad (top/bottom = loud/soft).
  - **`radial`** — distance from the pad **center**: center = loud → edge = soft,
    or **inverted** (edge = loud). Mimics striking a real drum head. Just
    `distance(hit, center)` normalized over the pad radius.
  - `pressure` — where the input supports it.
  - plus a **velocity curve** (linear / exp / log) applied to the source.
- **Positional zones** (optional, real-drum-like): split a pad into **center vs
  rim** (or more zones) → different note and/or velocity per zone (snare head vs
  rim-shot, bell vs bow). Radial position selects the zone.
- **Roll / retrigger:** hold a pad → **repeat** the note at a rate (Timer-driven).
  - **Roll dynamics:** constant · crescendo · decrescendo · **follow position**
    (move toward center mid-roll → louder).
  - **Roll rate** can be fixed, or driven by **radial position / pressure** (closer
    to center / harder = faster roll) — expressive buzz-roll.
  - *Caveat:* the timer is wall-clock ms (no tempo-sync — see
    [timer-system.md](./timer-system.md)); tempo-locked rolls need a clock source.
- **Held expression** (optional): while a pad is held, map position/pressure to
  **aftertouch** or a **CC** (continuous), so a held pad keeps modulating.

These are per-pad, configurable, and default off (a plain pad just sends a fixed
or vertical velocity). Feasibility: radial = simple distance math; zones = radius
threshold; roll = Timer retrigger; held expression = pointer-move → CC/AT.

## Fire modes / shot patterns (per-pad)

Everything a single press can produce *over time*. Modeled as one **fire pattern**
= an ordered list of events `{ timeOffset, velocity (or curve-driven), pitchOffset,
probability }` + repeat/loop settings — driven by the [Timer](./timer-system.md),
with velocity shaping optionally from the **breakpoint-curve engine**
([envelope-curve-editor.md](./envelope-curve-editor.md)).

Because these are all "how a press fires" (one category), they ship as **in-pad
presets**, not separate components:

- **Single** — one note (default).
- **Flam / Drag / Ruff** — 2 / 3 / N rapid grace-hits before the main note
  (drum rudiments); configurable spacing + velocity ramp.
- **N-shot (double / triple…)** — N evenly-spaced hits on one press.
- **Ratchet / Burst** — a fixed count of subdivided hits (sequencer-style).
- **Roll** — sustained repeat while held (rate fixed or radial/pressure-driven).
- **Crescendo / Decrescendo / Swell** — a multi-hit run whose velocity **ramps**
  (up / down / up-then-down) via a curve over a duration.
- **Strum / Spread** — stagger the notes of a chord (reuses the
  [chord generator](./chord-generator.md)).
- **Phrase** — a short note sequence/pattern per press (reuses the arpeggiator).
- **Round-robin** — successive presses cycle through alternate notes (realism).
- **Stutter / Gate** — rapid on/off gating while held.

**Modifiers (any pattern):** humanize (timing/velocity jitter) · per-hit
**probability** · accent pattern · rate (ms — wall-clock; tempo-lock needs a clock
source). All default to **Single**.

> This makes the pad fire pattern a tiny per-pad event generator — and the
> convergence point of nearly every engine: **Timer** (timing), **note-emit**,
> **breakpoint-curve** (velocity ramps), **chord** (strum), **arpeggiator**
> (phrase). One more reason it's the best proof-of-value for the shared
> foundations.

## Where (integration)

- **controlType:** `PadGrid`; **palette:** its own entry (generative-MIDI family).
- **Engines reused:** generator-grid · note-emit substrate · button
  trigger-action binding · shared key/scale context · Timer (roll).
- **Files to change:**
  - `models/componentTypes.js` — `PadGrid` entry.
  - `models/interactionDefaults.js` — pad behavior (mode / velocity & expression /
    choke / banks) + cell generation.
  - Generators / `Grid` — the cell layout.
  - `models/componentPorts.js` — per-pad **note/trigger outputs** (generative /
    fan-out), a **bank-select input**, optional per-pad **lit input**
    (device→pad LED), and (for held expression) **aftertouch / CC outputs**.
  - `layout/IconPanel.svelte` — "Pad Grid" palette button.
  - `editor/PanelPreviewSurface.svelte` — pad press / velocity-from-position /
    emit + choke + lit + roll retrigger + held expression.
- **Schema:** `padMode` (drum/melodic/trigger), `velocityMode`
  (fixed/vertical/**radial**/pressure) + `velocityInvert` + `velocityCurve`,
  `zones` (center/rim → note+velocity), `firePattern` (`{ preset:
  single/flam/drag/nShot/ratchet/roll/crescendo/swell/strum/phrase/roundRobin/
  stutter, events[], rate, rateSource, velocityCurve, humanize, probability }`),
  `heldExpression` (`{ target: none/aftertouch/cc, source }`),
  `behavior` (momentary/toggle/oneShot), `chokeGroup`, `layout`
  (manual/chromatic/scale/isomorphic), `keySource`, banks.

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

rows/cols · `padMode` · per-pad assignment (note / trigger / label / color) ·
**velocity & expression** (`velocityMode` incl. radial + invert + curve · zones ·
held expression) · **fire pattern** (single/flam/N-shot/ratchet/roll/crescendo/
swell/strum/phrase/round-robin/stutter + humanize/probability) · pad `behavior` +
`chokeGroup` · `layout` + `keySource` (shared key/scale) · banks/pages · styling.

## States

pad pressed · active/held · **lit** (from incoming note) · focused · disabled.

## Verification

1. Insert → grid of pads (configurable rows×cols).
2. Drum mode: press → note-on with velocity; release → note-off; choke groups cut.
   Radial velocity: hits near center are louder (or inverted); zones swap
   note/velocity center vs rim.
3. Fire patterns: a press fires single / flam / N-shot / ratchet; hold → roll;
   crescendo/swell ramps velocity; strum spreads a chord; round-robin cycles
   notes across presses; humanize/probability vary it.
4. Melodic mode: scale-locked layout plays in the panel's key; change key → re-maps.
5. Trigger mode: pad fires CC/PC/SysEx/action.
6. Banks: switching bank remaps the grid.
7. Pad-LED: incoming notes light the matching pads.

## Open questions / future

- Isomorphic layout math (interval-per-row/col).
- Bank model (stored assignment sets vs octave/transpose offsets).
- Per-pad LED feedback = the read-only display capability applied to cells.
- Relationship to Mod matrix & Step sequencer (shared engine, separate kinds).
