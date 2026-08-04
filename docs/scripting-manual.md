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

The profile's parameter descriptors: { id, name, group, type, min, max, access }. `opts` may carry { role, query, group, type, access, limit } to narrow the list. Returns an empty list, not nil, when there is nothing to report — while ce.device is enabled. A gated call returns nil like any other, because a module that is off has no answer to give.

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

The last known value of a device parameter — what the synth most recently told us, from a dump or a parameter message. Not a live query: asking the synth is asynchronous, and this verb is not. Nothing comes back if the device has never reported it, which is different from zero.

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

Set a device parameter on the synth, by parameter id, whether or not a control is bound to it. The device profile encodes it. Returns whether the message was dispatched — not whether the synth accepted it, which nothing can know synchronously. `value` is in the parameter's own units, the ones deviceParameter() reports min and max for.

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

Teach the app a parameter at runtime, for a synth it has no profile for. `spec` says how it reaches the synth — { cc = 74 }, { nrpn = { msb, lsb } } or { sysex = { … } } — plus name/group/type/min/max for what parameters() reports. The declaration is refused (and says why) when there is no wire format: a descriptor that enumerates and sends nothing is worse than an error, because the panel looks built. A declared id overrides a profile one, so a script can correct one wrong parameter without redeclaring the rest. Sysex template tokens: a hex literal, $value, $deviceId, any $name from `variables`, $checksumStart and $checksum.

```lua
-- Lua
ce.device.defineParameter("cutoff", { name = "Cutoff", group = "Filter", min = 0, max = 127, cc = 74 })
```
```js
// JavaScript
ce.device.defineParameter("cutoff", { name: "Cutoff", group: "Filter", min: 0, max: 127, cc: 74 });
```

#### `deviceDefineDump(kind, spec [, role]) -> boolean`

Describe a SysEx dump layout at runtime: `request` (the bytes that ask for it), `match` ({ prefix, suffix }), `offset`/`size` for the payload, an optional `checksum`, and `fields` — one { parameter, offset } per value the dump carries. Every field must name a parameter defineParameter already declared; an unknown one is refused rather than decoded to nothing months later. A declared layout is matched against arriving SysEx, fills the bound controls and raises onDumpReceived, exactly as a profile-defined dump does.

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

Wire a control to a device parameter at runtime. ce.panel.create could already make a control and nothing could connect it to anything, so a self-building panel built dead controls; this is the other half of that pair. Replaces whatever was bound to the same port rather than adding a second binding, and switches DeviceBindings back on if the control had it off. `opts` takes { role, port }; port defaults to "value".

```lua
-- Lua
ce.device.bind("cutoffKnob", "cutoff")
```
```js
// JavaScript
ce.device.bind("cutoffKnob", "cutoff");
```

#### `deviceUnbind(control [, port]) -> boolean`

Remove a control's device binding. Returns whether there was one to remove, so "already clean" reads differently from "cleaned up".

```lua
-- Lua
ce.device.unbind("cutoffKnob")
```
```js
// JavaScript
ce.device.unbind("cutoffKnob");
```

#### `devicePorts([opts]) -> list`

What is actually plugged in: [{ id, name, direction, type, hardware, role }]. connected(role) only answers yes/no for a role somebody configured in advance; this enumerates the real ports, so a panel can offer the user a choice or notice a device that showed up. `hardware` is false for the two placeholder rows the app always lists ("No MIDI Input", "Preview Only"), and `role` is the role currently using the port, or empty. `opts.direction` narrows to "in" or "out".

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

The variables every message recipe interpolates — `channel`, `deviceId` and whatever else the profile declares — as their effective values: the profile's defaults with this project's overrides on top. Nothing back when no profile is mapped to the role.

```lua
-- Lua
log("device id " .. tostring(ce.device.variables().deviceId))
```
```js
// JavaScript
log(`device id ${ce.device.variables().deviceId}`);
```

#### `deviceSetVariable(name, value [, role]) -> boolean`

Point this panel at a different unit: set one recipe variable, 0..127. The write lands on this project's override rather than on the profile, which is a shared document — two panels driving two units of the same synth sit on different device ids without editing it. Individual uses clamp further (a channel is 1..16).

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

Slow the panel down for a device that cannot keep up — an override on this project, in milliseconds, 0..60000. Same rule as setVariable: the profile is left alone.

```lua
-- Lua
ce.device.setTiming("minDelayBetweenMessagesMs", 40)
```
```js
// JavaScript
ce.device.setTiming("minDelayBetweenMessagesMs", 40);
```

#### `deviceCoverage([feature [, role]]) -> table|string`

What the profile says it can do, in the profile's own words. No feature gives the whole map — `singleParameterWrite`, `realtimeEditing`, `editBufferDumpParse` and so on. Deliberately not a yes/no: real profiles answer "complete", "partial" and "notImplemented" but also "filter-block-rq1" and "broad-with-packed-text-and-requests", so a boolean would be a guess wearing the clothes of a fact. Test the words you care about.

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

Send a registered parameter number — the standard path for pitch-bend range (0,0), fine tuning (0,1) and coarse tuning (0,2), which is the kind of thing a panel sets once at load. Same shape as sendNRPN; the difference is CC 101/100 instead of 99/98.

```lua
-- Lua
sendRPN(1, 0, 0, 2)  -- pitch-bend range
```
```js
// JavaScript
sendRPN(1, 0, 0, 2);  // pitch-bend range
```

#### `sendSongPosition(beats)`

Song Position Pointer — where in the song the next start should resume from, in MIDI beats (one beat = six clocks = a sixteenth note). The piece of sendTransport that was missing for anything driving an external sequencer.

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

Note on. `note` is a MIDI number or a name ("C3"). Velocity 0 is a note off, as the MIDI spec has it. Give `ms` and the note off is scheduled for you — every script that plays a note was otherwise hand-rolling a timer for it, and a panel cannot play a note at all.

```lua
sendNote(1, 60, 100)
```

#### `interceptMidiIn(fn)`

Sit in the inbound path. fn(bytes) returns replacement bytes to rewrite the message, false to swallow it, or nothing to pass it through — before the panel's bindings, the note input and the transport see it. onCcIn only lets you react after a binding has already moved the control; this is how a velocity curve, a channel remap or a MIDI-learn layer is built.

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

Sit in the outbound path — every message the panel sends, from a script or from a control's own binding. Rewrite, thin or block it. CC flooding on a fast drag has no answer from a panel, whose bindings are fixed and which has nothing between them and the port.

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

Inject a message as if it had arrived from the hardware, so the panel's own bindings, note input and transport all act on it. set() moves a control directly and bypasses every binding; this is how a script-built arpeggiator or sequencer drives the panel instead of around it. Inbound filters run on it, so a fed message obeys the same rules as a real one.

```lua
-- Lua
feedMidi({0x90, 60, 100})
```
```js
// JavaScript
feedMidi([0x90, 60, 100])
```

#### `routeMidi(role, fn)`

Send everything in the block to a named device role instead of the default. Blocks rather than a per-call argument, the same shape noTransmit() uses — a panel binds one device at design time, so notes to one synth and CCs to another is otherwise impossible.

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

Note off. Release velocity defaults to 0. Nothing schedules this for you — a note you start is a note you stop.

```lua
sendNoteOff(1, 60)
```

#### `sendProgramChange(channel, program [, bankMsb, bankLsb])`

Program change, with an optional bank select (CC 0 / CC 32) sent first, which is the order devices expect.

```lua
sendProgramChange(1, 0)
```

#### `sendPitchBend(channel, value)`

Pitch bend, 0–16383 with 8192 at centre — the raw 14-bit value, because how many semitones that is depends on the synth's bend range, not on us.

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

Send a raw SysEx message (device-scope, power use).

```lua
sendSysex(bytes)
```

#### `checksum(type, bytes [, opts]) -> number`

Work out the checksum a synth expects at the end of a message. Eleven methods: "sum-7bit", "roland-7bit" (also spelled "roland" or "yamaha"), "ones-complement-7bit", "xor-7bit", "offset-7bit", "sum-8bit", "twos-complement-8bit", "crc8", "crc16-ccitt", "crc16-modbus" and "crc32". Device profiles read the same list, so a script and a profile cannot disagree about what a name means. A name that is not on the list returns nothing and tells you what it would have accepted. Mind the size: the 7-bit ones fit in a single SysEx byte and the CRCs do not, so pass those through to7bit() before sending.

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

Apply an alpha to a colour, returned in the panel's stored form: AARRGGBB, no leading #. The one colour verb that does not return #RRGGBB. Warning: CSS #rrggbbaa is the same bytes in the opposite order. To make a drawing translucent use ce.draw.opacity().

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

Show a brief message to whoever is using the panel, and return its ID. `opts` may carry { kind ("info" | "warn" | "error"), duration (ms, default 3000; 0 or less means until dismissed) }. For "the patch loaded", not for debugging — log() is for debugging. The id is what makes the message addressable: ce.ui.update(id, …) replaces it in place and ce.ui.dismiss(id) takes it back, which together are how you show progress instead of stacking ten toasts.

```lua
-- Lua
ce.ui.notify("Patch loaded")
```
```js
// JavaScript
ce.ui.notify("Patch loaded");
```

#### `uiStatus([message] [, opts])`

Put a line in the status bar and leave it there. No message clears it. Unlike notify this persists, so it suits a state ("Recording", "Synced") rather than an event. `opts` may carry { kind ("info" | "warn" | "error") }, the same vocabulary notify uses and for the same reason: a state can be a warning, and "Device not responding" in the same colour as "Ready" is a warning nobody sees. Read it back with ce.ui.state().

```lua
-- Lua
ce.ui.status("Recording")
```
```js
// JavaScript
ce.ui.status("Recording");
```

#### `uiDialog(opts [, onChoice]) -> boolean`

Ask a question with buttons. The answer arrives later than the call, so it comes back through `onChoice` rather than as a return value — it is given the label that was clicked, or nothing if the dialog was dismissed. What the call itself returns is whether a dialog appeared at all: false means there was nobody to ask, and your callback has already run with no answer. Only one dialog can be open at a time.

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

Ask somebody to type something — naming a patch, say. The answer comes back through `onAnswer` as text, or as nothing if they cancelled. Those two are deliberately different: an empty answer is something a person might mean, and no answer is not. Enter accepts. Returns whether a dialog appeared; false means the callback has already run with no answer.

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

Ask somebody to pick from a list — which is what you want past about three choices, where buttons stop working. The answer is the item they chose, a list of items if you allowed more than one, or nothing if they cancelled. A long list scrolls rather than growing, so forty presets cannot push the buttons off the screen.

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

Take a message back — the thing whoever is looking at it can already do by clicking it. With no id it clears every one, because "stop saying things" is a real request and making a script remember six ids to make it would be busywork. Returns how many went.

```lua
-- Lua
ce.ui.dismiss(id)
```
```js
// JavaScript
ce.ui.dismiss(id);
```

#### `uiUpdate(id, message [, opts]) -> boolean`

Change a message that is already on screen, leaving it where it is. This is how you show progress: dismissing and showing a new one makes it flicker and jump to the bottom each time. Give the original message a duration of 0 so it stays put, then update it as you go. Returns false once that message has gone, which is how you learn it was dismissed by hand and you can stop.

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

What is on screen: { status, statusKind, notifications ([{ id, message, kind, sticky }]), dialog }. One read rather than three. It is also how you tell apart the two reasons dialog() can answer false — nobody to ask, or a dialog already open — which need completely different handling and otherwise look the same.

```lua
-- Lua
if not ce.ui.state().dialog then  end
```
```js
// JavaScript
if (!ce.ui.state().dialog) {  }
```

#### `uiCopy(text) -> boolean`

Put text on the clipboard — a SysEx string, a patch name, a parameter table. The app does this in six places of its own and a script could not do it at all. The write is asynchronous and a browser may refuse it outright without a click behind it, so the return says the copy was attempted rather than that it landed; a refusal is reported to the console. There is deliberately no matching read: a script silently helping itself to whatever somebody last copied is not a panel's business.

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

Throw away what was drawn on this control. The usual first line of onDraw, because a draw adds to the list rather than replacing it.

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

The line colour and thickness for the shapes that follow. `width` defaults to 1; nil colour means no stroke, and `colour` may be a gradient from ce.draw.gradient(). `opts` carries { dash (a list of on/off lengths, the way every drawing API since PostScript spells it — the panel’s own beat marks are { 3, 3 }), dashOffset (how far into that pattern to start — advance it on a timer and the dash marches), cap ("butt" | "round" | "square"), join ("miter" | "round" | "bevel") }.

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

A straight line. Stroke only — a line has no inside.

```lua
-- Lua
ce.draw.line(0, 0, 100, 0)
```
```js
// JavaScript
ce.draw.line(0, 0, 100, 0);
```

#### `drawPath(points [, closed])`

A polyline through a flat list of coordinates — { x1, y1, x2, y2, ... }. This is the scope trace and the envelope shape. `closed` joins the last point back to the first.

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

An arc centred on (x, y). Angles are degrees with 0 at twelve o'clock, increasing clockwise — the way a knob's arc is described, and the same convention the Meter's arcStart/arcSweep use. Stroked with the current stroke; filled as a pie slice if a fill is set. The shape a knob ring, a radial meter or a pan indicator is, and the one thing path() could not express.

```lua
-- Lua
ce.draw.arc(30, 30, 24, 135, 135 + 270 * value)
```
```js
// JavaScript
ce.draw.arc(30, 30, 24, 135, 135 + 270 * value);
```

#### `drawGradient(stops [, angle]) -> value`

A gradient to use instead of a flat colour with fill() or stroke(). Give it a plain list of colours to space them evenly, or a list of { at, colour, opacity } to place them yourself; you can mix the two and let the unplaced ones fall where they may. The angle is the panel's own — 0 is up, 90 is to the right, the same as the gradients in the Background section. Fewer than two usable colours gives you nothing back, since a gradient from one colour to nothing is just a colour.

```lua
-- Lua
ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }, 180))
```
```js
// JavaScript
ce.draw.fill(ce.draw.gradient(["#2A6BD4", "#0A1830"], 180));
```

#### `drawOpacity(a)`

How opaque everything drawn after this is, 0..1. Applies like fill and stroke do — to what follows, not to one shape — because the whole style model here is "what was in force when the command was issued". A value that is not a number clears it. This makes a drawing translucent; ce.math.alpha() makes a stored colour translucent, and they are different questions with different answers.

#### `drawTransform([opts])`

Rotate, move or scale everything drawn after this. `opts` carries { rotate (degrees, clockwise), cx, cy (the centre to rotate about), x, y (a shift), scale }. No opts clears it. Without this a knob pointer means computing every corner with sin and cos by hand, and getting the centre wrong is the classic way a pointer ends up orbiting the wrong point.

```lua
-- Lua
ce.draw.transform({ rotate = 135, cx = w / 2, cy = h / 2 })
```
```js
// JavaScript
ce.draw.transform({ rotate: 135, cx: w / 2, cy: h / 2 });
```

#### `drawEllipse(cx, cy, rx, ry)`

An ellipse. circle() only does round, and a meter cap, an XY cursor or a squashed glow is not round.

#### `drawPixelText(text, x, y [, scale])`

Text in the app’s own 5x7 LCD font — the one the LCD components print with — so a readout a script draws and a readout the panel draws are the same letters. `scale` is a whole-number pixel size, 1 by default. Drawn literally, one square per lit pixel: it is a bitmap font, and rendering it smoothly would stop it being that font. (x, y) is the top-left, unlike text() whose y is the baseline — a grid font has no baseline to speak of.

#### `drawMeasure(text [, opts]) -> table`

How wide a string will be: { width, height, exact }. Nothing could ask before, so a box behind a label, a column of right-aligned numbers or a truncation had no way to be worked out. `opts` carries { size, family } for ordinary text, or { pixel = true, scale } for the LCD font. `exact` is the honest part: the pixel font is a grid and its answer is arithmetic, while a proportional font has to be measured — and with no surface to measure on this falls back to an estimate and says so, rather than returning a guess as though it were a fact.

#### `drawBatch(fn) -> boolean`

Send a run of drawing commands as a single update instead of one each. Worth reaching for whenever you are drawing in a loop — a waveform, a set of tick marks — where it is several times faster. The commands that already do a whole set at once (grid, lines, points) do not need it.

#### `drawGrid([opts]) -> boolean`

A whole lattice as one command and one path. `opts` may carry { x, y, width, height } (defaulting to the control's box) and either a spacing — { step } or { stepX, stepY } — or a count, { columns, rows }. Both forms exist because both are how you actually know it: a step sequencer knows it has 16 columns, a ruler knows it wants a line every 10 pixels. The closing line is drawn, so a 4-column grid has five verticals rather than a missing right edge.

#### `drawLines(segments) -> boolean`

Many disjoint line segments in one command — a list of [x1, y1, x2, y2]. drawPath already draws a connected run cheaply; this is for geometry that is not connected: tick marks, a vu ladder, a scatter of whiskers, a grid you are computing yourself. One command and one path instead of one of each per segment.

#### `drawPoints(points [, radius]) -> boolean`

A scatter of dots as one command — a list of [x, y], with `radius` defaulting to 1.5. The radius is the dot's own rather than the stroke width's, so a thin outline and a fat dot are independent.

#### `drawCurve(points [, opts]) -> boolean`

A smooth curve through the given points, not merely near them — a Catmull-Rom spline emitted as cubic Béziers. One command for the whole curve, rather than a loop approximating it with short straight segments.

#### `drawPolygon(cx, cy, radius, sides [, opts]) -> boolean`

A regular polygon — hexagonal pads, a radar plot's frame, a triangle indicator. `opts.rotation` is in degrees with 0 at twelve o'clock, clockwise, the same convention drawArc uses, so a polygon and an arc drawn at the same angle line up. Fewer than three sides is raised to three.

#### `drawImage(src, x, y, w, h [, opts]) -> boolean`

Draw an image. `src` must be something the renderer can load — a data URL, or a library icon's dataUrl from ce.image.asset(). A bare asset name is refused rather than accepted and drawn as nothing, which is the failure this verb is most likely to be handed. `opts.fit` is "fill" (stretch, the default), "contain" or "cover".

#### `drawClip([x, y, w, h]) -> boolean`

Restrict everything drawn after this to a rectangle. Style, not a shape: it applies until changed, and save()/restore() put it back. No arguments clears it. This cannot be emulated — a script could previously only avoid drawing outside a region, never clip what it drew. The control's own bounds still clip on top, so a clip can narrow the drawing area but never widen it.

#### `drawBlend(mode) -> boolean`

How what follows composites with what is under it: "normal" (the default), "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion". An unknown mode is refused and reported rather than silently ignored.

#### `drawSave() -> boolean`

Push the current style — fill, stroke, width, dash, dash offset, cap, join, opacity, transform, clip and blend — so restore() can put it back. Use it when you want to change the style for one shape and put things back afterwards, without having to remember the old values yourself. What you save is cleared at the start of each drawing pass, so forgetting to restore cannot leak into the next one.

#### `drawRestore() -> boolean`

Pop the style that save() pushed. Reports and returns false when nothing was saved, rather than silently resetting to defaults — an unbalanced restore is a bug in the script and worth hearing about.

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

Ask for onDraw to run again. Nothing repaints on its own — that is deliberate, because a per-frame callback nobody asked for is a performance trap. Animate by calling this from onTimer.

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

The icon library, as { id, name, source, mime, vector, width, height, filePath, dataUrl, portable, embeddable }. `opts` narrows with { vector = true } or { embeddable = true }. `portable` is false for every entry, and that is the honest answer rather than a bug: the payload lives in app settings, not in the panel document, so a reference to it does not survive an export. `embeddable` says whether ce.image.embed() can fix that by copying the data URL into the layer.

#### `imageAsset(idOrName) -> table|nil`

One library asset, by id first and then by name — the same order the renderer resolves in, so what you see is what will be picked. Nothing back when the library has no such asset, which is the guard to call before writing one. The name fallback is worth knowing about: a coincidental name match looks exactly like success.

#### `imageSet(target, src [, opts]) -> boolean`

Put a picture on one of a control's four image layers and switch that layer on. This does two things a plain set() does not: it always writes the picture and the switch together, so you cannot end up with a layer that is turned on and empty, and it turns the layer on the way that layer actually works — background layers stack, while a picture inside text replaces whatever was there. An option the chosen layer does not have is refused and reported, rather than stored where nothing will read it.

#### `imageClear(target [, layer]) -> boolean`

Turn a layer off and blank its source — two or three fields that have to agree, which is why it is a verb rather than a set(). An exclusive text layer also goes back to "solid", because a selected mode with no source paints nothing and looks broken.

#### `imageRead(target [, layer]) -> table`

The layer's whole state, plus the three things the fields alone do not tell you: `active` is whether it will actually paint (which for a text layer depends on `mode` and not on `Enabled` at all), `source` is "data" | "file" | "none", and `portable` says whether it survives an export. Only an embedded data URL does.

#### `imageIcon(target, idOrName [, opts]) -> boolean`

Point a control's Icon section at a library asset. `opts` may carry { size, fit, tint, opacity, rotation }. Writes the id and the name, because the renderer resolves by id and falls back to the name — writing one leaves the fallback deciding. An asset the library does not have is refused rather than stored, which is the difference between an icon that is missing and an icon that is silently wrong.

#### `imageEmbed(target [, layer]) -> boolean`

Turn a layer's source into one that travels: copy the resolved data URL into the layer, replacing a file path that only exists on this machine. This is the verb with no equivalent anywhere else in the app — the difference between a panel that looks right here and one that looks right after an export. Already-embedded sources return true unchanged. A file the host has not read yet returns false and says so rather than blocking: the read is asynchronous, it is requested, and calling again once it lands succeeds.

#### `imageLoad(path) -> boolean`

Ask the host to read a file into the cache, and report whether it is there yet. A path source renders blank until this has happened, and the read is asynchronous — so this returns false the first time and true once the data has arrived. A data URL needs no loading and returns true immediately.

### Typography

#### `textFonts([opts]) -> list`

Every font this panel can use, with what each one can do. Read `portable` before you settle on one: a built-in font works everywhere, while a font from your library lives on this computer and is not part of the panel — so it looks right while you build and falls back to something else for whoever you send it to. `featuresKnown` tells you whether a font has actually been checked for its typographic features, so an empty list is not mistaken for a fact.

#### `textFont(family) -> table|nil`

One font descriptor by family name, or nothing when no such font is available — the guard to call before writing a family, and the way to ask what variable axes a face actually has. Matched case-insensitively against the stored family and its label, the way the Properties panel matches it.

#### `textStyle(target, opts) -> boolean`

Set a control's type: font, size, weight, spacing, alignment and the rest, in one call. Worth using instead of writing the settings directly, because boldness is stored in two places that must agree — set one alone and the editor and the finished panel disagree about how bold your text is. A font nobody has, a feature the font does not offer, and an option that is not a text option are all refused and reported. Says false if any part of what you asked for did not apply.

#### `textAxis(target, tag, value) -> boolean`

Set one variable-font axis by its four-letter tag, clamped to the range the font declares. An axis the face does not have is refused rather than stored, because a stored axis nothing reads is indistinguishable from one that worked. Setting `wght` moves the weight pair with it, which is what the Properties panel's own axis control does — otherwise a variable face renders its old weight.

#### `textRead(target [, name]) -> value|table`

Read one text field by name, from whichever of Font / Multiline / Position owns it — so `size` and `lineHeight` are both just names and a script need not know which node they live on. With no name, the whole state: { content, resolvedWeight, font, multiline, position }. That is what makes typography snapshot-and-restorable without naming ninety fields, and `resolvedWeight` is the weight the renderer will actually use rather than either half of the pair.

#### `textMeasure(target [, text]) -> table`

How much room a control's text takes up, in its own font: { width, height, lines, truncated, exact }. It measures through the same code that draws the text, so the answer is the layout you will actually get — spacing, wrapping and line limits included. Pass `text` to measure something the control does not hold yet, for a label about to be filled in. `exact` is false when there was no surface to measure on and the answer is an estimate.

#### `textFit(target [, opts]) -> table`

Shrink Font.size until the text fits the control's box, and report what it settled on: { size, fits, changed, exact }. `opts` may carry { min = 6, max = the current size, text }. Text.Multiline.fitMode = "shrink" already scales text down at paint time, but that is a paint-time scale — the stored size never changes, so nothing can ask what it ended up at and nothing else can be aligned to it. This writes the size. `fits` is false when even `min` overflows, which is an answer rather than a failure.

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

Copy an existing control, including its sections, and return the copy's name. The usual way to make eight of something the author designed once.

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

Every component type panelCreate accepts, as a list of names. Ask rather than guess — the list grows.

```lua
-- Lua
log(table.concat(ce.panel.types(), ", "))
```
```js
// JavaScript
log(ce.panel.types().join(", "));
```

#### `panelAlign(names, edge [, opts]) -> number`

Line controls up on one edge: "left" | "hCenter" | "right" | "top" | "vCenter" | "bottom". By default they align to the bounding box of the lot; `opts.to` names one of them to align to instead — what the canvas calls a key object. Returns how many moved. Names that are not controls are reported and skipped rather than silently ignored.

```lua
-- Lua
ce.panel.align({ "knob1", "knob2" }, "left")
```
```js
// JavaScript
ce.panel.align(["knob1", "knob2"], "left");
```

#### `panelDistribute(names, what [, opts]) -> number`

Spread controls evenly. `what` is "leftEdges" | "hCenters" | "rightEdges" | "topEdges" | "vCenters" | "bottomEdges", which even out the positions, or "hSpacing" | "vSpacing", which even out the gaps — differently-sized controls end up evenly spaced rather than evenly placed, and those are different pictures. The first and last stay put, which is what makes this different from laying things out in a row. `opts.gap` forces a gap instead of computing one; `opts.align` also lines up the cross axis. Needs at least two.

#### `panelMatch(names, what [, opts]) -> number`

Give controls the same size: "width" | "height" | "both". The first name is the reference unless `opts.to` names another, and the reference does not resize itself. Returns how many changed.

#### `panelGrid(names [, opts]) -> number`

Tidy controls into a grid. `opts` carries { columns (3), gapX (10), gapY (10) }. Cells are uniform, sized by the biggest control, so a grid stays a grid — and the order is reading order, rows quantised to 20px then left to right, which makes "tidy" match what the eye already sees rather than document order. The first control in that order anchors the origin.

```lua
-- Lua
ce.panel.grid(pads, { columns = 4, gapX = 8, gapY = 8 })
```
```js
// JavaScript
ce.panel.grid(pads, { columns: 4, gapX: 8, gapY: 8 });
```

#### `panelCircle(names [, opts]) -> number`

Arrange controls around a circle centred on their own bounding box. `opts` carries { radius (100), startAngle (0, degrees) }. Order is the order you gave, so the ring reads the way the list does.

#### `panelFlip(names, axis) -> number`

Mirror where controls sit about the centre of their bounding box — "horizontal" or "vertical". It moves them; it does not rotate or mirror the controls themselves, because "flip the layout" and "flip the artwork" are different requests.

#### `panelRect(name) -> table`

Where a control is in panel coordinates: { x, y, width, height, right, bottom }. Transform.x is not that once anything is inside a container, so "draw a line between these two controls" or "is this one above that one" had no answer. Given a list of names it is the bounding box of the lot, which is what "how big is this group" means. Nothing back when no name resolves.

#### `panelOrder(names, where) -> number`

Z-order: "front" | "forward" | "backward" | "back". Order is document order rather than a property, which is exactly why set() could never do it. Controls move within their own parent — bringing something to the front of a container it is not in is not a thing — and later in the list paints later, so "front" is the end.

#### `panelBatch(fn) -> boolean`

Everything `fn` does is one undo step. The editor debounces its history snapshots, which groups a drag nicely and leaves a script that creates forty controls landing as an unpredictable number of steps; this brackets the work so it undoes as "build the page" rather than forty times. The flush happens whatever the callback does, including throwing — a half-built panel that cannot be undone is worse than a half-built panel. In the player there is no history to group and the callback simply runs.

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

One entry out of a collection section, or nil. Matched case-insensitively, the way a path is.

```lua
-- Lua
local st = ce.panel.entry("knob", "States", "Hover")
```
```js
// JavaScript
const st = ce.panel.entry("knob", "States", "Hover");
```

#### `panelDefine(control, section, name, spec)`

Create an entry in a collection section, or replace one that is there. The spec is merged over the section's own template, so declaring a state is one line rather than a hand-written node — hand-writing _type and both patch maps every time is how a verb like this ends up unused. Returns whether it landed.

```lua
-- Lua
ce.panel.define("knob", "States", "Warn", { when = { valueGreaterThan = 0.9 } })
```
```js
// JavaScript
ce.panel.define("knob", "States", "Warn", { when: { valueGreaterThan: 0.9 } });
```

#### `panelUndefine(control, section, name)`

Remove an entry from a collection section. Returns whether there was one, so "already gone" reads differently from "removed". Nothing script-facing could remove one of these before — set(path, nil) leaves the entry exactly where it was.

```lua
-- Lua
ce.panel.undefine("knob", "States", "Disabled")
```
```js
// JavaScript
ce.panel.undefine("knob", "States", "Disabled");
```

#### `panelPatch(control, state, patch [, part])`

Change how a control looks in one of its states — hovered, pressed, disabled. This needs its own command because the entries are themselves written as paths, which plain set() cannot address without losing its way. It merges what you give it into what is already there rather than replacing the lot, and returns how many entries were applied. Use `part` to patch one part of a custom component rather than the whole thing.

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

Musical time to milliseconds at the current tempo — the delay-time calculation a synth panel needs most. Pass `bpm` to override. Returns nil when there is no tempo to work from.

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

startTimer with a musical interval: syncTimer("step", 0.25) fires every sixteenth at the current tempo, and follows the tempo — change it and the timer re-times itself. Re-arming resets the timer's phase, so a tempo change costs one hiccup; that beats a timer permanently at the wrong rate. Pass { follow = false } to freeze the interval at the tempo it was created with. Nothing is started when no tempo is being reported, and it says so.

```lua
-- Lua
syncTimer("step", 0.25)
```
```js
// JavaScript
syncTimer("step", 0.25);
```

#### `afterBeats(beats, fn) -> id`

after() with a musical delay: afterBeats(2, fn) runs fn in two beats' time. startTimer had syncTimer and the one-shot had nothing, so "play this in half a bar" meant working the milliseconds out by hand. A one-shot fires once, so the delay is computed when you call it and does not follow a later tempo change. Returns the timer id, which stopTimer cancels. Nothing is scheduled when no tempo is being reported — it says so rather than firing immediately.

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

The timer ids currently running, sorted — the ones started by name with startTimer or syncTimer. One-shots are not listed, any of them: after() hands you its id already, and the runtime's own (sendNote's note-off) is not a script's to cancel.

```lua
-- Lua
for _, id in ipairs(runningTimers()) do log(id) end
```
```js
// JavaScript
for (const id of runningTimers()) log(id);
```

#### `nowMs() -> number`

A monotonic millisecond reading. not a wall clock and not a date — the origin is arbitrary and only differences mean anything, which is deliberate: a wall clock jumps when the machine syncs its time and a script measuring across that jump measures the jump. This exists because there was no clock at all: the Lua engine opens base, math, string and table and not os, so a Lua script could not read one, and Date/time.time() disagree about epoch and unit anyway.

```lua
-- Lua
local t0 = nowMs()
```
```js
// JavaScript
const t0 = nowMs();
```

#### `beatsPerDivision(name) -> number`

A note division as a fraction of a beat: "1/16" → 0.25, "1/8T" → 0.333…, "1/4D" → 1.5. The vocabulary every sequencer property in the app speaks, and the one conversion a script could not do. Returns nothing for a name this build does not know — a component falls back to 1/16 because it has to keep running, a script that mistyped a division should find out.

```lua
-- Lua
local beats = beatsPerDivision("1/16")
```
```js
// JavaScript
const beats = beatsPerDivision("1/16");
```

#### `divisionNames() -> list`

Every division this build knows, in picker order: { id, label, beats }. What to build a menu from, rather than hard-coding fourteen strings that go stale the moment one is added.

```lua
-- Lua
for _, d in ipairs(divisionNames()) do log(d.label) end
```
```js
// JavaScript
for (const d of divisionNames()) log(d.label);
```

#### `barBeatAt(beats [, beatsPerBar]) -> table`

Where a beat position falls musically — for any position, not only the one the transport is at. Returns { bar, beat, tick, text, beatsPerBar }, bars and beats counting from 1 as musicians do, ticks at 24 ppqn. `text` is the Transport component's own readout ("3.2.00"), so a script's label and the component's agree character for character.

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

How many step boundaries went by between two readings: { steps, dropped }. Use it so a sequence you are driving yourself never loses a step — if a frame runs late, you still play the steps it slept through instead of leaving a hole in the bar. `max` limits the catching up (16 by default), so coming back to a window that was hidden for a minute does not fire hundreds of notes at once; anything skipped is reported rather than quietly dropped. When it does have to skip, it keeps the most recent steps, since catching up to now matters more than replaying where you were.

#### `swingOffset(step, amount, division) -> number`

The panel's shuffle: every odd step pushed later by up to half a step, in beats, to add to that step's position. `amount` is 0..1, the same number the Transport's swing property holds. Two sequencers at "the same" swing really are the same swing only if they compute it the same way — which is why this is the transport's function and not a second one.

#### `cycleAt(beats, bars [, beatsPerBar]) -> table`

For anything whose rate is a loop length in bars rather than a step — a take, a slow sweep. Returns { phase, count, length }: phase 0–1 through the cycle, how many have completed, and the cycle in beats. Derived from the position and never accumulated, so a cycle running for an hour is still exactly on the bar line.

#### `loopedBeats(beats, startBeats, lengthBeats) -> table`

Fold a timeline position into a loop: { beats, pass }. Before the loop start the position is untouched — you can run in to a loop from earlier in the song, which is what every DAW does and what a count-in needs. `pass` is which time round you are, and -1 before the loop has been reached; watching it for changes tells you a wrap happened, without a wrap handler that can miss one. The looped position is a pure function of the un-looped one rather than a counter that gets reset, which is what makes it exact after an hour.

#### `tapTempo(times [, resetMs]) -> number`

Tempo from tap times, in the milliseconds now() reports. Taps more than `resetMs` apart (2000 by default) start a new measurement rather than averaging across the pause — otherwise the first tap after a break poisons it, which is exactly what a hand-rolled tap tempo gets wrong. Returns nothing from fewer than two usable taps, and the result is clamped to 20–300 bpm.

#### `clockTempo(intervalsMs) -> number`

Tempo from the gaps between incoming MIDI clock pulses (24 per quarter note) — what a script filtering 0xF8 with ce.midi.interceptIn is holding and could not turn into a bpm. The median, not the mean: one late pulse from a usb hiccup drags an average around, and a wobbling readout is worse than a slightly stale one. Nothing comes back from an empty list.

### Storage

#### `state`

A table of your own that survives between handler calls, private to this script. Cleared when the script reloads — for anything that must outlive the session use saveSetting.

```lua
-- Lua
state.count = (state.count or 0) + 1
```
```js
// JavaScript
state.count = (state.count ?? 0) + 1;
```

#### `saveSetting(key, value [, opts]) -> boolean`

Save a value so it is still there next time. While you are building, a panel setting is kept with the panel and travels with it; in the finished plugin it goes into your music software's project. Returns false when there was nowhere to put it, so you can tell that apart from success.

```lua
saveSetting("key", value)
```

#### `loadSetting(key [, fallback [, opts]])`

Read back a value saved with saveSetting. Returns `fallback` when the key has never been written — and `opts.scope` has to match the scope it was saved in, because a private setting and a shared one of the same name are two different values.

```lua
-- Lua
local v = loadSetting("key", default)
```
```js
// JavaScript
const v = loadSetting("key", default);
```

#### `listSettings([opts]) -> list`

Every key saved in one scope, in no particular order. An empty list means nothing has been written — not that settings are unavailable, which is what ce.storage.info() is for. `opts.scope` as elsewhere; a panel listing hides other scripts’ private keys.

```lua
-- Lua
for _, k in ipairs(ce.storage.settings()) do  end
```
```js
// JavaScript
for (const k of ce.storage.settings()) {  }
```

#### `forgetSetting(key [, opts]) -> boolean`

Delete a saved setting. Returns whether there was one to delete, so a script can tell "cleaned up" from "there was nothing there". `opts.scope` as elsewhere.

```lua
-- Lua
ce.storage.forget("key")
```
```js
// JavaScript
ce.storage.forget("key");
```

#### `allSettings([opts]) -> table`

Every setting in one scope, as a table of key to value. The read every other module got — listing keys and looping to fetch each one was the only way before. `opts.scope` is "panel" (default), "script" or "local". A panel-scope listing hides other scripts’ private keys rather than showing an unusable spelling of them.

```lua
-- Lua
for k, v in pairs(ce.storage.all()) do log(k, v) end
```
```js
// JavaScript
for (const [k, v] of Object.entries(ce.storage.all())) log(k, v);
```

#### `clearSettings([opts]) -> number`

Forget everything in one scope, and say how many went. Panel scope leaves other scripts’ private keys alone: "clear my settings" must not mean "clear everybody’s".

#### `storageInfo([opts]) -> table`

Which store a scope is talking to and what is in it: { scope, backing, available, count, bytes }. The three scopes have genuinely different backing — the panel document, this machine, the DAW project state — and a script that has just failed to persist something deserves to know which one it was talking to. `available` is the honest field: false means writes in this scope will not stick, which is worth saying once rather than discovering per key.

#### `encodeJson(value [, opts]) -> string`

A value as JSON text. `opts.indent` pretty-prints with that many spaces. Nothing back for a value with no JSON form — a cycle, a function — rather than a string that is not the value. This is here because the Lua engine opens base, math, string and table and has no json module, while JavaScript and Python each have their own with different names: "use the language’s own" was never available to a cross-runtime script, the same Q10 exception ce.time.now() is.

```lua
-- Lua
sendSysex(toAscii(ce.storage.encode(patch)))
```
```js
// JavaScript
sendSysex(toAscii(ce.storage.encode(patch)));
```

#### `decodeJson(text) -> value`

Turn text back into a value. Text that is not valid JSON gives you nothing, which is how you tell a config somebody mistyped from one that is simply empty. Worth knowing: a JSON null comes back as nothing at all, so {"a":1,"b":null} arrives with one key and [1,null,2] with two entries. Not every language can hold a null, and all of them have to agree, so encoding and then decoding is not quite a round trip where nulls are involved.

### Debug

#### `log(message [, value])`

Print to the script console without changing state.

```lua
log("message", value)
```

#### `logWarn(message [, value])`

Print at warning level: something is off but the panel carries on. Reads differently from log() in the console, which is the whole point.

```lua
ce.core.warn("message")
```

#### `logError(message [, value])`

Print at error level: something the panel could not do. Reporting it does not stop the handler — this prints, it does not throw. To stop, use your language's own error()/throw, which is exactly why the flat name is logError and not error.

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
| `curve(v, shape)` | Apply a named response curve: "linear", "exp", "log" or "s". A name it does not know is reported and treated as linear, rather than silently doing nothing. For a shape this list does not have, use map(). |
| `lerp(a, b, t)` | Blend between a and b by t (0–1). |
| `wrap(v, lo, hi)` | Bring a value round into a range, half-open: wrap(12, 0, 12) is 0, and wrap(-1, 0, 12) is 11. Use it for pitch classes, LFO phase and step indices instead of the language's %, whose sign differs between the runtimes — the same expression gives 11 in Lua and -1 in JavaScript. |
| `mapCurve(v, points)` | A response curve of your own: straight lines through breakpoints, given as {{x, y}, …} — map(v, {{0,0},{0.5,0.9},{1,1}}) is a knob that opens fast and finishes slowly. Points are sorted by x, so the order you write them in does not matter; outside the outermost points the value is held rather than extrapolated. Two points with the same x is a step, and the later one wins. |
| `quantizeTo(v, values)` | Snap to the nearest value in a list, rather than to a regular step: quantizeTo(9, {0, 8, 16}) is 8. snap() covers evenly spaced settings; this covers the ones a synth actually has. A tie goes to the lower value, so the result never depends on rounding. |
| `randomChoice(values [, weights])` | Pick one of a list, using the seeded generator — so a "random" patch replays. With `weights`, the chance of each is its weight over the total; a missing or negative weight counts as zero, and all-zero weights fall back to an even pick. Exactly one number is drawn from the generator either way, so adding weights does not change what everything after it picks. |
| `dbToGain(db)` | Decibels to a linear gain: 0 dB is 1, -6 dB is about 0.5. Neither Lua nor JavaScript has it, and a level control that reads in dB and sends a linear value needs it on every move. |
| `gainToDb(gain)` | The inverse. A gain of zero or less returns -144 dB — the 24-bit noise floor — rather than negative infinity, which is a number half the runtimes cannot carry through a value and none can display. |
| `norm(v, lo, hi)` | A value to its 0–1 position in a range, clamped. scale(v, lo, hi, 0, 1) is the hand-rolled version and it does not clamp, so a value past the end came out past 1 and stayed wrong all the way down the chain. The value model already has a .normalizedValue face; this is that conversion for numbers a script is holding itself. |
| `denorm(t, lo, hi)` | The inverse: a 0–1 position back into a range, clamped at both ends. |
| `bipolar(t)` | 0–1 to -1..+1. The two shapes a modulation source is ever in, and the conversion sits in the middle of every modulation script. |
| `unipolar(v)` | -1..+1 back to 0–1. |
| `fold(v, lo, hi)` | Come back off the end of a range instead of round it. wrap() jumps from the top to the bottom, which is right for a pitch class and wrong for a modulation depth — a fold reflects, so the movement stays continuous. Wave folding is the audible version of the same idea, and neither is expressible with the language's %. |
| `indexOfRange(t, count)` | A 0–1 position to one of `count` slots, zero-based — which preset, which step, which pad. The hand-rolled floor(t * count) returns `count` itself at exactly 1.0, one past the end of the list it is addressing, and that off-by-one only appears when a knob is turned fully up. |
| `crossfade(a, b, t [, law])` | Blend a to b with a fade law: "linear", "equalPower" or "sharp" — the same three the Crossfader component has, which a script could not compute. equalPower is the one that matters: a linear fade between two sounds dips in the middle, audibly, which is why the component defaults away from it. |
| `approach(current, target, maxStep)` | Move toward a target, no further than maxStep in one call. A rate limit with no state of its own, so it works from any handler without the script keeping a timer — ce.anim owns motion the runtime drives, this is the one a script drives itself, per incoming message. How you smooth a jumpy expression pedal. |
| `roundTo(v, decimals)` | Round to a number of decimal places, for a readout. JavaScript's toFixed returns a string and Lua has no equivalent at all, so every panel showing a tidy number wrote this itself. |
| `almost(a, b [, epsilon])` | Float comparison that means what == is assumed to mean. A panel compares values constantly — has this reached its target, is this at the detent — and every one of those values arrived through a scale() or a curve(). |
| `minOf(values)` | The smallest in a list, or nil for an empty one. Lua's math.min takes varargs, so over a table it needs table.unpack and falls over on a long one; JavaScript needs a spread with the same limit. A panel deals in lists constantly — macro slots, matrix rows, envelope points, the values out of a dump. |
| `maxOf(values)` | The largest in a list, or nil for an empty one. |
| `sumOf(values)` | The total of a list. Zero for an empty one — a sum of nothing is nothing, not an absence. |
| `meanOf(values)` | The average of a list, or nil for an empty one — unlike a sum, an average of nothing does not exist. |
| `blend(fromList, toList, t) -> list` | Morph one list of values into another, element by element — which is what a snapshot morph is, and a script could only do it one value at a time. Both arguments are lists: for two single numbers you want lerp. The shorter list decides the length: padding with zeros would drag the missing entries to nothing, and on a patch that is a set of parameters slammed to their minimum. |
| `randomFloat(lo, hi)` | A seeded random float in a range. random(lo, hi) returns whole numbers — the form a note or a step wants — so until now there was no seeded way to get a fractional one without doing the arithmetic by hand. |
| `randomGaussian([mean, sd])` | A bell rather than a slab: most values near the middle. Humanising velocity or timing with a uniform random is the thing that sounds mechanical. Box-Muller, always consuming exactly two draws — it deliberately does not cache the second value the way the textbook version does, because a varying draw count would break seed replay. |
| `randomWalk(current, step, lo, hi)` | Drift rather than jump — a generative line that stays musical. Folded at the ends rather than clamped, because a walk that clamps sticks to the end it hit and stops moving. |
| `randomBool([chance])` | A weighted coin — the probability gate every step sequencer wants. `chance` is the odds of true, 0.5 by default. |
| `shuffle(values)` | A new list in seeded random order (Fisher-Yates, exactly one draw per element after the first). The same seed shuffles the same way, which is what makes a shuffled pattern something you can get back. |
| `toDegrees(radians)` | Radians to degrees — the unit ce.draw's arcs are in. |
| `toRadians(degrees)` | Degrees to radians — the unit the language's trigonometry is in. |
| `distance(x1, y1, x2, y2)` | The distance between two points. For XY pads, joysticks, the Orbit and hit testing in ce.draw. |
| `angleOf(x1, y1, x2, y2)` | The angle from one point to another in ce.draw's own convention: degrees, 0 at twelve o'clock, increasing clockwise, 0–360. Rebuilding that from atan2 by hand is where a knob pointer ends up running backwards or a quadrant out. |
| `polar(angle, radius)` | The inverse: an angle and a radius to { x, y } offsets from a centre, in the same convention. Together with angleOf, what a knob ring, a radial meter or a pan indicator is drawn from. |
| `shapeCurve(v, curve [, tension])` | Bend a value the way the panel itself bends one — the curve an Envelope segment or a Router breakpoint uses. This is not the same as curve(), which is a simpler and older set of shapes, so a curve name read straight out of a control belongs here rather than there. Both spellings of the s-curve are accepted. `tension` defaults to 1.6 rather than 0, matching the app: leaving it unset does not give you a straight line. With `tension` set to 1 this is also the curve a Macro slot uses, so shape(v, curve, 1) reproduces the third of the app's three curve families — the one nothing else names. |
| `deadzone(v, amount [, invert])` | The Expression Router's input shaping: below the threshold the value is zero, and the remaining range rescales to fill 0–1 so response starts right at the edge of the dead zone. The rescale is the part a hand-rolled version leaves out, and leaving it out loses the top of the range. |
| `weightsFor(points, x, y [, power])` | The inverse-distance blend weights a Timbre Space and a Preset Constellation use, normalised so they sum to 1. `power` is the blend sharpness — higher means the nearest anchor dominates sooner. Pair with blendBy() to morph a set of values the way the pad does. |
| `blendBy(values, weights)` | A weighted average — what weightsFor() is for, and what a morph pad is. blend() interpolates two lists; this collapses many values by weight. |
| `tickStops(major [, minor])` | The 0–1 stop positions a slider's scale is drawn from, as { major, minor }. Use these when you are drawing your own scale, so your minor ticks line up with the ones the app draws beside them rather than being visibly out of step. |
| `dbPosition(fraction [, floorDb, ceilDb])` | Where a level sits on a dB meter, 0–1. gainToDb answers "how many dB is this"; this answers "how far up the meter does it go", which is the question a script drawing a meter is asking. Defaults match the Meter component: floor -60, ceiling +6. |
| `smooth(current, target, coefficient [, epsilon])` | Smooth out a jumpy value — a twitchy expression pedal, a noisy CC. It moves quickly at first and then eases in, which is the response you want for that. Different from approach(), which moves a fixed amount each time and is really a speed limit. The important part is that it arrives: smoothing like this gets closer and closer forever, so a value smoothed by hand ends up sitting at 0.9999 and transmitting for ever. This one snaps to the target once it is close enough. |
| `hysteresis(value, on, low, high)` | A Schmitt trigger: turns on at `high`, off at `low`, and holds in between. `on` is the state it is in now, and the return is the state it should be. A plain threshold chatters — a CC hovering on the line flips a switch dozens of times a second, which on a bound control is dozens of MIDI messages a second. Two thresholds plus the current state is the fix, and nothing else in the module composes to it. |
| `median(values)` | The middle value of a list, or the mean of the two middle ones; nil for an empty list. Distinct from mean() and the reason is the point: a mean smears a spike across the result, a median rejects it. On a noisy controller reading that is the difference between a glitch you can hear and one you cannot. |
| `euclid(steps, pulses [, rotation])` | A Euclidean rhythm: `pulses` hits spread as evenly as they will go across `steps`, handed back as a list of yes/no. This is the same working-out the Arpeggiator uses for its rest pattern, so a sequencer or gate you write yourself lands on the same rhythm rather than an approximation of it. `rotation` turns the whole pattern round without changing the spacing between hits. |
| `unshape(y, curve [, tension])` | The inverse of shape(). Going device → panel through a taper needs it: a value shaped on the way out has to be un-shaped on the way back, or the control lands somewhere other than where it started. Only map() is invertible by hand — swap x and y — while a named curve is not. `hold` is a step, so many inputs give the same output and there is no true inverse; it returns the earliest input that produces the output, which is the only answer that is a function. |
| `random([lo, hi])` | A random number. With no arguments, a float in [0, 1). With two, a whole number from lo to hi inclusive — the form a script actually wants for a note or a step. Seeded, so the same seed replays the same sequence in every runtime. |
| `randomSeed(n)` | Set the seed of the generator this script is drawing from. The same seed replays the same sequence — which is what makes a "random" patch something you can get back. Reseeding with 0 is treated as the default seed rather than as a dead generator. Seeds one generator: every script has its own, and inside a script every named stream has its own, so this cannot reach into somebody else's sequence. |
| `randomStream(name, fn)` | Give a run of random draws their own private sequence, so two generative parts of one script do not tread on each other — shuffling in one leaves what the other gets alone, and so does seeding it. Normal behaviour returns when the block ends, even if something goes wrong inside it. Each script's streams are its own, so two scripts using the same name still do not share one. |

### Music

| Helper | What it does |
|---|---|
| `noteName(n [, flats])` | MIDI note number → name, e.g. 60 → "C4" (middle C). With `flats` omitted you get this module's plain-ASCII spelling ("C#4") — what noteNumber has always round-tripped. Pass `flats` and you get the panel's spelling instead, from the same table the Chord Pad, Harmoniser and Arpeggiator print from: true → "E♭4", false → "C♯4". `ce.music.spelling` answers which one a key wants. |
| `noteNumber(name) -> number` | Note name → MIDI number, e.g. "C4" → 60. Middle C is C4. Reads all four spellings — "C#4", "C♯4", "Db4", "D♭4" — so a name the panel printed can be read back. A name it cannot read returns nothing: 0 is a real note (C-1), so returning it for a misspelling meant a typo played a wrong note in silence. |
| `scaleNotes(root [, scale]) -> list` | The notes of one octave of a scale, ascending from `root`. Seven notes for the modes, five for the pentatonics, six for blues — the root is not repeated at the top. `scale` defaults to "major"; an unknown name returns nothing rather than guessing. |
| `chordNotes(root [, type]) -> list` | The notes of a chord, ascending from `root` — an absolute shape, not a scale degree. `type` defaults to "major"; major minor dim aug sus2 sus4 power maj6 min6 dom7 maj7 min7 minMaj7 dim7 m7b5 aug7 add9 dom9 maj9 min9. An unknown type returns nothing. |
| `quantizeNote(note, root [, scale]) -> number` | Snap a note to the nearest one in a scale, searching both directions. A tie goes up, always, so two runtimes cannot disagree about a note exactly between two scale tones. `scale` defaults to "major"; an unknown name returns nothing. |
| `noteSpelling(root [, scale]) -> boolean` | Does this key write its accidentals as flats? F, B♭, E♭, A♭, D♭ and G♭ do — judged by the relative major, so C minor spells E♭/A♭ rather than D♯/G♯, exactly as the Chord Pad does. Pass the answer to noteName and a script's labels match the panel's without having to decide anything. An unknown scale returns nothing. |
| `inScale(note, root [, scale]) -> boolean` | Is this note in the key? Octave-blind, like every key question — C2 and C5 are both the tonic of C. `scale` defaults to "major"; an unknown name returns nothing. |
| `scaleDegree(note, root [, scale]) -> number` | Which degree of the key a note is: 1 for the tonic, 5 for the dominant. A note outside the key has no degree and returns nothing rather than the nearest one — rounding here is what turns a wrong note into a plausible chord, and quantizeNote is the verb that rounds on purpose. |
| `degreeChord(root, scale, degree [, size]) -> table` | Which chord a key builds on a given degree — the same working-out the Chord Pad does. Degrees start at 1, so degreeChord(60, "major", 5) is the chord on the fifth. `size` is how many notes: 3 for a triad, 4 for a seventh. You get back the notes, the chord spelled the way the key spells it ("E♭m7") and its roman numeral. Use this when you want the chord a key implies; use chordNotes when you already know which chord you want. |
| `chordQuality(notes) -> string` | Name a chord from the notes in it: [60, 63, 70] → "min7". Reads intervals above the lowest note, so it takes a chord from chordNotes, from degreeChord, or one a script built by hand — the inverse of chordNotes. The vocabulary is the panel's (maj, min, dim, aug, sus2, sus4, maj7, dom7, min7, minMaj7, dim7, m7b5), so a chord this names and a chord the Chord Pad labels agree. |
| `voiceLead(notes, previous [, mode]) -> list` | Rearrange a chord so it moves as little as possible from the one before it — the Harmoniser's voice leading, available to any script that sends chords. "closest" keeps every note as close as it can; "smooth" holds the top note still, which keeps a melody in place while the notes underneath move; "off" gives you root position. With no previous chord there is nothing to move away from, so the first chord of a phrase comes back untouched. |
| `expandOctaves(notes [, octaves]) -> list` | The same note set repeated up over `octaves` octaves (1..4), ascending — the Arpeggiator's own expansion, the step before arpOrder. Anything that would land above 127 is dropped rather than clamped: clamping stacks strays on one pitch, which sounds like a stuck key rather than like nothing. |
| `arpOrder(notes, pattern) -> list` | The order an arpeggiator pattern plays notes in, as a list of steps — each step being a list of notes, so "chord" (everything at once) comes back the same shape as the rest. The patterns are up, down, updown, downup, asPlayed, random and chord. Notes are used in the order you give them, which is what makes "asPlayed" meaningful; sort them first if you want a rising run. "updown" and "downup" do not play the turning points twice. "random" hands the notes back in the order given, exactly as the panel's arpeggiator does, because it picks its step as it plays; for a shuffled order use ce.math.shuffle. |

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
