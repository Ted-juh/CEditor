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
| `paper` ^0.12.18 | MIT | `utils/partBooleans.js`, loaded lazily | No — dynamic import, editor only |

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

Left CSS-anchored, because they sit inside a fixed layout and do not reach an edge: the effect
colour popover, the device-insight picker, the custom-interact add menu, the tab tray and workspace
picker, the insert flyout and the surface tool strip's flyouts. Convert them the same way if one
ever clips.

Checked by `browser-checks/floatingUi.mjs`: a menu at the window corner flips up and left and
follows a resize, a submenu at the right edge flips left, the menu bar survives a 520 px window, the
tree menu opens upward from its lowest row, and a bottom-row combobox opens above itself.

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

## Paper.js: booleans and smoothing in the Component Designer

**The problem.** The designer's parts are primitives plus pen paths. A plate with a hole, a notched
pointer or a crescent could only be faked with overlapping parts and a background-coloured fill,
which breaks as soon as the panel colour changes.

**What changed.** Unite, Subtract, Intersect and Exclude on a multi-selection, and Smooth on a pen
path (user docs: [The Pen](../pen-tool.md#combining-shapes)). Paper.js runs headless, loaded by a
dynamic `import()` on first use, so neither the editor's first load nor the player pays for it.
`partOutline` turns each part into its real outline — per-corner radii, the capsule's stadium,
polygon points, layout scale and rotation about the pivot — so what is combined is what is drawn.

The result is a new part form: `kind: 'path'` with `meta.pathData` (an SVG path in the part's 0..1
box) and no `vectorPoints`. `InteractivePartRenderer` draws it as one `<path>` with
`fill-rule="evenodd"` and a non-scaling stroke inset by half its width, everywhere parts render. It
imports only `hasCompoundPath` from `penPath.js`, never `partBooleans.js`, which is what keeps
Paper.js out of the player.

Refused rather than approximated: see the user docs. The ones worth knowing as a developer are the
reference checks — a removed operand referenced by a hit zone (`part:name`), a binding
(`Parts.name.`), a state's `patches.parts`, a published property or a variant stops the operation,
because removing it would leave that reference dangling. The applied change is one
`applyControlPatch` of `Parts._children`, so it is one undo step.

**Known limit.** A compound path is not vertex-editable: it has no point handles. Converting it
back to editable points (per subpath, with curve handles) is the natural next step if it is asked
for.

Checked by `test/partBooleans.test.js` (areas per operation, ownership, turned and scaled outlines,
refusals, references, smoothing, the SSR renderer) and `browser-checks/partBooleans.mjs` (subtract
through the real toolbar, undo and redo, a pixel check that the hole is really empty, smooth).
