# Snapshots & Morph — Capability Design

> Status: **design / capability.** Capture the full panel/device state, recall it,
> and **interpolate between snapshots**. A foundation (like the Timer) that many
> components consume. Part of the [panel parts backlog](./README.md).

## Why

Unlocks a whole class of components and the groundbreaking tier:

- **Macro / Snapshot-Morph** (headline), **Vector Joystick** (4 snapshot corners),
  **Crossfader** (A↔B morph), **scene launcher** (Pad Grid → recall),
  **Patch Diff / Compare** (two snapshots), **Randomizer** (generate a snapshot).

All are "blend/recall full device states" — pure parameter math + MIDI, **no
audio**.

## What — the model

- **Snapshot** = a captured set `{ paramPath/channel → value }` of the panel's
  bound values (whole panel, a group, or a selected scope). Named, optionally
  tagged/colored. Serializable into the panel document.
- **Snapshot store** = a list of snapshots on the panel.
- **Operations:** `capture` (read current values), `recall` (write back + send),
  `morph` (interpolate between two or N weighted snapshots at a blend position).

## How — engine

- **Value layer** is the substrate: `Player/PanelValueModel.h` (and the JS panel
  value model) already mirror the full panel/device state and navigate
  control/section/property paths — capture/recall read/write it.
- **DPD drives interpolation correctness** (per-parameter type/range):
  - continuous / bipolar / normalized → **lerp**,
  - stepped / enum / choice → **nearest** or **threshold-cross** (configurable),
  - text / patchName / trigger → **not morphed** (take from nearest end / hold).
- **Weighted N-snapshot morph** = the blend/morph math (position → weights) applied
  across snapshots — shared with the Vector Joystick / Crossfader (see
  [link-mapper-component.md](./link-mapper-component.md) and the blend capability).
- **Throttling (important):** a morph changes *many* params continuously → coalesce
  per frame and **rate-limit MIDI** (e.g. `AsyncUpdater` / a send budget) to avoid
  flooding the device. State the guarantee.

## Where (integration)

- **Model/store:** a new **`Snapshots`** section in `models/sectionDefaults.js`
  + a `stores/snapshots.js` (list, capture/recall/morph).
- **Scripting API:** `captureSnapshot(id, scope)`, `recallSnapshot(id)`,
  `morphSnapshots(a, b, t, scope)`, `morphWeighted([{id, weight}], scope)`.
- **C++:** value-layer read/write exists; add capture/recall/morph over the
  mirror (PanelValueModel + bridge), or compute JS-side and write through.
- **Output:** target-aware MIDI path (standalone port vs plugin host bus).

## Consumers

Macro (via Mapper) · Vector Joystick (snapshot per corner) · Crossfader (A/B) ·
Pad Grid (scene-launch recall) · Patch Diff/Compare · Randomizer.

## When / semantics

- **Scope:** whole panel, a group, or a parameter selection (morph just the
  filter section, etc.).
- **Recall** = instant write + send; **morph** = continuous along a blend control.
- Interpolation rules come from the DPD (above); non-interpolatable params hold or
  snap.

## Relationship to device presets

A **snapshot** is panel-captured values (recall = *send* them to the device).
A **device preset** lives on the hardware ([preset-model.md](./preset-model.md))
and is recalled by a program-change/SysEx. Related but distinct: you can capture
the current device state as a snapshot, or recall a preset then snapshot it. Keep
the models separate; allow conversion.

## Open questions / future

- Storage shape & size (full vs partial/sparse snapshots — only captured params
  morph).
- MIDI flood throttling policy (coalesce + send budget) — concrete numbers.
- Enum/stepped interpolation policy (nearest vs threshold) default.
- Whether morph runs in C++ (PanelValueModel) or JS over the mirror.

---

## Built, 2026-08-23

`utils/snapshotModel.js`, `stores/snapshots.js`, `utils/panelValueAccess.js` and the Snapshots tab,
pinned by `test/snapshots.test.js`.

**Interpolation policy comes from `valueKind`**, the field Total Recall S1 added so a selector
reaches a host as an `AudioParameterChoice` rather than an anonymous float. It answers this question
too, so nothing new is declared per parameter: `choice`/`bool` → nearest, text and patch names →
hold, everything else → lerp. There is no waveform 1.5.

**Reading a value needed its own module first.** `panelValueAccess.js` exists because a control's
current value lived in three different places depending on which export door the parameter came
through — `valueOverride`, `customValues[leaf]`, `sectionValues`. `readParameterValue` returns
`undefined` rather than a fallback number for a control nobody has touched: a snapshot full of
zeroes recalls a panel to zero, which is a reset wearing a snapshot's clothes.

**A parameter present in only one snapshot is carried through, not blended toward nothing.** That is
what makes a partial snapshot — "just the filter" — composable with a whole-panel one instead of
quietly resetting everything it does not mention.

**Sending is budgeted.** DIN MIDI is 31,250 baud, about a thousand three-byte messages a second for
everything the panel wants to say. `morphSendPlan` coalesces per frame, caps at 32, orders by how
far each parameter moved so a sweep still looks right while throttled, and *counts* what it deferred
rather than dropping it silently.
