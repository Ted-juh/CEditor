# Undo history, measured — 2026-09-29

The editor handoff's item 7 asked whether undo needs a new data model (Immer patches,
jsondiffpatch) and said to profile first. This is that profile. The short answer: **the history
model is right, and a patch-based history would not help.** What costs time and memory is two
things around it: how history compares a changed control, and how the edit path copies one.

Reproduce from `CE/web`:

```bash
node --expose-gc --max-old-space-size=8192 --import ./test/support/register-svelte.mjs scripts/bench-history.mjs
```

It loads the two largest shipped panels into the real stores and edits them through
`mutatePanelControlsByIdsInList`, the path a drag uses, committing each edit with
`pushSnapshot()`. Timings are medians on a Linux container and heap figures are Node's. They are
not WebView2's, but the shapes carry over.

## The panels

| | On disk | Expanded in memory | Controls | Shape |
|---|---|---|---|---|
| Roland GAIA SH-01 | 9.3 MB | 27.7 MB | 818 | 6 top-level containers, nesting 3 deep; one container is 6.5 MB |
| Yamaha AN1x | 25.7 MB | 19.3 MB | 783 | all top level; median control ~15 KB, biggest 72 KB |

A control in memory is the *expanded* tree, every section at its defaults, so the median control
is ~15 KB however little it sets.

## Results

Per step: **edit** is the store mutation, **commit** is `pushSnapshot()`, **retained** is heap
still held per history step after a forced GC. History keeps 50 steps.

| Panel | Edit | Edit ms | Commit ms | Undo ms | Retained / step | At 50 steps |
|---|---|---|---|---|---|---|
| GAIA | move one control (nested) | 1.1 | **61–84** | **69–88** | 24 KB | 1.2 MB |
| GAIA | move 20 controls | 2.2 | 1.4 | 2.2 | 172 KB | 8.4 MB |
| GAIA | move the 6.5 MB container | **60** | **74–79** | 6 | **6.8 MB** | **332 MB** |
| GAIA | select all, nudge | **274–294** | 1.6 | 3–8 | **24 MB** | **1.19 GB** |
| AN1x | move one control | 0.6 | 1.1 | 2–7 | 27 KB | 1.3 MB |
| AN1x | move 20 controls | 1.2 | 1.0 | 2.5 | 65 KB | 3.2 MB |
| AN1x | edit the biggest control | 1.0–1.6 | 1.8–2.6 | 2.2 | ~0 | ~0 |
| AN1x | select all, nudge | **222–324** | 1.3 | 2.7 | **27 MB** | **1.33 GB** |

And the comparison run: the same edits, but copying only the section the edit changes (the
control shell, its `_children` map and `Transform`) and sharing the rest.

| Panel | Edit | Edit ms | Commit ms | Retained / step |
|---|---|---|---|---|
| GAIA | select all, nudge | 0.7 | 5.6 | under measurement noise |
| GAIA | the 6.5 MB container | 1.0 | **84** | under measurement noise |
| AN1x | select all, nudge | 1.1 | 1.1 | under measurement noise |

For scale, the old whole-panel snapshot (`JSON.stringify(panel)`) costs 170 ms on GAIA and
320–420 ms on AN1x. The structural-sharing snapshot that replaced it is doing its job: a commit
on AN1x is about a millisecond whatever the edit.

## What the numbers say

**1. Commit and undo compare a changed control by stringifying its top-level ancestor.**
`sameSnapshot` skips controls whose reference is unchanged, then `JSON.stringify`s both versions
of each one that did change, to catch no-op edits. On GAIA every control lives inside one of six
top-level containers, so moving any one knob stringifies its whole container twice, 6.5 MB for
the big one. That is 60–85 ms on every commit, and the same again on undo, which compares with
the saved marker to decide the dirty dot. The comparison run shows this is independent of the
edit path: copying only Transform still commits in 84 ms. **Fix:** a structural compare that
returns early on reference equality at every level, not only the top. Unchanged subtrees are
shared, so it walks only the path to the edit. It is local to `stores/history.js`, small, and
the existing history tests cover it.

**Fixed the same day.** `jsonEqual` in `stores/history.js` gives the answer the two strings gave,
key order and JSON's dropped values included, and returns at the first shared reference.
`historySnapshot.test.js` fuzzes it against `JSON.stringify`, and fails the old code by catching
a container being serialized during a commit. Re-running the bench on GAIA:

| Edit | Commit before → after | Undo before → after |
|---|---|---|
| move one control (nested) | 61–84 ms → 5.3 ms | 69–88 ms → 2.4 ms |
| move the 6.5 MB container | 74–79 ms → 1.9 ms | 6 ms → 10 ms (noise) |

The component workspace, whose compare stringified the whole component, uses the same function.
The edit-path costs below are untouched by this.

**2. The edit path deep-clones the whole control it edits, children included.**
`mutatePanelControlsInList` runs `deepClone(control)` before calling the mutator. Moving a
container therefore copies every control inside it: 60 ms per move on GAIA's big container, and
that copy is what the history step then retains, 6.8 MB per step and 332 MB at fifty.

**3. Retention scales with the number of controls touched times ~15–35 KB, whatever changed.**
Nudging one pixel keeps a full copy of every control nudged. Select all and nudge fifty times and
history holds **1.2–1.3 GB**, and each nudge stalls the main thread for a quarter of a second in
the copy alone. Alignment, distribution and bulk property edits over large selections land in the
same place. Copying only what the edit changes brings all three figures down: edit to about 1 ms,
retention to nothing measurable.

**Fix for 2 and 3:** copy-on-write in the edit path, so a mutator's draft copies only the objects
it writes to. That is what Immer's `produce` is. It belongs **in the edit path**, not as a
patch-based history: once edits share structure, snapshots already cost a pointer per control.
It is a bigger change than 1. `mutatePanelControlsInList` has fourteen call sites, each mutator
writing freely into its draft, and Immer is a new dependency, so it needs its own review. A
hand-written per-section copy for the hot paths (drag, nudge, align) would get most of the benefit
without it.

**Fixed the same day, for the hot paths, without Immer.** Drag, group resize, nudge and align
all write through `applyControlPatchesById`, and inspector edits across a selection through
`updateSelectedProperty` and `applySelectedPatch`. All of those writes are dotted paths. `setNestedValueShared` in
`stores/controlTreeUtils.js` copies only the spine of nodes a path walks through, by the same rules
`setNestedValue` walks by, then runs the real `setNestedValue` on that spine. Everything else stays
shared. `patchPanelControlsInList` applies it across a panel. `sharedPathWrite.test.js` checks it
against `deepClone` + `setNestedValue` on every leaf path of every component type (over 5,000
paths), plus template-materialised sections, array indices, root keys, writes that do not land
and writes that throw. The bench, re-run with a cleared history per scenario, with the old path
alongside:

| Panel | Edit | Before: edit / retained per step | After |
|---|---|---|---|
| GAIA | select all, nudge | 633 ms / 31 MB (1.5 GB at 50) | 1.1 ms / 3 KB (0.1 MB) |
| GAIA | move the 6.5 MB container | 117 ms / 7.1 MB (346 MB) | 1.3 ms / 1.6 KB (0.1 MB) |
| AN1x | select all, nudge | 402 ms / 27 MB (1.3 GB) | 3.7 ms / 298 KB (14.5 MB) |
| GAIA, AN1x | move one control | ~1 ms / 24–27 KB | ~1.3 ms / 8 KB |

The other `mutatePanelControlsInList` callers still deepClone each control they edit: state-scoped
inspector writes, adding and removing sections and nodes, and replacing controls. Each touches one
control, from a menu or a field rather than a gesture, so none of them is on a path that repeats
per frame or per selection. Immer remains the route if they ever need the same treatment.

**4. Patch-based history is not needed.** It would solve 3 by storing `Transform.x: 12 → 13`
instead of controls. But once 2 and 3 are fixed the snapshots already retain only what changed,
and snapshots keep undo trivially exact, which a patch log has to earn.

**5. "Readable history" is a separate, UI-sized feature.** `changeTagFor` already knows which
controls each step touched. A history list naming the steps needs the tags kept on each entry and
a panel to show them, not a new model.

## Not measured

- The drag path's per-frame cost (`scheduleSnapshot` → `changeTagFor` on each store
  notification). It is pointer comparisons only and did not show up, but it was not timed on its
  own.
- The component workspace. Its compare stringifies the whole component, which is the same cost as
  finding 1 for a large component (0.5 ms for AN1x's 72 KB one).
- Browser memory limits. WebView2's renderer runs out well before a desktop has, so 1.3 GB of
  history is a likely crash on a large panel, not just a slowdown. That is an inference; it was not
  observed.
