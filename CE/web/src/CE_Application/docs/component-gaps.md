# Component Catalog — Gaps

> Status: **survey / backlog.** Placeable panel components that exist vs are
> missing, for a MIDI control-surface / synth editor. Part of the
> [panel parts backlog](./README.md).

## Exists today

From `models/componentTypes.js` (`COMPONENT_TYPES`) + the insert palette
(`layout/IconPanel.svelte`):

- **Buttons:** Momentary, Toggle, Radio Group, Cyclic, Timed, One-Shot
- **Selection:** Combobox
- **Value:** Range, Slider
- **Layout / static:** Label, Container, Background, TestBox
- **Extensible:** CustomComponent (+ LCD Display, in design)

Tags below: `[new]` genuinely new · `[preset]` engine already supports it, only a
palette preset is missing · `[ready-made]` buildable via CustomComponent today
but deserves a first-class version.

## Tier 1 — core, surprising they're absent

- **Knob / Rotary** `[preset]` — the synth staple. The slider family already
  supports circular geometry (`Behavior.geometry` / `startAngle` / `sweepAngle` /
  `circularDiameter`); cheap, high-impact. **Integration spec ready →
  [knob-component.md](./knob-component.md)** (new `controlType`, 4 files change).
- **Number field / Stepper** `[preset]` — **largely already exists**: the Range
  control is a spinbox (type-in + steppers via `rangeBehavior.js`). The gap is
  naming/discoverability + a bare variant. **Spec →
  [number-field-component.md](./number-field-component.md)** (Range presets,
  ~2 files).
- **Text input** `[new]` — editable text (patch names). `Label` is static-only.
  **Integration spec ready → [text-input-component.md](./text-input-component.md)**
  (new `controlType`; introduces `valueType:'text'`, first TEXT/PATCH_NAME port,
  keyboard entry, non-automatable device-bound value path).
- **On-screen Piano Keyboard** `[new]` — build/test a controller without hardware.

## Tier 2 — synth / controller domain

- **XY Pad** `[ready-made]` — 2D control. The custom creator **already has**
  `xy-pad` behavior + `xy` hit-zone primitives, so ship a set XY pad as a
  **library preset**, not a new engine. See
  [ready-made-vs-custom.md](./ready-made-vs-custom.md).
- **Envelope / Curve editor** `[new]` — ADSR is just one preset of a big family
  (AR/AD/DAHDSR/MSEG/LFO-shape/step/velocity & response curves). The flexible
  answer is **one breakpoint-curve engine + presets**, not N fixed widgets. No
  envelope primitives today, but the gradient stop-editor + flow-path bezier
  editing are reusable; the real lift is multi-parameter (per-node) binding. See
  [envelope-curve-editor.md](./envelope-curve-editor.md).
- **Mod / routing matrix** `[ready-made]` — Generator grid (rows×cols) is
  buildable in the custom creator today → ship as a library preset; real lift is
  per-cell **fan-out binding**. See [meter-and-mod-matrix.md](./meter-and-mod-matrix.md).
- **Meter / Bargraph / LED indicator** `[ready-made]` — analog = read-only
  slider (value→`bodyTrackFill`); LED = Generator grid. Gated on a **read-only /
  value-driven display mode**. See [meter-and-mod-matrix.md](./meter-and-mod-matrix.md).
- **Step sequencer / drum-pad grid** `[ready-made]` — partly covered by the
  `Grid` section + the custom arpeggiator.
- **Pitch / Mod wheel** `[preset]` — a slider preset.

## Tier 3 — general UI / layout

- **Listbox** `[new]` — always-visible scrollable list; natural preset/patch
  browser (distinct from the Combobox dropdown). **Integration spec ready →
  [listbox-component.md](./listbox-component.md)** (new `controlType` + renderer;
  ~1 new file + ~7 edits; single-select MVP, multi-select later).
- **Tabbed container / pages** `[new]` — organize a panel into pages.
- **Group / Frame with title** `[preset]` — `Container` without titled chrome.
- **Image display** `[preset]` — `Icon` is a section, not a standalone placeable.
- **Progress bar** `[preset]`, **scroll area** `[new]`, **shape primitives**
  (partly present via the designer's vector shapes).

## Two cross-cutting capabilities (higher leverage than any widget)

Investigating the synth tier surfaced two foundational capabilities that unlock
*multiple* components at once (see
[meter-and-mod-matrix.md](./meter-and-mod-matrix.md)):

1. **Value-driven display / read-only output mode** — shows an inbound device
   value instead of being user-driven. Unlocks **Meter** + the **LCD** fields.
2. **Multi-parameter / fan-out binding** — one component bound to many device
   params. Unlocks the **Envelope** (per-node) + **Mod matrix** (per-cell).

Building these two is higher-leverage than widget-by-widget work.

## Recommended first picks

1. **Knob** — engine-ready, just a preset; biggest perceived gap.
2. **Data-entry trio: Listbox · Number field · Text input** — basic and missing.
3. **Synth-specific (make it feel purpose-built): XY Pad · ADSR · Mod matrix ·
   Meter** — the ones that distinguish CEditor from a generic UI builder.

## Add ideas below
<!-- New component gaps go here. -->
