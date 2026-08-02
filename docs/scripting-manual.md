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

| Event | Handler | Payload | Fires when |
|---|---|---|---|
| `"valueChange"` | `onValueChange(value)` | `value` | Live — fires continuously while the value is moving (for GUI/preview). |
| `"valueChanged"` | `onValueChanged(value)` | `value` | Settled — fires when the value reaches its final value (for transmit). |
| `"click"` | `onClick(mouse)` | `mouse` | Clicked. mouse.x, mouse.y. |
| `"doubleClick"` | `onDoubleClick(mouse)` | `mouse` | Double-clicked. |
| `"pointerDown"` | `onPointerDown(mouse)` | `mouse` | Mouse pressed. mouse.x/.y/.button/.modifiers. |
| `"pointerMove"` | `onPointerMove(mouse)` | `mouse` | Mouse moved while down. |
| `"pointerUp"` | `onPointerUp(mouse)` | `mouse` | Mouse released. |
| `"hoverStart"` | `onHoverStart()` | — | Mouse entered the control. |
| `"hoverEnd"` | `onHoverEnd()` | — | Mouse left the control. |
| `"wheel"` | `onWheel(wheel)` | `wheel` | Scrolled over the control. wheel.delta. |
| `"stateChanged"` | `onStateChanged(state)` | `state` | State swapped (hover/pressed/disabled). |

### Panel events

| Event | Handler | Payload | Fires when |
|---|---|---|---|
| `"controlChanged"` | `onControlChanged(info)` | `info` | Any control changed. info.target, info.value. |
| `"panelStateChanged"` | `onPanelStateChanged(state)` | `state` | Panel state switched. |
| `"timer"` | `onTimer(info)` | `info` | A started timer fired. info.id. |

### Device events

| Event | Handler | Payload | Fires when |
|---|---|---|---|
| `"parameterReceived"` | `onParameterReceived(info)` | `info` | A value arrived, decoded via the DPD. info.parameter, info.value. |
| `"dumpReceived"` | `onDumpReceived(dump)` | `dump` | A bulk dump arrived. dump.bytes, dump.kind. Use applyDump(dump.bytes) to fill the panel. |
| `"midiIn"` | `onMidiIn(midi)` | `midi` | Any MIDI arrived (raw). midi.bytes, midi.channel, midi.status. |
| `"ccIn"` | `onCcIn(cc)` | `cc` | A CC arrived. cc.channel, cc.cc, cc.value. |
| `"sysexIn"` | `onSysexIn(bytes)` | `bytes` | Raw SysEx arrived. |
| `"deviceConnected"` | `onDeviceConnected(device)` | `device` | A device connected. |
| `"deviceDisconnected"` | `onDeviceDisconnected(device)` | `device` | A device disconnected. |

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

```lua
emit("name", data)
```

#### `run(target.action [, args])`

Run a named action elsewhere. Host-dispatched — works cross-language. Supports a return value. Only simple data crosses the boundary.

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

```lua
startTimer("id", ms)
```

#### `stopTimer(id)`

Stop a named timer started with startTimer(id, ms).

```lua
stopTimer("id")
```

### Debug

#### `log(message [, value])`

Print to the script console without changing state.

```lua
log("message", value)
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
