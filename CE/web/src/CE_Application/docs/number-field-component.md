# Number Field / Stepper — Findings & Spec

> Status: **implemented** (model layer). `Number` is a new `controlType` reusing
> the Range/spinbox engine (family=range, role=spinbox, decrement/valueField/
> increment parts) — no renderer/interaction changes. Done in `componentTypes.js`
> (Number, 96×34), `interactionDefaults.js` (Range branches now serve Number),
> `componentPorts.js` (value port), `IconPanel.svelte` (palette). Verified via
> `createControl('Number')`. Part of the [panel parts backlog](./README.md); see
> [component-gaps.md](./component-gaps.md).

## Key finding: Range already IS a number field with steppers

The existing **Range** control is a spinbox, not a min–max slider:

- `Behavior.role: 'spinbox'`, `valueType: 'int'`, `min`/`max`/`step`.
- Parts: **`decrement` · `valueField` · `increment`** (interactionDefaults.js).
- `valueField` renders an editable `<input>` via
  `editor/InteractivePartRenderer.svelte` (type-in, commit on Enter).
- Stepping/parse live in `utils/rangeBehavior.js`
  (`adjustRangeValue`, `parseRangeInputValue`, `snapRangeValue`); drag-scrub
  goes through the shared `scrub/dragScrub.ts` core via
  `utils/scrubRuntime.js` (`createRangeScrub`). Wired in
  `PanelPreviewSurface.svelte` (arrow/page keys, wheel, +/- button zones).
- Same `value` port as Slider (numeric, continuous); exports as a numeric param.

**So the functionality exists.** The real gaps are:

1. **Discoverability / naming** — "Range" reads like a slider; users won't find
   the number entry there.
2. **No bare (stepper-less) variant** in the palette.
3. **Default size** is 180×40 (wide for a number box).

## Recommended path — a `Number` controlType reusing the Range engine

Per the **shared-engine-separate-components** principle
([ready-made-vs-custom.md](./ready-made-vs-custom.md)), Number is its **own
palette entry / `controlType`**, chosen directly — not a preset toggled inside
Range. It *reuses* the Range engine under the hood.

### Files to change
1. **`models/componentTypes.js`** — add a `Number` `controlType`: reuse the Range
   sections, `Transform: { width: 90, height: 34 }`. A `showSteppers` Behavior
   flag (default on) hides the `decrement`/`increment` parts for a bare field —
   that's an in-category preset, fine.
2. **`models/interactionDefaults.js`** — `Number` branch: same spinbox behavior
   as Range (or trimmed to valueField-only when steppers off).
3. **`models/componentPorts.js`** — `Number`: same `value` port as Range.
4. **`layout/IconPanel.svelte`** — a "Number" palette entry (own button). Also
   consider relabeling **Range → "Number / Spinbox"** for discoverability, since
   that's what it actually is.

### Reused — no change

`InteractivePartRenderer.svelte` (editable input), `rangeBehavior.js`,
`CanvasControl.svelte` (parts rendering), `PanelPreviewSurface.svelte` (range
handlers), `exportParameters.js` (numeric).

> Note: steppers on/off *is* a legitimate within-component preset (both are "a
> number field"). What we avoid is making Number a hidden mode of the *Range*
> component — it's its own entry.

## Verification checklist

1. Insert "Number" from the palette → compact box with +/- steppers;
   `showSteppers: false` → bare box.
2. Type a value + Enter, or arrow/page/wheel/steppers → value changes, snaps to
   step, clamps to min/max.
3. Bind the `value` port to a numeric device parameter → two-way works.
4. Export → appears as a numeric parameter (same as Range).

## Notes

- This is a good example of checking before building: the "missing" Number field
  was mostly a **naming problem**, not absent functionality.
- If presets land, update `component-gaps.md` to re-tag Number field as covered.
