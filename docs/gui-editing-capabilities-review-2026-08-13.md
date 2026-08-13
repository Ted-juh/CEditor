# GUI editing-capabilities review — 2026-08-13

Scope: the whole editing GUI — canvas, display panel, component tree, menu bar, the four
bars (Appearance / Function / Zoom / Icon rail), tab strip, status bar, shortcuts, and the
cross-cutting workflows (undo, clipboard, insertion, text editing, workspace switching).
**The properties panel is deliberately excluded** (next round), except where a command's
*only* home happens to be inside it — that placement itself is a finding.

Method: full read of the relevant Svelte/JS sources (App.svelte, EditorCanvas.svelte,
CanvasControl.svelte, DisplayPanel.svelte + tabs, ComponentTree.svelte, all layout/ bars,
and the stores behind them), cross-checked against the 2026-08-06 beta smoke test.

Verdict up front: **the feature list is unusually rich — rotation, containers,
drag-reparenting, key-object alignment, tidy-grid, circular arrange, ruler guides,
gradient direct-manipulation — but the interaction layer that exposes it is roughly two
generations behind the features themselves.** The gap to Canva/Adobe is not missing
capability; it is that capability being unreachable, unbound, zoom-broken, or parked at
the wrong end of the screen. Most of what follows is wiring work, not new subsystems.

---

## The six structural problems

Everything below the fold is an instance of one of these.

### S1. The editor confuses panel units with screen pixels

Selection handles are a hardcoded 8px, hit padding −5px, outlines 1–2px, rotate zones
16px — all *inside* the CSS-scaled surface (`transformMath.js:140-156`,
`CanvasControlSelectionOverlay.svelte:82-107`, `PanelSurface.svelte:56`). At 25% zoom a
handle is 2 screen px and effectively untargetable; at 400% it is 32 px and swallows the
control. The snap threshold (5 panel units, `canvasSnapping.js:7`) becomes 20 screen px
when zoomed out (everything sticks) and 1.25 px when zoomed in (snapping dies exactly when
doing precision work). The marquee's 3-unit click threshold and the zero-threshold
drag-start have the same disease — at 25% zoom, one pixel of hand tremor moves a control
4 panel units and dirties the document.

`GuideLines.svelte:10-16` already divides sizes by `scale`. The fix is known in-repo and
was never applied to the selection layer. **This one change would raise perceived canvas
quality more than any new feature.**

### S2. The keyboard cannot be trusted

Three independent failures compound:

1. **Canvas shortcuts live on a `tabindex="-1"` div** (`EditorCanvas.svelte:464` →
   `editorShortcuts.js`). Click the tree, a properties field, or finish a marquee (whose
   `preventDefault` suppresses focus transfer, `canvasInteractions.js:118`) and
   Delete / Ctrl+D / Ctrl+G / arrows silently die. The tree has *no* delete path at all —
   no key, no context menu, no button (`ComponentTree.svelte`).
2. **Five advertised shortcuts are bound nowhere.** Ctrl+S, Ctrl+Shift+S, Ctrl+N, Ctrl+O,
   Ctrl+W are printed in the File menu (`MenuBar.svelte:63-88`) and in the F1 overlay
   (`ShortcutsOverlay.svelte:6-12`) and have no handler anywhere (`App.svelte:76-101` is
   the complete global set). The muscle-memory save gesture in a document editor is a lie.
3. **Global Ctrl+Z has no target guard** (`App.svelte:94-100`). Undoing a typo in the
   name field, the notepad, or a script editor kills the native text undo and restores an
   entire panel snapshot — in a script tab it restores a panel that isn't even on screen,
   because `resolvePanelSelection` falls through for script tabs (`panels.js:468-481`).

One properly guarded global dispatcher (skip inputs/textareas/contenteditable, route by
active workspace) fixes all three and is the single highest-leverage change in this review.

### S3. Contextual editing is done at a distance (the display-panel paradigm)

Canva/Figma/Illustrator anchor color and gradient editing in a small popover *next to the
thing being edited*. CEditor routes it through a global bottom dock: clicking a color chip
sets a global target store and force-opens a panel at the opposite end of the window
consuming up to 44% of viewport height (`App.svelte:122-124,172-176`), often scrolling the
edited object out of view, with no label saying *what* is being edited, no Done/Cancel,
and no anchor relationship. It is a mode with almost no exit: targets are cleared only on
tab click (`DisplayPanel.svelte:376-384`), so closing the dock, changing selection, or
switching panels leaves a stale target — reopen the dock, drag the hue band, and you
repaint an object you deselected minutes ago (silent wrong-object writes; the smoke test's
gradient anomalies CE-BETA-009/010 sit in this same flow).

The alignment panel is the same story: the app's genuinely-best-in-class align/distribute/
tidy-grid/circular toolset (`alignment.js`, 25+ operations) is reachable only by opening a
44%-height dock at the moment you most need to *see* the canvas, and its eight sections
are laid out as a horizontally scrolling strip that hides Order/Size/Grid/Circle on
anything narrower than ~1100px (`AlignmentPanel.svelte:351-358`).

### S4. Features exist but are not wired to surfaces

A recurring, almost comic pattern: the store layer implements a command; the GUI never
surfaces it, or surfaces it in exactly one place.

- Group/ungroup, duplicate, delete, z-order, lock — all implemented, none reachable from
  the component tree; the tree is a read-mostly viewer (see §Tree).
- `bringToFront`/`sendToBack` exist (`alignment.js:543-583`) — context-menu-only; no
  `Ctrl+[`/`]`.
- Preview mode has exactly one entry point, a button inside the hideable properties panel
  (`PropertiesPanel.svelte:463`) — hide that panel (or shrink the window below 920px,
  which force-hides it *and* the rail with the un-hide toggle, `workspaceChrome.js:27-50`)
  and preview is unreachable.
- `undoAvailable`/`redoAvailable` exist; the Edit menu ignores them and stays enabled
  forever (`MenuBar.svelte:206-217`).
- 47 insertable component types exist in the icon rail; the Insert menu knows 11 of them,
  omits Slider and Knob — the two most important controls in a MIDI panel editor — and
  ships the developer artifact "TestBox" (`MenuBar.svelte:128-141`).

### S5. Chrome is fragmented and duplicated, and the copies disagree

Four bars plus a rail: AppearanceBar (60px), FunctionBar (56px), ZoomBar (24px), icon
rail (48px) — 140px of permanent vertical chrome that, with nothing selected, renders the
words "No selection" three times simultaneously (AppearanceBar, FunctionBar, StatusBar's
*hardcoded string* at `StatusBar.svelte:18`). Meanwhile:

- Fit-to-window has **three implementations** with two different paddings; menu and
  ZoomBar versions `document.querySelector` the first `.canvas-viewport` and can hit the
  wrong pane in split mode (`MenuBar.svelte:115-122`, `ZoomBar.svelte:56-69`,
  `canvasInteractions.js:171-178`). Ctrl+0 and the Fit button produce different zooms.
- Two different color pickers for the same property sit side by side in the AppearanceBar
  (native OS picker that cannot touch alpha, next to a `…` that opens the dock, which
  can — `AppearanceBar.svelte:226-234`).
- ZoomBar's left ~80% is a styled, non-functional "scrollbar placeholder"
  (`ZoomBar.svelte:73-75`) that looks draggable and does nothing.
- The AppearanceBar shows one facet at a time inside a fixed 374px box even on a 2560px
  display (`AppearanceBar.svelte:392-395`), and its Box facet has W/H/Rotation/Opacity but
  **no X/Y** — numeric position exists nowhere in the chrome.

### S6. Undo/redo is a debounced whole-document snapshotter with holes

`history.js` stringifies the entire active panel (including base64 images) on a 400ms
trailing debounce. Consequences: unrelated clicks within 400ms merge into one undo step;
a held arrow key produces zero snapshots until released; edits made in the 400ms before a
tab switch are silently erased from history (`resetBaseline` re-baselines without
flushing, `history.js:202-206,283-286`); two of five workspaces (Device Profile Designer,
Settings) have no undo at all; guides are outside undo *and* outside persistence entirely
(`guides.js` — right-click a guide and it is gone forever; reload and all guides vanish);
undo never restores selection, so undoing a delete brings the control back deselected with
a blanked properties context; and `restoreSnapshot` always sets `modified: true`, so undo
back to the saved state still shows a dirty dot. The drag handlers already have perfect
per-gesture boundaries (`handleDragEnd`/`handleResizeEnd`/`handleRotateEnd`) — they just
never push explicit transactions.

---

## Section-by-section findings

Severity: 🔴 data loss / core loop broken · 🟠 convention violation, daily friction ·
🟡 sharp edge · 🟢 polish.

### A. Canvas (EditorCanvas / CanvasControl / overlays)

| # | Sev | Finding |
|---|---|---|
| A1 | 🔴 | Handles, outlines, hit targets, snap thresholds not zoom-compensated (S1). |
| A2 | 🔴 | `overflow:hidden` on the panel surface (`PanelSurface.svelte:110`) clips handles/rotate zones of any control touching the panel edge — the most common position in a MIDI layout. Left/top handles of an `x:0` control cannot be grabbed; rotation is unreachable for edge-aligned controls. |
| A3 | 🔴 | Plain wheel zooms; there is no wheel/trackpad scroll at all (`zoomController.js:70-82`, unconditional `preventDefault`). Every mainstream tool uses wheel=scroll, Ctrl+wheel=zoom. The F1 overlay even documents "Ctrl+Scroll" — which is not what the code does. |
| A4 | 🔴 | Rotation is decorative: resize math ignores the rotation (drag a handle on a 45° control and it resizes along the wrong axis while translating the box), hit-testing and marquee use the unrotated AABB, there is no group rotation and no angle readout while rotating (`CanvasControl.svelte:910-937,980-1026`, `canvasSelection.js:32-50`). Shipping it in this state is worse than hiding it. |
| A5 | 🔴 | Controls nested in containers get the parent's `allControls` verbatim (`CanvasControl.svelte:3453`): snapping inside a container compares parent-relative against panel-space coordinates (snaps to nonsense), distance labels are fictional, and multi-drag of two children commits only the dragged one — the other follows visually then snaps back on mouseup. |
| A6 | 🟠 | Shift+click does not extend selection (only Ctrl/Cmd, `CanvasControl.svelte:562`); Shift+marquee replaces instead of adding (`EditorCanvas.svelte:278`). The most reflexive multi-select gestures in the industry do the wrong thing. |
| A7 | 🟠 | Alt+drag is bound to *suppress reparenting* (`CanvasControl.svelte:792,811`) instead of duplicate-in-place. Drag-duplicate doesn't exist. Shift+drag doesn't constrain axis. No modifier temporarily suspends snapping. Three near-universal drag modifiers, all absent or misassigned. |
| A8 | 🟠 | No multi-select bounding box: every selected control renders its own 8 handles (15 selected = 120 handles) and group-resize is impossible (`CanvasControl.svelte:3472`). No resize-from-center either. |
| A9 | 🟠 | No double-click behaviors at all on the main canvas — no enter-group, no inline text edit (the component designer's canvas *has* dblclick-to-edit-text, `CustomDesignSurfaceEditor.svelte:3938`; the main canvas has none). Marquee cannot select inside containers, so there is no rubber-band selection of nested controls, ever. |
| A10 | 🟡 | Hidden controls remain fully interactive (opacity 0.25, no `pointer-events:none`) — they eat clicks and marquees. Locked controls *block* clicks to what's beneath instead of being click-through, and you can't start a marquee on top of one. One locked item silently disables arrow-nudge for a whole 20-item selection (`editorShortcuts.js:88`). |
| A11 | 🟡 | Guides: index-addressed (deleting one corrupts which guide "selected" points to), a stale selected guide hijacks the Delete key away from controls, drag-out-of-ruler has no live preview (`EditorRuler.svelte:184` is an empty function), guides render inside the clipped surface so none can live in the pasteboard. |
| A12 | 🟡 | Ctrl+A + drag double-moves nested children (container translates and the child gets the delta again). Context menu opens off-screen near window edges (no clamping/flip, `CanvasContextMenu.svelte:100`). Fit-to-window doesn't reset scroll. Button/keyboard zoom isn't cursor/center-anchored (view drifts top-left). Zoom step is additive (10%→20% doubles; 390%→400% is nothing). |
| A13 | 🟢 | No dimension HUD during drag/resize (no live X/Y/W/H anywhere), no equal-spacing detection (the pink Figma-style indicators), no Alt-hover measuring, no Escape to cancel an in-flight drag or deselect, no Tab to cycle siblings, no drag cursor affordance. Right-drag pans (nonstandard) and a 3px twitch during right-click swallows the context menu. Vertical-only marquees never render (`w > 1` gate, `PanelSurface.svelte:95`). |

### B. Display panel (bottom dock)

| # | Sev | Finding |
|---|---|---|
| B1 | 🔴 | Stale color/gradient targets write to the wrong object (S3). Targets are cleared *only* in `handleTabClick`; selection change, dock close, panel switch, and control deletion all leave the target live (`DisplayPanel.svelte:376-384`, `colorTarget.js:63`). |
| B2 | 🔴 | Default panel background color path parses 8-char `FF333333` as 6-char → **bright red** shown for a dark-grey panel (`DisplayPanel.svelte:151,307-308,351` vs `panelModel.js:71`), and writes back 6-char, silently discarding alpha — so the alpha band does nothing for panel backgrounds and the stored format flip-flops by code path. |
| B3 | 🔴 | Tab switching unmounts tabs and destroys their state: **all 24 saved gradient presets are wiped the moment you leave the Gradient tab** (`GradientTab.svelte:30`) — and the stop-color flow forces you to leave (B5). Swatches aren't persisted either (`DisplayPanel.svelte:167`); every reload wipes them, while the app *does* persist the gradient sidebar's section ordering. Persistence effort was spent on the wrong state. |
| B4 | 🟠 | The color picker ships quantised: default `stepSize = 10` snaps the hue band to 36° increments — roughly 10 reachable hues out of the box — with the escape hatch an unexplained "Step" row that resets on reload (`DisplayPanel.svelte:164`, `ColorChooser.svelte:104`, `dragScrub.ts:343-356`). No design tool ships a snapping color picker. |
| B5 | 🟠 | Editing a gradient stop's color requires leaving the gradient editor entirely: sidebar chip → dock swaps to Colors tab → edit → "Back to Gradient" → dock swaps back. Two full-panel transitions per stop; no `dblclick` on the stop thumb (`GradientEditor.svelte:312-319`). Illustrator: double-click the stop. Adjacent deferred-edit modes have opposite abandonment semantics (stop edit commits on tab-away; notepad color discards). |
| B6 | 🟠 | Color chooser is not modern: no 2D SV square (four 1-D bands; the "B" band is actually HSL lightness, so it whites out at the top, unlike Photoshop's HSB), no screen/canvas eyedropper (the only eyedropper samples Viewer-tab images into "first empty swatch"), no recent colors, no document colors, no named/persisted palettes, hex field accepts 6/8 chars only and silently reverts. |
| B7 | 🟠 | The gradient editor's proxy shape is a manual dropdown, not the selected control's real geometry — WYSIWYG broken; and `GradientTab` silently drops the `shape` prop it is passed (`GradientTab.svelte:17-29`), so shape resets to rectangle after any stop-color round trip. |
| B8 | 🟠 | Clicking Colors/Gradient tabs snaps the dock to 480/580px, overwriting and *persisting over* the height the user dragged (`App.svelte:177-182`) — the canvas relayouts under the pointer mid-task. Max height 44% of the viewport for what is, most of the time, a color picker. |
| B9 | 🟡 | Discoverability ≈ zero: hidden by default, one unlabeled `PanelBottom` icon, no menu entry, no shortcut. Nine tabs including the app's only alignment UI, a device browser, live preview, and console — first encountered when the dock *ambushes* the user at 44% height on a color-chip click, opening on whatever tab was last active. |
| B10 | 🟡 | The "Effects" tab is a shipped placeholder ("full editing coming soon") occupying a prime rail slot. Swatch cells overload three gestures on a 14px target (click store-or-apply / dblclick permanently clears with no undo / right-click overwrites) and change meaning per tab. `ViewerSettings` polls on a 100ms `setInterval` forever. Notepad is built on deprecated `document.execCommand`. |

### C. Component tree

| # | Sev | Finding |
|---|---|---|
| C1 | 🔴 | The tree is a viewer, not a layers panel: no Delete key (rows aren't focusable and there's no row keybinding), no context menu (`oncontextmenu` absent while the app globally suppresses the native menu — right-click yields *nothing*), no duplicate, no group/ungroup, no front/back — every one of those commands already exists in stores and is wired only to the canvas context menu. |
| C2 | 🔴 | Multi-select exists (Ctrl+click) but is inert: drag moves only the grabbed row, eye/lock apply to one row, and (with C1) a 12-row selection can do nothing except turn blue. No Shift range-select. |
| C3 | 🟠 | Canvas→tree sync is half-blind: no scroll-into-view (nowhere in the app), no auto-expand of collapsed ancestors — select a nested control on canvas and the tree may show *no* selected row at all. |
| C4 | 🟠 | Cross-layer drag half-applies: the reparent commits, then the layer check aborts the reorder and silently returns (`ComponentTree.svelte:166-180`) — a half-finished operation driven by a `Core.layer` field that has **no editing UI anywhere in the app**. |
| C5 | 🟠 | Doesn't scale: no search/filter, no virtualization (full re-derive of all rows on every 60fps canvas drag), and a text type-badge that eats half the 200px panel width to say "MomentaryButton" next to a default name of "MomentaryButton_12". |
| C6 | 🟡 | Hidden/locked state doesn't propagate visually to children rows (tree contradicts canvas). Rename is dblclick-only (no F2 — a convention the app itself uses elsewhere), can't be cleared, no duplicate-name check despite names being the script-addressable handle. Collapse state resets whenever the panel is toggled and leaks across panel tabs. No drag auto-scroll. 100% mouse-only (a11y suppressed rather than satisfied). |

### D. Chrome: menus, bars, tabs, status

| # | Sev | Finding |
|---|---|---|
| D1 | 🔴 | Ctrl+S/N/O/W/Shift+S advertised, bound nowhere (S2). Closing a modified tab (button *or* stray middle-click) has no confirmation and **rewrites the session recovery snapshot without the closed panel** — the autosave copy is destroyed at the moment it's most needed (`TabBar.svelte:18-52`, `panels.js:776-817`). |
| D2 | 🔴 | Global Ctrl+Z unguarded (S2); in script tabs it edits an off-screen panel; in the notepad it kills native text undo, and notepad undo silently corrupts (model reverts, contenteditable doesn't re-sync, next keystroke writes stale DOM back — `NotepadEditor.svelte:11-31`). |
| D3 | 🟠 | Menus support no disabled/checked state at all (`MenuBar.svelte:206-217`): Undo/Redo always enabled, Toggle Grid/Snap show no state, Cut/Copy/Paste never grey out, insert items silently no-op with no panel open (the icon rail gets this right and explains itself; the menu doesn't). Five dead `() => {}` items ship to users (Panel Properties…, Export Settings…, Build Standalone, Build Settings…, Validate Active Script), and Debug's first two items are the same function. No mnemonics, no Escape-to-close, no ARIA. |
| D4 | 🟠 | Insert fragmentation (S4): menu 11 of 47 types, no Slider/Knob, includes TestBox; rail is bare 18px glyphs with hover-only titles, no search for built-ins, no thumbnails for built-ins (custom packages get both), no drag-to-place, no recently-used. Below 920px the rail vanishes and ~36 types become uninsertable with no indication. |
| D5 | 🟠 | Insertion placement is a blind cascade: `+20px` per existing control from origin, ignoring viewport, zoom, selection, and containers (`controls.js:158-183`). On the default 600×400 panel, the 20th insert lands entirely *below* the panel — invisible but auto-selected, so the properties panel edits something the user cannot see. Deleting controls makes later inserts stack exactly on top of earlier ones. |
| D6 | 🟠 | Edit menu lacks Duplicate, Delete, Group/Ungroup, Arrange — all of which work via shortcut or right-click but appear in no menu; Ctrl+G/Ctrl+Shift+G are documented nowhere. File has no Recent Files (panels track `filePath`; a recent list exists for scripts only). No Window menu mirroring the three panel toggles. "Open Saved Custom Component" silently opens `library[0]` with no picker while TabBar's equivalent shows a real picker. |
| D7 | 🟠 | Status bar shows a script message, a hardcoded "No selection", and a version string (`StatusBar.svelte:15-20`). No selection name/count, no X/Y/W/H, no zoom, no grid/snap state, no panel size, no dirty flag — all already in stores. The cheapest fix in this review. |
| D8 | 🟡 | TabBar: a modal "New" toggle silently re-purposes the Panel/Component/Device buttons between create and open (Script ignores the mode); no tab reorder, no overflow UI, no per-tab context menu, no file-path tooltip. |
| D9 | 🟡 | Shortcut norms absent: no `Ctrl+[`/`]` z-order, no `Ctrl+L` lock, no `Ctrl+Tab`/`Ctrl+1-9` tab switching, no preview shortcut, no Escape-deselect, no Alt+drag duplicate, no Tab-cycle. F1 overlay documents 5 dead shortcuts and mis-documents wheel zoom; omits Ctrl+G, Ctrl+Shift+G, Ctrl+,, middle-click close. |

### E. Cross-cutting workflows

| # | Sev | Finding |
|---|---|---|
| E1 | 🔴 | Undo holes and debounce merging (S6): 400ms merge of unrelated edits, tab-switch erasure, no DPD/Settings undo, guides outside undo+persistence, selection not restored, dirty flag stuck on. History is never freed (`clearHistory` has zero call sites) and snapshots include base64 images — ~200MB pinned per image-heavy panel. |
| E2 | 🟠 | Copy/paste vs duplicate disagree: Ctrl+D preserves the parent container; Ctrl+C/V always pastes to panel root (`clipboard.js:104` vs `controls.js:295-306`) — same input, structurally different documents. Neither enforces name uniqueness although names are script bindings; the two use different `_copy` suffix rules. No paste-in-place; keyboard paste is always +20/+20; paste never targets the selected container. |
| E3 | 🟠 | No format painter of any kind (zero hits for copy/paste-style app-wide). The one layer-clipboard that exists lives in the *control* background editor only — the panel background editor is a separate implementation with no copy/paste at all, and there's no path to move a background between control and panel. Card presets are localStorage-global, so a shared `.cepanel` arrives without the presets its design depends on. `Core.stylePreset` is an input wired to a field nothing reads — a fake feature in the most-visited card. |
| E4 | 🟠 | Workspace switching replaces the entire application in one frame (S5 adjacent): tab-hop to component/device/script tears down rail, bars, tree, and dock with no transition and no persistent shell (`workspaceChrome.js:13-50`). The Device Profile Designer ships a fake macOS title bar with painted traffic-light dots and a "CEditor" wordmark *inside a tab of CEditor*, plus nav items that say "not built yet." |
| E5 | 🟠 | Canvas text is display-only: changing a button caption is select → find properties → Text tab → textarea → **explicit OK/blur/Ctrl+Enter commit**. Meanwhile the component-designer canvas has dblclick-to-edit, the tree has dblclick-to-rename, and the *runtime preview* has a full text-edit engine — the author has less text capability than the end user of the finished panel. Any external text change (including undo) destroys and rebuilds the entire 98KB TextEditor via a `{#key}` block. |
| E6 | 🟡 | New-panel onboarding is a bare grey 600×400 rectangle: no hint pointing at the icon rail, no starter templates, no sample panel, no recent files. (The no-document empty state, by contrast, is genuinely good.) |

---

## What is genuinely good (keep, and pattern-match against)

- The gradient axis editor's direct manipulation (draggable stops, center, radius,
  click-to-insert with interpolated color, right-click delete) is Illustrator-grade.
- The align/distribute/tidy-grid/circular command set exceeds Figma's.
- Key-object selection with align-to-key (amber outline) beats most tools.
- Drag-reparent into containers with visual position preservation, and drop-target
  highlighting, are correctly built.
- One drag = one clean store commit on mouseup (the undo *boundaries* exist; they're
  just not used as transactions).
- The icon rail's flyouts have correct ARIA/keyboard behavior; the custom-component
  library drawer (search, filters, thumbnails, pinning) is the best palette in the app —
  ironically better than the built-ins get.
- Lazy tab loading with error surfacing; refusing to restore the Preview tab on boot;
  the no-document empty state.

The craft is there. The findings above are almost never "this was built badly" — they are
"this was built and then not connected."

---

## What to expand, what to downsize

**Expand (underbuilt relative to importance):**

1. The status bar — from 3 dead items to the app's live readout (selection, X/Y/W/H,
   zoom, grid/snap, dirty state).
2. The component tree — from viewer to layers panel (context menu, Delete, multi-select
   operations, search, scroll-into-view, auto-expand).
3. In-context editing — anchored color/gradient popovers near the selection; dblclick
   inline text edit on the canvas; dblclick a gradient stop for its color.
4. Insert — one searchable palette with thumbnails for built-ins, drag-to-place,
   insert-at-viewport-center into the selected container.
5. The keyboard map — one guarded global dispatcher, the missing norms (Ctrl+S first),
   and an F1 overlay generated from the actual bindings so it can never lie again.

**Downsize (overbuilt or wrongly placed):**

1. The bottom dock's scope — color/gradient/align belong in anchored popovers; the dock
   earns its place for Device / Preview / Console / Notepad / Viewer. 44% height for a
   color picker is indefensible.
2. The four-bar chrome — merge AppearanceBar + FunctionBar into one full-width context
   bar; fold ZoomBar's six controls into the status bar; delete the fake scrollbar.
   Recovers ~110 vertical px for the canvas.
3. Menu surface — delete the five dead items, the duplicate Debug item, and TestBox;
   collapse the two "new/open" models (menu vs TabBar's modal New toggle) into one.
4. Rotation — either finish it (rotation-aware resize/hit-testing, angle HUD, group
   rotate) or remove the handles until it's real. Half-shipped, it damages trust.
5. The DPD's fake title bar and "not built yet" nav items — remove from the shipping UI.

---

## Suggested fix order

Weeks-not-months items first; each line is independently shippable.

1. **One guarded global keyboard dispatcher** (kills S2 entirely: dead Ctrl+S family,
   focus-lost Delete/Ctrl+D, Ctrl+Z-in-inputs, script-tab wrong-panel undo). Plus
   dirty-close confirmation and stop pruning the recovery snapshot on close.
2. **Zoom-compensate the selection layer and thresholds** (S1) — divide by `scale` as
   `GuideLines.svelte` already does; add a 3–4 *screen*-px drag threshold.
3. **Clear color/gradient targets on selection change / dock close / panel switch**, and
   label the dock with its current target + a Done button (B1); fix the ARGB parse (B2);
   default `stepSize` to 1 (B4); persist swatches and gradient presets (B3).
4. **Per-gesture undo transactions** at the three `*End` handlers + flush-before-rebaseline
   on tab switch; snapshot selection; exclude data-URL fields; wire `clearHistory` into
   panel close (E1).
5. **Tree: context menu + Delete + multi-select ops + scroll-into-view** (C1–C3) — every
   command already exists in stores.
6. **Wheel=scroll, Ctrl+wheel=zoom**; single fit-to-window implementation; anchored
   button/keyboard zoom (A3, A12, D—Fit).
7. **Shift+click / Shift+marquee extend; Alt+drag duplicate; Shift+drag axis-constrain;
   Ctrl suspends snapping** (A6, A7).
8. **Insert at viewport center into selected container; unify menu and rail; add
   Slider/Knob to the menu or replace the menu with the palette** (D4, D5).
9. **Multi-select bounding box with group resize** (A8).
10. **Status bar readout** (D7) — an afternoon of work, permanent payoff.

Then the bigger bets, in order of leverage: anchored color/gradient popovers (S3),
inline canvas text editing (E5), bar consolidation (S5), finishing or hiding rotation
(A4), paste/duplicate unification + name uniqueness (E2), and a real format painter (E3).
