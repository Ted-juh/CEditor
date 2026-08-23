# Custom Component Designer Workspace — Honest Review

> ## CLOSED, 2026-08-23
>
> Everything in this document is either done, verified already-done, or recorded below as
> deliberately not done with the reason. Pinned by `CE/web/test/surfaceDecomposition.test.js`.
>
> **§1 regressions** — restored on `main` before this round (see the 2026-07-12 banner below).
>
> **§2 bugs** — all five closed. 2.1 swatches now reveal the DisplayPanel dock *and* request its
> tab, which the `displayTabRequest` store already existed for. 2.2 the dock's X/Y translate the
> whole multi-selection; W/H are disabled for a group with a title saying why, because "make these
> three 200 wide" has at least three meanings. 2.3 the layer-action, precision and arc strips —
> 270 lines built and then `display:none`d — are deleted. 2.4 the dead Assets tab is gone; the
> "Make transparent" toggle beside it is **not** zombie UI and was left alone. 2.5 verified rather
> than changed: `history.js` has per-context stacks and picks the component context in surface mode.
>
> **§3 region gaps** — the substantive ones are closed: the collapsed palette is an icon strip
> rather than an empty rail; the DisplayPanel dock resizes and remembers; the destructive "Blank"
> command moved out of the insert cluster, wears the danger colour and asks first; the layer list
> filters and renames inline. The read-only inspector mini-lists are already gone. The Look bar's
> fill/stroke/corner *triplication* remains — collapsing three quick-property homes into one is a
> design decision with no obviously right answer, and is left for whoever makes it.
>
> **§4 Tier 0** — restored. **Tier 1** — complete: marquee selection and a right-click context menu
> are new here; multi-select property editing fans styling out over the selection; wheel zoom and
> cross-component copy/paste had already shipped.
>
> **Tier 2** — layer search, inline rename, the palette icon strip and the resizable dock are done.
> Scrubbable numeric fields, per-field reset and aspect-lock were already done (NumberCell
> drag-scrubs its label, `defaultValue` feeds that scrub, Shift constrains a resize). Drag-from-
> palette and the px/% unit toggle are not done. **Hit-zone rotation is not done and should not be
> attempted as a UI job**: zones have no rotation in the model, so it needs the field, the renderer
> and the runtime hit test together, and a zone that draws rotated while testing unrotated is worse
> than one that does neither.
>
> **Tier 3 stays Tier 3.** Containers, image fill on shapes, colour tokens and constraints are
> capability features spanning the model, the renderer, the runtime and the exporter — which is
> what this document's own heading for them says. Two notes for whoever picks them up: shared
> swatches already exist (`stores/palettes.js`, a persisted named palette library), so what is
> missing from "colour tokens" is the *reference* — a part storing a token name rather than a
> literal. And `SECTION_DEFAULTS.Background.Fill` already declares `imageEnabled`/`imageSrc`, but
> `InteractivePartRenderer` never reads them, so image fill is renderer work rather than a model
> change.
>
> **§5 decomposition** — see the note in that section. Eight components; 8,325 lines to ~5,500.
> The canvas viewport is the one region deliberately left whole, with the measurement that says why.
>
> **Theming** — one `--surface-accent` token, 45 chrome colours through it. Document colours were
> left alone: `FF5B9BD5` is also the fill a new layer is created with, and recolouring that would
> change what users' components look like.

> Companion to `cc-properties-panel-review.md` / `…-restructure-stages.md`, covering the other
> half of the editor: the workspace itself — canvas, left Shapes palette, the Look bar above,
> the function+zoom bar / States strip / DisplayPanel dock below, and the right dock.
> Everything below is verified against the current code (`CustomDesignSurfaceEditor.svelte`,
> ~8.8k lines; `EditorCanvas.svelte` component-workspace host) and git history.

> **STATUS UPDATE (2026-07-12, re-audited on main after the scripting branch merge):**
> **Tier 0 (§1 regressions) is almost entirely restored** by branch
> `claude/scripting-custom-component-editor-2op8oa` (now on main): smart guides + align/
> distribute + measure + `?` cheatsheet + window-level keys (`95760e1`), readiness nudge strip
> (`e8c8751`), Make Interactive wiring + `I` shortcut + grab-area halo (`5c5e0fd`). Also since
> shipped from the Tier 1 list: wheel zoom (`cfe94a5`) and cross-component copy/paste of parts
> (`customComponentClipboard.js`). The per-row table below is annotated. **Still open:** kit
> expansion/per-part selection (§1 last row), bugs §2.1 (hidden-dock case), §2.2, §2.3 (dead
> strips confirmed still present), §2.4, §2.5 (unverified), and the rest of Tier 1–3 (marquee,
> context menu, multi-select edits, layer search/rename, resizable dock, groups, image fill,
> colour tokens). §5 decomposition remains open and remains the priority.

---

## 1. Headline finding: the chrome rebuild silently regressed shipped features

Commit **`a15e2a9`** (Jun 19 — "Implement fill-editor swatches, move tool-strip, and state
trigger badges") rewrote `CustomDesignSurfaceEditor.svelte` from an older base
(**−1,198 / +480 lines**) and wiped features the redesign plan records as ✅ done. Later
commits restored fragments (`b755447` "restore Make-Interactive subsystem", `9b34c1a` "restore
dropped ruler infrastructure") — proving the pattern — but most are still gone:

| Feature | Shipped in | Status today |
|---|---|---|
| Make Interactive **tool wiring** (Phase 1E) | `030e0e7` | ~~Broken~~ **RESTORED `5c5e0fd` (2026-07-12)** — was: **Broken.** Flyout renders, but `setActiveTool('interactive')` early-returns (`'interactive'` isn't in `DRAW_TOOLS`, guard at `:477`), so the tool never activates and the advertised **(I)** shortcut is dead. `makeInteractive()` itself lives on in the factory (tests green) — only the surface entry point is severed. |
| Grab-area halo (Phase 1F) | `030e0e7`-era | **RESTORED `5c5e0fd` (2026-07-12)** — was: **Gone** (only a CSS comment noting a halo band was removed). |
| Object-relative smart guides (Phase 4) | `e6c434b` | **RESTORED `95760e1`** — was: **Gone.** `smartSnapCandidates`/`applyMoveSnap`: zero matches. Today's "guides" are grid-line flashes only — no object-edge/center snapping, no Alt-bypass toggle UI ("Smart" checkbox gone). |
| Align & distribute toolbar (Phase 4) | `e6c434b` | **RESTORED `95760e1`** — was: **Gone.** `alignSelectedLayers`/`distributeSelectedLayers`: zero matches. Six align buttons survive only inside a **hidden** dead strip (§4) and in the dock; **distribute exists nowhere**. |
| Two-selection measurement readouts (Phase 4) | `e6c434b` | **RESTORED `95760e1`** — was: **Gone** (`measurementLines`: zero matches). A draw/move `measure-badge` remains. |
| `?` shortcut cheatsheet + window-level key handling (Phase 4) | `e6c434b` | **RESTORED `95760e1`** (cheatsheet now in `SurfaceHelpOverlay.svelte`) — was: **Gone.** Keydown is back on the shell `<div>` (`:3370`) — shortcuts die when focus drifts, the exact bug Phase 4 fixed. |
| Readiness nudge strip (Phase 6/8) | `86f2ab2` | **RESTORED `e8c8751`** (Stage B2 dependency satisfied) — was: **Gone** (`analyzeCustomComponentReadiness`: zero matches in the surface). Readiness now renders **nowhere** except the Designer tab + Test Bench — which Stage B plans to delete on the assumption the canvas strip exists. **Stage B2 depends on restoring this.** |
| Expandable kit rows + per-part selection | `b4269ec` | **STILL OPEN (2026-07-12)** — **Gone** (`kitPartOverlayEntries` etc.: zero matches). Kits are opaque single-bound objects again; only Edit (materialize) / Delete remain. |

**Takeaway:** all the lost code is in git history and was written against this same data model —
restoration is *re-porting onto the new chrome*, not re-invention. And the root cause is
structural: a single 8.8k-line file that every big edit rewrites wholesale. The redesign plan's
§12.5 ("decompose the monoliths") has graduated from velocity concern to **data-loss mechanism**.

## 2. Bugs (beyond the regressions)

1. **Swatch click can do nothing.** Every colour/gradient swatch routes to
   `activateColorTarget`/`activateGradientTarget`, which only set the store — they don't un-hide
   the DisplayPanel dock or switch its tab. With the dock hidden (or on Notepad/Console), clicking
   a swatch has no visible effect.
2. **Multi-select numeric edits silently apply to one object.** The dock Transform X/Y/W/H read
   the multi-selection bounds but write only the primary part (`:4772-4818`). Align is the only
   true group operation. Either apply to the whole selection or disable the fields with a hint.
3. **Dead hidden strips.** `layer-action-strip`, `precision-strip` (X/Y/W/H/Rot + the 6 align
   buttons), and `arc-strip` are fully built and styled (~600 lines of markup+CSS) but forced
   `display:none` at `:5343-5348`. Their functionality mostly exists in the dock, so this is
   removable cruft — but it's also a trap: anyone grepping finds "align on canvas" and assumes
   it ships.
4. **Zombie UI vs commit log.** The Fill "Make transparent" toggle is still in the Look bar
   (`:3383-3388`) although `c61bc02` claims it was removed. The dock **Assets tab** is still a
   placeholder ("Assets are edited in the inspector for now") although redesign Phase 2C claims
   the dead tab was removed.
5. **Header undo/redo binds the app-global history store**, not a component-scoped stack — worth
   confirming a Ctrl+Z inside the designer can never undo a *panel* edit made earlier.

## 3. Review by region

### Workspace header (EditorCanvas)
Solid: breadcrumb, undo/redo, live status (canvas size / layers / zones / locked / generated
warnings), Preview–Edit toggle. Gaps: **"Back to Panel" only renders for panel-hosted tabs** —
a standalone component document has no exit affordance except the tab bar; component name is
not renamable here; no zoom readout (zoom lives only bottom-right, diagonal across the screen
from the header).

### Look bar (above canvas)
The concept is right — contextual quick-properties for the selected layer, Photoshop-style. Two
problems:

- **Triplication.** Fill/gradient/stroke/corner now live in **three** places: this strip, the
  left palette's Fill/Gradient/Stroke/Corner groups, and the dock Display→Paint section (plus
  the DisplayPanel for the actual pickers). Same fields, subtly different affordances (strip
  has the transparent-toggle + W/R; palette has hex readout + opacity%). Pick one quick home
  (the Look bar) and strip the others to swatch-status only.
- **No multi-select awareness** — with three layers selected it silently shows/edits the primary.

The Scripts summary block (right side) is a good pattern: glanceable state + one jump action.

### Left Shapes palette
Good shape coverage (6 basic, 12 vector, 6 click-to-add value controls, pen variants). Issues:
it's **half palette, half properties** — Fill/Gradient/Stroke/Corner/Path-Operations are
selection properties living in a panel labelled "Shapes"; **collapse hides everything** (46px
rail with only the three pane toggles) instead of collapsing to an icon strip; **no
drag-to-canvas** (click-to-arm or click-to-add-at-center only); polygons have no tool shortcuts.

### Bottom function+zoom bar
Functional and dense. Issues: **"Blank" — a destructive reset-canvas action — sits in the middle
of the insert buttons**; the insert kits duplicate the palette's Value Controls group; the zoom
cluster works but **there is no wheel/pinch/keyboard zoom at all** — no `onwheel` handler, no
Ctrl+=/−/0, and `utils/zoomController.js` (which the Panel Designer uses) **is not imported**.
Button-only zoom is the single biggest feel gap vs. the panel editor.

### States strip
The best chrome in the workspace: live mini-preview thumbs per state, trigger badges, H/P/D
quick-toggles, copy/edit/delete, collapsible. Keep as-is; consider it the design benchmark for
the rest.

### DisplayPanel dock
Fixed **340px**, not resizable, and the only place colours/gradients/align actually get edited —
combined with bug #1 it's a fragile dependency. Either make swatches open it (and switch tab)
reliably, or give colour editing a popover and let the dock be optional.

### Right dock
Layers list is genuinely good: drag-reorder, z-order buttons, visibility/lock, multi-select via
`+`, generated-output folding with jump-to-generator. Gaps: **no inline rename** (inspector
only), **no search/filter**, hit-zone rows have no reorder/visibility. The 5-tab inspector
(Object/Display/Behavior/States/Device) is mostly single-selection-oriented, and its
**States / Component API / Bindings sections are read-only mini-lists** — dead weight that the
panel restructure (Stage B8) already plans to remove.

## 4. Missing features, prioritized

**Tier 0 — restore what was lost (all code in git history):**
re-port from `e6c434b` / `030e0e7` / `86f2ab2` / `b4269ec`: Make Interactive activation (+ I
shortcut, + halo), smart guides, align/distribute, measure, `?` cheatsheet + window-level keys,
readiness strip, kit expansion. Fix bugs §2.1–2.2 in the same pass.

**Tier 1 — parity table stakes:**
- **Wheel/pinch + keyboard zoom** (Ctrl+wheel, Ctrl+=/−/0) via the existing `zoomController.js`.
- **Marquee selection** (none exists — unlike the panel editor).
- **Right-click context menu** (none exists; `CanvasContextMenu` pattern already in
  `EditorCanvas.svelte`): duplicate, z-order, lock/hide, delete, make-interactive-from-part,
  jump-to-cluster.
- **Clipboard copy/paste of parts** (zero clipboard code; only Ctrl+D duplicate) — including
  paste *across components*, the cheapest composition feature available.
- **Multi-select property editing** (fix the primary-only trap, make Paint/Transform group-aware).

**Tier 2 — quality of life:**
layer search + inline rename in the list; palette collapse → icon strip; drag-from-palette;
resizable DisplayPanel dock; aspect-lock toggle on W/H; scrubbable numeric fields (the
`PropertyScrub` component already exists and is used by `LayerEffectsSection`); per-field reset;
hit-zone rotation; unit (px/%) toggle on Transform fields.

**Tier 3 — capability (feeds the roadmap):**
user-created groups/containers (only generator folders and kits nest today); image fill on
shapes from Assets (fill is solid/gradient only — and would give the Assets dock tab a real
job); colour tokens/shared swatches (colours are raw hardcoded AARRGGBB strings everywhere);
constraints/anchors (plan §12.6).

## 5. Structural recommendation (do this before Tier 0)

> **DONE, 2026-08-23 — the decomposition half.** `CustomDesignSurfaceEditor.svelte` went from
> **8,325 lines to 6,298**, with six components beside it: `SurfaceLookBar`, `SurfacePalette`,
> `SurfaceBottomBar`, `SurfaceToolStrip`, `SurfaceDockLayers` and the pre-existing
> `SurfaceHelpOverlay`. Each took its own scoped CSS with it — that is most of the reduction, since
> 3,258 of the original lines were style.
>
> The names below are not quite the ones that landed, and the difference is the finding. The dock
> cannot come out in one piece: it needs **98 props**, and trading an 8,000-line file for a
> 98-argument signature is not the improvement this section is asking for. Its two tab groups are
> the real seams, so the Layers tab (35 props) came out and the inspector tabs (60) are the next
> cut. `surfaceInteraction.js` was already largely done under other names —
> `customDesignSurfaceGeometry.js` (26 exports), `customDesignSurfaceHelpers.js` (39),
> `zoomController.js`, `canvasSnapping.js` — so what was missing was the last of the interaction
> quanta: the zoom clamp, the zoom increment, the grid size and the snap functions are now pure and
> exported from the geometry module.
>
> The smoke tests this section asks for are in `test/surfaceDecomposition.test.js`: tool activation
> (the guard that would have caught the dead Make Interactive), snap and frame-snap maths including
> the Alt bypass, and the zoom clamp. Plus a ratchet on the parent's line count, so it cannot grow
> back quietly.
>
> One thing to know before extracting the next region: the shared glyph vocabulary (`.tool-icon`,
> the mini swatch buttons, the NumberCell wrapper) is defined once in the parent as
> `.surface-shell :global(...)`. Scoped CSS does not reach a child component, so the alternative is
> a copy of each rule in every component that draws a tool button — which is the duplication the
> properties-panel round spent two commits removing. A rule anchored on `.surface-shell` also has
> to stay in the parent: the child does not own that element.
>
> **The inspector came out too**, as `SurfaceDockInspector` — 442 lines of markup and 256 of CSS,
> at 57 props. Eight components now, and the parent is ~5,500 lines from 8,325.
>
> **The canvas viewport stays whole, and here is the measurement.** It needs **116 props**, and
> **68 pieces of parent state that its own handlers mutate** — the interaction record, the active
> frame, the draw draft, the smart guides, the arp editing state. Extracting it means 68 bindable
> props or 68 setters on top of the 116, or moving the handlers with it — and the handlers are
> called from the keyboard shortcuts and the dock as well as the canvas. That is not a smaller
> file, it is the same coupling with a boundary drawn through the middle of it. Left whole
> deliberately; the ratchet in the test keeps the rest from growing back into it.


Decompose `CustomDesignSurfaceEditor.svelte` **as part of the restoration**, not after: extract
`SurfaceLookBar`, `SurfacePalette`, `SurfaceBottomBar`, `SurfaceStatesStrip`, `SurfaceDock`, and
a `surfaceInteraction.js` module for the pointer/keyboard/snap logic. Every regression in §1
happened because the file is too big to edit without rewriting; smaller files make the next
overhaul additive. Add cheap smoke tests alongside: tool activation (would have caught the dead
Make Interactive), snap/guide math, zoom clamp — pure-logic tests in the existing vitest setup.

Also a small **theming pass**: the intended teal identity is only half-applied (Scripts chip,
ruler toggle, zoom cluster teal; tool-strip, paint-strip focus, selection overlays still panel
blue).

## 6. Relation to the staged panel plan

- **New Stage W0 (workspace restoration), before Stage A:** §5 decomposition + Tier 0 restores +
  §2 bug fixes. Stage B2 (readiness single-home = canvas strip) **hard-depends** on the readiness
  strip being restored; Stage C's canvas↔cluster sync assumes the halo and Make Interactive
  entry points exist.
- Stage B8's dock diet is corroborated here (read-only States/API/Bindings dock sections).
- The Look-bar/palette/dock paint **triplication** should fold into Stage B's one-home-per-concept
  pass: Look bar = quick edit; palette = shapes only; DisplayPanel = full pickers.
