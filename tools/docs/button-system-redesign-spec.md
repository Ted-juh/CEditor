# Button System Redesign Spec

## Purpose

This document defines the new button system for CEditor before implementation.

It replaces the previous over-abstracted interaction model with a button-first model.

The goal is simple:

- make common button behaviors easy to understand
- make setup fast
- keep advanced behavior possible without forcing every button through a giant generic interaction system

This spec is intentionally centered on buttons.

Sliders, knobs, meters, and other non-button controls are out of scope for this document.

## Core Principles

1. Buttons are authored by intent, not by abstract interaction theory.
2. The editor should expose a small number of obvious button types.
3. The editor should only show settings that are relevant to the chosen button type.
4. Visual styling and behavioral logic should be connected, but not tangled.
5. A user should be able to make a normal button in seconds without thinking about bindings, parts, or runtime state graphs.

## Button Structural Foundation

Buttons should be built on the same basic foundation as existing visual components such as Backdrop and Label.

The button base should not begin as a special engine object.

It should begin as a normal component with familiar visual sections, then add button behavior on top.

Required base sections:

- `Core`
- `Transform`
- `Background`
- `Border`
- `Text`

Notes:

- `Background` and `Border` may still be implemented together internally if that matches the current rendering model.
- The important thing is that the author experiences these as normal visual building blocks, not as button-specific magic.
- A plain button should feel like "a styled visual component plus button behavior."

### Optional Base Sections

Buttons may also use:

- `Icon`
- `Effects`

### Button Foundation Rule

The new button system should inherit the visual language of Backdrop and Label components instead of inventing a separate visual foundation just for buttons.

## Shared Visual Workflow With Label

The new visual editing workflow should not be button-only.

`Label` should be updated to use the same visual/content workflow anywhere the sections overlap.

That means `Label` and `Button` should share the same authoring approach for:

- `Core`
- `Transform`
- `Background`
- `Border`
- `Text`
- `Icon`
- `Effects`
- `Content Layout`

Rule:

- `Label` receives the shared visual workflow
- `Button` extends that workflow with interaction-specific sections such as `States`, `Behavior`, and `Value`

Important distinction:

- `Label` should not inherit button-only logic concepts
- it should only adopt the shared visual editing model

This keeps the editor coherent:

- one visual workflow for visual components
- buttons build on top of that instead of inventing a second competing system

## Icon Support

Buttons should support an optional `Icon` section.

This icon is not the same thing as a background image.

It should be treated as content placed inside the button.

Capabilities:

- import or choose an icon/image asset
- tint/style it independently from the background
- size it independently
- position it independently inside the button
- use icon-only, text-only, or icon-plus-text layouts

### Icon Positioning

The icon should use the same positioning logic as text, or a shared content-positioning model derived from it.

That means the icon should be placeable:

- left
- right
- centered
- top
- bottom
- custom offset if needed

The important requirement is consistency:

- text and icon positioning should feel like members of the same content layout system
- icon placement should not require background hacks

## Button Types

The new system should start with these top-level button behaviors.

### 1. Momentary

Active only while being interacted with, or until release fires the event.

Subtypes:

- `action`
- `repeating`
- `press_to_talk`

Behavior:

- `action`: fires once on click/release
- `repeating`: fires repeatedly while held
- `press_to_talk`: action remains active only while held

Examples:

- Submit
- Next
- Hold `+` to keep increasing a value
- Hold mic button to record

### 2. Toggle

Stateful button that remembers its state.

Subtypes:

- `toggle`
- `sticky`

Behavior:

- switches between active/inactive
- stays in chosen state until changed again

Examples:

- Play/Pause
- Airplane Mode
- Bold
- Italic

### 3. Radio Button Group

Buttons in a shared radio-style group/section.

This is a group/container component, not just a single standalone button.

Subtypes:

- `segmented`
- `radio`
- `tab`

Behavior:

- buttons belong to a shared group/section
- selection behavior depends on the configured selection mode
- the same visual group style may support single-select or multi-select behavior

Examples:

- Daily / Weekly / Monthly
- Tab strip

### 4. Cyclic

A button that advances through a defined list of states.

Subtypes:

- `cycle`
- `tri_state`

Behavior:

- each activation advances to the next state
- may optionally wrap back to the beginning

Examples:

- Sort: Ascending -> Descending -> None
- Off -> On -> Mixed

### 5. Timed

A button that depends on time-based interaction.

Subtypes:

- `hold_to_confirm`
- `double_click`

Behavior:

- `hold_to_confirm`: requires hold duration before firing
- `double_click`: requires two close clicks

Examples:

- Hold to delete account
- Desktop double-click actions

### 6. One-Shot

A momentary button that changes its own availability after firing.

Subtype:

- `single_use`

Behavior:

- triggers once
- then locks/disables itself immediately

Examples:

- Pay Now
- One-time confirmation buttons

## Composite Controls

Some controls are built from multiple components and should not be treated as single button types.

These belong in the component designer, not in the core button type list.

Example:

- numeric stepper made from:
  - decrement button
  - editable value field
  - increment button

Behavior for that composite may include:

- decrement button reduces value by step
- increment button increases value by step
- center field shows current value
- user may type a value directly
- user may scrub-drag on the value field if enabled
- user may use mouse wheel if enabled

Important rule:

- this is not a single button type
- this is a compound component built from multiple child components
- the button system should support the button pieces needed to build it, but should not pretend the composite itself is "just a button"

## Type Selection

The user chooses the button type when inserting the component into the editor.

That means button type is not a property section the user edits afterward as part of normal setup.

Examples:

- insert `Momentary Button`
- insert `Toggle Button`
- insert `Radio Button Group`
- insert `Cyclic Button`
- insert `Timed Button`
- insert `One-Shot Button`

After insertion, the editor should automatically show the sections and options that are relevant to that chosen type.

For clarity:

- `Momentary Button`, `Toggle Button`, `Cyclic Button`, `Timed Button`, and `One-Shot Button` are single-button components
- `Radio Button Group` is a grouped component that manages generated child items

## Editor Setup Rules

The setup UI should be contextual.

The editor should not begin with abstract engine concepts such as:

- `family`
- `role`
- `valueType`

It should begin with the component the user inserted, and then show the relevant editable sections for that button.

### Universal Sections

These should exist for all button components:

- `Core`
- `Transform`
- `Background`
- `Border`
- `Text`
- `Icon`
- `Effects`
- `Content Layout`
- `States`
- `Behavior`
- `Value`

### Contextual Sections

These remain available, but their contents change depending on the inserted button type:

- `Animations`
- `Scripts` placeholder

### Section Ownership

The spec should describe properties under the section that owns them.

It should not use a floating "shared fields" bucket when those properties already belong to a concrete section.

#### `Core`

Owns:

- `ID`
- `Name`
- `Tooltip`
- `Screen Reader Text`
- `Style Preset`

Accessibility rule:

- `Screen Reader Text` should provide the hidden semantic label when the visible layout is `icon_only`
- the editor should strongly encourage this field whenever a button would otherwise have no readable text content

Advanced or later:

- `Permissions`
- `Render Condition`

#### `Transform`

Owns:

- size
- position
- alignment to parent/container
- layout-related transforms

#### `Background`

Owns:

- fills
- surface styling
- background images/textures if supported

#### `Border`

Owns:

- border styling
- border thickness
- corner treatment if separated visually

#### `Text`

Owns:

- `Label`
- text style
- text substitutions such as active/inactive labels where relevant

#### `Icon`

Owns:

- assigned icon/image asset
- icon sizing
- icon placement
- icon-specific styling

#### `Effects`

Owns:

- centralized visual effects configuration
- component-level effects
- text effects
- icon effects

Rule:

- effects should be centralized as a section
- it may internally expose subtargets such as `Component`, `Text`, and `Icon`
- the user should not have to search across multiple unrelated sections just to find effect styling

### Effects Authoring Model

Centralized `Effects` means one authoring section with explicit targets inside it.

Recommended UI model:

- `Effects`
  - `Component`
  - `Text`
  - `Icon`

This means:

- the editor presents one predictable place for all effect styling
- the user chooses the target inside that section
- the internal implementation may still store these separately if needed

Important distinction:

- centralized authoring UI does not require one flattened internal effect blob
- it only means effect editing is gathered in one discoverable place

### Effects Targets

#### `Component`

Used for whole-button effects.

Examples:

- drop shadow
- outer glow
- overall blur
- component-level opacity styling

#### `Text`

Used for label/text effects.

Examples:

- text shadow
- outline/stroke
- glow
- blur

#### `Icon`

Used for icon/image effects.

Examples:

- shadow
- glow
- blur
- tint-related styling

### Effects and States

`Effects` should follow the current state editing context.

That means:

- if `hover` is selected, the `Effects` section edits hover-state effects
- if `selected` is selected, the `Effects` section edits selected-state effects
- if no state override is defined, effects inherit from the base values

#### `Content Layout`

Owns:

- text/icon arrangement
- text position
- icon position
- spacing
- internal alignment and padding rules

### Content Layout Models

`Content Layout` defines how the button's content is arranged inside the button body.

Its purpose is to control:

- text-only buttons
- icon-only buttons
- buttons containing both text and icon

### Core Layout Modes

The first-pass layout modes should be:

- `text_only`
- `icon_only`
- `icon_left_text_right`
- `text_left_icon_right`
- `icon_above_text_below`
- `text_above_icon_below`
- `overlay_centered`

### Layout Mode Meaning

#### `text_only`

- text is the only visible content item
- icon is ignored or hidden

#### `icon_only`

- icon is the only visible content item
- text is ignored or hidden

#### `icon_left_text_right`

- icon and text are arranged horizontally
- icon precedes the text

#### `text_left_icon_right`

- text and icon are arranged horizontally
- text precedes the icon

#### `icon_above_text_below`

- icon and text are arranged vertically
- icon sits above the text

#### `text_above_icon_below`

- text and icon are arranged vertically
- text sits above the icon

#### `overlay_centered`

- icon and text may occupy the same central area
- useful for badge-style or layered button designs
- text must render at a higher z-index than the icon
- designers should use the `Effects` section when needed to preserve text legibility over the icon

### Alignment Model

The first-pass alignment controls should include:

- horizontal alignment
  - left
  - center
  - right
- vertical alignment
  - top
  - center
  - bottom

These alignment rules apply to the content block as a whole inside the button.

### Spacing And Padding

`Content Layout` should also own:

- content padding
  - left
  - right
  - top
  - bottom
- gap/spacing between icon and text

Rule:

- padding affects the content block relative to the button frame
- spacing affects the distance between icon and text inside the content block

### Display Panel Integration

The existing `Align` area in the display panel should be reused as a quick-control surface for layout-related adjustments.

That means:

- `Content Layout` remains the source-of-truth section in the properties panel
- the display panel's `Align` area becomes the fast editing surface for the most common layout controls

Recommended quick controls there:

- alignment
- spacing
- commonly used padding controls or padding presets

This keeps the workflow consistent with the broader UI model:

- properties panel = full detailed editor
- display-side controls = quick visual adjustment tools

This same `Align` workflow should apply to `Label` as well as `Button` wherever `Content Layout` is available.

### Content Layout Editing Flow

Recommended flow:

- select `Content Layout` in the properties panel
- use the display panel `Align` area for quick spacing/padding/alignment changes
- use the properties panel for the full layout model and detailed numeric configuration
- preview reflects those changes live in the current state context

### Per-Element Positioning

The existing positioning model for text/icon may still be used inside `Content Layout`, with slight adaptation.

Recommended concept:

- text and icon behave like draggable content blocks inside the layout area
- layout mode provides the default structure
- padding, spacing, and alignment refine that structure
- later fine adjustments may allow drag-and-drop repositioning if needed

### Layout And States

`Content Layout` follows the current state editing context.

That means:

- base layout defines the default content arrangement
- any selected state may override layout properties if needed
- if no override exists, the state inherits the base layout

This allows examples such as:

- selected state moves icon and text slightly
- hover state changes spacing or alignment
- active state swaps from text-only to icon-plus-text if the design calls for it

### Full Layout Swaps Per State

Full layout-mode swaps per state should be allowed.

That means a state may override not only:

- spacing
- padding
- alignment
- minor positioning

but also the actual layout mode itself.

Examples:

- base layout = `icon_left_text_right`
- selected state = `text_only`
- hover state = `overlay_centered`

Rule:

- the editor must make it obvious when a state inherits the base layout
- and equally obvious when a state defines its own full layout override

#### `States`

Owns:

- visual state definitions
- state preview/testing hooks
- per-state overrides to presentation

#### `Behavior`

Owns:

- button-type-specific interaction rules
- timing rules
- group rules
- execution rules

#### `Value`

Owns:

- stored/displayed state
- default value
- payload translation
- send/receive mapping

## States

`States` is a universal section and should remain part of the new button system.

This was one of the useful parts of the legacy system and should be preserved in a simpler form.

### Purpose

The `States` section defines how a button looks and presents itself while its logic changes over time.

It is primarily a presentation system, but it reflects real logical conditions.

### Universal States

These should be available for all button types:

- `default`
- `hover`
- `pressed`
- `focused`
- `disabled`

### Optional States

These appear only when relevant to the inserted button type:

- `active`
- `selected`
- `mixed`
- `pending`
- `loading`
- `executed`

Examples:

- `active` for toggle buttons
- `selected` for radio button groups
- `mixed` for tri-state cyclic behavior
- `pending` for timed or async one-shot flows
- `executed` for one-shot lockout

### States Rules

- the `States` section in the properties panel should still allow the user to select and configure a state from the top of that section
- the old separate mini state icons in the properties-panel icon bar should be removed
- state selection should move to the quick-settings bar above the display panel
- those state buttons should only appear there when the `States` section is selected in the properties panel
- simple state testing must not require wiring bindings manually

### Quick Settings Bar

The area above the display panel should become a section-sensitive quick settings bar.

For clarity in this document, that UI region is referred to as the:

- `Display Toolbar`

That means:

- it remains available as a UI/control strip above the preview
- its contents change depending on the section currently selected in the properties panel
- it provides fast controls without replacing the detailed editor below

Examples:

- `States` selected -> state buttons appear there
- `Text` selected -> font/color quick controls may appear there
- `Icon` selected -> icon asset/tint/size quick controls may appear there
- `Background` selected -> color/fill quick controls may appear there

### State Editing Flow

For state editing:

- the `Display Toolbar` above the display panel becomes the place where the user picks the active state
- the preview remains the live visual result
- the properties panel remains the detailed configuration area for the currently selected state

### States UX Goal

The user should not have to mentally jump between:

- state switching controls hidden in one place
- the preview result in another place
- the detailed configuration in a third disconnected place

Instead:

- the `Display Toolbar` should make the current state explicit
- the preview should show the live result of that selected state
- the properties panel should reflect that choice immediately

### States Scope

The `States` section should focus on presentation overrides.

It should not become a general-purpose state machine editor.

Meaning:

- good: hover fill colour, active text style, disabled opacity
- not good: building full execution logic by chaining states together

### State Context Across Sections

When a state is selected, that state becomes the current editing context across the visual sections.

That means the selected state is not only edited inside the `States` section itself.

It also affects editing in:

- `Background`
- `Border`
- `Text`
- `Icon`
- `Content Layout`

Workflow:

- user selects a state from the `Display Toolbar`
- properties panel switches to that state context
- visual sections now edit that state's overrides
- preview shows the same state live

This allows state-specific editing for:

- colours
- borders
- text styling
- icon styling
- icon placement
- text placement
- spacing/padding/alignment

### State Inheritance

State-specific edits should inherit from the base section values unless explicitly overridden.

Rule:

- base section values define the normal/default appearance
- selected state may override only the properties it needs
- if no override exists, the state inherits the base value

This keeps the system powerful without forcing every state to redefine every section property.

Additional rule:

- states act as partial visual diffs, not total replacements
- unchanged properties should fall back to the currently visible underlying state so a hover background can merge safely with an active border

### Group-Level vs Item-Level State Editing

For grouped button sections such as radio-style groups, segmented groups, or tab groups, the editor must distinguish between:

- `Group` context
- `Item State` context

#### Group Context

Used for properties that affect the whole section/group.

Examples:

- group background
- group border
- whole-group disabled presentation
- overall group layout

#### Item State Context

Used for the individual button/item states inside that group.

Examples:

- `default`
- `hover`
- `pressed`
- `focused`
- `selected`
- `disabled`

For most radio-style or segmented groups, the most important state editing is item-level.

### Group Editing Workflow

Recommended workflow:

- select the group component
- choose whether editing target is `Group` or `Item State`
- if `Item State` is selected, use the `Display Toolbar` to choose the active state
- properties panel then edits that exact context

Example:

- choose `Item State: selected`
- open `Text`
- edit selected-state text styling/content
- open `Icon`
- edit selected-state icon styling/placement
- open `Content Layout`
- edit selected-state layout overrides if needed

### State Priority

State priority should follow this model:

- `disabled` has highest priority
- `executed` and `pending` are high-priority contextual states
- `pressed` overrides `hover`
- `hover` overrides passive base presentation
- `active` / `selected` / `mixed` act as persistent base states
- `focused` should be additive whenever possible rather than replacing the other active state visuals

Suggested priority order:

1. `disabled`
2. `executed`
3. `pending`
4. `pressed`
5. `hover`
6. `active` / `selected` / `mixed`
7. `default`

And:

- `focused` is additive where supported

## Behavior

`Behavior` is a universal section, but its fields are contextual to the inserted button type.

`Behavior` answers one question:

- what does this button do when the user interacts with it?

This is different from `Value`, which answers:

- what state/value does this button hold, display, send, or receive?

### Behavior Contract

For every button type, `Behavior` should define:

- how input is interpreted
- when execution happens
- whether state persists after interaction
- whether repeated interaction is allowed
- whether the button affects sibling buttons
- whether time-based gates are required before execution

The goal is that each inserted button type has a clear semantic contract before specific field editing begins.

### 1. Momentary Behavior Contract

Meaning:

- the button does not preserve an active logical state after the interaction completes
- it reacts to the interaction and then returns to neutral

Subtypes:

- `action`
- `repeating`
- `press_to_talk`

Execution model:

- `action`: emits once at the configured trigger point
- `repeating`: emits continuously while held after optional delay
- `press_to_talk`: remains logically active only while held

State relationship:

- may use `pressed` visually
- does not remain `active` after the interaction unless explicitly modeled elsewhere

### 1. Momentary Behavior Fields

First-pass:

- `Fire On`
  - `onPressStart`
  - `onRelease`
- `Repeat Enabled`
- `Repeat Delay`
- `Repeat Interval`

Presentation hook:

- `Active While Held`

### 2. Toggle Behavior Contract

Meaning:

- the button stores a persistent binary state
- each valid interaction may flip that stored state

Subtypes:

- `toggle`
- `sticky`

Execution model:

- interaction changes the stored state
- stored state remains until changed again

State relationship:

- commonly drives `active`
- may also affect text/icon substitutions through `Value`

### 2. Toggle Behavior Fields

First-pass:

- `Default State`
- `Allow Uncheck`

### 3. Radio Button Group Behavior Contract

Meaning:

- the button belongs to a logical radio-style group/section
- selection behavior is determined by the group's selection mode

Subtypes:

- `segmented`
- `radio`
- `tab`

Execution model:

- in `single` mode, selecting one item clears the others
- in `multi` mode, multiple items may remain selected at once

State relationship:

- commonly drives `selected`
- may also drive `active` visually depending on style

### 3. Radio Button Group Behavior Fields

First-pass:

- `Group ID`
- `Default Selected`
- `Allow Deselect`
- `Visual Style`
  - segmented
  - tab
  - radio-style button
- `Selection Mode`
  - single
  - multi

Rule:

- use one property name only
- prefer `Allow Deselect`
- avoid combining two opposite meanings into one label

Important note:

- a radio-style section/group in CEditor does not have to be strictly exclusive
- the visual style may look like radio buttons while the logical selection mode still allows multiple selected items
- so "radio-style" and "exclusive" must not be treated as permanently identical concepts

### Radio Button Group Default Selection Rule

Default selection must match the configured selection mode.

In `single` mode:

- exactly zero or one default item may be selected, depending on configuration

In `multi` mode:

- multiple default items may be selected

Implementation guidance:

- defaults should be authored at the row/item level
- the group should not rely on one singular default flag when multi-select is allowed

### 4. Cyclic Behavior Contract

Meaning:

- the button advances through an ordered list of defined states
- each valid interaction moves to the next logical entry

Subtypes:

- `cycle`
- `tri_state`

Execution model:

- interaction increments the current state index
- behavior may wrap or stop at the end depending on configuration

State relationship:

- may drive `active`, `mixed`, or other contextual presentation states
- often uses `Value` to define labels/payloads per state

### 4. Cyclic Behavior Fields

First-pass:

- `States Array`
- `Wrap Behavior`
- `Default State Index`

### 5. Timed Behavior Contract

Meaning:

- the button requires a timing condition before execution is considered valid

Subtypes:

- `hold_to_confirm`
- `double_click`

Execution model:

- `hold_to_confirm`: executes only after the required hold duration completes
- `double_click`: executes only after the required interaction count occurs within the click window

State relationship:

- commonly uses `pressed`
- may use `pending` during hold/countdown windows

### 5. Timed Behavior Fields

First-pass:

- `Hold Duration`
- `Required Clicks`
- `Click Window`
- `Show Progress`

### 6. One-Shot Behavior Contract

Meaning:

- the button is allowed to execute once, then changes its own availability rules

Subtype:

- `single_use`

Execution model:

- valid execution sets an executed/locked state
- future interaction is blocked or deferred according to configuration

State relationship:

- commonly uses `executed`
- may use `disabled`
- may use `pending` while waiting for confirmation

### 6. One-Shot Behavior Fields

First-pass:

- `Disable After Use`
- `Disable Label`
- `Pending Label`

### Advanced Behavior Fields

These are valid, but should be marked as advanced or later-phase fields rather than first-pass button authoring:

- `Debounce`
- `Throttle`
- `Loading`
- `Await Promise / Async Flag`
- `On Abort Logic`
- `Lockout Duration`
- `Persistence Key`

Reason:

- these are closer to application/runtime orchestration than to core button setup
- they should not make the first implementation harder than necessary

## Value

`Value` should be built around a list generator.

This list generator defines:

- what the user sees on the button
- what value the button internally represents
- what value the button sends externally
- what value it expects to receive externally if receive-mapping is used

This is preferable because:

- the displayed state of the button
- the internal state of the button
- the external value the button sends or receives

are all closely related and should be authored together.

Important rule:

- `Value` should be user-language oriented
- it should not expose low-level signal plumbing as the primary model

## Value List Generator

The `Value` section should present a row-based list editor.

Each row represents one logical state/value entry.

At minimum, each row should be able to define:

- `Display Text`
- `Internal Value`
- `Send Value`

Optional later:

- `Receive Value`
- alternate label/icon references
- per-row style hooks if ever needed

### Authoring UX

The list generator should include:

- `+` button to add a row
- `-` button to remove a row
- drag or ordering controls later if reordering is needed

The goal is that the user can quickly build a state/value table without thinking about enum schemas or mapping code.

### Example

| Display Text | Internal Value | Send Value |
|---|---:|---:|
| Off | 0 | 0 |
| Auto | 1 | 64 |
| On | 2 | 127 |

In this example:

- the button may show `Off / Auto / On`
- the internal state may be `0 / 1 / 2`
- the external MIDI/JUCE value may be `0 / 64 / 127`

### Button Types That Use The List Generator

Most useful for:

- `Cyclic Button`
- `Radio Button Group` sections
- multi-state toggle patterns

Also usable for:

- `Toggle Button`
  - with two rows, for off/on
- `Momentary Button`
  - when the action needs a configurable payload

### Default Rules By Type

Suggested defaults:

- `Toggle Button`: prebuild two rows
- `Radio Button Group`: prebuild two rows as an example starting point
- `Cyclic Button`: uses the full ordered list directly
- `Momentary Button`: default to a simple label-first UI and reveal a single-row payload table only when needed

### Value Fields By Button Type

First-pass examples:

#### Momentary

- by default, keep the value UI minimal and expose the normal `Label` field first
- hide the full row table unless the user explicitly wants to attach payload or send mapping data
- provide a `Show Data / Send Mapping` control that expands the full single-row value editor when needed

#### Toggle

- two-row list model
- off row
- on row

#### Radio Button Group

- group-level list generator may define all entries in the section
- each row becomes one selectable button/item in that group
- a single radio-style button is equivalent to one row
- generated items inherit from a shared item template by default
- each row may override visual properties when needed

Example:

- one row -> one button/item
- two rows -> two buttons/items in the same section/group
- more rows may be added as needed using `+`

### Radio Button Group Item Inheritance

Generated items should follow this model:

- the group owns the shared item template
- rows provide the value/data entries
- rows may optionally override visual properties

Shared item template should define the common base for generated items, including:

- `Background`
- `Border`
- `Text`
- `Icon`
- `Effects`
- `Content Layout`
- `States`

Rule:

- if a row does not override a visual property, it inherits from the shared item template
- if a row does override a visual property, that row-specific value wins
- row overrides are property-specific sparse deltas, not state-wide replacements
- if a row overrides the base background colour, it should still inherit the template's hover background unless that row's hover state is also explicitly overridden

#### Cyclic

- ordered rows from the list generator define the cycle directly

### Value Mapping Rule

The list generator is the primary place where portrayed text and external send values are paired together.

That means the user should not have to configure:

- text in one area
- internal state somewhere else
- MIDI/JUCE send values in a third disconnected place

These should be authored together per row.

### Advanced Value Fields

These are valid, but should be marked advanced or later:

- complex external send mappings
- complex receive translation tables
- transport/protocol-specific JUCE wiring details
- application-level payload schemas

## What Should Be Automatic

The editor should automatically handle:

- pressed visual state
- hover visual state
- focused visual state
- active/checked visual state where relevant
- clearing conflicting selections in `Radio Button Group` when `Selection Mode = single`
- cycling state order for cyclic buttons
- hold timing for timed buttons

These should not require manual binding setup for normal use.

## What Should Not Be In Basic Button Setup

The default authoring UI should not expose these as required concepts:

- `family`
- `role`
- `valueType`
- manual binding graphs
- part trees
- generic state patch maps
- runtime signal routing

Those may exist internally, but they must not be the primary mental model for building a button.

## Internal Runtime Model

The internal implementation may still use structured state, but it should map directly to the button type.

Recommended internal shape:

- `buttonType`
- `subtype`
- `defaultState`
- `behavior`
- `group`
- `timing`
- `value`
- `presentation`

## Initial Scope For Rewrite

The first implementation pass should only build these:

- `Momentary Button`
- `Toggle Button`
- `Radio Button Group`
- `Cyclic Button`
- `Timed Button`
- `One-Shot Button`

And in the same pass, the shared visual workflow should also be applied to:

- `Label`

The first pass should not attempt:

- sliders
- knobs
- compound numeric steppers/spinboxes
- generalized interaction graphs
- arbitrary control families
- universal binding editors for simple buttons

## Success Criteria

The redesign is successful if:

1. A normal action button can be authored in under a minute.
2. A toggle button can be authored without thinking about boolean state plumbing.
3. Radio button groups feel obvious and self-contained.
4. Timed and cyclic buttons are explicit behaviors, not hacks built from generic state machinery.
5. The button UI reads like product language, not engine language.

## Decision

This spec becomes the source of truth for the button rewrite.

Implementation should follow this document, not the legacy interaction system.
