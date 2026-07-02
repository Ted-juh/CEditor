# Custom Component Properties Panel — Honest Review & Restructuring Proposal

> Follow-up to `custom-component-creator-redesign-plan.md`. That plan fixed the wiring tax
> (Make Interactive), merged Public/Published, de-duped Layers/Generators, and overhauled the
> surface chrome. What it did **not** touch is the *taxonomy* of the properties panel itself.
> This document reviews that taxonomy and proposes the restructuring.

---

## 1. What the panel actually shows today

A `CustomComponent` control carries **21 sections** (`componentTypes.js` → `CustomComponent.sections`
plus `createCustomComponentSections()`), and `PropertiesPanel.svelte` renders a tab for nearly every
one of them. Selecting a custom component on a panel produces this tab bar:

| # | Tab | Backing section | Editor size |
|---|---|---|---|
| 1 | Core | Core | small |
| 2 | Transform | Transform | small |
| 3 | Background | Background | small |
| 4 | Border | Background | small |
| 5 | Mouse | Mouse | small |
| 6 | Effects | Effects | small |
| 7 | States | States | medium |
| 8 | Bindings | Bindings | medium |
| 9 | Device | DeviceBindings | medium |
| 10 | Animations | Animations | medium |
| 11 | Designer | Designer | **3,468 lines** |
| 12 | Surface | Designer (launches workspace) | — |
| 13 | Channels | ValueChannels | 563 |
| 14 | Behaviors | Behaviors | 726 |
| 15 | Hit Zones | HitZones | 571 |
| 16 | Assets | Assets | 539 |
| 17 | Links | Links | 703 |
| 18 | API | PublishedProperties (+ExternalAPI) | 112 + 802 + 669 |
| 19 | Variants | Variants | 399 |
| 20 | Test Bench | (reads everything) | **2,424 lines** |
| 21 | Scripts | Scripts | — |

Roughly **20 visible tabs for one selected object**. And that's only the width of the pile — the
*depth* is worse: almost every custom editor carries permanent "preview / template card" sections
(Channels: 8 preset cards; Behaviors: 8 template cards; Hit Zones: 7 template cards + a map; Links:
8+ presets + a route builder; Test Bench: **16** PropertySection groups). Even in single-tab view,
each tab is a long scroll.

## 2. The honest review

**2.1 The taxonomy is schema-shaped, not task-shaped.** One tab per data-model section is an
engineer's taxonomy. The categories are *individually* defensible — that's exactly why they defeat
the goal: the user has to already understand the six-layer internal graph
(Channels → Behaviors → HitZones / Generators → Bindings → Links) to know which tab to open. The
Make Interactive work fixed the *creation* tax but the *editing* tax is intact: to retune one dial
you still visit three tabs whose only relationship is magic-string references.

**2.2 Two different audiences share one tab bar.** Selecting a custom component means two very
different things:

- **Using it** — an instance placed on a panel. This user wants: position/size, the published
  knobs ("Values"), variant choice, device/panel wiring, scripts. ~5 tabs of content.
- **Authoring it** — editing the component's internals. This user wants channels, behaviors,
  zones, assets, links, API contract, variants, test bench.

Today both audiences get all ~20 tabs, always. The instance user drowns in authoring tabs; the
author gets instance chrome mixed in. This is the single biggest source of the "long pile" feeling,
and the data model already supports the split (API Contract vs Values is exactly this distinction).

**2.3 Three tabs aren't properties at all.**
- **Surface** is a navigation action styled as a tab (it launches the workspace; it's even excluded
  from `contentTabs`). There's already an "Open Component Designer" button above the tab bar — the
  tab is redundant.
- **Designer** (3.5k lines) is not a property page; it's a *dashboard* — Workshop state, metric
  tiles, Readiness, the entire Library/package manager, preview toggles, quick shapes, starters,
  recipe trays. Every one of those has (or should have) a better home.
- **Test Bench** is a parallel diagnostic app living in a tab, and it *mirrors* everything: its own
  Readiness (dup of Designer's), three channel views (Rig / Live Matrix / Flow), Hit-Zone Probe,
  Generated Output, Interaction Routes, Public Link Surface, State/Animation/Binding previews.

**2.4 Residual duplication (post-Phase-2).** The redesign's "one home per concept" rule is still
violated in places:
- Channel public-ness is settable in **two places**: `publicInput`/`publicOutput` toggles in the
  Channels tab *and* entries in the API tab (`PublishedProperties.inputs/outputs`).
- Readiness renders in **three places**: Designer tab, Test Bench, and the canvas nudge strip.
- Preview aids (show hit zones / bounds / values) exist in the Designer tab *and* the surface dock.
- Behavior↔channel wiring is re-selected in **three** editors (Behaviors, Hit Zones, Generators).
- The surface dock has grown component-wide sections (**Component API**, **Bindings**, **States**)
  that duplicate panel tabs — violating the plan's own contract (surface = per-object/spatial,
  panel = component-wide).

**2.5 The per-editor preset/preview sections inflate every tab.** Template cards are an *add-time*
aid rendered as *permanent* furniture. Eight preset cards in Channels are useful for the 5 seconds
you create a channel and dead weight the rest of the session.

## 3. The concept: split by audience, group by task

### 3.1 Instance inspector (main properties panel, component selected on a panel)

Show only what a component *user* needs. Authoring tabs disappear from this context entirely.

| Tab | Content | Source today |
|---|---|---|
| Core | id / name | Core tab |
| Transform | x/y/w/h | Transform tab |
| Background / Effects / Mouse | as today (generic tabs) | unchanged |
| **Properties** | published inputs + editable properties + outputs (live values), **active-variant picker** | API → "Values" mode (`CustomPublicPropertiesEditor`) + `Variants.active` |
| Device | device bindings | Device tab |
| Scripts | as today | Scripts tab |
| *(button)* | **Edit Component** → opens the Designer workspace | existing button; delete the `surface` tab |

Result: **~8 tabs, 5 of them the same generic ones every control has.** Down from ~20.

### 3.2 Author inspector (only while the Component Designer workspace is open)

The 13 authoring concepts regroup into **six task categories**:

| Category | Absorbs | Notes |
|---|---|---|
| **Design** | Parts/layers, paint, artboard, generators, quick shapes | Already the surface + dock after the GUI overhaul. Nothing new to build — the panel just stops duplicating it. |
| **Interact** | Channels + Behaviors + Hit Zones | The big merge — see §4. One tab instead of three. |
| **React** | Bindings + Links + States + Animations | Everything that answers "what happens when a value or state changes". Sub-nav inside the tab (Value → Part / Value → Value / States / Animations), one shared vocabulary. |
| **Assets** | Images, filmstrips, bake, package policy | Bake keeps creating its generator, but silently, as an implementation detail — stop surfacing the crosswrite. |
| **Publish** | API contract (inputs/outputs/editable props) + ExternalAPI + **Variant definitions** + **package metadata & Library** (from the Designer tab) | "Everything the outside world sees": the API, the preset surface (variants), and the package/library identity. |
| **Test** | Slimmed Test Bench | Simulation, channel rig, hit-zone probe, performance budget. Kill the mirrors (§5). Longer term: fold into a persistent live preview (plan §12.6). |

### 3.3 The Designer tab dissolves completely

| Designer-tab block | New home |
|---|---|
| Workshop (mode/selected layer/channel) | Gone — selection lives on the surface |
| Component Map metric tiles | Gone (Test keeps a compact summary if wanted) |
| Readiness | **Canvas nudge strip only** (already shipped in Phase 6) |
| Library + package metadata | **Publish** |
| Preview aids toggles | Surface Preview dock only |
| Preview workbench | **Test** |
| Quick Shapes | Surface shape palette (already exists post-overhaul) |
| Starter tray / Visual Assistant recipes | Creation flow: the empty-artboard state + an "Add" / Make-Interactive menu on the surface — not a properties tab |

## 4. The Interact tab — editing by cluster, not by type

This is the load-bearing UX change, and it's a *view* change, not a data-model change.

Make Interactive already creates channel + behavior + zone(s) as a wired set. The Interact tab
presents that same graph **grouped by cluster** instead of three flat lists:

```
Interact
├── mainValue (dial)            ← cluster = channel + its behavior(s) + their zone(s)
│   ├── Value      min/max/step/default/format/curve/constraints
│   ├── Behavior   type/geometry/drag mode/sensitivity/keyboard/wheel
│   └── Grab areas face zone · handle zone (+12px, min 44)   [halo on canvas]
├── modeSwitch (toggle)
│   └── …
└── + Make Interactive ▾   /  + orphan channel (advanced)
```

- Selecting a cluster selects it on the canvas and vice versa (reuse `Designer.focusSection`
  plumbing and the grab-area halo).
- The `targetBehavior` / `targetValueChannel` dropdowns disappear from the common path — membership
  in the cluster *is* the wiring. The strings still exist in the data; the tool maintains them
  (redesign principle 1).
- **Advanced mode** (the already-decided global Simple/Advanced toggle, plan §11.2) exposes the
  three flat lists exactly as today for cross-wired exotics (one zone driving two behaviors, shared
  channels). Nothing is removed.
- Generated zones show up inside their cluster with the existing "generated" tag.

This one change removes the worst editing journey in the tool (dial retune = 3 tabs → 1 card).

## 5. Finish the de-duplication

1. **Channel public-ness — one source of truth.** Drop `publicInput`/`publicOutput` toggles from
   the channel editor; show a read-only "published as *gain*" chip with a jump-link to Publish.
   (Or keep the toggle as a shortcut that creates/removes the `PublishedProperties` entry — either
   way, one datum.)
2. **Readiness — one home:** the canvas strip. Delete the Designer-tab and Test-Bench copies.
3. **Surface dock diet:** remove the component-wide **Component API / Bindings / States** dock
   sections (they belong to Publish / React); the dock keeps per-object + spatial concerns
   (Layer, Transform, Paint, Arc, Hit Zone bounds, Preview, Generators).
4. **Test Bench diet:** one channel view instead of three (Rig / Live Matrix / Flow → one),
   drop Readiness, drop the mirrors of Links/API/States/Animations that merely restate other tabs.
5. **Presets/templates move to add-time.** The template/preset card walls in Channels, Behaviors,
   Hit Zones, Links, Variants render inside the "+ Add" flow (picker popover), not as permanent
   sections. Each tab loses 30–50% of its scroll height.

## 6. Phasing

| Phase | Change | Effort / risk |
|---|---|---|
| **A. Context-gate the tabs** | Instance context shows the §3.1 short list; authoring tabs only render while the Designer workspace is open (`componentWorkspaceMode === 'surface'`). Delete the `surface` tab. | Small — tab filtering in `PropertiesPanel.svelte`. Ships alone, delivers most of the perceived relief. |
| **B. Dissolve Designer + dedupe** | §3.3 relocations + §5 items 1–3. Library UI moves under Publish; readiness/preview-aids single-homed. | Medium — mostly moving existing blocks. Also the natural moment to split `CustomDesignerEditor.svelte` (plan §12.5). |
| **C. Interact cluster view** | §4. New grouping component over existing editors' field groups; Advanced keeps flat lists. | Medium-large — highest-value change. |
| **D. React group + Test diet** | Bindings/Links/States/Animations under one tab with sub-nav; §5 items 4–5. | Medium. |

Every phase is additive/relocating — no schema changes, no capability removal, consistent with the
redesign plan's principles (progressive disclosure, one home per concept, backward compatible).

## 7. What *not* to do

- **Don't merge for merging's sake.** Assets and Publish stay separate — they're genuinely
  different tasks. Six author categories is the floor, not a challenge.
- **Don't hide the graph.** Advanced mode keeps flat Channels/Behaviors/Zones lists; exotic
  cross-wiring stays possible.
- **Don't touch the data model in this pass.** Everything above is view-layer regrouping; saved
  components and library entries are untouched.
