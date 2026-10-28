# Script modules: what is missing

*Survey, 2026-10-27. All nine modules designed and approved on 2026-10-27, and built on 2026-10-28 on the
`script-modules-build` branch.* Which
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
| 1 | `ce.patch` | A synth's sound as a value: capture, morph, blend, randomize, mutate, merge, diff, apply, keep, write to a slot. | everywhere | medium: most of step 1 exists as `snapshotModel.js` | **Built.** What differs: numbers blend in a straight line, as a runtime's descriptor carries no curve; `toBytes` and `fromBytes` are not built; `read` has no `fill` option. [ce-patch-module.md](ce-patch-module.md). |
| 2 | `ce.format` | A value as text and back: Hz, ms, dB, %, pan, note names, ratios, lookup tables; parsing typed input. | everywhere | low: pure functions | **Built**, both steps: the commands, and a parameter shown as the synth shows it. Two choices the record left open are written into it. [ce-format-module.md](ce-format-module.md). |
| 3 | `ce.file` | Librarian files: open and save dialogs for `.syx`, `.mid`, `.json`; a bank `.syx` split into messages; a recorded take written as a MIDI file. | panel view, and the plug-in with its window open | medium: native dialogs exist in the bridge | **Built.** What differs: `list` answers from what the native side last said; a file value carries its id. [ce-file-module.md](ce-file-module.md). |
| 4 | MIDI input completed, and MPE | Events for incoming pitch bend, aftertouch, program change and clock (scripts decode raw `midiIn` today); MPE with per-note bend, pressure, timbre and channel allocation. | everywhere | high: every engine, plus the player | **Built.** What differs: everything arriving is decoded, whether or not a script listens; `sysexIn` carries no `from`; in Python each script has its own zone. [midi-input-and-mpe.md](midi-input-and-mpe.md). |
| 5 | `ce.daw` | The exported plug-in's host: expose and rename DAW parameters, automation gestures, react to automation. `RUNTIME_PLAYER` exists and holds only `onDawSaveState` and `onDawRestoreState`. | exported plug-in | high: native | **Built**, with `origin()`. What differs: no shared table of DAW moves (the window-shut half is checked through a host, pluginval); a control on a spare reaches the synth with the window shut only through its own parameter or a script; a script's `set()` raises no value events with the window shut. Not yet tried in a DAW. [ce-daw-module.md](ce-daw-module.md). |
| 6 | `ce.verify` | Round-trip checks: send a parameter, ask for a dump, compare, report. The "verifiable" half of the project's aim, which no script can do today. | everywhere | medium: builds on `ce.device` | **Built.** What differs: only the main synth can be asked; a dump of the wrong length or with a bad checksum shows as `noReply`; in Python a script sees only the checks it started. [ce-verify-module.md](ce-verify-module.md). |
| 7 | `ce.keys` | The computer keyboard: key events on the panel, shortcuts, a QWERTY piano. | panel view | low | **Built.** The examples use Ctrl+G: the record's Ctrl+R is a key the DAW takes. [ce-keys-module.md](ce-keys-module.md). |
| 8 | `ce.ci` | MIDI-CI discovery and properties for scripts. The app already discovers devices (`midiCiDiscovered`); scripts cannot see it. | everywhere | medium | **Built.** What differs: no profile names; a device stays listed until it leaves or its ports close. Not yet tried against a real MIDI-CI device. [ce-ci-module.md](ce-ci-module.md). |
| 9 | `ce.osc` | OSC in and out, for TouchOSC or Max. `juce_osc` is vendored and not linked. | everywhere | high: native, a new transport | **Built**, with OSC learn. What differs: in the panel view `listen` and `send` answer true when sent, and a refusal comes as a console line and in `status().error`; in Lua one list of patterns serves every script; a control without a numeric range does not follow an OSC binding. Not yet tried against TouchOSC, Max or Pure Data. [ce-osc-module.md](ce-osc-module.md). |

## Found on the way

- Building them: JUCE's datagram sockets are made reusable, so a second listener on a port in use
  shared it and heard nothing; `ce.osc` turns that off and says the port is in use. A comment in the
  plug-in said it never opens a port; it does (audit finding C-27, and now OSC), and says so.
- `ce.midi`'s summary in `panelApi.js` had two sentences run together ("…the byte encoders synths
  use.CC/NRPN/Sysex — plus wire filters…"); the text is shown in the manual and the API explorer.
  Fixed, with both made again.
