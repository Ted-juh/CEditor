# Panel Parts & Ideas — Backlog / To-Do

A living backlog of classes, components, subsystems, and ideas for the panel /
editor. Everything here is **design-only** until an entry is explicitly promoted
to implementation. Each row links to its own design doc; add new ideas by
appending a row and (when it grows past a paragraph) spinning out a doc.

> This started as the LCD display brainstorm and grew into a general backlog.
> Keep design notes here so they travel with the codebase and can be extended.

## Status legend

| Mark | Meaning |
|------|---------|
| 💡 | Idea — captured, not yet designed in depth |
| 📝 | Designing — has a design doc being fleshed out |
| 🟡 | Partially exists — some support already in the codebase |
| 🔵 | In progress — implementation started |
| 🟢 | Implemented |

## Backlog

| Part | Type | Status | Summary | Doc |
|------|------|--------|---------|-----|
| LCD Display | Component | 📝 | Ready-made-but-flexible hardware display (character / dot-matrix / segment / VFD / OLED), MIDI text+graphics I/O, device-bound fields, scriptable internals. | [lcd-display-component.md](./lcd-display-component.md) |
| Timer System | Subsystem | 📝 design complete | A `TimerManager` on top of `juce::Timer` (no custom primitive): named one-shot / repeating / countdown / stopwatch timers. Semantics + lifecycle specified. ⚠️ Live C++ backing not wired yet — currently a no-op outside the preview sim. Extends existing `startTimer` / `onTimer`. | [timer-system.md](./timer-system.md) |
| Scripting Runtime gaps | Findings | 🟡 audit | Events advertised in `panelApi.js` but not dispatched by the live C++ runtime (`onParameterReceived`, raw MIDI in, device connect, `onTimer`, …). Mostly wiring, not new imports. | [scripting-runtime-gaps.md](./scripting-runtime-gaps.md) |
| JUCE capabilities | Survey | 💡 backlog | Broad sweep of JUCE classes/modules a no-audio MIDI editor could use (OSC, MIDI 2.0/UMP, Bluetooth MIDI, ThreadPool, ZipFile, crypto, ValueTreeSynchroniser, …); most live in already-linked modules. | [juce-capabilities.md](./juce-capabilities.md) |
| MIDI Workbench | Workspace | 🟡 mostly-plumbed | First-class `tabType: 'midi'` workspace, 3 tabs: Connections · Console (monitor+test+learn) · Dumps (analyzer+presets). Foundational live-MIDI session the DPD derives from. Backend (~70%) exists; gap is the unified UI. | [midi-workbench.md](./midi-workbench.md) |

| Meter & Mod Matrix | Investigation | 💡 findings | Both are presets/configs over existing engines (read-only slider / Generator grid). Surfaces the two cross-cutting gaps: read-only value-driven display + multi-parameter fan-out binding. | [meter-and-mod-matrix.md](./meter-and-mod-matrix.md) |
| Envelope / Curve editor | Component | 💡 investigation | ADSR is one preset of a family (AR/DAHDSR/MSEG/LFO-shape/step/response curves). One breakpoint-curve engine + presets; reuse gradient-stop + flow-path editing; real lift is multi-parameter per-node binding. | [envelope-curve-editor.md](./envelope-curve-editor.md) |
| Conventional components | Components | 📝 mini-specs | Ribbon/touch-strip · vector joystick (4-corner morph) · drum-pad grid · crossfader — each its own `controlType` reusing slider/xy/generator engines; lean on fan-out binding + note-emit. | [conventional-components.md](./conventional-components.md) |
| Ribbon component | Component | 📝 design | Thin 1D touch-to-position controller (absolute, spring-return) reusing the slider engine. New: jump-on-press + spring return (+ optional touch gate). Full what/how/where/when. | [ribbon-component.md](./ribbon-component.md) |
| Chord Generator | Component | 💡 design | Generative MIDI source (chord pad / scale-locked strip / harmonizer), sibling to the arpeggiator. Reuses arp note model + Timer; new = chord/scale theory + a shared panel key/scale context. | [chord-generator.md](./chord-generator.md) |
| Groundbreaking components | Ideation | 💡 ideas | Differentiating, no-audio components leveraging the value layer + DPD + routing: Macro/Snapshot-Morph, modulation node-graph, Auto-Panel generator, Patch Diff/Compare, constrained Randomizer. | [groundbreaking-components.md](./groundbreaking-components.md) |
| Ready-made vs custom | Principle | 💡 note | When to ship a set component vs use the custom creator. Findings: XY pad primitives already exist (ship as library preset); ADSR genuinely missing (new capability). | [ready-made-vs-custom.md](./ready-made-vs-custom.md) |
| Component gaps | Survey | 💡 backlog | Missing placeable components for a MIDI/synth editor (Knob, Listbox, Number/Text input, XY pad, ADSR, mod matrix, Meter, Keyboard); many are presets over existing engine support. | [component-gaps.md](./component-gaps.md) |
| Knob component | Component | 📝 ready to build | New `controlType` reusing the slider family's circular geometry. Integration spec: 4 files change (`componentTypes`, `interactionDefaults`, `componentPorts`, `IconPanel`), ~19 touchpoints unchanged. | [knob-component.md](./knob-component.md) |
| Listbox component | Component | 📝 spec (single-select MVP) | New `controlType` sharing Combobox's data model but needing a new `ListboxRenderer`. ~1 new file + ~7 edits; multi-select deferred (new port + export strategy). | [listbox-component.md](./listbox-component.md) |
| Text Input component | Component | 📝 spec (single-line MVP) | New `controlType`; introduces `valueType:'text'`, the first TEXT/PATCH_NAME port, keyboard text entry, and a non-automatable device-bound (SysEx patch-name) value path. | [text-input-component.md](./text-input-component.md) |
| Number Field component | Component | 📝 spec | Number entry + steppers already exists as the Range/spinbox; gap is naming + a bare variant. Own `Number` `controlType` reusing the Range engine (its own palette entry, not a Range preset). | [number-field-component.md](./number-field-component.md) |
| Preset / Patch model | Findings | 🟡 gap | Factory vs user presets & patch names. Runtime scan + dump defs exist; missing the DPD data model (factory/user slot map, writability, banks, factory catalog). DPD models it; Workbench librarian consumes it. | [preset-model.md](./preset-model.md) |

## Parking lot (not yet doc'd — promote when fleshed out)

Ideas that came up while designing the above and deserve their own row/doc later:

- **Bargraph / Meter** ready-made part (segment bars, VU/peak, EG display).
- **Scope / Waveform / Envelope** mini-visualizer part.
- **Soft-key label strip** (row of fields aligned to physical buttons/knobs).
- **MIDI protocol adapter library** (Sound Canvas / Push / MCU-HUI parsers) as
  shareable scripts/presets.
- **Custom glyph (CGRAM) authoring** UX for bitmap fonts / icons.

## How to use this backlog

1. Capture an idea as a row (status 💡) or in the parking lot.
2. When it has real shape, give it a design doc and bump to 📝.
3. Note what already exists in the codebase (status 🟡) so we don't rebuild it.
4. Only move to 🔵 / 🟢 when we deliberately decide to implement.
