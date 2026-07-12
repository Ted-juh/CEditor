# Build Order / Roadmap

> Status: **planning.** Sequences the [backlog](./README.md) by dependency:
> **engines → capabilities → components → features**. Design-only; build when
> chosen.

## The shape

Almost every component reduces to **shared engines + a few cross-cutting
capabilities**, so the order is mostly: unlock foundations, then components fall
out cheaply. Two engine-level prerequisites gate the most — do them early.

## Two critical prerequisites (gate the most)

1. **Wire inbound MIDI events in the live C++ runtime** — `onParameterReceived` /
   `onMidiIn` / `onSysexIn` are currently unwired
   ([scripting-runtime-gaps.md](./scripting-runtime-gaps.md)). **Blocks:**
   value-driven display, two-way feedback, MIDI Workbench live monitor, pad LEDs,
   Meter, preset-selector inbound. Highest-leverage single fix.
2. **Back the Timer with a C++ `TimerManager`** — `startTimer`/`onTimer` are a
   no-op outside the preview sim ([timer-system.md](./timer-system.md)).
   **Blocks:** rolls, step sequencer, return-to-rest glide, LCD scroll, morph
   timing.

## Phases

### Phase 0 — prerequisites
The two above. Plus confirm/extend the routing model
([link-mapper-component.md](./link-mapper-component.md)) for fan-out.

### Phase 1 — quick wins (zero new foundations) — ✅ DONE (model layer)
Shipped, pure engine-reuse:
- **Knob** ✅ (circular slider) · **Number** ✅ (Range engine) · **Group/Frame** ✅
  · **Image** ✅. ([knob-component.md](./knob-component.md),
  [number-field-component.md](./number-field-component.md),
  [remaining-components.md](./remaining-components.md)). Visual QA pending a
  running build (no `node_modules` in this environment).

### Phase 2 — capabilities (the unlocks)
- **Fan-out binding / Link Mapper** → Macro, mod matrix, vector pad, crossfader,
  envelope per-node.
- **Value-driven display** (needs Phase 0 #1) → Meter, LCD fields, pad LEDs,
  progress.
- **Snapshots & morph** → Macro/Snapshot-Morph, vector corners, crossfader morph,
  scenes, Diff, Randomizer.
- **Return-to-rest** → ribbon, vector pad, pitch wheel.
- **Musical context** → chord gen, pad grid melodic, keyboard, arp.

### Phase 3 — components (consume Phase 2)
- **Listbox**, **Text Input** (two-way needs Phase 0 #1).
- **Ribbon** (return), **Pitch/Mod wheel** (slider+return).
- **Crossfader**, **Vector Joystick** (fan-out + blend + snapshots).
- **Meter**, **Progress** (value-driven display).
- **Mod matrix** (fan-out + grid), **Envelope/curve** (breakpoint + fan-out).
- **Macro** (Knob + Mapper — cheap once Mapper exists).

### Phase 4 — generative-MIDI + subsystems
- **Chord generator**, **Pad Grid**, **Keyboard**, **Step Sequencer** (note-emit +
  musical context + Timer).
- **LCD display** (canvas renderer + value-driven fields).
- **MIDI Workbench** workspace (UI over existing plumbing + Phase 0 #1).
- **Preset model + librarian**.

### Phase 5 — groundbreaking
- **Macro & Snapshot-Morph** ([macro-and-morph.md](./macro-and-morph.md)) — mostly
  Phase 3 once Mapper + snapshots exist (packaging + assign UI).
- **Auto-Panel generator** ([auto-panel.md](./auto-panel.md)) · **Patch
  Diff/Compare** ([patch-diff.md](./patch-diff.md)) · **Randomizer**
  ([randomizer.md](./randomizer.md)) — snapshots + DPD.
- **Modulation node-graph** ([node-graph.md](./node-graph.md)) — biggest UI lift;
  visual editor over the existing route model.

## Critical path (one line)

**Inbound MIDI wiring + Timer backing → fan-out + value-driven display +
snapshots → everything else.** Knob/Number/Group/Image can ship in parallel any
time.

## Notes

- Sequence by dependency, but Phase 1 quick wins can land alongside Phase 0 to
  show progress.
- Each linked doc holds the per-item what/how/where/when and file lists.
