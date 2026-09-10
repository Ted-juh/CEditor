# A widget model for the custom component creator

Status: **proposal only. Nothing here is built.**

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

## Property budget

Proposed rule:

> A widget type's Essentials panel holds at most eight controls, and the limit is checked by a unit
> test over the widget manifest.

Without a test, the schema grows back over time and the result is a rename rather than a change.

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
| Arc | start angle and sweep, as an on-canvas handle rather than two number fields |
| Track | colour and thickness |
| Fill | colour of the value arc |
| Pointer | shape and colour |
| Feel | drag axis, sensitivity, fine-drag modifier |
| Steps | continuous, stepped (n), or enum list |
| Publish | name and exposed toggle |

Everything else stays reachable through Advanced mode or Unpack. Nothing is removed.

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

## On-canvas handles

These depend on widgets existing first, since a handle needs an owner for the property it edits.

- **Dial and Arc**: drag the arc's start and end points on the artboard instead of typing two
  angles.
- **Slider and Range**: drag the track endpoints; min and max handles snap to them.
- **LED Ring, Step Bar, Ticks, Pad Grid**: a count handle you drag to add or remove elements. Today
  `count`, `rows` and `columns` are numbers in the Generators tab and you cannot see the result
  until you stop typing.
- **Hit zone inflate**: a dashed outline you drag outward. The overlay is already drawn
  (`hit-zone`); it is not draggable as an inflate value.
- **Publish gutter**: a strip down the right edge listing exposed properties with a line to the
  widget that owns each one, so an empty contract is visible without opening a tab.
- **Style swatches on the widget on hover**: track, fill, pointer, instead of a colour picker three
  tabs away.

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

Each phase is useful on its own.

| Phase | What | Value if work stops here |
|---|---|---|
| 0 | `widgetTypes.js`: a pure manifest of id, label, icon, essential schema (max 8), materializer, handle list, unpack rule. Plus the max-8 test. | Nothing shipped yet, but it is the file everything else reads and it is cheap to review before code exists. |
| 1 | A `Widgets` section on `CustomComponent`, the v1 to v2 migration, and declared widgets replacing derived clusters and `meta.kitId` groups in the layer tree. | Kits become real objects you can select, name and delete as a unit. |
| 2 | `WidgetInspector.svelte`, replacing the Object/Display/Behavior tabs when the selection is a widget. Raw parts keep the existing four tabs. | This is the phase that answers the original request: about 8 controls instead of about 500. |
| 3 | On-canvas handles: arc ends, track endpoints, count handle, inflate outline, publish gutter. | The most visible improvement, but it needs phases 1 and 2 first. |
| 4 | Starters and recipes re-expressed as widget presets; palette becomes a widget palette. | Replaces two parallel systems with one. |

Phase 2 is the one to judge the plan by. If phases 0 and 1 land and the inspector still needs twenty
controls to be useful, the widget list is wrong and the fix is fewer, broader widget types rather
than a larger panel.

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
4. **Does the Simple/Advanced toggle still earn its place?** If Essentials is capped at eight, Simple
   mode may have nothing left to hide.

## Notes

New ideas go here rather than in the sections above.

- 2026-09-10: Written. Phases 0 to 4 as above, nothing built.
