# Keeping the properties panel's search working

Status: **built**, 2026-09-10. Step 2 of four; see
[`panel-to-dock-handoff.md`](panel-to-dock-handoff.md) for the other three.

Two things, found together because the second was in the way of the first.

## 1. The search could only find what the panel was drawing

`propertyFilter` is one string. `PropertySection` and `PropertyCell` read it and hide themselves
when it matches neither their title nor their hint. That is the whole mechanism — there is no index.

So the search finds a property only while the panel is drawing its row. Take the Effects rows out
and typing "glow" returns **nothing**: not "it moved to the Effects tab", but nothing at all, which
reads as "this application does not have glow".

Eight tabs were built and each shipped an `all…FieldLabels()` function described as "ready for the
day the panel's rows come out". On the day that day arrived, all eight were called **zero times** —
dead exports, the same shape as the dead editing half this project found in `stepSequencerLayout.js`.
`utils/dockFieldIndex.js` is what calls them, and a test asserts all eight stay called.

### What it does

195 labels across the eight tabs. A search that matches one produces a row above the panel's
sections saying which tab owns it, with a button that opens that tab on the selected control.

That is true whether or not the row has been removed from the panel yet, so it ships before any
stripping and keeps being true after.

**Two rules keep it quiet.** Some labels are words every panel uses — Name, Type, Label, Value, X,
Y, W, H:

- a query under two characters matches nothing (a one-letter query matches most of the index);
- a label matches only from the **start of a word**, so "on" does not pull in "Position".

**And it only offers tabs that have something to say about this control.** Section presence decides
it, except the Designer tab, which answers from its own registry — a Knob is not offered the Screen
tab, a Label is not offered the Designer tab, and a Phrase Sequencer is not offered it either
because its designer is not built yet.

## 2. The search was broken anyway, and had been all along

Setting the filter to a **partial** match killed the properties panel:

```
Error: https://svelte.dev/e/effect_update_depth_exceeded
```

Measured on a bare `BehaviorEditor` with nothing else on the page — no dock, no new code, one
section editor:

| Query | |
|---|---|
| `x` | loops |
| `gl` | loops |
| `t` | loops |
| `to` | loops |
| `glow` (matches none of its rows) | fine |

So it fired whenever *some* rows matched and some did not. Which is every keystroke on the way to a
real query: typing "glow" passes through "g", "gl" and "glo". After the loop the page is dead —
nothing re-renders again.

### The cycle

`PropertySection` kept a `visibleCount` in `$state`, and each `PropertyCell` reported into it from
an effect:

```js
$effect(() => {
  if (!section || !filter || !visible) return;
  section.report(1);
  return () => section.report(-1);
});
```

Child writes parent state → the parent's derived and template re-run → the cells' effects re-run →
they report again. Confirmed by bisection: stubbing out the two `report` calls made every query
above pass.

### The fix

The count stays a **plain number**. Only the boolean the template needs — "does any row match?" —
is mirrored into `$state`, once, in a microtask after every cell in that flush has spoken, and only
when it actually changes.

A filter change also opens the section optimistically and schedules a flush of its own. Both halves
are needed: without the optimistic open, a section flashes hidden for a frame before its rows report;
without the scheduled flush, a filter that matches **no** row in a section produces no `report` call
at all, so the section would stay open on the optimistic `true` and nothing would ever hide.

## What was built

| Piece | File |
|---|---|
| The index — 195 labels, matching, and which tabs apply to a control | `utils/dockFieldIndex.js` |
| The results row | `properties/DockSearchHits.svelte`, rendered by `panels/PropertiesPanel.svelte` |
| The loop fix | `properties/PropertySection.svelte` |
| Tests | `test/dockFieldIndex.test.js` (13), `browser-checks/propertyFilter.mjs` (6), plus 5 more in `browser-checks/dockOpeners.mjs` |

## Still open

- **The index is only as good as each tab's own list.** Effects declares 52 labels and Typography
  79; Assets, Library, Animation and Designer declare 9 each. Each list was written from the rows
  that tab draws, so they are honest — but a tab that grows a control and does not add its label
  will not be findable by it.
- **Step 3** (coverage gaps) and **step 4** (the actual stripping) are still to come.

## Notes

- 2026-09-10: The loop was found while building the index — the browser check for the results row
  failed with no rows, and the reason turned out to be that the page had already died on the
  previous query. It is a pre-existing bug, reproduced on a bare section editor with none of this
  work on the page, and it means the panel's search has been dying on nearly every keystroke.
