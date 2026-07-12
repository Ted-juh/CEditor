# CC Properties Panel Restructure — Staged Plan

> Companion to `cc-properties-panel-review.md` (the diagnosis) and successor to the phasing
> sketch in its §6. This document is the implementation plan: four stages, each independently
> shippable and revertible, with scope, files, acceptance criteria, and resolved decisions (§6).
>
> **Sequencing update:** `cc-designer-workspace-review.md` found that the workspace chrome
> rebuild regressed previously-shipped features — including the canvas readiness strip that
> Stage B2 assumes exists and the Make Interactive tool Stage C builds on. Its proposed
> **Stage W0 (workspace restoration + decomposition)** should run before Stage B; Stage A is
> unaffected.
>
> **Status (2026-07-12):** W0's *restoration* half is done — the readiness strip, smart guides,
> align/distribute/measure, cheatsheet, and Make Interactive + halo are all back on main (see
> the status banner in `cc-designer-workspace-review.md`); the *decomposition* half remains
> open.
>
> **STATUS UPDATE (2026-07-12, later the same day): ALL FOUR STAGES SHIPPED** (commits
> `c07cdfb` A · `15638c0` B · `1c1ece7` C · `18a9e82` D), browser-verified on the stress
> panel. Target state achieved: instance context = 9 tabs incl. the new Properties tab;
> author context = Interact · React · Assets · Publish · Test Bench (+ generic tabs, per A1's
> explicit `both` assignments — §0's shorter author table was the summary). Deviations from
> the letter of the plan, same intent:
> - **Chrome prerequisite the plan missed:** owned-chrome workspaces hid the properties panel
>   entirely, which would have made the author tab set unreachable — the component workspace
>   now keeps (forces) the properties panel as the author inspector (`workspaceChrome.js`).
> - **C2 partial:** cluster cards use their own compact field markup writing the same
>   dot-paths; the Advanced flat lists embed the three original editors unchanged rather than
>   being rebuilt over shared field components. Full field-group extraction rides §12.5.
> - **B4:** starters + assistant recipes are tool-strip flyouts (patch builders extracted to
>   `customComponentRecipes.js`), not a Make-Interactive-flyout group/toolbar popover.
> - **B6:** the Preview Workbench was not moved verbatim — the bench's State Preview section
>   (renamed "Preview Workbench") already covered its content.
> - **D3:** preset/template walls collapse behind a "Show presets" disclosure beside Add,
>   rather than a popover picker. `testbench` keeps its id and "Test Bench" label (rename was
>   optional).
> **Nothing here changes the data model or removes capability** — every stage is view-layer
> regrouping, consistent with the redesign plan's principles (progressive disclosure, one home
> per concept, backward compatible).

---

## 0. Target state (what "done" looks like)

**Instance context** — a CustomComponent selected on a panel, Designer workspace closed:

| Tab | Content |
|---|---|
| Core | as today |
| Transform | as today |
| Background / Border / Mouse / Effects | as today (generic tabs) |
| **Properties** *(new)* | published inputs + editable properties + outputs as live values (today's API → "Values" mode) **plus an active-variant picker** (`Variants.active`) |
| Device | as today (when ports exist) |
| Scripts | as today |
| *(button)* | **Edit Component** → opens the Designer workspace (the `surface` tab is gone) |

≤ 9 tabs, 6 of them the same generic ones every control has. Down from ~20.

**Author context** — the Designer workspace is open:

| Tab | Absorbs |
|---|---|
| **Interact** | Channels + Behaviors + Hit Zones (cluster view; flat lists under Advanced) |
| **React** | Bindings + Links + States + Animations (sub-nav) |
| **Assets** | as today |
| **Publish** | API contract + ExternalAPI + Variant definitions + package metadata & Library |
| **Test** | slimmed Test Bench |
| Scripts | as today |

Design (parts/layers/paint/generators/artboard) has no panel tab — it *is* the surface + dock.
The **Designer** tab no longer exists; the `Designer` section survives as pure editor-state data.

---

## 1. Stage A — Context-gate the tabs (audience split)

**Goal:** the instance user stops seeing authoring tabs; the author sees them only inside the
workspace. This is the cheapest stage and delivers most of the perceived relief. No editor
content changes — only which tabs render where.

### Steps

- **A1. Tab audience metadata.** Add `audience: 'instance' | 'author' | 'both'` to each entry in
  `allComponentTabs` (`panels/PropertiesPanel.svelte`). Assignments for custom-component sections:
  - `both`: core, transform, background, border, mouse, effects, actions (Scripts).
  - `instance`: devicebindings, the new `properties` tab (A4).
  - `author`: designer *(until Stage B removes it)*, valuechannels, behaviors, hitzones, assets,
    links, published, variants, testbench — **and, for custom components only, states, bindings,
    animations** (they patch Parts/channels; they are internals, not instance concerns).
    For non-custom controls states/bindings/animations stay visible as today — the audience
    filter only applies when `selectedIsCustomComponent`.
- **A2. Context signal.** Import `componentWorkspaceMode` from `stores/componentWorkspace.js` into
  `PropertiesPanel.svelte`; derive `audienceContext = (workspace open ? 'author' : 'instance')`.
  Filter `componentTabs` by `tab.audience === 'both' || tab.audience === audienceContext` (custom
  components only).
- **A3. Delete the `surface` tab.** The "Open Component Designer" button (already above the tab
  bar) becomes the sole entry point. Remove the tab entry and the `contentTabs` special-case that
  excludes it.
- **A4. New instance `properties` tab.** Loader entry in `sectionEditorLoaders.js` →
  `CustomPublicPropertiesEditor` (the API "Values" half) wrapped with an active-variant picker row
  (reads variant labels, writes `Variants.active`). The author-context `published` tab keeps the
  label "API" and renders **Contract only** (`CustomPublishedPropertiesEditor` directly); the
  `CustomApiEditor` Contract/Values switcher becomes unnecessary — its two halves now live in
  different contexts. Keep the file until Stage B confirms the Publish wrapper.
- **A5. Persisted tab-state migration.** `ce.propertiesPanel.uiState.v1` stores `singleTab` /
  `multiTabs` that may now reference hidden tabs. Bump to `…v2`: store instance and author tab
  state under separate keys (`singleTab`/`multiTabs` and `authorSingleTab`/`authorMultiTabs`),
  migrate v1 by sanitizing against the visible set with fallback `'core'` (instance) /
  `'valuechannels'` (author). Sanitize again on every context switch so a stale id can never
  yield an empty panel.
- **A6. `focusSection` respects context.** The one-shot `Designer.focusSection` consumer in
  `PropertiesPanel.svelte` currently switches tabs blindly. New rule: if the target tab's
  audience is `author` and the workspace is closed, call `openComponentSurfaceWorkspace()` first,
  then focus. (Writers: TestBench, Surface editor, PublicProperties editor — no changes needed on
  the writer side.)
- **A7. Tests.** The tab layer has **zero test coverage today** (nothing in `CE/web/test/`
  touches `tabViewState`/focus/tab filtering). Extract the audience-filter + sanitize logic into
  a pure util (`utils/propertiesTabAudience.js`) and add `propertiesTabAudience.test.js`:
  audience filtering per context, v1→v2 migration, stale-id fallback, focus-while-closed
  behavior (pure part).

### Files

`panels/PropertiesPanel.svelte`, `panels/sectionEditorLoaders.js`, `stores/componentWorkspace.js`
(read only), new `utils/propertiesTabAudience.js` + test, small wrapper for the Properties tab
(new `sections/CustomInstancePropertiesEditor.svelte` or inline composition).

### Done when

- CC instance selection shows ≤ 9 tabs; opening the workspace swaps to the author set.
- Every authoring editor remains reachable (workspace open → its tab exists).
- `surface` tab gone; v1 stored UI state loads without crash or empty panel.
- Non-custom controls are pixel-identical to today.

**Risk: low.** Hazards are fallback loops (hidden persisted tab) and focusSection racing the
workspace-open transition — both covered by A5/A6 rules and tests.

---

## 2. Stage B — Dissolve the Designer tab, finish one-home-per-concept

**Goal:** the 3,468-line dashboard tab disappears; every block lands in its single home. This
stage is mostly *moving* existing blocks verbatim — refactor after the move, not during.

### Steps

- **B1. Publish home.** New `sections/CustomPublishEditor.svelte` (tab id `publish`, replaces
  `published`) composing: **Contract** (`CustomPublishedPropertiesEditor`, incl. ExternalAPI),
  **Variants** (definitions — `CustomVariantsEditor` minus the active picker, which moved to the
  instance Properties tab in A4), and **Package & Library** (the ~340-line Library block extracted
  from `CustomDesignerEditor` into its own `sections/CustomPackageLibrary.svelte` — the first
  monolith cut of plan §12.5). The `variants` tab is removed; `CustomApiEditor` is deleted.
- **B2. Readiness — one home.** Delete the Readiness `PropertySection` from the Designer tab and
  from `CustomTestBenchEditor`. The canvas nudge strip (shipped in redesign Phase 6) is the single
  surface. `analyzeCustomComponentReadiness` util unchanged.
- **B3. Preview aids — one home.** Delete the Designer tab's Preview Aids toggles; the surface
  Preview dock is the single home. Recipes may keep writing `Designer.preview.*` (data unchanged).
- **B4. Starters & recipes → creation flows.** The Starter Components tray joins the surface's
  **Make Interactive flyout** as a "Starters" group; the Visual Assistant recipe cards become an
  "Assistant" popover on the surface toolbar. Note: the empty-state create palette bar was
  deliberately removed (commit `d801670`) as redundant — do **not** resurrect a bar; these are
  menu/popover flows on existing surface chrome.
- **B5. Quick Shapes — delete.** Already triple-covered on the surface (tools, Layers dock
  add-strip, shapes palette).
- **B6. Workshop / Component Map / Preview Workbench.** Workshop (mode/selection readouts) —
  delete; selection lives on the surface. Component Map metric tiles — delete. Preview Workbench —
  relocate into `CustomTestBenchEditor` (interim home until the Stage D diet decides what
  survives).
- **B7. Remove the `designer` tab** and its loader. The `Designer` section remains as data
  (selection state, preview state, package metadata, focusSection channel). Remap focus ids
  (§5 table).
- **B8. Surface dock diet.** Remove the component-wide dock sections from
  `CustomDesignSurfaceEditor` — **Component API**, **Bindings**, **States** — which duplicate
  panel tabs and violate the surface-inspector contract (redesign plan §4: surface = per-object /
  spatial). The dock keeps Artboard, Layer, Transform, Paint, Arc, Hit Zone, Zone Display,
  Interaction, Preview, Value Control, and the Layers/Generators/Assets tabs.
- **B9. Channel public-ness — one source of truth.** Remove the `publicInput`/`publicOutput`
  toggles from `CustomValueChannelsEditor`'s "Public API" section; replace with a read-only
  "published as *name*" chip + jump-link to Publish. The channel flags themselves are kept in the
  data and **maintained by write-through** whenever Publish entries change, so the package format
  and any runtime/validation readers are untouched. *(Decided — §6.1: write-through; retiring
  the flags outright stays a possible later cleanup.)*

### Files

`sections/CustomDesignerEditor.svelte` (shrinks toward deletion), new
`CustomPublishEditor.svelte` + `CustomPackageLibrary.svelte`, `CustomTestBenchEditor.svelte`,
`CustomDesignSurfaceEditor.svelte`, `CustomValueChannelsEditor.svelte`,
`CustomPublishedPropertiesEditor.svelte`, `panels/PropertiesPanel.svelte`,
`panels/sectionEditorLoaders.js`.

### Done when

- No `designer` tab; `grep` shows no writer producing `focusSection: 'designer'` (or all writers
  remapped per §5).
- Library, starters, recipes, preview aids, readiness each reachable in exactly one place.
- Saved components/library entries round-trip unchanged (package format untouched).

**Risk: medium.** `CustomDesignerEditor` is 3.5k lines and its recipes write into every section;
mitigation is move-verbatim-then-refactor and shipping B1–B9 as separate commits.

---

## 3. Stage C — The Interact cluster editor

**Goal:** Channels + Behaviors + Hit Zones become one tab that edits *clusters* (channel + its
behavior(s) + their zone(s)) — the unit Make Interactive already creates. Wiring dropdowns leave
the common path; membership is the wiring. **View change only; the data model and the magic-string
references stay.**

### Steps

- **C1. Cluster derivation util** — new `utils/customComponentClusters.js`, pure: group behaviors
  by `valueChannel`(+`valueChannels[]`), attach zones via `targetBehavior`/`targetValueChannel`,
  produce orphan buckets (channel with no behavior, zone with dangling target, behavior with no
  channel) and explicit rules for the exotic shapes (zone targeting two behaviors → appears in
  both clusters with a "shared" tag; XY behavior with two channels → one cluster keyed on the
  behavior). New `customComponentClusters.test.js` covering each rule + every
  `CUSTOM_COMPONENT_STARTERS` archetype.
- **C2. Extract shared field groups.** Pull the field UIs out of the three editors into
  `sections/interact/ChannelFields.svelte`, `BehaviorFields.svelte`, `ZoneFields.svelte` so the
  cluster cards and the Advanced flat lists render the *same* components (no forked field logic).
- **C3. `sections/CustomInteractEditor.svelte`.** Cluster cards (per §4 of the review: Value /
  Behavior / Grab-areas groups), "+ Make Interactive ▾" as the primary add action, orphans
  section at the bottom, generated zones shown inside their cluster with the existing
  "generated"/"detached" tags.
- **C4. Simple/Advanced.** The global toggle (redesign decision §11.2) gates the view: Simple =
  cluster cards; Advanced = today's three flat lists (the existing editors, now thin wrappers
  around the C2 field groups) plus visible target dropdowns. Nothing becomes impossible.
- **C5. Tab swap + focus remap.** `valuechannels`/`behaviors`/`hitzones` tabs replaced by
  `interact`; focus requests remap to `{ focusSection: 'interact', focusCluster: <channel|item> }`
  (§5 table). Writers (TestBench probes, Surface editor) updated.
- **C6. Canvas sync.** Selecting a zone/part on the canvas focuses its cluster (reuse
  `Designer.selectedHitZone`/`selectedValueChannel`); selecting a cluster highlights its zones +
  grab-area halo on the canvas.

### Done when

- Retuning a dial (range, drag sensitivity, grab area) happens in one card without visiting a
  second tab.
- Every configuration reachable today via the three tabs is reachable via Advanced.
- Cluster derivation handles all starters + the orphan/shared cases per C1 tests.

**Risk: medium-high** (highest-value change). Mitigations: derivation is pure and tested first,
Advanced mode is the always-on escape hatch, zero schema changes, and C2 guarantees field parity.

---

## 4. Stage D — React group, Test diet, add-time presets

**Goal:** finish the six-category author panel and remove the depth (scroll) problem.

### Steps

- **D1. React tab.** New `sections/CustomReactEditor.svelte`, tab id `react`, with a sub-nav:
  **Value → Part** (Bindings), **Value → Value** (Links), **States**, **Animations** — embedding
  the existing editors unchanged in the first pass. A later polish pass may unify their
  vocabulary (source/target/condition) but that is not part of this stage's contract. The four
  standalone tabs are removed from the author set.
- **D2. Test Bench diet.** From 16 sections to ~6: keep **Simulation**, **one** channel view
  (merge Channel Rig / Live Channel Matrix / Channel Flow — recommend keeping the Rig with the
  Matrix's live values), **Hit-Zone Probe**, **Performance Budget**, **Generated Output**, and
  the relocated **Preview Workbench** (from B6). Drop: Readiness (gone in B2), Interaction
  Routes, Public Link Surface, State/Animation/Binding previews, Enum Groups, State Coverage,
  Specialized Inspectors — they restate other tabs' content. *(Decided — §6.3: diet now; the
  plan-§12.6 "persistent live preview instead of a Test Bench mode" remains the eventual
  destination, and the diet makes the tab small enough to fold into it later.)*
- **D3. Presets/templates move to add-time.** The permanent preset/template card walls
  (Channels 8, Behaviors 8, Hit Zones 7 — now inside Interact's Advanced lists — plus Links 8+
  and Variants presets) become the content of each "+ Add ▾" popover picker. Editors keep only
  live content; expected scroll-height reduction 30–50% per tab.

### Done when

- Author context shows exactly: Interact · React · Assets · Publish · Test · Scripts.
- No editor renders a permanent template/preset card wall.
- Test Bench ≤ ~6 sections; nothing it shows is a pure restatement of another tab.

**Risk: low-medium.** D1 is composition; D2 is deletion with judgment calls (flagged below);
D3 is mechanical per editor.

---

## 5. focusSection id remap (single reference table)

Writers today: `CustomTestBenchEditor` (many), `CustomDesignSurfaceEditor`,
`CustomPublicPropertiesEditor`, `CustomApiEditor`. Consumer: `PropertiesPanel.svelte` (one-shot).

| Old id | New target | From stage |
|---|---|---|
| `designer` | `publish` (library/package) or drop (workshop/metrics) — per call site | B |
| `valuechannels` / `behaviors` / `hitzones` | `interact` (+ `focusCluster`) | C |
| `generators` | surface dock (`Designer.focusSurfaceDock: 'generators'`, already exists) | B |
| `assets` | `assets` (unchanged) | — |
| `links` / `bindings` / `states` / `animations` | `react` (+ sub-nav id) | D |
| `published` | `publish` | B |
| `testbench` | `test` (rename optional) | D |

Rule from Stage A onward: any focus request targeting an author tab opens the workspace first.

## 6. Resolved decisions (signed off 2026-07-02)

1. **Channel `publicInput`/`publicOutput` flags (B9): write-through.** The Publish tab is the
   only *editing* UI; toggling a published entry writes the channel flags automatically, and the
   Channels editor shows a read-only "published as *name*" chip with a jump-link. Grounding: the
   flags are load-bearing beyond the contract — `deriveExportParameters`
   (`utils/exportParameters.js`) reads them directly to decide which channels become plugin
   parameters on export, independent of `PublishedProperties`. Write-through keeps the export
   path and package format untouched; retiring the flags stays a possible later cleanup once
   `exportParameters` derives from the contract.
2. **Variant definitions live in Publish (B1).** Variants are the consumer-facing preset
   surface, grouped with the API contract and package/library ("everything the outside world
   sees"). The active-variant *picker* moves to the instance Properties tab (Stage A4).
3. **Test Bench: diet now, persistent preview later (D2).** Stage D slims the bench to ~6
   test-only sections; folding it into a persistent live preview (redesign plan §12.6) remains
   the roadmap end-state, made cheaper by the diet.
4. **Scripts tab: audience `both` (A1).** Panel-level scripting is used on placed instances, and
   authors also reach the script doc via the workspace Look bar — the tab stays in both contexts.

## 7. Cross-cutting

- **Ship points & reversibility.** Each stage lands as its own PR(s); A and B are further
  divisible per-step. Nothing in a later stage is required for an earlier one to hold.
- **Monolith decomposition rides along** (plan §12.5): B extracts the Library;
  C extracts the three field groups; the Designer editor file should be deletable by end of B.
- **Test strategy.** The tab layer is currently untested; every stage adds pure-logic tests
  (A: audience/migration, C: cluster derivation, D: none required beyond existing editor tests).
  Existing suites to keep green: `customComponentFactory`, `customComponentMakeInteractive`,
  `customComponentPackage`, `panelCustomComponentLinks`.
- **Out of scope for all stages:** schema changes, the PointSet/array-channel primitive
  (plan §12.3), indexed repeats (§12.4), theming/anchors (§12.6), library gallery (§12.7).
