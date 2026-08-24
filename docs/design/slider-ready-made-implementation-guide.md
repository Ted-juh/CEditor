# Ready-Made Slider Implementation Guide

## Purpose

Define how sliders should be added to the editor as ready-made components without
stepping on the future Component Designer.

This document assumes the same philosophy already used for `Button`:

- the component must be immediately usable when inserted
- the editor should expose only the most common controls
- the underlying structure should still fit the shared interactive architecture
- advanced visual invention belongs to the future Component Designer

The existing interactive architecture already supports this direction through
`Behavior`, `Parts`, `Bindings`, `States`, and `Animations`.

Related reference:

- `docs/design/interactive-components-implementation-spec.md` — deleted; in git history.

## Direct Answers

| Question | Decision |
| --- | --- |
| Horizontal slider? | Yes. Core ready-made offering. |
| Vertical slider? | Yes. Same control, different `orientation`. |
| Two-value slider? | Yes. Ship as a built-in `RangeSlider`. |
| Three-value slider (`min`, `value`, `max`)? | Yes, but as a specific `BandSlider` built-in, not as a generic everything-slider. |
| Diagonal slider? | No dedicated type. Use normal slider geometry plus `Transform.rotation`. |
| Circular slider? | Not in the first ready-made slider pass. Treat it as a future `Knob` / radial control or a Component Designer job. |
| Ticks? | Yes, but only basic generated ticks. Off by default. |
| Ready-made min/max labels? | Yes, as optional generated labels. Off by default. |
| Fully custom track, thumb, tick, label composition? | No. That belongs to the future Component Designer. |

## Product Boundary

The ready-made slider system should solve common UI needs fast:

- insert a slider and have it work immediately
- choose single, range, or band behavior
- switch horizontal or vertical orientation
- change track, fill, and thumb sizes and colours
- toggle ticks and labels on or off
- use standard hover, drag, focus, and disabled states
- use standard value bindings and smoothing animations

The ready-made slider system should not try to become a hidden mini designer.
It should not expose:

- arbitrary geometry paths
- path-following thumbs
- radial arc layout
- per-tick custom artwork
- custom tick distribution algorithms
- unlimited internal parts authoring
- bespoke per-layer animations
- freeform label composition systems

That work belongs to the future Component Designer, which should own:

- custom track shapes
- custom pointer shapes
- radial and arc controls
- layered animated slider skins
- non-linear visual arrangements
- handcrafted tick artwork
- complex value visuals

## Recommended Built-In Slider Set

The ready-made set should be small and opinionated.

### 1. Slider

Single-handle linear slider.

Use cases:

- gain
- mix
- pan
- envelope amount
- generic numeric control

Supported modes:

- horizontal
- vertical
- bipolar preset

### 2. RangeSlider

Two-handle linear slider for selecting a start and end value.

Use cases:

- low/high cutoff range
- sample start/end
- zone limits
- selection window

### 3. BandSlider

Three-handle linear slider for `min`, `value`, `max`.

Use cases:

- threshold + current point inside allowed range
- envelope-style min/current/max editing
- constrained target inside a selected window

This should be a named built-in type, because its semantics are not the same as
just "range slider plus one more thumb". The editor should present it as a
specific control with a specific mental model.

### 4. BipolarSlider

Do not make this a separate control type.

Treat it as a preset of `Slider`:

- same data model as a single-value slider
- fill can originate from the visual center instead of the minimum edge
- optional center detent
- optional center tick

## What Should Not Be a Separate Ready-Made Slider

### Diagonal Slider

Do not create `DiagonalSlider` as its own type.

Reason:

- the editor already has `Transform.rotation`
- a diagonal slider is still a linear slider
- adding a dedicated diagonal geometry mode creates extra complexity with very
  little product value

Decision:

- build horizontal or vertical
- rotate when needed

### Circular Slider

Do not fold circular behavior into the linear slider family.

Reason:

- circular controls need angle math instead of axis math
- radial ticks and labels are a different visual problem
- circular controls are closer to `knob` than `slider`
- the current range runtime is linear-first

Decision:

- keep circular/radial for a future `Knob` / radial built-in
- or let the Component Designer own it entirely

## Architecture Rule

The ready-made slider should use the same architecture already established for
interactive controls:

- `Behavior` defines how it acts
- `Parts` define the built-in sub-elements
- `Bindings` drive position, size, and visual relationships from values
- `States` apply hover/pressed/dragging/focused/disabled overrides
- `Animations` smooth transitions

Important: the slider should not invent a second rendering system.

The canonical runtime data should still live in:

- `Behavior`
- `Parts`
- `Bindings`
- `States`
- `Animations`

That keeps the migration path clean when the Component Designer arrives.

## Why Slider Needs a Curated Editor

`Button` works well with shared root sections because most of its appearance is
root-level.

`Slider` is different:

- the track is a part
- the fill is a part
- the thumbs are parts
- ticks and labels are optional helper parts

So the right approach is:

- keep the runtime data in the shared interactive sections
- add a dedicated `SliderEditor` in the Properties Panel
- let that editor write to known part and binding paths

Do not expose raw `Parts` editing yet.

That would overlap with the future Component Designer too early.

## Control Types and Runtime Role

Recommended palette / component types:

- `Slider`
- `RangeSlider`
- `BandSlider`

Recommended runtime behavior shape:

- all three remain `family: range`
- all three remain `role: slider`
- `Behavior.valueMode` differentiates the handle model

Recommended `Behavior.valueMode` values:

- `single`
- `range`
- `band`

This gives clean creation semantics through `Core.controlType` and clean runtime
semantics through `Behavior`.

## Behavior Model

### Existing Fields to Keep

These already fit the slider family well:

- `family`
- `role`
- `valueType`
- `defaultValue`
- `orientation`
- `direction`
- `min`
- `max`
- `step`
- `keyboardEnabled`
- `focusable`
- `dragEnabled`
- `wheelEnabled`
- `snapToStep`
- `emitValueChange`
- `emitStateChange`

### New Fields to Add

| Field | Type | Purpose |
| --- | --- | --- |
| `valueMode` | string | `single`, `range`, or `band` |
| `defaultStartValue` | number | Default start handle value for range/band |
| `defaultEndValue` | number | Default end handle value for range/band |
| `defaultCurrentValue` | number | Default current handle value for band; alias of `defaultValue` for single |
| `allowHandleCross` | bool | Whether handles may cross each other |
| `trackClickMode` | string | `jumpToPointer`, `moveNearestThumb`, or `pageTowardPointer` |
| `centerDetent` | bool | Optional bipolar helper behavior |
| `centerDetentStrength` | number | Optional detent sensitivity if center snapping is enabled |
| `snapToTicks` | bool | Optional snap mode when ticks are shown |

### Default Rules

Recommended defaults:

| Type | `valueMode` | Defaults |
| --- | --- | --- |
| `Slider` | `single` | `defaultValue = 0.5` |
| `RangeSlider` | `range` | `defaultStartValue = 0.25`, `defaultEndValue = 0.75` |
| `BandSlider` | `band` | `defaultStartValue = 0.2`, `defaultCurrentValue = 0.5`, `defaultEndValue = 0.8` |

Constraint rules:

- `min <= current <= max` for `BandSlider`
- `start <= end` by default for `RangeSlider`
- handle crossing should be off by default
- if crossing is disabled, handles clamp rather than swap

## Value Signals for Bindings

The current binding system only exposes a single range value cleanly. Multi-handle
sliders need explicit additional binding sources.

Keep the existing aliases:

- `value.raw`
- `value.normalized`

Add these sources:

- `value.current.raw`
- `value.current.normalized`
- `value.start.raw`
- `value.start.normalized`
- `value.end.raw`
- `value.end.normalized`
- `value.span.raw`
- `value.span.normalized`

Meaning:

- for `Slider`, `value.current.*` is the same as `value.*`
- for `RangeSlider`, `start` and `end` are the two thumbs
- for `BandSlider`, `start`, `current`, and `end` all exist
- `span` is useful for fill width or zone shading

This is the minimum expansion needed for bindings without turning the system into
a scripting language.

## Built-In Part Schema

Stable part names matter because states, bindings, and animations will target
them directly.

### Slider Parts

Required parts:

- `track`
- `activeFill`
- `thumbCurrent`

Optional generated helper parts:

- `centerMarker`
- `tickMajor_*`
- `tickMinor_*`
- `labelMin`
- `labelMax`
- `labelCurrent`

### RangeSlider Parts

Required parts:

- `track`
- `selectedRange`
- `thumbStart`
- `thumbEnd`

Optional generated helper parts:

- `tickMajor_*`
- `tickMinor_*`
- `labelMin`
- `labelMax`
- `labelStart`
- `labelEnd`

### BandSlider Parts

Required parts:

- `track`
- `selectedRange`
- `thumbStart`
- `thumbCurrent`
- `thumbEnd`

Optional generated helper parts:

- `centerMarker`
- `tickMajor_*`
- `tickMinor_*`
- `labelMin`
- `labelMax`
- `labelStart`
- `labelCurrent`
- `labelEnd`

## Generated Parts vs User-Owned Parts

Ticks and labels should be generated by helper functions, not manually authored
one by one in the ready-made editor.

Reason:

- the count may change
- the placement must follow orientation and size
- they should remain consistent across presets

Recommended rule:

- in the ready-made slider workflow, tick and label parts are system-owned
- the `SliderEditor` regenerates them when related settings change
- later, the Component Designer can introduce an "unlock to custom component"
  flow if needed

## Ticks

Ticks are worth shipping, but they must stay basic.

### Include Ticks in Ready-Made Sliders

Yes, because:

- many audio UIs benefit from visual stepping
- ticks are common enough to justify a built-in
- they can be generated from the current size and value range

### Keep Tick Controls Minimal

Recommended exposed settings:

- `showTicks`: `off | major | majorMinor`
- `majorTickCount`
- `minorTicksPerMajor`
- `tickPlacement`: `inside | outside | center`
- `tickLength`
- `tickThickness`
- `tickColour`
- `snapToTicks`

Recommended defaults:

- ticks off by default
- no more than one simple style in the ready-made editor
- generated as simple line / bar parts using `Background`

Do not expose in the ready-made editor:

- custom tick artwork
- alternating tick styles
- per-tick labels
- non-linear distributions
- custom tick animation graphs

## Labels

Labels are also worth shipping, but again only in the common cases.

### Include Labels in Ready-Made Sliders

Yes, because:

- min/max labels are common and cheap
- current value labels are often needed
- they fit the "fast to useful" goal

### Label Types to Support

Recommended toggles:

- `showMinLabel`
- `showMaxLabel`
- `showCurrentLabel`

For `RangeSlider`:

- optional `showStartLabel`
- optional `showEndLabel`

For `BandSlider`:

- optional `showStartLabel`
- optional `showCurrentLabel`
- optional `showEndLabel`

Recommended formatting settings:

- `labelMode`: `auto | custom`
- `labelPrecision`
- `labelPrefix`
- `labelSuffix`
- `customMinLabel`
- `customMaxLabel`

Recommended placement settings:

- `labelPlacement`: `outsideStartEnd`, `insideEnds`, `below`, `above`, `leftRight`

Recommended defaults:

- labels off by default
- if enabled, min/max labels should appear first
- current value label should be optional, not forced

Do not hardwire labels into the track art.

They should remain parts so states and later designer features can still target
them.

## Visual Controls to Expose in the Ready-Made Editor

The built-in slider editor should expose only the common style controls.

### Track

- thickness
- inset
- corner radius
- fill colour
- border on/off
- border thickness
- border colour

### Active Fill / Selected Range

- show fill on/off
- fill colour
- radius follow track yes/no
- fill origin mode for single sliders: `fromMin | fromCenter`

### Thumb

- size
- shape: `round | square | capsule`
- fill colour
- border on/off
- border thickness
- border colour
- shadow on/off

### Labels

- on/off toggles
- shared text colour
- shared font size
- shared offset
- format controls

### Ticks

- on/off mode
- count
- placement
- colour
- size

### Interaction Helpers

- show center marker
- show hover enlargement
- show pressed compression
- smooth movement on/off

The editor should not expose raw path lists or arbitrary target maps for these
basic operations. It should write them for the user.

## States and Animation Defaults

The default state language should stay consistent with the current slider
implementation.

Recommended default states:

- `Hover`
- `Pressed`
- `Dragging`
- `Focused`
- `Disabled`

Recommended default behavior:

- hover slightly enlarges the active thumb
- pressed slightly compresses the active thumb
- dragging brightens the active fill and active thumb
- focused accents the active thumb border
- disabled reduces opacity

Recommended default animations:

- thumb position smoothing
- fill size smoothing
- optional thumb scale smoothing for state changes

For multi-handle sliders:

- animate each thumb independently
- animate selected range / fill width and position

## Input Behavior

### Pointer

Recommended rules:

- dragging a thumb moves that thumb
- clicking empty track obeys `trackClickMode`
- range and band sliders choose the nearest thumb on ambiguous track clicks
- if the selected range body is clicked, do nothing in v1 unless explicit
  "drag range body" support is added later

### Keyboard

Recommended rules:

- arrow keys adjust the active thumb
- `Home` and `End` move the active thumb to limits
- `PageUp` and `PageDown` use a larger increment
- for multi-handle sliders, focus should target the most recently touched thumb

### Mouse Wheel

Recommended rules:

- wheel affects the active thumb only
- disabled when `wheelEnabled` is false

## Preview / Debug Requirements

The current interaction preview already supports single-value sliders. Multi-handle
sliders will need handle-aware controls.

The preview sidebar should show:

- start value when relevant
- current value when relevant
- end value when relevant
- which thumb is currently active
- normalized values for all active handles

The live test surface should support:

- grabbing the nearest thumb
- keeping thumb constraints valid
- showing dragging state for the correct active thumb

Debug output should include:

- active thumb name
- raw values
- normalized values
- active states

## Editor UX Recommendation

Add a dedicated `Slider` tab for slider-family controls.

This tab should appear for:

- `Slider`
- `RangeSlider`
- `BandSlider`

The tab should manage:

- variant-specific style controls
- tick generation settings
- label generation settings
- preset application

The generic tabs remain useful:

- `Behavior`
- `States`
- `Bindings`
- `Animations`

This gives a good split:

- `Slider` tab for common authoring
- generic interactive tabs for advanced tuning

## Implementation Strategy

### 1. Keep Shared Interactive Data as the Truth

Do not introduce a second slider-only runtime model.

The runtime should still resolve from:

- `Behavior`
- `Parts`
- `Bindings`
- `States`
- `Animations`

### 2. Add Slider-Specific Authoring Helpers

Implement helper functions that:

- create the correct default part tree for each slider type
- regenerate tick parts
- regenerate label parts
- update bindings when orientation or variant changes

### 3. Extract Reusable Part Renderers

Right now `InteractivePartRenderer.svelte` only renders `Background`.

For labels to work properly, slider parts need text rendering too.

Recommended refactor:

- extract reusable text rendering from `CanvasControl.svelte`
- let `InteractivePartRenderer.svelte` render `Text` as well as `Background`

This is useful beyond sliders and aligns with the future Component Designer.

## Concrete Codebase Touchpoints

| File | Work |
| --- | --- |
| `CE/web/src/CE_Application/models/componentTypes.js` | Add `RangeSlider` and `BandSlider` templates and defaults. |
| `CE/web/src/CE_Application/models/interactionDefaults.js` | Add part factories, bindings, and state defaults for each slider type. |
| `CE/web/src/CE_Application/models/sectionDefaults.js` | Extend `Behavior` defaults with `valueMode` and multi-handle defaults. |
| `CE/web/src/CE_Application/sections/BehaviorEditor.svelte` | Add UI for `valueMode`, multi-handle defaults, crossing rules, and track click mode. |
| `CE/web/src/CE_Application/sections/BindingsEditor.svelte` | Add new binding source options for `start`, `current`, `end`, and `span`. |
| `CE/web/src/CE_Application/sections/SliderEditor.svelte` | New constrained authoring UI for track, fill, thumb, ticks, labels, and presets. |
| `CE/web/src/CE_Application/panels/PropertiesPanel.svelte` | Register the slider tab when a slider-family component is selected. |
| `CE/web/src/CE_Application/panels/sectionEditorLoaders.js` | Load the new slider editor. |
| `CE/web/src/CE_Application/components/InteractionPreviewTab.svelte` | Add preview controls for multi-handle values and active thumb state. |
| `CE/web/src/CE_Application/components/InteractiveTestSurface.svelte` | Add nearest-thumb selection and constrained multi-handle dragging. |
| `CE/web/src/CE_Application/utils/interactionRuntime.js` | Resolve new multi-handle signals and binding sources. |
| `CE/web/src/CE_Application/editor/InteractivePartRenderer.svelte` | Render text-bearing label parts and related transitions. |
| `CE/web/src/CE_Application/editor/CanvasControl.svelte` | Minimal follow-up changes after renderer extraction or part text support. |
| `CE/src/ValueTreeBridgeState.cpp` | Probably no schema-specific work beyond normal path support, because the bridge is generic. |

## Recommended Phasing

### Phase 1: Single Linear Slider Done Properly

Ship first:

- `Slider`
- horizontal / vertical
- optional bipolar fill mode
- optional ticks
- optional min/max/current labels
- dedicated `SliderEditor`

This gets the editor a strong ready-made slider quickly without waiting for the
designer.

### Phase 2: RangeSlider

Add next:

- two-handle data model
- selected range fill
- start/end binding sources
- start/end labels

### Phase 3: BandSlider

Add after range is stable:

- three-handle constraints
- current-thumb semantics
- richer preview and debug support

### Phase 4: Radial / Knob Decision

Only after the linear family is stable:

- decide whether radial belongs as a built-in `Knob`
- or moves entirely to Component Designer

## Acceptance Criteria

The ready-made slider work is successful when:

- a user can insert a working slider from the component list
- horizontal and vertical are just settings, not separate maintenance paths
- a range slider and a band slider can be inserted without manual JSON editing
- track, fill, thumb, ticks, and labels can be configured from a dedicated
  editor tab
- states and animations still use the shared interactive system
- the Component Designer is not blocked or contradicted by the built-in model
- the runtime data remains understandable and patchable through named parts and
  bindings

## Final Recommendation

Ship a focused ready-made slider family, not a giant all-in-one slider engine.

Best first product shape:

1. `Slider`
2. `RangeSlider`
3. `BandSlider`

With these product rules:

- horizontal and vertical are built in
- diagonal is handled by rotation
- circular is deferred to a future radial / knob path
- ticks are included as basic generated helpers
- labels are included as optional generated helpers
- the authoring UI is curated and limited
- the underlying runtime stays fully aligned with `Behavior`, `Parts`,
  `Bindings`, `States`, and `Animations`

That gives CEditor a strong ready-made slider offering now, while still leaving
the real slider invention work to the future Component Designer.
