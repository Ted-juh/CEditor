# CEditor Scripting Cookbook

This page holds ready-to-use recipes for panel scripting. Every call comes from
the [scripting manual](scripting-manual.md). Look a name up there for the full
signature. Recipes are shown in Lua and JavaScript. The API is the same in
every language.

A few commands work in one of the two places a script can run but not the
other. The manual's badges say which.

Before you start, three basics. A script attached to a control reacts to that
control's own events. You only need to define the named function, such as
`onValueChanged` or `onClick`. To react to anything else — another control, the
panel, the device — use `on(target, event, handler)`. To read and write values,
use `get` and `set` with a dot-path.

---

## 1. Link two controls

Goal: when the cutoff moves, drive the resonance at half strength.
Attach this to the `cutoff` control:

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

Do the two controls have different ranges? Then use the 0–1 form instead.
The movement will match, whatever units each control uses:

```lua
function onValueChanged(value)
  set("reso.normalizedValue", get("cutoff.normalizedValue"))
end
```

## 2. Rescale a value on the way through

`scale` maps a value from one range to another. `clamp` keeps the result inside
its limits. `curve` bends the response.

```lua
-- Lua — a 0–127 input driving a 0–100 target, with a log feel
function onValueChanged(value)
  set("amount.value", clamp(curve(scale(value, 0, 127, 0, 100), "log"), 0, 100))
end
```

## 3. An "Init Patch" button (set many values without spamming the synth)

A plain `set` sends the change to the synth. That is the right default for one
value. But when one click sets many values, you do not want many messages.
Wrap the calls in `noTransmit(...)` and nothing is sent:

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

Then send the whole result to the synth in one message. A **panel** script can
react to the event and send a dump. `sendDump` works in panel and device scope,
not from a control script:

```lua
-- Lua — panel scope
on("initPatchDone", function()
  sendDump("patch")
end)
```

## 4. Read the synth into the panel on startup

Use a panel-scope script. `onPanelReady` is the first moment the controls
exist. Guard one-time work with `info.firstTime`, because the hook fires again
when a VST3 window reopens:

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

`startTimer(id, ms)` fires the `timer` panel event every `ms` milliseconds,
until you call `stopTimer(id)`:

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

Any script can listen to another control. Register on it by name:

```lua
-- Lua
on("cutoff", "valueChanged", function(value)
  set("readout.text.content", tostring(round(value)) .. " Hz")
end)
```

## 7. Let scripts talk to each other

`emit` announces an event. Every script that registered `on(name, ...)` reacts.
This works across languages:

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

Do you need a direct call with a return value? Then use
`run("target.action", args)` instead of an event.

## 8. Hand-built SysEx with a checksum (device script)

You only need this when the device map does not already know the parameter.
When it does, sending one value or a whole dump is handled for you:

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

For the usual byte-packing work, use `to14bit`, `toNibbles`, `toAscii` and the
other MIDI-encoding helpers in the manual.

## 9. Play notes from a script

`sendNote(channel, note, velocity)` starts a note and leaves it sounding. Give
it a fourth argument and it releases the note for you after that many
milliseconds. Without one, the note is yours to stop: send `sendNoteOff` for
every note you started. A one-finger chord button:

```lua
-- Lua — attach to a button
function onPointerDown(mouse)
  sendNote(1, 60, 100)   -- held: no duration given
  sendNote(1, 64, 100)
  sendNote(1, 67, 100)
end

function onPointerUp(mouse)
  sendNoteOff(1, 60)
  sendNoteOff(1, 64)
  sendNoteOff(1, 67)
end
```
```js
// JavaScript — or fire-and-forget with an automatic note-off
function onClick(mouse) {
  sendNote(1, noteNumber("C4"), 100, 250)
}
```

## 10. Follow the clock

`transportInfo()` reads the master clock in one go — playing, bpm, bar, beat
and the rest. (`ce.time.transport()` is the same call written with its module
name; `tempo()` and `isPlaying()` fetch just those two.) `onBeat` and `onBar`
fire while the clock runs. A tempo-synced metronome light, panel scope:

```lua
-- Lua
function onBeat(time)
  set("beatLight.background.fill.colour", time.beat == 1 and "#ff4000" or "#804000")
end

function onBar(time)
  set("barReadout.text.content", "bar " .. time.bar)
end
```

For a timer on a musical interval, use `syncTimer(id, beats)` rather than
`startTimer`, which counts in milliseconds. `syncTimer("pulse", 1)` fires once
a beat, and the interval follows the tempo as it changes — pass
`{ follow = false }` to freeze it at the tempo it started with. Nothing starts
if no tempo is being reported, and the call tells you so.

For a one-shot, `after(150, fn)` runs `fn` once, 150 ms from now. It returns an
id, so `stopTimer(id)` cancels it before it fires. Use it for jobs like "turn
that light back off". `afterBeats(2, fn)` is the same thing in musical time.

## 11. See what's going on

`log` prints to the script console. It changes nothing:

```lua
function onValueChanged(value)
  log("cutoff moved", value)
end
```

The console's trace also shows every event, every `set`, and every outgoing
MIDI message. It is usually the fastest way to find out why something fired,
or why it did not.

## 12. Clean up when the panel closes

```lua
-- Lua — panel scope
function onPanelClose()
  stopTimer("blink")
  sendDump("patch")   -- park the edits on the synth on the way out
end
```
