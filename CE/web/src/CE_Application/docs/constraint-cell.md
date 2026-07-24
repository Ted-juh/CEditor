# Constraint Cell — relationships the synth can't express

> Status: **shipped 🟢**. Less a widget than a **musical rule** you compose into a
> panel: a set of linked parameters that always preserve a relationship as you
> move them. Part of the [panel parts backlog](./README.md); grew out of
> [groundbreaking-components.md](./groundbreaking-components.md).

## What it is

A cell of **member** bars that move *together* to keep a rule true:

- **Sum = 100%** — the members always total 1 (e.g. an oscillator mix / a wet-dry
  budget). Raise one and the rest shrink to compensate, keeping their proportions.
- **Ordered (a ≤ b ≤ c)** — the members stay in order with an optional minimum
  gap, so **resonance never exceeds cutoff** (drag one and the others push/clamp).
- **Ratio lock** — the members are a gang; moving one scales them all, preserving
  proportions.
- **Mirror** — the first two are complements (one rises as the other falls).
- **Free** — no rule (a plain linked-fader bank).

Each member is a **bindable port** (the fan-out), so the constrained values drive
real device parameters. It enforces musically-valid states the synth itself has no
way to express.

## How it works

- **Pure engine** `utils/constraintLayout.js` (+ `test/constraintLayout.test.js`,
  9 tests): the whole thing is one pure solver — `applyConstraint(values, mode,
  changedIndex, newValue, opts)` returns a new values array satisfying the rule
  (proportional redistribution for sum, push/clamp with min-gap for order,
  uniform scale for ratio, complement for mirror). `constraintSatisfied` powers a
  live OK/off check; bar geometry + hit-test; dynamic `member_N` ports + fan-out
  values (a live `__values` override flows the drag to the ports).
- **`ConstraintRenderer.svelte`** — the member bars, a dashed **link chain** over
  their tops (shown when a rule links them), per-member values, labels and the
  rule badge. Visual only.
- **Model** — `Constraint` controlType + section (`mode`, `minGap`, the
  `members[]`). Dynamic per-member ports.
- **Preview** (`PanelPreviewSurface`) — drag a member bar; each move re-runs the
  **solver** from the working values, fans out every member, and commits on
  release. No clock (it's user-driven). Runs live in the exported Player.
- **`ConstraintEditor.svelte`** — a rule picker (with per-mode explanations),
  min-gap for ordered mode, a members table, and appearance colours. Loader,
  Properties tab and palette entry included.

## Compatibility

Works on **any** MIDI synth with a device profile — each member is one bound
parameter, and the cell simply guarantees their *combination* is always valid.
Light traffic (a handful of members, user-driven). No input dependency.

## Possible next steps

- **More rules** — weighted sum (a budget with per-member weights), max/min caps,
  or an expression (`b = k·a + c`).
- **External driver** — a single knob/linked source that drives the whole cell
  through the constraint, instead of dragging bars directly.
- **Soft vs hard** — a "nudge" mode that resists rather than enforces, for
  playable tension.
