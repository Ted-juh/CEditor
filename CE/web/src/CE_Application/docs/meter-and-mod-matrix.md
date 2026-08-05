# Meter & Mod Matrix — Investigation (+ the two cross-cutting gaps)

> Status: **shipped 🟢** — both landed as `ce.components.meter` (25 members) and
> `ce.components.matrix` (11). Original investigation follows; its two cross-cutting
> findings are what made them buildable.
>
> Original status: **investigation / findings.** Both resolve to configs/presets over
> existing engines; together they reveal the two foundational capabilities the
> whole synth tier actually needs. Part of the
> [panel parts backlog](./README.md); see [component-gaps.md](./component-gaps.md).

## Meter — shipped 🟢

Built as its own palette `controlType` (like the displays), not a slider preset —
a read-only, value-driven level meter. Files: pure engine
`utils/meterLayout.js` (+ `test/meterLayout.test.js`), `editor/MeterRenderer.svelte`,
`sections/MeterEditor.svelte`, model in `componentTypes`/`componentPorts`/
`sectionDefaults` (a `Meter` section), dispatch in `CanvasControl`, live value +
peak in `PanelPreviewSurface.applyMeterValueSource`.

- **Orientations:** horizontal bar, vertical bar, radial arc.
- **Fill:** continuous (zone gradient, hard-step or smooth) or N discrete LED
  segments; track colour, thickness, corner radius.
- **Zones:** threshold colour stops (green→amber→red), each lighting the fill
  from its position upward; colours the continuous gradient and each segment.
- **Scale:** linear or dB (`dbFloor`/`dbCeil`), optional tick marks.
- **Peak-hold:** a marker that jumps to the recent maximum, holds, then falls
  (`peakHoldMs` / `peakDecayPerSec`), driven by a lazy rAF ticker in preview.
- **Readout + caption:** optional numeric value (precision/prefix/suffix) and a
  label above/below.
- **Value source:** the `level` device port (inbound) drives it at runtime; in
  preview a linked range control (`valueSourceId`) or the static value does — the
  same value-driven-display machinery as the LCD, so the read-only "shows an
  inbound value" capability below is satisfied for the Meter.

Remaining: true two-way hardware feedback still depends on the inbound-MIDI
wiring (Phase 0, code-written but unbuilt) for the `level` port to move from a
live device value.

## Meter / Bargraph / LED (original investigation)

Mostly a **configuration of existing engines**, not a new primitive:

- **Analog meter = a read-only slider.** The slider family already has a
  value-driven `bodyTrackFill` part, `fillOrigin`, `showValueReadout`, and
  Animations that bind `Parts.bodyTrackFill.Layout.width` to the value
  (`interactionDefaults.js`). Drive the fill from an inbound value and disable
  interaction → a meter.
- **Segmented LED bargraph = a Generator grid.** Custom-component Generators emit
  `grid` cells (rows×columns); bind each cell's lit state to the value.
- **Missing piece:** a **read-only / output-only mode** where the value comes
  from a device *input*, not user drag. Shared with the LCD.

## Mod Matrix — shipped 🟢

Built as its own `Matrix` palette controlType (sources = rows × destinations =
columns), using the fan-out binding mechanism above. Files: pure engine
`utils/matrixLayout.js` (+ `test/matrixLayout.test.js`), `editor/MatrixRenderer.svelte`,
`sections/MatrixEditor.svelte`, `Matrix` section + controlType, dynamic per-cell
ports in `componentPorts` (`getComponentPorts` Matrix branch → `matrixPorts`),
`controlPortValues` Matrix resolver, cell drag in `PanelPreviewSurface`.

- **Grid:** editable rows/cols (add/remove/relabel; amounts preserved on resize),
  bipolar (−1..1) or unipolar (0..1), row/col label headers.
- **Cell styles:** centre-bar (green up / red down), fill heatmap, dot; optional
  per-cell numeric value.
- **Interaction:** knob-style vertical drag per cell (live session copy →
  committed to the model on release), optional snap step.
- **Fan-out binding:** every cell is a bindable port (`cell_r_c`, labelled
  "Source → Destination") — the DeviceBindings editor lists all N×M, and dragging
  a cell emits its amount to the bound device parameter. The "binding fan-out"
  the original investigation flagged as the missing piece is done (shipped with
  the Envelope; the Matrix reuses it).

## Mod Matrix (original investigation)

**Buildable on existing engines:**
- Generators already emit grid cells (`rows × columns`, `parts = rows*columns` —
  `sections/CustomGeneratorsEditor.svelte`), so a routing grid is generatable;
  per-cell controls bind via Bindings / ValueChannels.
- So a "set" Mod Matrix reuses the Generator-grid engine, **shipped as its own
  palette entry / `controlType`** (chosen directly — not a preset of another
  component; see [ready-made-vs-custom.md](./ready-made-vs-custom.md)).
  **Missing piece:** the **binding fan-out** — N×M cells → N×M routing
  parameters.

## Fan-out binding — mechanism shipped 🟢

The "one component → many device parameters" capability now exists as a general
mechanism (first used by the Envelope): a controlType-keyed resolver
(`utils/controlPortValues.js`) returns a value per semantic port, and
`PanelPreviewSurface.emitControlPortFanout` sends every bound port to its device
parameter. The DeviceBindings model already carries a `port` per binding and the
editor already lists a control's ports + adds a binding each — so the **Mod
Matrix** now only needs its grid component (N×M cells → N×M ports), not new
binding infrastructure.

## The synthesis — two cross-cutting capabilities

Across the synth tier, two foundational capabilities keep surfacing as the real
gaps, bigger than any single widget:

1. **Value-driven display / read-only output mode** — a control that *shows* an
   inbound device value rather than being user-driven.
   → needed by **Meter** and the **LCD** (bound fields).
2. **Multi-parameter / fan-out binding** — one component bound to *many* device
   parameters at once.
   → needed by the **Envelope** (per-node) and the **Mod matrix** (per-cell).

**Implication:** the highest-leverage work is **these two capabilities**, not
widget-by-widget building. Once they exist, Meter, Mod matrix, Envelope, and the
LCD's bound fields all become cheap presets/configs over existing engines.

## Recommendation

- **Meter** → its own palette `controlType` reusing the slider fill engine
  (analog) or Generator grid (LED); gated on the read-only/value-driven display
  mode.
- **Mod matrix** → its own palette `controlType` reusing the Generator-grid
  engine; gated on fan-out binding.
- Both are **separate components** (chosen directly), reusing engines — not
  presets of Slider/etc.
- **Prioritize the two cross-cutting capabilities** as their own backlog items —
  they unlock multiple components (Meter, Mod matrix, Envelope, LCD) at once.

## Open questions

- Where does "read-only / input-driven" live — a `Behavior` flag
  (`readOnly` + value-from-port) reused across slider/LCD/meter?
- Fan-out binding model — per-node/per-cell binding table on the custom-component
  multi-channel `PublishedProperties`, or a native multi-port control? (Same
  question raised by [envelope-curve-editor.md](./envelope-curve-editor.md).)
