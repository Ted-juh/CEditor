# CEditor Scripting Manual

> **Generated file — do not edit by hand.**
> Source of truth: `CE/web/src/CE_Application/scripting/panelApi.js` (the same data that drives
> the editor's picker and validation). Regenerate with `npm run docs:manual` in `CE/web`.
> First script? Start with [getting started](scripting-getting-started.md), then the
> [cookbook](scripting-cookbook.md); reading order for everything is in the [docs index](README.md).

A script is **an action plus the moment it runs** — a lifecycle hook, or an event handler that
reacts while the panel is in use. Every language calls the same panel API described below; a
script is stored and run in the language it was written in, never converted.

## Languages

| Language | Version | Runs live in the editor | Runtime |
|---|---|---|---|
| **Lua** (Tier 1) | 5.4 | ✅ | Sol3 |
| **JavaScript** (Tier 1) | ES2023 | ✅ | juce_javascript (QuickJS) |
| **TypeScript** (Tier 1) | 5.x | ✅ | transpiled to JS (QuickJS) |
| **Python** | 3.x | ⬜ preview via WebView only | Pyodide (WASM) |
| **C++** | 17 | ✅ (interpreted subset) | CeScript interpreter — preview only (compile-at-export planned) |
| **C#** | 12 | ✅ (interpreted subset) | CeScript interpreter — preview only (compile-at-export planned) |
| **Java** | 21 | ✅ (interpreted subset) | CeScript interpreter — preview only (compile-at-export planned) |

## Where things run: preview vs export

Some of the API is further along in one runtime than the other. Members below carry a badge
when they deviate from "available everywhere":

- **preview** — the editor's live preview (the JS panel runtime, also used by the exported
  player's window).
- **export** — the exported standalone/VST3 plugin (the C++ host engines, alive even with the
  window closed).

✅ = works today, ⬜ = not yet there (the note says why). No badge = works in both.

## The same script in every language

One handler, written as real source in every language — these exact snippets are validated
against each language's real toolchain by `npm run test:script-exports`. Two API shapes:

- **Lua / JavaScript / TypeScript / Python** — the API is injected as globals: `set()`,
  `sendCC()`, …
- **C++ / C# / Java** *(ctx-based)* — handlers take `(ctx, event)` and reach the same API
  through `ctx` (C# uses .NET naming: `ctx.SetValue`, `ctx.SendCC`).

**Lua**

```lua
function onValueChanged(value)
  set("cutoff.value", scale(value, 0, 1, 80, 12000))
  set("resonance.value", scale(value, 0, 1, 0.1, 0.85))
  sendCC(1, 74, round(value * 127))
end
```

**JavaScript**

```js
function onValueChanged(value) {
  set('cutoff.value', scale(value, 0, 1, 80, 12000));
  set('resonance.value', scale(value, 0, 1, 0.1, 0.85));
  sendCC(1, 74, round(value * 127));
}
```

**TypeScript**

```ts
function onValueChanged(value: number): void {
  set('cutoff.value', scale(value, 0, 1, 80, 12000));
  set('resonance.value', scale(value, 0, 1, 0.1, 0.85));
  sendCC(1, 74, round(value * 127));
}
```

**Python**

```python
def onValueChanged(value):
    set("cutoff.value", scale(value, 0, 1, 80, 12000))
    set("resonance.value", scale(value, 0, 1, 0.1, 0.85))
    sendCC(1, 74, round(value * 127))
```

**C++** *(ctx-based)*

```cpp
void onValueChanged(CeContext& ctx, const CeEvent& event) {
  ctx.set("cutoff.value", ctx.scale(event.value, 0.0, 1.0, 80.0, 12000.0));
  ctx.set("resonance.value", ctx.scale(event.value, 0.0, 1.0, 0.1, 0.85));
  ctx.sendCC(1, 74, ctx.round(event.value * 127.0));
}
```

**C#** *(ctx-based)*

```csharp
void OnValueChanged(CeContext ctx, CeEvent e) {
  ctx.SetValue("cutoff.value", ctx.Scale(e.Value, 0, 1, 80, 12000));
  ctx.SetValue("resonance.value", ctx.Scale(e.Value, 0, 1, 0.1, 0.85));
  ctx.SendCC(1, 74, (int)ctx.Round(e.Value * 127));
}
```

**Java** *(ctx-based)*

```java
void onValueChanged(CeContext ctx, CeEvent e) {
  ctx.set("cutoff.value", ctx.scale(e.value, 0.0, 1.0, 80.0, 12000.0));
  ctx.set("resonance.value", ctx.scale(e.value, 0.0, 1.0, 0.1, 0.85));
  ctx.sendCC(1, 74, (int) ctx.round(e.value * 127.0));
}
```

The reference sections below show Lua and JavaScript. Python and TypeScript make the same
global calls with their own function syntax; C++/C#/Java prefix them with `ctx.` as above.

### What the C++ / C# / Java preview subset covers

True C++/C#/Java is compiled into the plugin at export. In the editor these languages run
through the CeScript interpreter — a large practical subset, so handlers move real controls
live without a compiler. It covers functions and lambdas, structs with methods, enums,
control flow (`if`/`for`/`while`/`switch`, range-for), the common `std::` containers
(`vector`/`array`/`map`/`string`) with their everyday methods, `<algorithm>`/`<numeric>`
over iterators, `try`/`catch`, casts, and `printf`/`std::cout` (to the script console).
It does **not** run templates you define yourself, classes (use structs), pointer arithmetic,
`goto`, or arbitrary third-party headers — those raise a clear error instead of mis-running,
and all numbers are doubles (integer division is not truncated). The definitive list lives at
the top of `CE/web/src/CE_Application/scripting/cppPreview.js` (C# and Java mirror it); the
export-side design is `CE/src/Scripting/native-handlers-design.md`.

## Conventions

The numbers the API expects, everywhere:

| What | Range / form |
|---|---|
| MIDI channel | **1–16** (the runtime converts to wire format) |
| CC number / 7-bit value | 0–127 |
| NRPN value | 0–16383 (14-bit) |
| Note number | 0–127, middle C = **C4 = 60** |
| `normalizedValue` | 0–1 |
| Colours | `"#rrggbb"` strings |
| Times | milliseconds |
| Scale degrees / keys | key: 0 = C … 11 = B; degrees are 1-based |
| Slots / scenes | 1-based (or by name where the signature says so) |

## Addressing: paths and values

Everything on the panel is reachable by a **dot-path** rooted on a control's name:
`"cutoff.value"`, `"button2.background.fill.colour"`. Read and write them with `get`/`set`
(below). Renaming a control automatically updates its name in every script.

*(The API spec also defines handle and dot-object conveniences — `panel.get("cutoff")`,
`panel.cutoff.value` — as planned sugar over the same operation; today `get`/`set` are the
surface.)*

A control's value has three faces — suffix the path with the one you need. (**DPD** = the
Device Profile Designer: the device map that knows each parameter's bytes, ranges, and enums,
and converts between these representations for you.)

| Accessor | What you get |
|---|---|
| `.value` | The real, human value — e.g. 8000 (Hz) or "LP" (enum name). The default. Setting it lets the DPD convert to MIDI on send. |
| `.normalizedValue` | The 0–1 position. For uniform math, curves, and linking controls of different ranges. |
| `.midiValue` | The value as MIDI (e.g. 101). Only for device-bound controls; empty for decorative ones. For hand-built MIDI. |

**`self`** — The element this script is attached to (control, panel, or custom-component instance). Use instead of a fixed name so one script works on every copy of a reusable component.

## Lifecycle hooks

Named functions the host calls at fixed moments. Define the ones you need; leave the rest out.

### `onPanelLoad()`

Phase 1 — before the GUI exists. MIDI setup / init SysEx only. Do NOT touch controls; they do not exist yet.

```lua
-- Lua
function onPanelLoad()
  …
end
```
```js
// JavaScript
function onPanelLoad() {
  …
}
```

### `onPanelReady(info)`

Phase 2 — GUI ready. Read the synth, fill controls. May re-fire on VST3 window reopen; guard one-time work with `if info.firstTime`.

```lua
-- Lua
function onPanelReady(info)
  if info.firstTime then
    …
  end
end
```
```js
// JavaScript
function onPanelReady(info) {
  if (info.firstTime) {
    …
  }
}
```

### `onPanelClose()`

Phase 4 — really closing. Final cleanup, send a closing dump, all-notes-off.

```lua
-- Lua
function onPanelClose()
  …
end
```
```js
// JavaScript
function onPanelClose() {
  …
}
```

### `onDawSaveState(store)`

The DAW is saving the project — write values into `store`.

*Availability: preview ⬜ · export ✅ — Fires only when a DAW hosts the exported plugin.*

```lua
-- Lua
function onDawSaveState(store)
  …
end
```
```js
// JavaScript
function onDawSaveState(store) {
  …
}
```

### `onDawRestoreState(store)`

The DAW reopened the project — read values back from `store`.

*Availability: preview ⬜ · export ✅ — Fires only when a DAW hosts the exported plugin.*

```lua
-- Lua
function onDawRestoreState(store)
  …
end
```
```js
// JavaScript
function onDawRestoreState(store) {
  …
}
```

## Events

Two ways to subscribe:

- **A control's own events**: just define the named function (`function onValueChanged(value) … end`)
  in the script attached to that control — the target is implicitly the control itself.
- **Anything else** (another control, the panel, the device, or a custom `emit`): register
  explicitly with `on(target, event, handler)`.

Payloads are passed directly with a descriptive name — one obvious datum comes as itself
(`onValueChanged(value)`), several fields come as one named object (`onClick(mouse)` →
`mouse.x`). The Payload column lists each object's fields.

### Control events

| Event | Handler | Payload | Fires when | Where |
|---|---|---|---|---|
| `"valueChange"` | `onValueChange(value)` | `value` | Live — fires continuously while the value is moving (for GUI/preview). | everywhere |
| `"valueChanged"` | `onValueChanged(value)` | `value` | Settled — fires when the value reaches its final value (for transmit). | everywhere |
| `"click"` | `onClick(mouse)` | `mouse` (`.x` `.y` `.button` `.modifiers`) | Clicked (fires on release). | everywhere |
| `"doubleClick"` | `onDoubleClick(mouse)` | `mouse` (`.x` `.y` `.button` `.modifiers`) | Double-clicked. | everywhere |
| `"pointerDown"` | `onPointerDown(mouse)` | `mouse` (`.x` `.y` `.button` `.modifiers`) | Mouse pressed. | everywhere |
| `"pointerMove"` | `onPointerMove(mouse)` | `mouse` (`.x` `.y` `.button` `.modifiers`) | Mouse moved while down. | everywhere |
| `"pointerUp"` | `onPointerUp(mouse)` | `mouse` (`.x` `.y` `.button` `.modifiers`) | Mouse released. | everywhere |
| `"hoverStart"` | `onHoverStart()` | — | Mouse entered the control. | everywhere |
| `"hoverEnd"` | `onHoverEnd()` | — | Mouse left the control. | everywhere |
| `"wheel"` | `onWheel(wheel)` | `wheel` (`.delta` `.deltaX` `.deltaY` `.x` `.y`) | Scrolled over the control. delta = +1 up / −1 down; deltaX/deltaY are the raw values. | everywhere |
| `"stateChanged"` | `onStateChanged(state)` | `state` | State swapped (hover/pressed/disabled). | preview ⬜ · export ⬜ — Planned — not dispatched anywhere yet. |

### Panel events

| Event | Handler | Payload | Fires when | Where |
|---|---|---|---|---|
| `"controlChanged"` | `onControlChanged(info)` | `info` (`.target` `.value`) | Any control changed. | preview ⬜ · export ⬜ — Planned — not dispatched anywhere yet. |
| `"panelStateChanged"` | `onPanelStateChanged(state)` | `state` | Panel state switched. | preview ⬜ · export ⬜ — Planned — not dispatched anywhere yet. |
| `"timer"` | `onTimer(info)` | `info` (`.id`) | A started timer fired. | preview ⬜ · export ✅ — Runs in the exported plugin (TimerManager); editor-preview timers are pending. |
| `"beat"` | `onBeat(info)` | `info` (`.beat` `.bar` `.beats`) | The clock crossed a beat (beat/bar 1-based, beats = absolute index). | preview ✅ · export ✅ — Fires from the panel Transport in the UI runtime; window-closed it follows the DAW playhead (nothing fires without a running clock). |
| `"bar"` | `onBar(info)` | `info` (`.bar`) | The clock crossed a bar line. | preview ✅ · export ✅ — Fires from the panel Transport in the UI runtime; window-closed it follows the DAW playhead (nothing fires without a running clock). |

### Device events

| Event | Handler | Payload | Fires when | Where |
|---|---|---|---|---|
| `"parameterReceived"` | `onParameterReceived(info)` | `info` (`.parameter` `.value`) | A value arrived, decoded via the DPD. | preview ⬜ · export ✅ — Wired in the exported plugin; editor-preview dispatch is pending. |
| `"dumpReceived"` | `onDumpReceived(dump)` | `dump` (`.values` `.kind` `.role` `.bytes`) | A bulk dump arrived and was decoded via the DPD; the panel fills automatically. values = { parameterId: value }, bytes = the raw message. | everywhere |
| `"midiIn"` | `onMidiIn(midi)` | `midi` (`.bytes` `.channel` `.status`) | Any MIDI arrived (raw). | preview ⬜ · export ✅ — Wired in the exported plugin; editor-preview dispatch is pending. |
| `"ccIn"` | `onCcIn(cc)` | `cc` (`.channel` `.cc` `.value`) | A CC arrived. | preview ⬜ · export ✅ — Wired in the exported plugin; editor-preview dispatch is pending. |
| `"noteIn"` | `onNoteIn(note)` | `note` (`.channel` `.note` `.velocity` `.on`) | A note arrived (on = false for note-off; a velocity-0 note-on counts as off). | preview ⬜ · export ✅ — Wired in the exported plugin; editor-preview dispatch is pending. |
| `"sysexIn"` | `onSysexIn(bytes)` | `bytes` | Raw SysEx arrived. | preview ⬜ · export ✅ — Wired in the exported plugin; editor-preview dispatch is pending. |
| `"deviceConnected"` | `onDeviceConnected(device)` | `device` | A device connected. | preview ⬜ · export ⬜ — Planned — not dispatched anywhere yet. |
| `"deviceDisconnected"` | `onDeviceDisconnected(device)` | `device` | A device disconnected. | preview ⬜ · export ⬜ — Planned — not dispatched anywhere yet. |

## Commands

### Values

#### `set(path, value [, opts])`

Write a value at a path. Transmits to the synth by default (Q2); silence is auto-inferred when reacting to inbound MIDI.

```lua
set("path", value)
```

#### `get(path)`

Read a value at a path. Suffix with .value (default), .normalizedValue, or .midiValue.

```lua
get("path")
```

### Transmit

#### `noTransmit(fn)`

Run a block writing to the panel WITHOUT sending to the synth (e.g. an Init-Patch button). Auto-resets at block end.

*Availability: preview ✅ · export ✅ — The block always runs; transmit gating is enforced by the exported (C++) runtime — the editor preview does not gate.*

```lua
-- Lua
noTransmit(function()
  …
end)
```
```js
// JavaScript
noTransmit(() => {
  …
})
```

#### `transmit(fn)`

Force a block to send to the synth, even inside an inbound handler.

*Availability: preview ✅ · export ✅ — The block always runs; transmit gating is enforced by the exported (C++) runtime — the editor preview does not gate.*

```lua
-- Lua
transmit(function()
  …
end)
```
```js
// JavaScript
transmit(() => {
  …
})
```

### Events & Flow

#### `on(target, event, fn)`

React to an event on another control / the panel / the device, or to a custom emitted event. Two-argument form on(name, fn) listens for a custom emit()ted event on any target.

*Availability: preview ✅ · export ✅ — Callback registration is for Lua/JS/TS/Python; C++/C#/Java handlers use named functions instead.*

```lua
-- Lua
on("target", "event", function(e)
  …
end)
```
```js
// JavaScript
on("target", "event", (e) => {
  …
})
```

#### `emit(name [, data])`

Announce a custom event; any script listening with on(name, …) reacts. Fire-and-forget, language-neutral. Runaway emit chains are cut off and reported.

```lua
emit("name", data)
```

#### `run(target.action [, args])`

Run a named action: "target.action" finds the script named `target` (or attached to it) that defines a function `action`, calls it with args, and returns its result. Plain "action" searches every script. Cross-language; only simple data crosses the boundary.

*Availability: preview ✅ · export ✅ — In the editor preview a Lua/Python target runs asynchronously — the return value is available from JS/TS/C++/C#/Java targets.*

```lua
run("target.action")
```

### Device / MIDI

#### `requestDump(kind)`

Ask the synth to send a dump. kind ("patch"/"tone"/"global"…) is defined by the DPD.

*Valid in device / panel / project scripts only.*

```lua
requestDump("patch")
```

#### `applyDump(bytes)`

Fill the whole panel from a received dump (walks the DPD map). Silent automatically — inbound context.

*Valid in device / panel / project scripts only.*

```lua
applyDump(bytes)
```

#### `sendDump(kind)`

Build a dump from the panel values and send it to the synth.

*Valid in device / panel / project scripts only.*

```lua
sendDump("patch")
```

#### `buildDump(kind)`

Build the dump bytes from the panel values without sending.

*Valid in device / panel / project scripts only.*

*Availability: preview ⬜ · export ⬜ — Planned — the panel→bytes codec is not yet exposed to scripts in either runtime; use sendDump to transmit.*

```lua
-- Lua
local bytes = buildDump("patch")
```
```js
// JavaScript
const bytes = buildDump("patch")
```

#### `sendNote(channel, note [, velocity, durationMs])`

Play a note and automatically send its note-off after durationMs (default 200). velocity defaults to 100.

*Valid in device / panel scripts only.*

```lua
sendNote(channel, note, 100, 200)
```

#### `noteOn(channel, note [, velocity])`

Start holding a note (velocity defaults to 100). Pair with noteOff — for fire-and-forget use sendNote.

*Valid in device / panel scripts only.*

```lua
noteOn(channel, note, 100)
```

#### `noteOff(channel, note)`

Release a note started with noteOn.

*Valid in device / panel scripts only.*

```lua
noteOff(channel, note)
```

#### `sendCC(channel, cc, value)`

Send a raw MIDI CC.

*Valid in device / panel scripts only.*

```lua
sendCC(channel, cc, value)
```

#### `sendNRPN(channel, msb, lsb, value)`

Send a raw NRPN.

*Valid in device / panel scripts only.*

```lua
sendNRPN(channel, msb, lsb, value)
```

#### `sendSysex(bytes)`

Send a raw SysEx message (device-scope, power use).

*Valid in device scripts only.*

```lua
sendSysex(bytes)
```

#### `checksum(type, bytes)`

Compute a device checksum (e.g. "roland", "yamaha").

*Valid in device scripts only.*

```lua
checksum("roland", bytes)
```

### Transport

#### `transport()`

Snapshot of the master clock: { playing, bpm, beats, beat, bar, beatsPerBar } — beat/bar are 1-based, beats is the absolute position.

*Availability: preview ✅ · export ✅ — Follows the panel Transport in the UI runtime; window-closed it reflects the DAW playhead (empty fields when the host reports nothing).*

```lua
-- Lua
local t = transport()
```
```js
// JavaScript
const t = transport()
```

### Timers

#### `startTimer(id, ms)`

Start (or restart) a named repeating timer; onTimer fires with info.id every ms until stopTimer(id). Pass { beats: n } instead of ms to derive the interval from the current tempo (fixed at start — restart after a tempo change, or follow onBeat).

*Availability: preview ⬜ · export ✅ — Runs in the exported plugin (TimerManager); editor-preview timers are pending.*

```lua
startTimer("id", ms)
```

#### `stopTimer(id)`

Stop a named timer started with startTimer(id, ms).

*Availability: preview ⬜ · export ✅ — Runs in the exported plugin (TimerManager); editor-preview timers are pending.*

```lua
stopTimer("id")
```

### Debug

#### `log(message [, value])`

Print to the script console without changing state.

```lua
log("message", value)
```

### Zone Splitter

Drive the [Zone Splitter](../CE/web/src/CE_Application/docs/zone-splitter.md) — keyboard zones with per-zone routing. `target` is the component's control name.

#### `splitPreset(target, preset [, lowNote, highNote])`

Swap the whole split arrangement to a named preset (e.g. "threeWay"); optional boundary notes.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
splitPreset("target", "preset")
```

#### `splitMute(target, zone [, enabled])`

Mute a zone (pass false to unmute). Zone by name or index.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
splitMute("target", "zone")
```

#### `splitChannel(target, zone, channel)`

Route a zone to a MIDI channel.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
splitChannel("target", "zone", channel)
```

#### `splitTranspose(target, zone, semitones)`

Transpose a zone in semitones.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
splitTranspose("target", "zone", semitones)
```

#### `splitPoint(target, zone, note)`

Move a zone boundary to a MIDI note.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
splitPoint("target", "zone", note)
```

### Phrase Sequencer

Drive the [Phrase Sequencer](../CE/web/src/CE_Application/docs/phrase-sequencer.md) — a step grid whose rows are scale degrees. `target` is the component's control name.

#### `phraseSeed(target, seed)`

Swap the pattern to a named seed (e.g. "arpUp"). An unknown seed is a no-op.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
phraseSeed("target", "seed")
```

#### `phraseClear(target)`

Clear the pattern grid.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
phraseClear("target")
```

#### `phraseKey(target, key)`

Move the phrase to a new key (0 = C … 11 = B) — the pattern itself is untouched.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
phraseKey("target", key)
```

#### `phraseScale(target, scale)`

Re-harmonise to a named scale (e.g. "dorian").

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
phraseScale("target", "scale")
```

#### `phraseTranspose(target, semitones)`

Transpose playback in semitones.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
phraseTranspose("target", semitones)
```

#### `phraseDirection(target, direction)`

Set playback direction: "forward", "reverse", "pingpong", or "random".

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
phraseDirection("target", "forward")
```

#### `phraseRun(target [, running])`

Start the sequencer (false stops it).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
phraseRun("target", true)
```

#### `phraseCell(target, step, row, on)`

Turn one grid cell on/off (step column, scale-degree row). Out-of-grid cells are a no-op.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
phraseCell("target", step, row, true)
```

#### `phraseStore(target, slot [, name])`

Save the live pattern into a slot (1-based, up to 8), optionally named — the slots the song chain plays.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
phraseStore("target", slot)
```

#### `phraseLoad(target, slot)`

Load a stored pattern from a slot (1-based) into the live grid.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
phraseLoad("target", slot)
```

#### `phraseChain(target [, on])`

Turn song mode on (or off with false) — the sequencer follows its chain of pattern slots.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
phraseChain("target", true)
```

#### `phraseChainLoop(target [, loop])`

Whether the song chain loops back to its start (false = play once and stop).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
phraseChainLoop("target", true)
```

### Phrase Recorder

Drive the [Phrase Recorder](../CE/web/src/CE_Application/docs/phrase-recorder.md) — the note looper. `target` is the component's control name.

#### `recorderRecord(target [, on])`

Arm/stop recording. No argument toggles (what a footswitch wants); true/false is idempotent (safe for a MIDI-mapped switch that fires twice).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
recorderRecord("target")
```

#### `recorderStop(target)`

Stop recording/arming (back to idle).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
recorderStop("target")
```

#### `recorderPlay(target [, playing])`

Toggle loop playback; false mutes the loop without losing it.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
recorderPlay("target", true)
```

#### `recorderClear(target)`

Throw the take away.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
recorderClear("target")
```

#### `recorderUndo(target)`

Drop the last overdub pass.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
recorderUndo("target")
```

#### `recorderQuantize(target, grid [, strength, scale, key])`

Quantize the take to a grid (1–64), by strength 0–1; give scale + key to also pull notes into key.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
recorderQuantize("target", 16, 1)
```

#### `recorderTranspose(target, semitones)`

Transpose playback only (−48…+48) — the recorded take is untouched. To rewrite the take, use recorderShift.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
recorderTranspose("target", semitones)
```

#### `recorderBars(target, bars)`

Set the loop length in bars.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
recorderBars("target", bars)
```

#### `recorderSource(target, source)`

What gets recorded: "input", "panel", or "both".

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
recorderSource("target", "panel")
```

#### `recorderNudge(target, by)`

Shift the whole take in time by a fraction of the loop — the fix for a consistently-late take.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
recorderNudge("target", by)
```

#### `recorderShift(target, semitones)`

Rewrite the recorded take, transposed — unlike recorderTranspose, this changes the notes themselves.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
recorderShift("target", semitones)
```

#### `recorderStore(target, slot [, name])`

Save the take into a slot (1-based), optionally named.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
recorderStore("target", slot)
```

#### `recorderLoad(target, slot)`

Load a stored take from a slot (1-based).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
recorderLoad("target", slot)
```

#### `recorderCountIn(target, bars)`

Set the count-in length (0–4 bars).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
recorderCountIn("target", bars)
```

### Harmoniser

Drive the [Harmoniser](../CE/web/src/CE_Application/docs/harmoniser.md) — one finger in, a full chord out. `target` is the component's control name.

#### `harmonyMode(target, mode)`

"diatonic" (build chords in key) or "memory" (replay captured shapes).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
harmonyMode("target", "diatonic")
```

#### `harmonyKey(target, key)`

Re-key it mid-song (0 = C … 11 = B; wraps around).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
harmonyKey("target", key)
```

#### `harmonyScale(target, scale)`

Set the scale (e.g. "major", "minor", "dorian").

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
harmonyScale("target", "scale")
```

#### `harmonySize(target, size)`

Chord size — 2 to 6 voices.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
harmonySize("target", size)
```

#### `harmonyShape(target, shape)`

A preset name or an explicit interval list. An unknown preset is a no-op, never a silent default.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
-- Lua
harmonyShape("target", {0, 4, 7})
```
```js
// JavaScript
harmonyShape("target", [0, 4, 7])
```

#### `harmonyVoicing(target, voicing)`

"close", "open", or "drop2".

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
harmonyVoicing("target", "close")
```

#### `harmonyInversion(target, inversion)`

Chord inversion.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
harmonyInversion("target", inversion)
```

#### `harmonyOctave(target, octave)`

Octave offset for the generated chord.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
harmonyOctave("target", octave)
```

#### `harmonyOutOfKey(target, mode)`

Notes outside the key: "pass", "nearest", or "mute".

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
harmonyOutOfKey("target", "nearest")
```

#### `harmonyKeepPlayed(target [, keep])`

Keep the played note in the chord (toggles without an argument).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
harmonyKeepPlayed("target", true)
```

#### `harmonyChannel(target, channel)`

MIDI channel for the generated notes.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
harmonyChannel("target", channel)
```

#### `harmonyVoiceLeading(target, mode)`

How consecutive chords connect: "off", "closest", or "smooth".

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
harmonyVoiceLeading("target", "smooth")
```

#### `harmonyStrum(target, ms)`

Strum spread in milliseconds (0–400).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
harmonyStrum("target", ms)
```

#### `harmonyDegree(target, degree, chord)`

Override one scale degree's chord with an interval list; nil/null restores stacked thirds.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
-- Lua
harmonyDegree("target", degree, {0, 5, 7})
```
```js
// JavaScript
harmonyDegree("target", degree, [0, 5, 7])
```

### Setlist

Drive the [Setlist](../CE/web/src/CE_Application/docs/setlist.md) — scenes on a footswitch. `target` is the component's control name.

#### `setlistNext(target)`

Step to the next enabled scene — same event downstream as a footswitch step.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
setlistNext("target")
```

#### `setlistPrev(target)`

Step back to the previous enabled scene.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
setlistPrev("target")
```

#### `setlistGoto(target, scene)`

Jump to a scene — 1-based index or scene name (a name survives a reorder).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
setlistGoto("target", scene)
```

#### `setlistEnable(target, scene [, enabled])`

Include a scene, or skip it with false ("skip one tonight").

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
setlistEnable("target", scene, false)
```

#### `setlistWrap(target [, wrap])`

Wrap from the last scene back to the first.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
setlistWrap("target", true)
```

#### `setlistCrossfade(target, ms)`

Crossfade time between scenes, in milliseconds.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
setlistCrossfade("target", ms)
```

### Arpeggiator

Drive the [Arpeggiator](../CE/web/src/CE_Application/docs/arpeggiator.md) — held notes walked as a pattern. `target` is the component's control name.

#### `arpPattern(target, pattern)`

"up", "down", "updown", "downup", "asPlayed", "random", or "chord".

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
arpPattern("target", "up")
```

#### `arpRate(target, stepsPerSecond)`

Free-running speed in steps per second (when not synced to the transport).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
arpRate("target", 6)
```

#### `arpSync(target [, on])`

Follow the transport (false = free-run at arpRate).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
arpSync("target", true)
```

#### `arpDivision(target, division)`

Synced step length: "1/4", "1/8", "1/16", "1/32", dotted "1/8D", triplet "1/8T", …

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
arpDivision("target", "1/16")
```

#### `arpOctaves(target, octaves)`

Spread the held notes across 1–4 octaves.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
arpOctaves("target", 2)
```

#### `arpGate(target, gate)`

Note length as a fraction of the step (0–1; 1 = legato).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
arpGate("target", 0.6)
```

#### `arpSwing(target, swing)`

Set the Arp's own swing (0–1) — this also switches it off the transport's shared swing.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
arpSwing("target", 0.2)
```

#### `arpVelocity(target, velocity)`

Velocity of the generated notes (1–127).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
arpVelocity("target", 96)
```

#### `arpChannel(target, channel)`

MIDI channel for the generated notes (1–16).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
arpChannel("target", channel)
```

#### `arpSource(target, source)`

What it arpeggiates: "chord" (its own), "link" (a linked Chord Pad), or "input" (played notes).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
arpSource("target", "chord")
```

### Turing Modulator

Drive the [Turing Modulator](../CE/web/src/CE_Application/docs/turing-modulator.md) — the locking random looper. `target` is the component's control name.

#### `turingRandomness(target, amount)`

The lock ↔ evolve knob (0–1): 0 = the loop never changes, 1 = every pass rewrites it.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
turingRandomness("target", 0.2)
```

#### `turingLength(target, steps)`

Loop length in steps (2–64).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
turingLength("target", 8)
```

#### `turingRate(target, stepsPerSecond)`

Free-running speed in steps per second (when not synced).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
turingRate("target", 2)
```

#### `turingSync(target [, on])`

Follow the transport (false = free-run at turingRate).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
turingSync("target", true)
```

#### `turingDivision(target, division)`

Synced step length: "1/4", "1/8", "1/16", dotted/triplet variants.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
turingDivision("target", "1/8")
```

#### `turingSeed(target)`

Replace the register with a fresh random loop — "new melody, please".

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
turingSeed("target")
```

#### `turingClear(target)`

Zero the register.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
turingClear("target")
```

#### `turingQuantize(target, levels)`

Quantize the output to N discrete levels (0 = continuous, up to 24).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
turingQuantize("target", levels)
```

### Gesture Looper

Drive the [Gesture Looper](../CE/web/src/CE_Application/docs/gesture-looper.md) — recorded control motion on a loop. `target` is the component's control name.

#### `looperLaneEnable(target, lane [, enabled])`

Unmute a lane (false mutes it). Lane by 1-based index, id, or label.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
looperLaneEnable("target", lane, true)
```

#### `looperLaneClear(target, lane)`

Wipe one lane's recorded gesture.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
looperLaneClear("target", lane)
```

#### `looperClear(target)`

Wipe every lane.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
looperClear("target")
```

#### `looperRest(target, lane, rest)`

A lane's rest value (0–1) — what it outputs where nothing is recorded.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
looperRest("target", lane, 0.5)
```

#### `looperSync(target [, on])`

Loop over bars of the transport instead of free seconds.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
looperSync("target", true)
```

#### `looperBars(target, bars)`

Loop length in bars when synced (0.25–64).

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
looperBars("target", 2)
```

#### `looperSeconds(target, seconds)`

Loop length in seconds when free-running.

*Availability: preview ✅ · export ✅ — Panel-UI runtime (editor preview and the exported player window); not available to the window-closed C++ runtime.*

```lua
looperSeconds("target", 4)
```

## Helpers

Host-provided and identical in every language. Only what the language lacks or what must be
domain-consistent — plain math (`min`/`max`/`abs`/`sin`) stays with the language's own library.

### Value / range

| Helper | What it does |
|---|---|
| `scale(v, inLo, inHi, outLo, outHi)` | Map a value from one range to another. |
| `clamp(v, lo, hi)` | Keep a value inside a range. |
| `round(v)` | Nearest whole number. |
| `snap(v, step)` | Snap to the nearest step. |
| `curve(v, shape)` | Apply a named response curve ("log","exp","s"…). |
| `lerp(a, b, t)` | Blend between a and b by t (0–1). |

### Music

| Helper | What it does |
|---|---|
| `noteName(n)` | MIDI note number → name, e.g. 60 → "C4" (middle C = C4). |
| `noteNumber(name)` | Note name → MIDI number, e.g. "C4" → 60. |

### MIDI encoding

| Helper | What it does |
|---|---|
| `to7bit(v, count, order)` | Pack v into `count` 7-bit bytes; order = "msb"/"lsb" first (14/21/28-bit). |
| `from7bit(bytes, order)` | Unpack 7-bit bytes back to a value. |
| `to14bit(v)` | Shorthand: value → { msb, lsb }. |
| `from14bit(msb, lsb)` | Shorthand: msb, lsb → value. |
| `toNibbles(byte)` | Split a byte into { hi, lo } 4-bit nibbles. |
| `fromNibbles(hi, lo)` | Combine two nibbles into a byte. |
| `nibblize(bytes)` | Whole block: byte array → nibble array. |
| `denibblize(bytes)` | Whole block: nibble array → byte array. |
| `toAscii(str, length)` | String → padded ASCII byte array (patch names). |
| `fromAscii(bytes)` | ASCII byte array → string. |
| `toOffset(v, center)` | Bipolar → centered encoding (e.g. -64..+63, center 64). |
| `fromOffset(b, center)` | Centered encoding → bipolar. |
| `toSigned(v, bits)` | Value → two's-complement in N bits. |
| `fromSigned(b, bits)` | Two's-complement in N bits → value. |

## When things go wrong

The design rule (spec Q11): **a broken script never crashes the panel.** What that means in
practice:

- **A handler throws** → that handler stops; every other handler and the panel keep running.
  The error is printed in the editor's script console (script name + message) and, in an
  exported plugin, written to the log file. Never silent, never a dialog.
- **`set()` on an unknown control** → an error line in the script console
  (`set: control "…" not found on the active panel`); the script continues.
- **`get()` on an unknown control or path** → returns nothing (`nil`/`undefined`/`None`) —
  guard before doing math with it.
- **A component command aimed at the wrong component** (e.g. `phraseSeed` on a knob) → an
  error line naming what was expected; nothing changes.
- **A valid command with an unknown argument** (an unknown seed name, an out-of-grid cell, an
  unknown preset) → a deliberate no-op, with a console line so it never looks like a dead
  footswitch.
- **Runaway scripts** → loop, depth, and MIDI-flood guards plus an infinite-loop watchdog trip
  invisibly and log when they do. Scripts see only this API — no filesystem, network, or OS.

## Further reading

- [Getting started](scripting-getting-started.md) — your first script, step by step.
- [Scripting cookbook](scripting-cookbook.md) — task-based recipes.
- [Panel API spec](../tools/docs/panel-api-spec.md) — the design decisions behind this API.
- [Docs index](README.md) — reading order for all scripting docs.
