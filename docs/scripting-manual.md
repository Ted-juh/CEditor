# CEditor Scripting Manual

> **Generated file — do not edit by hand.**
> Source of truth: `CE/web/src/CE_Application/scripting/panelApi.js` (the same data that drives
> the editor's picker and validation). Regenerate with `npm run docs:manual` in `CE/web`.
> New to scripting here? Start with the [cookbook](scripting-cookbook.md); design background and
> reading order are in the [docs index](README.md).

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

## Addressing: paths and values

Everything on the panel is reachable by a **dot-path** rooted on a control's name:
`"cutoff.value"`, `"button2.background.fill.colour"`. Read and write them with `get`/`set`
(below). Renaming a control automatically updates its name in every script.

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
`mouse.x`).

### Control events

| Event | Handler | Payload | Fires when | Where |
|---|---|---|---|---|
| `"valueChange"` | `onValueChange(value)` | `value` | Live — fires continuously while the value is moving (for GUI/preview). | everywhere |
| `"valueChanged"` | `onValueChanged(value)` | `value` | Settled — fires when the value reaches its final value (for transmit). | everywhere |
| `"click"` | `onClick(mouse)` | `mouse` | Clicked. mouse.x, mouse.y. | everywhere |
| `"doubleClick"` | `onDoubleClick(mouse)` | `mouse` | Double-clicked. | everywhere |
| `"pointerDown"` | `onPointerDown(mouse)` | `mouse` | Mouse pressed. mouse.x/.y/.button/.modifiers. | everywhere |
| `"pointerMove"` | `onPointerMove(mouse)` | `mouse` | Mouse moved while down. | everywhere |
| `"pointerUp"` | `onPointerUp(mouse)` | `mouse` | Mouse released. | everywhere |
| `"hoverStart"` | `onHoverStart()` | — | Mouse entered the control. | everywhere |
| `"hoverEnd"` | `onHoverEnd()` | — | Mouse left the control. | everywhere |
| `"wheel"` | `onWheel(wheel)` | `wheel` | Scrolled over the control. wheel.delta. | everywhere |
| `"stateChanged"` | `onStateChanged(state)` | `state` | State swapped (hover/pressed/disabled). | preview ⬜ · export ⬜ — Planned — not dispatched anywhere yet. |

### Panel events

| Event | Handler | Payload | Fires when | Where |
|---|---|---|---|---|
| `"controlChanged"` | `onControlChanged(info)` | `info` | Any control changed. info.target, info.value. | preview ⬜ · export ⬜ — Planned — not dispatched anywhere yet. |
| `"panelStateChanged"` | `onPanelStateChanged(state)` | `state` | Panel state switched. | preview ⬜ · export ⬜ — Planned — not dispatched anywhere yet. |
| `"timer"` | `onTimer(info)` | `info` | A started timer fired. info.id. | preview ⬜ · export ✅ — Runs in the exported plugin (TimerManager); editor-preview timers are pending. |

### Device events

| Event | Handler | Payload | Fires when | Where |
|---|---|---|---|---|
| `"parameterReceived"` | `onParameterReceived(info)` | `info` | A value arrived, decoded via the DPD. info.parameter, info.value. | preview ⬜ · export ✅ — Wired in the exported plugin; editor-preview dispatch is pending. |
| `"dumpReceived"` | `onDumpReceived(dump)` | `dump` | A bulk dump arrived. dump.bytes, dump.kind. Use applyDump(dump.bytes) to fill the panel. | everywhere |
| `"midiIn"` | `onMidiIn(midi)` | `midi` | Any MIDI arrived (raw). midi.bytes, midi.channel, midi.status. | preview ⬜ · export ✅ — Wired in the exported plugin; editor-preview dispatch is pending. |
| `"ccIn"` | `onCcIn(cc)` | `cc` | A CC arrived. cc.channel, cc.cc, cc.value. | preview ⬜ · export ✅ — Wired in the exported plugin; editor-preview dispatch is pending. |
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

React to an event on another control / the panel / the device, or to a custom emitted event.

*Availability: preview ⬜ · export ✅ — Stubbed in the editor preview for now; dispatched by the C++ host in the exported plugin.*

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

Announce a custom event; any script listening with on(name, …) reacts. Fire-and-forget, language-neutral.

*Availability: preview ⬜ · export ✅ — Stubbed in the editor preview for now; dispatched by the C++ host in the exported plugin.*

```lua
emit("name", data)
```

#### `run(target.action [, args])`

Run a named action elsewhere. Host-dispatched — works cross-language. Supports a return value. Only simple data crosses the boundary.

*Availability: preview ⬜ · export ✅ — Stubbed in the editor preview for now; dispatched by the C++ host in the exported plugin.*

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

*Availability: preview ⬜ · export ✅ — Returns null in the editor preview — the panel→bytes codec lives in the device host.*

```lua
-- Lua
local bytes = buildDump("patch")
```
```js
// JavaScript
const bytes = buildDump("patch")
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

### Timers

#### `startTimer(id, ms)`

Start (or restart) a named repeating timer; onTimer fires with info.id every ms until stopTimer(id).

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

## Errors & safety

A broken script never crashes the panel: runtime errors stop that handler only, are reported in
the editor's script console (and a log file in an exported plugin), and everything else keeps
running. Loop, depth, and MIDI-flood guards plus an infinite-loop watchdog run invisibly in the
background. Scripts see only this API — no filesystem, network, or OS access.

## Further reading

- [Scripting cookbook](scripting-cookbook.md) — task-based recipes.
- [Panel API spec](../tools/docs/panel-api-spec.md) — the design decisions behind this API.
- [Docs index](README.md) — reading order for all scripting docs.
