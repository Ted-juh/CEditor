# Knob — Component Integration Spec

> Status: **ready to implement.** A Knob is a new `controlType` that reuses the
> slider family's existing circular geometry. Part of the
> [panel parts backlog](./README.md); see [component-gaps.md](./component-gaps.md).

## Decision

Implement **Knob as a new `controlType`**, not a Slider instance with circular
geometry. Rationale:

- The slider family **already fully supports circular geometry** (rendering,
  interaction, geometry math, labels, ticks) — so there is no engine work.
- A Knob is semantically distinct (a compact rotary dial) and deserves its own
  palette entry, default size, and preset — packaging, not new mechanics.
- `family: 'range'` + `role: 'slider'` + `geometry: 'circular'` +
  `valueMode: 'single'` is an already-supported configuration; Knob just makes
  it a first-class, one-click control.

Result: **4 files change, ~70 lines total**; ~19 touchpoints need nothing because
family/role dispatch routes Knob through the slider path automatically.

## Files to change (4)

### 1. `models/componentTypes.js` — register the type
Add a `Knob` entry to `COMPONENT_TYPES`, mirroring `Slider` but with a square
default size and the standard interactive sections:

```js
Knob: {
  sections: ['Mouse','Behavior','Parts','Bindings','DeviceBindings','States','Animations','Scripts'],
  ports: getComponentPorts('Knob'),
  defaultOverrides: {
    Transform: { width: 100, height: 100 },          // square; auto-sizes the dial
    Mouse: { cursor: 'pointer', interceptClicks: true, focusable: true, tabIndex: 0, draggable: true },
    ...createDefaultInteractiveSections('Knob'),
  },
}
```

### 2. `models/interactionDefaults.js` — the only real authoring
`createDefaultInteractiveSections('Knob')` dispatches on the type string, so add
a `Knob` branch to each `createXxxDefaults`:

- **`createBehaviorDefaults('Knob')`** — copy Slider's, but default
  `geometry: 'circular'`, `valueMode: 'single'`, `startAngle: 225`,
  `sweepAngle: 270`, `direction: 'cw'`, `circularDiameter: 0` (auto). Keep the
  rest (min/max/step/keyboard/ticks/readout) from Slider.
- **`createPartsDefaults('Knob')`** — reuse `createSliderSemanticParts()` (same
  track/fill/pointer/label/tick parts as Slider).
- **`createStatesDefaults('Knob')` / `createBindingsDefaults('Knob')` /
  `createAnimationsDefaults('Knob')`** — identical to Slider (delegate to the
  same logic).

> Keep Knob's branches thin — delegate to the Slider implementations and only
> override the geometry defaults.

### 3. `models/componentPorts.js` — binding port
Add a `Knob` entry to `DEFAULT_COMPONENT_PORTS`, identical to `Slider`:

```js
Knob: [
  { id: 'value', label: 'Value',
    accepts: [PARAMETER_TYPES.INTEGER, PARAMETER_TYPES.FLOAT, PARAMETER_TYPES.BIPOLAR, PARAMETER_TYPES.NORMALIZED],
    defaultBindingMode: 'continuous' },
]
```

### 4. `layout/IconPanel.svelte` — insert palette
Add a Knob button to the value-controls group (next to Range/Slider) and import
an icon (e.g. lucide `Disc3` / `CircleDot`):

```js
{ type: 'Knob', icon: Disc3, label: 'Insert Knob' },
```

Insertion wiring is automatic: `handleInsert` → `addControl(type)` →
`COMPONENT_TYPES[type]`.

## Touchpoints that need NO change (reused as-is)

These already handle Knob because it is `family:'range'` + `role:'slider'`:

- **`sectionDefaults.js`** — `Behavior` already defines all circular fields
  (`geometry`, `circularDiameter`, `startAngle`, `sweepAngle`, `direction`).
- **Rendering** — `editor/CanvasControl.svelte` (`isSliderControl` derives from
  family/role → routes to `SliderFamilyRenderer`); `SliderFamilyRenderer.svelte`
  already renders circular tracks/arcs/pointers/ticks/labels.
- **Interaction** — `utils/interactionRuntime.js`, `utils/sliderGeometry.js`,
  `utils/sliderBehavior.js` (angle↔value math, circular drag) and
  `stores/interactionPreview.js` / `editor/PanelPreviewSurface.svelte`.
- **Properties UI** — `panels/PropertiesPanel.svelte` shows the Slider + Label
  tabs for family=range+role=slider; `sections/SliderEditor.svelte` already has
  circular presets; `SliderLabelEditor.svelte` handles circular label anchors.
- **Export / Player** — `utils/exportParameters.js` treats `family:'range'` as an
  automatable min/max/default param; `scripting/scriptPanelExport.js`,
  `Player/PanelParameters.h`, `Player/PanelValueModel.h` are all
  component-type-agnostic.

## Optional polish

- In `SliderEditor.svelte`, optionally default the Knob to the circular preset
  view (or hide linear presets) so a freshly inserted Knob looks like a dial
  immediately. Not required — the `geometry:'circular'` default already does this.

## Verification checklist

1. Insert a Knob from the palette → renders as a circular dial.
2. Drag it → value changes via angle; keyboard/wheel adjust works.
3. Bind it to a numeric device parameter (the `value` port) → two-way works.
4. Properties → Slider tab shows; circular presets apply.
5. Export a panel containing a Knob → appears as an automatable parameter; loads
   in the Player.

## Notes

- This same pattern (new `controlType` reusing an existing family) is the model
  for the other `[preset]`-tagged gaps in `component-gaps.md` (pitch/mod wheel,
  framed group, etc.).
