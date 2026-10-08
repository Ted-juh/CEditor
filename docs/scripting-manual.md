# CEditor Scripting Manual

This manual explains how to add behaviour to a CEditor panel with scripts, and describes every
command a script can use.

It has two parts. **Part 1** explains scripting from the ground up: what a script is, when it
runs, how it changes controls, and how it talks to your synth. Read it in order the first time.
**Part 2** is the reference: every hook, event and command, grouped by what it is for, so you can
look things up as you work.

Never written a CEditor script before? [Getting started](scripting-getting-started.md) walks you
through the screens step by step, and the [cookbook](scripting-cookbook.md) has ready-made
recipes for common jobs.

## Contents

**Part 1: Using scripts**

1. [What scripts are for](#1-what-scripts-are-for)
2. [Where scripts live](#2-where-scripts-live)
3. [When a script runs](#3-when-a-script-runs)
4. [Reading and changing the panel](#4-reading-and-changing-the-panel)
5. [Talking to your synth](#5-talking-to-your-synth)
6. [Hearing from your synth](#6-hearing-from-your-synth)
7. [Timers and musical time](#7-timers-and-musical-time)
8. [Remembering things](#8-remembering-things)
9. [When the plugin window is closed](#9-when-the-plugin-window-is-closed)
10. [Command names and modules](#10-command-names-and-modules)
11. [Choosing a language](#11-choosing-a-language)
12. [When something goes wrong](#12-when-something-goes-wrong)

**Part 2: Reference**

- [How to read the reference](#how-to-read-the-reference)
- [Numbers and units](#numbers-and-units)
- [Hooks](#hooks)
- [Events](#events)
- [Commands: The basics](#commands-the-basics)
- [Commands: Notes, MIDI and time](#commands-notes-midi-and-time)
- [Commands: Working out values](#commands-working-out-values)
- [Commands: The panel itself](#commands-the-panel-itself)
- [Commands: How it looks](#commands-how-it-looks)
- [Commands: Components](#commands-components)
- [Appendix A: The same script in every language](#appendix-a-the-same-script-in-every-language)
- [Appendix B: C++, C# and Java](#appendix-b-c-c-and-java)

---

# Part 1: Using scripts

## 1. What scripts are for

Most of a panel needs no code at all. You place a knob, bind it to a parameter of your synth, and
moving the knob changes the sound. A script is for everything the ordinary settings cannot do:

- making one control move another — a macro knob that turns three filters at once;
- reacting to the synth — showing the name of the patch it just switched to;
- asking the synth for all its settings when the panel opens, and filling every control;
- sending messages the device profile does not cover — notes, clock, a hand-built SysEx message;
- doing things on a timer — blinking a light, stepping through a pattern;
- changing how the panel looks while it runs, or asking the user a question.

Every script answers two questions: **when** should it run, and **what** should it do? The "when"
is a hook or an event, explained in [chapter 3](#3-when-a-script-runs). The "what" is your own
code plus the commands in Part 2.

Here is a complete script. It is attached to a knob and runs on `onValueChanged`: whenever the
knob is let go, it sets two other controls and sends a MIDI message:

```lua
-- Lua
function onValueChanged(value)
  set("cutoff.value", scale(value, 0, 1, 80, 12000))
  set("resonance.value", scale(value, 0, 1, 0.1, 0.85))
  sendCC(1, 74, round(value * 127))
end
```
```js
// JavaScript
function onValueChanged(value) {
  set('cutoff.value', scale(value, 0, 1, 80, 12000));
  set('resonance.value', scale(value, 0, 1, 0.1, 0.85));
  sendCC(1, 74, round(value * 127));
}
```

`onValueChanged` is the moment: the knob was let go. `set` changes another control, `scale` turns
the knob's value — which runs from 0 to 1 on this knob — into a frequency, and `sendCC` sends a
Control Change on MIDI channel 1.

## 2. Where scripts live

You write scripts in the **Behavior Designer**. Select a control and press **Script Editor** in the
Scripts / Logic area of the top bar. On the left, the panel's scripts are grouped by when they run
— Startup, Ready, Runtime, DAW state and Shutdown — and **+** adds a script to a group. On the
right is the code, with three settings above it:

- **Runs on** — the one event or hook this script answers, such as `onValueChanged` or
  `onPanelReady`. The script defines a function with exactly that name, and that is the function
  CEditor calls. [Chapter 3](#3-when-a-script-runs) explains what this means.
- **Attached control** — for a script in the Runtime group, which control it listens to. A new
  script starts as **Any control**, which means it runs for every control on the panel. Pick your
  control here unless that is what you want.
- **Language** — Lua, JavaScript, TypeScript, Python, C++, C# or Java. A script is stored exactly as
  you wrote it, in its own language.

Two things help while you type:

- **The picker** lists every control on the panel with its properties, and every command with its
  description. Click an entry and the call is written into your script, in your language.
- **The problems list** points out, as you type, a function that will never be called because it
  does not match **Runs on**, a command used where it cannot work, a component command aimed at the
  wrong kind of control, and a command from a module the panel has switched off. A misspelled
  control name is not caught there: it shows up in Test / Trace when the line runs.

Scripts are saved inside the panel file and go into the exported plugin with it.

### Trying a script out

Turn on the panel **preview** and use the panel; there is nothing to build. The first time, and
again after every change to the code, CEditor pauses the scripts and shows a bar asking whether you
trust them. Press **Enable scripts for this session** to run them. It asks because a script can send
MIDI to your instruments.

If something does not happen, open **Test / Trace**. It lists each handler as it runs, every
`log(…)` line, every error, and the MIDI sent with send commands such as `sendCC`. It does not
list every value a script sets, so add a `log` line when you want to see one.

Preview is a rehearsal. When you turn it off, everything it changed is put back — a knob you
turned, a colour a script set, a control a script created — so you can run a script a hundred
times without it slowly rewriting the panel you are building. To keep something a script did, say
so with `ce.panel.keep()`. Two things cannot be put back: MIDI that was already sent, and
settings saved with `ce.storage.saveSetting`.

## 3. When a script runs

A script does nothing until something calls it. Each script is called for **one** moment: the event
or hook in its **Runs on** setting. It defines a function with that name, and CEditor calls that
function every time the moment comes round. There are two kinds of moment.

### Hooks: moments in the panel's life

A hook is a fixed moment in the life of the panel. Roughly in the order they happen:

| Hook | When it runs | Typical use |
|---|---|---|
| `onPanelLoad` | The panel is opening; no controls exist yet. | Send the synth a start-up message. |
| `onPanelBuild` | Before the controls appear. | Create or arrange controls from a script. |
| `onPanelReady` | The controls exist. Runs again each time a plugin window reopens. | Ask the synth for its settings; fill the controls. |
| `onDraw` | A control needs repainting. | Draw your own graphics on a control. |
| `onError` | Any script on the panel failed. | Show the problem on the panel. |
| `onPanelClose` | The panel window closes. Scripts keep running. | Stop things that only matter on screen. |
| `onPanelDestroy` | The scripts are about to stop for good. | Send a final message to the synth. |
| `onDawSaveState` | The DAW saves the project (exported plugin only). | Return what you want saved. |
| `onDawRestoreState` | The DAW reopens the project (exported plugin only). | Read back what you saved. |

The two that matter most are `onPanelLoad` and `onPanelReady`. During `onPanelLoad` the controls
do not exist yet, so do not read or set them there. By `onPanelReady` they do. In a plugin,
`onPanelReady` runs again each time the window is reopened, so put work that should happen only
once inside `if info.firstTime`. A script that runs on `onPanelReady`:

```lua
-- Lua
function onPanelReady(info)
  if info.firstTime then
    ce.device.requestDump("patch")   -- ask the synth for its current sound
  end
end
```
```js
// JavaScript
function onPanelReady(info) {
  if (info.firstTime) {
    ce.device.requestDump("patch");  // ask the synth for its current sound
  }
}
```

### Events: something happened

An event is something happening: a knob moved, a button was clicked, a note arrived from the synth,
a timer went off. Choose the event in **Runs on** and write the function of the same name. A script
that runs on `onClick`, attached to a button:

```lua
-- Lua
function onClick(mouse)
  log("clicked at " .. mouse.x .. ", " .. mouse.y)
end
```

Your function is given what it needs to know. When that is one thing, you get it directly:
`onValueChanged(value)`. When it is several things, you get one object that holds them:
`onClick(mouse)`, then `mouse.x` and `mouse.y`. The [events tables](#events) in Part 2 list
what each event gives you.

**Moving or let go?** Turning a knob raises two events. `onValueChange` runs again and again while
it moves; `onValueChanged` runs once when it settles. Use `onValueChange` for things on screen that
should follow the knob, and `onValueChanged` to tell the synth, so it is not flooded with every
step along the way.

### One script, one event

A script answers only the event in its **Runs on** box. If you write a second handler in the same
script — `onPointerUp` next to `onPointerDown`, or `onTimer` next to `onPanelReady` — it is
never called. To react to a second event, give it a script of its own, or listen for it with `on`.

### Listening with on

`on(target, event, fn)` asks CEditor to call `fn` whenever `event` happens on `target`. Name the
event by its handler name, such as `"onValueChanged"`; `target` is a control's name, or `"*"` for
anything. Put `on` calls at the top of a script, outside any function, so they are set up once,
when the script loads:

```lua
-- Lua
on("cutoff", "onValueChanged", function(value)
  set("resonance.value", value * 0.5)
end)

on("*", "onNoteIn", function(note)
  log("note " .. note.note .. " on channel " .. note.channel)
end)
```
```js
// JavaScript
on("cutoff", "onValueChanged", (value) => {
  set("resonance.value", value * 0.5);
});

on("*", "onNoteIn", (note) => {
  log("note " + note.note + " on channel " + note.channel);
});
```

Always write the full handler name, with `on` in front. The editor also understands the short form
(`"valueChanged"`), but the exported plugin does not once its window is closed. `off(target, event)`
stops listening again.

**Your own events.** Scripts can talk to each other. One announces an event with
`emit("name", data)`; every script listening with `on("*", "name", fn)` is called with the data.
When you need an answer back, give a function a name with `defineAction` in one script and call it
with `run` from another.

## 4. Reading and changing the panel

Everything on the panel has an address, called a **path**: the control's name, then the property,
joined by dots. `get` reads a path and `set` changes it:

```lua
-- Lua
local hz = get("cutoff.value")
set("cutoff.value", 8000)
set("button2.background.fill.colour", "#5B9BD5")
```

Upper and lower case do not matter in a path. When you rename a control, CEditor updates the
name in every script for you. A path that leads nowhere is not an error: `get` returns nothing,
and `set` writes a line to the script console and carries on. So check what `get` gave you before
doing arithmetic with it.

### Three ways to read a value

A control's value can be read and written in three forms. Add the one you want to the end of the
path:

| Add to the path | What you get |
|---|---|
| `.value` | The real value, as you would read it on the synth's front panel: 8000 (Hz), or "LP" for a named setting. This is what you get when you do not ask for one of the others. Set it, and the device profile works out which MIDI to send. |
| `.normalizedValue` | The same value as a position from 0 to 1, worked out from the control's own minimum and maximum. Use it for curves, and to make two controls with different ranges move together. |
| `.midiValue` | The value as it is sent over MIDI — 101, say — encoded the way the device profile encodes it. Only available for a control that is bound to a synth parameter. |

`.normalizedValue` is what you want most often in scripts that link controls. A filter cutoff
from 20 to 20000 Hz and a resonance from 0 to 100 do not share units, but both run from 0 to 1 as
positions:

```lua
set("resonance.normalizedValue", get("cutoff.normalizedValue"))
```

### The script's own control: self

The control or panel this script belongs to: the control for a control script, the panel for a panel script. Use it instead of a fixed name, so that one script works on every copy of a control.

`self.get("value")` reads the value of the script's own control, and `self.set("value", 0.5)`
sets it. Write it with a dot, not a colon, in Lua as well.

### The panel itself

Paths that start with `panel` reach the panel rather than a control: `get("panel.width")`,
`set("panel.bgColour", "FF202020")`. Its name, size and background can be read and changed this
way; the things that identify the panel, such as its file path, can only be read.

## 5. Talking to your synth

### Controls send their own MIDI

A control that is bound to a parameter of your synth sends MIDI when its value changes — and that
includes changes made by a script. `set("cutoff.value", 8000)` moves the knob *and* sends the new
cutoff to the synth. The **device profile** works out the message: it is the description of your
synth's parameters, messages and dumps that you make in the Device Profile Designer. So a script
deals in parameter names and real values, and never needs to know the bytes.

### When nothing is sent

There is one exception, and it is deliberate. While a script is reacting to MIDI that came *from*
the synth, the values it sets are not sent back — otherwise the synth would receive its own
values as an echo, and a loop could start. You can change this either way for a block of code:

- `noTransmit(fn)` runs `fn` without sending the changes it makes with `set`. Use it when one
  click sets many controls, such as an Init Patch button, and you would rather send one dump at the
  end than fifty separate messages. Commands that send MIDI themselves, such as `sendCC`, still
  send inside the block.
- `transmit(fn)` runs `fn` and sends its changes even while reacting to the synth.

A script that runs on `onClick`, attached to an Init Patch button:

```lua
-- Lua
function onClick(mouse)
  noTransmit(function()
    set("cutoff.value", 8000)
    set("resonance.value", 20)
    set("envAmount.value", 0)
  end)
  ce.device.sendDump("patch")   -- one message with everything
end
```
```js
// JavaScript
function onClick(mouse) {
  noTransmit(() => {
    set("cutoff.value", 8000);
    set("resonance.value", 20);
    set("envAmount.value", 0);
  });
  ce.device.sendDump("patch");  // one message with everything
}
```

### Sending MIDI yourself

For anything the device profile does not cover, send the message directly: `sendCC`,
`sendNRPN`, `sendNote`, `sendProgramChange`, `sendSysex` and the rest of
[ce.midi](#cemidi-sending-and-filtering-midi). MIDI channels are always numbered 1 to 16, as on the
synth's display; CEditor does the conversion.

```lua
sendCC(1, 74, 100)          -- CC 74, value 100, on channel 1
sendNote(1, "C4", 100, 500) -- play middle C for half a second
```

### Presets, dumps and parameters

- `ce.device.requestDump("patch")` asks the synth for all its current settings in one message.
  When it arrives, the controls bound to those parameters are filled in for you.
- `ce.device.sendDump("patch")` sends the panel's current values to the synth in one message.
- `ce.device.recallPreset(slot)` switches the synth to a stored preset, using whatever message that
  synth needs.
- `ce.device.write(id, value)` changes a parameter by name without needing a control for it, and
  `ce.device.read(id)` gives you the last value the synth reported.

A panel can talk to more than one device. Each one is given a **role**, such as "mainSynth" (the
default). Commands that take a `role` argument use it to pick the device; `ce.midi.route(role, fn)`
sends everything inside `fn` to another device.

## 6. Hearing from your synth

When the synth sends something, CEditor raises an event. Start with the events at the top of this
list — they arrive already decoded by the device profile — and use the raw ones only for things the
profile does not describe:

- `onParameterReceived(info)` — the synth reported a parameter: `info.parameter`, `info.value`.
- `onDumpReceived(dump)` — a whole dump arrived; the bound controls are already filled in.
- `onPresetChange(preset)` — the synth switched preset, or the panel switched it.
- `onNoteIn(note)`, `onNoteOffIn(note)`, `onCcIn(cc)` — notes and controllers, decoded from MIDI.
- `onMidiIn(midi)`, `onSysexIn(bytes)` — any message, exactly as it arrived.

Choose one in a script's **Runs on** box, or listen with `on("*", "onPresetChange", fn)`. A
script that runs on `onPresetChange`:

```lua
-- Lua
function onPresetChange(preset)
  ce.ui.status("Preset: " .. preset.name)
end
```
```js
// JavaScript
function onPresetChange(preset) {
  ce.ui.status("Preset: " + preset.name);
}
```

Remember the rule from the previous chapter: anything you `set` while handling one of these
events is not sent back to the synth.

## 7. Timers and musical time

To run code later, or again and again, use a timer. This script runs on `onPanelReady`, where
it starts the timer. Because a script answers only one event, it listens for the timer with `on`:

```lua
-- Lua
local lit = false

on("*", "onTimer", function(info)
  if info.id == "blink" then
    lit = not lit
    set("led.background.fill.colour", lit and "#FF4000" or "#301000")
  end
end)

function onPanelReady(info)
  ce.time.startTimer("blink", 500)        -- every half second
end
```
```js
// JavaScript
let lit = false;

on("*", "onTimer", (info) => {
  if (info.id === "blink") {
    lit = !lit;
    set("led.background.fill.colour", lit ? "#FF4000" : "#301000");
  }
});

function onPanelReady(info) {
  ce.time.startTimer("blink", 500);       // every half second
}
```

- `ce.time.startTimer(id, ms)` repeats every `ms` milliseconds and calls `onTimer` with
  `info.id` set to the name you gave it. `ce.time.stopTimer(id)` stops it.
- `ce.time.after(ms, fn)` runs `fn` once, later.
- `ce.time.syncTimer(id, beats)` and `ce.time.afterBeats(beats, fn)` do the same in beats, and
  follow the tempo.
- `onBeat`, `onBar` and `onTransport` tell you when a beat or bar passes and when playback
  starts or stops.

Musical timing is accurate to about a thirtieth of a second. That is plenty for lights, displays
and stepping a pattern, but not for timing audio: leave that to the synth.

## 8. Remembering things

Variables in your script last only as long as the script does. CEditor gives you three places to
keep things for longer:

- **`ce.storage.state`** keeps values between one run of a handler and the next — a counter, the
  last note played. It is private to the script and starts empty whenever the script is reloaded.
- **Settings** — `ce.storage.saveSetting(key, value)` and `ce.storage.loadSetting(key, fallback)` —
  last beyond the session. A setting can be stored with the panel (the default), kept private to one
  script, or kept on this computer only.
- **The DAW project.** In an exported plugin, `onDawSaveState` lets you add your own values to the
  project when the DAW saves it, and `onDawRestoreState` gives them back when the project is
  reopened.

## 9. When the plugin window is closed

Your scripts can run in two places:

1. **With the panel window open.** That is the editor's preview, and the plugin's window when
   someone has it open in their DAW.
2. **With the window closed.** In a DAW, people close plugin windows all the time. The plugin
   keeps working, and so do your scripts: timers keep ticking and MIDI keeps arriving. There is
   just nothing on screen.

Most commands work the same in both places. A few need the window, because they deal with what
is on screen: drawing, images and fonts, messages and questions, the ready-made components, and
building the panel. With the window closed they do nothing and write a note to the log instead.
In the reference these are marked **Panel window only**, or the whole
chapter says so. Two hooks work the other way round: `onDawSaveState` and `onDawRestoreState`
only run in the exported plugin, because only a DAW saves projects.

So if a script must keep working with the window closed — a timer that keeps sending MIDI, for
example — use only commands without that mark. A script can also check while it runs:
`ce.has("ce.draw")` is true only when drawing is available right now.

## 10. Command names and modules

Commands are grouped into **modules** by what they are for: `ce.midi` for MIDI, `ce.device` for
the synth, `ce.time` for timers, and so on. A command's full name says which module it is in:
`ce.midi.sendCC`, `ce.time.startTimer`. The picker writes these full names for you, and Part 2
is organised by them.

The basic commands — `set`, `get`, `on`, `log` and the others in
[ce.core](#cecore-values-events-and-the-console) — are used so often that they have no prefix.

Most commands also have a **short name** that works on its own: `sendCC` for `ce.midi.sendCC`,
`startTimer` for `ce.time.startTimer`. Both names do exactly the same thing, so use whichever
you prefer. Where the short name is different from the end of the full name, the reference says
what it is — `deviceRead` for `ce.device.read`, for example.

You do not normally need to think about modules: CEditor switches on the ones your scripts use.
If you choose them by hand instead, in the **Scripting Modules** list on the Export tab, a command
from a module you left out does nothing and prints a message naming the module to add. Leaving the
list empty lets CEditor choose again.

## 11. Choosing a language

The commands are the same in every language. Choose the one you are most comfortable with; if
you have no preference, Lua and JavaScript are the simplest and run everywhere.

| Language | Runs in the editor | Runs in the exported plugin | Notes |
|---|---|---|---|
| **Lua** | Yes | Yes | Small and quick. A good first choice. |
| **JavaScript** | Yes | Yes | A good first choice if you already know it. |
| **TypeScript** | Yes | Yes | JavaScript with types. Converted to JavaScript when you export. |
| **Python** | Yes | Yes | The export includes a Python interpreter when a script needs one, which makes the plugin larger. |
| **C++** | Yes, a large part of the language | Yes, compiled — the core commands only | See [Appendix B](#appendix-b-c-c-and-java). |
| **C#** | Yes, a large part of the language | Yes, compiled — the core commands only | See [Appendix B](#appendix-b-c-c-and-java). |
| **Java** | Yes, a large part of the language | Yes, compiled — the core commands only | See [Appendix B](#appendix-b-c-c-and-java). |

In Lua, JavaScript, TypeScript and Python every command is a plain function: `set(…)`,
`sendCC(…)`. In C++, C# and Java, a handler is given an object called `ctx` and
the commands are reached through it: `ctx.set(…)`, `ctx.sendCC(…)` — in C#, `ctx.SetValue(…)`
and `ctx.SendCC(…)`. [Appendix A](#appendix-a-the-same-script-in-every-language) shows one script
in every language. The examples in this manual are in Lua and JavaScript.

## 12. When something goes wrong

One rule holds everywhere: **a broken script never takes the panel down with it.** In practice:

- **A script fails.** That one handler stops; every other script and the panel carry on. The error
  is shown in the editor's script console with the script's name, and in an exported plugin it is
  written to the log file. It is never silent, and it never pops up a dialog. If you want the panel
  to show it, write an `onError` hook.
- **`set` names a control that does not exist.** A line appears in the script console
  (`set: control "…" not found on the active panel`) and the script continues.
- **`get` names a control or property that does not exist.** It returns nothing — `nil` in Lua,
  `undefined` in JavaScript, `None` in Python — so check before doing arithmetic with it.
- **A component command is aimed at the wrong kind of control** (an arpeggiator command at a knob,
  say). A line in the console says what was expected, and nothing changes.
- **A command is given a value it does not know** — an unknown scene name, a step outside the grid.
  Nothing happens, and a line in the console says why, so a button never just seems dead.
- **A script runs away** — an endless loop, a function that calls itself forever, a flood of MIDI.
  Safety limits stop it without disturbing the panel, and say so in the console.

Scripts can only reach the panel and the commands in this manual: no files, no network, nothing
else on your computer.

---

# Part 2: Reference

## How to read the reference

Each command is shown the way you type it, with its arguments:

- **`[ ]`** marks an argument you can leave out: `ce.time.after(ms, fn)` needs both, while
  `ce.ui.dismiss([id])` works with or without one.
- **`->`** says what the command gives back: `ce.midi.checksum(…) -> number`. "Returns nothing"
  means `nil` in Lua, `undefined` in JavaScript and `None` in Python.
- **`opts`** is a table (Lua) or object (JavaScript) of optional settings, such as
  `{ duration = 500 }` or `{ duration: 500 }`. When a command takes one, a table lists what it can
  contain and what each setting is when you leave it out.
- ***Short name*** gives the other name a command answers to (see
  [chapter 10](#10-command-names-and-modules)).
- ***Panel window only*** means the command needs the panel window
  ([chapter 9](#9-when-the-plugin-window-is-closed)).

Examples are in Lua and JavaScript; when the two are written the same way, there is one example.
A `…` in an example is where your own code goes.

## Numbers and units

The same conventions hold everywhere:

| What | Range or form |
|---|---|
| MIDI channel | **1 to 16**, as on the synth (CEditor converts it for the wire) |
| CC number, 7-bit value | 0 to 127 |
| NRPN value | 0 to 16383 (14-bit) |
| Note number | 0 to 127; middle C is **C4 = 60** |
| `.normalizedValue` | 0 to 1 |
| Colours | `"#RRGGBB"` text, such as `"#5B9BD5"` |
| Times | milliseconds |
| Keys and scale degrees | key: 0 = C … 11 = B; degrees count from 1 |
| Scenes and sequencer steps | count from 1, or by name where the command says so |
| Preset slots | count from 0, across all banks, as the device profile numbers them |

## Hooks

Hooks are the fixed moments in the life of a panel; [chapter 3](#3-when-a-script-runs) explains
them. Choose one in a script's **Runs on** box and define the function of the same name.

### `onPanelLoad()`

Runs first, as soon as the panel is opened and before any controls exist. Use it to set up MIDI or send the synth a start-up message. Do not read or change controls here — they have not been created yet.

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

Runs after onPanelLoad and before onPanelReady. This is the place to create, copy and arrange controls from a script. Controls made by a script are removed before each run, so this always starts from the panel as you built it.

*Panel window only.*

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

Runs when any script on the panel fails. `info` says which script failed, what it was doing and what the error was. The error is always written to the log as well. If onError itself fails, that error is logged and onError is not called again, so it cannot get stuck in a loop.

**`info`** holds:

| Name | Type | What it is |
|---|---|---|
| `script` | text | The name of the script that failed. |
| `scriptId` | text | Its id, which stays the same when it is renamed. |
| `event` | text | The handler that was running, such as "onValueChanged". |
| `phase` | text | Whether it failed while being loaded or while handling an event. One of "load" or "dispatch". |
| `message` | text | The error message. |

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

Paints on top of the control this script is attached to; `info` gives the control's name and its current size. It runs when the control needs repainting, not on every frame: to animate, call `ce.draw.redraw()` from a timer.

*Panel window only.*

**`info`** holds:

| Name | Type | What it is |
|---|---|---|
| `target` | text | The name of the control being painted. |
| `width` | number (pixels) | How wide the control is right now. |
| `height` | number (pixels) | How tall it is right now. |

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

Runs once the controls exist. This is the moment to ask the synth for its current settings and fill the controls. In a plugin it runs again each time the window is reopened, so put one-time work inside `if info.firstTime`.

**`info`** holds:

| Name | Type | What it is |
|---|---|---|
| `firstTime` | true or false | True the first time the panel opens, false when a plugin window is reopened. Guard one-time setup with it. |

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

Runs when the panel window closes: you stopped the preview, or the plugin window was closed in the DAW. Your scripts keep running after this — timers still tick and MIDI still arrives. To clean up when the scripts themselves are stopped, use onPanelDestroy.

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

Runs when the scripts are about to be stopped: another panel was opened, the scripts were replaced, or the plugin was removed. It is the last hook to run, and timers, saved state and MIDI still work, so this is the place to restore the synth or send a final dump. It runs exactly once, even if onPanelClose never did.

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

Runs when the DAW saves the project. Return a table (Lua) or object (JavaScript) holding what you want saved. `store` shows what other scripts have saved so far; it is for reading only, and changing it saves nothing.

*Exported plugin only — never runs in the editor.*

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

Runs when the DAW reopens the project. Read your values back out of `store`, which holds what your onDawSaveState returned together with what every other script saved.

*Exported plugin only — never runs in the editor.*

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

Choose an event in a script's **Runs on** box and define the handler function of the same name, or
listen for it from any script with `on(target, "onValueChanged", fn)`, giving the handler name.
[Chapter 3](#3-when-a-script-runs) explains both.

### Control events

Raised by the control the script belongs to.

| Handler | When it runs, and what you get |
|---|---|
| `onValueChange(value)` | Fires again and again while the value is moving, for example while a knob is being dragged. Use it for things on screen that should follow the control. |
| `onValueChanged(value)` | Fires once, when the value has settled — for example when the knob is let go. This is the moment to tell the synth. |
| `onActiveHandleChanged(info)` | A slider with more than one handle switched to a different handle. `info.activeHandle` and `info.previousActiveHandle` are each "start", "current" or "end". |
| `onClick(mouse)` | The control was clicked. `mouse.x` and `mouse.y` say where, inside the control. |
| `onDoubleClick(mouse)` | The control was double-clicked. `mouse.x` and `mouse.y` say where. |
| `onPointerDown(mouse)` | A mouse button was pressed on the control. `mouse.x` and `mouse.y` say where, `mouse.button` which button, and `mouse.modifiers` which modifier keys were held. |
| `onPointerMove(mouse)` | The mouse moved while a button was held down on the control. `mouse.x` and `mouse.y` give the new position. |
| `onPointerUp(mouse)` | The mouse button was released. |
| `onHoverStart()` | The mouse pointer moved onto the control. |
| `onHoverEnd()` | The mouse pointer left the control. |
| `onWheel(wheel)` | The mouse wheel was turned over the control. `wheel.delta` says how far, and in which direction. |
| `onStateChanged(state)` | The control's look-state changed. `state` is one word: "normal", "hover", "pressed" or "disabled". |

### Panel events

| Handler | When it runs, and what you get |
|---|---|
| `onControlChanged(info)` | Any control on the panel changed. `info.target` is the control's name and `info.value` its new value. Use it to react to many controls in one place. |
| `onTimer(info)` | A timer you started is due. `info.id` is the name you gave it in `ce.time.startTimer()` or `ce.time.syncTimer()`. |

### Time events

Raised while the transport plays. Accurate to about a thirtieth of a second — right for lights and
displays, not for timing audio.

| Handler | When it runs, and what you get |
|---|---|
| `onBeat(time)` | A beat went by while the transport is playing. `time.bar` and `time.beat` give the position, `time.beats` the total count of beats, and `time.bpm` the tempo. It arrives within a thirtieth of a second of the beat: right for lighting an LED or stepping a display, not for timing sound. |
| `onBar(time)` | A new bar started. `time.bar` is the bar number, `time.beats` the total count of beats, and `time.beatsPerBar` the time signature's beats per bar. It fires on the downbeat, together with onBeat. |
| `onTransport(time)` | The transport started, stopped or changed tempo. `time.playing` says whether it is running, `time.bpm` gives the tempo and `time.source` what is driving it. |

### Synth and MIDI events

Raised when something arrives from a device. Values you `set` while handling these are not sent
back to the synth ([chapter 5](#5-talking-to-your-synth)).

| Handler | When it runs, and what you get |
|---|---|
| `onParameterReceived(info)` | The synth reported a parameter value and the device profile has decoded it. `info.parameter` is the parameter's id and `info.value` its value, in the parameter's own units. |
| `onDumpReceived(dump)` | A bulk dump from the synth arrived and has been decoded. The controls bound to its parameters are already filled in by the time this runs. `dump.values` holds every decoded value (parameter id to value), `dump.kind` names the dump, such as "patch", and `dump.role` the device it came from. |
| `onPresetChange(preset)` | The current preset changed. `preset.slot`, `preset.program`, `preset.name`, `preset.category` and `preset.bankId` describe the new one. `preset.source` says which end changed it: "device" when the instrument sent a Program Change, "panel" when the panel called recallPreset. |
| `onMidiIn(midi)` | Any MIDI message arrived, exactly as received. `midi.bytes` holds the message, `midi.status` its first byte and `midi.channel` its channel, counted from 0. |
| `onCcIn(cc)` | A Control Change message arrived. `cc.cc` is the controller number and `cc.value` its value. Note that `cc.channel` is 0-based here (0 to 15), unlike sendCC and onNoteIn, which count channels 1 to 16. |
| `onNoteIn(note)` | A note was played. `note.channel` (1-16, the same as sendNote), `note.note` and `note.velocity` describe it. A note-on with velocity 0 means "note off" in MIDI, so it arrives as onNoteOffIn instead. |
| `onNoteOffIn(note)` | A note was released. `note.channel` (1-16), `note.note` and `note.velocity` describe it; the velocity is the release velocity, or 0 when the device sent a note-on with velocity 0 instead of a note-off. |
| `onSysexIn(bytes)` | A System Exclusive (SysEx) message arrived. `bytes` is the message as a list of numbers. |
| `onDeviceConnected(device)` | A device became connected and ready. `device.role` names which device it is, `device.profileId` its device profile. |
| `onDeviceDisconnected(device)` | A device is no longer connected and ready. `device.role` names which device it was, and `device.message` may say why. |

### Component events

Raised by the ready-made components. Listen with `on("*", "onStep", fn)` to hear from every
component, or put the component's name in place of `"*"`. These need the panel window.

| Handler | When it runs, and what you get |
|---|---|
| `onStep(step)` | A sequencer moved to its next step. `step.target` is the component's name, `step.index` the step number (counting from 1), `step.of` how many steps there are, and `step.notes` the notes it plays. Raised by the Arpeggiator, Turing Machine, Phrase Sequencer and Looper. |
| `onCycle(cycle)` | A sequence or loop came back round to its start. `cycle.target` is the component's name and `cycle.count` how many times it has come round since the panel opened. Raised by the Arpeggiator, Turing Machine, Looper and Orbit. |
| `onHit(hit)` | A pad, key or ribbon was struck. `hit.target` is the component's name, `hit.id` which pad or key, `hit.note` the note and `hit.velocity` how hard. Raised by the Chord Pad, Drum Pads and Note Ribbon. |
| `onRelease(release)` | A pad, key or ribbon was let go. `release.target` is the component's name, `release.id` which pad or key, and `release.note` the note. |
| `onScene(scene)` | The Setlist switched to a scene. `scene.target` is the component's name, `scene.index` the scene number (counting from 1) and `scene.name` its name. It fires however the scene was chosen, by a script or by a footswitch. |
| `onStage(stage)` | A component moved into a new stage. `stage.target` is the component's name, `stage.stage` the new stage and `stage.previous` the old one. The Recorder reports "idle", "armed", "recording" and "overdub"; the Envelope reports "sustain", "release" and "end". This is not the same as onStateChanged, which is about hover and press. |
| `onSettled(settled)` | A spring-loaded control finished gliding back to its rest position. `settled.target` is the component's name and `settled.value` where it came to rest. Raised by the Ribbon, Crossfader and Vector Joystick. |
| `onBounce(bounce)` | The Kinetic ball hit a wall. `bounce.target` is the component's name, `bounce.x` and `bounce.y` where it hit, and `bounce.vx` and `bounce.vy` its speed across and down. |
| `onRecall(recall)` | The Constellation snapped to one of its presets. `recall.target` is the component's name, `recall.id` the preset and `recall.label` its label. It fires in snap mode only, not in blend mode. |
| `onZone(zone)` | A Meter's reading crossed into a different zone, such as from green into red. `zone.target` is the component's name, `zone.zone` the new zone, `zone.previous` the old one and `zone.value` the reading. |
| `onVoiced(voiced)` | A component turned one played note into other notes. `voiced.target` is the component's name, `voiced.note` and `voiced.velocity` the note that was played, and `voiced.out` the notes it produced. Raised by the Zone Splitter and the Harmoniser. |

## Commands: The basics

Always available, in every script.

### ce.core: values, events and the console

The commands nearly every script uses: reading and changing values, deciding whether a change is sent to the synth, listening for events, and printing to the script console. These are always available and are written without a `ce.` prefix: `set(…)`, `get(…)`, `on(…)`, `log(…)`. Three are the exception, because their short names would clash with words the languages already use: `ce.core.action`, `ce.core.warn` and `ce.core.error`, also known as `defineAction`, `logWarn` and `logError`.

#### `set(path, value [, opts])`

Change a value on the panel — usually a control's value, but any property a path can reach. Add .normalizedValue to the path to give a position from 0 to 1 instead of the real value. A change you make this way is sent to the synth, except while your script is reacting to MIDI that came from the synth: then it stays silent, so the synth does not get its own value echoed back.

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `transmit` | true or false | decided by where the write came from | Whether to send the change to the synth. Left out, a write made while handling something the synth sent stays silent and any other write is sent. Set it only when you need to override that. |

```lua
set("path", value)
```

#### `get(path [, form])`

Read a value from the panel. A control's value comes in three forms: add .value (the default), .normalizedValue or .midiValue to the end of the path, or pass the form's name as `form`. Returns nothing if the control or property does not exist.

```lua
get("path")
```

#### `noTransmit(fn)`

Run a block of code that changes controls without sending anything to the synth — for example an Init Patch button that resets twenty controls at once. Sending switches back on by itself when the block ends.

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

Run a block of code whose changes are sent to the synth even while your script is reacting to MIDI from the synth, when they would normally stay silent.

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

#### `on(target, event, fn)`

Listen for an event from any script: on another control, on the panel, on the device, or a custom event announced with emit. `target` is the name of what to listen to ("*" means anything), `event` the handler name, such as "onValueChanged", and `fn` the function to call. Put it at the top of a script, outside any function, so it is set up once when the script loads. A script also answers the one event in its Runs on setting without this.

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

Stop listening to an event you started listening to with on. It removes this script's listeners for that target and event; other scripts' listeners are left alone. Naming something you were not listening to does nothing.

```lua
off("target", "event")
```

#### `watch(path, fn)`

Call `fn(value, previous)` whenever a path on the panel changes — a control's value, a colour, a setting deep inside a section. It fires whatever made the change: a script, the user, or MIDI from the synth.

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

Turn a property into a formula. `fn` is worked out again whenever anything on the panel changes, and its result is written to `path` — for example a label that always shows the cutoff frequency.

```lua
-- Lua
compute("label.text.text", function()
  return …
end)
```
```js
// JavaScript
compute("label.text.text", () => {
  return …
})
```

#### `intercept(path, fn)`

Check or change every value written to `path` before it lands. `fn(value, previous)` can return a different value to use instead (to clamp, round or snap it), return false to refuse the change, or return nothing to let it through unchanged.

```lua
-- Lua
intercept("cutoff.value", function(v, prev)
  return …
end)
```
```js
// JavaScript
intercept("cutoff.value", (v, prev) => {
  return …
})
```

#### `ce.core.action(name, fn)`

Give a function a name so other scripts can call it. Any script, in any language, can then run it with run("name"), and the panel offers it wherever controls can be set to trigger an action.

*Short name: `defineAction`.*

```lua
-- Lua
ce.core.action("initPatch", function(args)
  …
end)
```
```js
// JavaScript
ce.core.action("initPatch", (args) => {
  …
})
```

#### `emit(name [, data])`

Announce a custom event by name, optionally with some data. Every script listening for it with on("*", name, fn) is called. The announcing script does not wait for an answer; use run when you need one.

```lua
emit("name", data)
```

#### `run(target.action [, args])`

Call an action that another script has defined, and get its result back. Name it as "action", or as "control.action" to call the function of that name in a particular control's script. It works across languages, so only plain data — numbers, text, true/false, lists and tables — can be passed in and returned.

```lua
run("target.action")
```

#### `log(message [, value])`

Print a message to the script console, optionally followed by a value. It changes nothing on the panel.

```lua
log("message", value)
```

#### `ce.core.warn(message [, value])`

Print a warning to the script console: something is not right, but the panel carries on. Warnings stand out from ordinary log lines.

*Short name: `logWarn`.*

```lua
ce.core.warn("message")
```

#### `ce.core.error(message [, value])`

Print an error to the script console: something the panel could not do. It only prints — your handler keeps running. To stop the handler, use your language's own way of raising an error (error() in Lua, throw in JavaScript).

*Short name: `logError`.*

```lua
ce.core.error("message")
```

## Commands: Notes, MIDI and time

MIDI in and out, the connected device, music theory, and musical time.

### ce.midi: sending and filtering MIDI

Sending MIDI yourself, and catching MIDI on its way in or out. Most panels do not need these, because a control bound to a synth parameter sends its own MIDI. Reach for them for messages the device profile does not cover: notes, program changes, clock, hand-built SysEx. Channels are always counted 1 to 16. The last part of this chapter is a set of helper functions for packing values into SysEx bytes.

#### `ce.midi.sendCC(channel, cc, value)`

Send a MIDI Control Change (CC) message: `channel` 1 to 16, controller number `cc` 0 to 127, `value` 0 to 127.

*Short name: `sendCC`.*

```lua
ce.midi.sendCC(channel, cc, value)
```

#### `ce.midi.sendNRPN(channel, msb, lsb, value)`

Send an NRPN (Non-Registered Parameter Number) message: `msb` and `lsb` pick the parameter and `value` runs from 0 to 16383. Many synths use NRPNs for parameters that need more than 128 steps.

*Short name: `sendNRPN`.*

```lua
ce.midi.sendNRPN(channel, msb, lsb, value)
```

#### `ce.midi.sendRPN(channel, msb, lsb, value)`

Send an RPN (Registered Parameter Number) message — the standard way to set pitch-bend range (0, 0), fine tuning (0, 1) and coarse tuning (0, 2). It works like sendNRPN, but uses controllers 101 and 100 instead of 99 and 98.

*Short name: `sendRPN`.*

```lua
-- Lua
ce.midi.sendRPN(1, 0, 0, 2)  -- pitch-bend range
```
```js
// JavaScript
ce.midi.sendRPN(1, 0, 0, 2);  // pitch-bend range
```

#### `ce.midi.sendSongPosition(beats)`

Send a Song Position Pointer, which tells a sequencer where to resume when it next receives start or continue. `beats` is in MIDI beats: one MIDI beat is six clock ticks, a sixteenth note.

*Short name: `sendSongPosition`.*

```lua
-- Lua
ce.midi.sendSongPosition(0)
```
```js
// JavaScript
ce.midi.sendSongPosition(0);
```

#### `ce.midi.sendMidi(bytes)`

Send MIDI bytes exactly as you give them, with nothing added or changed. All the other send commands are built on this one, so use one of those when it fits.

*Short name: `sendMidi`.*

```lua
-- Lua
ce.midi.sendMidi({0x90, 60, 100})
```
```js
// JavaScript
ce.midi.sendMidi([0x90, 60, 100])
```

#### `ce.midi.sendNote(channel, note, velocity [, ms])`

Play a note. `note` is a MIDI note number or a name such as "C3". A velocity of 0 means note off. Give `ms` and the matching note off is sent for you after that many milliseconds.

*Short name: `sendNote`.*

```lua
ce.midi.sendNote(1, 60, 100)
```

#### `ce.midi.interceptIn(fn)`

See every MIDI message from the synth before the panel acts on it. `fn(bytes)` can return different bytes to change the message, false to drop it, or nothing to let it through unchanged.

*Short name: `interceptMidiIn`.*

```lua
-- Lua
ce.midi.interceptIn(function(bytes)
  …
  return bytes
end)
```
```js
// JavaScript
ce.midi.interceptIn((bytes) => {
  …
  return bytes
})
```

#### `ce.midi.interceptOut(fn)`

See every MIDI message the panel sends — from a script or from a control's own MIDI setting — before it goes out. `fn(bytes)` can return different bytes to change the message, false to drop it, or nothing to let it through unchanged.

*Short name: `interceptMidiOut`.*

```lua
-- Lua
ce.midi.interceptOut(function(bytes)
  …
  return bytes
end)
```
```js
// JavaScript
ce.midi.interceptOut((bytes) => {
  …
  return bytes
})
```

#### `ce.midi.feed(bytes)`

Pretend a MIDI message arrived from the synth. The panel's controls, note input and transport react to it exactly as they would to the real thing, and any interceptMidiIn filters see it first.

*Short name: `feedMidi`.*

```lua
-- Lua
ce.midi.feed({0x90, 60, 100})
```
```js
// JavaScript
ce.midi.feed([0x90, 60, 100])
```

#### `ce.midi.route(role, fn)`

Send everything the code inside `fn` sends to another device, named by its `role`, instead of the main synth. It works like noTransmit: only the block is affected.

*Short name: `routeMidi`.*

```lua
-- Lua
ce.midi.route("aux", function()
  …
end)
```
```js
// JavaScript
ce.midi.route("aux", () => {
  …
})
```

#### `ce.midi.sendNoteOff(channel, note [, velocity])`

Release a note. The release velocity defaults to 0. Nothing does this for you: every note you start with sendNote (without `ms`) needs its own note off.

*Short name: `sendNoteOff`.*

```lua
ce.midi.sendNoteOff(1, 60)
```

#### `ce.midi.sendProgramChange(channel, program [, bankMsb, bankLsb])`

Send a Program Change to switch the synth to another sound. Give `bankMsb` and `bankLsb` and a Bank Select (controllers 0 and 32) is sent first.

*Short name: `sendProgramChange`.*

```lua
ce.midi.sendProgramChange(1, 0)
```

#### `ce.midi.sendPitchBend(channel, value)`

Send pitch bend as a 14-bit number from 0 to 16383, where 8192 is the centre (no bend). How many semitones the full range covers is set on the synth.

*Short name: `sendPitchBend`.*

```lua
ce.midi.sendPitchBend(1, 8192)
```

#### `ce.midi.sendAftertouch(channel, pressure [, note])`

Send aftertouch (key pressure) for the whole channel, or for one note when `note` is given (polyphonic aftertouch).

*Short name: `sendAftertouch`.*

```lua
ce.midi.sendAftertouch(1, 64)
```

#### `ce.midi.sendClock()`

Send one MIDI clock tick (`0xF8`). There are 24 ticks per quarter note, so call it from a timer.

*Short name: `sendClock`.*

```lua
ce.midi.sendClock()
```

#### `ce.midi.sendTransport(action)`

Start, continue or stop a connected sequencer or drum machine: `action` is "start" (`0xFA`), "continue" (`0xFB`) or "stop" (`0xFC`).

*Short name: `sendTransport`.*

```lua
ce.midi.sendTransport("start")
```

#### `ce.midi.sendSysex(bytes)`

Send a System Exclusive (SysEx) message, given as a list of bytes or as hex text such as "F0 41 10 42 F7".

*Short name: `sendSysex`.*

```lua
ce.midi.sendSysex(bytes)
```

#### `ce.midi.checksum(type, bytes [, opts]) -> number`

Work out the checksum a synth expects at the end of a SysEx message. `type` is one of "sum-7bit", "roland-7bit" (also accepted as "roland" or "yamaha"), "ones-complement-7bit", "xor-7bit", "offset-7bit", "sum-8bit", "twos-complement-8bit", "crc8", "crc16-ccitt", "crc16-modbus" or "crc32". An unknown name returns nothing and prints the names it accepts. The 7-bit types fit in one SysEx byte; the CRC types do not, so split their result into bytes with to7bit before sending.

*Short name: `checksum`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `offset` | number | 0 | The constant the "offset-7bit" method subtracts from. Only that method reads it; the value varies by manufacturer. |

```lua
ce.midi.checksum("roland", bytes)
```

#### `ce.midi.panic([opts])`

Silence everything: sends All Sound Off (controller 120), All Notes Off (123) and Reset All Controllers (121). It covers all 16 channels unless you name one with `opts.channel`; set `opts.resetControllers` to false to leave controllers alone.

*Short name: `panic`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `channel` | number | all sixteen channels | Silence one channel instead of every one. |
| `resetControllers` | true or false | true | Whether to send Reset All Controllers (121) as well as the two note-off messages. Set false to leave pitch bend and modulation where they are. |

```lua
ce.midi.panic()
```

#### Helper functions in ce.midi

| Function | What it does |
|---|---|
| `ce.midi.to7bit(v, count, order)` | Split a number into `count` bytes of 7 bits each, the way SysEx carries large values: 2 bytes for values up to 16383, 3 for 21 bits, 4 for 28. `order` is "msb" (most significant byte first, the default) or "lsb". Short name: `to7bit`. |
| `ce.midi.from7bit(bytes, order)` | Join 7-bit bytes back into one number — the reverse of to7bit. `order` is "msb" (the default) or "lsb". Short name: `from7bit`. |
| `ce.midi.to14bit(v)` | Split a value from 0 to 16383 into its two 7-bit halves, returned as { msb, lsb }. Short name: `to14bit`. |
| `ce.midi.from14bit(msb, lsb)` | Join two 7-bit halves, `msb` and `lsb`, back into one value from 0 to 16383. Short name: `from14bit`. |
| `ce.midi.toNibbles(byte)` | Split a byte into its two 4-bit halves (nibbles), returned as { hi, lo }. Some synths send every byte this way. Short name: `toNibbles`. |
| `ce.midi.fromNibbles(hi, lo)` | Join two 4-bit halves, `hi` and `lo`, back into one byte. Short name: `fromNibbles`. |
| `ce.midi.nibblize(bytes)` | Split a whole list of bytes into nibbles, high half first, so the list comes back twice as long. Short name: `nibblize`. |
| `ce.midi.denibblize(bytes)` | Join a list of nibbles (high half first) back into bytes, so the list comes back half as long. Short name: `denibblize`. |
| `ce.midi.toAscii(str, length)` | Turn text, such as a patch name, into a list of character codes. Give `length` and the list is padded with spaces up to that length. Short name: `toAscii`. |
| `ce.midi.fromAscii(bytes)` | Turn a list of character codes back into text — for example a patch name read from a dump. Short name: `fromAscii`. |
| `ce.midi.toOffset(v, center)` | Encode a value that can go below zero by adding `center` to it — for example -64 to +63 sent as 0 to 127 with a centre of 64. Short name: `toOffset`. |
| `ce.midi.fromOffset(b, center)` | Decode an offset value by subtracting `center` — the reverse of toOffset. Short name: `fromOffset`. |
| `ce.midi.toSigned(v, bits)` | Turn a negative number into the form a synth uses for a signed value of `bits` bits (two's complement). Positive numbers come back unchanged. Use fromSigned to read one back. Short name: `toSigned`. |
| `ce.midi.fromSigned(b, bits)` | Read a signed value of `bits` bits (two's complement) back into an ordinary number, which may be negative. The reverse of toSigned. Short name: `fromSigned`. |

### ce.device: your synth

Working with the synth through its device profile — the description of the synth's parameters, messages and dumps that you build in the Device Profile Designer. With a profile you work in parameter names and real values, and the profile turns them into MIDI. These commands ask the synth for its settings, recall presets, read and change parameters by name, and describe a synth from a script when it has no profile. `role` picks which device to talk to when a panel uses more than one; it defaults to "mainSynth".

#### `ce.device.requestDump(kind [, fn [, opts]])`

Ask the synth to send a dump — all of a patch's settings in one message. `kind` is a dump the device profile knows, such as "patch" or "global", or one declared with defineDump. When the dump arrives, the bound controls are filled and onDumpReceived runs. Give `fn` and it is also called with `(values, info)`; `info.ok` is false when nothing arrived in time (3 seconds, unless `opts.timeout` says otherwise).

*Short name: `requestDump`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `timeout` | number (milliseconds) | 3000 | How long to wait for the reply before giving up and calling `fn` with info.ok = false. |

```lua
-- Lua
ce.device.requestDump("patch", function(values, info)
  if info.ok then  end
end)
```
```js
// JavaScript
ce.device.requestDump("patch", (values, info) => {
  if (info.ok) {  }
});
```

#### `ce.device.recallPreset(slot [, opts])`

Switch the synth to a stored preset, using whatever message the device profile says that synth needs: a Program Change, a Bank Select plus a Program Change, or a SysEx message. Returns { ok, error, slot, name, category, messages }. `slot` counts presets across all banks, as the device profile numbers them — it is not the MIDI program number. On a synth whose second bank starts at 64, slot 64 is that bank's first preset, whatever program number it uses.

*Short name: `recallPreset`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `role` | string | "mainSynth" | Which device to recall on, when the panel names more than one. |

```lua
ce.device.recallPreset(0)
```

#### `ce.device.preset([role])`

Describe the preset that is loaded now: { slot, program, name, category, bankId, bankLabel, writable, source }. Most synths do not announce their preset when they connect and cannot be asked, so this reports what the panel has seen — a Program Change arriving or a recallPreset going out. Until then `slot` is -1.

*Short name: `preset`.*

```lua
-- Lua
local p = ce.device.preset()
```
```js
// JavaScript
const p = ce.device.preset();
```

#### `ce.device.applyDump(bytes)`

Fill the panel from a dump. Give the raw bytes and the device profile decodes them and sets every bound control; give a table of parameter values (parameter id to value) and they are applied directly. Nothing is sent back to the synth.

*Short name: `applyDump`.*

```lua
ce.device.applyDump(bytes)
```

#### `ce.device.sendDump(kind)`

Build a dump from the panel's current values and send it to the synth.

*Short name: `sendDump`.*

```lua
ce.device.sendDump("patch")
```

#### `ce.device.buildDump(kind)`

Build a dump from the panel's current values and return its bytes without sending them — for example to store it or change it first.

*Short name: `buildDump`.*

```lua
-- Lua
local bytes = ce.device.buildDump("patch")
```
```js
// JavaScript
const bytes = ce.device.buildDump("patch")
```

#### `ce.device.profile([role])`

Describe the device profile in use for a device: { id, name, role, connected, ... }. Returns nothing when no profile is chosen. `role` names the device and defaults to "mainSynth".

*Short name: `deviceProfile`.*

```lua
-- Lua
local p = ce.device.profile()
if p then log("device " .. p.name) end
```
```js
// JavaScript
const p = ce.device.profile();
if (p) log("device " + p.name);
```

#### `ce.device.parameters([opts])`

List the synth's parameters as the device profile describes them, each as { id, name, group, type, min, max, access }. Use `opts` to narrow the list, for example to one group. Returns an empty list when there is nothing to show, and nothing at all only when the ce.device module is switched off.

*Short name: `deviceParameters`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `role` | text | the panel's current device | Which configured device to use, when the panel is set up for more than one. |
| `query` | text | — | Keep only parameters whose name or id contains this. |
| `group` | text | — | Keep only one group, the way the synth itself files them — "Oscillator", "Filter" and so on. |
| `type` | text | — | Keep only one kind of parameter, such as "number" or "choice". |
| `access` | text | — | Keep only parameters you can read, write, or both. |
| `limit` | number | no limit | Return at most this many. Useful on a synth with hundreds. |

```lua
-- Lua
for _, p in ipairs(ce.device.parameters({ group = "Filter" })) do
  log(p.id .. " " .. p.name)
end
```
```js
// JavaScript
for (const p of ce.device.parameters({ group: "Filter" })) log(p.id + " " + p.name);
```

#### `ce.device.parameter(id [, role])`

Describe one of the synth's parameters by its id, or return nothing if the device profile has no such parameter. Use it to check whether a synth has something before you try to change it.

*Short name: `deviceParameter`.*

```lua
-- Lua
local p = ce.device.parameter("cutoff")
if p then log("max " .. tostring(p.max)) end
```
```js
// JavaScript
const p = ce.device.parameter("cutoff");
if (p) log("max " + p.max);
```

#### `ce.device.read(id [, role]) -> value`

The last value the synth reported for a parameter, from a dump or a parameter message. Not a live query of the synth: it does not ask the synth anything. Returns nothing if the synth has never reported that parameter, which is different from 0.

*Short name: `deviceRead`.*

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

#### `ce.device.write(id, value [, role]) -> boolean`

Change a parameter on the synth by its id, without needing a control for it. The device profile builds the right message. `value` is in the parameter's own units — the ones deviceParameter gives min and max for. Returns whether the message was dispatched, not whether the synth accepted it.

*Short name: `deviceWrite`.*

```lua
-- Lua
ce.device.write("cutoff", 64)
```
```js
// JavaScript
ce.device.write("cutoff", 64);
```

#### `ce.device.connected([role])`

Check whether a device is connected and ready. It is quick to call, and the right thing to check before asking for a dump.

*Short name: `deviceConnected`.*

```lua
-- Lua
if ce.device.connected() then requestDump("patch") end
```
```js
// JavaScript
if (ce.device.connected()) requestDump("patch");
```

#### `ce.device.defineParameter(id, spec [, role]) -> boolean`

Describe a synth parameter from your script, for a synth that has no device profile, or to correct one parameter in a profile that has it wrong. `spec` must say how the parameter travels over MIDI — { cc = 74 }, { nrpn = { msb, lsb } } or { sysex = { … } } — and may add a name, group, type, min and max. A spec with no MIDI form is refused, with a message saying why. In a SysEx template you can use hex bytes, $value, $deviceId, any $name from `variables`, $checksumStart and $checksum.

*Short name: `deviceDefineParameter`.*

**`spec`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `name` | text | the id | What to call it in the parameter list. |
| `group` | text | — | Which group to file it under, such as "Filter". |
| `type` | text | "number" | What kind of value it holds — a number, or a choice from `choices`. |
| `min` | number | 0 | The lowest value it accepts. |
| `max` | number | 127 | The highest value it accepts. |
| `access` | text | "readwrite" | Whether the synth lets you read this parameter, write it, or both. |
| `choices` | list of text | — | The names of the settings, in order, when the parameter is a choice rather than a number. |
| `cc` | number | — | Send it as this CC number. The simplest of the three wire formats. |
| `nrpn` | object | — | Send it as an NRPN, as { msb, lsb }. |
| `sysex` | list | — | Send it as a SysEx message built from this template. Entries are hex literals or one of the tokens $value, $deviceId, $checksumStart, $checksum, or any $name you listed in `variables`. |
| `channel` | number | the panel's channel | The MIDI channel to send on. |
| `encoding` | text | — | How the number is packed into bytes when one byte is not enough — the same names ce.midi's encoders use. |
| `checksum` | text | — | Which checksum to compute for a SysEx template that asks for one. The names are ce.midi.checksum's. |
| `variables` | object | — | Extra named values your SysEx template can refer to as $name, such as an address or a part number. |

```lua
-- Lua
ce.device.defineParameter("cutoff", { name = "Cutoff", group = "Filter", min = 0, max = 127, cc = 74 })
```
```js
// JavaScript
ce.device.defineParameter("cutoff", { name: "Cutoff", group: "Filter", min: 0, max: 127, cc: 74 });
```

#### `ce.device.defineDump(kind, spec [, role]) -> boolean`

Describe a SysEx dump layout from your script: `request` (the bytes that ask for it), `match` (the start and end bytes that recognise it), `offset` and `size` (where the values sit), an optional `checksum`, and `fields` — one { parameter, offset } for each value. Every field must name a parameter already described with defineParameter. Once declared, an arriving dump of this layout fills the bound controls and runs onDumpReceived, just like a dump from a device profile.

*Short name: `deviceDefineDump`.*

**`spec`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `name` | text | the kind | What to call this dump where it is listed. |
| `request` | text or list | — | The bytes that ask the synth for it. |
| `match` | object | required | How to recognise the reply, as { prefix, suffix } — the bytes a matching message starts and ends with. |
| `offset` | number | 0 | How many bytes in from the start of the message the values begin. |
| `size` | number | whatever is left | How many bytes of values there are. |
| `checksum` | text | — | Which checksum the message carries, so it can be verified. The names are ce.midi.checksum's. |
| `fields` | list of objects | required | Where each value sits among those bytes, one { parameter, offset } per value. Every parameter must already be declared with defineParameter; an unknown name is refused. |

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

#### `ce.device.bind(control, parameterId [, opts]) -> boolean`

Connect a control to a synth parameter from your script, so moving the control changes the parameter. It replaces any existing connection on the same port rather than adding a second one, and switches the control's device binding back on if it was off. The port defaults to "value".

*Short name: `deviceBind` · Panel window only.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `role` | text | the panel's current device | Which configured device to use, when the panel is set up for more than one. |
| `port` | text | "value" | Which part of the control is wired up. Binding again on the same port replaces the old binding rather than adding a second one. |

```lua
-- Lua
ce.device.bind("cutoffKnob", "cutoff")
```
```js
// JavaScript
ce.device.bind("cutoffKnob", "cutoff");
```

#### `ce.device.unbind(control [, port]) -> boolean`

Disconnect a control from its synth parameter. Returns whether there was a connection to remove.

*Short name: `deviceUnbind` · Panel window only.*

```lua
-- Lua
ce.device.unbind("cutoffKnob")
```
```js
// JavaScript
ce.device.unbind("cutoffKnob");
```

#### `ce.device.ports([opts]) -> list`

List the MIDI ports, each as { id, name, direction, type, hardware, role }. `hardware` is false for the two entries the app always shows ("No MIDI Input" and "Preview Only"); `role` names the device currently using the port, or is empty. Set `opts.direction` to "in" or "out" to list only one kind.

*Short name: `devicePorts`.*

**`opts`** can contain:

| Name | Type | What it is |
|---|---|---|
| `direction` | text | List only the ports that receive, or only the ones that send. One of "in" or "out". |

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

#### `ce.device.variables([role]) -> table`

The values the device profile fills into its messages — `channel`, `deviceId` and any others the profile has — with this project's own settings applied. Returns nothing when no profile is chosen for the device.

*Short name: `deviceVariables`.*

```lua
-- Lua
log("device id " .. tostring(ce.device.variables().deviceId))
```
```js
// JavaScript
log(`device id ${ce.device.variables().deviceId}`);
```

#### `ce.device.setVariable(name, value [, role]) -> boolean`

Change one of the values the device profile fills into its messages, from 0 to 127 — for example the device id, to talk to a second unit of the same synth. The change is saved with this project only; the shared device profile is not changed, so two panels can use different device ids for the same synth. Some values are limited further (a channel is 1 to 16).

*Short name: `deviceSetVariable`.*

```lua
-- Lua
ce.device.setVariable("deviceId", 17)
```
```js
// JavaScript
ce.device.setVariable("deviceId", 17);
```

#### `ce.device.timing([role]) -> table`

How fast the panel may send to this device: `minDelayBetweenMessagesMs` and any other timing the device profile sets, with this project's own settings applied.

*Short name: `deviceTiming`.*

```lua
-- Lua
log("gap " .. tostring(ce.device.timing().minDelayBetweenMessagesMs) .. " ms")
```
```js
// JavaScript
log(`gap ${ce.device.timing().minDelayBetweenMessagesMs} ms`);
```

#### `ce.device.setTiming(name, ms [, role]) -> boolean`

Change one timing setting for this project, in milliseconds from 0 to 60000 — for example to slow the panel down for a synth that cannot keep up. Like deviceSetVariable, this does not change the device profile itself.

*Short name: `deviceSetTiming`.*

```lua
-- Lua
ce.device.setTiming("minDelayBetweenMessagesMs", 40)
```
```js
// JavaScript
ce.device.setTiming("minDelayBetweenMessagesMs", 40);
```

#### `ce.device.coverage([feature [, role]]) -> table|string`

What the device profile says it supports, as words rather than true/false. With no `feature`, returns the whole list — `singleParameterWrite`, `realtimeEditing`, `editBufferDumpParse` and so on. Profiles answer "complete", "partial" or "notImplemented", and sometimes something more specific, so check for the words you care about.

*Short name: `deviceCoverage`.*

```lua
-- Lua
if ce.device.coverage("singleParameterWrite") == "complete" then log("write one at a time") end
```
```js
// JavaScript
if (ce.device.coverage("singleParameterWrite") === "complete") log("write one at a time");
```

#### `ce.device.recipes([role]) -> list`

The names of the message templates this device profile can build — the formats its parameters are sent in. An empty list when no profile is chosen.

*Short name: `deviceRecipes`.*

```lua
-- Lua
for _, id in ipairs(ce.device.recipes()) do log(id) end
```
```js
// JavaScript
for (const id of ce.device.recipes()) log(id);
```

#### `ce.device.requests([role]) -> list`

The names of the requests this device profile can send, such as an identity request or an edit-buffer request. Check here before assuming a synth supports one.

*Short name: `deviceRequests`.*

```lua
-- Lua
for _, id in ipairs(ce.device.requests()) do log(id) end
```
```js
// JavaScript
for (const id of ce.device.requests()) log(id);
```

### ce.music: notes, scales and chords

Helper functions for notes and harmony: note names and numbers, scales, chords, keeping a note in key, and building arpeggios. They only calculate — nothing is sent anywhere.


#### Helper functions in ce.music

| Function | What it does |
|---|---|
| `ce.music.name(n [, flats])` | Turn a MIDI note number into a name: 60 gives "C4" (middle C). With `flats` left out, you get plain text with # for sharps ("C#4"), which is easy to type and compare against. Pass `flats` to get the panel's own spelling instead: true gives flats ("D♭4") and false gives sharps ("C♯4"). `ce.music.spelling()` tells you which one a key uses. Short name: `noteName`. |
| `ce.music.number(name) -> number` | Turn a note name into a MIDI note number: "C4" gives 60 (middle C is C4). Sharps and flats can be typed either way, so "C#4", "C♯4", "Db4" and "D♭4" all work. The letter must be a capital and the octave must be there. A name it cannot read returns nothing rather than 0, because 0 is a real note (C-1). Short name: `noteNumber`. |
| `ce.music.scale(root [, scale]) -> list` | One octave of a scale, rising from `root`: seven notes for most scales, five for the pentatonics and six for blues, without repeating the root at the top. `root` can be a note number or a name such as "C4". `scale` defaults to "major" and can be "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" or "blues". A name it does not know returns nothing. Short name: `scaleNotes`. |
| `ce.music.chord(root [, type]) -> list` | The notes of a named chord, rising from `root`: a fixed shape such as a D minor 7, not something built from a key. `type` defaults to "major"; the types are major, minor, dim, aug, sus2, sus4, power, maj6, min6, dom7, maj7, min7, minMaj7, dim7, m7b5, aug7, add9, dom9, maj9 and min9. An unknown type returns nothing. To build a chord on a step of a key, use `ce.music.degreeChord()`. Short name: `chordNotes`. |
| `ce.music.quantize(note, root [, scale]) -> number` | Move a note to the nearest note of a scale, looking both up and down; when two scale notes are equally close, it goes up. A note already in the scale comes back unchanged. `scale` defaults to "major" and takes the same names as `ce.music.scale()`; an unknown name returns nothing. Short name: `quantizeNote`. |
| `ce.music.spelling(root [, scale]) -> boolean` | Whether a key writes its sharps and flats as flats: true for F, B♭, E♭, A♭, D♭ and G♭. A minor-type scale is judged by the major key a minor third above its root, so C minor spells E♭ and A♭ rather than D♯ and G♯. Pass the result to `ce.music.name()` so your labels match the panel's. An unknown scale returns nothing. Short name: `noteSpelling`. |
| `ce.music.inScale(note, root [, scale]) -> boolean` | Whether a note belongs to a key, in any octave: C2 and C5 both count as the tonic of C. `scale` defaults to "major"; an unknown name returns nothing. Short name: `inScale`. |
| `ce.music.degree(note, root [, scale]) -> number` | Which step of the key a note is: 1 for the tonic, 5 for the dominant. A note outside the key returns nothing rather than the nearest step; use `ce.music.quantize()` first if you want to pull it into the key. `scale` defaults to "major"; an unknown name returns nothing. Short name: `scaleDegree`. |
| `ce.music.degreeChord(root, scale, degree [, size]) -> table` | The chord a key builds on one of its steps, by stacking every other note of the scale. Steps count from 1, so `ce.music.degreeChord(60, "major", 5)` is the chord on the fifth, G major. `size` is the number of notes: 3 for a triad (the default), 4 for a seventh chord. Returns a table with the `notes`, their `names`, the chord `name` spelled the way the key spells it (such as "E♭m7"), its `quality` and its `roman` numeral. An unknown scale returns nothing. For a chord you already know by name, use `ce.music.chord()`. Short name: `degreeChord`. |
| `ce.music.quality(notes) -> string` | Name a chord from its notes: [60, 63, 70] gives "min7". It reads the intervals above the lowest note, so put the root at the bottom: an inverted chord is named from its bass note. The possible names are maj, min, dim, aug, sus2, sus4, maj7, dom7, min7, minMaj7, dim7 and m7b5, the same ones the Chord Pad uses. Note that these say maj and min where `ce.music.chord()` says major and minor, and that a chord it cannot place, such as a bare fifth, comes back as maj. Returns nothing for an empty list. Short name: `chordQuality`. |
| `ce.music.lead(notes, previous [, mode]) -> list` | Rearrange a chord so it moves as little as possible from the chord before it, the way the Harmoniser leads its voices. `mode` "closest" (the default) keeps the total movement of all the notes smallest; "smooth" keeps the top note as still as possible and lets the inner notes jump; "off" just returns the notes sorted from low to high. With no previous chord, the notes also come back sorted but otherwise unchanged. Short name: `voiceLead`. |
| `ce.music.octaves(notes [, octaves]) -> list` | Repeat a set of notes in the octaves above, the way the Arpeggiator spreads its notes before playing them; it is the step before `ce.music.arp()`. The notes are sorted low to high, then repeated 12 semitones higher for each extra octave. `octaves` runs from 1 to 4 and defaults to 1. Notes that would go above 127 are left out, not squeezed onto 127. Short name: `expandOctaves`. |
| `ce.music.arp(notes, pattern) -> list` | The order an arpeggiator pattern plays the notes in, as a list of steps. Each step is itself a list of notes, so "chord" (everything at once, in one step) has the same shape as the others. Patterns: up, down, updown, downup, asPlayed, random, chord. Notes are used in the order you give them, so sort them first for a rising run. "updown" and "downup" do not repeat the top and bottom notes at the turn. "random" returns the notes in the order given, as the panel's arpeggiator does, because it picks each step as it plays; for a shuffled order use `ce.math.shuffle()`. Short name: `arpOrder`. |

### ce.time: timers and musical time

Timers, and the musical clock. A timer runs your code later or repeatedly; the musical commands read the tempo and the song position, convert between beats and milliseconds, and help you step a sequence in time. Musical timing here is accurate to about a thirtieth of a second: right for lights, displays and stepping patterns, not for timing audio.

#### `ce.time.startTimer(id, ms)`

Start a repeating timer called `id` that fires every `ms` milliseconds. Each time it fires, your `onTimer` handler runs with `info.id` set to that name, until you call `ce.time.stopTimer()` with the same `id`. Starting an `id` that is already running restarts it with the new interval, and turns a `ce.time.syncTimer()` timer of that name into a plain millisecond one.

*Short name: `startTimer`.*

```lua
ce.time.startTimer("id", 250)
```

#### `ce.time.after(ms, fn) -> id`

Run `fn` once, `ms` milliseconds from now. Returns an id you can pass to `ce.time.stopTimer()` to cancel it before it runs.

*Short name: `after`.*

```lua
-- Lua
ce.time.after(250, function()
  …
end)
```
```js
// JavaScript
ce.time.after(250, function () {
  …
});
```

#### `ce.time.stopTimer(id)`

Stop a timer started with `ce.time.startTimer()` or `ce.time.syncTimer()`, or cancel a `ce.time.after()` before it runs. Stopping an id that is not running does nothing and is not an error.

*Short name: `stopTimer`.*

```lua
ce.time.stopTimer("id")
```

#### `ce.time.tempo()`

Return the current tempo in beats per minute, or nothing if nothing is supplying a tempo. Read it rather than assuming 120.

*Short name: `tempo`.*

```lua
-- Lua
local bpm = ce.time.tempo() or 120
```
```js
// JavaScript
const bpm = ce.time.tempo() ?? 120;
```

#### `ce.time.playing()`

Return true while the transport is running. Returns false when it is stopped, and also when nothing is supplying a transport at all.

*Short name: `isPlaying`.*

```lua
-- Lua
if ce.time.playing() then  end
```
```js
// JavaScript
if (ce.time.playing()) {  }
```

#### `ce.time.transport()`

Return everything about the transport in one table: `playing`, `bpm`, `beats`, `bar`, `beat`, `beatsPerBar`, `source` and `valid`. `beats` counts quarter notes from the very start (bar 1, beat 1), and `bar` and `beat` count from 1, as musicians do. `source` says what is driving the clock. If `valid` is false, nothing is supplying a position and the other values are only defaults, not real readings.

*Short name: `transportInfo`.*

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

#### `ce.time.beatsToMs(beats [, bpm])`

Convert a number of beats to milliseconds at the current tempo, or at `bpm` if you give one. Returns nothing if there is no tempo to work from.

*Short name: `beatsToMs`.*

```lua
-- Lua
set("delayTime", ce.time.beatsToMs(0.75))
```
```js
// JavaScript
set("delayTime", ce.time.beatsToMs(0.75));
```

#### `ce.time.msToBeats(ms [, bpm])`

Convert a length of time in milliseconds to beats (quarter notes) at the current tempo, or at `bpm` if you give one — the reverse of `ce.time.beatsToMs()`. Returns nothing if there is no tempo to work from.

*Short name: `msToBeats`.*

```lua
-- Lua
local beats = ce.time.msToBeats(500)
```
```js
// JavaScript
const beats = ce.time.msToBeats(500);
```

#### `ce.time.syncTimer(id, beats [, opts])`

Start a repeating timer whose interval is measured in beats rather than milliseconds: `ce.time.syncTimer("step", 0.25)` fires every sixteenth note. It works like `ce.time.startTimer()` — your `onTimer` handler runs each time, and `ce.time.stopTimer()` stops it. When the tempo changes, the interval changes with it; the timer restarts from that moment, so it does not stay lined up with its earlier ticks. Set `opts.follow` to false to keep the interval fixed at the tempo it started with. If there is no tempo to work from, no timer starts and a note is written to the script console.

*Short name: `syncTimer`.*

```lua
-- Lua
ce.time.syncTimer("step", 0.25)
```
```js
// JavaScript
ce.time.syncTimer("step", 0.25);
```

#### `ce.time.afterBeats(beats, fn) -> id`

Run `fn` once after a number of beats: `ce.time.afterBeats(2, fn)` runs it two beats from now. The delay is worked out from the tempo at the moment you call it, so a later tempo change does not move it. Returns an id you can pass to `ce.time.stopTimer()` to cancel. If there is no tempo to work from, nothing is scheduled — `fn` does not run straight away either — and a note is written to the script console.

*Short name: `afterBeats`.*

```lua
-- Lua
ce.time.afterBeats(2, function()
  …
end)
```
```js
// JavaScript
ce.time.afterBeats(2, () => {
  …
});
```

#### `ce.time.timers() -> list`

List the ids of the repeating timers that are running — the ones started with `ce.time.startTimer()` or `ce.time.syncTimer()` — in sorted order. One-off timers from `ce.time.after()` and `ce.time.afterBeats()` are not listed; you already have their ids from when you started them.

*Short name: `runningTimers`.*

```lua
-- Lua
for _, id in ipairs(ce.time.timers()) do log(id) end
```
```js
// JavaScript
for (const id of ce.time.timers()) log(id);
```

#### `ce.time.now() -> number`

Return a clock reading in milliseconds, for timing things. A single reading means nothing on its own: subtract an earlier reading to find how much time has passed. It is not the time of day or a date, and it does not jump when the computer's clock is changed.

*Short name: `nowMs`.*

```lua
-- Lua
local t0 = ce.time.now()
```
```js
// JavaScript
const t0 = ce.time.now();
```

#### `ce.time.division(name) -> number`

Return how many beats a note division lasts: "1/16" is 0.25, "1/8T" is 0.333… and "1/4D" is 1.5. These are the same names the sequencer components use for their division settings. Returns nothing for a name it does not recognise.

*Short name: `beatsPerDivision`.*

```lua
-- Lua
local beats = ce.time.division("1/16")
```
```js
// JavaScript
const beats = ce.time.division("1/16");
```

#### `ce.time.divisions() -> list`

List every note division available, in the order a division menu shows them. Each entry has an `id` such as "1/16", a display `label` such as "16th", and its length in `beats`. Build your menus from this list instead of typing the names in by hand.

*Short name: `divisionNames`.*

```lua
-- Lua
for _, d in ipairs(ce.time.divisions()) do log(d.label) end
```
```js
// JavaScript
for (const d of ce.time.divisions()) log(d.label);
```

#### `ce.time.position(beats [, beatsPerBar]) -> table`

Turn a position in beats into bars, beats and ticks — for any position, not only where the transport is now. Returns `bar`, `beat`, `tick` and `text`. Bars and beats count from 1, and `tick` splits each beat into 24 parts (0 to 23), the same resolution as MIDI clock. `text` is written the way the Transport component displays it, such as "3.2.00". `beatsPerBar` defaults to 4.

*Short name: `barBeatAt`.*

```lua
-- Lua
log(ce.time.position(transportInfo().beats).text)
```
```js
// JavaScript
log(ce.time.position(transportInfo().beats).text);
```

#### `ce.time.step(beats, division) -> number`

Return which step of a note grid a position falls on — with `division` set to "1/16", for example, which sixteenth note. Steps count from 0 at the very start (bar 1, beat 1). Returns nothing if `division` is not a name it recognises.

*Short name: `stepAt`.*

#### `ce.time.steps(from, to, division [, max]) -> table`

Find the grid steps that start between two positions — after `from`, up to and including `to`. Returns `steps`, a list of the step numbers, and `dropped`, how many were left out. Use it to catch up on steps that went by between two updates, so a late update does not skip any. `max` limits how many are returned (16 by default); if more were crossed, the most recent ones are kept and the rest are counted in `dropped`. Returns nothing for an unknown division.

*Short name: `stepsBetween`.*

#### `ce.time.swing(step, amount, division) -> number`

Return how far to delay a step to give it swing, in beats — add it to the step's position. Even-numbered steps (0, 2, 4…) stay put and odd ones are pushed later by up to half a step: `amount` runs from 0 (straight) to 1 (half a step), the same number the Transport's swing setting holds. It uses the Transport's own swing calculation, so your timing matches the panel's sequencers. Returns nothing for an unknown division.

*Short name: `swingOffset`.*

#### `ce.time.cycle(beats, bars [, beatsPerBar]) -> table`

Find where a position falls within a cycle that repeats every `bars` bars (0.25 to 64). Returns `phase`, how far through the current cycle you are, from 0 to 1; `count`, how many whole cycles have finished; and `length`, the cycle's length in beats. It is worked out fresh from the position each time rather than added up as it goes, so it does not drift, even after hours.

*Short name: `cycleAt`.*

#### `ce.time.looped(beats, startBeats, lengthBeats) -> table`

Map a position on the timeline into a loop that starts at `startBeats` and lasts `lengthBeats`. Returns `beats`, the position inside the loop, and `pass`, which time round the loop you are on, counting from 0. Positions before the loop start come back unchanged with `pass` set to -1, so a count-in or lead-in works. When `pass` changes, the loop has just wrapped round. Like `ce.time.cycle()`, it is worked out fresh from the position each time, so it does not drift over long runs.

*Short name: `loopedBeats`.*

#### `ce.time.tap(times [, resetMs]) -> number`

Work out a tempo from a list of tap times, in milliseconds as `ce.time.now()` gives them. Only the taps since the last pause count: a gap longer than `resetMs` (2000 by default) starts a new measurement, so taps after a break are not averaged with the ones before it. Returns nothing if there are fewer than two usable taps. The result is kept between 20 and 300 bpm.

*Short name: `tapTempo`.*

#### `ce.time.clockTempo(intervalsMs) -> number`

Work out the tempo from the gaps between incoming MIDI clock pulses, which arrive 24 times per beat — for example the times between `0xF8` messages you collected with `ce.midi.interceptIn()`. It uses the middle value of the gaps (the median), so one late pulse does not throw the result off. Returns nothing from an empty list. The result is kept between 20 and 300 bpm.

*Short name: `clockTempo`.*

## Commands: Working out values

Value and range arithmetic, and moving a value over time.

### ce.math: numbers, ranges and colours

Helper functions for working out values: scaling a value from one range to another, curves, snapping, decibels, random numbers you can repeat, and colours. They only calculate — nothing changes on the panel until you pass the result to `set`.

#### `ce.math.lighten(colour [, amount]) -> string`

Make a colour lighter. `amount` runs from 0 (unchanged) to 1 (white) and defaults to 0.4. Returns nothing if the colour cannot be read.

*Short name: `lighten`.*

#### `ce.math.darken(colour [, amount]) -> string`

Make a colour darker. `amount` is how much of the colour's brightness to keep: 1 leaves it unchanged, 0 makes it black, and the default is 0.55. This runs the opposite way to `ce.math.lighten()`, where a bigger `amount` means a bigger change. Returns nothing if the colour cannot be read.

*Short name: `darken`.*

#### `ce.math.mix(a, b, t) -> string`

Blend two colours: `t` of 0 gives `a`, 1 gives `b`, and 0.5 the colour halfway between. Red, green and blue are each blended in a straight line, which suits something like a meter fading from green to red. `t` is held inside 0 to 1. Returns nothing if either colour cannot be read.

*Short name: `mixColour`.*

#### `ce.math.alpha(colour, a) -> string`

Give a colour a transparency, ready to store in a control's colour property. `a` runs from 0 (fully transparent) to 1 (fully solid). The result is in the panel's own stored form, AARRGGBB with no leading #, which makes this the one colour command that does not return "#RRGGBB". Take care: the web's `#RRGGBBAA` form holds the same four bytes in the opposite order, so the two cannot be swapped for each other. To make something you draw see-through, use `ce.draw.opacity()` instead. Returns nothing if the colour cannot be read.

*Short name: `colourAlpha`.*

#### `ce.math.rgb(colour) -> table`

Split a colour into its red, green and blue parts, returned as { r, g, b } with each from 0 to 255. Returns nothing if the colour cannot be read.

*Short name: `hexToRgb`.*

#### `ce.math.hex(r, g, b) -> string`

Build a colour from red, green and blue parts, each from 0 to 255, and return it as "#RRGGBB". A part outside that range is held at 0 or 255 rather than wrapping round, and fractions are rounded.

*Short name: `rgbToHex`.*

#### `ce.math.hsl(colour) -> table`

Describe a colour as { h, s, l }: hue from 0 to 360, and saturation and lightness from 0 to 100, the same ranges the colour editor uses. The numbers are not rounded. A grey has hue 0 and saturation 0. Returns nothing if the colour cannot be read.

*Short name: `hexToHsl`.*

#### `ce.math.fromHsl(h, s, l) -> string`

Build a colour from hue (0 to 360), saturation and lightness (0 to 100) and return it as "#RRGGBB". The reverse of `ce.math.hsl()`.

*Short name: `hslToHex`.*

#### Helper functions in ce.math

| Function | What it does |
|---|---|
| `ce.math.scale(v, inLo, inHi, outLo, outHi)` | Map a value from one range to another: `v` at `inLo` gives `outLo`, at `inHi` gives `outHi`, and everything between follows a straight line. It does not clamp, so a value outside the input range lands outside the output range; use `ce.math.norm()` and `ce.math.denorm()` when the result must stay inside. If `inLo` equals `inHi`, it returns `outLo`. Short name: `scale`. |
| `ce.math.clamp(v, lo, hi)` | Keep a value inside a range: anything below `lo` becomes `lo`, anything above `hi` becomes `hi`, and anything in between comes back unchanged. Short name: `clamp`. |
| `ce.math.round(v)` | Round to the nearest whole number. A half rounds up, so 2.5 gives 3 and -2.5 gives -2. To keep some decimal places, use `ce.math.roundTo()`. Short name: `round`. |
| `ce.math.snap(v, step)` | Round a value to the nearest multiple of `step`: `ce.math.snap(37, 10)` gives 40. A `step` of 0 leaves the value unchanged. For steps that are not evenly spaced, use `ce.math.quantize()`. Short name: `snap`. |
| `ce.math.curve(v, shape)` | Bend a 0 to 1 value with a named response curve: "linear", "exp", "log" or "s". An unknown name prints a note to the console and is treated as "linear". For a curve of your own, use `ce.math.map()`; for the curves the panel's Envelopes use, use `ce.math.shape()`. Short name: `curve`. |
| `ce.math.lerp(a, b, t)` | Blend between two numbers: `t` of 0 gives `a`, 1 gives `b`, and 0.5 the point halfway between. `t` is not held inside 0 to 1, so values beyond either end carry on past `a` or `b`. For whole lists of numbers, use `ce.math.blend()`. Short name: `lerp`. |
| `ce.math.wrap(v, lo, hi)` | Wrap a value round into a range, so that going past the top starts again from the bottom: `ce.math.wrap(12, 0, 12)` gives 0 and `ce.math.wrap(-1, 0, 12)` gives 11. The result can equal `lo` but never `hi`. Use it for pitch classes, LFO phase and step numbers instead of your language's % operator, which treats negative numbers differently from language to language: the same expression gives 11 in Lua and -1 in JavaScript. Short name: `wrap`. |
| `ce.math.map(v, points)` | Map a value through a curve you draw as points joined by straight lines, given as {{x, y}, …}: `ce.math.map(v, {{0,0},{0.5,0.9},{1,1}})`. The points are sorted by x first. Below the first point or above the last, the value is held at that point's y rather than continuing the line. Two points with the same x make a step, and the later one wins. Short name: `mapCurve`. |
| `ce.math.quantize(v, values)` | Snap a value to the nearest entry in a list: `ce.math.quantize(9, {0, 8, 16})` gives 8. When the value sits exactly halfway between two entries, the lower one wins. An empty list returns the value unchanged. For evenly spaced steps, use `ce.math.snap()`. Short name: `quantizeTo`. |
| `ce.math.choice(values [, weights])` | Pick one entry from a list at random, using the script's seeded random numbers. With `weights`, each entry's chance is its weight divided by the total, so weights of {3, 1} make the first entry three times as likely as the second. A missing or negative weight counts as zero, and if every weight is zero each entry is equally likely. It uses exactly one random number either way, so adding weights does not change what later random calls return. Returns nothing for an empty list. Short name: `randomChoice`. |
| `ce.math.dbToGain(db)` | Convert decibels to a linear gain: 0 dB gives 1, and -6 dB gives about 0.5. Short name: `dbToGain`. |
| `ce.math.gainToDb(gain)` | Convert a linear gain to decibels: 1 gives 0 dB, and 0.5 gives about -6 dB. A gain of zero or less gives -144 dB (the floor of 24-bit audio) instead of minus infinity, and nothing comes back lower than that. Short name: `gainToDb`. |
| `ce.math.norm(v, lo, hi)` | Turn a value into its position within a range: 0 at `lo`, 1 at `hi`. Values outside the range are held at 0 or 1. The reverse is `ce.math.denorm()`. Short name: `norm`. |
| `ce.math.denorm(t, lo, hi)` | Turn a 0 to 1 position back into a value in a range: 0 gives `lo` and 1 gives `hi`. Positions outside 0 to 1 are held at the ends. The reverse of `ce.math.norm()`. Short name: `denorm`. |
| `ce.math.bipolar(t)` | Convert a 0 to 1 value to the -1 to +1 range: 0 becomes -1, 0.5 becomes 0 and 1 becomes +1. The reverse is `ce.math.unipolar()`. Short name: `bipolar`. |
| `ce.math.unipolar(v)` | Convert a -1 to +1 value to the 0 to 1 range: -1 becomes 0, 0 becomes 0.5 and +1 becomes 1. The reverse of `ce.math.bipolar()`. Short name: `unipolar`. |
| `ce.math.fold(v, lo, hi)` | Bounce a value back off the ends of a range instead of wrapping it: past `hi` it heads back down, and below `lo` it heads back up. Where `ce.math.wrap()` jumps from the top to the bottom, fold keeps the movement smooth, which suits modulation depths; wrap suits pitch classes. Short name: `fold`. |
| `ce.math.index(t, count)` | Turn a 0 to 1 position into a slot number, counting from 0, for `count` slots, for example to pick one of eight waveforms with a knob. At exactly 1 it returns the last slot, `count - 1`, rather than one past the end. Short name: `indexOfRange`. |
| `ce.math.crossfade(a, b, t [, law])` | Fade from `a` to `b` as `t` goes from 0 to 1, using one of the Crossfader component's three fade laws: "linear", "equalPower" or "sharp". `law` defaults to "linear". A linear fade between two sounds dips audibly in the middle; "equalPower" does not. Short name: `crossfade`. |
| `ce.math.approach(current, target, maxStep)` | Move `current` toward `target`, but by no more than `maxStep` in one call; once it is within `maxStep`, it lands exactly on the target. It keeps nothing between calls, so you can use it in any handler (say, each time an expression pedal sends a value) without running a timer. A `maxStep` of 0 jumps straight to the target. Short name: `approach`. |
| `ce.math.roundTo(v, decimals)` | Round to a number of decimal places: `ce.math.roundTo(3.14159, 2)` gives 3.14. Returns a number, not text, so you can keep calculating with it. Short name: `roundTo`. |
| `ce.math.almost(a, b [, epsilon])` | Check whether two numbers are equal to within `epsilon`, which defaults to a tiny 0.000000001. Use it instead of == on values that have been through `ce.math.scale()`, `ce.math.curve()` or similar arithmetic, where rounding can leave numbers that should match a hair apart. Short name: `almost`. |
| `ce.math.min(values)` | The smallest number in a list, or nothing if the list is empty. Short name: `minOf`. |
| `ce.math.max(values)` | The largest number in a list, or nothing if the list is empty. Short name: `maxOf`. |
| `ce.math.sum(values)` | The total of a list of numbers, or 0 if the list is empty. Short name: `sumOf`. |
| `ce.math.mean(values)` | The average of a list of numbers, or nothing if the list is empty. Short name: `meanOf`. |
| `ce.math.blend(fromList, toList, t) -> list` | Blend one list of numbers into another, entry by entry: `t` of 0 gives `fromList` and 1 gives `toList`, like a morph between two snapshots. Both arguments are lists; for two single numbers use `ce.math.lerp()`. If the lists differ in length, the result is as long as the shorter one: the extra entries are dropped, not blended toward zero. Short name: `blend`. |
| `ce.math.randomFloat(lo, hi)` | A random number with a fractional part, from `lo` up to but not including `hi`, taken from the script's seeded random numbers. With no arguments it runs from 0 to 1. `ce.math.random(lo, hi)` gives whole numbers; use this when you want fractions. Short name: `randomFloat`. |
| `ce.math.gaussian([mean, sd])` | A random number on a bell curve: most results land near `mean` (default 0), and `sd`, the standard deviation (default 1), sets how widely they spread, with about two thirds falling within one `sd` of `mean`. Good for humanising velocity or timing, where an even spread sounds mechanical. It always uses exactly two numbers from the seeded sequence, so replaying a seed stays in step. Short name: `randomGaussian`. |
| `ce.math.walk(current, step, lo, hi)` | Take one step of a random walk: returns `current` moved by a random amount of up to `step` in either direction. Feed the result back in each time for a line that drifts instead of jumping. At `lo` and `hi` the walk bounces back rather than sticking to the edge; leave them out for no limits. Uses the script's seeded random numbers. Short name: `randomWalk`. |
| `ce.math.chance([chance])` | Return true or false at random, from the script's seeded random numbers. `chance` is the probability of true, from 0 to 1, and defaults to 0.5: 0.25 gives true about one time in four. Handy as a probability gate on sequencer steps. Short name: `randomBool`. |
| `ce.math.shuffle(values)` | Return a new list with the same entries in random order; the original list is left alone. It uses the script's seeded random numbers, one for each entry after the first, so the same seed always shuffles the same way. Short name: `shuffle`. |
| `ce.math.degrees(radians)` | Convert an angle from radians to degrees, the unit `ce.draw` uses for arcs. Short name: `toDegrees`. |
| `ce.math.radians(degrees)` | Convert an angle from degrees to radians, the unit your language's own sin and cos expect. Short name: `toRadians`. |
| `ce.math.distance(x1, y1, x2, y2)` | The straight-line distance between two points. Handy for XY pads, joysticks and the Orbit, and for checking whether a click landed on something you drew with `ce.draw`. Short name: `distance`. |
| `ce.math.angle(x1, y1, x2, y2)` | The angle from the first point to the second, in the convention `ce.draw` uses: degrees from 0 to 360, with 0 at twelve o'clock and increasing clockwise. As on screen, y counts downwards, so a point straight above gives 0. Short name: `angleOf`. |
| `ce.math.polar(angle, radius)` | Turn an angle and a distance into { x, y } offsets from a centre point, using the same convention as `ce.math.angle()`: degrees, 0 at twelve o'clock, clockwise. Add the offsets to your centre to find, for example, the tip of a knob's pointer. Short name: `polar`. |
| `ce.math.shape(v, curve [, tension])` | Bend a 0 to 1 value with the curves the panel's Envelope segments and Router breakpoints use: "linear", "exp", "log", "scurve" ("s" also works) and "hold". This is a different family from `ce.math.curve()`. `tension` sets how strongly "exp" and "log" bend and defaults to 1.6, as in the app, so leaving it out (or passing 0) does not give a straight line. With `tension` at 1 it matches the curve a Macro slot uses, so `shape(v, curve, 1)` reproduces it. Short name: `shapeCurve`. |
| `ce.math.deadzone(v, amount [, invert])` | Add a dead zone to the bottom of a 0 to 1 value, the way the Expression Router shapes its input. Anything at or below `amount` becomes 0, and the rest is stretched to fill 0 to 1, so the response starts right at the edge of the dead zone instead of jumping up from it. Pass `invert` as true to flip the value first. Short name: `deadzone`. |
| `ce.math.weights(points, x, y [, power])` | Work out how much each anchor point counts at a position, the way a Timbre Space or Preset Constellation does: the closer an anchor is to `x`, `y`, the bigger its share. `points` is a list of { x, y } anchors, and `x` and `y` run from 0 to 1. Returns one weight per point, adding up to 1. `power` (default 2) sets how sharp the blend is: higher lets the nearest anchor take over sooner. Pass the result to `ce.math.blendBy()` to morph values. Short name: `weightsFor`. |
| `ce.math.blendBy(values, weights)` | A weighted average: each entry in `values` counts as much as its matching entry in `weights`, which is how a morph pad turns its weights into one value. The weights do not need to add up to 1, and if they add up to zero or less the result is 0. `ce.math.blend()` blends two lists; this combines many values into one. Short name: `blendBy`. |
| `ce.math.ticks(major [, minor])` | The positions of a slider's scale marks, from 0 to 1, as { major, minor } lists, the same ones the app draws. `major` is how many major marks there are, counting both ends (default 11); `minor` is how many smaller marks sit between each pair (default 0). Use it when you draw your own scale, so its marks line up with the app's. Short name: `tickStops`. |
| `ce.math.dbPosition(fraction [, floorDb, ceilDb])` | How far up a dB meter a level reaches, from 0 (bottom) to 1 (top). `fraction` is a linear level from 0 to 1; it is converted to decibels and placed between `floorDb` and `ceilDb`, which default to -60 and +6 like the Meter component. Short name: `dbPosition`. |
| `ce.math.smooth(current, target, coefficient [, epsilon])` | Move `current` part of the way toward `target`: `coefficient`, from 0 to 1, is the share of the remaining distance covered on each call, so the value moves quickly at first and eases in as it gets close. Once within `epsilon` (default 0.0001) it snaps to the target, so it actually arrives instead of creeping closer forever. Good for taming a jittery pedal or a noisy CC. For a fixed step size, use `ce.math.approach()`. Short name: `smooth`. |
| `ce.math.hysteresis(value, on, low, high)` | Turn a changing value into an on/off state that does not flicker. It switches on when `value` reaches `high`, switches off when it falls to `low`, and keeps its current state in between. Pass the current state as `on` and it returns the new one. With two thresholds, a value hovering around one line cannot flip the state back and forth. Electronics calls this a Schmitt trigger. Short name: `hysteresis`. |
| `ce.math.median(values)` | The middle value of a list, or the average of the two middle values when the count is even. Returns nothing for an empty list. Unlike an average, a single stray spike does not pull it off course. Short name: `median`. |
| `ce.math.euclid(steps, pulses [, rotation])` | A Euclidean rhythm: `pulses` hits spread as evenly as possible across `steps` steps (up to 64), returned as a list of true and false values. It is the same pattern the Arpeggiator uses for its rests. `rotation` shifts the pattern round without changing the spacing between hits. Short name: `euclid`. |
| `ce.math.unshape(y, curve [, tension])` | The reverse of `ce.math.shape()`: give it a value that has been through a curve, with the same `curve` and `tension`, and it returns the value from before the curve. Use it when a value comes back from the synth through a taper, so the control lands where it started. "hold" is a step with no true reverse, so it returns the earliest input that gives that output. Short name: `unshape`. |
| `ce.math.random([lo, hi])` | A random number from the script's seeded sequence. With no arguments, a fraction from 0 up to but not including 1. With `lo` and `hi`, a whole number from `lo` to `hi`, both included. The same seed replays the same sequence in every scripting language, in the editor and in the exported plugin. Short name: `random`. |
| `ce.math.seed(n)` | Set the seed for this script's random numbers, so the same seed replays the same sequence. A seed of 0 uses the default. Until you set one, every script starts from that same default, so its numbers repeat each time it loads. Every script has its own sequence, and so does every named stream, so this never affects another script. Short name: `randomSeed`. |
| `ce.math.stream(name, fn)` | Run `fn` with its random numbers taken from a separate, named sequence, so two generative parts of one script (a melody and a drum pattern, say) do not disturb each other's numbers or seeds. The script's normal sequence comes back when the block ends, even if it ends in an error. Streams belong to one script: two scripts using the same name get separate streams. Short name: `randomStream`. |

### ce.anim: smooth movement

Moving a value smoothly over time instead of jumping: to a target, with a spring, or through a shape you draw. Moves can wait, repeat, follow the tempo, and call you back when they finish. These keep working when the plugin window is closed, so they can also sweep a synth parameter.

#### `ce.anim.to(path, target [, opts])`

Move a value smoothly to `target` over time instead of jumping straight there. Pass a list of controls to move them all with one call; `opts.stagger` starts each one a little after the one before. Starting a new move on a value that is already animating replaces the old move, and the old one's `done` callback runs with `completed` set to false, because it was cancelled rather than finished.

*Short name: `animateTo`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `duration` | number (milliseconds) | 300 | How long the move takes. |
| `beats` | number | — | Length in beats instead of milliseconds. Overrides `duration` and follows the tempo. |
| `sync` | true or false | false | Follow the transport rather than the wall clock, so the move pauses when playback does. |
| `curve` | text or list | "linear" | The shape of the move. The first 4 names are the curves of `ce.math.curve()`; the rest are the easings the Animation tab offers, so a script and an animation that name the same curve move the same way. "spring" overshoots and settles like `ce.anim.spring()`, shaped by `damping` and `frequency`. Instead of a name you can give the four numbers of a custom curve — x1, y1, x2, y2, as the Animation tab shows them — so an animation's `bezier` can be passed straight in; x1 and x2 are kept between 0 and 1. A name it does not know is reported, and the move runs in a straight line. One of "linear", "exp", "log", "s", "inQuad", "outQuad", "inOutQuad", "inCubic", "outCubic", "inOutCubic", "inBack", "outBack", "inOutBack" or "spring". |
| `damping` | number | 6 | With curve = "spring": how quickly the wobble dies away, as ce.anim.spring reads it. |
| `frequency` | number | 12 | With curve = "spring": how fast it wobbles, as ce.anim.spring reads it. |
| `from` | number | — | Start from this value instead of wherever the control is now. |
| `delay` | number (milliseconds) | 0 | Wait this long before starting. |
| `stagger` | number (milliseconds) | 0 | When `path` is a list, offset each move after the first by this much, so they start in turn. |
| `repeat` | number | 1 | How many times to run it. 0 or less repeats until you stop it. |
| `pingpong` | true or false | false | On a repeat, run the move backwards every other time instead of jumping back to the start. |
| `done` | function | — | Called when the move ends: done(completed). `completed` is false if the move was stopped early. |

```lua
-- Lua
ce.anim.to("cutoff", 127, { duration = 500, curve = "s" })
```
```js
// JavaScript
ce.anim.to("cutoff", 127, { duration: 500, curve: "s" });
```

#### `ce.anim.spring(path, target [, opts])`

Move a value to `target` with a springy motion: it overshoots, wobbles and settles. `opts.damping` sets how quickly the wobble dies away and `opts.frequency` how fast it wobbles; the move lasts 600 ms unless you set `opts.duration`. Every other option `ce.anim.to()` takes works here too except `curve`, and you can pass a list of controls the same way.

*Short name: `animateSpring`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `duration` | number (milliseconds) | 600 | How long the move takes. |
| `damping` | number | 6 | How quickly the wobble dies away. Higher settles sooner; lower keeps bouncing. |
| `frequency` | number | 12 | How fast it wobbles. Higher is a tighter, faster bounce. |
| `from` | number | — | Start from this value instead of wherever the control is now. |
| `beats` | number | — | Length in beats instead of milliseconds. Overrides `duration` and follows the tempo. |
| `sync` | true or false | false | Follow the transport rather than the wall clock, so the move pauses when playback does. |
| `delay` | number (milliseconds) | 0 | Wait this long before starting. |
| `stagger` | number (milliseconds) | 0 | When `path` is a list, offset each move after the first by this much, so they start in turn. |
| `repeat` | number | 1 | How many times to run it. 0 or less repeats until you stop it. |
| `pingpong` | true or false | false | On a repeat, run the move backwards every other time instead of jumping back to the start. |
| `done` | function | — | Called when the move ends: done(completed). `completed` is false if the move was stopped early. |

```lua
-- Lua
ce.anim.spring("cutoff", 127)
```
```js
// JavaScript
ce.anim.spring("cutoff", 127);
```

#### `ce.anim.stop([path])`

Stop the animation on `path` and leave the value wherever it has got to. With no `path`, every animation on the panel stops. Any `done` callback runs with `completed` set to false. To jump to the end instead, use `ce.anim.finish()`.

*Short name: `animateStop`.*

```lua
-- Lua
ce.anim.stop("cutoff")
```
```js
// JavaScript
ce.anim.stop("cutoff");
```

#### `ce.anim.running([path])`

Return true if `path` is being animated right now; a paused animation still counts. With no `path`, return true if any animation is running.

*Short name: `animateRunning`.*

```lua
-- Lua
if not ce.anim.running("cutoff") then  end
```
```js
// JavaScript
if (!ce.anim.running("cutoff")) {  }
```

#### `ce.anim.envelope(path, points [, opts])`

Move a value through a shape with several points — an attack and decay, say, or a hold and then a fall — so it can rise and fall within one animation, which `ce.anim.to()` cannot do. `points` is a list of { x, y } points from 0 to 1, the same form the Envelope component uses: x is how far through the animation, y is the level. y = 0 means `opts.from` (default 0) and y = 1 means `opts.to` (default 1), so to sweep a 0–127 knob, set `opts.to` to 127. It needs at least two points; with fewer, nothing starts and a note is written to the script console.

*Short name: `animateEnvelope`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `from` | number | 0 | The value that y = 0 in the shape means. |
| `to` | number | 1 | The value that y = 1 in the shape means. |
| `duration` | number (milliseconds) | 300 | How long the move takes. |
| `beats` | number | — | Length in beats instead of milliseconds. Overrides `duration` and follows the tempo. |
| `sync` | true or false | false | Follow the transport rather than the wall clock, so the move pauses when playback does. |
| `delay` | number (milliseconds) | 0 | Wait this long before starting. |
| `repeat` | number | 1 | How many times to run it. 0 or less repeats until you stop it. |
| `pingpong` | true or false | false | On a repeat, run the move backwards every other time instead of jumping back to the start. |
| `done` | function | — | Called when the move ends: done(completed). `completed` is false if the move was stopped early. |

```lua
-- Lua
ce.anim.envelope("cutoff", { {x=0,y=0}, {x=0.1,y=1}, {x=0.4,y=0.6}, {x=1,y=0} }, { duration = 800, to = 127 })
```
```js
// JavaScript
ce.anim.envelope("cutoff", [{x:0,y:0},{x:0.1,y:1},{x:0.4,y:0.6},{x:1,y:0}], { duration: 800, to: 127 });
```

#### `ce.anim.value(path) -> table`

Describe the animation running on `path`. The table has `path`, `kind` ("to", "spring" or "envelope"), `value` (where it is now), `progress` (0 to 1), `from`, `to`, `elapsed`, `remaining`, `paused`, `cycle` and `sync`. Returns nothing if `path` is not animating. For an animation that follows the transport, `elapsed` and `remaining` are empty, because its timing depends on the transport rather than the clock.

*Short name: `animateValue`.*

#### `ce.anim.list() -> list`

List every running animation, sorted by path, each described the same way `ce.anim.value()` describes one.

*Short name: `animateList`.*

#### `ce.anim.pause(path)`

Hold an animation where it is without ending it; `ce.anim.resume()` carries on from the same point. Returns false if nothing is animating on `path` or it is already paused.

*Short name: `animatePause`.*

#### `ce.anim.resume(path)`

Carry on a paused animation from where `ce.anim.pause()` held it, rather than starting it again. Returns false if there is no paused animation on `path`.

*Short name: `animateResume`.*

#### `ce.anim.reverse(path)`

Turn a running animation round so it heads back to where it started, at the same speed — a move that was 80% done takes 80% of its time to get back. An envelope plays its shape backwards as well. Returns false if nothing is animating on `path`.

*Short name: `animateReverse`.*

#### `ce.anim.finish(path)`

End an animation by jumping straight to its end: the value lands exactly where the animation was heading, and `done` runs with `completed` set to true. To cancel instead and leave the value where it is, use `ce.anim.stop()`. Returns false if nothing is animating on `path`.

*Short name: `animateFinish`.*

#### `ce.anim.play(control, animation)`

Play one of a control's keyframe animations (the ones made in the Animation tab) right now, from its first frame — restarting it if it is already playing. Returns true if the control has a keyframe animation with that name; the name is not case-sensitive. A transition cannot be started this way, because it plays when its own trigger happens: asking for one returns false and writes a message to the script console listing the keyframe animations the control does have.

*Short name: `animatePlay` · Panel window only.*

## Commands: The panel itself

Creating and arranging controls, and saving things that outlive the session.

### ce.panel: building and arranging the panel

Changing the panel itself from a script: creating, copying and removing controls, finding them, lining them up, and editing the lists inside a control such as its states and animations. Most of these need the panel window; each entry says so. While you preview, everything a script changes is put back when the preview stops — `ce.panel.keep` is how you keep it.

#### `ce.panel.create(type, props)`

Create a new control of the given `type`, such as "Knob", and return its name, or nothing if there is no such type (`ce.panel.types()` lists them). `props` sets its name, position, size and container, and any section settings, such as { Behavior = { min = 0, max = 127 } }. If the name is taken, a number is added to make it unique, so use the name this returns. Controls a script creates are not saved with the panel and are cleared before each onPanelBuild, which is the place to create them.

*Short name: `panelCreate` · Panel window only.*

**`props`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `name` | text | one derived from the type | The control's name. Every other command addresses the control by this name. |
| `x` | number (pixels) | 0 | Distance from the left edge of whatever contains it. |
| `y` | number (pixels) | 0 | Distance from the top edge. |
| `width` | number (pixels) | the type's own | How wide to make it. |
| `height` | number (pixels) | the type's own | How tall to make it. |
| `parent` | text | the panel itself | The name of a container to put it inside. |
| `<section>` | object | — | Any section of the control, to set up as you create it — for example { Behavior = { min = 0, max = 127 } }. The section names are the ones set() uses. |

```lua
-- Lua
ce.panel.create("Knob", { name = "cutoff", x = 20, y = 40 })
```
```js
// JavaScript
ce.panel.create("Knob", { name: "cutoff", x: 20, y: 40 });
```

#### `ce.panel.clone(name, props)`

Copy an existing control, with all its settings, and return the copy's name, or nothing if there is no control of that name. The copy goes into the same container as the original and is called `<name>_copy` unless `props` names it; a number is added if that name is taken. `props` works as in `ce.panel.create()`, so you can move the copy or change its settings as you make it.

*Short name: `panelClone` · Panel window only.*

```lua
-- Lua
ce.panel.clone("template", { name = "copy", y = 120 })
```
```js
// JavaScript
ce.panel.clone("template", { name: "copy", y: 120 });
```

#### `ce.panel.destroy(name)`

Remove a control, together with everything inside it. Returns true if the control was there and has been removed, false if there was no such control. It works on any control: the ones you placed in the editor as well as the ones a script created.

*Short name: `panelDestroy` · Panel window only.*

```lua
-- Lua
ce.panel.destroy("name")
```
```js
// JavaScript
ce.panel.destroy("name");
```

#### `ce.panel.parent(name [, containerName])`

Move a control into a container, or back to the top level of the panel when `containerName` is left out. Returns true on success. A container is any control with a Children section, such as a Container or a Group. A control cannot be moved into itself or into one of the controls it contains.

*Short name: `panelParent` · Panel window only.*

```lua
-- Lua
ce.panel.parent("knob", "row")
```
```js
// JavaScript
ce.panel.parent("knob", "row");
```

#### `ce.panel.find([query])`

List the names of the controls that match `query`, including controls inside containers. `query` can be part of a name (capitals do not matter) or a table such as { type = "Knob", generated = true, parent = "row1" }, where `generated` picks out the controls a script created. With no query, it lists every control.

*Short name: `panelFind` · Panel window only.*

**`query`** can contain:

| Name | Type | What it is |
|---|---|---|
| `name` | text | Match controls whose name contains this. |
| `type` | text | Match one kind of control, such as "Knob". ce.panel.types() lists the spellings. |
| `generated` | true or false | Match only controls a script created, or only ones you placed by hand. |
| `parent` | text | Match only what is inside the container of this name. |

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

#### `ce.panel.info(name)`

Describe a control: { name, id, type, x, y, width, height, parent, generated }, or nothing if there is no such control. `x` and `y` are measured from the control's container; use `ce.panel.rect()` for its position on the panel. `generated` is true for a control a script created.

*Short name: `panelInfo` · Panel window only.*

```lua
-- Lua
local c = ce.panel.info("name")
```
```js
// JavaScript
const c = ce.panel.info("name");
```

#### `ce.panel.types()`

List the names of every control type `ce.panel.create()` accepts.

*Short name: `panelTypes` · Panel window only.*

```lua
-- Lua
log(table.concat(ce.panel.types(), ", "))
```
```js
// JavaScript
log(ce.panel.types().join(", "));
```

#### `ce.panel.align(names, edge [, opts]) -> number`

Line controls up on one edge or centre line: "left", "hCenter", "right", "top", "vCenter" or "bottom". By default they line up with the box around the whole group; `opts.to` names one of the listed controls to line up with instead. Returns how many controls it moved. Names that are not controls are reported and skipped.

*Short name: `panelAlign` · Panel window only.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `to` | text | the box the whole group occupies | Name one of the controls to line the others up on, instead of on the group as a whole. This is what the canvas calls the key object. |

```lua
-- Lua
ce.panel.align({ "knob1", "knob2" }, "left")
```
```js
// JavaScript
ce.panel.align(["knob1", "knob2"], "left");
```

#### `ce.panel.distribute(names, what [, opts]) -> number`

Space controls out evenly. "leftEdges", "hCenters", "rightEdges", "topEdges", "vCenters" and "bottomEdges" even out their positions; "hSpacing" and "vSpacing" even out the gaps between them, which suits controls of different sizes. The first and last controls stay where they are. With "hSpacing" or "vSpacing", `opts.gap` sets a fixed gap instead (the last control then moves too), and `opts.align` also lines them up the other way. Needs at least two controls; returns how many it moved.

*Short name: `panelDistribute` · Panel window only.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `gap` | number (pixels) | worked out from the space available | Force a fixed gap between the controls rather than spreading them to fill what is there. |
| `align` | text | — | Also line them up on this edge across the other axis, so a row ends up level as well as evenly spaced. Takes the same words as ce.panel.align. |

#### `ce.panel.match(names, what [, opts]) -> number`

Make controls the same size: "width", "height" or "both". The first name in the list sets the size, unless `opts.to` names another control from the list; that control keeps its own size and the others copy it. Needs at least two controls. Returns how many controls changed.

*Short name: `panelMatch` · Panel window only.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `to` | text | the first name you gave | Name the control whose size the others should copy. It is not resized itself. |

#### `ce.panel.grid(names [, opts]) -> number`

Arrange controls in a grid of equal cells, each as big as the largest control. They are placed in reading order (top to bottom, then left to right, with controls at about the same height, within roughly 20 pixels, counted as one row), not in the order you list them. The first control in that order stays where it is and the grid grows from there. Needs at least two controls; returns how many it moved.

*Short name: `panelGrid` · Panel window only.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `columns` | number | 3 | How many controls per row. |
| `gapX` | number (pixels) | 10 | The gap between columns. |
| `gapY` | number (pixels) | 10 | The gap between rows. |

```lua
-- Lua
ce.panel.grid(pads, { columns = 4, gapX = 8, gapY = 8 })
```
```js
// JavaScript
ce.panel.grid(pads, { columns: 4, gapX: 8, gapY: 8 });
```

#### `ce.panel.circle(names [, opts]) -> number`

Arrange controls evenly around a circle, centred on the middle of the box they currently fill, in the order you list them. Each control's centre sits on the circle. `opts.startAngle` is in degrees, with 0 at three o'clock and angles running clockwise, which differs from `ce.draw.arc()`, where 0 is twelve o'clock. Needs at least two controls; returns how many it moved.

*Short name: `panelCircle` · Panel window only.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `radius` | number (pixels) | 100 | How far from the centre to place each control. |
| `startAngle` | number (degrees) | 0 | Where the first control goes, clockwise from twelve o'clock. |

#### `ce.panel.flip(names, axis) -> number`

Mirror the positions of controls across the middle of the box they fill: "horizontal" swaps left and right, "vertical" swaps top and bottom. Only their positions change; the controls themselves are not turned or mirrored. Needs at least two controls; returns how many it moved.

*Short name: `panelFlip` · Panel window only.*

#### `ce.panel.rect(name) -> table`

Get a control's position on the panel: { x, y, width, height, right, bottom }. Unlike Transform.x and Transform.y, this includes the offset of any container the control sits in. Give a list of names to get the box around the whole group. Returns nothing if none of the names is a control.

*Short name: `panelRect` · Panel window only.*

#### `ce.panel.order(names, where) -> number`

Change which controls are drawn on top of which: "front", "forward", "backward" or "back". Controls only move among the others in the same container. Controls that come later in the panel are drawn over earlier ones, so "front" moves a control to the end of its container. Returns how many controls it moved.

*Short name: `panelOrder` · Panel window only.*

#### `ce.panel.batch(fn) -> boolean`

Run `fn` so that everything it changes is undone in a single step, which is useful when a script builds or rearranges a whole page. The changes appear together when `fn` finishes, though code inside `fn` already sees its own earlier changes. The undo step is closed even if `fn` fails with an error. `fn` must not wait: anything after an `await` is not part of the batch. In the exported plugin there is no undo, and `fn` simply runs.

*Short name: `panelBatch` · Panel window only.*

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

#### `ce.panel.keep([path]) -> boolean`

Keep a change made during preview. Preview is a rehearsal: when it stops, the panel goes back to how you built it, and anything a script changed is undone with it. `ce.panel.keep("Cutoff.Background.Fill.colour")` keeps one property; `ce.panel.keep()` with no path keeps everything this run changed. A control the script created cannot be kept, because the next run builds it again and keeping it would leave an extra copy every time. Returns false when nothing could be kept, including when the panel is not being previewed.

*Short name: `panelKeep` · Panel window only.*

```lua
ce.panel.keep("Cutoff.Background.Fill.colour")
```

#### `ce.panel.entries(control, section)`

List the names of the entries in one of a control's collection sections (States, Bindings, Animations, Parts, ValueChannels, Behaviors, HitZones, Generators, Links or Variants), in the order the control holds them. Any other section name is refused with a message listing the ones that work.

*Short name: `panelEntries` · Panel window only.*

```lua
-- Lua
for _, s in ipairs(ce.panel.entries("knob", "States")) do log(s) end
```
```js
// JavaScript
for (const s of ce.panel.entries("knob", "States")) log(s);
```

#### `ce.panel.entry(control, section, name)`

Get one entry from a collection section, or nothing if there is no entry of that name. Capitals in `name` do not matter, just as in a path.

*Short name: `panelEntry` · Panel window only.*

```lua
-- Lua
local st = ce.panel.entry("knob", "States", "Hover")
```
```js
// JavaScript
const st = ce.panel.entry("knob", "States", "Hover");
```

#### `ce.panel.define(control, section, name, spec)`

Add an entry to a collection section, or replace the entry of that name. `spec` only needs what you want to set; for States and Animations the rest is filled in for you. A new state starts with no condition and no changes. A new animation is a 120 ms change into hover and back from any state, as the Animation tab makes one, or, with `kind = "keyframes"`, an animation that plays all the time over the frames you give. Returns true if the entry was written.

*Short name: `panelDefine` · Panel window only.*

```lua
-- Lua
ce.panel.define("knob", "States", "Warn", { when = { valueGreaterThan = 0.9 } })
```
```js
// JavaScript
ce.panel.define("knob", "States", "Warn", { when: { valueGreaterThan: 0.9 } });
```

#### `ce.panel.undefine(control, section, name)`

Remove an entry from a collection section. Returns true if the entry was there, false if not. `set(path, nil)` does not remove an entry; this command does.

*Short name: `panelUndefine` · Panel window only.*

```lua
-- Lua
ce.panel.undefine("knob", "States", "Disabled")
```
```js
// JavaScript
ce.panel.undefine("knob", "States", "Disabled");
```

#### `ce.panel.patch(control, state, patch [, part])`

Change how a control looks in one of its states, such as hovered, pressed or disabled. `patch` maps property paths, such as "Background.Fill.colour", to new values, and is added to what the state already changes rather than replacing it. Give `part` to change one part of a custom component. Returns how many settings were applied, or 0 if the control has no state of that name. This is the way to reach the settings inside a state, which `set()` cannot.

*Short name: `panelPatch` · Panel window only.*

```lua
-- Lua
ce.panel.patch("knob", "Hover", { ["Background.Fill.colour"] = "FFFF0000" })
```
```js
// JavaScript
ce.panel.patch("knob", "Hover", { "Background.Fill.colour": "FFFF0000" });
```

#### `ce.panel.snapshot() -> object`

Capture every control's current value, as an object keyed by control name. Controls that have no value of their own are left out. Store it with `ce.storage.saveSetting()` to keep it, or hold it in `state` for an A/B comparison, and put it back with `ce.panel.restore()`.

*Short name: `panelSnapshot`.*

```lua
-- Lua
local before = ce.panel.snapshot()
```
```js
// JavaScript
const before = ce.panel.snapshot();
```

#### `ce.panel.each(fn) -> number`

Call `fn(name)` once for every control on the panel, including containers and the controls inside them, in the order they appear in the panel. Returns how many controls it visited. The list of names is taken before the first call, so `fn` can safely create or remove controls. To find out more about a control than its name, use `ce.panel.info()`.

*Short name: `panelEach`.*

```lua
-- Lua
ce.panel.each(function(name)
  …
end)
```
```js
// JavaScript
ce.panel.each(function (name) {
  …
});
```

#### `ce.panel.restore(snapshot) -> number`

Write the values from a `ce.panel.snapshot()` back to the controls. Returns how many values were written. A control the panel no longer has is skipped rather than stopping the whole restore.

*Short name: `panelRestore`.*

```lua
-- Lua
ce.panel.restore(before)
```
```js
// JavaScript
ce.panel.restore(before);
```

### ce.storage: remembering things

Three ways to keep values for later. `state` holds them between one run of a handler and the next. Settings outlive the session: they can be stored with the panel, kept private to one script, or kept on this computer only. The JSON helpers turn a value into text and back.

#### `ce.storage.state`

A table your script can keep its own values in from one handler call to the next. Only this script can see it. It is emptied when the script reloads, so use `ce.storage.saveSetting()` for anything that must last longer.

*Short name: `state`.*

```lua
-- Lua
ce.storage.state.count = (ce.storage.state.count or 0) + 1
```
```js
// JavaScript
ce.storage.state.count = (ce.storage.state.count ?? 0) + 1;
```

#### `ce.storage.saveSetting(key, value [, opts]) -> boolean`

Save a value under `key` so it outlasts the script — unlike `ce.storage.state`, it survives a reload. By default it is stored with the panel and travels with it; in an exported plugin it is saved in the DAW project. `opts.scope` sets who sees it: "panel" (every script on the panel, the default), "script" (only this script) or "local" (only this computer, never saved into the panel). Returns false if the value could not be saved, for example because storage is not available.

*Short name: `saveSetting`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scope` | text | "panel" | Which store to use. "panel" is shared by every script on the panel and travels with it; "script" is private to this one; "local" stays on this machine and is never written into the panel document. |

```lua
ce.storage.saveSetting("key", value)
```

#### `ce.storage.loadSetting(key [, fallback [, opts]])`

Read back a value saved with `ce.storage.saveSetting()`. Returns `fallback` if nothing has been saved under `key` (or nothing, if you did not give a fallback). `opts.scope` must match the scope the value was saved in — the same key in two scopes holds two separate values.

*Short name: `loadSetting`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scope` | text | "panel" | Which store to use. "panel" is shared by every script on the panel and travels with it; "script" is private to this one; "local" stays on this machine and is never written into the panel document. |

```lua
-- Lua
local v = ce.storage.loadSetting("key", default)
```
```js
// JavaScript
const v = ce.storage.loadSetting("key", default);
```

#### `ce.storage.settings([opts]) -> list`

List the keys saved in one scope, in no particular order. An empty list only means nothing has been saved yet; to check whether storage is working at all, use `ce.storage.info()`. Pick the scope with `opts.scope`, as for `ce.storage.saveSetting()`. The "panel" scope leaves out every script's private keys, including this script's own.

*Short name: `listSettings`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scope` | text | "panel" | Which store to use. "panel" is shared by every script on the panel and travels with it; "script" is private to this one; "local" stays on this machine and is never written into the panel document. |

```lua
-- Lua
for _, k in ipairs(ce.storage.settings()) do  end
```
```js
// JavaScript
for (const k of ce.storage.settings()) {  }
```

#### `ce.storage.forget(key [, opts]) -> boolean`

Delete a saved setting. Returns true if there was a value to delete and false if there was not. Pick the scope with `opts.scope`, as for `ce.storage.saveSetting()`.

*Short name: `forgetSetting`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scope` | text | "panel" | Which store to use. "panel" is shared by every script on the panel and travels with it; "script" is private to this one; "local" stays on this machine and is never written into the panel document. |

```lua
-- Lua
ce.storage.forget("key")
```
```js
// JavaScript
ce.storage.forget("key");
```

#### `ce.storage.all([opts]) -> table`

Return every setting in one scope as a table of keys and values. `opts.scope` is "panel" (the default), "script" or "local". The "panel" scope leaves out every script's private settings, including this script's own.

*Short name: `allSettings`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scope` | text | "panel" | Which store to use. "panel" is shared by every script on the panel and travels with it; "script" is private to this one; "local" stays on this machine and is never written into the panel document. |

```lua
-- Lua
for k, v in pairs(ce.storage.all()) do log(k, v) end
```
```js
// JavaScript
for (const [k, v] of Object.entries(ce.storage.all())) log(k, v);
```

#### `ce.storage.clear([opts]) -> number`

Delete every setting in one scope and return how many were deleted. Clearing the "panel" scope does not touch any script's private settings.

*Short name: `clearSettings`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scope` | text | "panel" | Which store to use. "panel" is shared by every script on the panel and travels with it; "script" is private to this one; "local" stays on this machine and is never written into the panel document. |

#### `ce.storage.info([opts]) -> table`

Describe where one scope's settings are kept: `scope`, `backing`, `available`, `count` (how many settings) and `bytes` (their size as JSON text). `backing` is "panel" (stored with the panel, in the editor), "project" (in the DAW project, in an exported plugin) or "machine" (on this computer only). If `available` is false, nothing you save in this scope will be kept.

*Short name: `storageInfo`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scope` | text | "panel" | Which store to use. "panel" is shared by every script on the panel and travels with it; "script" is private to this one; "local" stays on this machine and is never written into the panel document. |

#### `ce.storage.encode(value [, opts]) -> string`

Turn a value — a table, a list, a number, some text — into JSON text, for example to keep a structure in a setting or copy it to the clipboard. `opts.indent` lays it out over several lines, indented by that many spaces. Keys are always written in sorted order, so the same data always gives the same text. Returns nothing for a value that has no JSON form, such as a function or a table that contains itself. It works the same in every scripting language, including Lua, which has no JSON support of its own.

*Short name: `encodeJson`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `indent` | number | 0 | Lay the JSON out over several lines, indented by this many spaces. 0 keeps it on one line. |

```lua
-- Lua
sendSysex(toAscii(ce.storage.encode(patch)))
```
```js
// JavaScript
sendSysex(toAscii(ce.storage.encode(patch)));
```

#### `ce.storage.decode(text) -> value`

Turn JSON text back into a value. Text that is not valid JSON returns nothing. A JSON null also reads back as nothing: `{"a":1,"b":null}` comes back with only the key `a`, and `[1,null,2]` as a list of two items. So encoding and then decoding is not a full round trip when nulls are involved.

*Short name: `decodeJson`.*

## Commands: How it looks

Drawing, images, typography, and dialogs with the user.

### ce.draw: drawing

Drawing your own graphics on top of a control, from its script's onDraw. Set the colours and line style first, then draw shapes and text; everything is measured in pixels from the control's top-left corner.

Everything in this chapter needs the panel window. With the window closed these commands do nothing and write a note to the log.

#### `ce.draw.clear([target])`

Erase everything drawn on this control, or on the control named `target`. Drawing commands add to what is already there rather than replacing it, so this is usually the first line of onDraw.

*Short name: `drawClear`.*

```lua
-- Lua
ce.draw.clear()
```
```js
// JavaScript
ce.draw.clear();
```

#### `ce.draw.fill(colour)`

Set the fill colour for the shapes drawn after this: a hex string such as "#5B9BD5", or a gradient from `ce.draw.gradient()`. Call it with no colour to stop filling. Each onDraw starts with no fill and no stroke, so set one of them before you draw shapes.

*Short name: `drawFill`.*

```lua
-- Lua
ce.draw.fill("#5B9BD5")
```
```js
// JavaScript
ce.draw.fill("#5B9BD5");
```

#### `ce.draw.stroke([colour] [, width] [, opts])`

Set the line colour and thickness for the shapes drawn after this. `width` defaults to 1, and `colour` can be a hex string or a gradient from `ce.draw.gradient()`; with no colour, outlines are not drawn. `opts` adds dashes and sets the style of line ends and corners.

*Short name: `drawStroke`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `dash` | list of numbers | a solid line | Alternating on and off lengths in pixels. The panel's own beat marks are { 3, 3 } — three pixels drawn, three skipped. |
| `dashOffset` | number (pixels) | 0 | How far into the dash pattern to start. Advance it on a timer and the dashes march along the line. |
| `cap` | text | "butt" | The shape a line ends in. One of "butt", "round" or "square". |
| `join` | text | "miter" | How two line segments meet at a corner. One of "miter", "round" or "bevel". |

```lua
-- Lua
ce.draw.stroke("#5B9BD5", 2)
```
```js
// JavaScript
ce.draw.stroke("#5B9BD5", 2);
```

#### `ce.draw.rect(x, y, w, h [, radius])`

Draw a rectangle at (`x`, `y`), `w` wide and `h` tall, measured from the control's top-left corner. `radius` rounds the corners.

*Short name: `drawRect`.*

```lua
-- Lua
ce.draw.rect(0, 0, 40, 20)
```
```js
// JavaScript
ce.draw.rect(0, 0, 40, 20);
```

#### `ce.draw.circle(cx, cy, r)`

Draw a circle of radius `r`, centred on (`cx`, `cy`).

*Short name: `drawCircle`.*

```lua
-- Lua
ce.draw.circle(20, 20, 8)
```
```js
// JavaScript
ce.draw.circle(20, 20, 8);
```

#### `ce.draw.line(x1, y1, x2, y2)`

Draw a straight line from (`x1`, `y1`) to (`x2`, `y2`) in the current stroke colour and width. The fill colour does not apply to lines.

*Short name: `drawLine`.*

```lua
-- Lua
ce.draw.line(0, 0, 100, 0)
```
```js
// JavaScript
ce.draw.line(0, 0, 100, 0);
```

#### `ce.draw.path(points [, closed])`

Draw a line through a series of points, given as one flat list of coordinates: { x1, y1, x2, y2, ... }. Set `closed` to true to join the last point back to the first. Note the flat list: `ce.draw.curve()` and `ce.draw.points()` take a list of [x, y] pairs instead.

*Short name: `drawPath`.*

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

#### `ce.draw.arc(x, y, radius, from, to)`

Draw part of a circle centred on (`x`, `y`), from angle `from` to angle `to`. Angles are in degrees, with 0 at twelve o'clock and increasing clockwise, the same as the Meter's `arcStart` and `arcSweep`. The arc is drawn in the stroke colour; if a fill is set, it is filled as a pie slice.

*Short name: `drawArc`.*

```lua
-- Lua
ce.draw.arc(30, 30, 24, 135, 135 + 270 * value)
```
```js
// JavaScript
ce.draw.arc(30, 30, 24, 135, 135 + 270 * value);
```

#### `ce.draw.gradient(stops [, angle]) -> value`

Make a gradient to pass to `ce.draw.fill()` or `ce.draw.stroke()` in place of a plain colour. Give a plain list of colours to space them evenly, or a list of { at, colour, opacity } to place each one yourself (`at` runs from 0 to 1); you can mix the two. `angle` is in degrees, 0 pointing up and 90 pointing right, the same as the Background section's gradients; without it the gradient runs from top to bottom. Returns nothing if there are fewer than two usable colours.

*Short name: `drawGradient`.*

```lua
-- Lua
ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }, 180))
```
```js
// JavaScript
ce.draw.fill(ce.draw.gradient(["#2A6BD4", "#0A1830"], 180));
```

#### `ce.draw.opacity(a)`

Set how solid everything drawn after this is, from 0 (invisible) to 1 (fully solid). Like fill and stroke, it applies to everything that follows, not to one shape. Call it with no number to switch it off again. To make a single colour see-through instead, use `ce.math.alpha()`.

*Short name: `drawOpacity`.*

#### `ce.draw.transform([opts])`

Rotate, move or scale everything drawn after this. To turn a shape about its own centre, such as a knob's pointer, give that centre as `opts.cx` and `opts.cy`. Each call replaces the previous transform rather than adding to it, and calling it with no options clears it.

*Short name: `drawTransform`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `rotate` | number (degrees) | 0 | Turn everything drawn after this clockwise. |
| `cx` | number (pixels) | the top-left corner | The horizontal point to rotate about. Give `cx` and `cy` together; without them the rotation turns about the top-left corner, which makes a shape orbit that corner. |
| `cy` | number (pixels) | the top-left corner | The vertical point to rotate about. |
| `x` | number (pixels) | 0 | Move everything sideways. |
| `y` | number (pixels) | 0 | Move everything up or down. |
| `scale` | number | 1 | Grow or shrink. 2 is double size, 0.5 is half. |

```lua
-- Lua
ce.draw.transform({ rotate = 135, cx = w / 2, cy = h / 2 })
```
```js
// JavaScript
ce.draw.transform({ rotate: 135, cx: w / 2, cy: h / 2 });
```

#### `ce.draw.ellipse(cx, cy, rx, ry)`

Draw an oval centred on (`cx`, `cy`), with horizontal radius `rx` and vertical radius `ry`.

*Short name: `drawEllipse`.*

#### `ce.draw.pixelText(text, x, y [, scale])`

Write text in the app's built-in 5x7 LCD font, the same one the LCD components show. `scale` is how many screen pixels make one font pixel, a whole number, 1 by default. Each lit pixel is drawn as a sharp square, with no smoothing. (`x`, `y`) is the top-left corner of the text, unlike `ce.draw.text()`, where `y` is the baseline.

*Short name: `drawPixelText`.*

#### `ce.draw.measure(text [, opts]) -> table`

Measure a piece of text before drawing it. Returns { width, height, exact }. Give `opts.size` and `opts.family` for ordinary text (size 12 by default), or set `opts.pixel` to true for the LCD font. The LCD font is a fixed grid, so its answer is always exact. Ordinary text has to be measured, and if that cannot be done the result is an estimate and `exact` is false.

*Short name: `drawMeasure`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `size` | number (pixels) | — | The text size to measure at. |
| `family` | text | — | The font family to measure in. |
| `pixel` | true or false | false | Measure in the panel's built-in LCD font instead of a normal one. That font is a fixed grid, so the answer is exact arithmetic. |
| `scale` | number | 1 | How many screen pixels one LCD pixel is. Only used with `pixel`. |

#### `ce.draw.batch(fn) -> boolean`

Run `fn` and show all the drawing it does in one update, instead of one update per command. Use it when you draw in a loop, such as a waveform or a row of tick marks, where it is several times faster. `ce.draw.grid()`, `ce.draw.lines()` and `ce.draw.points()` already draw a whole set in one go and do not need it.

*Short name: `drawBatch`.*

#### `ce.draw.grid([opts]) -> boolean`

Draw a whole grid of lines in one command. It covers the control unless you give a box. Give either a spacing (`opts.step`, or `opts.stepX` and `opts.stepY`) or a number of `opts.columns` and `opts.rows`; with neither, nothing is drawn and it returns false. The closing lines are drawn too, so a 4-column grid has five vertical lines.

*Short name: `drawGrid`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `x` | number (pixels) | the control's left edge | Where the grid starts horizontally. |
| `y` | number (pixels) | the control's top edge | Where it starts vertically. |
| `width` | number (pixels) | the control's width | How wide the grid is. |
| `height` | number (pixels) | the control's height | How tall the grid is. |
| `step` | number (pixels) | — | Spacing both ways — a line every this many pixels. Use this or `columns`, not both. |
| `stepX` | number (pixels) | — | Horizontal spacing on its own. |
| `stepY` | number (pixels) | — | Vertical spacing on its own. |
| `columns` | number | — | How many columns to divide the width into. The closing line is drawn, so four columns give five vertical lines. |
| `rows` | number | — | How many rows to divide the height into. |

#### `ce.draw.lines(segments) -> boolean`

Draw many separate straight lines in one command, from a list of [x1, y1, x2, y2]. Use it for things that are not joined up: tick marks, the rungs of a level meter, a grid you work out yourself. To draw one connected line through a series of points, use `ce.draw.path()`.

*Short name: `drawLines`.*

#### `ce.draw.points(points [, radius]) -> boolean`

Draw a set of dots in one command, from a list of [x, y]. `radius` defaults to 1.5 and does not depend on the stroke width.

*Short name: `drawPoints`.*

#### `ce.draw.curve(points [, opts]) -> boolean`

Draw a smooth curve that passes through a list of points, each given as [x, y], in one command. It needs at least two points. `opts.tension` sets how round the curve is, and `opts.closed` joins it into a loop, which is filled if a fill is set.

*Short name: `drawCurve`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `tension` | number (0 to 1) | 0.5 | How round the curve is. 0 gives straight lines between the points, 1 is fully rounded. |
| `closed` | true or false | false | Join the last point back to the first to make a loop. |

#### `ce.draw.polygon(cx, cy, radius, sides [, opts]) -> boolean`

Draw a shape with `sides` equal sides, such as a triangle or a hexagon, centred on (`cx`, `cy`) with its corners `radius` away from the centre. At rotation 0 a corner points to twelve o'clock; `opts.rotation` turns it clockwise in degrees, the same way `ce.draw.arc()` measures angles, so the two line up. Fewer than three sides counts as three.

*Short name: `drawPolygon`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `rotation` | number (degrees) | 0 | Turn the shape clockwise, with 0 putting a corner at twelve o'clock — the same convention drawArc uses, so a polygon and an arc at the same angle line up. |

#### `ce.draw.image(src, x, y, w, h [, opts]) -> boolean`

Draw an image in the box at (`x`, `y`), `w` wide and `h` tall. `src` must be the image data itself: a data URL, or the `dataUrl` of a library icon from `ce.image.asset()`. An asset's name on its own draws nothing, and an empty `src` is refused with a message. `opts.fit` sets how the image fills the box.

*Short name: `drawImage`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `fit` | text | "fill" | How the image fills the box you gave. "fill" stretches it to fit exactly, "contain" keeps its shape and leaves gaps, "cover" keeps its shape and crops. |

#### `ce.draw.clip([x, y, w, h]) -> boolean`

Limit everything drawn after this to the rectangle (`x`, `y`, `w`, `h`). Like fill and stroke, it stays in force until you change it, and `ce.draw.save()` and `ce.draw.restore()` include it. Call it with no arguments to remove it. Drawing never goes outside the control anyway, so a clip can only make the area smaller.

*Short name: `drawClip`.*

#### `ce.draw.blend(mode) -> boolean`

Choose how what you draw next mixes with what is already underneath: "normal" (the default), "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference" or "exclusion". An unknown mode is refused with a message and returns false.

*Short name: `drawBlend`.*

#### `ce.draw.save() -> boolean`

Remember the current drawing style (fill, stroke, width, dashes, line ends and corners, opacity, transform, clip and blend) so `ce.draw.restore()` can bring it back. Saved styles are thrown away at the start of each onDraw, so a forgotten restore cannot affect the next drawing.

*Short name: `drawSave`.*

#### `ce.draw.restore() -> boolean`

Bring back the style saved by the most recent `ce.draw.save()`. If nothing was saved, it reports an error, returns false and leaves the style as it is, rather than quietly going back to the defaults.

*Short name: `drawRestore`.*

#### `ce.draw.text(x, y, text [, opts])`

Write text at (`x`, `y`), where `y` is the baseline, the line the letters sit on. With `opts.align` set to "left" (the default), "middle" or "right", `x` is the left end, the centre or the right end of the text. The size is 12 unless you set `opts.size`. Text is painted in the fill colour, or in the stroke colour if there is no fill.

*Short name: `drawText`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `size` | number (pixels) | — | How big the text is. |
| `align` | text | "left" | Which part of the text sits at the x you gave. One of "left", "middle" or "right". |
| `family` | text | — | The font family to draw in. |

```lua
-- Lua
ce.draw.text(4, 12, "hello")
```
```js
// JavaScript
ce.draw.text(4, 12, "hello");
```

#### `ce.draw.redraw([target])`

Ask for onDraw to run again, for this control or for the one named `target`. Nothing is redrawn on its own: to animate, call this from onTimer.

*Short name: `drawRedraw`.*

```lua
-- Lua
ce.draw.redraw()
```
```js
// JavaScript
ce.draw.redraw();
```

### ce.image: images and icons

The pictures a control shows — its background image and overlay, an image inside its text, and its icon — and the icon library they come from. These commands also tell you whether a picture will still be there after you export.

Everything in this chapter needs the panel window. With the window closed these commands do nothing and write a note to the log.

#### `ce.image.assets([opts]) -> list`

List the images in your icon library, then any icons the panel carries with it. Each entry is { id, name, source, mime, vector, width, height, filePath, dataUrl, portable, embeddable }. `source` is "panel" for a carried icon, and `portable` says whether the picture is already in the panel: true for those, false for your library's. Sharing or exporting copies a library icon into the panel if a control shows it or a script names it in quotes, but not one whose name a script builds while it runs. `embeddable` says whether the entry has image data that can be copied into the panel.

*Short name: `imageAssets`.*

**`opts`** can contain:

| Name | Type | What it is |
|---|---|---|
| `vector` | true or false | Set true to list only vector icons, which stay sharp at any size. |
| `embeddable` | true or false | Set true to list only icons ce.image.embed() can copy into the panel, so they survive an export. |

#### `ce.image.asset(idOrName) -> table|nil`

Look up one image in the icon library or among the icons the panel carries, by id first and then by name (capitals do not matter), the same way the panel finds an icon when it draws one. Returns the entry, in the same form as `ce.image.assets()`, or nothing if there is no such image, so check with it before pointing a control at an asset. Be aware that a name which happens to match is returned just as an id match would be.

*Short name: `imageAsset`.*

#### `ce.image.set(target, src [, opts]) -> boolean`

Put a picture on one of a control's four image layers and switch that layer on. The picture and the on-switch are always set together, so a layer is never left on with nothing in it. `opts.layer` picks the layer: "image" (the default) and "overlay" are background layers that stack; "textImage" and "textTexture" fill the text itself, and choosing one replaces whatever fill the text had. An option the chosen layer does not have is refused with a message, and the command returns false.

*Short name: `imageSet`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `layer` | text | "image" | Which of the control's four image layers to write. The first two are background layers and stack; the last two fill the text and are exclusive. Each option below applies only to layers that have it; an unsupported option is refused and reported. One of "image", "overlay", "textImage" or "textTexture". |
| `fit` | text | "fill" on a background, "cover" on text | How the image fills the layer. The meaning differs by layer type: on a background it is one of fill, fit, stretch, tile, original and "fill" means COVER; on text it is one of cover, contain, fill and "fill" means stretch. The text texture layer always tiles and takes no fit. One of "fill", "fit", "stretch", "tile", "original", "cover" or "contain". |
| `align` | text | "center" | Where the image sits when it does not fill the layer. Background layers only — on a text layer use offsetX and offsetY instead. Note the hyphens. One of "top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom" or "bottom-right". |
| `opacity` | number (0 to 100) | 100 | How solid the layer is, on the panel's own 0 to 100 scale — not 0 to 1. |
| `tint` | colour | — | Tint colour, as "#RRGGBB". Omit to leave the image untinted. |
| `blend` | text | "normal" | How the layer mixes with what is underneath it. Background layers only. One of "normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference" or "exclusion". |
| `blur` | number (pixels) | 0 | Soften the image. Background layers only. |
| `offsetX` | number (pixels) | 0 | Nudge the image sideways. |
| `offsetY` | number (pixels) | 0 | Nudge it up or down. |
| `rotation` | number (degrees) | 0 | Turn the image clockwise, with 0 upright. |
| `flipH` | true or false | false | Mirror it left to right. Background layers only. |
| `flipV` | true or false | false | Mirror it top to bottom. Background layers only. |
| `grayscale` | true or false | false | Remove all colour from the image. Background layers only. |
| `saturation` | number | 1 | Colour intensity. 0 is grey, 1 is unchanged, above 1 is stronger. Background layers only. |
| `brightness` | number | 1 | Lighten above 1, darken below. Background layers only. |
| `contrast` | number | 1 | Increase above 1, flatten below. Background layers only. |
| `tileScale` | number | 1 | How big each tile is when the image repeats. Never less than 0.1. |
| `clipMode` | text | "shape" | Whether the image is clipped to the control's drawn shape or to its plain rectangle. Background layers only. One of "shape" or "box". |
| `muted` | true or false | false | Keep the layer configured but hide it, so you can switch it back on without setting it up again. Background layers only. |

#### `ce.image.clear(target [, layer]) -> boolean`

Switch an image layer off and empty it in one step. `layer` is "image" unless you name another. Clearing "textImage" or "textTexture" also sets the text fill back to "solid", because a text fill with no picture would show nothing.

*Short name: `imageClear`.*

#### `ce.image.read(target [, layer]) -> table`

Read all the settings of one image layer (`layer` is "image" unless you name another), plus three extra fields. `active` says whether the layer will actually be drawn; for a text layer that depends on the text's fill mode, not on its Enabled switch. `source` is "data", "file" or "none". `portable` says whether the image survives an export, which only embedded image data does.

*Short name: `imageRead`.*

#### `ce.image.icon(target, idOrName [, opts]) -> boolean`

Show an image from the icon library (or one the panel carries) in a control's Icon section, chosen by id or name. `opts` can also set its size, fit, tint, opacity and rotation. An image that is not there is refused with a message rather than stored. A control that shows only its text is switched to show the icon beside it (or alone, when there is no text). Write the id or name in quotes, as a plain string: that is how sharing and exporting find the icon and pack it into the panel. Use this rather than `set()`: it records the asset's id and name together, so the control finds exactly that image.

*Short name: `imageIcon`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `size` | number (pixels) | 16 | How big the icon is drawn. |
| `fit` | text | "contain" | How the icon fills its box, using the Icon section's own values. |
| `tint` | colour | — | Tint colour, as "#RRGGBB". Omit to leave the image untinted. |
| `opacity` | number (0 to 1) | 1 | Image opacity. 0 is invisible, 1 is fully opaque. |
| `rotation` | number (degrees) | 0 | Turn the image clockwise, with 0 upright. |

#### `ce.image.embed(target [, layer]) -> boolean`

Copy a layer's image into the panel itself, in place of a file path that only exists on this computer, so the image survives export. If the layer already holds embedded image data, it returns true and changes nothing. If the file has not been read yet, it returns false and starts reading it; call it again once the file has loaded and it will succeed.

*Short name: `imageEmbed`.*

#### `ce.image.load(path) -> boolean`

Start reading an image file and report whether it is ready. A layer that points at a file shows nothing until the file has been read, and reading happens in the background, so this returns false the first time and true once the image has arrived. A data URL needs no reading and returns true straight away.

*Short name: `imageLoad`.*

### ce.text: fonts and lettering

Fonts and lettering: which fonts are available, setting a control's type in one call, variable-font settings, and measuring text so it fits.

Everything in this chapter needs the panel window. With the window closed these commands do nothing and write a note to the log.

#### `ce.text.fonts([opts]) -> list`

List every font the panel can use, with what each one supports: the built-in fonts, your font library, and any font the panel carries with it (`source` "panel"). `portable` says whether a font is already there wherever the panel goes: true for the built-in fonts and the carried ones, false for your library's. Sharing or exporting packs a library font into the panel if a control uses it or a script names it in quotes. `featuresKnown` says whether the font's typographic features have actually been checked; when it is false, an empty `features` list means they are unknown, not that there are none.

*Short name: `textFonts`.*

**`opts`** can contain:

| Name | Type | What it is |
|---|---|---|
| `portable` | true or false | Set true to list only fonts that are already there wherever the panel goes: the built-in fonts and the ones the panel carries. A font from your font library is packed in when you share or export the panel, if a control uses it or a script names it in quotes. |
| `variable` | true or false | Set true to list only variable fonts, the ones with adjustable axes such as weight and width. |

#### `ce.text.font(family) -> table|nil`

Look up one font by family name. Returns its description, with the same fields as `ce.text.fonts()`, or nothing if no such font is available. Capitals do not matter, and the font's display name works too, just as in the Properties panel. Use it to check that a font exists before you set it, or to see which variable axes it has.

*Short name: `textFont`.*

#### `ce.text.style(target, opts) -> boolean`

Set a control's typography in one call: font, size, weight, spacing, alignment and the rest. Use it rather than `set()` for the weight, because boldness is stored in two fields that must agree and this always writes both. A font that is not available, a typographic feature the font does not have, or an option that is not a text option is refused with a message, while the other options still apply. Returns false if any part did not apply. Name the font in quotes, as a plain string: that is how sharing and exporting find a font from your library and pack it into the panel.

*Short name: `textStyle`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `family` | text | — | The font family. An unavailable family is refused rather than stored; a bare set() would store it and quietly fall back to a system font. |
| `size` | number (pixels) | — | How big the text is drawn. |
| `weight` | number or text | — | How heavy the text is, either as a number from 100 to 900 or as a name such as "Bold". The panel stores this as a pair of fields that must agree, and this always writes both. |
| `bold` | true or false | — | A shorthand for a heavy weight. |
| `italic` | true or false | — | Slant the text over. |
| `caseMode` | text | "normal" | Re-case the text as it is drawn, without changing what it says. One of "normal", "uppercase", "lowercase", "title", "sentence" or "smallcaps". |
| `scriptMode` | text | "normal" | Draw the text smaller and raised or lowered, as superscript or subscript. One of "normal", "superscript" or "subscript". |
| `justification` | text | — | Where the text sits inside the control. One of "topLeft", "top", "topRight", "left", "centred", "right", "bottomLeft", "bottom" or "bottomRight". |
| `letterSpacing` | number (pixels) | 0 | Extra space between letters. Negative tightens them up. |
| `wordSpacing` | number (pixels) | 0 | Extra space between words. |
| `baselineShift` | number (pixels) | 0 | Move the text off its baseline, up for positive. |
| `lineHeight` | number | — | The gap from one line of text to the next. |
| `maxLines` | number | 0 | Stop after this many lines. 0 means no limit. |
| `paddingLeft` | number (pixels) | 0 | Inset the text from the control's left edge. |
| `paddingRight` | number (pixels) | 0 | Inset it from the right edge. |
| `paddingTop` | number (pixels) | 0 | Inset it from the top edge. |
| `paddingBottom` | number (pixels) | 0 | Inset it from the bottom edge. |
| `underline` | true or false | false | Draw a rule under it. |
| `strikethrough` | true or false | false | Draw a rule through it. |
| `overline` | true or false | false | Draw a rule above it. |
| `ligatures` | true or false | false | Join pairs like "fi" and "fl" into the single shapes the font draws for them. A font that does not offer it refuses the option rather than ignoring it. |
| `stylisticAlternates` | true or false | false | Use the alternative letter shapes the designer drew, where there are any. A font that does not offer it refuses the option rather than ignoring it. |
| `oldstyleFigures` | true or false | false | Draw numerals that sit on the baseline at differing heights, the way lower-case letters do, so they read better inside a sentence. A font that does not offer it refuses the option rather than ignoring it. |
| `tabularFigures` | true or false | false | Give every digit the same width so columns of numbers line up — what you want for a readout that keeps changing. A font that does not offer it refuses the option rather than ignoring it. |
| `fractions` | true or false | false | Draw things like 1/2 as a proper stacked fraction. A font that does not offer it refuses the option rather than ignoring it. |
| `slashedZero` | true or false | false | Put a slash through zero so it cannot be mistaken for a capital O. A font that does not offer it refuses the option rather than ignoring it. |

#### `ce.text.axis(target, tag, value) -> boolean`

Set one axis of a variable font by its four-letter tag, such as "wght" for weight. The value is kept within the range the font allows, and an axis the font does not have is refused rather than stored. Setting "wght" also updates the control's weight, as the Properties panel's own axis slider does; otherwise the text would still be drawn at its old weight.

*Short name: `textAxis`.*

#### `ce.text.read(target [, name]) -> value|table`

Read one text setting by name, such as "size" or "lineHeight", without having to know which part of the Text section (Font, Multiline or Position) holds it. With no name, returns everything as { content, resolvedWeight, font, multiline, position }. `resolvedWeight` is the weight the text is actually drawn at, worked out from the two stored weight fields.

*Short name: `textRead`.*

#### `ce.text.measure(target [, text]) -> table`

Measure how much room a control's text takes up in its own font. Returns { width, height, lines, truncated, exact }, where `truncated` says whether some of the text is cut off. It lays the text out exactly as the panel does, so spacing, wrapping and line limits all count. Pass `text` to measure something the control does not hold yet. `exact` is false when the text could not actually be measured and the answer is an estimate.

*Short name: `textMeasure`.*

#### `ce.text.fit(target [, opts]) -> table`

Find the largest text size at which a control's text fits inside its box, write that size to the control, and return { size, fits, changed, exact }. It tries whole-number sizes from `opts.max` (the current size) down to `opts.min` (6). Setting Text.Multiline.fitMode to "shrink" only shrinks the text as it is drawn and never changes the stored size; this writes the size, so other code can read it and line things up with it. If even `opts.min` overflows, `fits` is false and the size is set to `opts.min`; the call still succeeds.

*Short name: `textFit`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `min` | number (pixels) | 6 | The smallest size to shrink to. If the text still overflows at this size, the result has fits = false; the call still succeeds. |
| `max` | number (pixels) | the control's current size | The largest size to try. |
| `text` | text | the control's own text | Measure this text instead, to size a control for something it does not hold yet. |

### ce.ui: messages and questions

Talking to the person using the panel: short messages, a line in the status bar, questions with buttons, a line of text to type, a pick from a list, and copying to the clipboard. For messages meant for you while you build the panel, use `log` instead.

Everything in this chapter needs the panel window. With the window closed these commands do nothing and write a note to the log.

#### `ce.ui.notify(message [, opts])`

Show a short pop-up message to the person using the panel, and return its ID. It disappears after 3 seconds unless you set `opts.duration` (in milliseconds); 0 or less keeps it up until it is dismissed. Use it for things the user should know about, not for debugging — that is what `log()` is for. Pass the ID to `ce.ui.update()` to change the message in place, or to `ce.ui.dismiss()` to remove it.

*Short name: `uiNotify`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `kind` | text | "info" | Severity of the message. Sets the colour and the icon. One of "info", "warn" or "error". |
| `duration` | number (milliseconds) | 3000 | How long the message stays up. 0 or less keeps it visible until something dismisses it. |

```lua
-- Lua
ce.ui.notify("Patch loaded")
```
```js
// JavaScript
ce.ui.notify("Patch loaded");
```

#### `ce.ui.status([message] [, opts])`

Show a line of text in the status bar. It stays until you replace it; call this with no message to clear it. Use it for an ongoing state, such as "Recording" or "Synced" — for a one-off event, use `ce.ui.notify()`. Read the current status back with `ce.ui.state()`.

*Short name: `uiStatus`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `kind` | text | "info" | Severity of the message. Sets the colour and the icon. One of "info", "warn" or "error". |

```lua
-- Lua
ce.ui.status("Recording")
```
```js
// JavaScript
ce.ui.status("Recording");
```

#### `ce.ui.dialog(opts [, onChoice]) -> boolean`

Ask a question with buttons. The answer arrives later through `onChoice`, which receives the label of the button that was clicked, or nothing if the dialog was closed without a choice. Only one dialog can be open at a time. The call itself returns true if the dialog appeared; if it returns false, nothing was shown — for example because another dialog is already open — and `onChoice` has already been called with nothing.

*Short name: `uiDialog`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `title` | text | — | The bold line at the top. |
| `message` | text | — | The body text under the heading. |
| `buttons` | list of text | one button labelled "OK" | The button labels, left to right. Whichever is clicked is what `onChoice` is given. |
| `kind` | text | "info" | Severity of the message. Sets the colour and the icon. One of "info", "warn" or "error". |
| `default` | text | the first button | The label of the button focused when the dialog opens. |

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

#### `ce.ui.prompt(opts [, onAnswer]) -> boolean`

Ask the user to type some text. The answer arrives through `onAnswer`: the text they typed, or nothing if they cancelled. An empty answer (they accepted an empty field) is not the same as no answer. Pressing Enter accepts. Returns true if the dialog appeared; if it returns false, `onAnswer` has already been called with nothing.

*Short name: `uiPrompt`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `title` | text | — | The bold line at the top. |
| `message` | text | — | The body text under the heading. |
| `value` | text | empty | What the text field starts out holding. |
| `placeholder` | text | — | Grey hint text shown while the field is empty. |
| `accept` | text | "OK" | The label on the confirm button. |
| `cancel` | text | "Cancel" | The label on the cancel button. |
| `kind` | text | "info" | Severity of the message. Sets the colour and the icon. One of "info", "warn" or "error". |

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

#### `ce.ui.choose(opts [, onAnswer]) -> boolean`

Ask the user to pick from a list. The answer arrives through `onAnswer`: the chosen item, a list of items if `opts.multiple` is set, or nothing if they cancelled. A long list scrolls rather than making the dialog taller. Returns true if the dialog appeared; if it returns false — for example because `opts.items` is empty — `onAnswer` has already been called with nothing.

*Short name: `uiChoose`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `title` | text | — | The bold line at the top. |
| `message` | text | — | The body text under the heading. |
| `items` | list of text | required | The choices to offer. A long list scrolls. |
| `default` | text | the first item | The item selected when the dialog opens. |
| `multiple` | true or false | false | Allow more than one to be picked, in which case the answer is a list. |
| `accept` | text | "OK" | The label on the confirm button. |
| `cancel` | text | "Cancel" | The label on the cancel button. |
| `kind` | text | "info" | Severity of the message. Sets the colour and the icon. One of "info", "warn" or "error". |

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

#### `ce.ui.dismiss([id]) -> number`

Remove a message shown with `ce.ui.notify()`; the user can also remove one by clicking it. With no `id`, every message is removed. Returns how many were removed.

*Short name: `uiDismiss`.*

```lua
-- Lua
ce.ui.dismiss(id)
```
```js
// JavaScript
ce.ui.dismiss(id);
```

#### `ce.ui.update(id, message [, opts]) -> boolean`

Change the text of a message that is already showing, in place. To show progress, show the first message with an `opts.duration` of 0 so it stays up, then update it as you go. Returns false once the message has gone — for example because the user dismissed it — so you know to stop updating.

*Short name: `uiUpdate`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `kind` | text | "info" | Severity of the message. Sets the colour and the icon. One of "info", "warn" or "error". |
| `duration` | number | unchanged | A new lifetime for the message. If omitted, a sticky message stays sticky and a timed one gets its full time back. |

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

#### `ce.ui.state() -> table`

Return what is on screen: `status`, `statusKind`, `notifications` (a list, each with `id`, `message`, `kind` and `sticky`) and `dialog`. `dialog` is true while a dialog is open, which tells you why `ce.ui.dialog()` returned false: another dialog was already showing, rather than there being no panel window to show it in.

*Short name: `uiState`.*

```lua
-- Lua
if not ce.ui.state().dialog then  end
```
```js
// JavaScript
if (!ce.ui.state().dialog) {  }
```

#### `ce.ui.copy(text) -> boolean`

Copy text to the clipboard. The copy happens in the background, and the system may refuse it unless it follows a click by the user, so true means the copy was attempted, not that it worked; a refusal is written to the script console. Scripts cannot read the clipboard.

*Short name: `uiCopy`.*

```lua
-- Lua
ce.ui.copy(ce.storage.encode(buildDump("patch")))
```
```js
// JavaScript
ce.ui.copy(ce.storage.encode(buildDump("patch")));
```

## Commands: Components

Many of CEditor's ready-made components — the Arpeggiator, the Envelope, the LCD and the rest —
can be driven from a script. Each component has a module of its own, named after it:
`ce.components.arp.pattern("myArp", "up")` sets the pattern of the arpeggiator called
`myArp`. They all follow the same pattern:

- The first argument is always the name of the component's control.
- A command that changes a setting tells you whether it took: true if it did, false — with a line
  in the script console saying why — if it did not, because the control is the wrong kind or the
  value is not one it accepts.
- Most commands that switch something on or off toggle it when you leave the value out:
  `ce.components.arp.run("myArp")` starts a stopped arpeggiator and stops a running one.
- `read` gives you the component's current settings.

Components live in the panel window, so these commands need the window open. The Script Editor's
picker lists every one of them with its description; here is what each component offers.

### Note sources

Components that produce notes.

- **Arpeggiator** — `ce.components.arp`. Drive the Arpeggiator: pattern, rate, gate, swing and the Euclidean generator. Commands: `run`, `pattern`, `rate`, `division`, `sync`, `octaves`, `gate`, `swing`, `latch`, `key`, `scale`, `followPanelKey`, `degree`, `chordType`, `velocity`, `channel`, `euclid`, `euclidSteps`, `euclidPulses`, `euclidRotate`, `phase`, `mute`, `inputChannel`, `baseOctave`, `source`, `link`, `editable`, `showNotes`, `showHeader`, `read`.
- **Chord Pad** — `ce.components.chordpad`. Re-key, re-voice and re-channel the Chord Pad without touching the layout. Commands: `mode`, `key`, `scale`, `followPanelKey`, `chordType`, `voicing`, `inversion`, `octave`, `velocity`, `channel`, `strum`, `latch`, `layout`, `baseOctave`, `noteSpan`, `gridCols`, `echo`, `echoChannel`, `editable`, `showPiano`, `showRomans`, `read`.
- **Note Ribbon** — `ce.components.noteribbon`. Re-key and re-range the Note Ribbon: scale, span, bend depth, channel. Commands: `mode`, `key`, `scale`, `followPanelKey`, `baseNote`, `octaves`, `bendRange`, `velocity`, `channel`, `latch`, `orientation`, `velocityFrom`, `modAxis`, `modCc`, `echo`, `echoChannel`, `editable`, `showNames`, `showHeader`, `read`.
- **Drum Pads** — `ce.components.drumpads`. Re-map the Drum Pads — the grid, the kit, and each pad's own note, name and choke group. Commands: `map`, `baseNote`, `mode`, `gate`, `velocity`, `channel`, `rows`, `cols`, `origin`, `velocityFrom`, `echo`, `echoChannel`, `note`, `label`, `choke`, `colour`, `roll`, `rollRate`, `rollSync`, `rollHz`, `rollDelay`, `rollVelocity`, `zones`, `cornerSize`, `cornerTopLeft`, `cornerTopRight`, `cornerBottomLeft`, `cornerBottomRight`, `flamMs`, `ghostVelocity`, `editable`, `showNotes`, `showLabels`, `showHeader`, `read`, `size`, `fill`.
- **Phrase Sequencer** — `ce.components.phrase`. A step grid whose rows are the notes of a scale. Commands: `seed`, `clear`, `key`, `scale`, `transpose`, `direction`, `run`, `cell`, `read`.
- **Phrase Recorder** — `ce.components.recorder`. Records what you play and loops it back. Commands: `record`, `stop`, `play`, `clear`, `undo`, `quantize`, `transpose`, `bars`, `source`, `nudge`, `shift`, `store`, `load`, `countIn`, `read`.
- **Harmoniser** — `ce.components.harmony`. Turns one played note into a whole chord. Commands: `mode`, `key`, `scale`, `size`, `shape`, `voicing`, `inversion`, `octave`, `outOfKey`, `keepPlayed`, `channel`, `voiceLeading`, `strum`, `degree`, `read`.

### Movement and randomness

Components that keep changing on their own.

- **Turing Machine** — `ce.components.turing`. Drive the Turing Machine: run, rate, length, randomness, and individual steps. Commands: `run`, `rate`, `division`, `sync`, `length`, `randomness`, `quantize`, `gate`, `step`, `phase`, `editable`, `showGate`, `showDivisions`, `read`, `size`, `fill`.
- **Looper** — `ce.components.looper`. Drive the Looper: run, loop length, sync, and per-lane enable. Commands: `run`, `seconds`, `bars`, `sync`, `quantize`, `lane`, `laneRest`, `phase`, `editable`, `showPlayhead`, `showGrid`, `showDivisions`, `read`, `size`, `fill`, `insert`, `remove`.
- **Orbit** — `ce.components.orbit`. Drive the Orbit: run, rate, phase, and each node's radius, angle and depth. Commands: `run`, `rate`, `bars`, `sync`, `phase`, `node`, `nodeRadius`, `nodeAngle`, `nodeRatio`, `nodeDepth`, `editable`, `showTrails`, `showSpokes`, `showRings`, `showValues`, `read`, `size`, `fill`, `insert`, `remove`.
- **Kinetic** — `ce.components.kinetic`. Drive the Kinetic field: run, gravity, bounce, friction — and launch the ball. Commands: `run`, `sync`, `gravity`, `bounce`, `friction`, `keepAlive`, `launch`, `velocity`, `editable`, `showTrail`, `showWalls`, `read`.
- **Constellation** — `ce.components.constellation`. Move the Constellation probe, change how it blends, and let it wander. Commands: `probe`, `mode`, `blend`, `run`, `rate`, `sync`, `bars`, `links`, `editable`, `showLinks`, `showField`, `showLabels`, `read`.
- **Timbre Pad** — `ce.components.timbre`. Move the Timbre puck and change how sharply it favours the nearest anchor. Commands: `move`, `power`, `anchorX`, `anchorY`, `axisX`, `axisY`, `editable`, `showField`, `showAnchors`, `showReadout`, `read`, `size`, `fill`, `insert`, `remove`.

### Routing and modulation

Components that send one value somewhere else, or shape it on the way.

- **Router** — `ce.components.router`. Re-point the Router: source, CC, channel, deadzone, and each destination's depth. Commands: `source`, `cc`, `channel`, `poly`, `invert`, `deadzone`, `input`, `dest`, `destDepth`, `curveX`, `curveY`, `curveShape`, `sourceControl`, `editable`, `showGrid`, `showDivisions`, `read`, `size`, `fill`, `insert`, `remove`.
- **Macro** — `ce.components.macro`. Turn the Macro, and re-weight what it drives. Commands: `value`, `slot`, `slotDepth`, `slotCurve`, `slotMin`, `slotMax`, `label`, `editable`, `showLanes`, `showValues`, `showDivisions`, `read`, `size`, `fill`, `insert`, `remove`.
- **Mod Matrix** — `ce.components.matrix`. Patch the modulation matrix from a script: one cell at a time, or clear the lot. Commands: `cell`, `clear`, `bipolar`, `step`, `cellStyle`, `editable`, `showLabels`, `showValues`, `read`, `size`, `fill`.
- **Constraint** — `ce.components.constraint`. Move one member of a Constraint group — the others rebalance around it. Commands: `mode`, `gap`, `member`, `editable`, `showValues`, `showBadge`, `read`, `size`, `fill`, `insert`, `remove`.
- **Envelope** — `ce.components.envelope`. Reshape an Envelope: a preset, a single breakpoint, the sustain point, the loop. Commands: `preset`, `pointX`, `pointY`, `pointCurve`, `sustain`, `loop`, `loopStart`, `loopEnd`, `timeMax`, `phase`, `addOnDoubleClick`, `snapX`, `snapY`, `fillUnder`, `phaseSource`, `editable`, `showPlayhead`, `showGrid`, `read`, `size`, `fill`, `insert`, `remove`.
- **Zone Splitter** — `ce.components.split`. Splits the keyboard into zones, each with its own channel and transpose. Commands: `preset`, `mute`, `channel`, `transpose`, `point`, `read`.

### Hands-on controls

Components you play with directly.

- **Ribbon** — `ce.components.ribbon`. Drive a Ribbon, and change what it does when you let go. Commands: `value`, `bipolar`, `returnMode`, `returnValue`, `returnTime`, `returnCurve`, `snap`, `orientation`, `style`, `label`, `valuePrecision`, `editable`, `showGlow`, `showValue`, `read`.
- **Crossfader** — `ce.components.crossfader`. Drive a Crossfader and change its law. Commands: `mix`, `law`, `bipolar`, `detent`, `returnMode`, `returnValue`, `returnTime`, `returnCurve`, `orientation`, `labelA`, `labelB`, `editable`, `showLabels`, `showGains`, `read`.
- **Vector Joystick** — `ce.components.joystick`. Move a Vector Joystick puck, and change what it does when released. Commands: `move`, `bipolar`, `returnMode`, `returnValue`, `returnAxes`, `returnTime`, `returnCurve`, `cornerLabel`, `editable`, `showGrid`, `showCrosshair`, `showCorners`, `showTrail`, `read`, `size`, `fill`.
- **Meter** — `ce.components.meter`. Drive a Meter from a script — a level a panel computes itself has nowhere else to go. Commands: `value`, `scale`, `peakHold`, `holdMs`, `decay`, `valueMin`, `valueMax`, `dbFloor`, `dbCeil`, `orientation`, `gradient`, `label`, `valuePrecision`, `valuePrefix`, `valueSuffix`, `zoneAt`, `source`, `showTicks`, `showScaleLabels`, `showValue`, `read`, `size`, `fill`, `insert`, `remove`.

### Displays

Components that show something rather than set it.

- **LCD Display** — `ce.components.lcd`. Write to a character LCD: a line at a time, plus backlight, brightness and scrolling. Commands: `text`, `clear`, `backlight`, `brightness`, `contrast`, `scroll`, `scrollSpeed`, `blink`, `cursor`, `cursorAt`, `value`, `anim`, `animPreset`, `animSpeed`, `animFps`, `animLoop`, `scrollMode`, `scrollRepeat`, `blinkRate`, `cursorBlink`, `valueMin`, `valueMax`, `valuePrecision`, `valuePrefix`, `valueSuffix`, `valueSource`, `brightnessSource`, `backlightSource`, `glyph`, `editText`, `showGlass`, `showGhost`, `showScanlines`, `showGrid`, `read`, `size`, `fill`.
- **Pixel Display** — `ce.components.pixel`. Drive a pixel display: its elements' text, visibility and position, plus backlight, brightness and animation. Commands: `text`, `label`, `show`, `blink`, `x`, `y`, `w`, `h`, `editText`, `backlight`, `brightness`, `contrast`, `gamma`, `glow`, `anim`, `animPreset`, `animSpeed`, `animLoop`, `animFps`, `layoutTransition`, `transitionMs`, `brightnessSource`, `backlightSource`, `showGlass`, `showGhost`, `showScanlines`, `showGrid`, `read`.

### Panel-wide

Components that act on the whole panel rather than one value.

- **Transport** — `ce.components.transport`. Set the panel Transport: tempo, swing, time signature, loop. Reading it is ce.time. Commands: `bpm`, `swing`, `source`, `beatsPerBar`, `beatUnit`, `loop`, `loopStart`, `loopBars`, `countIn`, `clockOut`, `clockDevice`, `runOnLoad`, `editable`, `showPosition`, `showTap`, `read`.
- **Panic** — `ce.components.panic`. Configure what a Panic button sends. Sending it is the global panic(). Commands: `scope`, `channel`, `resetControllers`, `centreBend`, `clearLocal`, `label`, `editable`, `showSummary`, `read`.
- **Setlist** — `ce.components.setlist`. Scenes you step through, for example from a footswitch. Commands: `next`, `prev`, `jump`, `enable`, `wrap`, `crossfade`, `read`.

---

# Appendix A: The same script in every language

The script from [chapter 1](#1-what-scripts-are-for), written in every language CEditor supports.
These are not hand-copied: each one is checked by that language's own tools whenever CEditor is
built, so they always work as shown.

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

**C++**

```cpp
void onValueChanged(CeContext& ctx, const CeEvent& event) {
  ctx.set("cutoff.value", ctx.scale(event.value, 0.0, 1.0, 80.0, 12000.0));
  ctx.set("resonance.value", ctx.scale(event.value, 0.0, 1.0, 0.1, 0.85));
  ctx.sendCC(1, 74, ctx.round(event.value * 127.0));
}
```

**C#**

```csharp
void OnValueChanged(CeContext ctx, CeEvent e) {
  ctx.SetValue("cutoff.value", ctx.Scale(e.Value, 0, 1, 80, 12000));
  ctx.SetValue("resonance.value", ctx.Scale(e.Value, 0, 1, 0.1, 0.85));
  ctx.SendCC(1, 74, (int)ctx.Round(e.Value * 127));
}
```

**Java**

```java
void onValueChanged(CeContext ctx, CeEvent e) {
  ctx.set("cutoff.value", ctx.scale(e.value, 0.0, 1.0, 80.0, 12000.0));
  ctx.set("resonance.value", ctx.scale(e.value, 0.0, 1.0, 0.1, 0.85));
  ctx.sendCC(1, 74, (int) ctx.round(e.value * 127.0));
}
```

# Appendix B: C++, C# and Java

In the editor, C++, C# and Java scripts are run directly from their source, so a handler moves real
controls as you type, without a compiler. This covers a large part of each language: functions and
lambdas, structs with methods, enums, `if`, `for`, `while` and `switch`, range-for, the
common containers (`vector`, `array`, `map`, `string`) and their everyday methods, the
`<algorithm>` and `<numeric>` functions, `try`/`catch`, casts, and `printf` and
`std::cout`, which print to the script console.

It does not cover templates you write yourself, classes (use structs instead), pointer arithmetic,
`goto`, or other libraries. Using one of those gives a clear error rather than a wrong result.
Note that every number is a decimal number in the editor, so dividing two whole numbers is not
rounded down.

**In the exported plugin these scripts are compiled**, and only the core commands are available
there: `set` and `get` (also spelled `setValue` and `getValue`), `log`, `sendCC`,
`sendNRPN`, `sendSysex` (a list of bytes or hex text), and `clamp`, `scale`, `round`,
`snap`, `lerp` and `curve`, which give exactly the same answers as in the editor. In C# each of
these also has its capitalised .NET name (`SetValue`, `Log`, `SendCC`, `Scale` …), the event's
fields are `e.Value` and `e.FirstTime`, and the handler may be called `OnValueChanged`.
Everything else that `ctx` offers works in the editor but not in the exported plugin — so keep a
script you mean to export to this core, or write it in Lua or JavaScript.

Two more things to know:

- In Java, `ctx.get` returns an `Object`, because a value can be a number, text or true/false.
  Read it as the type you want with `ctx.getDouble`, `ctx.getInt`, `ctx.getString` or
  `ctx.getBoolean`, which work the same in the editor and the plugin and never fail:
  `getDouble` gives a number as it is, true/false as 1 or 0 and anything else as 0; `getInt` is
  the same with the fraction dropped; `getString` gives text, or `""` for anything else;
  `getBoolean` gives true/false, or whether a number is not zero. Do not write
  `(int) ctx.get(…)` or `(Integer) ctx.get(…)`: it compiles, then fails, because a number comes
  back as a `Double`. The editor points out such a read, with the typed read to use instead.
- Only the handler for the script's own event is compiled, and `setup` is not called, so listeners
  added there with `on(…)` work in the editor only.

---

*This manual is generated from the same list of commands the editor uses, so it always matches
your version of CEditor. To change it, edit `CE/web/src/CE_Application/scripting/panelApi.js` or
`CE/web/scripts/generate-scripting-manual.mjs` and run `npm run docs:manual` in `CE/web`.*
