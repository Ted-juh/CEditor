# Meter & Mod Matrix — Investigation (+ the two cross-cutting gaps)

> Status: **investigation / findings.** Both resolve to configs/presets over
> existing engines; together they reveal the two foundational capabilities the
> whole synth tier actually needs. Part of the
> [panel parts backlog](./README.md); see [component-gaps.md](./component-gaps.md).

## Meter / Bargraph / LED

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

## Mod Matrix

**Buildable on existing engines:**
- Generators already emit grid cells (`rows × columns`, `parts = rows*columns` —
  `sections/CustomGeneratorsEditor.svelte`), so a routing grid is generatable;
  per-cell controls bind via Bindings / ValueChannels.
- So a "set" Mod Matrix reuses the Generator-grid engine, **shipped as its own
  palette entry / `controlType`** (chosen directly — not a preset of another
  component; see [ready-made-vs-custom.md](./ready-made-vs-custom.md)).
  **Missing piece:** the **binding fan-out** — N×M cells → N×M routing
  parameters.

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
