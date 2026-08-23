# Properties panel review — compactness, widgets, icons — 2026-08-14

Scope: the right-hand properties panel — `panels/PropertiesPanel.svelte`, its
tab/card shell (`TabIconBar`, `TabContentArea`, `SectionRenderer`), the shared
widget kit in `properties/`, and all ~69 section editors in `sections/`
(~35,800 lines, of which 10,189 are scoped CSS). This is the round that was
deliberately excluded from the 2026-08-13 GUI review.

Method: full read of the shell and widget kit, plus a mechanical sweep of every
section file — element counts, CSS-duplication clustering, per-editor height
audits with all conditionals open.

Verdict up front: **the panel has a genuinely good design system that almost
nobody uses below the label.** `PropertySection`/`PropertyCell` are adopted by
56 of 69 editors — 1,479 labelled cells on a tidy 4-column grid with built-in
hint and search-filter plumbing. But the kit stops at the label: inside those
1,479 cells sit **1,445 raw native elements** (499 `<button>`, 289 `<select>`,
285 `<input type=number>`, 170 `<input type=text>`, 131 `<input type=color>`,
49 checkboxes). Every editor re-skins them by pasting the same CSS — the `.val`
field style exists in **53 files** (9 drifted variants, including a
different colour palette), the colour swatch in 16, the action button in 30.
Meanwhile the best widgets in the kit are orphans: `PropertyColor` is used by
2 files, `PropertyScrub` (a Canva-style drag-scrub slider) by **zero**
sections, `PresetFooter` by zero. The result is a panel that averages
**29px of height per property** and shows ~25 properties per 900px screen,
where the best editor in the repo (`TransformEditor`, paired rows) proves
19px/property is achievable in the same visual language.

---

## Structural problems

### S1. The widget kit covers layout, not controls

`properties/` supplies the section header, the grid, the labelled cell, and a
boolean toggle — and that's where it ends. There is **no shared Select, no
shared TextInput, no shared ColorField, no shared Button, no shared Slider**.
Those four gaps account for 1,074 of the 1,445 raw elements. The styling for
them already exists — as 53 pasted copies of `.val`, 16 of `.cswatch`, 30 of
`.action-btn`. The abstraction was stopped one level too early, and every
editor since has paid the tax in copy-paste.

The drift is user-visible, not cosmetic bookkeeping:

- 9 distinct `.val` bodies → three input heights (23/24/26px) that sit
  side-by-side in the same grid row with misaligned baselines.
- 8 files (Arp, ChordPad, Harmoniser, NoteRibbon, Phrase, Recorder, Setlist,
  SplitZone) use a **different palette entirely** (`#141420` bg, `#E8E8EE`
  text) — switching from the Behavior tab to the Arp tab visibly changes the
  input skin.
- 13 files' `.val` lost `box-sizing: border-box` in the pasting — a live
  horizontal-overflow bug in a `min-width: 0` grid column (BehaviorEditor,
  EffectsEditor, StatesEditor, ValueEditor, ContentLayoutEditor…).

### S2. 131 colour inputs bypass the display panel

The owner-stated design rule is that *everything colour goes through the
display panel*. Three editors honour it (`BackgroundEditor`, `TextEditor`,
`CustomDesignSurfaceEditor` route through `activateColorTarget`). **29 files —
131 sites — use a bare `<input type="color">`** instead: the OS colour dialog
pops over the app, can't express the alpha byte the AARRGGBB model stores,
can't reach gradients, swatches, document colours, or recents. This is the
single largest violation of the app's own colour architecture, and the widget
that fixes it (`PropertyColor`: swatch → dock, plus hex field) already exists —
imported by 2 files.

### S3. Four coexisting row idioms

1. **PropertyCell 4-col grid** (label above input, blue 10px caps) — 56 files.
2. **`.prop-row` inline label** (grey 11px label left of input) —
   `TransformEditor`, `CoreEditor`, `BackgroundEditor`, parts of `TextEditor`.
   `BackgroundEditor.svelte:542` even cancels the shared grid from inside a
   section with `:global(.property-grid) { display:flex; flex-direction:column }`.
3. **`.fld` stacked pairs** — 7 files re-implement PropertyCell's own layout
   locally, on top of importing PropertyCell.
4. **`.dock-field` system** — `CustomDesignSurfaceEditor` (92px left label,
   different palette, different title colour/weight), 3,329 lines of CSS in
   one file.

Booleans alone render **six different ways**: PropertyToggle (269×), bare
checkbox in a cell, `.flag` label-chips, `.ex-chk` 3-letter abbreviations
(23 in PixelDisplayEditor: "Frm", "Tck", "Pk"…), table-cell checkboxes, and
toolbar checkboxes. Nine files mix two of these internally —
`BehaviorEditor` renders PropertyToggle 12 times, then two raw checkboxes in
the same section for "Editable"/"Focusable".

### S4. Vertical waste — measured

Corpus: 1,541 cells, 289 sections, 774 grid rows ≈ 45,000px of content at
29.2px/property. Concrete sinks, ranked:

- **185 avoidably-wide cells.** PropertyToggle is a fixed 26px On/Off button
  that needs ~50px, yet it gets `span={2}` 88 times; NumberInput gets a bare
  `span={2}` 97 times. Halving them removes ~92 grid rows ≈ **4,050px**.
- **59 near-empty sections.** 40 PropertySections contain exactly one cell and
  19 contain zero — 38px of header chrome each ≈ **2,240px**. Canonical:
  `EffectsEditor.svelte:35` spends 78px hosting a 3-button target picker.
- **122 empty-label cells** still reserve the 13px label strip ≈ **1,590px**.
- **The inline-label fork is the least dense idiom in the repo**:
  `CoreEditor` spends 394px on 10 values (Visible/Enabled/Locked are three
  full-width rows for three booleans); `BackgroundEditor` averages
  34px/property. Meanwhile `TransformEditor`'s paired rows hit 19px/property —
  the proof the visual language supports 2× density.
- **264 `span={4}` cells** (17%) on a panel whose minimum width is 600px —
  each column is ~145px, enough for a number field.

Fixed chrome eats 161px before content starts (34 toolbar + 30 card header +
16 padding + 81 info bar), leaving a 739px viewport → **~25 properties
visible**. `TextEditor` is 4.3 screens tall (130 properties, 17 sibling
sections — with "Geometry" and "Colour Effects" each appearing twice at
different scroll depths); `BehaviorEditor` is 1.9 screens.

### S5. Collapse state is three systems, none finished

- Tab level: persisted, works.
- Card level (multi mode): persisted, works, but no expand/collapse-all.
- Subsection level: `PropertySection` defaults open, and **only 16 of 289
  instances wire the `collapsed` prop** to the existing persistence store
  (`stores/sectionCollapse.js`). For the other ~94%, collapse is throwaway
  local state — and `SectionRenderer` keys the editor on the control id, so
  collapsing a section and clicking another component springs everything open
  again. Exactly one section in the panel ships collapsed-by-default.

### S6. No altitude control

Everything a section can show, it shows. One section in 69 is titled
"Advanced" (StatesEditor) — and it's open by default. Five hand-rolled
show-more affordances exist, no two sharing an idiom. There is no density
setting, and there *can't* be one cheaply: row metrics are hardcoded literals
repeated across 69 scoped style blocks (`var(--` appears once in the whole
properties system). The good property search — filter plumbing already built
into PropertyCell/PropertySection — **renders only for custom components**;
ordinary controls get no search box at all.

### S7. A text wall with no visual anchors

The panel chrome is iconographic (13 lucide icons in the toolbar, 40+ in the
tab rail) — and then the content is 1,479 rows of uniform 10px uppercase text.
Zero inline SVG in any section; 6 of 69 editors import any icon;
`PropertySection` has no icon slot; the 11 hand-drawn control icons in
`components/icons/` (built for the insert catalog) are imported by **zero**
section files. Nothing helps the eye find "the colour rows" or "the geometry
rows" while scrolling a 4-screen tab. The tab rail itself only shows ~28 of
55 possible tabs in 900px before scrolling.

### S8. The three mega-editors fork the design system

`CustomDesignSurfaceEditor` (8,379 lines), `CustomTestBenchEditor`,
`CustomPackageLibrary` carry **46% of all section CSS** in 3 of 69 files.
The first bypasses the kit entirely (its own dock system, palette, label
grammar at 35px/property — 20% worse than the grid it ignores); the other two
nominally comply but use `span={4}` as an escape hatch and build bespoke
sub-grids inside (6-col scenario grids, 8-col rig arrays) with drifted
palettes (`#151A1E`, `#22282D`, `#1C252C`…).

---

## What's already good (credit where due)

- `PropertyCell`'s hint→Info-bar and filter-count plumbing is genuinely nice
  infrastructure — better than most commercial editors bother with.
- The 4-column grid packs well where it's used honestly: only 5.6% of column
  slots are wasted.
- `TransformEditor`'s paired rows are the best pattern in the panel.
- `NumberInput` (the ± stepper) is genuinely centralised — 258 instances, only
  one outlier reimplementation.
- The tab-rail + single-tab model is a defensible altitude control; the
  Simple/Advanced creator-mode gate and audience gating (instance vs author)
  show the progressive-disclosure muscle exists — it just isn't applied to
  ordinary sections.

---

## Fix order

Each step is shippable alone; ordered so the widget kit lands before the mass
migrations that need it.

1. **Finish the widget kit.** Add `PropertySelect`, `PropertyText`,
   `PropertyNumber` (wrap NumberInput), `PropertyButton` — one skin, one
   height (26px), one focus ring, `box-sizing` correct once. Fold the 9 `.val`
   variants into it; delete the purple fork. Metrics come from CSS custom
   properties on the panel root so a density toggle becomes a 5-line change.
2. **Colour through the dock, everywhere.** Replace all 131
   `<input type="color">` sites with `PropertyColor` wired to
   `activateColorTarget` (target path + current value). Kills the OS dialog,
   restores alpha/gradient/swatch/recents access, and finally enforces the
   display-panel colour rule. Mechanical but wide — one commit per editor
   cluster.
3. **One boolean.** Migrate the five stray checkbox patterns to
   `PropertyToggle` (give it a `compact` variant for dense grids like
   PixelDisplay's flag block). Nine files currently mix idioms in one view.
4. **Density pass on spans.** `span={1}` for toggles and bare number fields
   (185 cells), pair the natural couples (CoreEditor's three boolean rows →
   one row; padding/offset rows), drop empty-label strips, merge the 59
   single/zero-cell sections into neighbours. ~18% total height back with no
   affordance changes.
5. **Convert the inline-label holdouts.** `CoreEditor`, `BackgroundEditor`
   (and `TextEditor`'s `.prop-row` islands) onto the grid; delete the
   `:global(.property-grid)` override. CoreEditor alone goes 394px → ~258px.
6. **Wire collapse for real.** Every PropertySection gets a stable key into
   `sectionCollapse` (they exist — BackgroundEditor shows the pattern), rarely
   used sections ship collapsed-by-default, and collapse state survives
   selection changes. Add expand/collapse-all to the card header.
7. **Search for everyone.** Move the property search out of the
   custom-component footer into the panel toolbar — the filter infrastructure
   in PropertyCell/PropertySection already does all the work.
8. **Icon anchors.** Give `PropertySection` an optional icon slot and use a
   small stable vocabulary (paint-bucket = fill, type = text, move = geometry,
   sparkles = effects…), reusing the lucide set + `components/icons/` glyphs
   already in the repo. Headers become scannable landmarks in multi-screen
   tabs; also de-duplicate TextEditor's twice-repeated section titles.
9. **Adopt the orphans.** `PropertyScrub` for 0–100/0–360 ranges (opacity,
   rotation, saturation — the drag-scrub interaction is the single most
   "Canva-like" upgrade available and it's already written); `PresetFooter`
   for the three duplicated preset-grid implementations.
10. **Rein in the mega-editors.** Port `CustomDesignSurfaceEditor`'s dock
    fields onto the kit (or at least onto its tokens), and give the TestBench/
    PackageLibrary sub-grids shared primitives. This is the long tail — last
    for a reason.

## Status

> Written 2026-08-14 on branch `claude/gui-editing-capabilities-review-gvpm5o` as the survey for
> the properties-panel round scoped out of the 2026-08-13 review.

### Re-audited 2026-08-23 — several findings had already closed

The survey was accurate when written and parts of it stopped being true without anyone updating
it. Measured against the tree, not against this document:

| Finding | Then | Now |
|---|---|---|
| **S2** bare `<input type="color">` | 131 sites, 29 files | **0 in `sections/`.** Four remain, all in `debug/CutoutDebugPage.svelte`, which is not the properties panel. |
| Raw `<input type=number>` | 285 sites | **4**, in one file. `NumberCell` has 52 importers. |
| `.cswatch` pasted swatch | 16 files | **0** |
| **S7** icon anchors | `PropertySection` had no icon slot; 0 sections used one | Slot exists (plus a `tools` slot); **207 sections pass an icon**. |
| Empty-label cells | 122 reserving a 13px strip | `PropertyCell` has `compact`; **407 cells use it**. |
| `PropertyScrub` | 0 sections | 7 |

One claim was wrong on re-reading rather than out of date: S1 says eight files "use a different
palette entirely". `#141420`/`#E8E8EE` is the `.preview` readout background in ArpEditor and
friends, not their field skin. The real fork was narrower and elsewhere — five files
(Harmoniser, Phrase, Recorder, Setlist, SplitZone) whose **`.val` itself** was purple.

### Fixed 2026-08-23 — steps 1, 6, 7, and a bug the survey missed

- **Step 1, the kit.** `PropertySelect`, `PropertyText`, `PropertyButton` added. Field metrics are
  now seven custom properties on `.properties-panel`, and all **54 base `.val` rules** consume
  them — 19 distinct bodies down to one. The five purple `.val` rules are gone with them.
- **The overflow bug.** 18 `.val` copies had lost `box-sizing: border-box`; in a `min-width: 0`
  grid column that overflows the row. Fixed, and a test now fails on the next one.
- **`span={3}` never worked.** `PropertyCell` had `span-1`, `span-2`, `span-4` and no `span-3`, so
  44 cells asking for three columns silently rendered at one. Not in the survey.
- **Step 6, collapse.** `PropertySection` now persists its own state, keyed by the tab scope
  `SectionRenderer` publishes. This closes all **249** sections that had no `collapsed` prop
  without editing 249 call sites — the reason the previous recommendation reached 2 files in
  months. An explicit `collapsed` still wins, so BackgroundEditor and TextEditor are untouched.
  Collapse-all is in the toolbar, acting on the sections actually on screen.
- **Step 7, search.** The filter machinery was always in `PropertyCell`/`PropertySection`; only
  its input box was gated behind `selectedIsCustomComponent`. It is in the toolbar now, for every
  context, and costs no height (it opens into the toolbar's spacer).

Pinned by `test/propertiesPanelKit.test.js` (13 tests).

### Migrations done 2026-08-23 — steps 2, 3, 4, 5, 8, 9, 10

**Step 2 — colour through the dock: already closed**, as recorded above. Nothing in `sections/`
uses a bare colour input; the four remaining sites are in `debug/CutoutDebugPage.svelte`.

**Step 3 — one boolean: done.** All 54 raw checkboxes are gone. `PropertyToggle` gained the two
props the strays needed — `label` for named flags (a chip row of eight toggles all reading "On"
says nothing about which is which) and `compact` for chip rows and table cells — and is now a
`role="switch"` with `aria-checked`. That absorbed all six idioms the review counted: cell
checkboxes (BehaviorEditor's own mixed section), `.flag` chips (Looper, Macro, Orbit, Router,
Value), `.ex-chk` abbreviations (22 in PixelDisplay), table cells (SplitZone, DrumPads) and the
design surface's 11 toolbar and dock checkboxes.

**Step 4 — density: done for the two cases the review names.** 172 cells holding nothing but a
`PropertyToggle` or a `NumberCell` went from `span={2}` to `span={1}`, and 111 `label=""` cells
gained `compact` so they stop reserving a label strip they never fill. `NumberCell` was 24px
against the toggle's 26; it is on the token now, so a stepper and a toggle in one row line up.
EffectsEditor's target picker — the review's canonical near-empty section, 78px around three
buttons — moved into the section header via the `tools` slot.

*Not done, and why:* the 12 "zero-cell" sections are not empty. Every one has real content that
simply is not in `PropertyCell`s — BackgroundEditor's layer picker and z-order list,
CustomInteractEditor's embedded editors. Merging them would destroy structure to satisfy a count.

**Step 5 — inline-label holdouts: done.** `CoreEditor` is on the grid (eight full-width rows to
six, with Type/Layer and State/Z-Index paired). `BackgroundEditor`'s `:global(.property-grid)`
override — the one that cancelled the 4-column grid from inside a section — is deleted, its nine
`.prop-row`s are cells, and its four layer tool strips (S/M/R/C/P) moved into the section headers.
`TransformEditor` keeps its paired rows: the review holds them up as the best pattern in the panel.

*This turned up a live bug the survey did not name.* TextEditor's six `.prop-row full-span` divs
were grid items in a real 4-column grid, and `.full-span` set `width: 100%` and no `grid-column` —
so each sat in a ~145px track with a 54px label crammed beside it. They are cells now.

**Step 8 — icon anchors: done.** 263 of 265 sections carry one; the two without have computed
titles. TextEditor's twice-repeated "Geometry" and "Colour Effects" are now Image/Texture
Geometry and Image/Texture Colour — which had become a correctness matter, not just a scanning
one: a section keys its collapse state on its title, so two sections titled the same in one tab
would collapse together. The same hazard across *embedded* editors turned up one real case
(CustomInteractEditor renders the Behaviors and ValueChannels editors side by side and both call
their first section "Definition"), handled with a new `collapseKey` prop. A test now walks every
file and every embedding relationship and fails on the next collision.

**Step 9 — the orphans: already closed.** `PropertyScrub` has 7 adopters (the review counted
zero) and `PresetFooter` is used by `panels/FooterRenderer.svelte`. The 8 remaining 0–100/0–360
`NumberCell`s are not a gap: `NumberCell` drag-scrubs its own label, so they already have the
interaction the review wanted.

**Step 10 — the mega-editors: done, with the scope corrected.** `CustomDesignSurfaceEditor` does
not render in the properties panel — `EditorCanvas` hosts it as a full-window workspace — so
`--pp-field-*` never reaches it and its darker dock is a separate surface rather than a drifted
copy. Porting it "onto the kit" would make the design workspace look like the inspector it is not.
It has its own `--dk-field-*` token block instead, which is the review's own fallback ("or at
least onto its tokens") and gives that dock the same density knob. Its 11 checkboxes are
PropertyToggles. `CustomTestBenchEditor` and `CustomPackageLibrary` do render in the panel and
were already covered by the `.val` unification; their remaining colour literals are state colours
(amber warning, green ok), not a field skin.

### Deliberately not done

**The bulk `<select>` / text-input conversion to `PropertySelect` / `PropertyText`.** The widgets
exist and new code uses them, but ~200 existing call sites are staying as `.val` for now. The
reason is that the benefit has already been collected: every `.val` in the panel takes its
metrics from the same tokens and carries `box-sizing: border-box` **and** `min-width: 0`, so the
overflow bug and the select-widens-its-track bug — the two things the widgets were needed for —
are fixed everywhere. What conversion would add is less CSS, and what it would cost is ~200
hand-edits that each change binding semantics (`bind:value` versus `value` plus a handler) and
each need an `<option>` list lifted into an expression, with no DOM-level test in this suite to
catch a mistake. That is churn with a real chance of breaking working editors.

Everything above is pinned by `test/propertiesPanelKit.test.js` (23 tests).
