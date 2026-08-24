# Unified Slider Family Implementation Guide

## Purpose

Define the ready-made slider system as a complete slider family, not a temporary
half-step before the Component Designer.

This guide replaces the more conservative "linear-first, circular-later"
thinking. The slider system should be designed correctly from the start:

- linear and circular geometry are both first-class
- single-value, two-value, and three-value sliders are all first-class
- ticks are first-class slider entities
- labels are first-class slider entities
- value readout is also a label entity
- the future Component Designer still matters, but it does not excuse an
  under-scoped slider system

Related references:

- `docs/design/interactive-components-implementation-spec.md` — deleted; in git history.
- `docs/design/button-system-redesign-spec.md` — deleted; in git history.

## Core Product Position

The editor should expose one slider family with a strong internal structure.

The ready-made slider system should support:

- rectangular / linear sliders
- circular sliders
- single-value sliders
- range sliders
- three-value sliders
- rich tick systems
- rich label systems
- shared interactive states and animations

The Component Designer should still exist for:

- fully bespoke artwork
- arbitrary vector paths
- completely custom layer composition
- custom motion systems
- non-standard geometry beyond the supported slider family

The right split is not "simple now, real later".

The right split is:

- ready-made slider family = complete structured slider system
- Component Designer = unlimited freeform slider invention

## Direct Answers

| Question | Decision |
| --- | --- |
| Horizontal slider? | Yes. Built in. |
| Vertical slider? | Yes. Built in. |
| Circular slider? | Yes. Built in. |
| Two-value slider? | Yes. Built in for both linear and circular geometry. |
| Three-value slider? | Yes. Built in for both linear and circular geometry. |
| Diagonal slider? | Not a separate type. Use a linear slider plus rotation. |
| Ticks? | Yes. Not just "simple generated ones", but structured configurable tick sets. |
| Min / max labels? | Yes. They are separate label entities, not fused into the slider body. |
| Value display? | Yes. That is also a label entity, usually a dynamic readout label. |
| Is the slider body its own thing next to labels? | Yes. The body, ticks, pointers, and labels are distinct internal entities. |

## One Slider Family, Not a Pile of Unrelated Widgets

The cleanest model is one `Slider` family with:

- `geometry`
- `valueMode`
- structured internal entities

Recommended runtime fields:

- `Behavior.geometry`: `linear | circular`
- `Behavior.valueMode`: `single | range | band`

This produces six supported combinations:

| Geometry | Value Mode | Meaning |
| --- | --- | --- |
| `linear` | `single` | Standard horizontal / vertical slider |
| `linear` | `range` | Two-handle linear slider |
| `linear` | `band` | Three-handle linear slider |
| `circular` | `single` | Standard circular slider |
| `circular` | `range` | Two-handle circular slider |
| `circular` | `band` | Three-handle circular slider |

Palette presets can still offer friendly insert options such as:

- `Linear Slider`
- `Vertical Slider`
- `Range Slider`
- `Band Slider`
- `Circular Slider`
- `Circular Range Slider`
- `Circular Band Slider`

But they should all be presets of the same slider family, not unrelated one-off
components.

## Geometry Model

### Linear

Linear geometry supports:

- horizontal
- vertical
- rotated linear sliders

Recommended behavior fields:

- `orientation`: `horizontal | vertical`
- `direction`: `ltr | rtl | btt | ttb`

Diagonal is not its own slider geometry.

Use:

- linear geometry
- existing `Transform.rotation`

### Circular

Circular geometry supports:

- full circle
- partial arc
- clockwise travel
- counterclockwise travel
- single, range, and band value models

Recommended behavior fields:

- `geometry: circular`
- `startAngle`
- `sweepAngle`
- `direction: cw | ccw`
- `allowWrapAround`

Recommended interpretation:

- `startAngle` defines the first drawable point
- `sweepAngle` defines how much of the circle is active
- `allowWrapAround` determines whether a range / band may cross the seam

### Layout, Aspect Ratio, and Bounds

Geometry has to resolve inside a real component box, not in isolation.

Recommended layout rules:

- linear sliders stretch along their primary axis and center or inset along the
  cross axis
- circular sliders preserve a true circle and fit uniformly inside the smallest
  available body dimension
- the ready-made slider should not stretch circular geometry into an ellipse
- extra rectangular space around a circular slider becomes padding or label/tick
  room, not distorted dial geometry

Recommended bounding-box rules:

- the slider component owns one overall bounding box
- `Body`, `Ticks`, and `Labels` resolve inside that box through reserved lanes,
  insets, or anchor regions
- outside ticks and labels should shrink the available body region by default
  rather than silently overflow it
- visual overflow should be explicit and opt-in, not accidental

Recommended responsive rules:

- when available pixel spacing becomes tight, the system should degrade
  secondary detail before primary interaction elements
- hide or thin minor ticks first
- reduce label frequency second
- preserve pointer hit targets and core body readability last
- the editor and preview should make any responsive density reduction visible

## Value Model

Use value semantics that stay readable across all geometries.

Recommended roles:

- `start`
- `current`
- `end`

By value mode:

| Value Mode | Active Values |
| --- | --- |
| `single` | `current` |
| `range` | `start`, `end` |
| `band` | `start`, `current`, `end` |

This naming is clearer than overloading `min` and `max`, because `min` and `max`
already describe the overall numeric range of the control.

Recommended behavior fields:

- `min`
- `max`
- `step`
- `defaultStartValue`
- `defaultCurrentValue`
- `defaultEndValue`
- `allowHandleCross`
- `trackClickMode`
- `activeHandlePolicy`
- `snapToStep`
- `snapToTicks`

Canonical default rule:

- `defaultCurrentValue` is the primary single-value default
- `defaultValue` is a migration compatibility alias for older single sliders,
  not the preferred authored field

Recommended rules:

- `single`: `current` is the only active value
- `range`: `start <= end` unless crossing is explicitly allowed
- `band`: `start <= current <= end` unless crossing / wrapping is explicitly
  allowed by the chosen geometry rules

## Internal Slider Entities

The ready-made slider should not be treated as one flat visual blob.

It should be composed from stable internal entity groups, and those entity
groups should be treated as part of the slider contract.

| Entity Group | Purpose | Owns |
| --- | --- | --- |
| `Body` | The main slider shape and active value areas | track, arc, fill, selected range, center marker, background span |
| `Pointers` | The movable value markers | `start`, `current`, `end` handles or indicators |
| `Ticks` | Scale markers and value markers | major sets, minor sets, accent sets, active-span highlighting |
| `Labels` | Textual support and readout | min, max, start, current, end, title, unit, readout |

This directly answers the label question:

- the slider body is one entity group
- labels are another entity group
- the value display is also a label entity, usually called a readout

### Why This Section Matters

This is not just a visual grouping exercise.

These entities define:

- what the ready-made slider editor is allowed to control
- what the runtime must generate consistently
- what states and bindings can target by stable name
- what the future Component Designer can inherit and extend

If this section is vague, the entire slider system becomes vague.

### Entity Rules

Recommended rules:

- every slider instance always has a `Body` group
- every active value always has a matching pointer role
- ticks and labels are optional groups, but when enabled they must be generated
  as real internal entities, not painted ad hoc
- entities must keep stable role names even when their visual style changes
- geometry changes where entities render, not what they fundamentally are

Example:

- a `current` pointer in a linear slider may be a thumb
- a `current` pointer in a circular slider may be a dot or arc marker
- but it is still the `current` pointer entity

### Entity Roles by Value Mode

The entity model should expand or contract based on `Behavior.valueMode`.

#### `single`

Required:

- `Body`
- `pointerCurrent`

Optional:

- `Ticks`
- `Labels`

#### `range`

Required:

- `Body`
- `pointerStart`
- `pointerEnd`

Optional:

- `Ticks`
- `Labels`

#### `band`

Required:

- `Body`
- `pointerStart`
- `pointerCurrent`
- `pointerEnd`

Optional:

- `Ticks`
- `Labels`

This is important because the ready-made editor should not fake multi-value
sliders by overloading one pointer entity. Each active semantic value should get
its own entity.

### Body Entity Breakdown

The `Body` group should itself contain stable sub-roles.

Recommended body sub-roles:

- `bodyTrackBase`
- `bodyTrackFill`
- `bodySelectedRange`
- `bodyCenterMarker`
- `bodyStartGap`
- `bodyEndGap`

Rules:

- `bodyTrackBase` is the neutral track or arc
- `bodyTrackFill` is the main active fill for single sliders
- `bodySelectedRange` is the highlighted span for range or band sliders
- `bodyCenterMarker` is optional and useful for bipolar linear or circular
  sliders
- `bodyStartGap` and `bodyEndGap` are optional helper regions for richer
  presets

Not every preset must show every sub-role, but the role names should still stay
stable.

### Pointer Entity Breakdown

Pointers are the primary value-carrying entities.

Recommended pointer roles:

- `pointerStart`
- `pointerCurrent`
- `pointerEnd`

Rules:

- each pointer maps to one value source
- each pointer can own its own hover, pressed, dragging, and focused styling
- each pointer should be targetable independently by bindings and states
- the active handle in preview/runtime should always resolve to one of these
  pointer roles

The ready-made slider should never depend on "anonymous thumb 1, thumb 2, thumb
3" naming. Semantic role names are clearer and more stable.

### Tick Entity Breakdown

Ticks should be structured as sets, not as one monolithic decoration layer.

Recommended tick roles:

- `tickMajor_*`
- `tickMinor_*`
- `tickAccent_*`
- `tickValue_*`
- `tickRange_*`

Rules:

- the suffix identifies the generated instance
- the prefix identifies the set role
- each set should be regeneratable by the ready-made slider editor
- different tick sets may coexist on the same slider

This allows:

- a normal major/minor scale
- an accent set for important values
- a value-linked set that reacts to current, range, or band state

### Label Entity Breakdown

Labels should also be semantic, not anonymous text layers.

Recommended label roles:

- `labelMin`
- `labelMax`
- `labelStart`
- `labelCurrent`
- `labelEnd`
- `labelValue`
- `labelTitle`
- `labelUnit`

Rules:

- `labelValue` is the main readout label
- `labelCurrent` is a value-linked label tied specifically to the `current`
  handle
- `labelStart` and `labelEnd` are handle labels for range and band modes
- `labelTitle` and `labelUnit` are supportive UI labels around the control

This prevents confusion between:

- the readout label
- the current-handle label
- the min/max labels

Those are related, but they are not the same thing.

### Generated vs Authored Entities

The ready-made slider editor should manage entities in a structured way.

Recommended rule:

- body and pointer core entities are always present by contract
- ticks and labels are generated from slider settings
- generated entities remain real internal entities with stable names
- the user edits their settings through the slider editor, not by manually
  creating random internal nodes

This keeps the system powerful without collapsing into a hidden Component
Designer.

### Entity Ownership

Ownership should be explicit.

Recommended ownership model:

- `Behavior` owns interaction semantics
- `SliderEditor` owns generated entity configuration
- `Parts` stores the resolved internal entities
- `Bindings` positions and updates those entities
- `States` and `Animations` style and animate those entities

That means:

- the slider editor is the authoring surface
- `Parts` is the stored result
- the runtime still works through the shared interaction architecture

### Non-Goals for This Entity Section

This section does not mean:

- every slider must expose all entities visually at once
- every slider preset must use all label roles
- every tick set must exist by default
- the ready-made slider must become a freeform scene graph editor

It means:

- the internal structure must be rich enough to support the full slider family
- the structure must be semantic and stable
- labels, ticks, pointers, and body must remain distinct concerns

## Label System

Labels should be first-class, not painted into the track.

This section defines what labels mean, when they appear, and how the ready-made
slider should manage them.

The goal is to remove ambiguity between:

- domain labels such as min / max
- handle labels such as start / current / end
- the primary value readout
- supportive labels such as title and unit

### Label Principles

Recommended principles:

- labels are separate entities from the slider body
- labels may reference the body or pointers, but they do not become part of the
  body artwork
- labels use semantic roles, not anonymous text layers
- labels can be static or dynamic
- the readout is a label, not a special unrelated widget

### Label Roles

Recommended label roles:

- `labelMin`
- `labelMax`
- `labelStart`
- `labelCurrent`
- `labelEnd`
- `labelValue`
- `labelTitle`
- `labelUnit`

Role definitions:

- `labelMin`: shows the outer minimum of the slider domain
- `labelMax`: shows the outer maximum of the slider domain
- `labelStart`: shows the value or caption for the `start` handle
- `labelCurrent`: shows the value or caption for the `current` handle
- `labelEnd`: shows the value or caption for the `end` handle
- `labelValue`: the primary readout label for the control as a whole
- `labelTitle`: the descriptive name of the control
- `labelUnit`: the unit indicator, such as `%`, `Hz`, `ms`, or `dB`

### Role Presence by Value Mode

Labels should not all appear by default, but the system should know which roles
make sense for each value mode.

#### `single`

Common roles:

- `labelMin`
- `labelMax`
- `labelCurrent`
- `labelValue`
- `labelTitle`
- `labelUnit`

#### `range`

Common roles:

- `labelMin`
- `labelMax`
- `labelStart`
- `labelEnd`
- `labelValue`
- `labelTitle`
- `labelUnit`

#### `band`

Common roles:

- `labelMin`
- `labelMax`
- `labelStart`
- `labelCurrent`
- `labelEnd`
- `labelValue`
- `labelTitle`
- `labelUnit`

This matters because `labelCurrent` and `labelValue` are not interchangeable.

### `labelCurrent` vs `labelValue`

This is the most important distinction in the label system.

#### `labelCurrent`

`labelCurrent` is tied specifically to the `current` value role.

Use it when:

- a single slider wants a label attached to the active handle
- a band slider wants to show the center / current handle value
- the label should behave as a handle-linked annotation

#### `labelValue`

`labelValue` is the primary readout for the slider as a whole.

Use it when:

- the control needs one main displayed value
- the readout should sit in a dedicated readout position
- a range slider should show a combined value string
- a band slider should show a summary value string

Examples:

- single slider: `labelCurrent` and `labelValue` may show the same number, but
  one can follow the pointer and the other can stay fixed
- range slider: `labelValue` may show `20 - 80`, while `labelStart` shows `20`
  and `labelEnd` shows `80`
- band slider: `labelValue` may show a composite summary, while
  `labelCurrent` remains the center-handle label

So:

- `labelCurrent` is handle-specific
- `labelValue` is control-level readout

### Static vs Dynamic Labels

Two categories should exist:

- static labels
- dynamic labels

Static labels:

- `labelTitle`
- `labelUnit`
- custom `labelMin`
- custom `labelMax`

Dynamic labels:

- `labelStart`
- `labelCurrent`
- `labelEnd`
- auto `labelMin`
- auto `labelMax`
- `labelValue`

### Content Modes

Each label should support a clear content policy.

Recommended `contentMode` values:

- `auto`
- `custom`
- `hybrid`

Meaning:

- `auto`: content is derived from the slider state
- `custom`: content is fixed user text
- `hybrid`: content combines fixed text with derived value output

Examples:

- `labelMin` in `auto` mode may show the control `min`
- `labelMin` in `custom` mode may show `Dry`
- `labelValue` in `hybrid` mode may show `Gain: +3 dB`

### Formatting Contract

Dynamic labels should share a consistent formatting model.

Recommended formatting settings:

- `precision`
- `prefix`
- `suffix`
- `showSign`
- `trimTrailingZeros`
- `useThousandsSeparator`
- `unitMode: none | append | separateLabel`
- `rangeSeparator`
- `bandSeparator`

Recommended formatting behavior:

- single sliders default to a single numeric output
- range sliders default to a composite `start-end` string for `labelValue`
- band sliders may default to either `current` only or a structured summary,
  depending on the preset

### Localization and RTL Formatting

Formatting should be locale-aware, not just string concatenation.

Recommended rules:

- numeric output should use locale-aware formatting
- `prefix`, `suffix`, `rangeSeparator`, `bandSeparator`, and unit output should
  support localized ordering/templates
- `labelValue` should not hardcode `prefix + value + suffix`
- composite readouts such as range and band summaries should support localized
  string templates rather than one fixed western ordering
- bidi-safe wrapping should be used when mixing RTL text with Latin units,
  symbols, or numbers
- locale may change preview formatting defaults, but authored slider travel
  direction still comes from `Behavior.direction`

### Placement Model

Labels should support both fixed placement and value-following placement.

Recommended placement families:

- `outside`
- `inside`
- `attachedToPointer`
- `attachedToBody`
- `freeAnchor`

Rules:

- domain labels such as `labelMin` and `labelMax` are usually fixed
- handle labels such as `labelStart`, `labelCurrent`, and `labelEnd` may be
  fixed or pointer-attached
- `labelValue` is usually fixed, but may also be placed inside the slider body

### Linear Placement Options

Recommended linear options:

- above
- below
- left
- right
- insideStart
- insideEnd
- insideCenter
- attachedAbovePointer
- attachedBelowPointer

### Circular Placement Options

Recommended circular options:

- outerArc
- innerArc
- center
- tangentStart
- tangentEnd
- attachedRadial
- attachedTangential
- freeAngleAnchor

### Orientation Rules

Labels should not inherit geometry blindly.

Recommended label text orientation modes:

- `horizontal`
- `vertical`
- `radial`
- `tangential`
- `upright`

Rules:

- linear sliders usually default to `horizontal`
- circular labels should default to `upright` unless the preset is explicitly
  typographic
- pointer-attached labels may use radial or tangential orientation if the preset
  calls for it

### Styling Model

The ready-made slider editor should expose strong label controls, not just
visibility toggles.

Recommended label settings:

- `enabled`
- `role`
- `contentMode`
- `precision`
- `prefix`
- `suffix`
- `showSign`
- `placement`
- `offsetX`
- `offsetY`
- `orientation`
- `anchor`
- `followGeometry`
- `sharedStyle`
- `allowRoleOverride`

Recommended style surfaces:

- font family
- size
- weight
- colour
- opacity
- letter spacing
- background fill
- border
- padding
- corner radius

### Shared vs Per-Role Styling

Labels should support both:

- shared label styling
- per-role overrides

Recommended default:

- one shared label style for simplicity
- optional per-role override when needed

This gives the ready-made slider enough power without immediately turning label
authoring into a fully manual layout tool.

### Visibility Rules

Recommended defaults:

- `labelMin` and `labelMax` off by default unless the chosen preset is clearly
  scale-oriented
- `labelValue` on by default only for presets where a readout is central to the
  design
- `labelStart` / `labelEnd` off by default for range and band until that preset
  calls for them
- `labelTitle` and `labelUnit` off by default unless the inserted preset is
  presented as a fully framed control

The key rule:

- support all roles
- do not force all roles visible

### Generated vs Managed Labels

The ready-made slider editor should manage labels as generated semantic entities.

Recommended rule:

- labels are created from slider settings
- labels remain real internal entities with stable names
- users do not create arbitrary label nodes by hand in the ready-made workflow
- users control label presence, content policy, placement, and style through the
  slider editor

This keeps the label system structured and predictable.

### GUI Model for Labels

If labels are a slider subsystem, the GUI should not expose them as eight
independent top-level components in the main component tree.

That would create clutter and make the slider feel like a bag of loose parts.

The better GUI model is:

- labels remain internal to the slider
- the slider gets a dedicated `Labels` area inside `SliderEditor`
- users select label roles from a compact role strip or role list
- the editor then shows controls for the currently selected label role

Recommended label authoring structure inside `SliderEditor`:

1. `Quick Toggles`
2. `Shared Style`
3. `Role Selector`
4. `Selected Role`
5. `Canvas Assist`

#### 1. Quick Toggles

This row is for the common fast decisions.

Recommended toggles:

- `Min/Max`
- `Handle Labels`
- `Readout`
- `Title`
- `Unit`

Meaning:

- `Min/Max` controls `labelMin` and `labelMax`
- `Handle Labels` controls `labelStart`, `labelCurrent`, and `labelEnd` as a
  family
- `Readout` controls `labelValue`
- `Title` controls `labelTitle`
- `Unit` controls `labelUnit`

This gives fast access without opening deep configuration immediately.

#### 2. Shared Style

Most sliders should start from one common label style.

Recommended shared controls:

- font family
- font size
- colour
- opacity
- spacing
- default placement family
- default orientation
- default padding / background

Recommended rule:

- all enabled labels inherit the shared style by default
- individual roles can opt into override mode only when needed

This keeps the normal workflow fast.

#### 3. Role Selector

Users then choose which semantic label they want to edit in detail.

Recommended selector UI:

- chips or tabs for `Min`, `Max`, `Start`, `Current`, `End`, `Readout`,
  `Title`, `Unit`

Recommended chip behavior:

- disabled roles appear dimmed
- enabled roles appear active
- roles not relevant to the current `valueMode` are hidden or unavailable
- clicking a chip focuses that label role in the inspector

This is the key to keeping the subsystem manageable.

We do not show eight parallel property panels.
We show one role inspector at a time.

#### 4. Selected Role

Once a role is selected, show a focused inspector for that one label.

Recommended fields:

- `enabled`
- `contentMode`
- source / value role
- custom text
- formatting
- placement
- attach mode
- offset
- orientation
- inherit shared style yes/no
- role-specific overrides

Example:

- selecting `Readout` shows readout-specific settings
- selecting `Current` shows handle-label settings
- selecting `Min` shows domain-label settings

This makes the subsystem feel structured instead of overwhelming.

#### 5. Canvas Assist

The properties panel should not do all the work alone.

When editing labels, the canvas / preview should help.

Recommended behavior:

- clicking a rendered label selects its role in the inspector
- the selected label shows a highlight outline
- the selected label shows its anchor or attach point
- placement changes preview live
- pointer-attached labels visibly follow their pointer during preview

For circular sliders, canvas assistance is especially important because:

- radial placement
- tangential placement
- center placement
- arc-relative placement

are much easier to understand visually than through numeric inputs alone.

### Main Tree vs Internal Tree

Recommended rule:

- slider labels do not appear as normal sibling components in the main
  component tree

Instead:

- they remain internal slider entities
- they may be shown in an internal entity list inside the slider editor
- advanced users may inspect them by role name, but they are still owned by the
  slider

This keeps the overall editor tidy and avoids polluting the main canvas
hierarchy.

### Basic vs Advanced Label Editing

Recommended two-level GUI:

- basic mode
- advanced mode

Basic mode should cover:

- visibility
- role selection
- shared style
- content mode
- placement presets
- common formatting

Advanced mode can expose:

- role-level style overrides
- background fill behind labels
- border and padding
- orientation nuance
- per-role offset tuning

This keeps the normal workflow approachable while still leaving room for depth.

### Relation to Standalone `Label` Components

A slider label subsystem does not replace the standalone `Label` component.

The difference is:

- standalone `Label` is a normal independent component
- slider labels are internal entities semantically attached to a slider

So GUI-wise:

- if a user wants a label that belongs to the slider, they use the slider's
  internal label system
- if they want a separate independent label elsewhere on the panel, they use a
  standalone `Label` component

That distinction should stay clear in the UI language.

### Non-Goals for This Label Section

This section does not mean:

- every slider needs eight labels on screen
- every label must support arbitrary paragraph layout
- the ready-made slider must become a full typography editor
- the readout must always be visible

It means:

- labels are a real subsystem
- role names must stay semantic
- `labelValue` and `labelCurrent` must stay distinct
- the slider body and slider labels remain separate concerns

## Tick System

Ticks should also be first-class slider entities.

The earlier "simple generated ticks only" idea is too weak.

This section defines what tick sets are, how they behave, and how the editor
should expose them without turning the slider into an unreadable pile of options.

### Tick Principles

Recommended principles:

- ticks are separate internal entities from the body and labels
- ticks are authored as sets, not one line at a time
- each tick set has a semantic role
- each tick set can be styled independently
- tick highlighting can react to the slider's live values
- tick placement must respect linear and circular geometry

### What the Ready-Made Slider Should Support

The ready-made slider should support:

- multiple tick sets
- different semantic tick roles
- separate styling per set
- geometry-aware layout for linear and circular sliders
- value-aware highlighting
- preset-based quick setups

### Tick Set Model

Ticks should be managed as named sets.

Recommended tick set roles:

- `major`
- `minor`
- `accent`
- `valueMarker`
- `rangeMarker`
- `bandMarker`
- `customSet`

Role meanings:

- `major`: the main readable scale marks
- `minor`: the finer subdivisions between major ticks
- `accent`: emphasized ticks at important values
- `valueMarker`: ticks that react to the current active value
- `rangeMarker`: ticks that react to a selected range
- `bandMarker`: ticks that react to a band window
- `customSet`: a curated extra set for special presets without calling it fully
  custom freeform authoring

### Generated Tick Entities

Each set should generate real internal entities.

Recommended naming:

- `tickMajor_*`
- `tickMinor_*`
- `tickAccent_*`
- `tickValue_*`
- `tickRange_*`
- `tickBand_*`

Rules:

- the prefix defines the semantic set
- the suffix identifies the generated instance
- users do not manage the individual generated tick nodes one by one in the
  normal workflow
- the slider editor manages the set and regenerates the concrete tick entities

### Tick Set Settings

Recommended settings per tick set:

- `enabled`
- `role`
- `distributionMode`
- `count`
- `valueList`
- `stepMultiple`
- `length`
- `thickness`
- `offset`
- `placement`
- `colour`
- `opacity`
- `shape`
- `capStyle`
- `blendMode`
- `highlightMode`
- `highlightColour`
- `highlightOpacity`
- `inheritSharedStyle`

Recommended `distributionMode` values:

- `uniform`
- `stepBased`
- `valueList`
- `derivedFromMajor`

Meaning:

- `uniform`: spread evenly across the available geometry
- `stepBased`: derive ticks from the control `step` or a multiple of it
- `valueList`: use explicit values supplied by the user or preset
- `derivedFromMajor`: used mainly by minor ticks to subdivide major intervals

This makes the tick system useful and structured without turning it into a
completely arbitrary vector editor.

### Tick Roles by Value Mode

Different value modes suggest different useful tick behavior.

#### `single`

Most useful sets:

- `major`
- `minor`
- `accent`
- `valueMarker`

#### `range`

Most useful sets:

- `major`
- `minor`
- `accent`
- `rangeMarker`

#### `band`

Most useful sets:

- `major`
- `minor`
- `accent`
- `rangeMarker`
- `bandMarker`

This does not mean every slider must enable all these sets by default.
It means the system should understand which types are meaningful.

### Tick Placement

Ticks should support placement families first, then geometry-specific variants.

Recommended placement families:

- `inside`
- `outside`
- `centered`
- `beforeBody`
- `afterBody`

### Linear Placement Options

Recommended linear options:

- inside
- outside
- centered on track
- before track
- after track
- mirrored

`mirrored` is useful for symmetrical or bipolar linear sliders.

### Circular Placement Options

Recommended circular options:

- inner
- outer
- centered on arc
- between body and labels
- mirrored radial

`mirrored radial` is useful where an inner and outer tick presence should feel
balanced around a circular body.

### Circular Tick Direction and Dial Logic

Yes, circular tick behavior must take dial direction fully into account.

Ticks on a circular slider cannot be treated as if they are just linear ticks
bent around a ring. They need geometry-aware direction rules.

Recommended circular tick-driving fields:

- `startAngle`
- `sweepAngle`
- `direction: cw | ccw`
- `allowWrapAround`

These affect ticks in several ways:

- where the first tick is placed
- where the last tick is placed
- how tick order progresses visually
- how highlighted ranges are drawn
- how `start`, `current`, and `end` values map onto the arc

#### Tick Progression Rule

Recommended rule:

- tick order should always follow the slider's actual value travel direction

That means:

- if the dial runs clockwise, tick progression is clockwise
- if the dial runs counterclockwise, tick progression is counterclockwise

The editor should not force users to mentally reverse ticks just because the
geometry is circular.

#### Start Angle and First Tick

Recommended rule:

- the first generated tick in a set should align with the effective start of the
  slider arc, not with an arbitrary fixed top or left reference

This is important because circular sliders may start at:

- top
- top-left
- left
- bottom
- any custom angle

So tick generation must always resolve from the slider's defined start angle.

#### Sweep and Density

Ticks should also respect the active sweep, not assume a full circle.

Examples:

- a 270-degree dial should generate ticks only along the 270-degree sweep
- a 180-degree arc slider should distribute ticks only across that half arc
- a full-circle slider should distribute across the full loop unless a seam gap
  is intentionally reserved

#### Seam Handling

For circular range and band sliders, seam behavior must be explicit.

Recommended rule:

- if `allowWrapAround` is false, highlighted tick ranges should stop cleanly at
  the arc ends
- if `allowWrapAround` is true, highlighted tick ranges may cross the seam and
  continue from the arc start

This matters for:

- `rangeMarker`
- `bandMarker`
- any gradient-across-span tick highlighting

Without this, circular range/band behavior becomes visually ambiguous.

#### Tick Orientation on Circular Sliders

Circular ticks also need orientation rules, not just placement rules.

Recommended orientation modes:

- `radial`
- `tangential`
- `upright`

Meaning:

- `radial`: ticks point toward or away from the circle center
- `tangential`: ticks follow the direction of the arc
- `upright`: ticks keep a fixed screen orientation regardless of arc angle

Recommended default:

- circular ticks default to `radial`

This gives the most predictable dial-like behavior.

#### Tick Facing

For radial ticks, facing direction should also be explicit.

Recommended facing options:

- `inward`
- `outward`
- `both`

Meaning:

- `inward`: ticks point toward the slider center
- `outward`: ticks point away from the slider center
- `both`: paired mirrored ticks on both sides of the arc

This is especially useful for circular sliders that visually behave more like a
dial or instrument scale.

#### Value Highlight Direction

Highlight logic must follow the same dial direction rules.

Recommended behavior:

- `valueMarker` highlighting follows the current value along the active dial
  direction
- `rangeMarker` highlighting fills the valid selected arc between `start` and
  `end`
- `bandMarker` highlighting fills the selected band arc and can optionally
  accent the `current` handle separately

If the dial runs counterclockwise, all value-linked highlighting should also
resolve counterclockwise.

#### GUI Implication

GUI-wise, circular tick controls should expose direction clearly instead of
hiding it inside unrelated geometry fields.

Recommended circular tick inspector additions:

- `Follow Dial Direction` yes/no
- `Tick Orientation`
- `Tick Facing`
- `Wrap Across Seam` yes/no

Recommended preview behavior:

- changing dial direction immediately flips tick progression in preview
- changing start angle immediately rotates the tick layout
- changing sweep angle immediately trims or expands the tick span
- enabling wrap-around immediately shows how range/band highlights cross the
  seam

So yes: circular dial direction, arc start, sweep, and seam behavior should all
be explicitly accounted for in the tick system.

### Tick Highlighting

Ticks should optionally react to active values.

Recommended highlight modes:

- none
- highlight current value
- highlight nearest tick
- highlight selected range
- highlight band window
- gradient across active span

Recommended behavior by value mode:

- `single`: current or nearest-tick highlighting is usually most useful
- `range`: selected-range highlighting is usually most useful
- `band`: band-window or mixed current-plus-window highlighting is usually most
  useful

### Tick Styling Model

The ready-made slider editor should support both shared tick styling and
per-set overrides.

Recommended shared tick controls:

- default colour
- default opacity
- default length
- default thickness
- default placement family
- default cap style

Recommended per-set override controls:

- colour
- opacity
- length
- thickness
- placement
- shape
- highlight color behavior

Recommended default:

- one shared tick style
- optional per-set override when needed

### Tick Density and Readability

The editor should help users avoid unreadable tick clutter.

Recommended guardrails:

- warn or soft-limit when tick density becomes visually excessive
- auto-reduce minor tick visibility at very small slider sizes
- if space keeps collapsing, reduce major-label frequency before sacrificing
  pointer clarity
- hidden responsive tick sets should remain logically distinct from snapping
  behavior
- use presets for common densities instead of forcing manual tuning every time

This is especially important for circular sliders, where excessive ticks can
become noisy much faster.

### GUI Model for Ticks

Ticks should use the same authoring pattern as labels:

- quick decisions first
- set selector second
- focused set inspector third
- live preview throughout

Recommended tick authoring structure inside `SliderEditor`:

1. `Quick Presets`
2. `Shared Tick Style`
3. `Set Selector`
4. `Selected Set`
5. `Canvas Assist`

#### 1. Quick Presets

This row should cover common setups fast.

Recommended quick actions:

- `None`
- `Major`
- `Major + Minor`
- `Value Markers`
- `Range Emphasis`
- `Band Emphasis`

This lets users get a useful result immediately.

#### 2. Shared Tick Style

Most sliders should start with one overall tick look.

Recommended shared controls:

- colour
- length
- thickness
- opacity
- default placement

#### 3. Set Selector

Users then choose which tick set they want to tune.

Recommended selector UI:

- chips, tabs, or compact list items for `Major`, `Minor`, `Accent`,
  `Value`, `Range`, `Band`

Recommended behavior:

- irrelevant roles for the current `valueMode` are hidden or disabled
- enabled sets appear active
- disabled sets remain available for quick activation
- selecting a set focuses one inspector, not a second full property stack

#### 4. Selected Set

Once a set is selected, show the focused inspector for that set.

Recommended fields:

- `enabled`
- `distributionMode`
- `count`
- `valueList`
- `length`
- `thickness`
- `placement`
- `highlightMode`
- inherit shared style yes/no
- set-specific overrides

This keeps multi-set ticks manageable.

#### 5. Canvas Assist

Ticks are spatial. The canvas must help.

Recommended behavior:

- selecting a set highlights that tick set on the canvas
- placement changes preview live
- circular tick orientation updates live
- density changes are visible immediately
- highlighted value-reactive ticks animate in preview when values change

Without this, circular and multi-set ticks become much harder to reason about.

### Main Tree vs Internal Tree

Recommended rule:

- tick entities do not appear as ordinary sibling components in the main
  component tree

Instead:

- tick sets are managed inside the slider editor
- generated tick entities remain internal to the slider
- advanced inspection may show them by semantic set name, but they remain owned
  by the slider

### Generated vs Authored Ticks

Recommended rule:

- users author tick sets, not individual tick nodes
- the slider editor generates the concrete tick entities
- generated tick entities remain real parts with stable names
- the ready-made slider does not become a manual tick-drawing environment

This is the correct midpoint between "too simple" and "freeform designer".

### Non-Goals for This Tick Section

This section does not mean:

- every slider needs visible ticks
- every tick set must be enabled
- the ready-made slider must allow hand-positioning every individual tick
- tick authoring should become a full vector-illustration workflow

It means:

- ticks are a real subsystem
- multiple semantic tick sets are supported
- highlighting can react to value mode
- the authoring GUI must stay structured and comprehensible

## Pointer System

Pointers are the active handles or markers that move along the slider geometry.

This section defines how pointers behave as semantic value carriers, not just as
decorative handles.

### Pointer Principles

Recommended principles:

- every active value role maps to a pointer role
- pointers are semantic entities, not anonymous handles
- pointers must behave consistently across linear and circular geometry
- pointers may change appearance by preset, but not by role identity
- active-handle logic must be explicit in preview and runtime

### Pointer Roles

Recommended pointer roles:

- `pointerStart`
- `pointerCurrent`
- `pointerEnd`

Role meanings:

- `pointerStart` carries the `start` value
- `pointerCurrent` carries the `current` value
- `pointerEnd` carries the `end` value

### Pointer Presence by Value Mode

#### `single`

Required:

- `pointerCurrent`

#### `range`

Required:

- `pointerStart`
- `pointerEnd`

#### `band`

Required:

- `pointerStart`
- `pointerCurrent`
- `pointerEnd`

The ready-made slider should never depend on "handle 1", "handle 2", or
"handle 3" naming. These roles should stay semantic.

### Pointer Shapes

Pointers may use different preset styles while keeping the same role identity.

Linear pointers may look like:

- thumb
- tab
- line marker
- block handle
- notch

Circular pointers may look like:

- knob indicator
- arc marker
- radial pointer
- handle dot
- wedge marker

Important rule:

- appearance can vary
- role naming does not

### Pointer Interaction Model

Pointers are the primary interactive entities of the slider.

Recommended rules:

- dragging a pointer moves the value associated with that pointer role
- clicking near a pointer should focus that pointer
- keyboard adjustment should act on the active pointer
- wheel input should act on the active pointer
- hover, pressed, dragging, and focused states may be applied per pointer role

### Touch and Hit-Testing

Touch input needs explicit rules, especially for circular and multi-handle
sliders.

Recommended rules:

- pointers should use an invisible hit-slop region larger than the visible
  pointer artwork
- once touch or pointer capture acquires a semantic handle, that handle remains
  captured until release or cancel
- when handles overlap or nearly overlap, resolve touch priority as: currently
  active handle, then last-used handle, then nearest eligible handle
- linear touch dragging should remain axis-constrained even if the finger drifts
  off-axis
- circular dragging should resolve by projecting pointer position onto the dial
  angle relative to the center; the user does not need to trace a perfect
  physical circle
- near the center of a circular slider, the runtime should keep the last stable
  angle or use a small dead zone to avoid jitter
- touch usability should survive thin or decorative pointer art through hit
  slop, not by forcing the visible design to become chunky

### Active Handle Logic

The system must explicitly know which pointer is currently active.

Recommended active-pointer sources:

- pointer click
- pointer drag start
- track click resolution
- keyboard focus handoff

Recommended active handle policies:

- `nearest`
- `lastUsed`
- `currentFirst`
- `startFirst`
- `endFirst`

Rules:

- `nearest` is usually best for pointer-based track clicks
- `lastUsed` is usually best for keyboard continuation
- `currentFirst` is useful for `band` sliders where the center value is the
  most important

### Pointer Constraints

Pointers must respect the slider's value rules.

Recommended rules:

- `single`: only `pointerCurrent` can move
- `range`: `pointerStart` and `pointerEnd` move within the allowed range
- `band`: all three pointers move, but `start <= current <= end` unless
  crossing or wrapping is allowed

If `allowHandleCross` is false:

- pointers clamp against each other
- they do not silently swap semantic roles

This is important.

The semantic meaning of `start`, `current`, and `end` should not change just
because two handles touch or cross visually.

### Linear Pointer Behavior

Linear pointers should follow the slider axis and direction.

Recommended linear fields that influence pointer logic:

- `orientation`
- `direction`

Rules:

- horizontal sliders map pointer travel left-to-right or right-to-left
- vertical sliders map pointer travel bottom-to-top or top-to-bottom
- rotated sliders are still linear sliders underneath; rotation changes display,
  not the underlying role model

### Circular Pointer Behavior

Circular pointers must follow dial logic explicitly.

Recommended circular fields that influence pointer logic:

- `startAngle`
- `sweepAngle`
- `direction: cw | ccw`
- `allowWrapAround`

These fields affect:

- where each pointer begins visually
- how pointer travel progresses
- how range and band spans resolve
- how the active pointer moves across the arc

#### Circular Direction

Recommended rule:

- pointer motion should always follow the dial's actual value direction

That means:

- clockwise dials move pointers clockwise as values increase
- counterclockwise dials move pointers counterclockwise as values increase

#### Circular Seam Handling

Recommended rule:

- if `allowWrapAround` is false, circular pointers may not cross the seam
- if `allowWrapAround` is true, pointers may move across the seam while keeping
  their semantic role

This matters especially for:

- circular range sliders
- circular band sliders

Without an explicit seam policy, circular multi-value sliders become ambiguous.

#### Circular Range and Band Spans

For circular `range` and `band` sliders:

- `pointerStart` and `pointerEnd` define the selected arc span
- `pointerCurrent` may sit inside that span or be independently emphasized,
  depending on the preset

Recommended rule:

- the selected arc must resolve according to dial direction and seam policy, not
  just shortest-distance geometry

### Pointer Visual States

Pointers should support at least:

- default
- hover
- pressed
- dragging
- focused
- disabled
- active-handle emphasis

Recommended visual behavior:

- hover may enlarge or brighten a pointer
- pressed may compress it slightly
- dragging may increase contrast or glow
- focused may add a keyboard-focus accent
- active-handle emphasis may subtly distinguish the currently editable pointer

### Pointer Controls

Recommended pointer controls:

- shape preset
- size
- width / height
- radius
- fill
- border
- shadow
- glow
- active state style
- hit area size
- anchor mode
- inherit shared style

The hit area setting is important:

- the visual pointer may be small
- the interactive target should still be comfortable to grab

### Shared vs Per-Role Pointer Styling

Pointers should support:

- shared pointer styling
- per-role overrides

Recommended default:

- one shared pointer style
- optional per-role overrides when the preset or use case needs them

Examples:

- a range slider may want `start` and `end` pointers identical
- a band slider may want the `current` pointer visually distinct

### GUI Model for Pointers

Pointers should use the same GUI pattern as labels and ticks:

- quick decisions first
- role selector second
- focused role inspector third
- live preview throughout

Recommended pointer authoring structure inside `SliderEditor`:

1. `Quick Presets`
2. `Shared Pointer Style`
3. `Role Selector`
4. `Selected Role`
5. `Canvas Assist`

#### 1. Quick Presets

Recommended quick actions:

- `Minimal`
- `Thumb`
- `Marker`
- `Dial Pointer`
- `Range Handles`
- `Band Handles`

These should apply coherent pointer setups quickly.

#### 2. Shared Pointer Style

Most sliders should start from one common pointer look.

Recommended shared controls:

- shape
- size
- fill
- border
- shadow / glow
- hit area

#### 3. Role Selector

Users then choose which pointer role to tune.

Recommended selector UI:

- chips or tabs for `Start`, `Current`, `End`

Recommended behavior:

- roles not relevant to the current `valueMode` are hidden or disabled
- the currently active pointer role can be visually indicated
- selecting a role focuses one inspector, not multiple side-by-side stacks

#### 4. Selected Role

Once a role is selected, show the focused inspector for that pointer.

Recommended fields:

- `enabled`
- shape preset
- size
- width / height
- anchor mode
- hit area
- inherit shared style yes/no
- role-specific style overrides
- active-handle emphasis yes/no

#### 5. Canvas Assist

Pointers are deeply spatial and interactive.

Recommended behavior:

- clicking a rendered pointer selects its role in the inspector
- the selected pointer shows a clear highlight outline
- dragging in preview demonstrates its constraint behavior
- circular pointer travel updates live with direction and seam settings
- active-handle changes are visible immediately

This is especially important for circular range and band sliders, where pointer
movement rules are harder to understand from form fields alone.

### Main Tree vs Internal Tree

Recommended rule:

- pointers do not appear as ordinary sibling components in the main component
  tree

Instead:

- they remain internal slider entities
- the slider editor exposes them by semantic role
- advanced inspection may show them internally, but they remain owned by the
  slider

### Generated vs Authored Pointers

Recommended rule:

- pointer roles are generated from `valueMode`
- users style and configure those roles
- users do not manually create arbitrary extra pointer nodes in the normal
  ready-made workflow

This keeps the pointer system coherent and predictable.

### Non-Goals for This Pointer Section

This section does not mean:

- every slider must expose dramatically styled handles
- every pointer role must look different
- the ready-made slider must become a fully freeform pointer designer
- semantic pointer roles may swap identity when values cross

It means:

- pointers are a real subsystem
- pointer roles stay semantic
- active-handle logic must be explicit
- circular pointer travel must honor dial direction and seam behavior

## Body System

The body is the core slider structure, separate from ticks and labels.

This section defines the structural skin of the slider family.

The body is where the slider visually becomes:

- a bar
- an arc
- a dial ring
- a selected span
- a bipolar track

without collapsing ticks, labels, and pointers into one merged object.

### Body Principles

Recommended principles:

- the body is its own subsystem
- the body provides the stable visual backbone of the slider
- ticks, labels, and pointers may relate to the body, but they are not part of
  the body
- linear and circular sliders share conceptual body roles, even when the actual
  rendering differs
- the ready-made slider should expose strong body styling, but not unlimited
  freeform track illustration

### Body Roles

Recommended body roles:

- `bodyTrackBase`
- `bodyTrackFill`
- `bodySelectedRange`
- `bodyStartGap`
- `bodyEndGap`
- `bodyCenterMarker`

Role meanings:

- `bodyTrackBase`: the neutral base track or arc
- `bodyTrackFill`: the active single-value fill
- `bodySelectedRange`: the highlighted span for range or band modes
- `bodyStartGap`: optional leading gap or muted zone
- `bodyEndGap`: optional trailing gap or muted zone
- `bodyCenterMarker`: optional center or zero marker

### Body Role Presence by Value Mode

#### `single`

Most relevant roles:

- `bodyTrackBase`
- `bodyTrackFill`
- `bodyCenterMarker`

#### `range`

Most relevant roles:

- `bodyTrackBase`
- `bodySelectedRange`
- `bodyStartGap`
- `bodyEndGap`

#### `band`

Most relevant roles:

- `bodyTrackBase`
- `bodySelectedRange`
- `bodyCenterMarker`
- `bodyStartGap`
- `bodyEndGap`

This does not mean every role must be visible in every preset.
It means the body system should understand which roles matter for each mode.

### Linear Body Mapping

For linear sliders, body roles map onto a straight axis.

Recommended linear behavior:

- `bodyTrackBase` draws the full available track
- `bodyTrackFill` draws from the logical start to the current value in `single`
  mode
- `bodySelectedRange` draws between `start` and `end` in `range` and `band`
  modes
- `bodyStartGap` and `bodyEndGap` can visually separate inactive or reserved
  regions
- `bodyCenterMarker` marks the visual center or zero point when the preset wants
  it

Linear direction must still be respected:

- `ltr`
- `rtl`
- `btt`
- `ttb`

So:

- fill and selected range should resolve according to the slider's logical
  direction, not just the raw screen direction

### Circular Body Mapping

For circular sliders, body roles map onto an arc or ring.

Recommended circular behavior:

- `bodyTrackBase` draws the full available arc
- `bodyTrackFill` draws from the dial start to the current value in `single`
  mode
- `bodySelectedRange` draws the selected arc between `start` and `end`
- `bodyCenterMarker` may mark a center angle, zero point, or reference notch
- `bodyStartGap` and `bodyEndGap` may create visible entry/exit breaks or seam
  separation

Circular body rendering must respect:

- `startAngle`
- `sweepAngle`
- `direction: cw | ccw`
- `allowWrapAround`

This means:

- body spans must follow dial direction
- selected arc logic must not silently choose the visually shortest path if that
  conflicts with the slider's semantic direction model

### Seam and Gap Handling

The body system should make seam behavior explicit, especially for circular
sliders.

Recommended seam behavior:

- if wrap-around is disabled, `bodyTrackBase` should clearly indicate the arc
  start and end
- if wrap-around is enabled, `bodySelectedRange` may cross the seam while still
  preserving semantic `start` and `end` meaning
- optional `bodyStartGap` and `bodyEndGap` may be used to visually stage the
  seam instead of pretending the dial is perfectly continuous

This is useful for:

- arc dials with a visible dead zone
- circular ranges that must clearly show entry and exit points
- presets where the full 360-degree loop is not meant to look continuous

### Bipolar and Center Behavior

The body system should explicitly support bipolar and center-aware presets.

Recommended center-aware body behavior:

- `bodyCenterMarker` may indicate zero, midpoint, or neutral
- `bodyTrackFill` may grow outward from center in bipolar single-value presets
- `bodySelectedRange` may also be styled relative to center when a preset needs
  symmetrical emphasis

Recommended rule:

- the center concept belongs to the body system first
- ticks and labels may reference it, but the body owns the center marker itself

This matters for:

- pan controls
- bipolar modulation dials
- centered offset controls

### Body Styling Model

The ready-made slider editor should expose strong body styling, because this is
the main "skin" of the slider.

Recommended body controls:

- thickness
- inset
- radius
- start cap
- end cap
- base fill
- active fill
- selected-range fill
- border
- glow
- center detent marker
- seam gap visibility

Recommended additional circular controls:

- arc thickness
- inner / outer ring bias
- dial notch visibility
- seam gap size

Recommended additional linear controls:

- end-stop style
- flat vs rounded body ends
- centered fill behavior

### Shared vs Per-Role Body Styling

The body system should support:

- shared structural styling
- role-specific fills and accents

Recommended default:

- one shared geometry skeleton
- per-role colour / opacity / accent differences

Examples:

- `bodyTrackBase` and `bodySelectedRange` may share the same radius but use
  different fill colors
- `bodyCenterMarker` may use its own accent color and glow

### GUI Model for Body Editing

The body should have its own area inside `SliderEditor`.

Recommended body authoring structure:

1. `Quick Presets`
2. `Structure`
3. `Fills`
4. `Special Roles`
5. `Canvas Assist`

#### 1. Quick Presets

Recommended quick actions:

- `Flat Bar`
- `Rounded Bar`
- `Bipolar`
- `Arc Ring`
- `Dial Ring`
- `Seam Gap`

These should apply coherent body setups quickly.

#### 2. Structure

This section handles the shared geometry skeleton.

Recommended controls:

- thickness
- inset
- radius
- start cap
- end cap
- seam gap
- arc bias for circular presets

#### 3. Fills

This section handles the major visible body spans.

Recommended controls:

- base fill
- active fill
- selected-range fill
- opacity relationships
- gradient or layered fill behavior if supported by the ready-made body model

#### 4. Special Roles

This section handles optional special body features.

Recommended controls:

- center marker
- start gap
- end gap
- bipolar fill mode
- seam emphasis

#### 5. Canvas Assist

Body editing is highly visual, so canvas support is important.

Recommended behavior:

- selecting a body role highlights that role on the canvas
- changing thickness updates the preview live
- changing start angle / sweep angle updates circular body spans live
- enabling seam gaps or center markers shows them immediately
- selected range and active fill respond live during preview interaction

This is especially important for circular sliders because arc spans are much
easier to understand visually than through numeric fields alone.

### Main Tree vs Internal Tree

Recommended rule:

- body roles do not appear as ordinary sibling components in the main component
  tree

Instead:

- they remain internal slider entities
- the slider editor exposes them by semantic body role
- advanced inspection may reveal them internally, but they remain owned by the
  slider

### Generated vs Authored Body

Recommended rule:

- the body skeleton is generated from slider geometry and value mode
- users style and configure that skeleton
- users do not manually create arbitrary extra body layers in the normal
  ready-made workflow

This preserves a strong ready-made slider identity while still allowing deep
skinning within the supported body model.

### Ready-Made Body vs Component Designer

This is the key boundary.

The ready-made slider body should support:

- strong thickness and cap control
- solid or layered fills
- range spans
- bipolar behavior
- circular arc bodies
- seam gaps
- center markers

The ready-made slider body should not try to support:

- arbitrary freehand track silhouettes
- hand-authored vector track paths
- fully custom decorative overlays with no semantic role
- unlimited stacked body layers that behave like a scene graph

That is the point where the Component Designer should take over.

### Non-Goals for This Body Section

This section does not mean:

- every slider needs a complex body
- every preset must expose seam gaps or bipolar markers
- the ready-made slider must become a freeform track illustrator
- every possible visual layer belongs in the ready-made body system

It means:

- the body is a real subsystem
- body roles remain semantic and stable
- linear and circular bodies must both be handled properly
- body skinning should be rich, but still structured

## Ready-Made vs Component Designer Boundary

This section must stay sharp, because the slider family is now deliberately rich.

If the boundary is vague, two bad things happen:

- the ready-made slider slowly turns into a hidden Component Designer
- or the Component Designer ends up repeating capabilities that should have been
  solved structurally in the slider family

The distinction is not:

- ready-made = weak
- designer = real

The distinction is:

- ready-made slider family = structured, semantic, opinionated slider framework
- Component Designer = freeform construction when the semantic framework is no
  longer enough

### What Belongs in the Ready-Made Slider

The ready-made slider should absolutely include:

- linear geometry
- circular geometry
- single, range, and band value modes
- semantic body roles
- semantic pointer roles
- semantic tick sets
- semantic label roles
- shared states
- shared animations
- curated styling controls
- preset insertion
- geometry-aware preview/debug behavior

In other words:

- if a feature can still be expressed cleanly through slider semantics, it
  belongs in the ready-made slider

### What Belongs in the Component Designer

The Component Designer should take over when the user no longer wants a semantic
slider framework, but wants a custom-built control scene.

That includes:

- arbitrary SVG or path-defined tracks
- freehand geometry
- non-semantic decorative layers with no stable slider role
- hand-authored per-tick artwork
- arbitrary pointer shapes that are authored as custom art objects
- unlimited internal layer relationships
- custom motion systems that are no longer just slider state or value animation
- controls that only loosely resemble a slider

The test is:

- if the control stops being usefully describable as body + pointers + ticks +
  labels tied to slider values, it belongs in the Component Designer

### Semantic vs Freeform Is the Real Boundary

This is the most important framing rule.

Ready-made slider:

- semantic entities
- stable roles
- generated internal structure
- curated controls
- predictable runtime behavior

Component Designer:

- freeform entities
- user-defined structure
- user-defined role meaning
- open-ended layering
- open-ended motion and composition

So even a very visually rich slider can still remain a ready-made slider if:

- its structure is still semantic
- its behavior is still slider-native
- its internals are still manageable through the slider editor

### Allowed Complexity Inside the Ready-Made Slider

The ready-made slider is allowed to be sophisticated.

It can include:

- multiple tick sets
- multiple label roles
- multiple pointers
- circular seam handling
- bipolar body behavior
- shared and per-role style overrides
- range and band highlighting
- readout formatting

That is all still fine, because it remains structured.

The ready-made slider does not become "too advanced" just because it becomes
good.

### Disallowed Complexity Inside the Ready-Made Slider

The ready-made slider should not absorb complexity that breaks its semantic
model.

That includes:

- arbitrary user-authored body layers with no body role
- arbitrary user-authored pointer objects with no pointer role
- arbitrary user-authored tick objects placed one by one
- arbitrary label scene composition unrelated to slider roles
- custom path-following logic that is not just linear or circular slider travel
- mixed control metaphors inside one control, such as half-slider half-particle
  system behavior

Once that happens, the ready-made editor stops being a slider editor and starts
becoming a weak general designer.

### A Practical Decision Rule

When deciding where a feature belongs, ask:

1. Can it be described using existing slider roles?
2. Can it be expressed through curated slider controls?
3. Will it remain understandable in `SliderEditor` without turning into a raw
   scene graph?
4. Will runtime behavior still be predictable through `Behavior`, `Parts`,
   `Bindings`, `States`, and `Animations`?

If the answer is yes, it belongs in the ready-made slider.

If the answer becomes no, it belongs in the Component Designer.

### Slider Editor Responsibility

The `SliderEditor` should own:

- geometry selection
- value mode selection
- body styling
- pointer styling
- tick set configuration
- label / readout configuration
- slider-native presets

The `SliderEditor` should not own:

- arbitrary internal node creation
- arbitrary layer stacks
- arbitrary freehand track drawing
- arbitrary non-semantic visual composition

This prevents the editor UI from drifting into designer territory.

### Main Component Tree Responsibility

The main component tree should continue to think of the ready-made slider as:

- one component

Not:

- one parent plus a forest of manually managed child parts

This matters because the user experience changes dramatically if internal slider
entities start behaving like normal peer components.

Recommended rule:

- the main tree shows one slider component
- advanced inspection may reveal internal entities by semantic role
- internal entities remain owned by the slider

### Upgrade Path to Component Designer

There should eventually be a clear upgrade path:

- start with ready-made slider
- refine within semantic limits
- if the user needs to break semantic limits, move to Component Designer

Recommended future concept:

- `Convert to Custom Component`

Meaning:

- carry over the current slider as a starting structure
- then unlock freeform authoring rules

This is much better than overloading the ready-made slider with endless escape
hatches.

### Examples That Still Belong in the Ready-Made Slider

These should remain inside the ready-made slider family:

- a circular band slider with multiple tick sets and a value readout
- a linear range slider with start/end labels, highlighted range ticks, and
  custom pointer styling
- a bipolar arc slider with center marker, seam gap, and dynamic readout
- a dense studio-style meter slider with major/minor ticks and pointer-attached
  labels

These are rich, but still semantic slider configurations.

### Examples That Belong in the Component Designer

These should move to the Component Designer:

- a slider whose track is a hand-drawn irregular vector path
- a circular control with decorative orbiting ornaments unrelated to slider
  values
- a slider made from multiple custom art layers with no stable body/pointer/tick
  roles
- a control where each tick is manually illustrated and positioned uniquely
- a control that mixes slider behavior with freeform animated scene elements

Those are no longer just slider variants. They are custom components.

### Non-Goals for This Boundary Section

This section does not mean:

- the ready-made slider should stay visually plain
- the Component Designer should be required for circular sliders
- rich ticks or labels automatically imply designer territory
- every advanced request should be deferred to future tooling

It means:

- richness is allowed
- semantic structure is the limit
- freeform construction is the handoff point

## Behavior Section Refinement

The existing `Behavior` section is the right place for interaction semantics,
but it now needs to be treated as a strict slider contract rather than a loose
collection of fields.

For the slider family, `Behavior` should answer these questions:

- what kind of slider is this
- how many active values does it have
- how do values travel
- how does input choose and move handles
- what numeric rules constrain the control

### Slider-Specific Behavior Rules

For slider-family controls, these fields should effectively be fixed:

- `family = range`
- `role = slider`

Recommended rule:

- the editor may still store these fields because the shared interaction system
  uses them
- but for the slider family they should not behave like open-ended user choices

In other words:

- a ready-made slider should not casually become a `toggle` or `button` by
  changing `Behavior.role`

### Value Type Restriction

Sliders should remain numeric controls.

Recommended slider-specific `valueType` values:

- `float`
- `int`

Recommended rule:

- `bool` and `enum` do not belong in the slider family

Those belong to other control families, even if they visually resemble a slider
in some UI experiments.

### Canonical Behavior Groups

The cleanest way to define the slider contract is to group fields by purpose.

Recommended behavior groups:

1. `Identity`
2. `Geometry`
3. `Value Model`
4. `Interaction`
5. `Constraints`
6. `Emission`

### 1. Identity

Recommended fields:

- `family`
- `role`
- `valueType`
- `geometry`
- `valueMode`

Recommended values:

- `family = range`
- `role = slider`
- `geometry = linear | circular`
- `valueMode = single | range | band`

### 2. Geometry

Recommended geometry fields:

- `geometry`
- `orientation`
- `direction`
- `startAngle`
- `sweepAngle`
- `allowWrapAround`

Field meanings:

- `geometry`: selects `linear` or `circular`
- `orientation`: applies only to linear sliders
- `direction`: travel direction for values
- `startAngle`: start of circular arc
- `sweepAngle`: active circular sweep
- `allowWrapAround`: whether circular travel may cross the seam

Recommended values:

- linear `orientation`: `horizontal | vertical`
- linear `direction`: `ltr | rtl | btt | ttb`
- circular `direction`: `cw | ccw`

Recommended rule:

- fields irrelevant to the current geometry stay hidden in the editor, but their
  meaning remains defined by the contract

### 3. Value Model

Recommended value fields:

- `min`
- `max`
- `step`
- `defaultCurrentValue`
- `defaultStartValue`
- `defaultEndValue`
- `centerValue`

Field meanings:

- `min` and `max`: outer numeric domain
- `step`: step size for snapping and keyboard / wheel movement
- `defaultCurrentValue`: canonical default for the `current` role
- `defaultStartValue`: canonical default for the `start` role
- `defaultEndValue`: canonical default for the `end` role
- `centerValue`: semantic center reference for bipolar or center-aware behavior

Recommended rule:

- `defaultCurrentValue` should be the canonical slider field
- `defaultValue` may remain as a compatibility alias during migration for
  `single` sliders, but new slider authoring should write `defaultCurrentValue`

### 4. Interaction

Recommended interaction fields:

- `keyboardEnabled`
- `focusable`
- `dragEnabled`
- `wheelEnabled`
- `trackClickMode`
- `activeHandlePolicy`

Field meanings:

- `keyboardEnabled`: arrow/home/end/page control support
- `focusable`: whether the slider can receive focus
- `dragEnabled`: whether pointers can be dragged directly
- `wheelEnabled`: whether wheel input changes the active value
- `trackClickMode`: what happens when the user clicks the body instead of a
  pointer
- `activeHandlePolicy`: how the active handle is chosen

Recommended `trackClickMode` values:

- `jumpActiveHandle`
- `moveNearestHandle`
- `pageTowardPointer`

Recommended `activeHandlePolicy` values:

- `nearest`
- `lastUsed`
- `currentFirst`
- `startFirst`
- `endFirst`

### 5. Constraints

Recommended constraint fields:

- `snapToStep`
- `snapToTicks`
- `allowHandleCross`
- `centerDetent`
- `centerDetentStrength`

Field meanings:

- `snapToStep`: snap to the numeric `step`
- `snapToTicks`: snap to active tick-derived stops when relevant
- `allowHandleCross`: whether semantic handles may pass each other
- `centerDetent`: whether the slider should resist or attract near center
- `centerDetentStrength`: the intensity of that center behavior

Recommended rule:

- `allowWrapAround` belongs under geometry, not constraints, because it is
  fundamentally about circular travel semantics

### 6. Emission

Recommended emission fields:

- `emitValueChange`
- `emitValueCommit`
- `emitStateChange`
- `emitActiveHandleChange`

Field meanings:

- `emitValueChange`: emit when effective values change, typically continuously
  during drag as resolved values update
- `emitValueCommit`: emit when a value set is committed, such as pointer
  release, track-click completion, direct text-field confirmation, or form
  reset
- `emitStateChange`: emit when hover/drag/focus/etc. states change
- `emitActiveHandleChange`: emit when focus moves between `start`, `current`,
  and `end`

This last field is worth adding because multi-value sliders care about active
handle changes in a way single-value sliders do not.

### Accessibility and Assistive Technology

The ready-made slider must generate a usable accessibility tree, not just a
usable visual tree.

Recommended accessibility model:

- `single` sliders expose one accessible slider control
- `range` and `band` sliders expose one labelled group plus one focusable slider
  control per active pointer role
- `pointerStart`, `pointerCurrent`, and `pointerEnd` remain internal semantic
  roles in the main component tree, but they should map cleanly to the
  accessible focus/value controls

Recommended screen-reader rules:

- web/runtime mappings should expose slider semantics such as `role="slider"`,
  `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-valuetext`
- when handle crossing is disallowed, each accessible handle should announce
  its current legal movement range, not just the global domain
- `labelValue` should usually feed `aria-valuetext` or `aria-describedby`,
  rather than acting as a constantly chatty live region
- if an explicit live announcement is needed, it should be polite and tied to
  committed changes rather than firing on every drag frame

Recommended keyboard-focus rules:

- default multi-value behavior is one sequential tab stop per active pointer
  role
- `Tab` and `Shift+Tab` move between focusable handles
- arrow/home/end/page keys adjust the focused handle
- pointer or touch interaction should update the active handle so keyboard
  continuation stays on the same semantic role

Recommended system-preference rules:

- reduced-motion preference should suppress non-essential slider animation and
  commit flourishes
- high-contrast preference should enforce visible body edges, pointer outlines,
  focus indication, and readable label contrast even if the authored preset is
  subtle

### Canonical Field List

Recommended canonical slider behavior fields:

| Field | Group | Notes |
| --- | --- | --- |
| `family` | Identity | fixed to `range` for sliders |
| `role` | Identity | fixed to `slider` for sliders |
| `valueType` | Identity | `float` or `int` |
| `geometry` | Identity / Geometry | `linear` or `circular` |
| `valueMode` | Identity / Value Model | `single`, `range`, `band` |
| `orientation` | Geometry | linear only |
| `direction` | Geometry | linear or circular, geometry-specific values |
| `startAngle` | Geometry | circular only |
| `sweepAngle` | Geometry | circular only |
| `allowWrapAround` | Geometry | circular seam behavior |
| `min` | Value Model | outer minimum |
| `max` | Value Model | outer maximum |
| `step` | Value Model | numeric increment |
| `defaultCurrentValue` | Value Model | canonical current default |
| `defaultStartValue` | Value Model | start default |
| `defaultEndValue` | Value Model | end default |
| `centerValue` | Value Model | semantic center reference |
| `keyboardEnabled` | Interaction | keyboard support |
| `focusable` | Interaction | focus behavior |
| `dragEnabled` | Interaction | direct dragging |
| `wheelEnabled` | Interaction | wheel adjustment |
| `trackClickMode` | Interaction | track click policy |
| `activeHandlePolicy` | Interaction | active-handle resolution |
| `snapToStep` | Constraints | step snapping |
| `snapToTicks` | Constraints | tick snapping |
| `allowHandleCross` | Constraints | crossing policy |
| `centerDetent` | Constraints | center behavior enable |
| `centerDetentStrength` | Constraints | center behavior amount |
| `emitValueChange` | Emission | runtime output |
| `emitValueCommit` | Emission | commit-phase runtime output |
| `emitStateChange` | Emission | runtime output |
| `emitActiveHandleChange` | Emission | runtime output |

### Validation Rules

The slider contract should also define validation rules explicitly.

Recommended validation rules:

- `min < max`
- `step > 0`
- `defaultCurrentValue` must be inside `[min, max]`
- `defaultStartValue` must be inside `[min, max]`
- `defaultEndValue` must be inside `[min, max]`
- `centerValue` should usually be inside `[min, max]`
- circular `sweepAngle` should be greater than `0` and less than or equal to
  `360`

Additional value-mode rules:

- `single`: only `defaultCurrentValue` is required
- `range`: `defaultStartValue` and `defaultEndValue` are required
- `band`: all three defaults are required

If `allowHandleCross` is false:

- `range`: `defaultStartValue <= defaultEndValue`
- `band`: `defaultStartValue <= defaultCurrentValue <= defaultEndValue`

If `allowWrapAround` is true for circular `range` or `band` sliders:

- the editor may allow seam-crossing defaults
- but their stored semantic roles must remain stable

### Step, Domain, and Tick Edge Cases

Slider math needs explicit rules for the classic awkward cases.

Recommended rules:

- if `step` does not evenly divide `[min, max]`, exact `min` and exact `max`
  should still be reachable
- stepped progression should derive from `min`, even if that means the final
  interval before `max` is shorter than `step`
- visual tick distribution may be independent from value snapping unless the
  preset explicitly ties them together
- if a uniform tick count does not align with step positions, the editor should
  warn rather than silently rewriting values or tick placement
- if `snapToStep` and `snapToTicks` are both enabled and their stops disagree,
  step-aligned legal values remain authoritative unless the preset declares an
  explicit custom snap source

### What Should Be Derived, Not Stored

Several useful runtime values should not live permanently inside `Behavior`.

These should be derived:

- normalized values
- span values
- midpoint values
- active handle name
- dirty state
- resolved pointer angles
- resolved selected arc span
- nearest tick resolution

Recommended rule:

- `Behavior` stores semantics and policies
- runtime helpers derive current geometry and interaction results

This keeps `Behavior` clean and avoids mixing state with definition.

### Geometry-Specific Editor Behavior

The `Behavior` editor for sliders should be conditional, not overwhelming.

Recommended behavior:

- when `geometry = linear`, show `orientation` and linear `direction`
- when `geometry = circular`, show `startAngle`, `sweepAngle`, circular
  `direction`, and `allowWrapAround`
- when `valueMode = single`, hide irrelevant start/end defaults
- when `valueMode = range`, show start/end defaults
- when `valueMode = band`, show all three defaults and center-aware options

This keeps the contract rich without making the UI noisy.

### Locale-Aware Direction Defaults

Locale can influence insertion defaults, but it should not rewrite authored
behavior behind the user's back.

Recommended rules:

- newly inserted horizontal slider presets may choose locale-aware defaults such
  as `ltr` in LTR UI contexts and `rtl` in RTL UI contexts
- once authored, `Behavior.direction` stays explicit and should not silently
  flip when editor locale changes
- circular clockwise/counterclockwise direction should never auto-flip just
  because the UI language changes

### Form Integration and Reset Semantics

Sliders often live inside larger forms and inspector flows.

Recommended rules:

- dirty state is derived by comparing current semantic values against
  `defaultCurrentValue`, `defaultStartValue`, and `defaultEndValue`
- dirty should be available per semantic role and as one aggregate `isDirty`
  flag
- form reset should restore semantic values to their authored defaults without
  changing semantic roles
- reset may animate through normal slider transitions when motion is allowed,
  but should jump directly when reduced motion is active
- reset should emit the same change/commit contract as any other programmatic
  value write
- reset should not silently remap focus order or swap active-handle meaning

### Non-Goals for This Behavior Section

This section does not mean:

- every slider must expose every field in basic mode
- compatibility aliases such as `defaultValue` should remain primary forever
- `Behavior` should store resolved runtime state
- the generic interaction model should become slider-only

It means:

- the slider family now has a clear semantic contract
- fields should stop drifting by implementation convenience
- geometry, value model, and interaction policy are now explicitly separated

## Bindings Model Refinement

The binding system must understand multi-value sliders cleanly, but it must not
turn into a scripting language.

Bindings should stay responsible for:

- taking stable semantic signals
- mapping them into stable semantic targets
- driving layout and visual behavior predictably

Bindings should not be responsible for:

- inventing slider geometry math on the fly
- resolving circular seam logic themselves
- deciding handle semantics
- formatting arbitrary UI logic that belongs to labels/readout systems

### Binding Principles

Recommended principles:

- bindings consume semantic slider signals
- bindings write to semantic internal entities
- geometry-heavy calculations should be derived before binding application
- bindings should stay inspectable and predictable in the editor
- slider bindings should favor strong presets and generated defaults over manual
  raw setup

### Canonical Signal Groups

The slider family needs a clear signal vocabulary.

Recommended signal groups:

1. `Value Signals`
2. `Range Signals`
3. `Geometry Signals`
4. `State Signals`
5. `Handle Signals`

### 1. Value Signals

These are the primary numeric sources.

Keep:

- `value.raw`
- `value.normalized`

Recommended rule:

- for compatibility, these should resolve to the current effective value of the
  control
- for `single`, they map to `current`
- for `range` and `band`, they should usually alias to `current` only when a
  control-level current value meaning exists

Canonical value signals:

- `value.current.raw`
- `value.current.normalized`
- `value.start.raw`
- `value.start.normalized`
- `value.end.raw`
- `value.end.normalized`

### 2. Range Signals

These are especially important for `range` and `band`.

Recommended range signals:

- `value.span.raw`
- `value.span.normalized`
- `value.midpoint.raw`
- `value.midpoint.normalized`

Meaning:

- `span` describes the size of the selected range
- `midpoint` describes the center of a selected range or band window

These are useful for:

- selected-range body spans
- range-aware tick highlighting
- centered label placement
- emphasis effects tied to the middle of a selection

### 3. Geometry Signals

Bindings should be able to consume geometry-aware outputs, but those outputs
should be derived by slider geometry helpers first.

Recommended geometry-aware signals:

- `geometry.current.position`
- `geometry.start.position`
- `geometry.end.position`
- `geometry.current.angle`
- `geometry.start.angle`
- `geometry.end.angle`
- `geometry.range.startAngle`
- `geometry.range.endAngle`
- `geometry.range.sweep`

Recommended interpretation:

- `position` is the resolved progress along the active body geometry
- `angle` is the resolved circular handle angle
- `range.*` signals describe the resolved selected arc or span

Important rule:

- bindings consume these signals
- bindings do not compute them

That math belongs in geometry utilities, not in ad hoc binding graphs.

### 4. State Signals

Recommended state sources:

- `state.hover`
- `state.pressed`
- `state.dragging`
- `state.focused`
- `state.disabled`

These are useful for:

- pointer emphasis
- label emphasis
- tick highlighting intensity
- range/body accent behavior

### 5. Handle Signals

The slider family also needs active-handle awareness.

Recommended handle-related signals:

- `state.activeHandle`
- `state.activeHandleIsStart`
- `state.activeHandleIsCurrent`
- `state.activeHandleIsEnd`

These are useful for:

- per-handle pointer emphasis
- label emphasis for the edited handle
- contextual styling during multi-value interaction

### Canonical Binding Sources

Recommended canonical slider binding sources:

| Source | Meaning |
| --- | --- |
| `value.current.raw` | Raw `current` value |
| `value.current.normalized` | Normalized `current` value |
| `value.start.raw` | Raw `start` value |
| `value.start.normalized` | Normalized `start` value |
| `value.end.raw` | Raw `end` value |
| `value.end.normalized` | Normalized `end` value |
| `value.span.raw` | Raw selected span |
| `value.span.normalized` | Normalized selected span |
| `value.midpoint.raw` | Raw midpoint of selected span |
| `value.midpoint.normalized` | Normalized midpoint of selected span |
| `geometry.current.position` | Resolved geometric current position |
| `geometry.start.position` | Resolved geometric start position |
| `geometry.end.position` | Resolved geometric end position |
| `geometry.current.angle` | Resolved current handle angle |
| `geometry.start.angle` | Resolved start handle angle |
| `geometry.end.angle` | Resolved end handle angle |
| `geometry.range.sweep` | Resolved selected arc sweep |
| `state.hover` | Hover state |
| `state.pressed` | Pressed state |
| `state.dragging` | Dragging state |
| `state.focused` | Focus state |
| `state.disabled` | Disabled state |
| `state.activeHandle` | Active handle semantic role |

### Binding Targets

Bindings should target semantic entities, not arbitrary mystery paths whenever
possible.

Recommended target groups:

- `Body Targets`
- `Pointer Targets`
- `Tick Targets`
- `Label Targets`

#### Body Targets

Examples:

- `Parts.bodyTrackFill.*`
- `Parts.bodySelectedRange.*`
- `Parts.bodyCenterMarker.*`

Typical uses:

- active fill width
- active fill sweep
- selected-range visibility
- selected-range opacity

#### Pointer Targets

Examples:

- `Parts.pointerCurrent.*`
- `Parts.pointerStart.*`
- `Parts.pointerEnd.*`

Typical uses:

- pointer position
- pointer rotation
- pointer emphasis scale
- pointer opacity

#### Tick Targets

Examples:

- `Parts.tickMajor_*.*`
- `Parts.tickValue_*.*`
- `Parts.tickRange_*.*`

Typical uses:

- opacity
- highlight intensity
- color shifts
- scale or thickness emphasis

#### Label Targets

Examples:

- `Parts.labelCurrent.*`
- `Parts.labelValue.*`
- `Parts.labelStart.*`

Typical uses:

- opacity
- positional offset
- emphasis scale

Recommended rule:

- label text content itself should usually be handled by the label subsystem
  rather than raw general-purpose bindings

That keeps the binding system numeric and visual, rather than turning it into a
string-templating engine.

### Recommended Binding Modes

The slider family does not need infinite binding logic types.

Recommended modes:

- `range`
- `boolean`
- `enum`

Recommended use:

- `range` for numeric remapping
- `boolean` for visibility/emphasis toggles
- `enum` for handle-role-sensitive switching where needed

This is enough for the slider family if the upstream signals are good.

### What Geometry Helpers Should Derive First

Before bindings run, geometry helpers should already resolve:

- pointer positions
- pointer angles
- selected span size
- selected span midpoint
- selected arc sweep
- seam-aware circular range interpretation

This is important.

If bindings are asked to solve these problems themselves, the system becomes
fragile and impossible to reason about.

### Default Binding Responsibilities by Entity Type

Recommended generated defaults:

- body bindings handle fill size, selected span size, and center-relative fill
  behavior
- pointer bindings handle pointer placement and optional role emphasis
- tick bindings handle highlight response and value-linked emphasis
- label bindings handle spatial emphasis only, while content stays in the label
  subsystem

This gives a good split of concerns.

### Example Binding Intents

Examples:

- `value.current.normalized -> Parts.bodyTrackFill` for single-slider fill
- `value.start.normalized` and `value.end.normalized -> Parts.bodySelectedRange`
  for range/body span
- `geometry.current.angle -> Parts.pointerCurrent` for circular pointer
  placement
- `state.activeHandleIsCurrent -> Parts.pointerCurrent` for active-pointer
  emphasis
- `value.span.normalized -> Parts.tickRange_*` for range-aware tick emphasis

### GUI Model for Bindings

Bindings are still an advanced section.

Recommended GUI approach:

- keep strong generated defaults
- show the resolved binding set for the current slider
- allow advanced editing only when needed

Recommended authoring model inside `BindingsEditor`:

1. `Generated Defaults`
2. `Binding List`
3. `Selected Binding`
4. `Debug Preview`

#### 1. Generated Defaults

Show:

- which bindings were automatically created by the slider system
- what role each one serves

Allow:

- reset to defaults
- regenerate for current geometry/value mode

#### 2. Binding List

Show bindings grouped by target area:

- `Body`
- `Pointers`
- `Ticks`
- `Labels`

This is more understandable than a flat list of raw binding names.

#### 3. Selected Binding

When a binding is selected, show:

- source
- mode
- target
- range mapping values
- boolean behavior
- invert / clamp / round

#### 4. Debug Preview

Recommended debug output:

- current source value
- mapped output value
- current target path
- whether the binding is generated or user-edited

This is especially useful for circular and multi-value sliders.

### Generated vs Manual Bindings

Recommended rule:

- the slider family should generate most useful bindings automatically
- users may inspect and refine them
- users should not be forced to build the core slider from raw bindings by hand

This is one of the biggest quality-of-life requirements for the ready-made
slider.

### Non-Goals for This Bindings Section

This section does not mean:

- every slider user should need to understand the binding graph
- label text generation should become a freeform binding language
- geometry logic should be rebuilt through bindings
- bindings should become a substitute for scripting

It means:

- slider bindings now have a clear semantic vocabulary
- geometry-aware outputs are first-class
- targets should remain understandable and role-based

## States and Animations

The slider family should still use the shared interactive runtime, but it now
needs a clearer state and transition contract because the slider has multiple
subsystems:

- body
- pointers
- ticks
- labels
- readout

This section defines:

- which states the slider family should recognize
- which entity groups should react to those states
- which transitions should be generated by default
- where slider-specific behavior ends and the shared animation system begins

### Core Principle

The key rule remains:

- use the shared state system
- use the shared animation system
- do not invent a slider-only animation engine

What changes here is not the engine.
What changes is the slider-specific state vocabulary and the recommended default
targets for those states.

### State Principles

Recommended principles:

- states should remain semantic and predictable
- the same state may affect multiple slider subsystems differently
- active-handle awareness is a first-class slider concern
- state logic should be derived from slider interaction semantics, not duplicated
  in ad hoc per-part rules
- generated default states should cover the common slider experience before any
  manual tweaking

### Core Slider States

Recommended default states:

- `Hover`
- `Pressed`
- `Dragging`
- `Focused`
- `Disabled`
- `ActiveHandleStart`
- `ActiveHandleCurrent`
- `ActiveHandleEnd`

Recommended meanings:

- `Hover`: the slider is being pointed at
- `Pressed`: a press has occurred but may not yet be a drag
- `Dragging`: an active pointer drag is in progress
- `Focused`: the slider has keyboard focus
- `Disabled`: the slider is disabled
- `ActiveHandleStart`: the `start` handle is the active semantic handle
- `ActiveHandleCurrent`: the `current` handle is the active semantic handle
- `ActiveHandleEnd`: the `end` handle is the active semantic handle

### Why Active-Handle States Matter

This is one of the biggest differences between sliders and simpler controls.

For multi-value sliders:

- the user is not just interacting with "the slider"
- the user is interacting with one active semantic handle inside the slider

That means the system should be able to express:

- "the current handle is active"
- "the end handle is active"
- "the start handle is active"

without resorting to fragile raw patches everywhere.

### Optional Extended States

The core state vocabulary above should be enough for the first strong version.

Optional future states, if needed later:

- `RangeHot`
- `CenterDetentNear`
- `WrapSeamNear`
- `KeyboardAdjusting`

Recommended rule:

- do not add these to the initial default state set unless real implementation
  pressure justifies them

The base state set should stay strong but restrained.

### State Scopes

States should be able to affect different slider entity groups differently.

Recommended state scopes:

- root control scope
- body scope
- pointer scope
- tick scope
- label scope

Examples:

- `Hover` may slightly brighten the body but enlarge the active pointer more
  strongly
- `Dragging` may intensify pointer emphasis, selected-range fill, and range
  ticks together
- `Focused` may accent labels or readout differently from pointers

### Recommended Default Reactions by Entity Group

#### Body

Recommended default reactions:

- `Hover`: subtle lift or contrast increase
- `Pressed`: subtle compression or fill tightening
- `Dragging`: stronger active fill or selected range emphasis
- `Focused`: clear but controlled focus accent
- `Disabled`: reduced opacity and contrast

#### Pointers

Recommended default reactions:

- `Hover`: slightly enlarge or brighten the hovered / active pointer
- `Pressed`: slight compression or stronger border
- `Dragging`: strongest emphasis state
- `Focused`: keyboard-focus accent
- `Disabled`: dim and reduce glow
- `ActiveHandle*`: keep the active handle visually distinct from inactive ones

#### Ticks

Recommended default reactions:

- `Hover`: optional subtle increase in relevant tick visibility
- `Dragging`: value-linked or range-linked ticks may intensify
- `Disabled`: soften or mute tick contrast
- `ActiveHandle*`: emphasize ticks associated with the active handle or span

#### Labels and Readout

Recommended default reactions:

- `Hover`: optional subtle readout lift
- `Dragging`: stronger readout emphasis
- `Focused`: stronger value/readout clarity
- `Disabled`: reduced opacity
- `ActiveHandle*`: handle-linked labels may emphasize the active role

### State Evaluation Rules

Recommended rules:

- `Hover`, `Pressed`, `Dragging`, `Focused`, and `Disabled` derive from shared
  interaction state
- `ActiveHandleStart`, `ActiveHandleCurrent`, and `ActiveHandleEnd` derive from
  active-handle resolution
- active-handle states should be mutually exclusive
- `Dragging` should imply there is an active handle, but the system should still
  name that active handle explicitly

### State Priority

The slider family should define a sensible default priority order.

Recommended priority:

1. `Disabled`
2. `Dragging`
3. `Pressed`
4. `Focused`
5. `Hover`
6. `ActiveHandleStart`
7. `ActiveHandleCurrent`
8. `ActiveHandleEnd`

Recommended interpretation:

- `Disabled` wins globally
- `Dragging` is stronger than `Pressed`
- `Pressed` is stronger than passive `Hover`
- active-handle states should refine the current interactive context, not
  replace it entirely

This means:

- while dragging `pointerCurrent`, the slider can simultaneously be in
  `Dragging` and `ActiveHandleCurrent`

That is the behavior we want.

### Animation Principles

Animations should stay transition-based and semantic.

Recommended principles:

- animate role changes, not arbitrary scene effects
- generate useful defaults
- allow advanced tuning in the shared animation editor
- do not make animation authoring mandatory to get a polished slider

### Recommended Animation Targets

Recommended animation targets:

- pointer movement
- fill / selected range movement
- tick highlighting
- label emphasis
- readout emphasis

Recommended target groupings:

- `Body Motion`
- `Pointer Motion`
- `Tick Emphasis`
- `Label Emphasis`

### Body Animation Defaults

Recommended defaults:

- smooth active fill updates
- smooth selected-range updates
- gentle opacity / accent transitions for hover and focus

Linear examples:

- width transitions
- offset transitions

Circular examples:

- arc sweep transitions
- arc start/end transitions

### Pointer Animation Defaults

Recommended defaults:

- pointer position smoothing
- pointer scale emphasis on hover / drag
- pointer focus accent transitions

For circular sliders:

- pointer angle changes should transition smoothly

For multi-value sliders:

- each pointer should animate independently

### Tick Animation Defaults

Recommended defaults:

- highlight fade in/out
- intensity changes for value-linked or range-linked tick sets

Recommended rule:

- do not over-animate ticks by default

Tick motion should support clarity, not noise.

### Label and Readout Animation Defaults

Recommended defaults:

- subtle opacity transitions
- subtle scale or emphasis transitions
- readout emphasis during drag or active-handle changes

Recommended rule:

- label movement should usually remain restrained
- content changes may occur live, but emphasis animation should stay light

### Circular Animation Considerations

Circular sliders need a few explicit notes:

- angle-based pointer movement should animate through the resolved dial path
- seam-aware circular range changes must respect wrap rules
- selected arc transitions must not visually jump the wrong direction across the
  dial

Recommended rule:

- geometry helpers resolve the correct path first
- animations then smooth that resolved result

This keeps circular behavior coherent.

### Generated Default Animation Set

The slider family should generate a useful default animation set automatically.

Recommended generated defaults:

- pointer move
- body fill move
- selected range move
- pointer emphasis
- readout emphasis

Recommended rule:

- the default set should feel polished without requiring manual animation authoring
- users can later inspect, tune, or replace these in the shared animation tools

### GUI Model for States and Animations

The slider still uses the shared `States` and `Animations` tabs, but the slider
family should provide better starting structure there.

Recommended `States` experience:

- generated slider-specific default states
- clear active-handle state entries
- debug-friendly naming

Recommended `Animations` experience:

- generated slider-specific transition entries
- clear grouping by body / pointers / ticks / labels
- ability to reset to slider defaults

### Debug and Preview Expectations

Preview and debug should expose:

- active state list
- active handle
- dragging vs pressed distinction
- resolved animation targets
- circular seam / direction correctness during transitions

This is especially important for:

- circular range sliders
- circular band sliders
- any state setup that emphasizes active-handle changes

### Non-Goals for This Section

This section does not mean:

- every slider needs dramatic motion
- every entity group must animate visibly
- slider interactions should require custom animation authoring
- the shared animation system should be replaced

It means:

- the slider family now has a clear state vocabulary
- active-handle behavior is first-class
- generated defaults should produce a polished interaction baseline

## Authoring UX

The slider family now has enough structure that the editor UX needs to be
treated as a product in its own right, not just as a pile of property groups.

The goal is:

- make the slider powerful
- keep it understandable
- keep the main flow fast
- keep deep tuning available without forcing it on everyone

### Core UX Principle

The editor should feel like:

- one coherent slider workflow

Not like:

- a set of unrelated micro-editors for body, pointers, ticks, labels, and
  readout

That means `SliderEditor` should guide the user through the natural authoring
sequence:

1. what kind of slider is this
2. how does it behave
3. what does its body look like
4. how do its handles look
5. what scale support does it have
6. how does it label and read out values

### Dedicated Slider Tab

Add a dedicated `Slider` tab in the Properties Panel.

That tab should exist for any control whose `Behavior.role === slider`.

This tab is the main authoring surface for the ready-made slider family.

### Why a Dedicated Slider Tab

Because slider authoring is entity-based, not just root-section based.

`Button` can lean on shared root sections much more directly.

`Slider` cannot, because:

- body
- pointers
- ticks
- labels
- readout

all need controlled exposure before the Component Designer exists.

The generic tabs still remain valuable:

- `Behavior`
- `States`
- `Bindings`
- `Animations`

That gives the right split:

- `Slider` tab = curated authoring
- generic tabs = deep tuning

### Recommended SliderEditor Structure

The `Slider` tab should not just be a flat stack.

Recommended top-level sections:

1. `Preset Bar`
2. `Type`
3. `Geometry`
4. `Values`
5. `Body`
6. `Pointers`
7. `Ticks`
8. `Labels`
9. `Readout`
10. `Canvas Assist`

### 1. Preset Bar

The first thing users should be able to do is get to a strong starting point.

Recommended preset actions:

- `Linear`
- `Vertical`
- `Range`
- `Band`
- `Circular`
- `Circular Range`
- `Circular Band`
- `Bipolar`
- `Studio`
- `Minimal`

Recommended behavior:

- presets configure multiple subsystems at once
- presets are starting points, not locked templates
- applying a preset should clearly state which major areas changed

This is the fastest way to avoid overwhelming new users.

### 2. Type

This section answers:

- what slider family variant is this

Recommended controls:

- `geometry`
- `valueMode`
- `valueType`

Recommended UI:

- compact segmented or chip-style selectors

This is the first structural decision and should sit near the top.

### 3. Geometry

This section answers:

- how values travel visually

Recommended controls for linear:

- `orientation`
- `direction`

Recommended controls for circular:

- `startAngle`
- `sweepAngle`
- `direction`
- `allowWrapAround`

Recommended rule:

- only show geometry-relevant controls for the chosen geometry

### 4. Values

This section answers:

- what numeric domain the slider uses
- which active values exist
- what the defaults are

Recommended controls:

- `min`
- `max`
- `step`
- `defaultCurrentValue`
- `defaultStartValue`
- `defaultEndValue`
- `centerValue`
- `allowHandleCross`
- `snapToStep`
- `snapToTicks`
- `centerDetent`
- `centerDetentStrength`

Recommended rule:

- this should feel like the control's semantic setup section, not its visual
  section

### 5. Body

This section answers:

- what the slider skin looks like

Recommended structure:

- `Quick Presets`
- `Structure`
- `Fills`
- `Special Roles`

This section should expose the main visual skeleton without requiring users to
think in low-level generated parts.

### 6. Pointers

This section answers:

- how the active handles look and behave visually

Recommended structure:

- `Quick Presets`
- `Shared Pointer Style`
- `Role Selector`
- `Selected Role`

Recommended rule:

- users edit semantic roles, not anonymous handles

### 7. Ticks

This section answers:

- what scale support and value markers the slider shows

Recommended structure:

- `Quick Presets`
- `Shared Tick Style`
- `Set Selector`
- `Selected Set`

Recommended rule:

- users author tick sets, not individual ticks

### 8. Labels

This section answers:

- what textual support the slider shows

Recommended structure:

- `Quick Toggles`
- `Shared Style`
- `Role Selector`
- `Selected Role`

Recommended rule:

- users edit semantic label roles, not loose label objects

### 9. Readout

Even though the readout is part of the label subsystem, it deserves its own
visible area in the editor because users think of it as a distinct feature.

Recommended reason:

- many users will look specifically for "value display"
- hiding it only inside the broader label system makes it harder to discover

Recommended controls:

- readout on/off
- content mode
- formatting
- fixed vs attached placement
- shared-style inheritance
- emphasis behavior during drag/focus

Recommended rule:

- `labelValue` remains the semantic role
- `Readout` is the friendlier authoring label in the UI

### 10. Canvas Assist

The properties panel alone is not enough for a control this visual.

The slider editor should always be paired with strong canvas assistance.

Recommended canvas assistance:

- clicking body roles selects body editing
- clicking a pointer selects that pointer role
- clicking ticks selects the tick set
- clicking a label selects the label role
- hover highlights the selected semantic entity
- geometry changes preview live
- range/band interaction updates preview live
- circular seam and direction behavior remain visible during editing

Without this, circular and multi-value sliders become much harder to author.

### Basic vs Advanced Mode

The slider editor should support two depth levels:

- `Basic`
- `Advanced`

Basic mode should cover:

- presets
- geometry
- values
- core body style
- core pointer style
- basic tick setup
- basic label and readout setup

Advanced mode should expose:

- per-role overrides
- per-set tick control
- seam handling nuance
- center/bipolar nuance
- role-level label and pointer tuning

This keeps the default experience approachable without weakening the system.

### Progressive Disclosure Rules

The editor should only reveal complexity when it becomes relevant.

Recommended rules:

- hide start/end value controls for `single`
- hide current-only pointer controls when there is no `current` role
- hide circular controls for linear geometry
- hide wrap controls unless circular geometry is active
- hide range/band-specific tick sets when `valueMode` makes them irrelevant
- hide label roles that do not apply to the current slider mode

This is critical for keeping the editor readable.

### Shared vs Role-Level Editing Pattern

Across body, pointers, ticks, and labels, the editor should follow one common
pattern:

1. shared defaults first
2. role/set selector second
3. focused per-role inspector third

This repeated structure is important because:

- users learn it once
- then it applies everywhere in the slider editor

That consistency will matter a lot in a complex control family.

### Relationship to Generic Tabs

The `Slider` tab should cover 80-90% of authoring needs.

The generic tabs remain for:

- `Behavior`: deep semantic tuning and validation-sensitive fields
- `States`: visual state overrides
- `Bindings`: advanced mapping inspection/tuning
- `Animations`: transition refinement

Recommended rule:

- the slider tab should not duplicate everything from the generic tabs
- it should provide the curated high-level workflow

### Main Component Tree Behavior

From the user's point of view, the slider should still behave as:

- one component

Not:

- a component plus many ordinary child controls

So the main tree should show:

- the slider as one item

And the slider editor should internally expose:

- body roles
- pointer roles
- tick sets
- label roles

This preserves both clarity and power.

### Recommended First-Run Flow

A good first-run authoring experience should feel like this:

1. insert a slider preset
2. choose linear or circular
3. choose single / range / band
4. set numeric values
5. adjust body style
6. adjust pointer style
7. turn ticks on if needed
8. turn labels/readout on if needed
9. refine states/animations only if desired

If the editor supports this flow well, the system will feel intentionally
designed rather than technically assembled.

### Non-Goals for This UX Section

This section does not mean:

- every subsystem needs its own top-level app panel
- users should be forced through a wizard every time
- the slider editor should duplicate the entire component designer
- advanced users should lose access to low-level tuning

It means:

- the slider editor needs a real authored workflow
- subsystem complexity must be organized, not hidden
- the UI should teach the slider model by how it is laid out

## Runtime / Rendering Model

The runtime model is where the semantic slider definition turns into an actual
rendered control.

This section should answer:

- what data is stored
- what data is generated
- what data is derived at runtime
- in what order that derived data is resolved
- how the final render tree is assembled

### Core Principle

The runtime should still resolve from:

- `Behavior`
- `Parts`
- `Bindings`
- `States`
- `Animations`

But those sections should not all do the same job.

Recommended split:

- `Behavior` defines semantics and policies
- `Parts` stores semantic internal entities
- geometry helpers derive resolved placement/math
- `Bindings` map resolved signals into visual targets
- `States` patch semantic entities by interaction state
- `Animations` smooth the transitions between resolved values

### Stored vs Generated vs Derived

The runtime model should clearly separate these categories.

#### Stored

Stored data should include:

- semantic behavior fields
- semantic part definitions
- generated default bindings
- generated default states
- generated default animations
- user-authored overrides

#### Generated

Generated data should include:

- body parts
- pointer parts
- tick parts
- label parts
- sensible default bindings
- sensible default states
- sensible default animations

These should be regenerated when:

- geometry changes
- value mode changes
- a preset is applied
- a subsystem is reset to defaults

#### Derived at Runtime

Derived runtime data should include:

- normalized values
- span and midpoint values
- dirty state
- resolved active handle
- resolved pointer positions
- resolved pointer angles
- resolved selected range geometry
- resolved seam-aware circular spans
- resolved tick placement
- resolved label anchors
- active states
- transition buckets

This distinction is important because it keeps runtime math out of stored author
data.

### Runtime Pipeline

Recommended runtime pipeline:

1. start from stored slider definition
2. generate or refresh semantic entity sets if needed
3. derive geometry-aware runtime signals
4. apply bindings
5. evaluate active states
6. apply state patches
7. derive animation transitions
8. render final entity tree

This is the clearest order because:

- geometry has to exist before bindings
- bindings should happen before state patches
- animations should smooth already-resolved outcomes

### Generation Layer

The first runtime responsibility is ensuring the slider has the correct semantic
entity structure.

Recommended generated semantic entities:

- body roles
- pointer roles
- tick sets
- label roles

Generated structure should depend on:

- `geometry`
- `valueMode`
- active preset

Examples:

- `single` generates `pointerCurrent`
- `range` generates `pointerStart` and `pointerEnd`
- `band` generates all three pointer roles
- circular presets may generate seam-aware body and tick defaults

### Stable Part Names

The part schema must be strong enough to represent the full slider family.

Recommended stable part names:

- `bodyTrackBase`
- `bodyTrackFill`
- `bodySelectedRange`
- `bodyCenterMarker`
- `pointerStart`
- `pointerCurrent`
- `pointerEnd`
- `tickMajor_*`
- `tickMinor_*`
- `tickAccent_*`
- `tickValue_*`
- `tickRange_*`
- `tickBand_*`
- `labelMin`
- `labelMax`
- `labelStart`
- `labelCurrent`
- `labelEnd`
- `labelValue`
- `labelTitle`
- `labelUnit`

This means:

- the ready-made editor can generate and manage them
- bindings and states can target them predictably
- the future Component Designer can inherit them instead of replacing the whole
  model

### Geometry Resolution Layer

Before bindings run, geometry helpers should derive the resolved slider layout.

Recommended geometry outputs:

- linear track coordinates
- circular arc coordinates
- pointer positions
- pointer angles
- selected range span
- selected range midpoint
- seam-aware range interpretation
- tick anchor points
- label anchor points

Recommended rule:

- the geometry layer is the only place that should solve linear/circular travel
  math

Bindings and states should consume these results, not reinvent them.

### Geometry Caching and Update Frequency

Sliders are high-frequency controls, so the runtime needs a clear performance
contract.

Recommended rules:

- geometry derivation should be cached or memoized from the authored geometry
  inputs, resolved values, and current bounds
- hover, focus, and other state-only changes should not invalidate geometry
  caches
- drag-driven value changes may recompute geometry every frame, but the runtime
  should batch geometry, binding, state, and render work cleanly per frame
- `emitValueChange` should only fire when the resolved semantic value set
  actually changed after constraints and snapping
- `emitValueCommit` should remain distinct from continuous change emission

### Binding Application Layer

After geometry is resolved, bindings should map semantic signals into semantic
entity properties.

Recommended responsibilities:

- place pointers
- size or sweep active fills
- size or sweep selected ranges
- emphasize tick sets
- adjust label emphasis position/opacity

Recommended non-responsibilities:

- computing geometry
- deciding active handle
- formatting readout strings

### State Evaluation Layer

After bindings, evaluate interactive states.

Recommended state inputs:

- hover
- pressed
- dragging
- focused
- disabled
- active handle

Recommended result:

- a set of active semantic states
- applied in defined priority order

This allows the same semantic entity tree to respond consistently across:

- body
- pointers
- ticks
- labels

### Animation Resolution Layer

After bindings and states have resolved the final semantic result, derive the
transition plan.

Recommended animation responsibilities:

- smooth pointer movement
- smooth fill and range span updates
- smooth emphasis transitions
- preserve correct circular direction and seam behavior

Recommended rule:

- animations smooth resolved targets
- animations do not decide semantic outcomes

### Final Render Tree

The final render tree should stay semantic, not ad hoc.

Recommended render groups:

1. `Body`
2. `Ticks`
3. `Pointers`
4. `Labels`
5. `Readout`

Recommended interpretation:

- body establishes the structural base
- ticks provide scale support
- pointers sit above the body as primary interaction elements
- labels/readout sit above the visual slider structure

Readout may still be implemented as `labelValue`, but the render ordering should
allow it to behave as a primary top-level readout when the preset wants that.

### Render Ordering Rules

Recommended rules:

- body roles render below pointers, ticks, and labels
- center markers render above the body but below pointers
- pointer roles render above body fills and selected ranges
- labels should remain readable above the body and ticks
- readout should render at or above other labels when it is meant to be the
  primary visible numeric output

### Linear vs Circular Rendering

The semantic runtime model should stay the same across geometries.

What changes is the geometry resolver and the concrete rendering math.

Linear rendering differences:

- positions are axis-based
- sizes often map to width/height
- spans often map to linear offsets and lengths

Circular rendering differences:

- positions are angle-based
- spans often map to arc starts and sweeps
- seam logic must be explicit

Recommended rule:

- geometry changes rendering math
- geometry does not change semantic role identity

### Internal Ownership at Runtime

Recommended ownership model:

- slider component owns all semantic internal entities
- internal entities do not become ordinary sibling components
- preview/debug may reveal them
- authoring tools may select them semantically
- runtime still treats them as one slider-owned tree

This keeps the component model coherent.

### Preview / Debug Runtime Expectations

Preview and debug should expose runtime resolution clearly.

Recommended debug output:

- geometry
- value mode
- active handle
- resolved values
- resolved geometry outputs
- resolved binding outputs
- active states
- resolved transition groups

This is especially important for:

- circular range sliders
- circular band sliders
- active-handle-specific styling

### Non-Goals for This Runtime Section

This section does not mean:

- every semantic entity must become a standalone user-managed component
- bindings and states should both solve the same problems
- geometry math should leak into every subsystem
- the runtime should abandon the shared interaction architecture

It means:

- the runtime pipeline now has a clear order
- generation, derivation, binding, state, and animation each have distinct jobs
- the semantic slider model remains intact all the way to rendering

## Implementation Strategy

This should be implemented as one coherent slider system, not as separate
throwaway efforts.

The main strategy is:

- define the semantic contract first
- make runtime math correct second
- generate the internal entity tree third
- build the curated editor on top of that foundation
- then harden preview, debug, and defaults

That order matters.

If the editor is built before the runtime contract is stable, the UI will drift.
If the runtime is built before the semantic model is stable, the code will drift.

### Implementation Principles

Recommended principles:

- build one unified slider family, not several disconnected widgets
- solve semantics before skinning
- solve geometry before bindings
- generate defaults before exposing advanced manual tuning
- make circular/range/band first-class in the foundation, not bolt-ons later
- make accessibility, touch, and form/reset behavior part of the core contract,
  not post-launch cleanup
- keep high-frequency drag performance and responsive density under explicit
  guardrails
- keep every phase shippable and testable

### Dependency Order

Recommended dependency order:

1. semantic model
2. geometry math
3. runtime resolution
4. entity generation
5. curated editor
6. preview/debug
7. polish and hardening

This is the lowest-risk sequence because every later layer depends on the one
before it.

### Phase 0: Lock the Semantic Contract

Goal:

- finalize the slider family definition before implementation fans out

Done when:

- `Behavior` contract is settled
- semantic entity groups are settled
- stable part names are settled
- accessibility focus/value semantics are settled
- change/commit/reset semantics are settled
- ready-made vs designer boundary is settled

Why first:

- everything else depends on these names and meanings staying stable

### Phase 1: Unify the Slider Family Model

Goal:

- represent every ready-made slider as one family model

Implement:

- `geometry`
- `valueMode`
- semantic value roles: `start`, `current`, `end`
- canonical defaults for `single`, `range`, and `band`
- canonical dirty/reset/commit semantics
- locale-aware direction insertion defaults without hidden authored flipping

Done when:

- linear/circular and single/range/band can all be represented by the same
  model
- presets are just authored configurations of that model
- keyboard, touch, and form integration all point at the same semantic model

### Phase 2: Build Geometry Utilities

Goal:

- centralize all linear/circular math in one place

Implement geometry helpers for:

- linear track positions
- circular arc positions
- circular fit-inside-bounds behavior
- seam-aware circular span resolution
- pointer placement
- touch projection to linear/circular travel
- tick placement
- label anchors
- density measurement inputs for responsive tick/label reduction

Done when:

- geometry helpers can produce stable resolved outputs for all six combinations:
  linear/circular x single/range/band
- circular sliders stay circular under rectangular layout pressure

Important rule:

- no editor code or binding code should duplicate this geometry math

### Phase 3: Extend Runtime Resolution

Goal:

- make the shared interaction runtime understand the full slider family

Implement:

- multi-value signal resolution
- active-handle resolution
- geometry-aware derived outputs
- circular direction and seam logic
- value span and midpoint derivation
- dirty/reset/commit runtime signals
- accessibility-facing value text and legal-range outputs
- explicit geometry caching boundaries so state-only updates stay cheap

Done when:

- runtime can resolve semantic slider outputs without any slider-specific hacks
  inside random render components
- drag, reset, and commit flows all resolve through the same runtime contract

### Phase 4: Add Entity Generators

Goal:

- generate the full semantic internal slider tree from the current slider model

Generate:

- body parts
- pointer parts
- tick parts
- label parts
- default bindings
- default states
- default animations
- generated hit-slop/accessibility metadata per semantic handle
- generated density/readability defaults for tick and label subsystems

Done when:

- a slider preset can be created and immediately expands into a complete
  semantic internal structure
- that structure is stable and regeneratable
- regeneration preserves semantic handle identity and authoring intent

### Phase 5: Update Renderers

Goal:

- render the semantic internal entities cleanly in editor and preview/runtime

Implement:

- richer body rendering
- pointer rendering
- tick rendering
- label and readout rendering
- geometry-aware ordering
- circular non-distortion rules
- high-contrast-friendly rendering hooks

Done when:

- the same semantic slider data can render correctly for linear and circular
  sliders across single/range/band modes
- accessibility/readability hooks do not require renderer-specific subtype
  branches

### Phase 6: Build the Curated Slider Editor

Goal:

- expose the slider family through a strong authoring workflow

Implement:

- `SliderEditor`
- preset bar
- geometry/value editing
- body, pointer, tick, label, and readout sections
- basic/advanced modes
- progressive disclosure rules
- density/tick-step mismatch warnings
- readout/localization-aware formatting controls

Done when:

- users can build and refine the full slider family without raw part editing
  for normal cases
- common density, snapping, and formatting mistakes are caught early

### Phase 7: Extend Preview and Debug

Goal:

- make complex slider behavior visible and trustworthy during authoring

Implement preview support for:

- active handle
- multi-value constraints
- circular movement
- seam crossing behavior
- range/band highlighting
- tick and label response
- dirty/reset state
- commit vs continuous-change behavior
- touch and keyboard focus routing
- high-contrast and reduced-motion verification

Implement debug output for:

- resolved values
- resolved geometry outputs
- active states
- resolved transitions
- commit/reset traces
- accessibility-facing values and focus targets

Done when:

- circular range/band behavior can be inspected without guesswork
- a11y, touch, and reset behavior can be verified without custom logging

### Phase 8: Harden Defaults and Polish

Goal:

- make the system feel production-ready instead of merely functional

Polish areas:

- default presets
- default bindings
- default states
- default animations
- readability guardrails
- reset/regenerate flows
- focus order and accessibility polish
- reduced-motion and high-contrast polish
- touch comfort and commit-event polish

Done when:

- a freshly inserted slider feels intentional before any manual tweaking
- the defaults feel production-safe across mouse, touch, keyboard, and screen
  reader use

### What Can Be Parallelized

Some work streams can run in parallel after the semantic contract is locked.

Good parallel tracks:

- geometry utilities
- entity generation
- renderer upgrades
- `SliderEditor` UI scaffolding
- preview/debug UI scaffolding

Work that should stay more sequential:

- behavior contract changes
- runtime signal model
- seam/wrap semantics

Those are too foundational to split carelessly.

### Recommended First Milestone

The first meaningful milestone should not be "single linear slider only".

It should be:

- one unified slider model
- one geometry utility layer
- one runtime signal layer
- proof that linear and circular both work
- proof that single and range both work
- proof that keyboard focus and commit semantics already fit the same model

Why:

- once those foundations are real, `band`, richer ticks, and richer labels are
  additive
- if those foundations are weak, every later addition becomes rework

### Recommended Second Milestone

After the foundation is stable:

- finish `band`
- finish readout/label richness
- finish multi-set ticks
- finish generated states/animations
- finish `SliderEditor`
- finish touch nuance and responsive density behavior

This turns the system from "runtime-capable" into "authoring-ready".

### Recommended Third Milestone

Then harden:

- preview/debug
- defaults
- reset/regenerate flows
- readability safeguards
- accessibility verification
- reduced-motion/high-contrast behavior
- documentation alignment

This turns it from "powerful" into "usable at scale".

### Migration Strategy

Because the codebase already has some slider behavior, migration should be
explicit.

Recommended migration rules:

- preserve compatibility where practical
- prefer canonical new fields going forward
- generate missing semantic entities for older sliders when opened
- keep compatibility aliases only as long as migration actually needs them

Important examples:

- old single sliders may map `defaultValue -> defaultCurrentValue`
- old linear fill/thumb setups may be translated into semantic body/pointer
  roles
- older slider interactions that only emitted continuous value changes may map
  to `emitValueChange`, with `emitValueCommit` added as the canonical new
  commit-phase signal

### Quality Gates Per Phase

Each phase should have a simple gate.

Recommended gates:

- Phase 1: model expresses all target slider types
- Phase 2: geometry math passes representative linear/circular, bounds, and
  density cases
- Phase 3: runtime resolves active handle, commit/reset, and derived values
  correctly
- Phase 4: generated entity tree is stable and semantic
- Phase 5: renderers draw all target combinations correctly
- Phase 6: normal authoring no longer requires raw part editing
- Phase 7: preview/debug reveals all complex slider behavior clearly
- Phase 8: presets and defaults feel polished across accessibility and input
  modalities

### Failure Modes to Avoid

Recommended anti-goals:

- building separate code paths for circular vs linear that barely share a model
- building editor UI before the semantic model is stable
- letting bindings absorb geometry logic
- letting generated entities turn into anonymous loose parts
- treating range and band as afterthoughts
- leaving a11y, touch, or reset behavior undefined until after the visual slider
  seems "done"

These are exactly the patterns that create expensive rework later.

### Practical Summary

The right implementation strategy is:

1. lock the semantic contract
2. unify the family model
3. solve geometry and runtime
4. generate the semantic entity tree
5. render it
6. author it through `SliderEditor`
7. harden preview, debug, and defaults

That is how to do it once and do it right.

## Concrete Codebase Touchpoints

The current codebase already contains a first-generation slider path.

Today that path is centered on:

- `componentTypes.js` inserting `Slider` through
  `createDefaultInteractiveSections('Slider')`
- `interactionDefaults.js` generating a linear `track` / `fill` / `thumb`
  parts model
- `rangeBehavior.js`, `InteractionPreviewTab.svelte`, and
  `InteractiveTestSurface.svelte` handling a mostly single-value linear slider
  interaction flow
- `InteractivePartRenderer.svelte` and `CanvasControl.svelte` already rendering
  interactive parts generically

So this feature should be implemented as an evolution of the existing slider
pipeline, not as a second disconnected slider stack.

The button comparison matters here.

Buttons in this codebase already rely on shared sections plus type-specific
defaults, not on a completely separate runtime. The slider family should keep
that same backbone:

- `Behavior`
- `Parts`
- `Bindings`
- `States`
- `Animations`

The extra piece is a curated `SliderEditor`, because sliders own a much richer
internal semantic subsystem than buttons do.

### Model and Defaults

| File | Current Role | Slider Family Work |
| --- | --- | --- |
| `CE/web/src/CE_Application/models/componentTypes.js` | Registers `Slider` as a generic interactive type using `createDefaultInteractiveSections('Slider')`. | Keep one `Slider` family type, but add curated preset insertion paths for linear/circular and single/range/band variants. Presets should still resolve to one semantic slider model rather than multiple unrelated component types. |
| `CE/web/src/CE_Application/models/sectionDefaults.js` | Provides generic section defaults, with `Behavior` still carrying older button/range-oriented fields such as `defaultValue`. | Extend the canonical `Behavior` contract with `geometry`, `valueMode`, `defaultCurrentValue`, `defaultStartValue`, `defaultEndValue`, circular fields, active-handle policy, snapping, `emitValueCommit`, reset semantics, and compatibility aliases for old slider data. |
| `CE/web/src/CE_Application/models/interactionDefaults.js` | Generates the current slider defaults: `track`, `fill`, `thumb`, plus single-value bindings, states, and animations. | Replace the old single linear slider defaults with semantic body/pointer/tick/label generation and richer default bindings/states/animations for the full slider family. This is where the ready-made preset personalities, readable-density defaults, and high-contrast/reduced-motion-friendly defaults should be authored. |
| `CE/web/src/CE_Application/utils/rangeBehavior.js` | Holds current numeric range/slider helper logic for linear value stepping, parsing, and display. | Keep only the numeric stepping, parsing, and display logic that still belongs to generic numeric range behavior. This is also the right place for clear domain/step rules such as exact `max` reachability when `step` does not divide evenly. Move slider geometry, active-handle, circular travel, seam, and wrap logic out so this file stops acting as an accidental full slider implementation. |
| `CE/web/src/CE_Application/utils/sliderGeometry.js` | Does not exist yet. | New geometry utility layer for all linear/circular and single/range/band math: normalized travel, handle positions, arc resolution, seam crossing, bounds fitting, circular non-distortion, touch projection, tick placement, responsive density inputs, and label anchors. No editor or preview file should duplicate this math. |
| `CE/web/src/CE_Application/utils/sliderEntityFactory.js` | Does not exist yet. | New semantic entity generator/regenerator for `Body`, `Pointers`, `Ticks`, and `Labels`. This should own generated naming, default z-order, default styling, semantic hit-slop metadata, and safe regeneration when the user changes slider configuration. |

### Authoring UI and Tab Wiring

| File | Current Role | Slider Family Work |
| --- | --- | --- |
| `CE/web/src/CE_Application/sections/BehaviorEditor.svelte` | The current behavior editor is strongly button-type-oriented and does not expose a real slider family model. | Add only the semantic slider fields that truly belong in shared behavior editing: geometry, value mode, numeric bounds, circular options, handle policies, snapping, emission including `emitValueCommit`, and reset semantics. Do not turn this file into the main styling surface for sliders. |
| `CE/web/src/CE_Application/sections/SliderEditor.svelte` | Does not exist yet. | New dedicated ready-made slider editor for presets, body, pointers, ticks, labels, readout, and canvas assist. This is the main curated slider authoring surface, and it should surface density warnings, tick/step mismatch warnings, and locale-aware formatting controls without pushing users into generic low-level tabs. |
| `CE/web/src/CE_Application/sections/BindingsEditor.svelte` | Offers a generic binding editor with a limited signal list such as `value.normalized`, `state.hover`, and direct `Parts.*` targets. | Add semantic slider signals for multi-value, geometry, active handle, range span, band midpoint, circular angles, and tick/label state. Keep it semantic and grouped; do not let bindings become a scripting substitute. |
| `CE/web/src/CE_Application/panels/PropertiesPanel.svelte` | Registers the component tab list and filters tabs by section presence and optional predicates. | Add a `slider` tab id for slider-family controls, with display rules based on slider behavior/type. This should expose the curated editor without cluttering non-slider controls. |
| `CE/web/src/CE_Application/panels/sectionEditorLoaders.js` | Maps tab ids to editor components and already supports editor ids that are not one-to-one with stored section names. | Register lazy loading for `SliderEditor.svelte`. This should be treated like a curated editor tab, similar in spirit to `segments`, not necessarily as a brand-new serialized root section. |
| `CE/web/src/CE_Application/editor/CanvasControlSelectionOverlay.svelte` | Already exists as part of canvas selection affordances. | Extend it if needed for slider canvas-assist targeting so the user can click semantic internal roles such as a pointer, label, or tick set preview and have the slider editor focus that role. |

Important implementation detail:

`SliderEditor` should be introduced first as a curated editor tab, not as a new
serialized `Slider` section unless the data model genuinely requires one later.
Its job is to author the existing slider contract across `Behavior`, `Parts`,
`Bindings`, `States`, and `Animations`.

### Preview, Interaction, and Runtime

| File | Current Role | Slider Family Work |
| --- | --- | --- |
| `CE/web/src/CE_Application/stores/interactionPreview.js` | Stores preview-session state for the current interaction preview flow. | Extend the preview session model to carry multi-value slider state such as `start`, `current`, `end`, active handle, circular debug data, dirty/reset/commit inspection state, current input modality, and preview-only high-contrast/reduced-motion flags. |
| `CE/web/src/CE_Application/components/InteractionPreviewTab.svelte` | Already shows interaction preview controls and runtime readouts, but currently assumes a simpler range/value model. | Add explicit slider-family preview controls for active handle, multi-value editing, circular geometry readouts, normalized/value spans, tick highlighting, label and readout output, commit/reset traces, touch/keyboard focus routing, and seam behavior diagnostics. |
| `CE/web/src/CE_Application/components/InteractiveTestSurface.svelte` | Already handles slider-like linear dragging through the current range behavior flow. | Extend hit-testing and interaction to support multi-handle selection, semantic hit slop, handle priority, range/band constraints, circular dragging, angular travel, seam crossing, touch capture, and value-field behavior that respects the active handle. |
| `CE/web/src/CE_Application/utils/interactionRuntime.js` | Resolves the current interaction runtime, binding outputs, active states, and transitions using a mostly single-value model. | Expand it into the semantic slider runtime: derive multi-value outputs, dirty/reset/commit outputs, active-handle outputs, circular geometry outputs, seam-aware spans, label text inputs, accessibility-facing value text/ranges, and state signals such as `ActiveHandleStart`, `ActiveHandleCurrent`, and `ActiveHandleEnd`. |

### Rendering and Canvas

| File | Current Role | Slider Family Work |
| --- | --- | --- |
| `CE/web/src/CE_Application/editor/InteractivePartRenderer.svelte` | Already renders generic interactive parts with `Background`, `Text`, `Layout`, and transitions. | Keep this generic. The main work is to ensure semantic slider parts such as ticks and labels render cleanly, support high-contrast-friendly overrides, and debug legibly, not to invent a slider-only renderer. |
| `CE/web/src/CE_Application/editor/CanvasControl.svelte` | Already resolves interactive controls, sorts and renders parts, and integrates preview/runtime data. | Keep the generic rendering path, but ensure semantic slider part ordering, preview accessibility metadata, responsive-density behavior, and any geometry-driven rendering expectations line up with the richer slider runtime. Avoid hardcoding separate renderer branches for each slider subtype. |
| `CE/src/ValueTreeBridgeState.cpp` | Bridges state generically on the native side. | Likely minimal work only. Touch this only if new serialized fields or preview/runtime bridge paths require it; the slider family should stay mostly within the existing generic bridge architecture. |

### Practical Ownership Rule

To keep the implementation sane:

- `componentTypes.js`, `sectionDefaults.js`, and `interactionDefaults.js` own
  insertion defaults and canonical authored shape
- `sliderGeometry.js` owns math
- `sliderEntityFactory.js` owns generated semantic entities
- `interactionRuntime.js` owns derived runtime signals
- `SliderEditor.svelte` owns the curated GUI
- `InteractivePartRenderer.svelte` and `CanvasControl.svelte` stay as generic
  render infrastructure

If that ownership line is respected, the slider family stays unified instead of
slowly splitting into one-off linear and circular code paths.

## Preview and Debug Requirements

The preview and debug system should build on the existing stack:

- `stores/interactionPreview.js`
- `components/InteractionPreviewTab.svelte`
- `components/InteractiveTestSurface.svelte`
- `utils/interactionRuntime.js`
- the existing debug-dock dump flow

So this is not a separate slider sandbox.

It is an extension of the current interaction preview model so slider-family
behavior can be trusted while authoring.

### Core Preview Principle

Preview must answer three questions immediately:

1. what values does this slider currently resolve to
2. which semantic handle / range / band segment is active
3. why is the rendered slider looking and moving the way it is

If preview cannot answer those quickly, the authoring experience will feel
guessy, especially for circular range and band sliders.

### Preview Session Model

The current preview session model is still mostly a single-value interaction
session with booleans like `hover`, `pressed`, `focused`, `dragging`, and one
`valueOverride`.

The slider family should extend that model with slider-specific preview state.

Recommended slider preview session fields:

- `activeHandle: start | current | end`
- `currentOverrideEnabled`
- `currentOverride`
- `startOverrideEnabled`
- `startOverride`
- `endOverrideEnabled`
- `endOverride`
- `showGeometryDebug`
- `showTickDebug`
- `showLabelDebug`
- `showConstraintDebug`

Optional but useful preview-only diagnostics:

- `seamInspectionEnabled`
- `preferredWrapPath`
- `showNormalizedReadout`

Important rule:

- preview session stores temporary interaction and inspection state
- `Behavior` remains the source of authored slider configuration

Preview must never become the place where permanent slider settings secretly
live.

### Preview UI Requirements

`InteractionPreviewTab.svelte` should expose slider-family preview in four
layers.

#### 1. Manual Overrides

Manual overrides should support:

- active handle selection
- raw value override per semantic role
- quick reset per role
- enable / disable preview session
- enable / disable animation playback

Shown by mode:

- `single`: `current`
- `range`: `start`, `end`, active handle
- `band`: `start`, `current`, `end`, active handle

This should replace the old assumption that one numeric `valueOverride` is
enough.

#### 2. Live Stage Interaction

`InteractiveTestSurface.svelte` should support real interaction for:

- linear single
- linear range
- linear band
- circular single
- circular range
- circular band

The stage must support:

- pointer dragging
- active-handle acquisition
- keyboard stepping
- wheel stepping when enabled
- direct value-field editing when enabled
- correct constraint behavior when handles meet
- correct seam and wrap behavior for circular sliders

For circular sliders, the stage must make the dial behavior obvious:

- start angle
- sweep angle
- clockwise / counterclockwise direction
- seam position
- chosen travel path when wrap is involved

The user should never have to infer whether a circular range crossed the seam
or took the short path. Preview should show it clearly.

#### 3. Runtime Readout

The runtime sidebar should display the resolved slider runtime, not just the
authored behavior.

Recommended runtime rows:

- `geometry`
- `valueMode`
- `activeHandle`
- `isDirty`
- `rawStart`
- `rawCurrent`
- `rawEnd`
- `normalizedStart`
- `normalizedCurrent`
- `normalizedEnd`
- `rangeSpan`
- `bandMidpoint`
- `direction`
- `allowWrapAround`

For circular sliders also show:

- `startAngle`
- `sweepAngle`
- `resolvedStartAngle`
- `resolvedCurrentAngle`
- `resolvedEndAngle`
- `resolvedSelectedArc`
- `crossesSeam`

This should extend the current runtime view, which already surfaces
`signals`, `activeStates`, and transition data.

#### 4. Semantic Subsystem Readout

Preview should also show what the slider subsystems resolved to.

Recommended readouts:

- active tick sets
- highlighted tick range / band segment
- visible label roles
- current readout text
- current handle label text
- generated semantic entity counts

This matters because many slider bugs will not be “value math” bugs.
They will be mismatches between values and what ticks, labels, or fills did in
response.

### Canvas and Visual Debug Assist

Preview should include visual debug overlays that can be toggled on demand.

Recommended overlays:

- pointer anchors
- tick anchors
- label anchors
- circular seam marker
- arc start / arc end guides
- center marker
- active range / band span highlight

These should be optional overlays, not always-on clutter.

### Debug Dock Requirements

The existing debug-dock flow is already the right pattern:

- dump the current preview session
- dump the resolved runtime
- dump the resolved control

For the slider family, those dumps should become more structured.

Recommended debug payload shape:

- `controlId`
- `type`
- `previewSession`
- `behavior`
- `geometry`
- `resolvedValues`
- `resolvedGeometry`
- `activeHandle`
- `tickDebug`
- `labelDebug`
- `runtime`
- `resolvedControl`

Where:

- `behavior` is the authored slider contract
- `resolvedValues` shows raw and normalized role values
- `resolvedGeometry` shows positions, angles, spans, seam resolution, and
  anchors
- `tickDebug` shows active/highlighted tick-set results
- `labelDebug` shows visible label roles and final text output

### Minimum Preview Coverage

Preview is not complete until it can demonstrate all six core combinations:

- linear single
- linear range
- linear band
- circular single
- circular range
- circular band

And for each combination, it must prove:

- dragging works
- constraints work
- runtime values resolve correctly
- ticks respond correctly
- labels / readout respond correctly
- active states and animations still resolve correctly

### Minimum Debug Coverage

Debug is not complete until a developer can answer these without adding custom
logs:

- which handle is active
- which raw values are currently in play
- which normalized values are currently in play
- what geometry outputs were derived
- whether a circular selection crossed the seam
- which states are active
- which bindings fired
- which parts / labels / ticks were targeted
- which transitions were applied

### Practical Rule

If a slider behaves unexpectedly, preview and debug should make the fault easy
to classify as one of:

- authored behavior problem
- geometry derivation problem
- binding problem
- state / animation problem
- generated entity problem

That is the real goal of this section.

Preview is not just for showing that the slider moves.
It is for making the slider family inspectable enough that we can build it once
and keep it understandable later.

## Acceptance Criteria

The slider system is not done because one demo slider works.

It is done when the full ready-made slider family is stable, inspectable,
authorable, and extensible without splitting into special-case code paths.

### 1. Family Model Is Truly Unified

Acceptance gates:

- one semantic slider family supports both `linear` and `circular`
- one semantic slider family supports `single`, `range`, and `band`
- presets are authored configurations of that family, not separate hidden
  implementations
- circular/range/band are first-class in the model, not bolt-ons behind flags
- diagonal usage is achievable through transform / rotation, not a separate
  semantic slider type

Fail if:

- linear and circular require different runtime architectures
- range and band rely on separate one-off data models

### 2. Behavior Contract Is Stable and Canonical

Acceptance gates:

- `Behavior` cleanly expresses geometry, value mode, bounds, defaults,
  interaction policies, constraints, and emission rules
- canonical value roles are stable: `start`, `current`, `end`
- compatibility aliases for older slider data are supported where needed
- derived runtime values are not redundantly stored as authored fields
- accessibility, commit-emission, and reset semantics are defined clearly enough
  that runtime and preview do not have to invent them ad hoc

Fail if:

- the editor, runtime, and defaults disagree on what core slider fields mean
- geometry outputs or normalized values are being stored as permanent authored
  data
- multi-value focus behavior or reset behavior is left implicit

### 3. Semantic Entity Model Is Real

Acceptance gates:

- the slider generates and maintains semantic internal groups for `Body`,
  `Pointers`, `Ticks`, and `Labels`
- labels are separate entities from the slider body
- readout / value display is handled as a label entity, not as a special hidden
  control
- tick sets are structured semantic sets, not a single decorative afterthought
- generated entity naming and role presence are stable across regeneration

Fail if:

- slider internals degrade into anonymous loose parts
- labels are treated as body text glued onto the track

### 4. Geometry and Runtime Resolution Are Correct

Acceptance gates:

- one geometry layer resolves all six combinations:
  `linear/circular x single/range/band`
- active-handle resolution works consistently
- circular direction, seam, and wrap rules resolve consistently
- range span, band midpoint, pointer positions, tick anchors, and label anchors
  are derived correctly
- bindings consume resolved semantic signals rather than re-solving slider math
- circular sliders preserve circular geometry under rectangular layout pressure
- responsive density reduction is predictable rather than chaotic

Fail if:

- geometry logic is duplicated in editor code, preview code, and bindings
- circular seam behavior changes depending on which code path touched it
- circular sliders stretch into ellipses in the ready-made family

### 5. Interaction Works Across the Full Family

Acceptance gates:

- all six core combinations can be interacted with in preview
- pointer dragging works
- touch dragging and hit-testing work reliably
- keyboard stepping works when enabled
- wheel stepping works when enabled
- value-field editing works when enabled
- handle constraints behave correctly when values meet or approach each other
- circular interaction respects dial direction, seam, and wrap policy
- multi-value keyboard focus routing and accessible handle targeting are clear

Fail if:

- circular interaction only looks right visually but resolves the wrong values
- multi-handle controls feel ambiguous about which handle is active
- touch overlap handling or keyboard focus order feels guessy

### 6. Curated Authoring UX Is Good Enough for Normal Use

Acceptance gates:

- normal ready-made slider work does not require raw part editing
- `SliderEditor` provides a coherent workflow for preset, geometry, values,
  body, pointers, ticks, labels, and readout
- progressive disclosure keeps irrelevant controls hidden
- shared slider editing stays consistent with the rest of the editor’s
  properties workflow
- the editor warns or guards against unreadable density and misaligned tick/step
  setups

Fail if:

- users must open generic low-level editors for common slider tasks
- the curated slider flow is weaker than directly editing parts by hand
- common density or snapping mistakes stay invisible until runtime

### 7. Preview and Debug Are Trustworthy

Acceptance gates:

- preview demonstrates all six core slider combinations
- preview shows active handle, resolved values, normalized values, and slider
  subsystem response
- circular preview clearly exposes seam and wrap behavior
- debug output can show authored behavior, resolved runtime, resolved geometry,
  active states, semantic targets, and transitions
- slider issues can be classified without adding temporary custom logging
- preview exposes enough state to verify dirty/reset/commit behavior as well as
  continuous drag behavior

Fail if:

- the slider moves but cannot be inspected
- seam / wrap behavior is only understandable by reading code
- reset, commit, or density behavior can only be verified indirectly

### 8. States and Animations Stay on the Shared Backbone

Acceptance gates:

- slider states still use the shared `States` model
- slider transitions still use the shared `Animations` model
- slider-specific generated defaults exist for body, pointers, ticks, labels,
  and readout
- active-handle-aware states resolve correctly for multi-value sliders
- reduced-motion preference suppresses non-essential slider motion cleanly
- high-contrast preference can strengthen readability without breaking the
  semantic slider structure

Fail if:

- sliders introduce a second hidden state system
- animation behavior depends on hardcoded subtype branches instead of semantic
  targets
- reduced motion or high contrast only works for some slider subtypes

### 9. Rendering Stays Generic, Not Fragmented

Acceptance gates:

- the existing rendering pipeline can draw the richer slider family without a
  separate slider-only renderer stack
- `InteractivePartRenderer.svelte` and `CanvasControl.svelte` remain generic
  infrastructure
- semantic slider richness comes from generated entities and resolved runtime,
  not from hardcoded renderer exceptions per subtype

Fail if:

- rendering forks into different codebases for linear vs circular
- renderer code becomes the place where slider semantics are secretly defined

### 10. Boundary with the Component Designer Remains Clean

Acceptance gates:

- the ready-made slider family is rich enough for normal product use
- the future Component Designer can extend or customize the slider family
  without replacing it
- the boundary remains semantic vs freeform, not basic vs advanced
- there is a believable path from ready-made slider to future custom component
  work

Fail if:

- advanced ready-made sliders are forced into the designer unnecessarily
- the designer has to reimplement slider semantics from scratch

### 11. Migration Does Not Punish Existing Work

Acceptance gates:

- existing slider-like controls can be mapped into the unified family
- old single linear slider data can be upgraded without breaking authored work
- compatibility shims are narrow and temporary rather than becoming a permanent
  second model

Fail if:

- adopting the new slider family requires throwing away current slider content
- migration leaves two equally official slider schemas in the codebase

### Practical Done-Definition

The slider family is ready to ship when all of the following are true:

- one unified slider family works for `linear` and `circular`
- one unified slider family works for `single`, `range`, and `band`
- labels and readout are real semantic entities
- ticks are a real semantic subsystem
- preview and debug fully support circular and multi-value behavior
- normal authoring does not require raw part editing
- the shared runtime, states, bindings, and animations model remains intact
- the future Component Designer can build on this foundation instead of
  replacing it

That is the real acceptance bar for "done once and done right".

## Final Recommendation

Ship one unified ready-made slider family, not a temporary slider placeholder.

That family should ship with:

- `linear` and `circular` geometry from the start
- `single`, `range`, and `band` value modes from the start
- semantic `Body`, `Pointers`, `Ticks`, and `Labels`
- readout / value display as a label entity
- a curated `SliderEditor` for normal authoring work
- preview and debug strong enough to inspect geometry, values, handles,
  ticks, labels, and transitions

The key product rule is:

- the ready-made slider owns semantic slider behavior
- the future Component Designer owns freeform custom design

So the ready-made slider must already be rich and serious.
It should not be a stripped-down control that only becomes useful after the
Component Designer exists.

Do not compromise on these points:

- do not postpone circular
- do not postpone range or band
- do not reduce ticks to a decorative afterthought
- do not glue labels onto the body as if they are not real entities
- do not fork separate slider architectures for linear and circular
- do not make bindings absorb slider geometry logic
- do not make the future Component Designer reimplement slider semantics from
  scratch

Architecturally, the right answer is:

- keep the shared backbone of `Behavior`, `Parts`, `Bindings`, `States`, and
  `Animations`
- add a geometry layer that owns slider math
- add a semantic entity generator that owns internal slider structure
- add a curated slider editor that makes the system usable

That is how to do it once, do it properly, and leave the future
Component Designer with a strong foundation instead of a cleanup job.
