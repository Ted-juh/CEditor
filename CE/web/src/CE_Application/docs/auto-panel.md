# Auto-Panel Generator — Feature Design

> Status: **design.** Generate a complete editor panel from a device profile.
> A *feature*, not a placeable component — the biggest adoption unlock. Part of
> the [panel parts backlog](./README.md); ideation in
> [groundbreaking-components.md](./groundbreaking-components.md).

## What

Drop a device profile → **generate a full editor panel**: one control per
parameter, grouped by the device's structure, with the control **type chosen by
parameter type** (knob for continuous, combobox for enum, toggle for bool,
number for stepped, text for patch-name…). Hours of manual layout → seconds.

## How

- **Read the DPD** (`listProfileParameters`, the device-structure model from
  `DpdDeviceStructureScreen`) → for each parameter: pick a `controlType` by type,
  `createControl`, bind it to the parameter via `DeviceBindings`.
- **Group & lay out** by device section/structure (auto-layout into rows/sections
  with labels).
- **Reuse:** DPD · `componentTypes` factory · binding · auto-layout.
- **New:** the generator — param→component **mapping rules**, the
  **grouping/layout** algorithm, labels/naming, and sensible defaults
  (sizes/spacing).

## Where

- An editor **action/command** ("Generate panel from profile"), not a component.
  Output is a normal, fully-editable panel the user then refines.

## When

- Instant editor for any profiled device — the strongest reason to adopt CEditor.
  Especially powerful combined with the LCD, meters, and bound controls all
  wiring up automatically from the DPD.

## New work

The mapping rules (type → control), the layout/grouping algorithm, and a config
(density, which sections, naming). Everything it places already exists.

## Open questions

- Mapping policy (which control for which type/range; when to use knob vs slider).
- Layout strategy (grid vs sectioned; sizing).
- Regenerate vs merge (re-run after a profile change without losing edits).
