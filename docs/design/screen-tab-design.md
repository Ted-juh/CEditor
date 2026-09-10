# The Screen tab

Status: **built**, 2026-09-10. The properties panel is untouched — see [What was built](#what-was-built).

Candidate 4 from [`display-panel-candidates.md`](display-panel-candidates.md), after
[Effects](effects-tab-design.md), [Typography](typography-tab-design.md) and
[Assets](assets-tab-design.md). Drawn in [`screen-tab-mockups.html`](screen-tab-mockups.html).

## Scope, measured

The candidate list estimated these two editors by parsing their `PropertySection` cells. That
undercounts here, because the Zones and Elements tables are raw rows rather than `PropertyCell`s.
So they were measured for real instead: both editors mounted in Chromium on a seeded control, every
`.property-section` read with `getBoundingClientRect()`.

| Section | LcdDisplay | | PixelDisplay | |
|---|---:|---:|---:|---:|
| | 3 zones · 2 rules | 8 zones · 6 rules | 3 elements | 10 elements |
| Screen | 228px | 228px | 155px | 155px |
| Layouts | 232px | **392px** | 168px | 168px |
| Pages | 279px | **494px** | 121px | 121px |
| Elements | — | — | 178px | **402px** |
| Lighting | 215px | 215px | 307px | 307px |
| Motion | 213px | 213px | — | — |
| everything else | 720px | 720px | 399px | 399px |
| **total** | **1,887px** | **2,262px** | **1,328px** | **1,552px** |

**3,215px between them at rest, 3,814px at a load a real panel reaches** — and every pixel of that
growth is in the three sections that hold a list: about 32px per zone, 32px per element, 54px per
page rule. Those three are also the only ones describing something spatial. That is the whole case
in one table: the sections that grow without bound are the sections that are a picture.

## Four findings

### 1. A zone can fall off the screen, and nothing says so

This is the one worth building for, and it is the same shape as the filmstrip finding: arithmetic
the application has everything for and has never run.

`composeLayout` in `utils/lcdZones.js` places each zone like this:

```js
if (row < 0 || row >= nRows || nCols === 0) continue;
const c0 = clamp(Math.round(numberOr(zone?.colStart, 1)) - 1, 0, nCols - 1);
const c1 = clamp(Math.round(numberOr(zone?.colEnd, nCols)) - 1, c0, nCols - 1);
```

Two different silent failures come out of those three lines.

- **A zone past the last row is dropped.** It stays in the table, keeps its source and its settings,
  and simply never paints. Nothing marks it.
- **A zone past the last column is clamped, not dropped** — which is worse, because it still paints.
  A nine-cell zone at columns 20–28 on a 16-column screen becomes `c0 = 15`, `c1 = 15`: one cell,
  hard against the right edge, showing a truncated value. It looks like a rendering bug.

And the trigger is two clicks. **Rows** and **Cols** are `NumberCell`s in the Screen section at the
top of the same panel. Take a 4×20 screen down to 2×16 — a reasonable thing to do while deciding
what hardware you are drawing — and every zone on rows 3 and 4 goes dark while every zone past
column 16 collapses into the right-hand edge. The editor says nothing, and the table still shows
the numbers you typed.

### 2. Page rules are first-match-wins, and cannot be reordered

`resolveActiveLayoutId` picks with `map.find(...)` — first match wins. The editor's own tooltip says
so: *"Rules match top-to-bottom; put specific ones first."*

There is no way to put them first. Zones have ▲▼ buttons (`moveZone`); page rules have **+ Rule**
and **✕** and nothing else. Reordering means deleting every rule below the one you want to move and
retyping them, which on the six-rule fixture above is thirty fields.

This is the Effects tab's argument in a new dress — order is semantic, order is invisible, and order
cannot be set — with one addition: you also cannot see **which rule is winning**. The selector has a
live value; the rules are a list of static text.

### 3. One of the two already has direct manipulation, and the other has never had it

A zone is `row`, `colStart`, `colEnd` — a rectangle on a character grid, edited as three number
wells in a nine-column table. An element is `x`, `y`, `w`, `h` — a rectangle on a pixel grid, edited
as four.

**But only one of them is stuck that way.** `PixelDisplayRenderer` already drags and resizes its
elements on the canvas: `startElementDrag`, `startElementResize`, snap-to-grid through
`Pixel.snapGrid`, grouped moves through `element.group`, writing straight through
`updateControlProperty` whenever the control is selected and the editor is unlocked. Its section
even carries `showGrid`, "design grid — grid overlay while editing".

`LcdDisplayRenderer` has none of it. It takes no `editable` prop and contains no drag code at all.
The same idea — a rectangle on a grid, in a screen the app is already drawing — got a direct-
manipulation editor on one component and a nine-column table on the other, and the table is on the
taller of the two.

So the shape of the work is not "add dragging"; it is *add it where it is missing and give the one
that has it room to be used*. What is still missing for both is size: the canvas draws these at
panel scale, where a character cell is a few pixels across.

Almost everything else needed already exists:

- `composeLayout(zones, rows, cols, getInfo, elapsedChars)` is **pure** and already renders a layout
  to an array of strings. It is the model, and it is testable without a DOM.
- `LcdGraphicCanvas.svelte` and `PixelDisplayRenderer.svelte` already draw the real screen.
- `stores/lcdDesignLayout.js` already lets the editor say which layout the design canvas shows,
  per control, without touching saved panel data.
- `EffectPreview.svelte` already exposes a control's true post-scale rectangle as a snippet target
  — built for the Typography tab's path handles, and a zone rectangle needs exactly the same thing.

What is missing is the screen at a usable size with the rectangles drawn on it.

### 4. Two stacking mechanisms, one of them wired

Recorded because it is a trap, not because it needs fixing today. `composeLayout` sorts zones by
`zone.priority`. Nothing in either editor ever writes `priority`. The ▲▼ buttons reorder the array,
and the comment above them — *"later zones paint over earlier ones"* — is true only because
`Array.prototype.sort` is stable and every key is 0.

So array order works, and the first thing that writes a `priority` silently disables the ▲▼ buttons
for every zone in that layout. The tab should keep using array order and leave `priority` alone.

## Layout

```
  PAGES                    THE SCREEN                          THE ZONE
  ~230px                   ~520px                              ~270px

  ┌──────────────────┐     ╔══════════════════════════════╗    Show    value
  │ ▸ Home      ▣▣▣  │     ║ CUTOFF          ██████   64  ║    Source  Filter Cutoff
  │   Edit      ▣    │     ║ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░  ║    Align   right
  │   Meters    ▣▣   │     ╚══════════════════════════════╝    Radix   dec
  └──────────────────┘      16 × 2 · drag a zone to move it    Overflow clip
   RULES                                                       ─────────
   ≡ = 0    → Home  ●live   ⚠ 2 zones are off this screen      Scroll  off
   ≡ = 1    → Edit
   ≡ ≥ 2    → Meters
   + rule
```

**Pages** — every layout as a row with a live thumbnail of itself, rendered by `composeLayout`, so
you can see what a page looks like without switching to it. Under them the rules, **draggable**, with
the one that currently matches marked live.

**The screen** — the real renderer at a size you can work on, with each zone drawn as a rectangle
you can move and resize. Off-screen zones are called out under it.

**The zone** — the selected zone's settings, the ones that are not spatial.

## The three things worth calling innovative

1. **The off-screen check.** `row > rows` or `colEnd > cols` is the whole test, the application has
   never run it, and it is triggered by editing two fields at the top of the same panel. The two
   failures are drawn differently because they *are* different: a clamped zone gets a box where the
   renderer really paints it, and one that paints nowhere gets a tab on the edge it fell off, since
   a box at columns 20–28 would be a picture of something that never happens.
2. **Page thumbnails.** `composeLayout` is pure and already returns the rendered text. A layout list
   that shows each layout costs one call per row.
3. **The live rule.** The selector has a value; `selectorRuleMatches` already says which rule
   matches it. Marking the winner turns a list of static text into an explanation.

## No sliders

Same rule as the other three tabs. Numbers are `NumberCell`, choices are `Segmented` up to four
options and `PropertySelect` beyond. Dragging a zone is the Typography precedent, not an exception
to it: handles are for values that *are* a shape, and a zone is a rectangle on a grid.

## What stays in the properties panel

Nothing is removed, as with the first three. Stripping is a later change.

## The three open questions, as decided

1. **One tab, two modes.** The model speaks in rects over a grid and converts at the edges, so
   layouts, page rules and the off-screen check are written once. The one place the two are *not*
   flattened is the stage, where the pixel half uses the renderer's own drag and the LCD half gets
   the overlay it never had.
2. **The spatial half only.** Layouts, Pages and Zones/Elements. Screen size, Colour, Lighting and
   Motion stay in the panel: they are appearance, and a dock that took them all would be a second
   properties panel, which is the thing this project exists to stop.
3. **Drag the box, drag its ends.** Snapped to cells, with the numbers beside it — the Typography
   settlement, where handles are for values that *are* a shape and the numbers never go away.

## What was built

| Piece | File |
|---|---|
| The model — rects over a grid, the off-screen check, rule order, the overlay geometry | `utils/screenModel.js` |
| The tab | `components/ScreenTab.svelte` |
| Columns | `components/screen/PageList · ScreenStage · ItemSettings` |
| Registration | `stores/editorTarget.js`, `panels/DisplayPanel.svelte`, `utils/displayDock.js` |
| Tests | `test/screenModel.test.js` (37), `browser-checks/screenTab.mjs` (20) |

**The properties panel is untouched.** `DisplayEditor` and `PixelDisplayEditor` still draw every
section and still edit every field. Nothing is relocated, so the 3,814px is not yet recovered;
`allScreenFieldLabels()` is in place for when it is.

### What the building turned up

- **The pixel half already had dragging**, and the first draft of this document said neither did.
  Checking before claiming a gap is the whole reason the claim is now finding 3 rather than a
  sentence about both editors being the same. The tab uses that renderer instead of writing a second
  drag beside it.
- **The check needed a distinction the prose did not have.** "Off the screen" is two different
  failures: a dropped zone paints nowhere, a clamped one paints in the wrong place. `renderedRect()`
  answers *where the renderer will actually paint this*, and the overlay draws that — so the amber
  box for the clamped zone sits exactly on the cell where its stray character appears.
- **Drawing the literal numbers looked worse than clipping them.** The first version drew an
  out-of-range box where its numbers said, which put an amber rectangle over the settings column.
  The edge tab replaced it.
- **The claim is tested against the shipped composer, not against itself.** `screenModel.test.js`
  feeds the same zones to the real `composeLayout` and asserts the screen comes back blank for one
  and with a single character at column 16 for the other. The overlay geometry has the same kind of
  guard: a test reads `LcdDisplayRenderer.svelte` and fails if the three lines it mirrors move.

## Still open

1. **Nothing is relocated yet**, and the panel needs its search index extended before anything is.
2. **The zone list is still the panel's.** Adding, removing and duplicating a zone stays in
   `DisplayEditor` for now — this tab edits the ones that exist. Adding one on the screen (drag on
   empty cells) is the obvious next gesture and was left out to keep the first version to one.
3. **`priority` is still a trap.** `composeLayout` sorts by it, nothing writes it, and the ▲▼
   buttons work only because the sort is stable. This tab does not write it either, which keeps the
   trap closed without pretending it is fixed.

## Notes

- 2026-09-10: Written. Nothing built.
- 2026-09-10: Built. Three questions decided as above; the properties panel left alone.
