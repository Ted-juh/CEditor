# CEditor Scripting Cookbook

Task-based recipes for panel scripting. Every call here is from the
[scripting manual](scripting-manual.md) — look a name up there for the full signature.
Recipes are shown in Lua and JavaScript; the API is identical in every language.

A quick orientation: a script attached to a control reacts to **its own** events just by
defining the named function (`onValueChanged`, `onClick`, …). To reach anything else — another
control, the panel, the device — use `on(target, event, handler)`. Values are read and written
by dot-path with `get`/`set`.

---

## 1. Link two controls

*"When the cutoff moves, drive the resonance at half strength."* Attach to the `cutoff` control:

```lua
-- Lua
function onValueChanged(value)
  set("reso.value", value * 0.5)
end
```
```js
// JavaScript
function onValueChanged(value) {
  set("reso.value", value * 0.5)
}
```

Different ranges? Go through the 0–1 face instead, so the shapes match no matter the units:

```lua
function onValueChanged(value)
  set("reso.normalizedValue", get("cutoff.normalizedValue"))
end
```

## 2. Rescale a value on the way through

`scale` maps between ranges; `clamp` keeps the result legal; `curve` bends the response.

```lua
-- Lua — a 0–127 input driving a 0–100 target, with a log feel
function onValueChanged(value)
  set("amount.value", clamp(curve(scale(value, 0, 127, 0, 100), "log"), 0, 100))
end
```

## 3. An "Init Patch" button (set many values without spamming the synth)

A plain `set` transmits to the synth (that's the right default). When one gesture sets *many*
values, wrap them in `noTransmit(...)` so nothing is sent piecemeal:

```lua
-- Lua — attach to the button, runs on click
function onClick(mouse)
  noTransmit(function()
    set("cutoff.value", 8000)
    set("reso.value", 20)
    set("env.value", 0)
  end)
  emit("initPatchDone")
end
```
```js
// JavaScript
function onClick(mouse) {
  noTransmit(() => {
    set("cutoff.value", 8000)
    set("reso.value", 20)
    set("env.value", 0)
  })
  emit("initPatchDone")
}
```

To then push the whole result to the synth in one message, let a **panel** script react —
`sendDump` is panel/device-scope, not available from a control script:

```lua
-- Lua — panel scope
on("initPatchDone", function()
  sendDump("patch")
end)
```

## 4. Read the synth into the panel on startup

Panel-scope script. `onPanelReady` is the first moment controls exist; guard one-time work with
`info.firstTime` (the hook re-fires when a VST3 window reopens):

```lua
-- Lua
function onPanelReady(info)
  if info.firstTime then
    requestDump("patch")          -- ask the synth to send its current patch
  end
end

function onDumpReceived(dump)
  applyDump(dump.bytes)           -- walk the device map, fill every control; nothing echoes back
end
```

## 5. Blink an LED on a timer

`startTimer(id, ms)` fires the `timer` panel event every `ms` until `stopTimer(id)`:

```lua
-- Lua
local lit = false

function onPanelReady(info)
  startTimer("blink", 500)
end

function onTimer(info)
  if info.id == "blink" then
    lit = not lit
    set("led.background.fill.colour", lit and "#ff4000" or "#301000")
  end
end
```
```js
// JavaScript
let lit = false

function onPanelReady(info) {
  startTimer("blink", 500)
}

function onTimer(info) {
  if (info.id === "blink") {
    lit = !lit
    set("led.background.fill.colour", lit ? "#ff4000" : "#301000")
  }
}
```

## 6. React to a *different* control

From any script, register on the other control by name:

```lua
-- Lua
on("cutoff", "valueChanged", function(value)
  set("readout.text.content", tostring(round(value)) .. " Hz")
end)
```

## 7. Let scripts talk to each other

`emit` announces; any script that registered `on(name, …)` reacts — across languages:

```lua
-- Lua — the announcing side
function onValueChanged(value)
  emit("bassBoostChanged", value)
end
```
```js
// JavaScript — a listening side, in another script
on("bassBoostChanged", (value) => {
  set("eqLow.value", value)
})
```

For a direct call with a return value, use `run("target.action", args)` instead of an event.

## 8. Hand-built SysEx with a checksum (device script)

Only needed when the device map doesn't already model the parameter — bulk and per-parameter
sending are otherwise automatic:

```lua
-- Lua
function sendCustom(value)
  local data = { 0x10, 0x00, 0x22, value }
  local bytes = { 0xF0, 0x41, 0x10, 0x42, 0x12 }
  for i, b in ipairs(data) do bytes[#bytes + 1] = b end
  bytes[#bytes + 1] = checksum("roland", data)
  bytes[#bytes + 1] = 0xF7
  sendSysex(bytes)
end
```

`to14bit`, `toNibbles`, `toAscii` and friends (see the manual's MIDI-encoding helpers) cover the
usual byte-packing chores.

## 9. See what's going on

`log` prints to the script console without changing anything:

```lua
function onValueChanged(value)
  log("cutoff moved", value)
end
```

Every event, `set`, and outgoing MIDI message also appears in the console's trace — usually the
fastest way to find out why something fired (or didn't).

## 10. Clean up when the panel closes

```lua
-- Lua — panel scope
function onPanelClose()
  stopTimer("blink")
  sendDump("patch")   -- park the edits on the synth on the way out
end
```
