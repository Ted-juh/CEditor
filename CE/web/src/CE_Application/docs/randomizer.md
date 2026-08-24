# Constrained Randomizer / Generate — Component/Feature Design

> Status: **design.** Generate patches within DPD ranges + user locks. Part of the
> [panel parts backlog](./README.md); ideation in
> [groundbreaking-components.md](./groundbreaking-components.md).

## What

A control/action that **generates a new patch** by randomizing parameters
**within DPD-defined ranges** and **user locks/scope** — "randomize all except
the filter", "humanize ±10%", "randomize the LFO section only". A sound-design
accelerator that stays musical because the DPD constrains it.

## How

- For each **in-scope, unlocked** parameter, pick a value valid for its
  **DPD type/range**: enum → random choice; continuous → random in range
  (respect step); bipolar → in ± range. Apply as a [snapshot](./snapshots-morph.md)
  and send.
- **Modes:** full random · **humanize** (jitter around current value by an amount)
  · constrained-by-category (only certain sections/types).
- **Reuse:** DPD ranges/types · value layer / snapshots · per-parameter **lock**
  flags · scope selection.
- **New:** the randomization engine (per-type random, locks, scope, amount) and a
  "Randomize" / "Generate" control or action.

## Where

- A **button/action** (and optionally an amount knob for humanize). Uses snapshots
  so **undo = recall the previous snapshot**.

## When

- Sound design: instant starting points; escape blank-patch paralysis; humanize
  for variation. Safe because it never leaves a parameter's valid range.

## New work

The constrained-random engine + lock/scope model; a generate control. Ranges,
application, and undo come from DPD + snapshots.

## Open questions

- Lock model (per-parameter lock UI; lock groups).
- Humanize amount semantics (percent of range vs absolute).
- Smart/weighted randomization (musical priors per parameter) — future.

---

## Built, 2026-08-23

`utils/randomizer.js`, surfaced in the Snapshots tab.

Three modes — **full** (anywhere in range), **humanize** (±8% of the range, so a patch stays
recognisably itself) and **scoped** (a predicate over the parameter, which is the same mechanism
partial snapshot capture uses rather than a second one). Per-parameter locks; a locked parameter is
reported as skipped rather than silently left alone.

**Seeded** (mulberry32), so a roll that produced something good can be produced again. An unseeded
randomizer makes every good accident unrepeatable, which is the one thing a patch generator must
not do.

**Undo is a snapshot**, taken before the roll — the reason this component waited for that capability
rather than growing its own history.
