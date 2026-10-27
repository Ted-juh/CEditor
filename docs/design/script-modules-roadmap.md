# Script modules: what is missing

*Survey, 2026-10-27. Seven modules designed and approved (`ce.patch`, `ce.format`, `ce.file`, MIDI input and `ce.mpe`, `ce.daw`, `ce.verify`, `ce.keys`), the rest proposed.* Which
scripting modules the API lacks, why, and in what order to design them. Each module gets its own
design record when its design is approved; this page keeps the list and the status.

## The finding

On 2026-10-27 the API had 41 modules and about 900 commands. Only 13 of the modules are general
tools; 28 are one per component, and most of their commands mirror one inspector setting each
(`drumPadsCornerTopLeft`, `arpShowHeader`). The general modules are strong on mechanics: bytes and
encoders (`ce.midi`, 44 commands), values (`ce.math`, 61), timers, drawing. What is thin is the layer
of verbs for the jobs a synth editor is used for: managing sounds, exchanging files, talking to the
DAW, richer input, showing a value as text. The manual shows people building these by hand —
`ce.panel.snapshot` says "use it to morph between two snapshots", and `defineAction`'s example is
"randomize".

**The cost that sets the order.** A module that runs everywhere (`RUNTIME_ANY`) is written in every
engine's prelude: Lua, JavaScript, Python, C++, C#, Java, plus the WebView. A module for the panel
view only (`RUNTIME_WEBVIEW`) is written once. Pure functions are cheap in all seven; anything that
needs new native code is not.

## The list

| # | Module | What it is for | Runs | Cost | Status |
|---|---|---|---|---|---|
| 1 | `ce.patch` | A synth's sound as a value: capture, morph, blend, randomize, mutate, merge, diff, apply, keep, write to a slot. | everywhere | medium: most of step 1 exists as `snapshotModel.js` | **Designed and approved**, [ce-patch-module.md](ce-patch-module.md). Not built. |
| 2 | `ce.format` | A value as text and back: Hz, ms, dB, %, pan, note names, ratios, lookup tables; parsing typed input. | everywhere | low: pure functions | **Designed and approved**, [ce-format-module.md](ce-format-module.md). Not built. |
| 3 | `ce.file` | Librarian files: open and save dialogs for `.syx`, `.mid`, `.json`; a bank `.syx` split into messages; a recorded take written as a MIDI file. | panel view, and the plug-in with its window open | medium: native dialogs exist in the bridge | **Designed and approved**, [ce-file-module.md](ce-file-module.md). Not built. |
| 4 | MIDI input completed, and MPE | Events for incoming pitch bend, aftertouch, program change and clock (scripts decode raw `midiIn` today); MPE with per-note bend, pressure, timbre and channel allocation. | everywhere | high: every engine, plus the player | **Designed and approved**, [midi-input-and-mpe.md](midi-input-and-mpe.md). Not built. |
| 5 | `ce.daw` | The exported plug-in's host: expose and rename DAW parameters, automation gestures, react to automation. `RUNTIME_PLAYER` exists and holds only `onDawSaveState` and `onDawRestoreState`. | exported plug-in | high: native | **Designed and approved**, [ce-daw-module.md](ce-daw-module.md). Not built. |
| 6 | `ce.verify` | Round-trip checks: send a parameter, ask for a dump, compare, report. The "verifiable" half of the project's aim, which no script can do today. | everywhere | medium: builds on `ce.device` | **Designed and approved**, [ce-verify-module.md](ce-verify-module.md). Not built. |
| 7 | `ce.keys` | The computer keyboard: key events on the panel, shortcuts, a QWERTY piano. | panel view | low | **Designed and approved**, [ce-keys-module.md](ce-keys-module.md). Not built. |
| 8 | `ce.ci` | MIDI-CI discovery and properties for scripts. The app already discovers devices (`midiCiDiscovered`); scripts cannot see it. | everywhere | medium | Next to design. |
| 9 | `ce.osc` | OSC in and out, for TouchOSC or Max. `juce_osc` is vendored and not linked. | everywhere | high: native, a new transport | Proposed. |

## Found on the way

- `ce.midi`'s summary in `panelApi.js` has two sentences run together ("…the byte encoders synths
  use.CC/NRPN/Sysex — plus wire filters…"); the text is shown in the manual and the API explorer.
  One line to fix, then regenerate both.
