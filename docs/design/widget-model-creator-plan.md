# A widget model for the custom component creator

Status: **proposal only. Nothing here is built. Reordered 2026-09-10 — see below.**

**This plan now runs second.** [`property-panel-space-plan.md`](property-panel-space-plan.md)
proposes relocating wide property groups (effects, typography, image layers) into display-panel tabs
and compound widgets. That is cheaper, needs no data model change, and improves all 65 editors
rather than only custom components, so it goes first. Two things in this document were withdrawn as
a result: the eight-control cap (§ Property budget) and most of the on-canvas handles
(§ On-canvas handles). What survives is the part relocation does not fix — that the primitive lists
reference each other by name string and a compound control has no object you can select.

Six mockups of what this would look like are drawn in
[`widget-model-mockups.html`](widget-model-mockups.html): the six editors one dial costs
today, the proposed widget inspector next to the current one, the on-canvas handles, the
palette and layer tree, Unpack, and three more inspectors testing the eight-control cap.

## The request

Make the custom component creator feel more like a design tool (Adobe, Canva) and less like a form.
Work with "widgets" instead of long property lists.

## What the creator already has

The design surface already has most of the standard design-tool features. All of these are in
`CE/web/src/CE_Application/sections/CustomDesignSurfaceEditor.svelte` and the eight
`Surface*.svelte` components it was split into (checked by
`CE/web/test/surfaceDecomposition.test.js`):

| Feature | Where |
|---|---|
| Artboard with pan, zoom, zoom to fit, spacebar pan | `surface-scroll`, `fitArtboardToView` |
| Horizontal and vertical rulers | `EditorRuler` |
| Marquee select, multi-select | `beginMarquee`, `selectedLayerSet` |
| Snap to grid, smart guides, measurement readouts | `snapGuides`, `activeSmartGuides`, `measurementLines` |
| Align (6 ways) and distribute | `alignSelectedLayers`, `distributeSelectedLayers` |
| Layer tree with drag reorder, lock, hide, rename | `SurfaceDockLayers` |
| Shape tools (rectangle, rounded, ellipse, ring, arc, capsule) | `SurfacePalette`, `SHAPE_TOOLS` |
| Inline text editing on canvas | `inline-text-editor` |
| Right-click menu, selection quick bar | `SurfaceContextMenu`, `selection-quickbar` |
| Z-order controls | `moveSelectedLayer`, `moveSelectedLayerToExtreme` |
| Layer copy and paste | `customComponentClipboard.js` |
| Live preview next to the canvas | `dock-live-preview` |
| State filmstrip | `CustomStateFilmstrip` |

So the canvas tooling is largely there. Building more of it would not fix the problem being
described. The problem is what you edit on the canvas, not the canvas.

## The problem

The creator gives you two ways to work, and neither is the one a designer wants.

**1. The primitive graph.** Nine separate lists: Parts, ValueChannels, Behaviors, HitZones,
Generators, Bindings, Links, States, Animations (plus PublishedProperties). They reference each
other by name strings. A hit zone has `targetBehavior: 'mainSlider'`, a behavior has
`valueChannel: 'mainValue'`, a zone has `source: 'part:handle'`. Nothing in the UI shows those four
items as one object. The connection only exists as matching text in four different editors.

**2. Starters and recipes.** `CUSTOM_COMPONENT_STARTERS` and `CUSTOM_ASSISTANT_RECIPES` in
`customComponentFactory.js` generate a patch once. `starter.circularTickSlider` adds a wired
circular slider to the document, and then there is no "circular tick slider" anywhere in the tree.
There is a set of parts, a channel, a behavior, a zone and a generator that were created at the same
time. Edit any of them and nothing knows they belonged together.

Design tools like Canva and Figma work at a level in between: an object that is a widget. It has a
small named property set, on-canvas handles for the properties that are spatial, and a one-way
"detach" or "expand" command for when you need the parts underneath.

The creator does not have that object. `makeInteractive` builds one and then discards the grouping.

## How many properties there actually are

Counting leaf fields in `sectionDefaults.js` and `customComponentFactory.js`:

| What you touch for one control | Fields available |
|---|---|
| `Part` node plus its `Layout` | 30 |
| `Background` (Fill 55 + Border 67 + Corners 111) | 234 |
| `Text` (Fill 24 + Font 40 + Multiline 10 + Effects 73 + Position 36) | 185 |
| `ValueChannel` | 23 |
| `Behavior` | 13 |
| `HitZone` | 22 |
| Plus a Binding, a PublishedProperty, and often a Generator | — |

One dial is reachable through roughly 500 addressable fields across six editors. Most authors need
about eight of them.

The Simple/Advanced switch in `stores/creatorMode.js` hides whole tabs. It does not reduce the
number of decisions inside a tab, because those decisions come from the data model.

## Proposal: a Widget node

This is a layer on top of the existing model, not a replacement. The runtime does not change.

A Widget is a node with:

```
Widget {
  id            'macro1'
  type          'dial' | 'slider' | 'toggle' | 'button' | 'xyPad'
                | 'range' | 'ledRing' | 'stepBar' | 'ticks' | 'keys'
                | 'filmstrip' | 'meter' | 'readout'
  spec          the essential properties for that type
  style         named slots (track, fill, pointer), not raw sections
  owns          { parts, channels, behaviors, zones, generators }
  frame         { x, y, width, height, rotation }
}
```

The `owns` field is the important part. Today the grouping is inferred:
`customComponentClusters.js` reads Behaviors, follows `valueChannel` strings, and works out which
zone belongs to which channel after the fact. Kits are weaker still — `kitEntries` in the surface
groups parts by a `part.meta.kitId` tag, which is a label rather than a node. There is no kit object
to select and no kit properties.

The proposal is to store that grouping instead of inferring it, and keep it.

**Materialization.** A widget's spec compiles into the primitives the runtime already uses: the same
`{ valueChannels, behaviors, hitZones }` shape `makeInteractive` returns today, plus parts and
generators. Change a spec field and the owned primitives are rebuilt. The player, exporter, packager
and all C++ paths are unchanged.

**Unpack.** One command, one direction. The widget node is deleted, its primitives are released into
the flat lists, and the author is back to editing them directly with nothing rebuilding over the
top. This matches Figma's "detach instance" and Illustrator's "expand", and it uses the idea already
in the inspector header (`detachSelectedLayer`, the scissors button).

## Property budget — withdrawn

This section proposed that a widget's Essentials panel hold at most eight controls, enforced by a
unit test. **That is withdrawn**, and the reasoning is worth keeping rather than deleting, because
the cap was a plausible answer to the wrong question.

The cap treated the *number* of properties as the problem. It is not: a font legitimately has forty
settings, and hiding thirty-two of them behind a **More** button does not make a font easier to set
— it makes it harder to find. The problem is the *space* forty settings occupy in a 600px portrait
strip four columns wide. The space plan measures this: the Text tab is 3,090px tall, of which two
sections are 56%.

So a widget inspector holds what the widget needs, and its wide groups route to the dock the same
way every other editor's do. The example below is still the right shape for a dial — it is just no
longer a budget being met.

### Example: the Dial

Today this means: draw a ring part, set position/size/anchor/pivot, open Background and pick from
234 fields for the track, draw a second part for the pointer and repeat, create a value channel and
set min/max/step/default/format/snap/curve, create a behavior and set type/role/geometry/dragMode,
create a hit zone and set shape/source/inflate/minTouch/cursor/action plus three target strings, add
`arcTrack` renderer meta with startAngle/sweepAngle/direction/thickness/colour, then publish a
property.

Under this proposal, one Dial widget with one inspector:

| Control | What it sets |
|---|---|
| Range | min, max, default |
| Arc | start angle and sweep |
| Track | colour and thickness |
| Fill | colour of the value arc |
| Pointer | shape and colour |
| Feel | drag axis, sensitivity, fine-drag modifier |
| Steps | continuous, stepped (n), or enum list |
| Publish | name and exposed toggle |

Everything else stays reachable through Advanced mode or Unpack. Nothing is removed, and
nothing is capped.

### Proposed widget list

All of these already exist as capabilities. None needs new runtime code:

- From `CUSTOM_INTERACTIVE_ARCHETYPES`: Dial, Slider, Handle, Button, Toggle, XY Pad, Range.
- From generator types (`ticks`, `radial-markers`, `grid`, `meter-bars`, `segmented-ring`,
  `repeated-leds`, `piano-keys`): Ticks, LED Ring, Step Bar, Meter, Pad Grid, Keys.
- From part renderer metas (`arcTrack`, `valueArc`, `envelopePath`, `waveformIcon`): Arc, Envelope,
  Waveform.
- From assets: Filmstrip.
- From Text plus a channel: Readout.

About eighteen types. All of them are things the player renders today. None of them is currently
visible as a single object.

## On-canvas handles — mostly withdrawn

The first draft proposed dragging arc start and sweep on the artboard, dragging slider track
endpoints, and dragging radial handles. **Those are withdrawn as too fiddly**, which is the right
call: an angle you set by dragging a 7px dot on a 168px circle is a worse control than a number
field, not a better one, and it cannot be typed, nudged or copied. A handle has to beat the field it
replaces, and for a value with an exact number in it the field usually wins.

What survives is the case where there is no good field to begin with — a count, where the field
tells you nothing until you stop typing and look:

- **Count handle** — LED Ring, Step Bar, Ticks, Pad Grid. Drag to add or remove elements and watch
  them appear. Today `count`, `rows` and `columns` are numbers in the Generators tab and the result
  is invisible while you type. This is the one worth building.
- **Publish gutter** — a strip down the right edge listing exposed properties with a line to the
  widget that owns each one, so an empty contract is visible without opening a tab. Not a handle;
  it edits nothing. Kept because it answers "what does this component expose" at a glance.

Dropped: arc start/sweep handles, slider and range track endpoints, the draggable grab-area
outline, and hover style swatches on the widget. Angles, endpoints and inflate stay as fields.

## Where widgets come from

The left palette (`SurfacePalette`) becomes a widget palette rather than a shape palette. Shapes
stay available, but they stop being the main entry point. Drag a Dial onto the artboard and you get
a working dial with a channel, behavior, zone and published property, immediately usable in the Live
dock.

Starters become widget presets. `starter.circularTickSlider` would become "a Dial widget plus a
Ticks widget with these specs". Applying it leaves two selectable widget objects rather than eleven
anonymous nodes. `CUSTOM_ASSISTANT_RECIPES` folds into the same list.

## Migration

`migrateCustomComponentPlan` already exists for this (`customComponentMigrations.js`, with
`CUSTOM_COMPONENT_PLAN_VERSION` at 1 and an empty step table). The v1 to v2 step would:

1. Run `deriveInteractClusters`, which already does the inference.
2. For each cluster matching a known archetype, create a Widget owning those primitives.
3. For each `meta.kitId` group, create a Widget of the matching preset type.
4. Leave anything that matches nothing as loose primitives.

A component that migrates to zero widgets must still open, edit and export identically. That is the
acceptance test for the migration, and it should be written before the migration is.

## Risks

1. **Do not create a second runtime.** Widgets must compile down to Parts, ValueChannels, Behaviors
   and HitZones, and the player must never see the word "widget". Two rendering paths that disagree
   is the failure `componentFamilies.js` warns about in its header comment.
2. **Do not rebuild over hand edits.** A widget owns its primitives, and owned primitives are not
   separately editable while the widget exists. If you want to edit them, you Unpack, and the widget
   is gone. Allowing both at once would cause silent data loss.
3. **Do not add to `CustomDesignSurfaceEditor.svelte`.** It is 5,530 lines.
   `surfaceDecomposition.test.js` exists because the 2026-07-12 review traced dropped features
   (smart guides, align/distribute, a Make Interactive tool that did nothing) to that file being too
   large to edit safely. The widget inspector should be a new component and the manifest a new pure
   module.
4. **Do not remove access to the graph.** Advanced mode and the flat editors stay. The goal is that
   the default path no longer requires them.
5. **Keep hints within budget.** `docs/property-hints.md` limits the Info bar to about 120
   characters over three lines. Eight essentials per widget means eight hints written to that limit.

## Phases

These run **after** the space plan's phases 0 to 3. Each is useful on its own.

| Phase | What | Value if work stops here |
|---|---|---|
| W0 | `widgetTypes.js`: a pure manifest of id, label, icon, property schema, materializer, unpack rule. No cap, no cap test. | Nothing shipped yet, but it is the file everything else reads and it is cheap to review before code exists. |
| W1 | A `Widgets` section on `CustomComponent`, the v1 to v2 migration, and declared widgets replacing derived clusters and `meta.kitId` groups in the layer tree. | Kits become real objects you can select, name and delete as a unit. |
| W2 | `WidgetInspector.svelte`, replacing the Object/Display/Behavior tabs when the selection is a widget. Raw parts keep the existing four tabs. Wide groups route to the dock like every other editor's. | One coherent panel for a control that today is edited across six. |
| W3 | The count handle for LED Ring, Step Bar, Ticks and Pad Grid, and the publish gutter. | The two on-canvas ideas that survived review. |
| W4 | Starters and recipes re-expressed as widget presets; palette becomes a widget palette. | Replaces two parallel systems with one. |

W1 is now the phase to judge this by, not W2. Its whole claim is that storing the grouping beats
inferring it — if declared widgets do not visibly beat `deriveInteractClusters` and `meta.kitId` in
the layer tree, the rest does not follow. W2's original claim (about 8 controls instead of about
500) belonged to the withdrawn cap and to the space plan.

## Open questions

1. **Can a widget contain a widget?** A "Filter Section" made of three Dials and a Toggle is an
   obvious thing to want, and nesting is where this kind of model gets complicated. The suggested
   answer is no for phases 0 to 4. The existing package and library system
   (`customComponentLibrary.js`) already covers composition: a component made of widgets can be
   dropped into another component.
2. **Do widgets survive a package round trip?** `customComponentPackage.js` would need to carry the
   `Widgets` section, and an envelope from an older build must import as loose primitives without
   error.
3. **Who owns the published contract?** If a widget publishes its property automatically, the
   `PublishedProperties` list becomes partly derived and partly authored. That split needs deciding
   before phase 1.
4. **Does the Simple/Advanced toggle still earn its place?** Open, but for a different reason now
   that the cap is gone: if the space plan moves the wide groups out, Simple mode may be hiding
   tabs that were no longer crowded.

## Notes

New ideas go here rather than in the sections above.

- 2026-09-10: Written. Phases 0 to 4 as above, nothing built.
- 2026-09-10: Reordered behind [`property-panel-space-plan.md`](property-panel-space-plan.md) after
  the owner pointed out that the problem is the space properties occupy, not how many there are, and
  that the display panel's colour and gradient tabs are already the pattern for fixing it. Two things
  withdrawn: the eight-control cap, and the arc, endpoint and inflate handles as too fiddly. Phases
  renumbered W0 to W4 to make the dependency visible.
