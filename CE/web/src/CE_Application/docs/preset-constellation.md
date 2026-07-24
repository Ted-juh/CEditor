# Preset Constellation — your sound library as a map

> Status: **shipped 🟢**. Browsing 300 presets as a list is miserable; as a *map*
> you navigate by ear and by proximity, and the in-between positions give you the
> sounds nobody saved. Part of the [panel parts backlog](./README.md); the last
> big idea from [groundbreaking-components.md](./groundbreaking-components.md).

## What it is

Presets are **stars** on a 2D field. A **probe** moves over them: in **Snap** mode
the nearest star is **recalled** exactly (discrete patch recall); in **Blend** mode
the nearby stars are **morphed** by distance (continuous). Faint **links** connect
each preset to its **sonically-nearest neighbours**, drawing the constellation.
**Auto-arrange** lays the stars out by similarity so alike sounds cluster.
**Wander** drifts the probe through the space on the clock for hands-free
exploration. Every target is a bindable port (the fan-out).

## How it works

- **Pure engine** `utils/constellationLayout.js` (+ `test/constellationLayout.test.js`,
  10 tests): each preset carries a value per target — its patch *is* its feature
  vector. `nearestPreset` (by screen position) drives Snap + selection;
  `blendWeights` (inverse distance) drives Blend; `constellationLinks` finds each
  preset's k nearest neighbours by **feature** distance (deduped pairs);
  `autoArrange` is a deterministic **pivot projection** of the feature vectors to
  2D (poles at the extremes, identical presets coincide); `wanderPos` is a
  Lissajous. Dynamic `target_N` ports + fan-out values + `captureConstellationValues`.
- **`ConstellationRenderer.svelte`** — the field, similarity links, preset stars
  (selected one haloed + named), the probe, and a mode / selected-preset readout.
- **Model** — `Constellation` controlType + section (`mode`, `blendPower`,
  wander, `showLinks`/`linkCount`, the `targets[]` and `presets[]`). Dynamic
  per-target ports.
- **Preview** (`PanelPreviewSurface`) — drag the **probe** to recall/morph or a
  **star** to reposition it; fan-out on move, commit on release. **Wander** uses
  the shared clock to drift the probe (rate-capped fan-out). Runs live in the
  exported Player.
- **`ConstellationEditor.svelte`** — mode / wander / blend / links, an
  **Auto-arrange** button, a targets table, and a presets table with a per-target
  value grid, **Capture-from-patch** (stamp a star from the panel's current bound
  controls, shared with the Timbre logic), X/Y, and appearance colours. Loader,
  Properties tab and palette entry included.

## Relationship to the Timbre Space

Both blend patches by 2D position, but the Constellation is about a **library**:
discrete **recall** (snap) vs morph, **similarity links + auto-layout** (the map
is derived from the sounds, not hand-authored axes), and **wander**. The Timbre
Space is about **named perceptual axes** you author. They complement each other.

## Compatibility

Works wherever the target parameters are MIDI-addressable in the device profile —
same as the Timbre Space / Macro. Snap recall is a single discrete jump (light
traffic); Blend/Wander are change-filtered like the other clock sources.

## Possible next steps

- **Device-runtime capture** — capture a star from the live hardware state, not
  just the panel's bound controls.
- **True MDS layout** — replace the pivot projection with an iterative stress-
  minimising embedding for a more faithful similarity map.
- **Import a preset bank** — populate the stars from a device patch dump.
