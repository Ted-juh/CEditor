# CEditor Scripting Manual

> **Generated file — do not edit by hand.**
> Source of truth: `CE/web/src/CE_Application/scripting/panelApi.js` (the same data that drives
> the editor's picker and validation). Regenerate with `npm run docs:manual` in `CE/web`.
> First script? Start with [getting started](scripting-getting-started.md), then the
> [cookbook](scripting-cookbook.md); reading order for everything is in the [docs index](README.md).

A script is a piece of code plus the moment it runs. That moment is either a lifecycle hook
(like "the panel just loaded") or an event (like "this knob moved"). Every language uses the
same commands, described below. A script is stored and run in the language you wrote it in.
It is never converted.

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

## Where scripts run

Your scripts can run in two places:

- **preview** — the panel window. This is the editor's live preview, and also the window of
  the exported plugin. Scripts run here while the window is on screen.
- **export** — the exported standalone or VST3 plugin itself. Its script engines keep running
  even when the window is closed. Timers keep ticking. MIDI keeps arriving.

Most commands work the same in both places. Those carry no badge. A command carries a badge
only when the two places differ: ✅ means it works there today, ⬜ means it does not yet, and
the note says why. Commands that need the window (drawing, dialogs, the on-screen components)
do nothing with the window closed, and a note goes to the log.

If your script must keep working with the window closed, for example a timer that keeps
sending MIDI, check the badges and use only commands that work in both places.

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

**Handles** are the convenience form of the same operation: `panel.get("cutoff")` returns a
handle that remembers the prefix — `h.set("value", 8000)` (Lua: `h:set("value", 8000)`),
`h.get("value")`, and `h.on("valueChanged", fn)`. `self` is the same kind of handle, bound
to the control the script is attached to. *(The spec's dot-object form — `panel.cutoff.value` —
remains optional planned sugar.)*

A control's value has three faces — suffix the path with the one you need. (**DPD** = the
Device Profile Designer: the device map that knows each parameter's bytes, ranges, and enums,
and converts between these representations for you.)

| Accessor | What you get |
|---|---|
| `.value` | The real, human value — e.g. 8000 (Hz) or "LP" (enum name). The default. Setting it lets the DPD convert to MIDI on send. |
| `.normalizedValue` | The 0–1 position, from the control's own min/max. For uniform math, curves, and linking controls of different ranges. |
| `.midiValue` | The value as MIDI (e.g. 101), as the DPD would encode it. Device-bound controls only, and requires the device host attached. |

**`self`** — The element this script is attached to: the control for a component script, the panel for a panel script. Use instead of a fixed name so one script works on every copy of a reusable component.

## Lifecycle hooks

Named functions the host calls at fixed moments. Define the ones you need; leave the rest out.

### `onPanelLoad()`

Phase 1 — before the GUI exists. MIDI setup / init SysEx only. Do not touch controls; they do not exist yet.

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

### `onPanelBuild()`

Phase 1b — build the panel: create, clone and parent controls. Runs after onPanelLoad and before onPanelReady, panel view only. Script-created controls are cleared before each run, so it always starts from the authored panel.

```lua
-- Lua
function onPanelBuild()
  for i = 1, 4 do
    ce.panel.create("Knob", { name = "osc" .. i, x = 20 + i * 90, y = 40 })
  end
  …
end
```
```js
// JavaScript
function onPanelBuild() {
  for (let i = 1; i <= 4; i++) {
    ce.panel.create("Knob", { name: "osc" + i, x: 20 + i * 90, y: 40 });
  }
  …
}
```

### `onError(info)`

A script failed. `info` carries script, scriptId, event, phase ("load" | "dispatch") and message. Runs in every runtime, including window-closed; the error is always logged as well. An error raised inside onError is logged and not re-dispatched, so a broken reporter cannot loop.

```lua
-- Lua
function onError(info)
  set("status.text", info.script .. ": " .. info.message)
  …
end
```
```js
// JavaScript
function onError(info) {
  set("status.text", `${info.script}: ${info.message}`);
  …
}
```

### `onDraw(info)`

Paint on top of the control this script is attached to. `info` carries target, width and height (the control's current size). Called on repaint, not every frame: to animate, drive it from onTimer and call ce.draw.redraw(). Panel view only.

```lua
-- Lua
function onDraw(info)
  ce.draw.clear()
  ce.draw.stroke("#5B9BD5", 2)
  ce.draw.line(0, info.height / 2, info.width, info.height / 2)
  …
end
```
```js
// JavaScript
function onDraw(info) {
  ce.draw.clear();
  ce.draw.stroke("#5B9BD5", 2);
  ce.draw.line(0, info.height / 2, info.width, info.height / 2);
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

Phase 4 — the view is closing: preview stopped, or the plugin window was closed. Scripts keep running (timers still tick, MIDI still arrives). For script teardown, use onPanelDestroy.

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

### `onPanelDestroy()`

Phase 5 — scripts are being torn down: panel switched, script set replaced, or plugin unloaded. The last hook to run; timers, state and MIDI still work, so restore the synth or send a final dump here. Fires exactly once per loaded script set, even if onPanelClose never fired.

```lua
-- Lua
function onPanelDestroy()
  …
end
```
```js
// JavaScript
function onPanelDestroy() {
  …
}
```

### `onDawSaveState(store) -> object`

The DAW is saving the project — return an object of what to save. `store` is what other scripts have saved so far, for reading. Mutating it does nothing.

```lua
-- Lua
function onDawSaveState(store)
  return { key = value }
end
```
```js
// JavaScript
function onDawSaveState(store) {
  return { key: value };
}
```

### `onDawRestoreState(store)`

The DAW reopened the project — read your values back out of `store` (the object your onDawSaveState returned, merged with every other script's).

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
| `"timer"` | `onTimer(info)` | `info` | A started timer fired. info.id. |

### Device events

| Event | Handler | Payload | Fires when |
|---|---|---|---|
| `"parameterReceived"` | `onParameterReceived(info)` | `info` | A value arrived, decoded via the DPD. info.parameter, info.value. |
| `"dumpReceived"` | `onDumpReceived(dump)` | `dump` | A bulk dump arrived. dump.bytes, dump.kind. Use applyDump(dump.bytes) to fill the panel. |
| `"midiIn"` | `onMidiIn(midi)` | `midi` | Any MIDI arrived (raw). midi.bytes, midi.channel, midi.status. |
| `"ccIn"` | `onCcIn(cc)` | `cc` | A CC arrived. cc.channel, cc.cc, cc.value. Note: cc.channel is 0-based here, unlike sendCC and onNoteIn. |
| `"noteIn"` | `onNoteIn(note)` | `note` | A note was played. note.channel (1-16, matching sendNote), note.note, note.velocity. A note-on with velocity 0 counts as a note-off and arrives as onNoteOffIn instead. |
| `"noteOffIn"` | `onNoteOffIn(note)` | `note` | A note was released. note.channel (1-16), note.note, note.velocity (the release velocity, 0 when the device sent a note-on with velocity 0 instead of a note-off). |
| `"sysexIn"` | `onSysexIn(bytes)` | `bytes` | Raw SysEx arrived. |
| `"deviceConnected"` | `onDeviceConnected(device)` | `device` | A device connected. |
| `"deviceDisconnected"` | `onDeviceDisconnected(device)` | `device` | A device disconnected. |

## Commands

### Values

#### `set(path, value [, opts])`

Write a value at a path. Suffix the path with .normalizedValue to write a 0–1 position instead of the real value. Transmits to the synth by default; writes made while reacting to inbound MIDI stay silent.

```lua
set("path", value)
```

#### `get(path [, form])`

Read a value at a path. Choose the representation by suffixing the path (.value — the default — .normalizedValue, or .midiValue) or by passing it as `form`.

```lua
get("path")
```

### Transmit

#### `noTransmit(fn)`

Run a block writing to the panel without sending to the synth (e.g. an Init-Patch button). Auto-resets at block end.

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

#### `off(target, event)`

Stop reacting to an event you subscribed to with on(). Removes this script's listeners for that target and event; unknown pairs are ignored.

```lua
off("target", "event")
```

#### `watch(path, fn)`

Call fn(value, previous) whenever any model path changes — a nested section field, a colour, a device binding. Fires regardless of source: script, user, or inbound MIDI.

```lua
-- Lua
watch("cutoff.value", function(v, prev)
  …
end)
```
```js
// JavaScript
watch("cutoff.value", (v, prev) => {
  …
})
```

#### `compute(path, fn)`

Make a property a formula: fn is re-evaluated whenever anything moves, and its result is written to path.

```lua
-- Lua
compute("label.text.text", function()
  return 
end)
```
```js
// JavaScript
compute("label.text.text", () => {
  return 
})
```

#### `intercept(path, fn)`

Intercept every write to path. fn(value, prev) returns a replacement value to transform it (clamp, quantize, snap), false to reject it, or nothing to accept it unchanged.

```lua
-- Lua
intercept("cutoff.value", function(v, prev)
  return 
end)
```
```js
// JavaScript
intercept("cutoff.value", (v, prev) => {
  return 
})
```

#### `defineAction(name, fn)`

Register a named action. run("name") calls it from any script in any language, and it is offered wherever the panel binds actions.

```lua
-- Lua
defineAction("initPatch", function(args)
  …
end)
```
```js
// JavaScript
defineAction("initPatch", (args) => {
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

#### `startTimer(id, ms)`

Start (or re-time) a repeating timer. It fires onTimer with info.id every `ms` until stopTimer(id).

```lua
startTimer("id", 250)
```

#### `after(ms, fn) -> id`

Run `fn` once, `ms` from now. Returns an id; pass it to stopTimer to cancel before it fires.

```lua
-- Lua
after(250, function()
  …
end)
```
```js
// JavaScript
after(250, function () {
  …
});
```

#### `stopTimer(id)`

Stop a timer started with startTimer. Stopping an unknown id is harmless.

```lua
stopTimer("id")
```

### Device / MIDI

#### `requestDump(kind [, fn [, opts]])`

Ask the synth to send a dump. `kind` is defined by the DPD ("patch"/"tone"/"global"…) or declared by defineDump. With `fn`, the reply is delivered to fn(values, info); `info.ok` is false when nothing arrived within `opts.timeout` (default 3000ms). fn runs after onDumpReceived, so both see the same panel.

```lua
-- Lua
requestDump("patch", function(values, info)
  if info.ok then  end
end)
```
```js
// JavaScript
requestDump("patch", (values, info) => {
  if (info.ok) {  }
});
```

#### `applyDump(bytes)`

Fill the whole panel from a received dump (walks the DPD map). Silent automatically — inbound context. Also accepts an already-decoded { parameter: value } map, which works with no device host attached.

```lua
applyDump(bytes)
```

#### `sendDump(kind)`

Build a dump from the panel values and send it to the synth.

```lua
sendDump("patch")
```

#### `buildDump(kind)`

Build the dump bytes from the panel values without sending. Requires the device host (the DPD codec lives there); returns nothing in a plain browser tab and reports why.

```lua
-- Lua
local bytes = buildDump("patch")
```
```js
// JavaScript
const bytes = buildDump("patch")
```

#### `deviceProfile([role])`

The device profile mapped to a role — { id, name, role, connected, ... } — or nil when no profile is mapped. `role` defaults to "mainSynth".

```lua
-- Lua
local p = deviceProfile()
if p then log("device " .. p.name) end
```
```js
// JavaScript
const p = deviceProfile();
if (p) log("device " + p.name);
```

#### `deviceParameters([opts])`

The profile's parameter descriptors: { id, name, group, type, min, max, access }. `opts` may carry { role, query, group, type, access, limit } to narrow the list. Returns an empty list, not nil, when there is nothing to report; returns nil when ce.device is gated off.

```lua
-- Lua
for _, p in ipairs(deviceParameters({ group = "Filter" })) do
  log(p.id .. " " .. p.name)
end
```
```js
// JavaScript
for (const p of deviceParameters({ group: "Filter" })) log(p.id + " " + p.name);
```

#### `deviceParameter(id [, role])`

One parameter descriptor by id, or nil if the profile has no such parameter. Use it to ask whether a synth supports something before driving it.

```lua
-- Lua
local p = deviceParameter("cutoff")
if p then log("max " .. tostring(p.max)) end
```
```js
// JavaScript
const p = deviceParameter("cutoff");
if (p) log("max " + p.max);
```

#### `deviceRead(id [, role]) -> value`

The last reported value of a device parameter, from a dump or a parameter message. Not a live query of the synth. Returns nothing if the device has never reported it — distinct from zero.

```lua
-- Lua
local v = ce.device.read("cutoff")
if v ~= nil then  end
```
```js
// JavaScript
const v = ce.device.read("cutoff");
if (v !== undefined) {  }
```

#### `deviceWrite(id, value [, role]) -> boolean`

Set a device parameter on the synth by parameter id; no control binding is required. The device profile encodes the message. Returns whether the message was dispatched, not whether the synth accepted it. `value` is in the parameter's own units, the ones deviceParameter() reports min and max for.

```lua
-- Lua
ce.device.write("cutoff", 64)
```
```js
// JavaScript
ce.device.write("cutoff", 64);
```

#### `deviceConnected([role])`

Is the device for this role connected and ready? Cheap to call, and the right guard before a dump request.

```lua
-- Lua
if deviceConnected() then requestDump("patch") end
```
```js
// JavaScript
if (deviceConnected()) requestDump("patch");
```

#### `deviceDefineParameter(id, spec [, role]) -> boolean`

Declare a device parameter at runtime, for a synth with no shipped profile. `spec` gives the wire format — { cc = 74 }, { nrpn = { msb, lsb } } or { sysex = { … } } — plus name/group/type/min/max for what parameters() reports. A spec with no wire format is refused, and the refusal says why. A declared id overrides a profile one, so a script can correct one wrong parameter without redeclaring the rest. Sysex template tokens: a hex literal, $value, $deviceId, any $name from `variables`, $checksumStart and $checksum.

```lua
-- Lua
ce.device.defineParameter("cutoff", { name = "Cutoff", group = "Filter", min = 0, max = 127, cc = 74 })
```
```js
// JavaScript
ce.device.defineParameter("cutoff", { name: "Cutoff", group: "Filter", min: 0, max: 127, cc: 74 });
```

#### `deviceDefineDump(kind, spec [, role]) -> boolean`

Declare a SysEx dump layout at runtime: `request` (the bytes that ask for it), `match` ({ prefix, suffix }), `offset`/`size` for the payload, an optional `checksum`, and `fields` — one { parameter, offset } per value the dump carries. Every field must name a parameter already declared with defineParameter; an unknown one is refused. A declared layout is matched against arriving SysEx, fills the bound controls and raises onDumpReceived, exactly as a profile-defined dump does.

```lua
-- Lua
ce.device.defineDump("patch", {
  request = "f0 7d 00 f7",
  match = { prefix = { "f0", "7d", "01" }, suffix = { "f7" } },
  offset = 3,
  fields = { { parameter = "cutoff", offset = 0 } },
})
```
```js
// JavaScript
ce.device.defineDump("patch", {
  request: "f0 7d 00 f7",
  match: { prefix: ["f0", "7d", "01"], suffix: ["f7"] },
  offset: 3,
  fields: [{ parameter: "cutoff", offset: 0 }],
});
```

#### `deviceBind(control, parameterId [, opts]) -> boolean`

Wire a control to a device parameter at runtime. Replaces whatever was bound to the same port rather than adding a second binding, and switches DeviceBindings back on if the control had it off. `opts` takes { role, port }; port defaults to "value".

```lua
-- Lua
ce.device.bind("cutoffKnob", "cutoff")
```
```js
// JavaScript
ce.device.bind("cutoffKnob", "cutoff");
```

#### `deviceUnbind(control [, port]) -> boolean`

Remove a control's device binding. Returns whether there was one to remove.

```lua
-- Lua
ce.device.unbind("cutoffKnob")
```
```js
// JavaScript
ce.device.unbind("cutoffKnob");
```

#### `devicePorts([opts]) -> list`

Enumerate the MIDI ports: [{ id, name, direction, type, hardware, role }]. `hardware` is false for the two placeholder rows the app always lists ("No MIDI Input", "Preview Only"); `role` is the role currently using the port, or empty. `opts.direction` narrows to "in" or "out".

```lua
-- Lua
for _, p in ipairs(ce.device.ports({ direction = "out" })) do
  if p.hardware then log(p.name) end
end
```
```js
// JavaScript
for (const p of ce.device.ports({ direction: "out" })) if (p.hardware) log(p.name);
```

#### `deviceVariables([role]) -> table`

The variables every message recipe interpolates — `channel`, `deviceId` and whatever else the profile declares — as their effective values: the profile's defaults with this project's overrides applied. Returns nothing when no profile is mapped to the role.

```lua
-- Lua
log("device id " .. tostring(ce.device.variables().deviceId))
```
```js
// JavaScript
log(`device id ${ce.device.variables().deviceId}`);
```

#### `deviceSetVariable(name, value [, role]) -> boolean`

Set one recipe variable, 0..127 — e.g. to point this panel at a different unit. The write lands on this project's override, not on the shared profile, so two panels can use different device ids for the same synth. Individual uses clamp further (a channel is 1..16).

```lua
-- Lua
ce.device.setVariable("deviceId", 17)
```
```js
// JavaScript
ce.device.setVariable("deviceId", 17);
```

#### `deviceTiming([role]) -> table`

How fast the panel is allowed to talk to this device: `minDelayBetweenMessagesMs` and any other timing the profile declares, with this project's overrides applied.

```lua
-- Lua
log("gap " .. tostring(ce.device.timing().minDelayBetweenMessagesMs) .. " ms")
```
```js
// JavaScript
log(`gap ${ce.device.timing().minDelayBetweenMessagesMs} ms`);
```

#### `deviceSetTiming(name, ms [, role]) -> boolean`

Set one timing override for this project, in milliseconds, 0..60000 — e.g. to slow the panel down for a device that cannot keep up. As with setVariable, the profile itself is not modified.

```lua
-- Lua
ce.device.setTiming("minDelayBetweenMessagesMs", 40)
```
```js
// JavaScript
ce.device.setTiming("minDelayBetweenMessagesMs", 40);
```

#### `deviceCoverage([feature [, role]]) -> table|string`

The profile's self-reported feature coverage, as strings rather than booleans. With no feature, returns the whole map — `singleParameterWrite`, `realtimeEditing`, `editBufferDumpParse` and so on. Profiles answer "complete", "partial" and "notImplemented", but also free-form values such as "filter-block-rq1". Test the words you care about.

```lua
-- Lua
if ce.device.coverage("singleParameterWrite") == "complete" then log("write one at a time") end
```
```js
// JavaScript
if (ce.device.coverage("singleParameterWrite") === "complete") log("write one at a time");
```

#### `deviceRecipes([role]) -> list`

The ids of the message recipes this profile can build — the templates its parameters send through. An empty list when no profile is mapped.

```lua
-- Lua
for _, id in ipairs(ce.device.recipes()) do log(id) end
```
```js
// JavaScript
for (const id of ce.device.recipes()) log(id);
```

#### `deviceRequests([role]) -> list`

The ids of the named requests this profile can send — an identity enquiry, an edit-buffer request. Ask before assuming one exists.

```lua
-- Lua
for _, id in ipairs(ce.device.requests()) do log(id) end
```
```js
// JavaScript
for (const id of ce.device.requests()) log(id);
```

#### `sendCC(channel, cc, value)`

Send a raw MIDI CC.

```lua
sendCC(channel, cc, value)
```

#### `sendNRPN(channel, msb, lsb, value)`

Send a raw NRPN.

```lua
sendNRPN(channel, msb, lsb, value)
```

#### `sendRPN(channel, msb, lsb, value)`

Send a registered parameter number (RPN): the standard path for pitch-bend range (0,0), fine tuning (0,1) and coarse tuning (0,2). Same shape as sendNRPN, but uses CC 101/100 instead of 99/98.

```lua
-- Lua
sendRPN(1, 0, 0, 2)  -- pitch-bend range
```
```js
// JavaScript
sendRPN(1, 0, 0, 2);  // pitch-bend range
```

#### `sendSongPosition(beats)`

Send a Song Position Pointer: where the next start or continue resumes from, in MIDI beats (one beat = six clocks = a sixteenth note).

```lua
-- Lua
sendSongPosition(0)
```
```js
// JavaScript
sendSongPosition(0);
```

#### `sendMidi(bytes)`

Send raw MIDI bytes exactly as given — no wrapping, no channel maths. The primitive the other message verbs are built on; reach for one of those first.

```lua
-- Lua
sendMidi({0x90, 60, 100})
```
```js
// JavaScript
sendMidi([0x90, 60, 100])
```

#### `sendNote(channel, note, velocity [, ms])`

Note on. `note` is a MIDI number or a name ("C3"). Velocity 0 is a note off. Give `ms` and the matching note off is scheduled automatically.

```lua
sendNote(1, 60, 100)
```

#### `interceptMidiIn(fn)`

Intercept inbound MIDI before the panel's bindings, note input and transport see it. fn(bytes) returns replacement bytes to rewrite the message, false to swallow it, or nothing to pass it through.

```lua
-- Lua
interceptMidiIn(function(bytes)
  …
  return bytes
end)
```
```js
// JavaScript
interceptMidiIn((bytes) => {
  …
  return bytes
})
```

#### `interceptMidiOut(fn)`

Intercept outbound MIDI — every message the panel sends, from a script or from a control's own binding. fn(bytes) returns replacement bytes to rewrite the message, false to swallow it, or nothing to pass it through.

```lua
-- Lua
interceptMidiOut(function(bytes)
  …
  return bytes
end)
```
```js
// JavaScript
interceptMidiOut((bytes) => {
  …
  return bytes
})
```

#### `feedMidi(bytes)`

Inject a message as if it had arrived from the hardware: the panel's own bindings, note input and transport all act on it. Inbound intercepts and filters run on it, so a fed message obeys the same rules as a real one.

```lua
-- Lua
feedMidi({0x90, 60, 100})
```
```js
// JavaScript
feedMidi([0x90, 60, 100])
```

#### `routeMidi(role, fn)`

Send everything inside `fn` to a named device role instead of the default device. Block-scoped, the same shape noTransmit() uses.

```lua
-- Lua
routeMidi("aux", function()
  …
end)
```
```js
// JavaScript
routeMidi("aux", () => {
  …
})
```

#### `sendNoteOff(channel, note [, velocity])`

Note off. Release velocity defaults to 0. Nothing schedules this for you: send it for every note you start.

```lua
sendNoteOff(1, 60)
```

#### `sendProgramChange(channel, program [, bankMsb, bankLsb])`

Program change, with an optional bank select (CC 0 / CC 32) sent first.

```lua
sendProgramChange(1, 0)
```

#### `sendPitchBend(channel, value)`

Pitch bend as the raw 14-bit value: 0–16383, centre 8192. How many semitones that spans depends on the synth's bend range.

```lua
sendPitchBend(1, 8192)
```

#### `sendAftertouch(channel, pressure [, note])`

Channel pressure, or polyphonic pressure for one note when `note` is given.

```lua
sendAftertouch(1, 64)
```

#### `sendClock()`

One MIDI clock tick (0xF8). Twenty-four per quarter note — drive it from a timer.

```lua
sendClock()
```

#### `sendTransport(action)`

MIDI transport: "start" (0xFA), "continue" (0xFB) or "stop" (0xFC).

```lua
sendTransport("start")
```

#### `sendSysex(bytes)`

Send a raw SysEx message.

```lua
sendSysex(bytes)
```

#### `checksum(type, bytes [, opts]) -> number`

Compute the checksum a synth expects at the end of a message. Eleven methods: "sum-7bit", "roland-7bit" (also spelled "roland" or "yamaha"), "ones-complement-7bit", "xor-7bit", "offset-7bit", "sum-8bit", "twos-complement-8bit", "crc8", "crc16-ccitt", "crc16-modbus" and "crc32"; a name not on the list returns nothing and reports the accepted names. The 7-bit methods fit in a single SysEx byte, the CRCs do not — pass CRC results through to7bit() before sending.

```lua
checksum("roland", bytes)
```

#### `panic([opts])`

Silence the rig: All Sound Off (120), then All Notes Off (123), then Reset All Controllers (121). Defaults to all 16 channels; pass { channel } for one, { resetControllers: false } to skip 121.

```lua
panic()
```

### Value / range

#### `lighten(colour [, amount]) -> string`

Scale each channel toward white. `amount` 0..1, default 0.4 (the border renderer's highlight amount). Returns nothing for a colour it cannot read.

#### `darken(colour [, amount]) -> string`

Scale each channel toward black. `amount` 0..1, default 0.55 (the border groove shading amount).

#### `mixColour(a, b, t) -> string`

Blend two colours, `t` 0..1. Per-channel linear interpolation in plain RGB.

#### `colourAlpha(colour, a) -> string`

Apply an alpha to a colour, returned in the panel's stored form: AARRGGBB, no leading #. The one colour verb that does not return #RRGGBB. Warning: css's #rrggbbaa is the same bytes in the opposite order. To make a drawing translucent use ce.draw.opacity().

#### `hexToRgb(colour) -> table`

A colour as { r, g, b }, each 0..255. Returns nothing for a colour it cannot read.

#### `rgbToHex(r, g, b) -> string`

Convert channels 0..255 to "#RRGGBB". Out-of-range channels are clamped, not wrapped.

#### `hexToHsl(colour) -> table`

A colour as { h, s, l } — hue 0..360, saturation and lightness 0..100 (the colour editor's ranges). Grey returns hue 0 and saturation 0.

#### `hslToHex(h, s, l) -> string`

Convert hue 0..360, saturation and lightness 0..100 to "#RRGGBB". Inverse of hexToHsl.

### Animation

#### `animateTo(path, target [, opts])`

Animate a value to `target` instead of jumping there. Pass a list of controls to move them all in one call, with `stagger` offsetting their starts. Starting a second move on the same control replaces the first; the replaced one reports cancelled, not finished.

```lua
-- Lua
ce.anim.to("cutoff", 127, { duration = 500, curve = "s" })
```
```js
// JavaScript
ce.anim.to("cutoff", 127, { duration: 500, curve: "s" });
```

#### `animateSpring(path, target [, opts])`

Move a value to `target` with a damped oscillation — it overshoots and settles. `opts`: { duration (ms, default 600), damping (default 6), frequency (default 12), from } plus everything animateTo takes except `curve` — beats, sync, delay, stagger, repeat, pingpong, done, and a list of paths.

```lua
-- Lua
ce.anim.spring("cutoff", 127)
```
```js
// JavaScript
ce.anim.spring("cutoff", 127);
```

#### `animateStop([path])`

Stop the animation on `path`, leaving the value where it got to. No path stops every animation this panel is running. `done` fires with completed = false; use finish() to jump to the target instead.

```lua
-- Lua
ce.anim.stop("cutoff")
```
```js
// JavaScript
ce.anim.stop("cutoff");
```

#### `animateRunning([path])`

Return whether `path` is being animated right now. With no path, return whether any animation is running.

```lua
-- Lua
if not ce.anim.running("cutoff") then  end
```
```js
// JavaScript
if (!ce.anim.running("cutoff")) {  }
```

#### `animateEnvelope(path, points [, opts])`

Move a value through a multi-point shape — an attack and decay, a hold and fall. `points` is a list of { x, y } points between 0 and 1, the same format the Envelope component uses. Unlike `to`, the value can rise and fall within one animation.

```lua
-- Lua
ce.anim.envelope("cutoff", { {x=0,y=0}, {x=0.1,y=1}, {x=0.4,y=0.6}, {x=1,y=0} }, { duration = 800, to = 127 })
```
```js
// JavaScript
ce.anim.envelope("cutoff", [{x:0,y:0},{x:0.1,y:1},{x:0.4,y:0.6},{x:1,y:0}], { duration: 800, to: 127 });
```

#### `animateValue(path) -> table`

Describe the animation on `path`: { path, kind, value, progress, from, to, elapsed, remaining, paused, cycle, sync }. Returns nothing when the path is not animating. `elapsed` and `remaining` are nil for a transport-synced animation.

#### `animateList() -> list`

List every running animation, in path order, each described as animateValue describes it.

#### `animatePause(path)`

Hold an animation where it is, without ending it. Returns false when nothing is running on the path, or it is already paused.

#### `animateResume(path)`

Resume an animation from where pause() held it; it continues rather than restarting.

#### `animateReverse(path)`

Turn a running animation around from where it is, travelling back at the same rate — a move that was 80% done takes 80% of its duration to get home. An envelope reverses its shape as well as its direction.

#### `animateFinish(path)`

Jump to the target and complete: the value lands exactly where the animation was going and `done` fires with completed = true. Use stop() to cancel instead, leaving the value where it is.

### User feedback

#### `uiNotify(message [, opts])`

Show a brief message to the panel user and return its ID. `opts` may carry { kind ("info" | "warn" | "error"), duration (ms, default 3000; 0 or less means until dismissed) }. For user-facing events, not debugging — use log() for that. Pass the ID to ce.ui.update(id, …) to replace the message in place, or to ce.ui.dismiss(id) to remove it.

```lua
-- Lua
ce.ui.notify("Patch loaded")
```
```js
// JavaScript
ce.ui.notify("Patch loaded");
```

#### `uiStatus([message] [, opts])`

Put a line in the status bar; it persists until replaced. No message clears it. Use for a state ("Recording", "Synced") rather than an event — notify is for events. `opts` may carry { kind ("info" | "warn" | "error") }. Read it back with ce.ui.state().

```lua
-- Lua
ce.ui.status("Recording")
```
```js
// JavaScript
ce.ui.status("Recording");
```

#### `uiDialog(opts [, onChoice]) -> boolean`

Ask a question with buttons. The answer arrives asynchronously through `onChoice`, which receives the clicked label, or nothing if the dialog was dismissed. The call itself returns whether a dialog appeared: false means there was nobody to ask and the callback has already run with no answer. Only one dialog can be open at a time.

```lua
-- Lua
ce.ui.dialog({ title = "Overwrite?", buttons = { "Overwrite", "Cancel" } }, function(choice)
  if choice == "Overwrite" then
    …
  end
end)
```
```js
// JavaScript
ce.ui.dialog({ title: "Overwrite?", buttons: ["Overwrite", "Cancel"] }, function (choice) {
  if (choice === "Overwrite") {
    …
  }
});
```

#### `uiPrompt(opts [, onAnswer]) -> boolean`

Ask the user to type text. The answer comes back through `onAnswer` as text, or as nothing if they cancelled — an empty answer and no answer are distinct. Enter accepts. Returns whether a dialog appeared; false means the callback has already run with no answer.

```lua
-- Lua
ce.ui.prompt({ title = "Name this patch", value = get("patchName") }, function(name)
  if name ~= nil then set("patchName", name) end
end)
```
```js
// JavaScript
ce.ui.prompt({ title: "Name this patch", value: get("patchName") }, (name) => {
  if (name !== undefined) set("patchName", name);
});
```

#### `uiChoose(opts [, onAnswer]) -> boolean`

Ask the user to pick from a list. The answer is the chosen item, a list of items if `multiple` is set, or nothing if they cancelled. A long list scrolls rather than growing.

```lua
-- Lua
ce.ui.choose({ title = "Load which preset?", items = names }, function(pick)
  if pick ~= nil then  end
end)
```
```js
// JavaScript
ce.ui.choose({ title: "Load which preset?", items: names }, (pick) => {
  if (pick !== undefined) {  }
});
```

#### `uiDismiss([id]) -> number`

Remove a message; the user can also do this by clicking it. With no id, clears every message. Returns how many were removed.

```lua
-- Lua
ce.ui.dismiss(id)
```
```js
// JavaScript
ce.ui.dismiss(id);
```

#### `uiUpdate(id, message [, opts]) -> boolean`

Change a message that is already on screen, in place. To show progress, give the original message a duration of 0 so it stays put, then update it as you go. Returns false once the message has gone — for example dismissed by hand — so you can stop updating.

```lua
-- Lua
local id = ce.ui.notify("Working…", { duration = 0 })
-- …later
ce.ui.update(id, "Working… done")
```
```js
// JavaScript
const id = ce.ui.notify("Working…", { duration: 0 });
// …later
ce.ui.update(id, "Working… done");
```

#### `uiState() -> table`

Return what is on screen: { status, statusKind, notifications ([{ id, message, kind, sticky }]), dialog }. Use `dialog` to tell apart the two reasons dialog() can return false — nobody to ask, or a dialog already open.

```lua
-- Lua
if not ce.ui.state().dialog then  end
```
```js
// JavaScript
if (!ce.ui.state().dialog) {  }
```

#### `uiCopy(text) -> boolean`

Put text on the clipboard. The write is asynchronous and a browser may refuse it without a user gesture: the return means the copy was attempted, and a refusal is reported to the console. There is no clipboard read.

```lua
-- Lua
ce.ui.copy(bytesToHex(buildDump("patch")))
```
```js
// JavaScript
ce.ui.copy(bytesToHex(buildDump("patch")));
```

### Drawing

#### `drawClear([target])`

Discard everything drawn on this control. Drawing commands accumulate rather than replace, so this is the usual first line of onDraw.

```lua
-- Lua
ce.draw.clear()
```
```js
// JavaScript
ce.draw.clear();
```

#### `drawFill(colour)`

The fill colour for the shapes that follow — a hex string such as "#5B9BD5", or nil for no fill. May be a gradient from ce.draw.gradient() rather than a flat colour.

```lua
-- Lua
ce.draw.fill("#5B9BD5")
```
```js
// JavaScript
ce.draw.fill("#5B9BD5");
```

#### `drawStroke([colour] [, width] [, opts])`

The line colour and thickness for the shapes that follow. `width` defaults to 1; nil colour means no stroke, and `colour` may be a gradient from ce.draw.gradient(). `opts` carries { dash (a list of on/off lengths, e.g. { 3, 3 }), dashOffset (how far into that pattern to start), cap ("butt" | "round" | "square"), join ("miter" | "round" | "bevel") }.

```lua
-- Lua
ce.draw.stroke("#5B9BD5", 2)
```
```js
// JavaScript
ce.draw.stroke("#5B9BD5", 2);
```

#### `drawRect(x, y, w, h [, radius])`

A rectangle in the control's own coordinates, with an optional corner radius.

```lua
-- Lua
ce.draw.rect(0, 0, 40, 20)
```
```js
// JavaScript
ce.draw.rect(0, 0, 40, 20);
```

#### `drawCircle(cx, cy, r)`

A circle centred on (cx, cy).

```lua
-- Lua
ce.draw.circle(20, 20, 8)
```
```js
// JavaScript
ce.draw.circle(20, 20, 8);
```

#### `drawLine(x1, y1, x2, y2)`

A straight line. Stroke only; fill does not apply.

```lua
-- Lua
ce.draw.line(0, 0, 100, 0)
```
```js
// JavaScript
ce.draw.line(0, 0, 100, 0);
```

#### `drawPath(points [, closed])`

A polyline through a flat list of coordinates — { x1, y1, x2, y2, ... }. `closed` joins the last point back to the first.

```lua
-- Lua
local pts = {}
for i = 0, 63 do
  pts[#pts + 1] = i * (info.width / 63)
  pts[#pts + 1] = info.height / 2
end
ce.draw.path(pts)
```
```js
// JavaScript
const pts = [];
for (let i = 0; i < 64; i++) pts.push(i * (info.width / 63), info.height / 2);
ce.draw.path(pts);
```

#### `drawArc(x, y, radius, from, to)`

An arc centred on (x, y). Angles are degrees with 0 at twelve o'clock, increasing clockwise — the same convention the Meter's arcStart/arcSweep use. Stroked with the current stroke; filled as a pie slice if a fill is set.

```lua
-- Lua
ce.draw.arc(30, 30, 24, 135, 135 + 270 * value)
```
```js
// JavaScript
ce.draw.arc(30, 30, 24, 135, 135 + 270 * value);
```

#### `drawGradient(stops [, angle]) -> value`

Build a gradient to use in place of a flat colour with fill() or stroke(). Give a plain list of colours to space them evenly, or a list of { at, colour, opacity } to place them yourself; the two forms can be mixed. `angle` is 0 for up and 90 for right, the same as the Background section's gradients. Fewer than two usable colours returns nothing.

```lua
-- Lua
ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }, 180))
```
```js
// JavaScript
ce.draw.fill(ce.draw.gradient(["#2A6BD4", "#0A1830"], 180));
```

#### `drawOpacity(a)`

Set the opacity for everything drawn after this, 0..1. Like fill and stroke, it applies to what follows, not to one shape. A value that is not a number clears it. To make a stored colour translucent instead, use ce.math.alpha().

#### `drawTransform([opts])`

Rotate, move or scale everything drawn after this. `opts` carries { rotate (degrees, clockwise), cx, cy (the centre to rotate about), x, y (a shift), scale }. No opts clears it.

```lua
-- Lua
ce.draw.transform({ rotate = 135, cx = w / 2, cy = h / 2 })
```
```js
// JavaScript
ce.draw.transform({ rotate: 135, cx: w / 2, cy: h / 2 });
```

#### `drawEllipse(cx, cy, rx, ry)`

An ellipse centred on (cx, cy), with horizontal radius rx and vertical radius ry.

#### `drawPixelText(text, x, y [, scale])`

Text in the app’s built-in 5x7 LCD font, the same one the LCD components use. `scale` is a whole-number pixel size, 1 by default. Drawn one square per lit pixel, with no smoothing. (x, y) is the top-left corner, unlike text() whose y is the baseline.

#### `drawMeasure(text [, opts]) -> table`

Measure a string before drawing it: returns { width, height, exact }. `opts` carries { size, family } for ordinary text, or { pixel = true, scale } for the LCD font. The pixel font is a fixed grid, so its answer is exact; a proportional font must be measured, and when no surface is available the result is an estimate with `exact` false.

#### `drawBatch(fn) -> boolean`

Send a run of drawing commands as a single update instead of one each. Use it when drawing in a loop — a waveform, a set of tick marks — where it is several times faster. grid, lines and points already send a whole set at once and do not need it.

#### `drawGrid([opts]) -> boolean`

Draw a whole grid as one command and one path. `opts` may carry { x, y, width, height } (defaulting to the control's box) and either a spacing — { step } or { stepX, stepY } — or a count, { columns, rows }. The closing line is drawn, so a 4-column grid has five verticals.

#### `drawLines(segments) -> boolean`

Draw many disjoint line segments as one command — a list of [x1, y1, x2, y2]. For unconnected geometry: tick marks, a vu ladder, a grid you compute yourself. drawPath draws a connected run.

#### `drawPoints(points [, radius]) -> boolean`

A scatter of dots as one command — a list of [x, y], with `radius` defaulting to 1.5. The radius is independent of the stroke width.

#### `drawCurve(points [, opts]) -> boolean`

A smooth curve through the given points — a Catmull-Rom spline emitted as cubic Béziers, in one command.

#### `drawPolygon(cx, cy, radius, sides [, opts]) -> boolean`

A regular polygon centred on (cx, cy). `opts.rotation` is in degrees with 0 at twelve o'clock, clockwise — the same convention drawArc uses, so a polygon and an arc at the same angle line up. Fewer than three sides is raised to three.

#### `drawImage(src, x, y, w, h [, opts]) -> boolean`

Draw an image. `src` must be a data URL or a library icon's dataUrl from ce.image.asset(); a bare asset name is refused rather than drawn as nothing. `opts.fit` is "fill" (stretch, the default), "contain" or "cover".

#### `drawClip([x, y, w, h]) -> boolean`

Restrict everything drawn after this to a rectangle. It is a style, not a shape: it applies until changed, and save()/restore() put it back. No arguments clears it. The control's own bounds still clip on top, so a clip can narrow the drawing area but never widen it.

#### `drawBlend(mode) -> boolean`

How what follows composites with what is under it: "normal" (the default), "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion". An unknown mode is refused and reported rather than silently ignored.

#### `drawSave() -> boolean`

Push the current style — fill, stroke, width, dash, dash offset, cap, join, opacity, transform, clip and blend — so restore() can put it back. The stack is cleared at the start of each drawing pass, so a forgotten restore cannot leak into the next one.

#### `drawRestore() -> boolean`

Pop the style that save() pushed. Reports and returns false when nothing was saved, rather than silently resetting to defaults.

#### `drawText(x, y, text [, opts])`

Text at (x, y), which is its left baseline. `opts` may carry { size, align, family }; align is "left" | "middle" | "right".

```lua
-- Lua
ce.draw.text(4, 12, "hello")
```
```js
// JavaScript
ce.draw.text(4, 12, "hello");
```

#### `drawRedraw([target])`

Ask for onDraw to run again. Nothing repaints on its own; to animate, call this from onTimer.

```lua
-- Lua
ce.draw.redraw()
```
```js
// JavaScript
ce.draw.redraw();
```

### Images

#### `imageAssets([opts]) -> list`

List the icon library, as { id, name, source, mime, vector, width, height, filePath, dataUrl, portable, embeddable }. `opts` narrows with { vector = true } or { embeddable = true }. `portable` is false for every entry: the payload lives in app settings, not in the panel document, so a reference to it does not survive an export. `embeddable` says whether ce.image.embed() can copy the data URL into a layer.

#### `imageAsset(idOrName) -> table|nil`

Look up one library asset, by id first and then by name — the same resolution order the renderer uses. Returns nil when the library has no such asset; call it before writing an asset reference. Beware the name fallback: a coincidental name match is indistinguishable from an id hit.

#### `imageSet(target, src [, opts]) -> boolean`

Set an image on one of a control's four image layers and switch that layer on, always writing the picture and the switch together so a layer cannot be on and empty. Background layers composite with each other; a picture inside text replaces whatever was there. An option the chosen layer does not have is refused and reported, not stored.

#### `imageClear(target [, layer]) -> boolean`

Turn a layer off and blank its source in one step. An exclusive text layer also resets to "solid", because a selected mode with no source paints nothing.

#### `imageRead(target [, layer]) -> table`

Read the layer's full state, plus three derived fields: `active` is whether the layer will actually paint (for a text layer this depends on `mode`, not on `Enabled`), `source` is "data" | "file" | "none", and `portable` says whether it survives an export — only an embedded data URL does.

#### `imageIcon(target, idOrName [, opts]) -> boolean`

Point a control's Icon section at a library asset. `opts` may carry { size, fit, tint, opacity, rotation }. Writes both the id and the name, because the renderer resolves by id and falls back to the name. An asset the library does not have is refused rather than stored.

#### `imageEmbed(target [, layer]) -> boolean`

Copy the layer's resolved data URL into the layer, replacing a machine-local file path, so the image survives export. Already-embedded sources return true unchanged. A file the host has not read yet returns false; the read is requested, and calling again once it lands succeeds.

#### `imageLoad(path) -> boolean`

Ask the host to read a file into the cache, and report whether it is there yet. A path source renders blank until this has happened, and the read is asynchronous — so this returns false the first time and true once the data has arrived. A data URL needs no loading and returns true immediately.

### Typography

#### `textFonts([opts]) -> list`

List every font the panel can use, with per-font capabilities. `portable` says whether the font survives an export: built-in fonts work everywhere, while a library font lives on this machine, is not part of the panel document, and falls back to a system font for other users. `featuresKnown` says whether the font's typographic features have actually been checked; when it is false, an empty feature list means unchecked, not featureless.

#### `textFont(family) -> table|nil`

Get one font descriptor by family name, or nil when no such font is available. Matched case-insensitively against the stored family and its label, the same matching the Properties panel uses. Use it to check a family before writing it, or to ask what variable axes a face has.

#### `textStyle(target, opts) -> boolean`

Set a control's type — font, size, weight, spacing, alignment and the rest — in one call. Boldness is stored as a pair of fields that must agree; this always writes both together, where setting one directly leaves them inconsistent. An unavailable font, a feature the font does not offer, or an option that is not a text option is refused and reported. Returns false if any part did not apply.

#### `textAxis(target, tag, value) -> boolean`

Set one variable-font axis by its four-letter tag, clamped to the range the font declares. An axis the face does not have is refused rather than stored. Setting `wght` also updates the weight pair, matching the Properties panel's own axis control — otherwise a variable face renders its old weight.

#### `textRead(target [, name]) -> value|table`

Read one text field by name, from whichever of Font / Multiline / Position owns it — `size` and `lineHeight` are both just names; the script need not know which node holds them. With no name, return the whole state: { content, resolvedWeight, font, multiline, position }. `resolvedWeight` is the weight the renderer will actually use, not either half of the stored pair.

#### `textMeasure(target [, text]) -> table`

Measure the room a control's text takes up, in its own font: { width, height, lines, truncated, exact }. Measures through the same code that draws the text, so the result matches the actual layout — spacing, wrapping and line limits included. Pass `text` to measure text the control does not hold yet. `exact` is false when there was no surface to measure on and the answer is an estimate.

#### `textFit(target [, opts]) -> table`

Shrink Font.size until the text fits the control's box, write that size, and report { size, fits, changed, exact }. `opts` may carry { min = 6, max = the current size, text }. Unlike Text.Multiline.fitMode = "shrink", which scales only at paint time and never changes the stored size, this writes the size so other things can read and align to it. `fits` is false when even `min` overflows; the call still succeeds.

### Panel structure

#### `panelCreate(type, props)`

Create a control and return its name (nil if the type is unknown — panelTypes() lists them). `props` may carry name, x, y, width, height, and any section override such as { Behavior = { min = 0, max = 127 } }.

```lua
-- Lua
ce.panel.create("Knob", { name = "cutoff", x = 20, y = 40 })
```
```js
// JavaScript
ce.panel.create("Knob", { name: "cutoff", x: 20, y: 40 });
```

#### `panelClone(name, props)`

Copy an existing control, including its sections, and return the copy's name. `props` overrides properties on the copy.

```lua
-- Lua
ce.panel.clone("template", { name = "copy", y = 120 })
```
```js
// JavaScript
ce.panel.clone("template", { name: "copy", y: 120 });
```

#### `panelDestroy(name)`

Remove a control and everything inside it. Returns true if it was there. Refuses to remove a control the author placed unless you pass its exact name — generated ones go freely.

```lua
-- Lua
ce.panel.destroy("name")
```
```js
// JavaScript
ce.panel.destroy("name");
```

#### `panelParent(name [, containerName])`

Move a control into a container, or to the top level when `containerName` is nil. Returns true on success. A container is any control with a Children section — Container, Group.

```lua
-- Lua
ce.panel.parent("knob", "row")
```
```js
// JavaScript
ce.panel.parent("knob", "row");
```

#### `panelFind([query])`

The names of matching controls, nested ones included. `query` is a substring of the name, or a table: { type = "Knob", generated = true, parent = "row1" }. No query means every control.

```lua
-- Lua
for _, n in ipairs(ce.panel.find({ type = "Knob" })) do
  …
end
```
```js
// JavaScript
for (const n of ce.panel.find({ type: "Knob" })) {
  …
}
```

#### `panelInfo(name)`

What a control is: { name, id, type, x, y, width, height, parent, generated }, or nil if there is no such control.

```lua
-- Lua
local c = ce.panel.info("name")
```
```js
// JavaScript
const c = ce.panel.info("name");
```

#### `panelTypes()`

Every component type panelCreate accepts, as a list of names.

```lua
-- Lua
log(table.concat(ce.panel.types(), ", "))
```
```js
// JavaScript
log(ce.panel.types().join(", "));
```

#### `panelAlign(names, edge [, opts]) -> number`

Align controls on one edge: "left" | "hCenter" | "right" | "top" | "vCenter" | "bottom". Default reference is the group's bounding box; `opts.to` names one control to align to instead (the canvas's key object). Returns how many moved. Names that are not controls are reported and skipped.

```lua
-- Lua
ce.panel.align({ "knob1", "knob2" }, "left")
```
```js
// JavaScript
ce.panel.align(["knob1", "knob2"], "left");
```

#### `panelDistribute(names, what [, opts]) -> number`

Spread controls evenly. `what` is "leftEdges" | "hCenters" | "rightEdges" | "topEdges" | "vCenters" | "bottomEdges" (even out positions) or "hSpacing" | "vSpacing" (even out the gaps between differently-sized controls). The first and last controls stay put. `opts.gap` forces a fixed gap instead of computing one; `opts.align` also lines up the cross axis. Needs at least two controls.

#### `panelMatch(names, what [, opts]) -> number`

Give controls the same size: "width" | "height" | "both". The first name is the reference unless `opts.to` names another, and the reference does not resize itself. Returns how many changed.

#### `panelGrid(names [, opts]) -> number`

Arrange controls into a grid. `opts` carries { columns (3), gapX (10), gapY (10) }. Cells are uniform, sized by the biggest control. Order is reading order — rows quantised to 20px, then left to right — not document order. The first control in that order anchors the origin.

```lua
-- Lua
ce.panel.grid(pads, { columns = 4, gapX = 8, gapY = 8 })
```
```js
// JavaScript
ce.panel.grid(pads, { columns: 4, gapX: 8, gapY: 8 });
```

#### `panelCircle(names [, opts]) -> number`

Arrange controls around a circle centred on their own bounding box. `opts` carries { radius (100), startAngle (0, degrees) }. Placement follows the order of `names`.

#### `panelFlip(names, axis) -> number`

Mirror control positions about the centre of their bounding box — "horizontal" or "vertical". Moves the controls only; it does not rotate or mirror the controls themselves.

#### `panelRect(name) -> table`

A control's position in panel coordinates: { x, y, width, height, right, bottom }. Unlike Transform.x, this accounts for container offsets. Given a list of names, returns the bounding box of the group. Returns nothing when no name resolves.

#### `panelOrder(names, where) -> number`

Change z-order: "front" | "forward" | "backward" | "back". Controls move within their own parent only. Later in document order paints later, so "front" is the end of the list.

#### `panelBatch(fn) -> boolean`

Run `fn` so that everything it does is a single undo step. The history flush happens even if the callback throws. In the player there is no history and the callback simply runs.

```lua
-- Lua
ce.panel.batch(function()
  …
end)
```
```js
// JavaScript
ce.panel.batch(() => {
  …
});
```

#### `panelKeep([path]) -> boolean`

Keep what a preview changed. Preview is a rehearsal: the panel goes back to how you authored it when preview stops, so a script's writes are undone with it. `panelKeep("Cutoff.Background.Fill.colour")` keeps one property; `panelKeep()` with no path keeps everything the run did. Returns whether anything was kept. A control the script itself created cannot be kept — it is built fresh by the next run, so keeping one would leave a copy beside it every time. Panel view only: the exported plugin owns its document and never puts it back.

```lua
ce.panel.keep("Cutoff.Background.Fill.colour")
```

#### `panelEntries(control, section)`

The names in one of a control's collection sections — States, Bindings, Animations, Parts, ValueChannels, Behaviors, HitZones, Generators, Links or Variants — in document order. Any other section name is refused, and the message lists the ones that work.

```lua
-- Lua
for _, s in ipairs(ce.panel.entries("knob", "States")) do log(s) end
```
```js
// JavaScript
for (const s of ce.panel.entries("knob", "States")) log(s);
```

#### `panelEntry(control, section, name)`

One entry out of a collection section, or nil. The name is matched case-insensitively, like a path.

```lua
-- Lua
local st = ce.panel.entry("knob", "States", "Hover")
```
```js
// JavaScript
const st = ce.panel.entry("knob", "States", "Hover");
```

#### `panelDefine(control, section, name, spec)`

Create an entry in a collection section, or replace an existing one. The spec is merged over the section's own template, so a partial spec is enough. Returns whether it landed.

```lua
-- Lua
ce.panel.define("knob", "States", "Warn", { when = { valueGreaterThan = 0.9 } })
```
```js
// JavaScript
ce.panel.define("knob", "States", "Warn", { when: { valueGreaterThan: 0.9 } });
```

#### `panelUndefine(control, section, name)`

Remove an entry from a collection section. Returns whether an entry existed. Note that set(path, nil) does not remove entries; this is the verb that does.

```lua
-- Lua
ce.panel.undefine("knob", "States", "Disabled")
```
```js
// JavaScript
ce.panel.undefine("knob", "States", "Disabled");
```

#### `panelPatch(control, state, patch [, part])`

Change how a control looks in one of its states — hovered, pressed, disabled. The patch is merged into the existing state rather than replacing it. Returns how many entries were applied. Use `part` to patch one part of a custom component. State entries are themselves paths, which plain set() cannot address.

```lua
-- Lua
ce.panel.patch("knob", "Hover", { ["Background.Fill.colour"] = "FFFF0000" })
```
```js
// JavaScript
ce.panel.patch("knob", "Hover", { "Background.Fill.colour": "FFFF0000" });
```

### Time

#### `tempo()`

The current tempo in bpm, or nil when nothing is reporting one. Read it, do not assume 120.

```lua
-- Lua
local bpm = tempo() or 120
```
```js
// JavaScript
const bpm = tempo() ?? 120;
```

#### `isPlaying()`

Is the transport running? False when stopped, and when nothing is reporting a transport at all.

```lua
-- Lua
if isPlaying() then  end
```
```js
// JavaScript
if (isPlaying()) {  }
```

#### `transportInfo()`

The whole picture: { playing, bpm, beats, bar, beat, beatsPerBar, source, valid }. `beats` counts quarter notes from the transport origin; `bar` and `beat` are 1-based. `valid` is false when nothing is reporting a position, in which case the rest is a default rather than a measurement.

```lua
-- Lua
local t = ce.time.transport()
if t.valid then log("bar " .. t.bar) end
```
```js
// JavaScript
const t = ce.time.transport();
if (t.valid) log("bar " + t.bar);
```

#### `beatsToMs(beats [, bpm])`

Convert beats to milliseconds at the current tempo. Pass `bpm` to override. Returns nil when there is no tempo to work from.

```lua
-- Lua
set("delayTime", beatsToMs(0.75))
```
```js
// JavaScript
set("delayTime", beatsToMs(0.75));
```

#### `msToBeats(ms [, bpm])`

The inverse of beatsToMs — how many quarter notes a duration spans at the current tempo.

```lua
-- Lua
local beats = msToBeats(500)
```
```js
// JavaScript
const beats = msToBeats(500);
```

#### `syncTimer(id, beats [, opts])`

startTimer with a musical interval: syncTimer("step", 0.25) fires every sixteenth at the current tempo. The interval follows tempo changes; each re-arm resets the timer's phase. Pass { follow = false } to freeze the interval at the creation tempo. When no tempo is being reported, nothing is started and the failure is reported.

```lua
-- Lua
syncTimer("step", 0.25)
```
```js
// JavaScript
syncTimer("step", 0.25);
```

#### `afterBeats(beats, fn) -> id`

after() with a musical delay: afterBeats(2, fn) runs fn in two beats' time. The delay is computed at call time and does not follow a later tempo change. Returns the timer id, which stopTimer cancels. When no tempo is being reported, nothing is scheduled (it does not fire immediately) and the failure is reported.

```lua
-- Lua
afterBeats(2, function()
  …
end)
```
```js
// JavaScript
afterBeats(2, () => {
  …
});
```

#### `runningTimers() -> list`

The ids of running named timers (startTimer or syncTimer), sorted. One-shot timers are not listed; after() already returns its id.

```lua
-- Lua
for _, id in ipairs(runningTimers()) do log(id) end
```
```js
// JavaScript
for (const id of runningTimers()) log(id);
```

#### `nowMs() -> number`

A monotonic millisecond reading. The origin is arbitrary; only differences are meaningful. Not a wall clock or date.

```lua
-- Lua
local t0 = nowMs()
```
```js
// JavaScript
const t0 = nowMs();
```

#### `beatsPerDivision(name) -> number`

A note division as a fraction of a beat: "1/16" → 0.25, "1/8T" → 0.333…, "1/4D" → 1.5. The same names every sequencer property uses. Returns nothing for a name this build does not know.

```lua
-- Lua
local beats = beatsPerDivision("1/16")
```
```js
// JavaScript
const beats = beatsPerDivision("1/16");
```

#### `divisionNames() -> list`

Every division this build knows, in picker order: { id, label, beats }. Build menus from this list rather than hard-coding the names.

```lua
-- Lua
for _, d in ipairs(divisionNames()) do log(d.label) end
```
```js
// JavaScript
for (const d of divisionNames()) log(d.label);
```

#### `barBeatAt(beats [, beatsPerBar]) -> table`

Convert any beat position to a musical position: { bar, beat, tick, text, beatsPerBar }. Bars and beats are 1-based; ticks are at 24 ppqn. `text` is the Transport component's own readout format ("3.2.00").

```lua
-- Lua
log(barBeatAt(transportInfo().beats).text)
```
```js
// JavaScript
log(barBeatAt(transportInfo().beats).text);
```

#### `stepAt(beats, division) -> number`

Which step of the grid a position is on, counting from 0 at the transport origin. Returns nothing for an unknown division.

#### `stepsBetween(from, to, division [, max]) -> table`

Count step boundaries crossed between two beat positions: { steps, dropped }. Use it to catch up steps a late frame slept through. `max` caps the catch-up (default 16); anything over the cap is counted in `dropped`, and the most recent steps are the ones kept.

#### `swingOffset(step, amount, division) -> number`

The swing offset for a step, in beats, to add to that step's position: every odd step is pushed later by up to half a step. `amount` is 0..1, the same number the Transport's swing property holds. Uses the transport's own swing calculation.

#### `cycleAt(beats, bars [, beatsPerBar]) -> table`

Position within a repeating cycle of `bars` bars: { phase, count, length }. `phase` is 0–1 through the cycle, `count` how many have completed, `length` the cycle in beats. Derived from the position, never accumulated, so it stays exact over long runs.

#### `loopedBeats(beats, startBeats, lengthBeats) -> table`

Fold a timeline position into a loop: { beats, pass }. Positions before the loop start are returned untouched, so a run-in or count-in works. `pass` is which time round the loop you are, and -1 before the loop is reached; watch it for changes to detect a wrap. The looped position is a pure function of the un-looped one, so it stays exact over long runs.

#### `tapTempo(times [, resetMs]) -> number`

Tempo from a list of tap times, in the milliseconds now() reports. Taps more than `resetMs` apart (default 2000) start a new measurement rather than averaging across the pause. Returns nothing from fewer than two usable taps; the result is clamped to 20–300 bpm.

#### `clockTempo(intervalsMs) -> number`

Tempo from the gaps between incoming MIDI clock pulses (24 per quarter note), e.g. 0xF8 intervals collected with ce.midi.interceptIn. Uses the median interval, so one late pulse does not skew the result. Returns nothing from an empty list.

### Storage

#### `state`

A table that persists between handler calls, private to this script. Cleared when the script reloads; use saveSetting for anything that must outlive the session.

```lua
-- Lua
state.count = (state.count or 0) + 1
```
```js
// JavaScript
state.count = (state.count ?? 0) + 1;
```

#### `saveSetting(key, value [, opts]) -> boolean`

Save a value persistently. In the editor a panel-scope setting is stored with the panel and travels with it; in an exported plugin it is stored in the host's project. Returns false when storage is unavailable.

```lua
saveSetting("key", value)
```

#### `loadSetting(key [, fallback [, opts]])`

Read back a value saved with saveSetting. Returns `fallback` when the key has never been written. `opts.scope` must match the scope the value was saved in — the same key in different scopes names different values.

```lua
-- Lua
local v = loadSetting("key", default)
```
```js
// JavaScript
const v = loadSetting("key", default);
```

#### `listSettings([opts]) -> list`

List every key saved in one scope, in no particular order. An empty list means nothing has been written; use storageInfo() to check whether storage is available. `opts.scope` as elsewhere; a panel-scope listing omits other scripts’ private keys.

```lua
-- Lua
for _, k in ipairs(ce.storage.settings()) do  end
```
```js
// JavaScript
for (const k of ce.storage.settings()) {  }
```

#### `forgetSetting(key [, opts]) -> boolean`

Delete a saved setting. Returns whether a value existed to delete. `opts.scope` as elsewhere.

```lua
-- Lua
ce.storage.forget("key")
```
```js
// JavaScript
ce.storage.forget("key");
```

#### `allSettings([opts]) -> table`

Every setting in one scope, as a table of key to value. `opts.scope` is "panel" (default), "script" or "local". A panel-scope listing omits other scripts’ private keys.

```lua
-- Lua
for k, v in pairs(ce.storage.all()) do log(k, v) end
```
```js
// JavaScript
for (const [k, v] of Object.entries(ce.storage.all())) log(k, v);
```

#### `clearSettings([opts]) -> number`

Delete every setting in one scope; returns how many were deleted. Panel scope leaves other scripts’ private keys untouched.

#### `storageInfo([opts]) -> table`

Describe a scope's store: { scope, backing, available, count, bytes }. `backing` names where values live — the panel document, this machine, or the DAW project state. `available` false means writes in this scope will not persist.

#### `encodeJson(value [, opts]) -> string`

Encode a value as JSON text. `opts.indent` pretty-prints with that many spaces. Returns nothing for a value with no JSON form — a cycle, a function. Identical in every runtime, including Lua, which has no json module of its own.

```lua
-- Lua
sendSysex(toAscii(ce.storage.encode(patch)))
```
```js
// JavaScript
sendSysex(toAscii(ce.storage.encode(patch)));
```

#### `decodeJson(text) -> value`

Decode JSON text into a value. Invalid JSON returns nothing. A JSON null also decodes to nothing: {"a":1,"b":null} arrives with one key and [1,null,2] with two entries, so encode-then-decode is not a full round trip where nulls are involved.

### Debug

#### `log(message [, value])`

Print to the script console without changing state.

```lua
log("message", value)
```

#### `logWarn(message [, value])`

Print at warning level: something is off but the panel carries on. Rendered distinctly from log() in the console.

```lua
ce.core.warn("message")
```

#### `logError(message [, value])`

Print at error level: something the panel could not do. Prints without throwing — the handler continues. To stop the handler, use your language's own error()/throw.

```lua
ce.core.error("message")
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
| `curve(v, shape)` | Apply a named response curve: "linear", "exp", "log" or "s". An unknown name is reported and treated as linear. For other shapes use map(). |
| `lerp(a, b, t)` | Blend between a and b by t (0–1). |
| `wrap(v, lo, hi)` | Wrap a value into a half-open range: wrap(12, 0, 12) is 0, wrap(-1, 0, 12) is 11. Use for pitch classes, LFO phase and step indices instead of the language's %, whose sign on negatives differs between runtimes — the same expression gives 11 in Lua and -1 in JavaScript. |
| `mapCurve(v, points)` | Piecewise-linear curve through breakpoints given as {{x, y}, …}: map(v, {{0,0},{0.5,0.9},{1,1}}). Points are sorted by x; outside the outermost points the value is held, not extrapolated. Two points with the same x form a step, and the later one wins. |
| `quantizeTo(v, values)` | Snap to the nearest value in a list: quantizeTo(9, {0, 8, 16}) is 8. A tie goes to the lower value. For evenly spaced steps use snap(). |
| `randomChoice(values [, weights])` | Pick one entry from a list, using the seeded generator. With `weights`, each entry's chance is its weight over the total; a missing or negative weight counts as zero, and all-zero weights fall back to an even pick. Exactly one number is drawn either way, so adding weights does not shift later draws. |
| `dbToGain(db)` | Convert decibels to linear gain: 0 dB is 1, -6 dB is about 0.5. |
| `gainToDb(gain)` | Convert linear gain to decibels. A gain of zero or less returns -144 dB (the 24-bit noise floor) rather than negative infinity. |
| `norm(v, lo, hi)` | Convert a value to its 0–1 position in a range, clamped at both ends. |
| `denorm(t, lo, hi)` | Convert a 0–1 position back into a range, clamped at both ends. |
| `bipolar(t)` | Convert 0–1 to -1..+1. |
| `unipolar(v)` | Convert -1..+1 to 0–1. |
| `fold(v, lo, hi)` | Reflect a value off the ends of a range: where wrap() jumps from top to bottom, fold keeps the movement continuous. Right for modulation depths where wrap() suits pitch classes. |
| `indexOfRange(t, count)` | Convert a 0–1 position to a zero-based index over `count` slots. At exactly 1.0 it returns count - 1, not `count`. |
| `crossfade(a, b, t [, law])` | Blend a to b with a fade law: "linear", "equalPower" or "sharp" — the same three as the Crossfader component. A linear fade between two sounds dips audibly in the middle; equalPower does not. |
| `approach(current, target, maxStep)` | Move current toward target, no further than maxStep in one call. Stateless — works from any handler without the script keeping a timer. |
| `roundTo(v, decimals)` | Round to a number of decimal places. Returns a number, not a string. |
| `almost(a, b [, epsilon])` | Float equality within `epsilon`. Use instead of == on values that have passed through scale() or curve(). |
| `minOf(values)` | The smallest in a list, or nil for an empty one. |
| `maxOf(values)` | The largest in a list, or nil for an empty one. |
| `sumOf(values)` | The total of a list; 0 for an empty one. |
| `meanOf(values)` | The average of a list, or nil for an empty one. |
| `blend(fromList, toList, t) -> list` | Interpolate one list of values into another, element by element. Both arguments are lists — for two single numbers use lerp. The shorter list decides the result length; missing entries are dropped, not padded with zeros. |
| `randomFloat(lo, hi)` | A seeded random float in a range. random(lo, hi) returns whole numbers; this returns fractional ones. |
| `randomGaussian([mean, sd])` | A seeded normally distributed random value, most results near `mean`. Always consumes exactly two draws from the generator, so seed replay stays stable. |
| `randomWalk(current, step, lo, hi)` | One step of a seeded random walk: drift from `current` by up to `step`. Folded at lo and hi rather than clamped, so the walk does not stick at the ends. |
| `randomBool([chance])` | A seeded weighted coin. `chance` is the probability of true, 0.5 by default. |
| `shuffle(values)` | A new list in seeded random order (Fisher-Yates, exactly one draw per element after the first). The same seed shuffles the same way. |
| `toDegrees(radians)` | Radians to degrees — the unit ce.draw's arcs are in. |
| `toRadians(degrees)` | Degrees to radians — the unit the language's trigonometry is in. |
| `distance(x1, y1, x2, y2)` | The distance between two points. For XY pads, joysticks, the Orbit and hit testing in ce.draw. |
| `angleOf(x1, y1, x2, y2)` | The angle from one point to another in ce.draw's convention: degrees, 0 at twelve o'clock, increasing clockwise, 0–360. |
| `polar(angle, radius)` | Convert an angle and radius to { x, y } offsets from a centre, in the same convention as angleOf. |
| `shapeCurve(v, curve [, tension])` | Bend a value with the panel's own curve family — the one Envelope segments and Router breakpoints use, distinct from curve(). Both spellings of the s-curve are accepted. `tension` defaults to 1.6, matching the app — unset does not mean linear. With `tension` set to 1 this is also the curve a Macro slot uses, so shape(v, curve, 1) reproduces it. |
| `deadzone(v, amount [, invert])` | The Expression Router's input shaping: below the threshold the value is zero, and the remaining range rescales to fill 0–1 so response starts at the edge of the dead zone. |
| `weightsFor(points, x, y [, power])` | The inverse-distance blend weights a Timbre Space and a Preset Constellation use, normalised to sum to 1. `power` is the blend sharpness — higher makes the nearest anchor dominate sooner. Pair with blendBy() to morph values. |
| `blendBy(values, weights)` | A weighted average: collapse `values` by `weights`, as a morph pad does. blend() interpolates two lists; this blends many values into one. |
| `tickStops(major [, minor])` | The 0–1 stop positions a slider's scale is drawn from, as { major, minor }. Use when drawing your own scale so its ticks line up with the app's. |
| `dbPosition(fraction [, floorDb, ceilDb])` | The 0–1 position of a level on a dB meter. Defaults match the Meter component: floor -60, ceiling +6. |
| `smooth(current, target, coefficient [, epsilon])` | Exponential smoothing toward a target — fast at first, easing as it closes. Snaps to the target once within `epsilon`, so the value arrives rather than approaching forever. approach() is the fixed-step alternative. |
| `hysteresis(value, on, low, high)` | A Schmitt trigger: turns on at `high`, off at `low`, and holds in between. `on` is the current state; the return is the new one. Two thresholds keep a value hovering on a line from flipping the state repeatedly. |
| `median(values)` | The middle value of a list, or the mean of the two middle ones; nil for an empty list. Unlike a mean, a median rejects a single spike. |
| `euclid(steps, pulses [, rotation])` | A Euclidean rhythm: `pulses` hits spread as evenly as possible across `steps`, returned as a list of yes/no — the same algorithm as the Arpeggiator's rest pattern. `rotation` rotates the pattern without changing the spacing between hits. |
| `unshape(y, curve [, tension])` | The inverse of shape(): un-taper a value shaped on the way out. `hold` is a step with no true inverse; it returns the earliest input that produces the output. |
| `random([lo, hi])` | A seeded random number. With no arguments, a float in [0, 1). With two, a whole number from lo to hi inclusive. The same seed replays the same sequence in every runtime. |
| `randomSeed(n)` | Set the seed of this script's generator; the same seed replays the same sequence. Reseeding with 0 uses the default seed. Every script has its own generator, and every named stream its own, so this never reaches another script's sequence. |
| `randomStream(name, fn)` | Run `fn` with random draws taken from a private named sequence, so two generative parts of one script do not affect each other's draws or seeds. The normal generator returns when the block ends, even on error. Streams are per script — two scripts using the same name do not share one. |

### Music

| Helper | What it does |
|---|---|
| `noteName(n [, flats])` | MIDI note number → name: 60 → "C4" (middle C). With `flats` omitted, the plain-ASCII spelling ("C#4"), which noteNumber round-trips. With `flats` given, the panel's spelling: true → "E♭4", false → "C♯4". `ce.music.spelling` answers which a key wants. |
| `noteNumber(name) -> number` | Note name → MIDI number: "C4" → 60 (middle C is C4). Reads all four spellings — "C#4", "C♯4", "Db4", "D♭4". A name it cannot read returns nothing, not 0 — 0 is a real note (C-1). |
| `scaleNotes(root [, scale]) -> list` | One octave of a scale, ascending from `root` — seven notes for the modes, five for the pentatonics, six for blues; the root is not repeated at the top. `scale` defaults to "major"; an unknown name returns nothing. |
| `chordNotes(root [, type]) -> list` | The notes of a chord, ascending from `root` — an absolute shape, not a scale degree. `type` defaults to "major"; major minor dim aug sus2 sus4 power maj6 min6 dom7 maj7 min7 minMaj7 dim7 m7b5 aug7 add9 dom9 maj9 min9. An unknown type returns nothing. |
| `quantizeNote(note, root [, scale]) -> number` | Snap a note to the nearest one in a scale, searching both directions; a tie goes up. `scale` defaults to "major"; an unknown name returns nothing. |
| `noteSpelling(root [, scale]) -> boolean` | Whether a key writes its accidentals as flats — F, B♭, E♭, A♭, D♭ and G♭ do. Judged by the relative major, so C minor spells E♭/A♭ rather than D♯/G♯. Pass the result to noteName to match the panel's labels. An unknown scale returns nothing. |
| `inScale(note, root [, scale]) -> boolean` | Whether a note is in the key, octave-blind — C2 and C5 are both the tonic of C. `scale` defaults to "major"; an unknown name returns nothing. |
| `scaleDegree(note, root [, scale]) -> number` | The degree of the key a note is: 1 for the tonic, 5 for the dominant. A note outside the key returns nothing rather than the nearest degree; use quantizeNote to round to the key on purpose. |
| `degreeChord(root, scale, degree [, size]) -> table` | The chord a key builds on a degree. Degrees start at 1, so degreeChord(60, "major", 5) is the chord on the fifth; `size` is the note count — 3 for a triad, 4 for a seventh. Returns the notes, the chord name spelled as the key spells it ("E♭m7") and its roman numeral. For a chord you already know, use chordNotes. |
| `chordQuality(notes) -> string` | Name a chord from its notes: [60, 63, 70] → "min7". Reads intervals above the lowest note — the inverse of chordNotes. Vocabulary: maj, min, dim, aug, sus2, sus4, maj7, dom7, min7, minMaj7, dim7, m7b5 — the same names the Chord Pad uses. |
| `voiceLead(notes, previous [, mode]) -> list` | Rearrange a chord to move as little as possible from the one before it — the Harmoniser's voice leading. "closest" keeps every note as close as it can; "smooth" holds the top note still; "off" gives root position. With no previous chord, the notes come back untouched. |
| `expandOctaves(notes [, octaves]) -> list` | Repeat a note set upward over `octaves` octaves (1..4), ascending — the Arpeggiator's own expansion, the step before arpOrder. Notes that would land above 127 are dropped, not clamped. |
| `arpOrder(notes, pattern) -> list` | The step order an arpeggiator pattern plays, as a list of steps — each step a list of notes, so "chord" comes back the same shape as the rest. Patterns: up, down, updown, downup, asPlayed, random, chord. Notes are used in the order given — sort them first for a rising run. "updown" and "downup" do not play the turning points twice. "random" returns the notes in the order given, as the panel's arpeggiator does — it picks its step as it plays; use ce.math.shuffle for a shuffled order. |

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
