# Custom Component Creator — Redesign Plan

> Result of a design discussion. It defines **what is wrong with the current creator**, the **principles** that constrain the fix, and a **phased plan** to lift it to a higher level — GUI, editor, and the controls a user actually has.
>
> Guiding rule from that discussion: **simplify the GUI without removing functionality or options.** Every change here either removes *bookkeeping* (work the tool should do for the user) or *adds* capability. Nothing that an author can do today is taken away — the advanced graph stays, it just stops being the only way in.

---

## 1. The problem we are fixing

The custom component creator is powerful and the engine underneath it is genuinely good (the materializer/generator pipeline in `customComponentMaterializer.js`, the Test Bench in `CustomTestBenchEditor.svelte`, the packaging/validation/library in `customComponentPackage.js`). The problems are not capability. They are **conceptual load** and **last-mile UX**.

Three things hold it back:

1. **Too many primitives to make one control.** To build a single dial an author must create and hand-wire six abstractions — `ValueChannels` → `Behaviors` → `HitZones` → `Generators` → `Bindings` → `Links` — plus `States`. The wiring is by *magic string*: `createHitZone` defaults to `targetBehavior: 'mainSlider'`, `targetValueChannel: 'mainValue'`, and the author has to keep those names in sync by hand. Starters paper over this; the moment you edit past a starter, all six layers leak out.

2. **The same concept has three homes.** Editing is split across the surface **inspector tabs** (Object/Display/Behavior/States/Device), the properties-panel **section tabs** (13 editors), and **embedded** editors (Generators is mounted *inside* the surface and *also* exists as a tab). Worse, there are true duplications — **Public Properties vs Published Properties** are two editors for nearly the same idea, and channels appear in two places.

3. **Two architectural / logic gaps.** Bindings are applied **once at materialization**, not live — "binding = live wire" is not actually true; the Test Bench fakes liveness by re-materializing. And the logic layer leans on **free text**: link conditions are parsed by a single-comparison regex with a silent `return true` fallback (`customComponentInteraction.js`), and Variants is a 293-line **JSON-patch text editor**.

And a cluster of polish gaps: 9px uppercase labels in a wall of property cells; keyboard shortcuts bound to the surface `<div>` focus only; grid-only snapping (no object-relative guides, no align/distribute); the surface **Assets dock is a placeholder**; and the excellent `analyzeCustomComponentReadiness` data is buried in one tab instead of on the canvas.

---

## 2. Principles (the constraints on every change below)

> **1. Remove bookkeeping, not abstractions.** The author should never hand-match three names to make one control. The channel/behavior/zone graph still exists — the tool maintains it.

> **2. Progressive disclosure, not feature removal.** A **global Simple/Advanced toggle** (decision §11.2) flips the whole creator between a path that covers the common case and one that exposes the full graph. Same data model underneath; nothing is hidden permanently and nothing is deleted. (Guardrail: make the current mode obvious and easy to switch so an author never feels "stuck" in the wrong one.)

> **3. One home per concept.** Surface = spatial/visual. Panel = logic/data. A concept lives in exactly one place.

> **4. Backward compatible.** Every schema change is additive with defaults that reproduce today's behavior. Existing saved components and library entries open unchanged.

> **5. Good defaults beat more knobs.** The finnicky-handle problem is solved by sane archetype defaults + drag behavior, not by asking the author to fix it.

---

## 3. The centerpiece — the interactivity model (fixes problem 1)

This is the load-bearing change and ships first. It does **not** remove hit zones — hit zones stay first-class and independently sizable, because a grab area often *should* differ from the visual (grabbing a 10px pointer or a 4px groove is miserable). What it removes is the manual wiring tax.

### 3.1 One creation action instead of four

A **"Make Interactive"** action — exposed **both** as a surface draw tool (create from scratch) **and** as a right-click/context action on an existing part (decision §11.3) — where the author picks an **archetype**: Dial / Slider / Button / Toggle / XY / Range. The single action scaffolds the value channel(s) + behavior + hit zone(s), **pre-wired**, with archetype-appropriate defaults. The resulting zone is still a real, selectable, editable object; the author just didn't author-and-name three things by hand.

Multi-zone archetypes scaffold coherent **sets**: a Range slider is two handles + two channels with linked constraints; a transport cluster is three buttons; XY is one face + two channels. "Make Interactive" must produce the whole set, not a single zone.

### 3.2 The HitZone gains a `source` (follow mode) — keeps decoupling, adds intelligence

Today a zone's `bounds` are always independent coordinates. We add a relationship so a zone can *track* a part but stay tunable. Additive extension to `createHitZone` (all optional; omitting them = today's behavior):

```js
// HitZone additions — backward compatible
source:  'independent' | 'face' | 'part:<name>',  // default 'independent'
inflate: { x: 12, y: 12, unit: 'px' },             // grow grab area beyond source
minTouch: 44,                                        // enforce a comfortable minimum (px)
// existing `bounds` still used when source === 'independent'
```

- **`independent`** — exactly today. Nothing lost.
- **`face`** — bounds = the whole control's bounds. The real fix for finnicky dials: drag *anywhere on the face* to rotate; the pointer stays purely visual.
- **`part:<name>` + `inflate`** — bounds = that part's `Layout`, grown by the inflation, clamped to `minTouch`. A small handle gets a comfortably large grab area that **tracks the handle** when it is resized and never drops below a finger-friendly minimum.

When `source !== 'independent'`, the **materializer** resolves the zone's bounds from the source part's `Layout` + `inflate` at materialize time — the same pattern the generators already use, so it fits the architecture. The editor uses the same resolver for display and hit-testing.

### 3.3 Drag behavior — the other half of the finnicky fix

Grab-area size is only half. What happens *during* the drag matters as much:

1. **Pointer capture / global drag tracking.** ✅ *Already present* — both runtime surfaces call `setPointerCapture` on drag-start (`InteractiveTestSurface.svelte`, `PanelPreviewSurface.svelte`) and track at the window level, so a drag that leaves the zone does not drop. (The earlier draft of this plan claimed it was missing; verified otherwise during Phase 1.)
2. **Absolute vs relative drag, per archetype.** "Jump to value" (click-to-position) vs "Relative drag" (delta from grab point). Relative drag exists for linear modes (`customComponentInteraction.js:595-605`, `dragContext` + `dragSensitivity`) but **not for circular**; extend it to dials.
3. **Fine-drag modifier.** Shift = slow drag (scaled `dragSensitivity`), the standard plugin convention.
4. **Double-click to reset** to the channel's default value — universal convention, currently absent.

### 3.4 Overlap, cursors, and visibility — handled by defaults

- **Priority defaults.** A `face` zone and a `handle` zone overlap by design; auto-assign `priority` (handle > face) so they coexist without the author thinking about it. The existing `priority` field already drives resolution.
- **Per-archetype cursors** (`grab` / `ew-resize` / `ns-resize` / `move` / `pointer`).
- **Canvas halo.** Render the resolved grab area as a distinct translucent halo whenever a control is selected, so the author *sees* "handle small, grab area big" and can drag the halo handles to retune `inflate`. The decoupling becomes a direct-manipulation control instead of numbers in a tab.

### 3.5 Archetype defaults (so the common case is right out of the box)

| Archetype | Hit-zone `source` | Drag | Why |
|---|---|---|---|
| **Dial** | `face` (circle) | relative, circular | Drag anywhere on the face; pointer is purely visual |
| **Slider (track)** | `part:track` + inflate to `minTouch` | absolute or relative | Fat drag lane wider than the visible groove |
| **Handle-drag** | `part:handle` + inflate 12px, `minTouch 44` | relative | Grab area follows the handle, stays finger-friendly |
| **Button / Toggle** | `part:<bg>` (often matches) | n/a | Visual and target usually align |
| **XY pad** | `face` | absolute (2-axis) | Whole pad draggable |
| **Range** | two `part:handle` zones + face | relative | Two handles + linked min/max channels |

### 3.6 Files touched (point 1)

- `utils/customComponentFactory.js` — `createHitZone` (`source`/`inflate`/`minTouch`), `createBehaviorModule` (drag mode/sensitivity/reset defaults), new `makeInteractive(part, archetype)` scaffolder, archetype table.
- `utils/customComponentMaterializer.js` — follow-mode bounds resolver (`face`, `part:<name>` + inflate + minTouch) shared by editor and runtime.
- `utils/customComponentInteraction.js` — extend relative drag to circular; double-click reset; honor `minTouch`.
- `sections/CustomDesignSurfaceEditor.svelte` — "Make Interactive" tool/action, grab-area halo, pointer capture on drag.
- `components/InteractiveTestSurface.svelte` / runtime — pointer capture, double-click reset at runtime.

---

## 4. Unify the editing surface (fixes problem 2)

Pick one split and enforce it: **surface = spatial/visual with a single inspector; panel = logic/data.** Then remove the overlaps.

- **Merge Public + Published into one "API" editor.** Collapse `CustomPublicPropertiesEditor` and `CustomPublishedPropertiesEditor` into a single inputs/outputs/properties surface. Keep both feature sets; one UI.
- **De-duplicate Channels and Generators.** Each appears in exactly one home. Generators stop being both embedded-in-surface and a panel tab; channels stop being in both the surface inspector and a panel tab.
- **Define the surface inspector contract.** Object/Display/Behavior/States/Device cover the *selected object*; the panel tabs cover *component-wide* concerns (API, Assets, Links, Variants, Test Bench). No concept on both sides.
- **Implement the Assets dock** in the surface (it is a placeholder today) or remove the dock tab and route to the panel — but stop showing a dead tab.

Files: `panels/PropertiesPanel.svelte`, `panels/sectionEditorLoaders.js`, the `Custom*PropertiesEditor.svelte` pair, `sections/CustomDesignSurfaceEditor.svelte`.

---

## 5. Reactive bindings (fixes the deeper half of problem 3)

Bindings are the promise "this part moves when the value changes," but they are computed once at materialize time — so a value changed from outside direct interaction (preset load, MIDI, another control) does not move the part on its own. **Decision §11.1: make bindings genuinely live in this pass — committed scope, not optional.**

- A binding **subscribes to its source channel** and updates its target property whenever that channel changes, instead of being baked in once. The Test Bench stops being the only thing that looks live, and external value changes propagate immediately.
- This is the **highest-risk** change in the redesign because it alters how the running plugin updates itself, so it is sequenced last (§9) — everything else is independent of it and ships first.
- Keep the materialize-time path as the fallback for properties that genuinely only need to be set once, so we don't pay reactive cost where it isn't needed.

Files: `utils/customComponentInteraction.js`, `utils/customComponentMaterializer.js`, the runtime renderer, `sections/CustomTestBenchEditor.svelte`.

---

## 6. Structured logic — conditions and variants (fixes the rest of problem 3)

Replace free text with structured builders. No capability removed; the unsafe/fiddly input method is.

- **Condition builder.** Replace the regex condition parser (single comparison, silent `return true`) with either a small real expression evaluator or — preferred for authors — a structured builder: *channel · operator · value*, AND/OR groups. Used by Links and States.
- **Variants override UI.** Replace the JSON-patch text editor (`CustomVariantsEditor.svelte`, 293 lines) with a real override surface: show the base value, let the author toggle/override specific properties, render the diff. **Decision §11.4: keep raw JSON available under an "advanced" escape hatch** for cases the visual UI doesn't cover yet.

Files: `utils/customComponentInteraction.js` (condition eval), `sections/CustomLinksEditor.svelte`, `sections/CustomVariantsEditor.svelte`, a shared `ConditionBuilder.svelte`.

---

## 7. Design-tool surface upgrades (fixes problem 5)

The surface already has snap-to-grid, zoom, multi-select, nudge, tool shortcuts, and space-pan. To feel like a real design tool it needs:

- **Object-relative smart guides** — snap to other parts' edges/centers and show equal-spacing hints (`snapGuides` is grid-only today).
- **Align & distribute** controls.
- **Distance/measurement readouts** between selected objects.
- **A visible shortcut cheatsheet**, and promote shortcuts off the surface-`<div>` focus so nudge/delete/duplicate don't silently die when focus drifts.

Files: `sections/CustomDesignSurfaceEditor.svelte`, `utils/transformMath.js`.

---

## 8. Density, readability, and inline readiness (problems 6 & 7)

- **Type scale + grouping.** Larger labels than 9px; collapse advanced rows by default; a property **search/filter** across the inspector.
- **Readiness on the canvas.** Surface `analyzeCustomComponentReadiness` as inline nudges on the surface ("no value channel yet", "hit zone has no behavior") instead of only in the Designer tab.

Files: `properties/PropertyCell.svelte`, `properties/PropertySection.svelte`, `sections/CustomDesignerEditor.svelte`, `sections/CustomDesignSurfaceEditor.svelte`.

---

## 9. Phasing (each phase ships independently)

| Phase | Scope | Depends on | Risk |
|---|---|---|---|
| **0. Undo/redo** (§12.1) | ✅ **Done** — context-aware `stores/history.js`; the creator's `componentDocuments` get per-document undo/redo via the existing Ctrl+Z/menu/toolbar entry points | — | Low — store exists, just unwired |
| **1. Interactivity model** (§3) | ✅ **Done** — 1A follow-mode `source`/`inflate`/`minTouch` + shared resolver; 1B `makeInteractive` + archetypes; 1C relative dial drag + fine-drag + double-click reset; 1D fine-drag & dbl-click wired into surfaces; 1E Make Interactive tool flyout + layer context action; 1F grab-area halo. **Pending user visual QA** of 1E/1F in the running app. | — | Medium — touches factory + materializer + runtime |
| **2. Unify the surface** (§4) | Merge Public/Published, de-dup Channels/Generators, Assets dock, inspector contract | 1 (shared inspector) | Low–Medium |
| **3. Structured logic** (§6) | Condition builder, Variants override UI | — (parallel to 2) | Low |
| **4. Design-tool surface** (§7) | Smart guides, align/distribute, measurements, shortcut overlay | — | Low |
| **5. Reactive bindings** (§5) | Live binding runtime (committed, §11.1) | — | High — runtime semantics |
| **6. Density & readiness** (§8) | Type scale, property search, inline readiness | 2 | Low |

Recommended order: **0 → 1 → 2 → 3 → 4 → 6 → 5.** Phase 0 (undo/redo) first because it is tiny, load-bearing, and makes every later phase safer to explore in; Phase 1 next because it is the highest-leverage UX win; reactive bindings (5) last because it is the riskiest and the others do not depend on it — sequencing it last de-risks the whole project, but it *is* in scope this redesign.

---

## 10. Backward compatibility & migration

- All schema additions are optional with defaults that reproduce current behavior. A component saved today opens with every hit zone at `source: 'independent'` and behaves identically.
- Library entries (`customComponentLibrary.js`) and export envelopes (`customComponentPackage.js`) keep their `formatVersion`; new fields are additive and ignored by older readers.
- The Public/Published merge (§4) must read both legacy shapes and write the unified one; a one-time normalizer in `normalizeCustomComponentEnvelope` covers old saves.
- Starters (`CUSTOM_COMPONENT_STARTERS`) are rebuilt on top of `makeInteractive` so they exercise the same path authors do.

---

## 11. Resolved decisions (signed off 2026-06-14)

1. **Reactive bindings (§5):** **Make bindings fully live this pass** — committed scope. A binding updates its part whenever its value changes from anywhere (presets, MIDI, other controls), not just while dragging. Sequenced last because it is the riskiest piece.
2. **Simple/Advanced split (§2):** **Global mode toggle** for the whole creator. Guardrail: keep the current mode obvious and easy to switch.
3. **"Make Interactive" entry point (§3):** **Both** — a surface draw tool *and* a right-click/context action on an existing part.
4. **Variants (§6):** **Override UI plus a raw-JSON escape hatch** under "advanced."

---

## 12. Beyond the redesign — toward a world-class builder

The §1–§11 redesign makes the *existing* builder coherent. This section captures what would make it **diverse and easy** in a deeper sense. Each item is grounded in the current code (file/line evidence noted), with a corrected risk read after digging in.

### 12.1 Undo/redo — the missing table stake (promoted to Phase 0)
`stores/history.js` exists but is **not wired into the custom designer** — the only "history" in `CustomDesignerEditor.svelte` is *saved snapshots* ("Local Saves"), not in-session undo. Direct-manipulation builders live or die on fearless exploration, which requires Cmd-Z. The store already exists, so this is a wiring + snapshot-on-mutation job, not new infrastructure. **Highest value-to-effort ratio in the whole document.**

### 12.2 Component-class diversity — the real answer to "diverse"
All 9 `CUSTOM_COMPONENT_STARTERS` are flavors of input controls (knob / slider / XY / button / piano). To be genuinely diverse the builder needs whole *classes* it does not have starters for:
- **Display / output-only:** meters, gain-reduction, scope/spectrum, dynamic value readouts, status LEDs. **These depend on reactive bindings (§5)** — they are inert without live external value flow. Flag the dependency explicitly.
- **Multi-point editors:** ADSR envelope, EQ curve, step sequencer, breakpoint/automation curve.
- **Containers & repeats:** tab groups, collapsible panels, and data-driven repeats ("16 step buttons from a count").

### 12.3 Multi-point data model — *corrected* risk read after digging
My first-pass claim was "the schema can't express multi-point editors." **That was too pessimistic.** Findings:
- `ValueChannel` (`customComponentFactory.js:264`) *is* strictly scalar (single `min/max/step/currentValue`) — it alone cannot hold breakpoints.
- **But the runtime already carries and resolves non-scalar data in two places:** enum channels carry `values[]`/`options[]` arrays (`customComponentInteraction.js:63`), and the **arpeggiator is already a shipping multi-point editor** — an array of `{note, step, length, velocity}` blocks (`customComponentArpeggiator.js`) edited on a grid via indexed hit-testing (`cellIndex`/`keyIndex` payloads, `resolveRuntimeArpeggiatorEdit`).
- **Corrected conclusion:** multi-point editors need **no runtime rewrite** — the pattern is proven. The real gap is **generalization**: today each multi-point type is bespoke (the arpeggiator is its own field on `Designer`, its own resolver, its own UI). The work is introducing a reusable **`PointSet` / array-channel primitive** *alongside* scalar `ValueChannel`, then re-expressing the arpeggiator on top of it as the first consumer. **Medium effort, additive — not foundational risk.**

### 12.4 Data-driven repeats — half-built already
Generators already emit N parts *and* per-instance hit zones (`customComponentMaterializer.js` `addPart`/`addHitZone` carry `generatedBy`; `mapGeneratorHitZoneBounds` positions per-instance zones). So "16 interactive step buttons" is closer than expected. The remaining gap is **indexed per-instance binding** — each generated instance targeting a *distinct* value (step 1 → channel/index 1, …) rather than all sharing one `targetValueChannel`. Medium effort; builds on the §12.3 array primitive.

### 12.5 Decompose the monoliths — a velocity prerequisite, not cleanup
`CustomDesignSurfaceEditor.svelte` is **7,809 lines**, `CustomDesignerEditor.svelte` **3,468**, `CustomTestBenchEditor.svelte` **2,415** — ~19,800 lines across the custom sections. Every phase above pays a tax against these files. Splitting them (and folding the Test Bench into a persistent live preview, §12.6) should happen *as* the phases land, not after.

### 12.6 Easy-wins refinements
- **Persistent live preview** instead of a separate Test Bench *mode* — "what you build is what runs." The 2,415-line bench has become a parallel app.
- **Terminology pass.** HitZones / ValueChannels / Generators / Behaviors / Links / **Published vs Public Properties** is a heavy bespoke vocabulary; "Published vs Public" (two separate editors) is genuinely confusing and is already slated to merge in §4 — extend that to a glossary + rename pass.
- **Auto-fixable readiness.** `analyzeCustomComponentReadiness` already produces a navigable step list; make steps one-click-*fix*, not just one-click-*go-there*.
- **Copy/paste/duplicate of parts and sub-assemblies, plus component composition** (nest a saved component inside another) — the biggest diversity *multiplier*, since users compose far more than they author from scratch.
- **Responsive anchors/constraints** and **theme tokens** — parts are pixel-locked and colors hardcoded (e.g. `FF30343A`); reflow-on-resize and host-theme inheritance make output feel professional.

### 12.7 Confidence & shareability
- **Schema migration seam.** `CUSTOM_COMPONENT_PLAN_VERSION = 1` — build the migration path *now*, while v1 is the only version, so the first bump doesn't break saved/exported components silently.
- **Sharing beyond local JSON.** The "Homepage URL" field hints a community library is intended; a browse/fork-from-gallery flow turns the tool into an ecosystem.

### 12.8 Suggested incorporation
- **Promote now:** §12.1 (undo/redo → Phase 0, already added to §9).
- **Fold into existing phases:** §12.6 terminology → §4; auto-fix readiness → §6/§8; persistent preview → §4/§5.
- **New scoped phases (post-redesign):** §12.2–§12.4 component-class diversity + `PointSet` primitive + indexed repeats (sequence after §5, since the display class depends on reactive bindings); §12.5 decomposition runs continuously alongside.
- **Track as roadmap, not this pass:** §12.7 migration seam (do the seam now, the gallery later).
