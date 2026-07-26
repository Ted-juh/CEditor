# Patch Diff / Compare — Feature Design

> Status: **design.** A/B "what changed" between states, plus a hardware-style
> Compare. Part of the [panel parts backlog](./README.md); ideation in
> [groundbreaking-components.md](./groundbreaking-components.md).

## What

- **Diff:** compare two states (current vs stored, or two snapshots) → a list of
  **which parameters changed** with old → new, semantically (names + formatted
  values).
- **Compare:** the hardware "Compare" button — temporarily revert to the stored
  patch to A/B your edits, then return.

## How

- **Diff** two [snapshots](./snapshots-morph.md) parameter-by-parameter over the
  value layer, using the **DPD** for semantic names + formatted values (e.g.
  "Cutoff 80 → 104", "LFO Wave Tri → Saw").
- Pair with the **Dump Analyzer**
  ([midi-workbench.md](./midi-workbench.md)) for the **byte-level** view of the
  same change (semantic + raw).
- **Compare** = swap live ↔ stored snapshot (recall stored, hold edits aside,
  restore on release).
- **Reuse:** snapshots · value layer · DPD · dump analyzer.
- **New:** the diff view UI (changed-parameter list) and the Compare toggle.

## Where

- A tool/panel in the editor (or in the MIDI Workbench), and/or a **Compare**
  button component on a performance panel.

## When

- **Sound design:** A/B your edits; see exactly what an edit touched.
- **Reverse-engineering:** which parameters/bytes a hardware change affected
  (pairs with the dump-diff workflow).

## New work

The diff renderer (semantic changed-list) and the Compare swap; the data all
comes from snapshots + DPD + the analyzer.

## Open questions

- Diff granularity (per-parameter; grouping; threshold for "changed").
- Compare scope (whole patch vs section).
- Three-way diff (factory vs stored vs live).
