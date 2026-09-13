# The Library tab

Status: **built**, 2026-09-10. The properties panel and the Insert panel are both untouched — see
[What was built](#what-was-built).

Candidate 6 from [`display-panel-candidates.md`](display-panel-candidates.md), and the first one
ranked *medium* rather than *strong*. Drawn in [`library-tab-mockups.html`](library-tab-mockups.html).

## The space argument fails, and that is the first thing to say

The candidate list estimated 842px and doubted itself out loud: *"It is a modal-ish task — you open
it, pick something, and leave. A dock tab is for things you keep open while working."* The doubt was
right to be there. Measured — `CustomPackageLibrary` mounted in Chromium at three library sizes:

| Saved packages | Section height |
|---:|---:|
| 0 | 459px |
| 3 | 647px |
| 12 | **647px** |

It stops. `.library-browser` is capped at `max-height: 282px` with a scrollbar, so twelve saved
components render in exactly the same height as three. There is no runaway height here and building
this on a space argument would have been building it on nothing.

**The case is somewhere else**, and it survives the measurement.

## Three findings

### 1. The library cannot place a component

`CustomPackageLibrary` has one action for using a saved package: `applyLibraryEntryToCurrent`, which
copies every section of the package over **the component you currently have selected**. It keeps the
Transform and replaces everything else.

That is a real and useful operation. It is not what "use a saved component" usually means, and it is
the only one on offer: the file never calls `addCustomComponentPackage` or `addControl`. From the
library, you cannot put a saved component on a panel.

### 2. The surface that *can* place shows six of them, blind

`InsertPanel` can — click to insert, drag to place, through a payload `EditorCanvas` already reads.
Two things about how it offers them:

```js
if (!q) return entries.slice(0, 6);
return entries.filter(…).slice(0, 12);
```

**Six**, with nothing on screen saying it is truncating. And each one is drawn as a name row with an
icon: no picture of the component at all, though the entry carries one.

So the surface with the pictures cannot place, and the surface that places has no pictures and shows
six. Neither is a component palette, and a palette is exactly a thing you keep open while working —
which answers the candidate list's doubt rather than dismissing it.

### 3. The picture is a second renderer, and it loses both ends of the stack

`createCustomComponentThumbnail` reduces a component to at most **18** entries — a rectangle, a
colour, a radius, a rotation and ten characters of text each. The card then draws the first **14**
of those. Two caps, in two files, neither of which says anything when it bites.

Measured on a 22-part component:

| | kept |
|---|---|
| the component | parts 0–21 |
| the envelope, `.slice(-18)` after an ascending z-index sort | parts **4**–21 — the bottom of the stack goes first, so the background before anything else |
| the card, `.slice(0, 14)` | parts 4–**17** — and the top four go too |

Fourteen of twenty-two, missing from both ends. Meanwhile the entry carries `envelope.component` —
the whole control — so the real renderer can draw it. That is the argument `EffectPreview` already
records: anything cheaper is a second implementation, free to drift, and a preview that disagrees
with the canvas is worse than no preview.

## Layout

```
  4 saved · 1 with issues                   [ search ]   Recent | Name | Most used | Readiness

  COMPONENTS                                             LAYERED KNOB
  ┌──────────┐ ┌──────────┐ ┌──────────┐                 Name    Layered Knob
  │ ▣ real   │ │ ▣ real   │ │ ▣ real   │                 Version 1.0.0
  │ renderer │ │ renderer │ │ renderer │                 Saved   just now
  └──────────┘ └──────────┘ └──────────┘                 ─────────
  Big Knob     Layered Knob  Slim Fader                  22 parts · 3 in · 2 out · 63% ready
  5 parts      22 parts ⚠    5 parts                     ⚠ 1 issue in this package
               panel shows 14 of 22                      ─────────
  [knob 2] [complex 1] [fader 1] [led 1]                 + Place a copy
                                                          ⇄ Replace On Canvas
                                                          🗑 Forget
```

Click to select, double-click or **Place a copy** to add one to the panel, drag a card onto the
canvas for the same thing at a chosen point. **Replace** is the panel's destructive action, kept and
labelled with the name of the component it will overwrite.

## The three things worth calling innovative

1. **The card is the component.** Drawn by `CanvasControl` through `EffectPreview`, so what you see
   is what you will get, and a 22-part component is 22 parts.
2. **The card says what the other picture leaves out.** "panel shows 14 of 22" is a note about the
   properties panel, not about the component — the kind of thing a second renderer normally hides.
3. **Both ways to use a package, named for what they do.** Placing a copy has never been available
   from this data; replacing has been the only option and has never said whose sections it takes.

## No sliders

Same rule as the other five.

## What was built

| Piece | File |
|---|---|
| The model — descriptors, search, sort with the pin rule, the thumbnail-loss report | `utils/componentLibraryModel.js` |
| The tab | `components/LibraryTab.svelte` |
| Columns | `components/library/LibraryGrid · LibraryDetail` |
| Registration | `panels/DisplayPanel.svelte`, `utils/displayDock.js` |
| Tests | `test/componentLibraryModel.test.js` (20), `browser-checks/libraryTab.mjs` (17) |

**Nothing was removed.** `CustomPackageLibrary` still draws its section and still does save, import,
export, metadata and validation — the parts of this that really are a modal task, exactly as the
candidate list suspected. `InsertPanel` is untouched. `allLibraryFieldLabels()` is ready for the day
the panel's rows come out.

### Decisions and what the building turned up

- **This tab follows the selection**, unlike the four editing tabs, which deliberately stay on the
  control they were opened with. The reason is the Replace action: what it overwrites must be what
  you are pointing at, and a stale target here would destroy the wrong component. Placing selects
  what it placed, so Replace then targets the new copy — checked, because that is a footgun if it
  ever stops being true.
- **The replace patch is copied from the panel's, not reinvented** — same skipped `Transform`, same
  provenance written into `Designer`. Two implementations of "load this package over that component"
  would be two answers to what a component becomes.
- **The drag payload is the shipped one.** `{kind:'package', id}` on
  `application/x-ceditor-insert`, which `EditorCanvas` already handles, so drag-to-place needed no
  new drop path.
- **A test fixture gave every entry the same category** and made the search look broken — searching
  "knob" matched all three through `category: 'knobs'`. The filter was right; the fixture was not.
  Recorded because the instinct was to change the filter.

## Still open

1. **Nothing is relocated yet**, and the panel needs its search index extended before anything is.
2. **Renaming and re-tagging stay in the panel.** The library store has `updateMetadata`, and this
   tab does not call it: editing a saved package's metadata is a form, and a form is the panel's
   shape rather than a palette's.
3. **The two thumbnail caps are still there.** The tab draws the real thing and reports the loss;
   raising or removing `ENVELOPE_PART_CAP` would change what every saved envelope contains, which is
   a data-format change and not this tab's to make.

## Notes

- 2026-09-10: Written and built together. The space argument was measured first and rejected; the
  three findings were checked against the shipped code before the document was written.
