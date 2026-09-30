# Three libraries under the editor: Floating UI, RBush, Paper.js

*Built, 2026-09-30.* Three of the editor's own implementations were replaced or extended with
established MIT libraries, picked from the third pass of the
[open-source landscape](open-source-landscape.md) as the ones that raise the editor itself rather
than add a feature beside it. Each is described below as the problem, what changed, and what was
deliberately left alone.

| Library | Licence | Where | Ships in the player? |
|---|---|---|---|
| `@floating-ui/dom` ^1.8 | MIT | `utils/floatingUi.js` | Yes, about 15 kB — the preview combobox uses it |
| `rbush` ^4.0 | MIT | `utils/controlSpatialIndex.js` | No |
| `paper` ^0.12.18 | MIT | `utils/partOutlines.js`, `booleanGroups.js` | On demand only — a lazy chunk (212 kB) the player fetches the first time a combined shape needs computing |
| `paperjs-offset` ^2.2 | MIT | stroke expansion and inward offsets | On demand only (20 kB) |
| `fontkit` ^2.0 | MIT | `utils/textOutline.js` — glyphs, shaping, variable fonts | On demand only, for text taking part in a shape |
| `woff2-encoder` ^2.0 | MIT | WOFF2 → TrueType (Google's decoder, WebAssembly) | On demand only, as fontkit |
| Liberation Sans / Serif / Mono 2.1 | OFL 1.1 | `assets/fonts/liberation-*.woff2`, unmodified | Fetched one file at a time, only to outline Arial / Times / Courier text |

## Floating UI: one rule for every popup

**The problem.** About twenty menus, popovers and dropdowns each kept themselves on screen their own
way: a shared `placeMenu` for some, constants for the layer tree (every menu assumed 200×330), `top:
100%` and hope for the menu bar, nothing for the rest. None followed its anchor on resize or scroll.
One was simply broken: `SurfaceContextMenu` read `placed.x/y` from a function that returned
`left/top`, so it was never placed at all.

**What changed.** `use:floating` (`utils/floatingUi.js`) gives every converted popup the desktop
rule: open on the preferred side, *flip* when there is no room (never slide under the pointer, which
swallows the first click), slide along an edge only when neither side fits, scroll only when taller
than the window, and follow the anchor while open. Anchors are an element, a pointer point, a box (a
caret's line) or `'parent'` for submenus. `utils/menuPlacement.js` and its test are gone.

Converted: the canvas context menu and its submenus, the designer surface's context menu, the tab
bar's tab menu, the layer tree's menu, the menu bar's dropdowns and submenus, the swatch cell menu,
the host part-issue tooltips, the gradient stop popover, the code editor's hover, signature help
and autocomplete, and the **preview combobox list** — which previously opened off the bottom of a
panel for a combobox in its last row, and since that surface is the player's, the fix ships in the
plug-in too.

Converted second, having first been left CSS-anchored on the theory that they sat inside a fixed
layout and never reached an edge: the effect colour popover, the device-insight Bind picker, the
custom-interact add menu, the tab strip's New / Open trays, the workspace picker (whose `anchorStyle`
prop gave way to a `placement`), and the Component Designer's tool-strip flyouts. The theory was
wrong often enough — a narrow window, a scrolled inspector — and, being `position: absolute`, each
was also clipped by any scrolling ancestor. The insert flyout stays as it is: it is not a popup but a
panel docked to the icon rail, the full height of the workspace.

Checked by `browser-checks/floatingUi.mjs`: a menu at the window corner flips up and left and
follows a resize, a submenu at the right edge flips left, the menu bar survives a 520 px window, the
tree menu opens upward from its lowest row, a bottom-row combobox opens above itself, the tab tray
hangs under its button and a designer tool flyout opens above its.

## RBush: the canvas asks what is near, not what exists

**The problem.** Several gestures walked every sibling per pointer move: alignment snapping (nine
edges per control), distance labels, the Alt-hover and right-click hit test (which also re-sorted
the whole list per call), the marquee, and equal spacing. The Roland GAIA sheet has 1,806 top-level
controls.

**What changed.** `utils/controlSpatialIndex.js` builds, per sibling array, four R-trees: boxes,
rotated footprints, and each axis's snap edges as points. It is cached in a `WeakMap` keyed by the
array, so an edit (which replaces the array) invalidates it for free and a drag — which does not
write until release — reuses one index for the whole gesture. Lists under 48 controls are scanned as
before.

The index only removes candidates that *cannot* be the answer; every caller then runs its original
exact test over the survivors in the original order. So answers are identical, and
`test/controlSpatialIndex.test.js` holds that as a claim: seeded random 400-control panels (15%
rotated) and the GAIA sheet, compared with the index on and off (`withoutIndex`), for snapping,
distances, equal spacing, hit testing (including a locked layer) and the marquee.

Measured on GAIA, per pointer move: snapping **1.07 → 0.09 ms**, hit testing **0.39 → 0.001 ms**.

`containment.js` gained `stableChildControls`, which returns the same array for an unchanged
container — `getChildControls` returns a fresh one each call, which would have defeated the cache.

Not indexed, and why: drop-target search (containers are few), scenery hover, and the
multi-selection bounds (its cost is recomputation, which is a caching problem, not a spatial one).

## Paper.js: live combined shapes in the Component Designer

**The problem.** The designer's parts are primitives, Pen paths and text. A plate with a hole, a
notched pointer, a legend knocked out of a badge could only be faked with overlapping parts and a
background-coloured fill, which breaks as soon as the panel colour changes.

**The first version, and why it was replaced.** Combining replaced the operands with one path. That
deleted parts — and a component names its parts everywhere (hit zones follow them, bindings move them,
states and variants restyle them, scripts address them) — so it had to refuse any operand anything
referred to, and anything it could not outline exactly: text, arcs, lines, open paths, three of the four
corner styles, gradient and image fills, non-solid borders, hidden and generated parts. Six classes of
refusal, each a place the tool said no.

**What it is now** (user docs: [The Pen](../pen-tool.md#combining-shapes)):

- **Live groups** (`utils/booleanGroups.js`). A combined shape is a part of kind `boolean` —
  `meta.boolean { operation, operands, paintFrom }` — and each operand is kept, marked
  `meta.booleanGroup`. Nothing is deleted, so nothing that names a part breaks, and there is nothing
  left to refuse on that account. `attachBooleanInputs` runs at the end of `resolveInteractiveControl`
  (and on the designer's snapshot, the state filmstrip and the contact sheet): each shape is handed its
  operands as they are after variants, generators, bindings, states and internal scaling. So a binding
  that moves the hole moves the cut, at run time, in the plug-in — `browser-checks/booleanRuntime.mjs`
  turns a value on the panel and reads the cut moving off the screen.
- **Computed on demand, cached.** The renderer asks `booleanShapeFor` synchronously; it answers from a
  memo keyed by the operands' geometry, or from `meta.cache` (the outline the designer last computed,
  written without an undo step of its own once an edit settles), or — while Paper.js computes the new
  outline — with the last good one, and `booleanShapeRevision` redraws when it arrives. Paper.js is a
  lazy chunk; the player fetches it only when a cache does not match.
- **Exact operands** (`utils/partOutlines.js`). Every kind is outlined by the renderer's own rules:
  corners through the fill clip builder the renderer uses (`cornerPaths.js`), with CSS's
  radius-scaling rule for rounded ones; stadiums; polygons and Pen paths as the inset polygon plus its
  stroke band; open paths and lines as their stroke band (paperjs-offset), round caps as drawn; arcs as
  the ring sector the dashed circle paints, centred as `viewBox`+meet centres it; the value arc as its
  conic sector under its radial mask (including CSS's farthest-corner sizing); text as glyphs.
- **Text** (`utils/textOutline.js`, `utils/fontSources.js`). The glyphs come from the font file, parsed
  by fontkit, shaped with the font's kerning and ligatures, variable fonts instanced at their weight,
  laid out by a model of the renderer's text box (padding, flex centring, letter- and word-spacing,
  case, wrapping, clipping, synthesised bold and italic). The panel faces are resolved from
  `models/panelFontFaces.js` — `panelFonts.css` as data, unicode-range subsets included, held to the
  stylesheet by a test. `browser-checks/partBooleans.mjs` compares outlined text to the browser's own
  glyphs pixel for pixel: 87% ink overlap, every edge within a pixel (the rest is antialiasing).
  WOFF2 is decompressed with woff2-encoder first, because fontkit's WOFF2 path cannot instance a
  variable font. System fonts: Arial / Helvetica, Times and Courier resolve to the Liberation fonts,
  metric-compatible (same advance widths), shipped unmodified — a subset would be a Modified Version
  under the OFL and could not keep the reserved name; on Windows the app reads system fonts from the
  Fonts folder through its file bridge; a browser may grant the Local Font Access API. Anything else is
  refused by name.
- **Full paint on the outline** (`BackgroundRenderer`'s `outline` mode, `utils/outlineBorder.js`,
  `utils/outlineShadows.js`). Fill layers are clipped with `clip-path: path(evenodd, …)`; the border is
  drawn as bands inward from the outline — a stroke of twice the depth clipped to the inside, which is
  exactly the set of points within that depth of the edge — so dashed, groove, ridge and double carry
  over by the box border's own arithmetic; dotted borders sit on the outline pulled in by the dot radius
  (a Paper.js offset, computed with the shape); inset and outset shade by which way an edge faces.
  Part shadows are drawn from the outline instead of a box-shadow. Closed flattened and smoothed paths
  paint through the same pipeline.
- **The designer** treats a shape as one layer: dragging or resizing it maps its operands' frames
  (`utils/surfaceGroupFrames.js`) and the outline follows the pointer; the layer list nests operands
  under their shape; delete, rename, reorder, copy, paste and duplicate keep membership consistent
  (`partsAfterRemoval`, `membershipRenamePatch`, `remapCopiedGroups`); a generated operand is detached
  first, and the materializer no longer stamps a detached part back to generated (a bug the per-layer
  Detach already had). The shape tools live in `sections/SurfaceShapeTools.svelte`.

**Editing a flattened path.** A flattened or smoothed path is edited anchor by anchor with Bézier
handles (`utils/bezierPath.js`, `sections/SurfaceCurveEditor.svelte`, handed the part by the Pen's
editor). The model parses any SVG path — relative and shorthand commands, quadratics raised to cubics
exactly, arcs as cubics — and every edit is a pure function of it: move an anchor, bend a handle
(mirrored on a smooth anchor, independent with Alt), insert an anchor by de Casteljau so the outline
does not change, toggle corner / smooth, remove an anchor or a whole hole. Writing it back fits the
box to the curves' exact bounds (derivative roots, not the handles) and, on a turned or scaled part,
moves the pivot to stay on the same spot, so re-fitting the box never swings the rest of the outline
round. `browser-checks/curveEditing.mjs` drives each gesture with a real pointer.

**Still refused, by name:** a knob or slider carried as a part, an envelope display, a waveform icon —
each drawn live by its own renderer with no fixed outline — and text whose font file cannot be read.
Flatten, the one destructive step, is refused while anything names an operand.

**Limits, and how they were lifted.** The first version shipped with three, recorded here with
what replaced each:

- *A shape's cache is keyed to the designer's artboard size*, so an instance drawn at another size
  showed the previous outline, unscaled, until its own was computed. The cache now records the size
  it was computed at, and an instance of another size shows the cached outline scaled to its box in
  the meantime (`cacheScaledTo`) — exact for operands laid out in percentages, close for the rest,
  and replaced by the exact outline as soon as Paper.js has it.
- *The player does not load imported fonts*, so a run-time change to text in one (a binding on its
  content) could not be re-outlined there. Two things answer it now. First and fully: a panel leaving
  the editor — shared, or prepared for export — **carries the imported faces it names**
  (`utils/documentFonts.js`, `panel.fonts`), and the player registers them, for CSS and for outlines,
  so the text is re-outlined from the real font with ligatures and every glyph. Each carried face
  is cut to the characters the panel can show (`utils/fontSubset.js`: HarfBuzz's hb-subset in
  WebAssembly, loaded only when packaging) and compressed to WOFF2 — Liberation Sans goes from
  144 KB (as WOFF2; 411 KB as TrueType) to 25 KB, and a kerned string measures identically before and after, variable axes
  included; fontkit's own subsetter was passed over because it drops kerning, ligatures and axes. That also mended the
  editor itself: the wiring that hands imported fonts to the outline code
  (`stores/fontOutlineSources.js`) was described in `fontSources.js` but had never been written, so
  text in an imported font was refused as "not available to outline" even in the editor. Second, as
  a fallback, the cache carries a **glyph atlas** for each face the player cannot read for itself
  (`fontSources.glyphAtlas`): printable Latin outlines and advances, any character the text holds
  now, and ASCII kerning — 48 KB for Liberation Sans, 66 KB for DM Sans. `test/glyphAtlas.test.js`
  shows it lands every point of a kerned string within 0.01 px of the font file; it shapes without
  ligatures, and a character outside it is refused, the shape keeping its outline.
- *A border's gradient ran across the shape's box* however its flow was set. A gradient set to
  **follow** now runs along the outline as a box border's runs round its sides: each contour from its
  top-left-most point, clockwise, 0 to 1 and back (`outlineFlowPieces`), drawn as short pieces of the
  band in the colour of where they fall. Dotted bands keep the gradient across the shape — a dot is
  too small to show where along the line it sits — and the corner gradient modes still have no
  corners to act on.

Checked by `test/booleanGroups.test.js`, `test/partOutlines.test.js` and `test/textOutline.test.js`
(areas of every kind against the renderer's rules, live resolution through the real pipeline with a
state and a binding, the renderer's outline mode, membership through every layer operation, flatten
and its refusals, the font table against the stylesheet, font matching, layout) and by
`browser-checks/partBooleans.mjs` (combine, undo, the cut following the hole, hiding, switching the
operation, gradient and dashed border on the outline, dragging the shape, flatten refused and done,
release, smooth, text against the browser's glyphs) and `browser-checks/booleanRuntime.mjs`.

## Two libraries looked at and not taken: PaneForge and svelte-dnd-action

Both were on the list with the three above, and both were read — source, not README — before
deciding. Neither went in; what each would have brought was built into what is here instead.

**PaneForge (docking).** It sizes panes in percentages of their group, and only in percentages. The
workspace's side panels are pixel-sized on purpose — the properties panel's 600 px floor, the
tree's 120–400 px — and keep their width when the window changes, as an IDE's do. Under PaneForge
they would stretch with the window, and the floor would become a percentage recomputed on every
resize, fighting the library. What it would have added is keyboard resizing and a window-splitter's
ARIA; the three splitters already run on `dragScrub`, which has keyboard handling of its own, so
they became focusable separators with `aria-valuenow` / `-min` / `-max`: Tab to one, the arrows
move it 16 px (Ctrl coarser, Shift finer, as every scrub), Home / End to its limits. Dockview —
panels torn off and docked anywhere — is a different workspace, not a better splitter, and the
shape of the workspace is the owner's call; it is not started here.

**svelte-dnd-action (drag-and-drop lists).** The reorderable lists already drag with the
browser's own drag-and-drop, carefully (the MIDI chain's drop arithmetic is shared and tested), and
the editor tabs also drag *out* of their strip, which a list library's model does not cover. What
it would have added is keyboard reordering, so that is what was added where it was missing: the
editor tabs move with Ctrl+Shift+PageUp / PageDown, as a browser's do, keeping focus on the tab
moved; animation targets with Alt+Up / Alt+Down, as a line moves in an editor. The MIDI and effect
chains already had their Earlier / Later buttons. And one list was wrong rather than inaccessible:
dragging a combined shape's operand in the designer's layer list moved it in the stacking order,
where an operand is not drawn and its position means nothing, instead of in the shape, where for
Subtract it decides what is cut. It now reorders the shape (`planOperandMove`, sharing the arrow
buttons' rule for which operand paints), and dragging a layer into or out of a shape is refused by
name — that is what Combine and Release are for.

Checked by `browser-checks/reorderAndResize.mjs` (a splitter from the keyboard, tabs moved and
moved back, an operand dragged, a layer refused) and `browser-checks/animationTab.mjs`.
