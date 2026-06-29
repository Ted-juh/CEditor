# Number Field / Stepper — Findings & Spec

> Status: **spec — smaller than it looked.** Number entry + steppers is *already*
> provided by the Range/spinbox; the gap is naming/discoverability and an optional
> bare variant. Part of the [panel parts backlog](./README.md); see
> [component-gaps.md](./component-gaps.md).

## Key finding: Range already IS a number field with steppers

The existing **Range** control is a spinbox, not a min–max slider:

- `Behavior.role: 'spinbox'`, `valueType: 'int'`, `min`/`max`/`step`.
- Parts: **`decrement` · `valueField` · `increment`** (interactionDefaults.js).
- `valueField` renders an editable `<input>` via
  `editor/InteractivePartRenderer.svelte` (type-in, commit on Enter).
- Stepping/parse/scrub all live in `utils/rangeBehavior.js`
  (`adjustRangeValue`, `parseRangeInputValue`, `snapRangeValue`,
  `scrubRangeValue`) and are wired in `PanelPreviewSurface.svelte`
  (arrow/page keys, wheel, +/- button zones).
- Same `value` port as Slider (numeric, continuous); exports as a numeric param.

**So the functionality exists.** The real gaps are:

1. **Discoverability / naming** — "Range" reads like a slider; users won't find
   the number entry there.
2. **No bare (stepper-less) variant** in the palette.
3. **Default size** is 180×40 (wide for a number box).

## Recommended path — Range presets (cheap, like the Knob)

Reuse Range entirely; add palette presets + clearer labels.

### Files to change (2)

1. **`layout/IconPanel.svelte`** — add palette entries:
   - **"Number"** → Range, compact (~90×34), steppers on.
   - **"Number (plain)"** → same, with steppers hidden (see below).
   - Consider relabeling the existing Range entry to "Number / Spinbox" so it's
     discoverable.
2. **`models/componentTypes.js`** *(optional)* — if presets need distinct
   default overrides, add `Number` / `NumberPlain` preset entries that reuse the
   Range sections with:
   - `Transform: { width: 90, height: 34 }`,
   - for the plain variant, `Parts.decrement.visible = false` +
     `Parts.increment.visible = false` (the renderer already honors
     `part.visible !== false`).

### Reused — no change

`InteractivePartRenderer.svelte` (editable input), `rangeBehavior.js`,
`CanvasControl.svelte` (parts rendering), `PanelPreviewSurface.svelte` (range
handlers), `componentPorts.js` (`value` port), `exportParameters.js` (numeric).

## Alternative — a dedicated `Number` controlType

Only if the shared-with-Range behavior becomes awkward. A new `Number` type
reusing the same machinery but with a **valueField-only** parts set and a
numeric-only behavior (drop drag/track/wheel cruft), ~80×34 default. Files:
`componentTypes.js`, `interactionDefaults.js` (Number branches for behavior /
parts / states), `componentPorts.js`, optional `NumberEditor.svelte`. Cleaner
palette semantics, slightly more code.

**Recommendation:** start with **Range presets**; promote to a controlType only
if needed.

## Verification checklist

1. Insert "Number" → compact box with +/- steppers; "Number (plain)" → bare box.
2. Type a value + Enter, or arrow/page/wheel/steppers → value changes, snaps to
   step, clamps to min/max.
3. Bind the `value` port to a numeric device parameter → two-way works.
4. Export → appears as a numeric parameter (same as Range).

## Notes

- This is a good example of checking before building: the "missing" Number field
  was mostly a **naming problem**, not absent functionality.
- If presets land, update `component-gaps.md` to re-tag Number field as covered.
