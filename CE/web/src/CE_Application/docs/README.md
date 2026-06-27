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
| Timer System | Subsystem | 📝 design complete | A `TimerManager` on top of `juce::Timer` (no custom primitive): named one-shot / repeating / countdown / stopwatch timers. Semantics + lifecycle specified; ready to implement. Extends existing `startTimer` / `onTimer`. | [timer-system.md](./timer-system.md) |

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
