# The Typography tab

Status: **built**, 2026-09-10. The properties panel is untouched — see [What was built](#what-was-built).

Candidate 2 from [`display-panel-candidates.md`](display-panel-candidates.md), following
[`effects-tab-design.md`](effects-tab-design.md). Drawn in
[`typography-tab-mockups.html`](typography-tab-mockups.html).

## Scope

**1,317px, all of it on Text** — the second largest block in the tallest tab in the application.

| Section | Cells | Height |
|---|---:|---:|
| Flow | 34 | 662px |
| Font Settings | 6 | 167px |
| Typography | 5 | 167px |
| Multiline | 9 | 167px |
| Position | 2 | 77px |
| Line | 1 | 77px |

With Effects relocated and this too, the Text tab falls from 3,090px to about 706px — from four and
a half screens to one.

## Two findings that decide the design

### 1. Most of the Flow section does nothing, most of the time

`Text.Position` carries 37 fields and `flowMode` has **thirteen** values: rotate, line, stair, arc,
circle, vertical, wave, zigzag, spiral, perimeter, polyline, bezier, freehand.

The layout branches hard on the mode. `canvasControlTextLayout.js` reads `amplitude` and `frequency`
only under `normalizedMode === 'wave'` and `'zigzag'`, `turns` only under `'spiral'`,
`perimeterInset` only under `'perimeter'`, `polylinePoints` / `freehandPoints` / `bezierPoints` only
under their own modes, `stairUnit` only under `'stair'`.

**The panel has exactly one `{#if}` in the entire Flow section.** So with Circle selected you are
shown wave amplitude, wave frequency, spiral turns, stair unit, perimeter inset, four polyline
points and eight bezier control numbers, every one of them inert, presented identically to the two
fields that actually do something.

That is not a density problem, it is a correctness problem in the UI: dead controls that look live.

The denominator is worth stating exactly, because it is easy to overstate. There are **16 flow
fields** — 10 belonging to individual modes, 6 shared by every mode that walks a path — and the
panel additionally draws the **10 shape properties** (eight bezier numbers and two point arrays) at
all times. So **26 flow controls are on screen and a typical mode reads 8 of them.**

Which parameters each mode actually reads, from the layout source:

| Mode | Reads |
|---|---|
| rotate | angle |
| line | angle, stepX, stepY |
| stair | stepX, stepY, stairUnit |
| arc | radius, sweep |
| circle | radius, angle |
| vertical | — (but it walks a path, so it reads the shared six) |
| wave, zigzag | amplitude, frequency |
| spiral | radius, turns |
| perimeter | perimeterInset |
| polyline | polylinePoints |
| bezier | 8 path numbers |
| freehand | freehandPoints |

Every path mode also reads distribution, facing, side, reverse, startOffset and fixedAdvance —
which is **every mode except `rotate`**. `vertical` reads like an exception and is not: it builds a
two-point vertical path and walks it, so treating it as pathless would hide six live controls, which
is the same fault as showing dead ones and quieter.

### 2. Three identical decoration blocks, and the renderer already knows it

`Font` has 40 fields and **24 of them are the same eight-field shape three times**: underline,
strikethrough and overline each carry `Offset`, `Thickness`, `Colour`, `InsetLeft`, `InsetRight`,
`Gap` and `Layer`.

The renderer already treats them as one parameterised thing —
`lineColourFor(kind, fontSection, fillSection)`, `lineLayerFor(kind, fontSection)`,
`lineBaseOffsetFor(kind, fontSection)` — and the panel already has a shared
`TextLineDecorationControls.svelte`. It just mounts it three times with three sets of labels.

So the tab needs **one** decoration editor and a picker for which line it is editing. Same shape as
the Effects finding: the renderer generalises, the UI does not.

## Layout

Two modes in one tab, switched in the header the way the Effects tab switches Text / Layer / Screen.
Consistency is deliberate — these are the same kind of thing and should not need learning twice.

### Type

```
  FAMILIES            SPECIMEN                     SETTINGS
  ~200px              ~420px                       ~330px

  Archivo             ┌────────────────────┐       Size    34
  Arial               │      CUTOFF        │       Case    Aa · AA · aa
  Georgia             └────────────────────┘       Spacing letter / word / line
  Helvetica           400  500  600  700  800      Features Lig · Alt · Osf · Tab · Frac · 0
  JetBrains Mono      CUTOFF CUTOFF CUTOFF         Wrap    word · none · char
  …                     the weight ramp            Line    ▁ underline ▔ overline ─ strike
```

**Families** — the available fonts, each row set in its own face. There is no specimen anywhere in
the editor today, so choosing a family means setting it, looking at the canvas, and coming back.
`availableFonts` and `ensureStoredFontLoaded` in `stores/appSettings.js` already provide the list
and the loading.

**Specimen** — the control's own text, live, with a **weight ramp** underneath: the selected family
drawn at each weight it actually has. Picking 600 over 500 by looking at the two beats picking a
number from a dropdown.

**Settings** — size, case, spacing, the six OpenType feature flags as chips, wrapping, and one
decoration editor with a three-way picker for which line it edits.

### Flow

```
  MODES (13, drawn)          SPECIMEN                THIS MODE ONLY
  ~230px                     ~500px                  ~250px

  ┌───┐┌───┐┌───┐            ┌──────────────────┐    Radius     48
  │↻  ││───││▟  │            │    C U T         │    Angle       0
  └───┘└───┘└───┘            │   O     O        │
  rotate line  stair         │    F F           │    ── shared ──
  ┌───┐┌───┐┌───┐            └──────────────────┘    Distribution natural
  │◜  ││◯  │││  │                                    Facing       path
  └───┘└───┘└───┘                                    Side         center
  arc  circle vert                                   Reverse      off
  …                                                  Start offset 0
```

**Modes** — thirteen thumbnails, each drawing the control's own text in that mode. Today they are
thirteen buttons with words on them, and "perimeter" and "stair" are not words that tell you what
you are about to get.

**This mode only** — the parameters the selected mode actually reads, and nothing else. The single
biggest change in the tab, and the one that turns a wall of dead fields into four live ones.

## No sliders

The same rule as the Effects tab, and the same four controls: `NumberCell` for every number (label
is a drag handle, steppers, always typeable), segmented chips for enums, the colour chip with its
in-place popover, and pickers — the family list, the weight ramp, the mode grid — where the choice
is visual.

Angles (flow angle, sweep) are number fields with an orientation glyph. Not dials.

## The three modes that have no numbers to type

Worth naming, because they are the one place the no-sliders rule and the no-fiddly-handles rule
collide with the data.

- **bezier** stores eight numbers: start, two control points and end, each an x/y percentage.
  Nobody authors a curve by typing eight percentages.
- **polyline** stores an array of points. So does **freehand** — whose name says drawing.

There is no number-based way to author these. The design's answer is **curve presets** — arch,
valley, S-curve, ramp, and for polyline a few point sets — with the numbers underneath for
adjustment. That keeps every control typeable and adds no drag handles. It also means freehand
cannot really be authored in this tab, only adjusted; whether that is acceptable is the open
question below.

## What stays in the properties panel

Nothing is removed yet, exactly as with the Effects tab. The panel keeps every section it has, the
tab is a second way in, and stripping is a later change that ships with the search-index work.

## Cost

- `typographyModel.js` — a pure module: the flow-mode → parameters map, the decoration descriptor,
  the feature flags, and the family/weight helpers. Mirrors `canvasControlTextLayout.js`'s branching
  so the two cannot disagree; testable without a browser.
- `TypographyTab.svelte` plus a column each for families, specimen, settings, modes and parameters.
- Reuse: `EffectPreview.svelte` renders every thumbnail (family rows, weight ramp, mode grid,
  specimen) — it already mounts the real `CanvasControl` and takes `fit`/`zoom`.
- `stores/typographyTarget.js`, or a second kind on the effects target. See the open questions.
- Tests: a unit suite over the mode map and a browser check driving the tab.

## Decisions taken

1. **One store, not two.** `effectsTarget.js` is gone; `stores/editorTarget.js` replaces it and both
   tabs use it, keyed by `kind`, with a registry mapping kind to dock tab. Adding the next tab is a
   row rather than a fourth copy of the same lifecycle. The Effects tab was migrated in the same
   change and its browser check still passes.
2. **The three shape modes get draggable points.** Bezier, polyline and freehand only — the modes
   where the shape *is* the value and there is no number worth typing. The numbers stay on screen
   beside them; dragging is an addition, not a replacement. Curve presets sit above both.
3. **Multiline is in.** Wrap, line height, overflow, max lines and fit are in the Lines group,
   because whether text wraps badly is something you see.

## What was built

| Piece | File |
|---|---|
| The model — per-mode parameters, decoration descriptor, point maths, curve presets | `utils/typographyModel.js` |
| The shared target store (replaces `effectsTarget.js`) | `stores/editorTarget.js` |
| The tab | `components/TypographyTab.svelte` |
| Columns | `components/typography/TypeFamilies · TypeSpecimen · TypeSettings · TypeFieldRow · FlowModeGrid · FlowParams · FlowPathEditor` |
| Registration | `panels/DisplayPanel.svelte`, `utils/displayDock.js` |
| Tests | `test/typographyModel.test.js` (25), `browser-checks/typographyTab.mjs` (20) |

**The properties panel is untouched**, as with the Effects tab. Nothing is relocated, so the
1,317px is not yet recovered; `allTypographyFieldLabels()` is in place for when it is.

### Five things found while building

- **My "70% inert" claim needed a denominator.** There are 16 flow *fields*; measured against those,
  circle shows 8 — half, not 70%. The panel also draws the 10 shape properties at all times, so
  against the 26 controls actually on screen circle uses 8 and the figure holds. The doc and the
  mockup were corrected rather than left flattering.
- **`vertical` is a path mode.** It reads like it should not be, and the first draft listed it as
  pathless. It calls `placeAlongPolyline` with a two-point vertical path, so it reads all six shared
  settings — hiding them would have been the same fault as showing dead ones, only quieter.
- **Two enum guesses were wrong.** `flowDistribution` accepts natural/fit/fixed/justify and
  `flowFacing` accepts path/upright/inward/outward; the first draft invented "even" and "up". A test
  now checks every shipped default is representable in the options the tab offers.
- **The model imported the icon-bearing options module.** `textEditorOptions.js` pulls in lucide
  components, and its own header records why that matters — it once "dragged the whole icon set into
  the scripting layer". `FLOW_MODE_OPTIONS` moved to the pure `textEditorVocabulary.js` half and is
  re-exported, so the model runs under plain node.
- **The path handles were over the wrong rectangle.** They sat on the specimen box while the control
  is a scaled rectangle inside it, so a drag would not have landed where the text goes. `EffectPreview`
  now exposes the control's real rect as a snippet target.

## Still open

1. **Nothing is relocated yet**, and the panel needs its search index extended before anything is.
2. **`Segmented` versus a select** splits at four options, per that component's own note. Case and
   Align therefore use a dropdown in a 272px column; whether the dock deserves a wider variant of
   the segmented control is a question for the next tab, not this one.
3. **Freehand is adjustable, not drawable.** You can drag its points and pick a preset, but there is
   no freehand stroke input. That may be fine — the mode's stored value is a short vertex list, not
   a captured stroke.

## Notes

- 2026-09-10: Written. Nothing built.
