# Interactive Components Implementation Spec

## Goal

Unify interactive controls under one shared architecture that extends the existing
section system instead of replacing it. The implementation slice in this repo
delivers a working first pass around:

- `Behavior`
- `States`
- `Bindings`
- `Animations`
- Preview/debug plumbing
- Built-in interactive component templates for buttons, toggles, and sliders

This slice is intentionally staged. It proves the interaction architecture in
the live editor and renderer before the full custom Component Designer and
Animation Designer are opened up.

## Design Principles

1. The component must work without animations.
2. The component must keep using the shared section language:
   `Background`, `Text`, `Icon`, `Effects`, `Mouse`.
3. `Behavior` defines how the control acts.
4. `States` define discrete visual overrides.
5. `Bindings` define value-driven layout/property changes.
6. `Animations` define how changes transition over time.
7. Preview/debug must be available before the full authoring flow is considered
   complete.

## Sections

### Behavior

Defines the interaction family, role, and value model.

Primary fields:

- `family`: `trigger | select | range`
- `role`: `button | toggle | slider | custom`
- `valueType`: `none | bool | int | float | enum`
- `defaultValue`
- `selectionMode`
- `groupId`
- `orientation`
- `min | max | step`
- keyboard/input flags

### States

Stores additive/exclusive state definitions as override patches.

Key rules:

- Keep a `priority` list at section level.
- Apply state patches to root sections and/or named parts.
- Support multiple active states at once.
- Use compound states only when a combination needs a unique override.

### Parts

Stores named internal sub-elements for advanced controls and future custom
components.

This slice includes:

- structural schema support
- a simple part renderer for named built-in parts
- slider parts (`track`, `fill`, `thumb`)

The full interactive layer-by-layer editor is deferred.

### Bindings

Maps value or runtime signals into part or root properties.

This slice supports:

- `value.raw`
- `value.normalized`
- `value.bool`
- interaction state sources

Target support focuses on:

- layout offsets
- layout width/height
- rotation
- opacity
- scale

### Animations

Stores transition definitions separately from component configuration.

This slice supports:

- transition metadata editing
- automatic CSS transition wiring for supported target properties
- debug visibility in preview

The full timeline/keyframe Animation Designer is deferred, but the section shape
is now stable so it can be added later without changing component data.

## Runtime Order

For each rendered control:

1. Start from stored control data.
2. Resolve preview/runtime interaction signals.
3. Apply bindings.
4. Apply active state patches.
5. Derive animation transition styles for supported properties.
6. Render the resolved control and any built-in parts.

## Preview / Debug

Preview is hosted in the Display Panel instead of locking the main canvas into a
special authoring mode.

The preview slice supports:

- forcing `hover`, `pressed`, `focused`, `disabled`, `checked`, `mixed`,
  `dragging`
- overriding value
- toggling animation enablement
- dumping resolved interaction debug output to the Debug panel

## Implemented Component Slice

### Button

- Root rendering uses the existing shared sections.
- `Behavior`, `States`, and `Animations` are wired.

### ToggleButton

- Extends button behavior with boolean selection.
- Uses root section patches for `checked`.

### Slider

- Uses named built-in parts.
- Value-driven thumb/fill movement is handled by `Bindings`.
- Thumb/fill movement can be smoothed by `Animations`.

## Deferred Work

- Full open `Parts` editor
- Checkbox/radio/segmented item templates
- Full Animation Designer
- Full custom component authoring UI
- Wider animatable-property support
- Nested/repeated/generated parts
