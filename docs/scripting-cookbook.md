# CEditor Scripting Cookbook

This page holds ready-to-use recipes for panel scripting. Every call comes from
the [scripting manual](scripting-manual.md). Look a name up there for the full
signature. Recipes are shown in Lua and JavaScript. The API is the same in
every language.

A few commands need the panel window and do nothing once a plugin window is
closed. The manual marks them **Panel window only**.

Before you start, three basics:

- Each script runs on **one** event, the one in its **Runs on** box. Define the
  function with that name, such as `onValueChanged` or `onClick`. A second
  function named after another event, in the same script, is never called.
- To react to anything else — another event, another control, the panel, the
  device — use `on(target, "onEventName", handler)` at the top of a script. Give
  the full handler name, with `on` in front.
- To read and write values, use `get` and `set` with a dot-path.

---

## 1. Link two controls

Goal: when the cutoff moves, drive the resonance at half strength.
Add a script that runs on `onValueChanged`, attached to the `cutoff` control:

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

`scale` maps a value from one range to another. `curve` bends the response, and
works on a value from 0 to 1 — so bring the value into 0 to 1 first, bend it, then
scale it to where it is going:

```lua
-- Lua — a 0–127 input driving a 0–100 target, with a log feel
function onValueChanged(value)
  local position = scale(value, 0, 127, 0, 1)
  set("amount.value", scale(curve(position, "log"), 0, 1, 0, 100))
end
```

`scale` does not keep its result inside the range: an input outside 0–127 gives
an output outside 0–100. Wrap it in `clamp(…, 0, 100)` when the input can
overshoot.

## 3. An "Init Patch" button (set many values without spamming the synth)

A plain `set` sends the change to the synth. That is the right default for one
value. But when one click sets many values, you do not want many messages.
Wrap the calls in `noTransmit(...)` and those `set` changes are not sent
(commands that send MIDI themselves, such as `sendCC`, still go out). A script
that runs on `onClick`, attached to the button:

```lua
-- Lua
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

Then send the whole result to the synth in one message. Any script can listen
for the event and send a dump — put this at the top of a script:

```lua
-- Lua
on("*", "initPatchDone", function()
  sendDump("patch")
end)
```

(You could also call `sendDump("patch")` straight after the `noTransmit` block.
The event is useful when other scripts want to know as well.)

## 4. Read the synth into the panel on startup

Add a script that runs on `onPanelReady`, the first moment the controls exist.
Guard one-time work with `info.firstTime`, because the hook runs again when a
plugin window reopens. (In the editor, only the first preview of a panel in a
session has `firstTime` set.)

```lua
-- Lua
function onPanelReady(info)
  if info.firstTime then
    requestDump("patch")          -- ask the synth to send its current patch
  end
end
```

That is all it takes: when the dump arrives, the device profile decodes it and
fills every bound control, and nothing is echoed back to the synth. To do
something once it has arrived — show the patch name, say — give `requestDump` a
function. It is called with the decoded values, or with `info.ok` false if
nothing came back in time:

```lua
-- Lua
function onPanelReady(info)
  if info.firstTime then
    requestDump("patch", function(values, info)
      if info.ok then log("patch loaded") else logWarn("the synth did not answer") end
    end)
  end
end
```

A separate script that runs on `onDumpReceived` hears about every dump, however
it was asked for: `dump.values` holds what was decoded, and `dump.kind` names the
dump.

## 5. Blink an LED on a timer

`startTimer(id, ms)` raises the `onTimer` event every `ms` milliseconds, until
you call `stopTimer(id)`. This script runs on `onPanelReady` and starts the
timer; since a script answers only its own event, it listens for `onTimer` with
`on`:

```lua
-- Lua
local lit = false

on("*", "onTimer", function(info)
  if info.id == "blink" then
    lit = not lit
    set("led.background.fill.colour", lit and "#ff4000" or "#301000")
  end
end)

function onPanelReady(info)
  startTimer("blink", 500)
end
```
```js
// JavaScript
let lit = false

on("*", "onTimer", (info) => {
  if (info.id === "blink") {
    lit = !lit
    set("led.background.fill.colour", lit ? "#ff4000" : "#301000")
  }
})

function onPanelReady(info) {
  startTimer("blink", 500)
}
```

## 6. React to a *different* control

Any script can listen to another control. Register on it by name, at the top
of the script, with the full handler name:

```lua
-- Lua
on("cutoff", "onValueChanged", function(value)
  set("readout.text.content", tostring(round(value)) .. " Hz")
end)
```

## 7. Let scripts talk to each other

`emit` announces an event. Every script that registered `on("*", name, ...)`
reacts. This works across languages:

```lua
-- Lua — the announcing side
function onValueChanged(value)
  emit("bassBoostChanged", value)
end
```
```js
// JavaScript — a listening side, in another script
on("*", "bassBoostChanged", (value) => {
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
every note you started. A one-finger chord button — a script that runs on
`onPointerDown`, attached to the button, which also listens for the release:

```lua
-- Lua
on("chord", "onPointerUp", function(mouse)
  sendNoteOff(1, 60)
  sendNoteOff(1, 64)
  sendNoteOff(1, 67)
end)

function onPointerDown(mouse)
  sendNote(1, 60, 100)   -- held: no duration given
  sendNote(1, 64, 100)
  sendNote(1, 67, 100)
end
```

Here the button is called `chord`. Without the `on` line, `onPointerUp` would be
a second handler in a script that runs on `onPointerDown`, so it would never be
called and the notes would hang.
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
fire while the clock runs. A tempo-synced metronome light — a script that runs
on `onBeat`, which listens for `onBar` too:

```lua
-- Lua
on("*", "onBar", function(time)
  set("barReadout.text.content", "bar " .. time.bar)
end)

function onBeat(time)
  set("beatLight.background.fill.colour", time.beat == 1 and "#ff4000" or "#804000")
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

The console's trace also lists each handler as it runs, every error, and the
MIDI sent with send commands such as `sendCC`. It does not list every `set`, so
add a `log` line when you want to see a value. It is usually the fastest way to
find out why something fired, or why it did not.

## 12. Clean up when the panel closes

Two hooks, for two different moments. `onPanelClose` runs whenever the panel
window closes — in a DAW that happens all the time, and your scripts keep
running afterwards. Use it for things that only matter on screen, in a script
that runs on `onPanelClose`:

```lua
-- Lua
function onPanelClose()
  stopTimer("blink")
end
```

`onPanelDestroy` runs once, when the scripts themselves are about to stop: another
panel is opened, or the plugin is removed. That is the moment to leave the synth
in a good state, in a script that runs on `onPanelDestroy`:

```lua
-- Lua
function onPanelDestroy()
  sendDump("patch")   -- park the edits on the synth on the way out
end
```

In the editor, stopping the preview runs `onPanelClose` only.
