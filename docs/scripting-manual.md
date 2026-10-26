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

The form's name can also go after the path as an argument of its own: `get("cutoff",
"normalizedValue")`, and `set("cutoff", 0.5, "normalizedValue")`. A name that is not one of the
three is refused with a message, and nothing is read or written. When it is a form written another
way, other capitals or the British "normalised", the message names the one to write.

### The script's own control: self

The control or panel this script belongs to: the control for a control script, the panel for a panel script. Use it instead of a fixed name, so that one script works on every copy of a control.

`self.get("value")` reads the value of the script's own control, and `self.set("value", 0.5)`
sets it. Write it with a dot, not a colon, in Lua as well.

### The panel itself

Paths that start with `panel` reach the panel rather than a control: `get("panel.width")`,
`set("panel.bgColour", "FF202020")`. Its name, size and background can be read and changed this
way; the things that identify the panel, such as its file path, can only be read. Its colours
(`bgColour`, `gridColour`, `gridSubColour` and the image and texture tints) take what a
control's colour properties take, and refuse the same.

The colour of each of `bgGradient`'s stops is read the same way and stored as six digits,
RRGGBB, with no "#": `set("panel.bgGradient.stops.0.color", "red")` stores "FF0000". A stop has
no alpha of its own, because the gradient's opacity belongs to its layer (`bgGradientOpacity`),
so a colour with one, such as "80FF0000" or rgba() below 1, is refused. A control's gradients take
their stops the same way, `Background.Fill.gradient` and the rest, whether a stop is written by
its path or the gradient is written whole.

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
  contain and what each setting is when you leave it out. A setting that is not in that table
  refuses the whole command: nothing is done, the script console names the setting and lists the
  ones the command has, and the command gives back what it gives whenever it refuses: false from a
  command that says whether it worked, 0 from one that counts what it changed, an empty list from
  one that gives a list, a result whose `ok` is false from `ce.device.recallPreset`, and
  otherwise nothing. So a misspelling such as `{ duraton = 500 }` cannot pass for a setting that
  worked, with the panel window open or closed.
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

Runs first, when the panel opens, before any control exists.

Good to know:

- Set up MIDI here, or send the synth a start-up message.
- Controls cannot be read or changed yet.

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

Runs after `onPanelLoad`, to create, copy and arrange controls from a script.

Good to know:

- Controls a script made are removed before each run, so it starts from the panel as it was built.
- Panel view only.

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

Runs when any script on the panel fails.

Good to know:

- The error is written to the console as well.
- An error in `onError` itself is written to the console, and `onError` is not called for it, so it cannot loop.

**`info`** holds:

| Name | Type | What it is |
|---|---|---|
| `script` | text | The name of the script that failed. |
| `scriptId` | text | Its id, which stays the same when it is renamed. |
| `event` | text | The handler that was running, such as "onValueChanged". |
| `phase` | text | Whether it failed while being loaded or while handling an event.<br>One of "load" or "dispatch". |
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

Paints on top of the control this script is attached to.

Good to know:

- Runs when the control needs painting, not every frame: to animate, call `ce.draw.redraw()` from a timer.
- Panel view only.

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

Runs once the controls exist.

Good to know:

- Ask the synth for its settings here, and fill the controls.
- In a plug-in it runs again each time the window opens: put one-time work inside `if info.firstTime`.

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

Runs when the panel window closes.

Good to know:

- The preview stopped, or the plug-in's window was closed in the DAW.
- The scripts go on running: timers tick and MIDI arrives. `onPanelDestroy` runs when they stop.

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

Runs when the scripts are about to stop.

Good to know:

- Another panel was opened, the scripts were replaced, or the plug-in was removed.
- The last hook: timers, saved values and MIDI still work, so restore the synth or send a last dump here.
- Once, even when `onPanelClose` never ran.

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

Runs when the DAW saves the project: return what to keep.

Good to know:

- Return a table holding what you want saved.
- `store` shows what other scripts saved so far; it is to read only, and changing it saves nothing.
- In an exported plug-in only.

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

Runs when the DAW opens the project again: read your values back.

Good to know:

- `store` holds what your `onDawSaveState` returned, with every other script's.
- In an exported plug-in only.

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
| `onValueChange(value)` | Runs again and again while the value moves, as a knob is dragged: for what on screen follows the control. |
| `onValueChanged(value)` | Runs once, when the value settles, as a knob is let go: the moment to tell the synth. |
| `onActiveHandleChanged(info)` | A slider with more than one handle moved to another handle. `info.activeHandle` and `info.previousActiveHandle` are each "start", "current" or "end". |
| `onClick(mouse)` | The control was clicked. `mouse.x` and `mouse.y` say where, inside the control. |
| `onDoubleClick(mouse)` | The control was double-clicked. `mouse.x` and `mouse.y` say where. |
| `onPointerDown(mouse)` | A mouse button was pressed on the control. `mouse.x` and `mouse.y` say where, `mouse.button` which button, and `mouse.modifiers` the keys held. |
| `onPointerMove(mouse)` | The mouse moved while a button was held down on the control. `mouse.x` and `mouse.y` give the new position. |
| `onPointerUp(mouse)` | The mouse button was released. |
| `onHoverStart()` | The mouse pointer moved onto the control. |
| `onHoverEnd()` | The mouse pointer left the control. |
| `onWheel(wheel)` | The mouse wheel was turned over the control. `wheel.delta` says how far, and in which direction. |
| `onStateChanged(state)` | The control's look changed. `state` is "normal", "hover", "pressed" or "disabled". |

### Panel events

| Handler | When it runs, and what you get |
|---|---|
| `onControlChanged(info)` | A control on the panel changed. `info.target` is its name and `info.value` its new value: one handler for many controls. |
| `onTimer(info)` | A timer you started is due. `info.id` is the name you gave it in `ce.time.startTimer()` or `ce.time.syncTimer()`. |

### Time events

Raised while the transport plays. Accurate to about a thirtieth of a second — right for lights and
displays, not for timing audio.

| Handler | When it runs, and what you get |
|---|---|
| `onBeat(time)` | A beat went by while the transport plays. `time.bar` and `time.beat` give where, `time.beats` the beats so far, and `time.bpm` the tempo. Within a thirtieth of a second: right for a light or a display, not for timing sound. |
| `onBar(time)` | A bar began, on the downbeat, with onBeat. `time.bar` is its number, `time.beats` the beats so far, and `time.beatsPerBar` the beats in a bar. |
| `onTransport(time)` | The transport started, stopped or changed tempo. `time.playing` says whether it runs, `time.bpm` gives the tempo and `time.source` what drives it. |

### Synth and MIDI events

Raised when something arrives from a device. Values you `set` while handling these are not sent
back to the synth ([chapter 5](#5-talking-to-your-synth)).

| Handler | When it runs, and what you get |
|---|---|
| `onParameterReceived(info)` | The synth sent a parameter's value, read through its profile. `info.parameter` is the parameter's id and `info.value` its value, in the parameter's own units. |
| `onDumpReceived(dump)` | A dump from the synth arrived and was read; the controls bound to it are filled in already. `dump.values` holds each value by parameter id, `dump.kind` names the dump, such as "patch", and `dump.role` the synth it came from. |
| `onPresetChange(preset)` | The preset changed. `preset.slot`, `preset.program`, `preset.name`, `preset.category` and `preset.bankId` describe it; `preset.source` is "device" when the synth sent a Program Change, "panel" when the panel called recallPreset. |
| `onMidiIn(midi)` | A MIDI message arrived. `midi.bytes` holds it as received, `midi.status` its first byte and `midi.channel` its channel, counted from 0. |
| `onCcIn(cc)` | A controller message arrived. `cc.cc` is the controller number and `cc.value` its value; `cc.channel` counts from 0 here, 0 to 15, where sendCC and onNoteIn count 1 to 16. |
| `onNoteIn(note)` | A note was played. `note.channel`, 1 to 16 as in sendNote, `note.note` and `note.velocity` describe it. A note-on at velocity 0 is a note-off in MIDI, and arrives as onNoteOffIn. |
| `onNoteOffIn(note)` | A note was let go. `note.channel`, 1 to 16, `note.note` and `note.velocity` describe it; the velocity is the release velocity, or 0 for a note-on at velocity 0. |
| `onSysexIn(bytes)` | A SysEx message arrived. `bytes` holds it as a list of numbers. |
| `onDeviceConnected(device)` | A synth was connected and is ready. `device.role` names it and `device.profileId` its profile. |
| `onDeviceDisconnected(device)` | A synth is no longer connected and ready. `device.role` names it, and `device.message` may say why. |

### Component events

Raised by the ready-made components. Listen with `on("*", "onStep", fn)` to hear from every
component, or put the component's name in place of `"*"`. These need the panel window.

| Handler | When it runs, and what you get |
|---|---|
| `onStep(step)` | A sequencer moved to its next step: an Arpeggiator, Turing Machine, Phrase Sequencer or Looper. `step.target` is its name, `step.index` the step, counted from 1, `step.of` how many there are, and `step.notes` the notes it plays. |
| `onCycle(cycle)` | A sequence or loop came round to its start: an Arpeggiator, Turing Machine, Looper or Orbit. `cycle.target` is its name and `cycle.count` how many times it has come round since the panel opened. |
| `onHit(hit)` | A pad, key or strip was struck: a Chord Pad, Drum Pads or Note Ribbon. `hit.target` is its name, `hit.id` which pad or key, `hit.note` the note and `hit.velocity` how hard. |
| `onRelease(release)` | A pad, key or strip was let go. `release.target` is its name, `release.id` which pad or key, and `release.note` the note. |
| `onScene(scene)` | The Setlist moved to a scene, however it was chosen. `scene.target` is its name, `scene.index` the scene, counted from 1, and `scene.name` its name. |
| `onStage(stage)` | A Recorder or an Envelope moved to a new stage. `stage.target` is its name, `stage.stage` the new stage and `stage.previous` the old one: the Recorder's "idle", "armed", "recording" and "overdub", the Envelope's "sustain", "release" and "end". Not onStateChanged, which is hover and press. |
| `onSettled(settled)` | A Ribbon, Crossfader or Vector Joystick finished going back to its rest. `settled.target` is its name and `settled.value` where it came to rest. |
| `onBounce(bounce)` | The Kinetic ball hit a wall. `bounce.target` is its name, `bounce.x` and `bounce.y` where it hit, and `bounce.vx` and `bounce.vy` its speed across and down. |
| `onRecall(recall)` | The Constellation, in snap mode, moved to another preset. `recall.target` is its name, `recall.id` the preset and `recall.label` its label. |
| `onZone(zone)` | A Meter's reading crossed into another zone, such as from green into red. `zone.target` is its name, `zone.zone` the new zone, `zone.previous` the old one and `zone.value` the reading. |
| `onVoiced(voiced)` | A Zone Splitter or Harmoniser turned a played note into other notes. `voiced.target` is its name, `voiced.note` and `voiced.velocity` the note played, and `voiced.out` the notes it made. |

## Commands: The basics

Always available, in every script.

### ce.core: values, events and the console

The commands nearly every script uses: reading and changing values, deciding whether a change is sent to the synth, listening for events, and printing to the script console. These are always available and are written without a `ce.` prefix: `set(…)`, `get(…)`, `on(…)`, `log(…)`. Three are the exception, because their short names would clash with words the languages already use: `ce.core.action`, `ce.core.warn` and `ce.core.error`, also known as `defineAction`, `logWarn` and `logError`.

#### `set(path, value [, opts])`

Change a value on the panel: a control's value, or any property a path reaches.

Example: `set("Cutoff", 64)` turns the control called Cutoff to 64.

- `path` (path, required): A control's name, then a dot and the property: "Cutoff.value", "Cutoff.Transform.x". The name alone: its value. Names in any case.<br>"panel." and a property: the panel's own, such as "panel.width".<br>".normalizedValue" at the end: its position, 0 to 1, in place of the value.<br>Not a control on the panel, or a property it does not have: nothing is written, with a console error.
- `value` (any value, required): The new value.<br>A Knob's, a Slider's, a Number's or a Range's value, and a position: a number. Text that is a number: read as one.<br>A colour property: 6 hex digits (RRGGBB) or 8 (AARRGGBB), with or without "#"; "#000", a name such as "red", rgb() and hsl() are stored written out, as "#000000" and "#FF0000".<br>A gradient stop: RRGGBB, without alpha.<br>Left out, a number in any other form, or a colour in any other form: nothing is written, with a console error.
- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- Sent to the synth, except while a handler answers MIDI from the synth, so a value is not echoed back; `opts.transmit` decides otherwise.
- A new property on a section with a fixed shape: written, with a console warning that nothing reads it.
- Returns nothing.

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `transmit` | true or false | decided by where the write came from | Whether the change is sent to the synth: true sent, false not.<br>Left out: sent, except while a handler answers MIDI from the synth. |

```lua
set("path", value)
```

#### `get(path [, form])`

Read a value from the panel.

Example: `get("Cutoff")` gives the value of the control called Cutoff.

- `path` (path, required): A control's name, then a dot and the property: "Cutoff.value", "Cutoff.Transform.x". The name alone: its value. Names in any case.<br>"panel." and a property: the panel's own, such as "panel.width".<br>Not a control on the panel, or a property it does not have: no result, with a console error.<br>A property with no value yet: no result, without a word.
- `form` (text, optional): "value": the control's value.<br>"normalizedValue": its position, 0 to 1.<br>"midiValue": the number the synth is sent; only where the synth's profile is attached.<br>Case-insensitive.<br>Left out: "value", or the form the path ends with.<br>Any other: no result, with a console error naming the forms.

Good to know:

- Returns the value; a colour written out, as `set()` stores it.

```lua
get("path")
```

#### `noTransmit(fn)`

Change controls without sending anything to the synth.

Example: `noTransmit(function() set("Cutoff", 0) set("Reso", 0) end)` resets both, silently.

- `fn` (function, required): The changes to make.<br>Not a function: a console error.

Good to know:

- For an Init Patch button that resets many controls at once.
- Sending is back on when the function ends; an error in it is printed in the console.
- Returns nothing.

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

Send changes to the synth even while a handler answers MIDI from it.

Example: `transmit(function() set("Cutoff", 64) end)` sends 64 from inside a MIDI handler.

- `fn` (function, required): The changes to send.

Good to know:

- Outside such a handler changes are sent anyway.
- Returns nothing.

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

Call a function whenever an event happens.

Example: `on("*", "patchLoaded", fn)` calls fn each time any script emits patchLoaded.

- `target` (control name, required): What the event comes from: a control's name, in any case, or "*" for anything.<br>Left out: "*".
- `event` (event name, required): The event: a handler's name, such as "onValueChanged", or a name `emit()` announces.<br>Left out: nothing is set up, with a console error.
- `fn` (function, required): Called with the event's information.<br>Not a function, or left out: nothing is set up, with a console error.

Good to know:

- Put it at the top of a script, outside any function: it is set up once, when the script loads; running the script again replaces it.
- A script answers the event its Runs on setting names without it.
- Returns nothing. A function left out: nothing is set up, without a word.

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

Stop calling the functions `on()` set up for an event.

Example: `off("Cutoff", "onValueChanged")` stops this script's calls for Cutoff's value changes.

- `target` (control name, required): As `on()` was given it.<br>Left out: "*".
- `event` (event name, required): As `on()` was given it.

Good to know:

- This script's only; other scripts' go on.
- Returns nothing. One that was not set up: nothing, without a word.

```lua
off("target", "event")
```

#### `watch(path, fn)`

Call a function whenever a value on the panel changes.

Example: `watch("Cutoff", function(value, previous) log(value) end)` logs Cutoff's value each time it changes.

- `path` (text, required): What to watch: a path, as `set()` takes it.<br>Left out: nothing is set up, with a console error.
- `fn` (function, required): Called with the new value and the one before.<br>Not a function, or left out: nothing is set up, with a console error.

Good to know:

- Whatever made the change: a script, a drag, MIDI from the synth.
- Running the script again replaces it.
- Returns nothing. A function left out: nothing is set up, without a word.

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

Make a property follow a formula.

Example: `compute("Readout.Text.content", function() return get("Cutoff") .. " Hz" end)` keeps Readout showing Cutoff's value.

- `path` (text, required): The property to write: a path, as `set()` takes it.<br>Left out: nothing is set up, with a console error.
- `fn` (function, required): Returns the value to write.<br>Not a function, or left out: nothing is set up, with a console error.

Good to know:

- Worked out again whenever anything on the panel changes, and written to the path.
- Running the script again replaces it.
- Returns nothing. A function left out: nothing is set up, without a word.

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

Check or change every value written to a property before it lands.

Example: `intercept("Cutoff", function(value) return math.floor(value) end)` keeps Cutoff whole.

- `path` (text, required): The property: a path, as `set()` takes it.<br>Left out: nothing is set up, with a console error.
- `fn` (function, required): Called with the value and the one before.<br>A value returned: written in its place.<br>false: the change is refused.<br>Nothing: written as it is.<br>Not a function, or left out: nothing is set up, with a console error.

Good to know:

- Running the script again replaces it.
- Returns nothing. A function left out: nothing is set up, without a word.

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

Name a function, so other scripts and the panel can call it.

Example: `defineAction("randomize", fn)` lets any script call fn with `run("randomize")`.

- `name` (text, required): The action's name, in any case.<br>Left out: nothing is set up, with a console error.
- `fn` (function, required): Called with what `run()` passes; what it returns goes back.<br>Not a function, or left out: nothing is set up, with a console error.

Good to know:

- The panel offers it wherever a control can trigger an action.
- A name this script defined: replaced. One another script defined: this one is ignored, with a console error.
- Returns nothing. A name or a function left out: nothing is defined, without a word.

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

Announce an event of your own, with data.

Example: `emit("patchLoaded", { name = "Init" })` calls every function `on("*", "patchLoaded", fn)` set up.

- `name` (text, required): The event's name, as `on()` listens for it.
- `data` (any value, optional): Passed to each function.<br>Left out: nothing.

Good to know:

- It does not wait for an answer: `run()` gives one.
- An emit inside an emit, 16 deep: dropped, with a console error.
- Returns nothing.

```lua
emit("name", data)
```

#### `run(target.action [, args])`

Call an action another script defined, and give back what it returns.

Example: `run("randomize")` calls the action randomize and gives its result.

- `action` (text, required): The action's name, as `defineAction()` gave it; or "Control.action" for the function of that name in a control's script.
- `args` (any value, optional): Passed to the action.<br>Left out: nothing.

Good to know:

- Works across languages: only numbers, text, true or false, lists and tables pass in and out.
- Returns what the action returns. No script defines it: no result, with a console error.

```lua
run("target.action")
```

#### `log(message [, value])`

Print a message to the script console.

Example: `log("cutoff", 64)` prints cutoff 64.

- `message` (text, required): The text.<br>A number or a table: written as text.
- `value` (any value, optional): Printed after the message, with a space; a table written out.<br>Left out: the message alone.

Good to know:

- Changes nothing on the panel.
- Returns nothing.

```lua
log("message", value)
```

#### `ce.core.warn(message [, value])`

Print a warning to the script console.

Example: `logWarn("no tempo yet")` prints no tempo yet as a warning.

- `message` (text, required): The text.<br>A number or a table: written as text.
- `value` (any value, optional): Printed after the message, with a space; a table written out.<br>Left out: the message alone.

Good to know:

- Shown as a warning; the handler goes on.
- Returns nothing.

*Short name: `logWarn`.*

```lua
ce.core.warn("message")
```

#### `ce.core.error(message [, value])`

Print an error to the script console.

Example: `logError("patch not found")` prints patch not found as an error.

- `message` (text, required): The text.<br>A number or a table: written as text.
- `value` (any value, optional): Printed after the message, with a space; a table written out.<br>Left out: the message alone.

Good to know:

- It only prints: the handler goes on. To stop it, raise an error your language's way: error() in Lua, throw in JavaScript, raise in Python.
- Returns nothing.

*Short name: `logError`.*

```lua
ce.core.error("message")
```

## Commands: Notes, MIDI and time

MIDI in and out, the connected device, music theory, and musical time.

### ce.midi: sending and filtering MIDI

Sending MIDI yourself, and catching MIDI on its way in or out. Most panels do not need these, because a control bound to a synth parameter sends its own MIDI. Reach for them for messages the device profile does not cover: notes, program changes, clock, hand-built SysEx. Channels are always counted 1 to 16. The last part of this chapter is a set of helper functions for packing values into SysEx bytes.

Every send command reads its numbers the same way. A channel, controller or note outside its range, or anything that is not a number, is refused with a message and nothing is sent. A value past the end of its range is sent as the nearest end, and the first time a warning says so. Text that is a number is read as one, and a fraction is rounded.

#### `ce.midi.sendCC(channel, cc, value)`

Send a CC message.

Example: `sendCC(1, 74, 100)` sets controller 74 to 100 on channel 1.

- `channel` (number, required): The MIDI channel, from 1 to 16.
- `cc` (number, required): The controller number, from 0 to 127.
- `value` (number, required): The new value, from 0 to 127.

Good to know:

- CC means Control Change.

*Short name: `sendCC`.*

```lua
ce.midi.sendCC(channel, cc, value)
```

#### `ce.midi.sendNRPN(channel, msb, lsb, value)`

Send an NRPN message.

Example: `sendNRPN(1, 0, 5, 9000)` sets parameter 0 / 5 to 9000 on channel 1.

- `channel` (number, required): The MIDI channel, from 1 to 16.
- `msb` (number, required): The first half of the parameter number, from 0 to 127.
- `lsb` (number, required): The second half of the parameter number, from 0 to 127.
- `value` (number, required): The new value, from 0 to 16383. It is sent as two 7-bit halves.

Good to know:

- NRPN means Non-Registered Parameter Number. Many synths use NRPNs for settings that need more than 128 steps.

*Short name: `sendNRPN`.*

```lua
ce.midi.sendNRPN(channel, msb, lsb, value)
```

#### `ce.midi.sendRPN(channel, msb, lsb, value)`

Set the pitch-bend range or the tuning with an RPN message.

Example: `sendRPN(1, 0, 0, 12 * 128)` sets the pitch-bend range on channel 1 to 12 semitones.

- `channel` (number, required): The MIDI channel, from 1 to 16.
- `msb` (number, required): The first half of the parameter number, from 0 to 127.
- `lsb` (number, required): The second half of the parameter number, from 0 to 127. With msb 0, 0 is the pitch-bend range, 1 fine tuning and 2 coarse tuning.
- `value` (number, required): The new value, from 0 to 16383. For the pitch-bend range it is the semitones × 128, plus cents.

Good to know:

- RPN means Registered Parameter Number: its numbers mean the same on every synth.
- It is sent on controllers 101 and 100, where sendNRPN uses 99 and 98.

*Short name: `sendRPN`.*

```lua
-- Lua
ce.midi.sendRPN(1, 0, 0, 2 * 128)  -- pitch-bend range, 2 semitones
```
```js
// JavaScript
ce.midi.sendRPN(1, 0, 0, 2 * 128);  // pitch-bend range, 2 semitones
```

#### `ce.midi.sendSongPosition(beats)`

Tell a sequencer where in the song to continue from.

Example: `sendSongPosition(16)` is the start of bar 2 in 4/4.

- `beats` (number, required): The position from the start of the song, in sixteenth notes, from 0 to 16383. One sixteenth note is six clock ticks.

Good to know:

- This sends a Song Position Pointer. The sequencer plays from there when it gets Continue; Start always plays from the beginning.

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

Send MIDI bytes exactly as written.

Example: `sendMidi("90 3C 64")` starts note 60 on channel 1.

- `bytes` (bytes, required): A list of bytes from 0 to 255, or hex text such as "90 3C 64": one or two digits a byte, with spaces or commas between. Text with a longer run, such as "903C64", is refused with a message and nothing is sent.

Good to know:

- Nothing is added or changed. When another send command does what you need, use that one.

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

Play a note.

Example: `sendNote(1, "C3", 100, 500)` plays C3 on channel 1 for half a second.

- `channel` (number, required): The MIDI channel, from 1 to 16.
- `note` (note, required): A note number from 0 to 127, or a name such as "C3", "Eb4" or "F#2": a letter from A to G, then # or b if it has one, then the octave, in any case. A name that cannot be read, or a note outside 0 to 127, is refused with a message.
- `velocity` (number, required): How hard the note is played, from 0 to 127. 0 means note off.
- `ms` (number, optional): How long the note plays, in milliseconds, above 0. The note off is then sent for you. Left out, the note plays until sendNoteOff.

*Short name: `sendNote`.*

```lua
ce.midi.sendNote(1, 60, 100)
```

#### `ce.midi.interceptIn(fn)`

See every MIDI message from the synth before the panel uses it.

- `fn` (function, required): Called with the bytes of each message. What it returns decides what happens to the message.

| What `fn` returns | What happens |
|---|---|
| other bytes | The message is changed. |
| false | The message is dropped. |
| nothing | It goes through as it is. |

Good to know:

- Returned bytes are read as a send reads them. If they are not bytes, the message is dropped and the console says why.

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

See every MIDI message the panel sends before it goes out.

- `fn` (function, required): Called with the bytes of each message. What it returns decides what happens to the message.

| What `fn` returns | What happens |
|---|---|
| other bytes | The message is changed. |
| false | The message is dropped. |
| nothing | It goes out as it is. |

Good to know:

- It sees what a control sends by its own MIDI setting too, not only what scripts send.
- Returned bytes are read as a send reads them. If they are not bytes, the message is dropped and the console says why.

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

Act as if a MIDI message came from the synth.

Example: `feedMidi("B0 4A 40")` gives the controls on CC 74, channel 1, the value 64.

- `bytes` (bytes, required): A list of bytes from 0 to 255, or hex text such as "90 3C 64": one or two digits a byte, with spaces or commas between. Text with a longer run, such as "903C64", is refused with a message and nothing is sent.

Good to know:

- The controls, the note input and the transport react as they would to the synth. interceptMidiIn sees the message first.

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

Send everything a block of code sends to another device instead of the main synth.

- `role` (text, required): The device's role, such as "drums". The MIDI settings give each role its output.
- `fn` (function, required): The code whose MIDI goes to that device. Only what it sends is affected, as with noTransmit.

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

Release a note.

Example: `sendNoteOff(1, "C3")` releases C3 on channel 1.

- `channel` (number, required): The MIDI channel, from 1 to 16.
- `note` (note, required): A note number from 0 to 127, or a name such as "C3", "Eb4" or "F#2": a letter from A to G, then # or b if it has one, then the octave, in any case. A name that cannot be read, or a note outside 0 to 127, is refused with a message.
- `velocity` (number, optional): The release velocity, from 0 to 127. It is 0 when left out.

Good to know:

- Every note started with sendNote without a length needs its own note off.

*Short name: `sendNoteOff`.*

```lua
ce.midi.sendNoteOff(1, 60)
```

#### `ce.midi.sendProgramChange(channel, program [, bankMsb, bankLsb])`

Switch the synth to another sound with a Program Change.

Example: `sendProgramChange(1, 0)` picks the sound most synths call 1.

- `channel` (number, required): The MIDI channel, from 1 to 16.
- `program` (number, required): The program number, from 0 to 127. Most synths count from 1, so 0 is the one they call 1.
- `bankMsb` (number, optional): The first half of the bank number, from 0 to 127. Given, a Bank Select is sent before the Program Change: controller 0, and controller 32 when bankLsb is given too.
- `bankLsb` (number, optional): The second half of the bank number, from 0 to 127.

*Short name: `sendProgramChange`.*

```lua
ce.midi.sendProgramChange(1, 0)
```

#### `ce.midi.sendPitchBend(channel, value)`

Send pitch bend.

Example: `sendPitchBend(1, 8192)` is no bend on channel 1.

- `channel` (number, required): The MIDI channel, from 1 to 16.
- `value` (number, required): From 0, all the way down, to 16383, all the way up; 8192 is the centre. Left out, the bend goes back to the centre.

Good to know:

- The synth decides how many semitones a full bend is. sendRPN can set it.

*Short name: `sendPitchBend`.*

```lua
ce.midi.sendPitchBend(1, 8192)
```

#### `ce.midi.sendAftertouch(channel, pressure [, note])`

Send aftertouch, the pressure on keys while they are held.

Example: `sendAftertouch(1, 80)` sends pressure 80 for the whole of channel 1.

- `channel` (number, required): The MIDI channel, from 1 to 16.
- `pressure` (number, required): How hard, from 0 to 127.
- `note` (note, optional): One note, for polyphonic aftertouch, as a number or a name as for sendNote. Left out, the pressure is for the whole channel: channel pressure.

*Short name: `sendAftertouch`.*

```lua
ce.midi.sendAftertouch(1, 64)
```

#### `ce.midi.sendClock()`

Send one MIDI clock tick.

Good to know:

- There are 24 ticks to a quarter note, so call it from a timer.

*Short name: `sendClock`.*

```lua
ce.midi.sendClock()
```

#### `ce.midi.sendTransport(action)`

Start, continue or stop a connected sequencer or drum machine.

Example: `sendTransport("start")` starts it from the beginning.

- `action` (text, required): "start" (FA), "continue" (FB) or "stop" (FC). Case-insensitive. Any other action, or none, is refused with a message and nothing is sent.

*Short name: `sendTransport`.*

```lua
ce.midi.sendTransport("start")
```

#### `ce.midi.sendSysex(bytes)`

Send a SysEx message.

Example: `sendSysex("F0 7E 7F 06 01 F7")` asks the synth what model it is.

- `bytes` (bytes, required): A list of bytes, or hex text such as "F0 41 10 42 F7": one or two digits a byte, with spaces or commas between. In a list, a byte is a whole number from 0 to 255 or text that is one hex byte, such as "F7". Anything else, such as "F04110" or 300, is refused with a message and nothing is sent.

Good to know:

- SysEx means System Exclusive: messages each manufacturer defines for its own synths.
- F0 at the start and F7 at the end are added when they are missing.

*Short name: `sendSysex`.*

```lua
ce.midi.sendSysex(bytes)
```

#### `ce.midi.checksum(type, bytes [, opts]) -> number`

Work out the checksum a synth expects at the end of a SysEx message.

Example: `checksum("roland", {0x40, 0x00, 0x7F, 0x00})` gives 0x41.

- `type` (text, required): How the synth works it out: "sum-7bit", "roland-7bit" (also written "roland" or "yamaha"), "ones-complement-7bit", "xor-7bit", "offset-7bit", "sum-8bit", "twos-complement-8bit", "crc8", "crc16-ccitt", "crc16-modbus" or "crc32". Case-insensitive. An unknown name, or none, returns nothing and prints the names it accepts.
- `bytes` (bytes, required): The bytes it covers, as a list or as hex text. Bytes that are not bytes return nothing, with a message.

Good to know:

- The 7-bit types fit in one SysEx byte. The CRC types do not: split their result into bytes with to7bit before sending.

*Short name: `checksum`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `offset` | number | 0 | The constant the "offset-7bit" method subtracts from. Only that method reads it; the value varies by manufacturer. |

```lua
ce.midi.checksum("roland", bytes)
```

#### `ce.midi.panic([opts])`

Stop every note and sound on every channel.

Good to know:

- It sends All Sound Off, All Notes Off and Reset All Controllers.

*Short name: `panic`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `channel` | number (1 to 16) | all sixteen channels | Silence one channel instead of every one, from 1 to 16. Anything else, such as "all", is refused and nothing is sent. |
| `resetControllers` | true or false | true | Whether to send Reset All Controllers (121) as well as the two note-off messages. Set false to leave pitch bend and modulation where they are. |

```lua
ce.midi.panic()
```

#### Helper functions in ce.midi

| Function | What it does |
|---|---|
| `ce.midi.to7bit(v, count, order)` | Split a number into SysEx bytes. Example: `to7bit(1000, 2)` gives {7, 104}. `v` (number, required): The number to split, from 0. Two bytes hold up to 16383, three up to 2097151, four up to 268435455.<br>A fraction: rounded down.<br>One that does not fit in the bytes, not a number, or left out: no result, with a console error. `count` (number, optional): How many bytes of 7 bits to make, from 1 to 4.<br>Left out: 2.<br>Any other: no result, with a console error. `order` (text, optional): "msb": the high byte first.<br>"lsb": the low byte first.<br>Case-insensitive.<br>Left out: "msb".<br>Any other: no result, with a console error. Returns a list of bytes, each from 0 to 127. from7bit joins them back. Short name: `to7bit`. |
| `ce.midi.from7bit(bytes, order)` | Join SysEx bytes back into one number. Example: `from7bit({7, 104})` gives 1000. `bytes` (list of bytes, required): 1 to 4 bytes, each from 0 to 127, as a list or as hex text.<br>More or fewer, a byte above 127, not a list of bytes, or left out: no result, with a console error. `order` (text, optional): "msb": the high byte first.<br>"lsb": the low byte first.<br>Case-insensitive.<br>Left out: "msb".<br>Any other: no result, with a console error. Returns a number. Short name: `from7bit`. |
| `ce.midi.to14bit(v)` | Split a number into two 7-bit halves, msb and lsb. Example: `to14bit(8192)` gives msb 64 and lsb 0. `v` (number, required): The number, from 0 to 16383.<br>A fraction: rounded down.<br>Outside 0 to 16383, not a number, or left out: no result, with a console error. Returns { msb, lsb }, each from 0 to 127. Short name: `to14bit`. |
| `ce.midi.from14bit(msb, lsb)` | Join two 7-bit halves into one number. Example: `from14bit(64, 0)` gives 8192. `msb` (number, required): The high half, a whole number from 0 to 127.<br>Any other, or left out: no result, with a console error. `lsb` (number, required): The low half, a whole number from 0 to 127.<br>Any other, or left out: no result, with a console error. Returns a number from 0 to 16383. Short name: `from14bit`. |
| `ce.midi.toNibbles(byte)` | Split a byte into its two 4-bit halves, its nibbles. Example: `toNibbles(0x4A)` gives hi 0x4 and lo 0xA. `byte` (number, required): A byte, from 0 to 255.<br>A fraction: rounded down.<br>Outside 0 to 255, not a number, or left out: no result, with a console error. Returns { hi, lo }, each from 0 to 15. Some synths send every byte this way. Short name: `toNibbles`. |
| `ce.midi.fromNibbles(hi, lo)` | Join two 4-bit halves back into one byte. Example: `fromNibbles(0x4, 0xA)` gives 0x4A. `hi` (number, required): The high half, a whole number from 0 to 15.<br>Any other, or left out: no result, with a console error. `lo` (number, required): The low half, a whole number from 0 to 15.<br>Any other, or left out: no result, with a console error. Returns a byte, from 0 to 255. Short name: `fromNibbles`. |
| `ce.midi.nibblize(bytes)` | Split every byte in a list into two 4-bit halves. Example: `nibblize({0x4A, 0x10})` gives {0x4, 0xA, 0x1, 0x0}. `bytes` (list of bytes, required): The bytes, each from 0 to 255, as a list or as hex text.<br>Not a list of bytes, or left out: no result, with a console error. Returns a list twice as long, the high half of each byte first. Short name: `nibblize`. |
| `ce.midi.denibblize(bytes)` | Join a list of 4-bit halves back into bytes. Example: `denibblize({0x4, 0xA, 0x1, 0x0})` gives {0x4A, 0x10}. `bytes` (list of bytes, required): Pairs of halves, the high half first, each from 0 to 15, as a list or as hex text.<br>An odd count, a half above 15, not a list of bytes, or left out: no result, with a console error. Returns a list half as long. Short name: `denibblize`. |
| `ce.midi.toAscii(str, length)` | Turn text, such as a patch name, into character codes. Example: `toAscii("Lead", 6)` gives {76, 101, 97, 100, 32, 32}. `str` (text, required): The text, in ASCII: letters without accents, digits, spaces and the signs on an English keyboard.<br>A character outside ASCII, not text, or left out: no result, with a console error. `length` (number, optional): The length of the field, from 1.<br>Shorter text: filled out with spaces.<br>Longer text: cut to the length, with a console warning the first time.<br>Left out: the text as it is.<br>Any other: the text as it is, with a console warning the first time. Returns a list of codes, each from 0 to 127. fromAscii turns them back into text. Short name: `toAscii`. |
| `ce.midi.fromAscii(bytes)` | Turn character codes back into text, such as a patch name read from a dump. Example: `fromAscii({76, 101, 97, 100})` gives "Lead". `bytes` (list of bytes, required): The character codes, each from 0 to 127, as a list or as hex text.<br>A code above 127, not a list of bytes, or left out: no result, with a console error. Returns the text. Short name: `fromAscii`. |
| `ce.midi.toOffset(v, center)` | Add a centre to a value that can go below zero, so it fits in a MIDI byte. Example: `toOffset(-10, 64)` gives 54. `v` (number, required): The value, which may be negative.<br>Not a number, or left out: no result, with a console error. `center` (number, required): The number that stands for zero, often 64.<br>Not a number, or left out: no result, with a console error. Returns the value plus the centre, not held to 0 to 127. Short name: `toOffset`. |
| `ce.midi.fromOffset(b, center)` | Take the centre off a MIDI byte, to get back a value that can go below zero. Example: `fromOffset(54, 64)` gives -10. `b` (number, required): The byte, as the synth sends it.<br>Not a number, or left out: no result, with a console error. `center` (number, required): The number that stands for zero, often 64.<br>Not a number, or left out: no result, with a console error. Returns the byte minus the centre. Short name: `fromOffset`. |
| `ce.midi.toSigned(v, bits)` | Turn a negative number into the bits a synth stores it as. Example: `toSigned(-1, 8)` gives 255. `v` (number, required): The number: -128 to 127 for 8 bits, -64 to 63 for 7.<br>From 0: comes back unchanged.<br>A fraction: rounded down.<br>Outside the range, not a number, or left out: no result, with a console error. `bits` (number, required): How many bits the synth uses for it, from 1 to 32, such as 7 or 8.<br>Any other, or left out: no result, with a console error. This is called two's complement. fromSigned reads it back. Returns a number from 0 below 2 to the power of bits: 0 to 255 for 8 bits. Short name: `toSigned`. |
| `ce.midi.fromSigned(b, bits)` | Read a negative number from the bits a synth stores it as. Example: `fromSigned(255, 8)` gives -1. `b` (number, required): The stored value, as the synth sends it: a whole number from 0 below 2 to the power of bits, 0 to 255 for 8 bits.<br>Any other, or left out: no result, with a console error. `bits` (number, required): How many bits the synth uses for it, from 1 to 32, such as 7 or 8.<br>Any other, or left out: no result, with a console error. This reads two's complement, as toSigned writes it. Returns a number: -128 to 127 for 8 bits. Short name: `fromSigned`. |
| `ce.midi.getBits(value, start, count) -> number` | Read a setting from a byte. Example: `getBits(0xB4, 4, 3)` gives 3. `value` (number, required): A number of up to 32 bits, or a list of bytes, where the bits run on from one byte into the next, eight to a byte. A list item that is not a byte from 0 to 255 is refused with a message. `start` (number, required): The first bit of the setting, counted from 0 at the right, the lowest bit. `count` (number, required): How many bits the setting has, from 1 to 32. Bits past the end of the value are refused with a message, not read as 0. Short name: `getBits`. |
| `ce.midi.setBits(value, start, count, bits) -> number\|list` | Change a setting in a byte. Example: `setBits(0xB4, 4, 3, 5)` gives 0xD4. `value` (number, required): A number of up to 32 bits, or a list of bytes. A number gives back a number, and a list gives back a new list: the list passed in is not changed. `start` (number, required): The first bit of the setting, counted from 0 at the right, the lowest bit. `count` (number, required): How many bits the setting has, from 1 to 32. `bits` (number, required): The new setting. A value that does not fit in the bits is refused with a message, not cut down to fit. Short name: `setBits`. |
| `ce.midi.read(bytes, offset, count [, opts]) -> number` | Read a number from a SysEx message. Example: `bytesRead(msg, 6, 2)` reads bytes 6 and 7. `bytes` (bytes, required): The message, as a list of bytes or as hex text. `offset` (number, required): Where the number starts, counted from 0. `count` (number, required): How many bytes the number takes, from 1 to 4. Bytes past the end of the message are refused with a message. Offsets count from 0 in every language, Lua included, as dump layouts count them. By default the bytes are SysEx's 7-bit bytes, high byte first, the way to7bit writes them. The options can say otherwise. Short name: `bytesRead`. |
| `ce.midi.write(bytes, offset, count, value [, opts]) -> list` | Write a number into a SysEx message. Example: `bytesWrite(msg, 6, 2, 1000)` writes 1000 into bytes 6 and 7. `bytes` (bytes, required): The message, as a list of bytes or as hex text.<br>It is not changed: a new list comes back. `offset` (number, required): Where the number starts, counted from 0. The write may run past the end, and the list grows, but it cannot start past the end. `count` (number, required): How many bytes the number takes, from 1 to 4. `value` (number, required): The number to write. A number that does not fit in the bytes is refused with a message. Offsets count from 0 in every language, Lua included, as dump layouts count them. An option other than bits and order is refused with a message, and nothing comes back. Short name: `bytesWrite`. |
| `ce.midi.slice(bytes, offset [, count]) -> list` | Copy part of a list of bytes into a new list. Example: `fromAscii(bytesSlice(dump, 10, 12))` reads the 12-letter name at byte 10. `bytes` (bytes, required): The list, or hex text. `offset` (number, required): Where to start copying, counted from 0. `count` (number, optional): How many bytes to copy. Left out, every byte to the end. Bytes past the end are refused with a message. Offsets count from 0 in every language, Lua included, as dump layouts count them. Short name: `bytesSlice`. |
| `ce.midi.put(bytes, offset, values) -> list` | Write a run of bytes into a copy of a list. Example: `bytesPut(dump, 10, toAscii("Lead", 12))` writes a patch name from byte 10. `bytes` (bytes, required): The list, or hex text.<br>It is not changed: a new list comes back. `offset` (number, required): Where to start writing, counted from 0. The write may run past the end, and the list grows, but it cannot start past the end. `values` (bytes, required): The bytes to write, as a list or as hex text. Offsets count from 0 in every language, Lua included, as dump layouts count them. Short name: `bytesPut`. |
| `ce.midi.find(bytes, pattern [, from]) -> number` | Find where a run of bytes first appears in a list, such as a patch's header in a bulk dump. Example: `bytesFind(dump, "F0 41")` gives the offset of the first F0 41. `bytes` (bytes, required): The list to search, or hex text. `pattern` (bytes, required): The bytes to find, as a list or as hex text. `from` (number, optional): Where to start looking, counted from 0. It is 0 when left out. When the bytes are not there it gives nothing, without a message. Short name: `bytesFind`. |
| `ce.midi.toHex(bytes) -> string` | Write bytes as hex text. Example: `bytesToHex({240, 65, 16, 247})` gives "F0 41 10 F7". `bytes` (bytes, required): The bytes, as a list. It is the form the console shows MIDI in, and the form every send reads. Short name: `bytesToHex`. |
| `ce.midi.fromHex(text) -> list` | Read hex text into a list of bytes. Example: `bytesFromHex("F0 41 10 F7")` gives {240, 65, 16, 247}. `text` (text, required): One or two digits a byte, with or without 0x, with spaces or commas between, as every send reads it. Text with a longer run, such as "F04110", is refused with a message, and so is anything that is not text. Short name: `bytesFromHex`. |
| `ce.midi.toBase64(bytes) -> string` | Write bytes as base64 text, to keep a dump in a setting or in state. Example: `bytesToBase64({240, 65, 16, 247})` gives "8EEQ9w==". `bytes` (bytes, required): The bytes, as a list. Base64 is about a third shorter than hex. It uses the standard alphabet, with = padding. Short name: `bytesToBase64`. |
| `ce.midi.fromBase64(text) -> list` | Read base64 text back into a list of bytes. Example: `bytesFromBase64("8EEQ9w==")` gives {240, 65, 16, 247}. `text` (text, required): The base64 text. Spaces and line breaks are ignored; anything else that is not base64 is refused with a message. Short name: `bytesFromBase64`. |

### ce.device: your synth

Working with the synth through its device profile — the description of the synth's parameters, messages and dumps that you build in the Device Profile Designer. With a profile you work in parameter names and real values, and the profile turns them into MIDI. These commands ask the synth for its settings, recall presets, read and change parameters by name, and describe a synth from a script when it has no profile. `role` picks which device to talk to when a panel uses more than one; it defaults to "mainSynth".

#### `ce.device.requestDump(kind [, fn [, opts]])`

Ask the synth to send a dump: every setting of a patch in one message.

Example: `requestDump("patch")` asks the synth for its patch dump.

- `kind` (text, required): A dump the device profile defines, such as "system", or one declared with `deviceDefineDump()`; or a request's own id, such as "requestSystem".<br>Any other: rejected with a console error.
- `fn` (function, optional): Called as fn(values, info) when the reply arrives, or when it does not.<br>`info.ok` false: nothing arrived within `opts.timeout`.<br>A request answered by several dumps at once: none is waited for; name the dump wanted.
- `opts` (options, optional): The option below.

Good to know:

- When it arrives, the bound controls are filled and `onDumpReceived` runs.
- Returns true when the request went out. Rejected: false, with a console error.

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

Switch the synth to a stored preset.

Example: `recallPreset(64)` switches to preset 64, the first of the second bank on a synth whose banks hold 64.

- `slot` (number, required): Preset number across all banks, counted from 0, as the device profile numbers them: not the MIDI program number.<br>Not a whole number from 0: rejected with a console error.
- `opts` (options, optional): The option below.

Good to know:

- Sent as the device profile says the synth needs: a Program Change, a Bank Select and a Program Change, or a SysEx message.
- Returns { ok, error, slot, name, category, messages }; refused: `ok` false, `error` saying why, and a console error.

*Short name: `recallPreset`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `role` | string | "mainSynth" | Which device to recall on, when the panel names more than one. |

```lua
ce.device.recallPreset(0)
```

#### `ce.device.preset([role])`

Describe the preset loaded now.

Example: `preset().name` gives the loaded preset's name.

- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- Returns { slot, program, name, category, bankId, bankLabel, writable, source }.
- What the panel has seen: a Program Change arriving or a `recallPreset()` going out. Until then `slot` is -1: most synths do not say, and cannot be asked.

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

Fill the panel from a dump, without sending anything to the synth.

Example: `applyDump({ cutoff = 64 })` sets the controls bound to cutoff to 64.

- `bytes` (bytes, required): A table of parameter ids and values: applied as they are.<br>Or the dump's bytes, a list of numbers or hex text read a byte at a time as `sendSysex()` reads it: decoded by the device profile.<br>Bytes in the panel view: not decoded, with a console line; the exported plug-in decodes them.

Good to know:

- Returns how many values were applied.

*Short name: `applyDump`.*

```lua
ce.device.applyDump(bytes)
```

#### `ce.device.sendDump(kind)`

Build a dump from the panel's values and send it to the synth.

Example: `sendDump("patch")` sends the panel's values to the synth as its patch dump.

- `kind` (text, required): A dump the device profile defines, by its id, as `requestDump()` takes it.<br>Any other: rejected with a console error.

Good to know:

- Rejected: with a console error; nothing is sent.

*Short name: `sendDump`.*

```lua
ce.device.sendDump("patch")
```

#### `ce.device.buildDump(kind)`

Build a dump from the panel's values, and give back its bytes without sending them.

Example: `local bytes = buildDump("patch")` keeps the panel's values as a patch dump.

- `kind` (text, required): A dump the device profile defines, by its id, or one declared with `deviceDefineDump()`.<br>Any other: rejected with a console error.

Good to know:

- A profile's dump is built by the device host: in the panel view, only a dump declared with `deviceDefineDump()` is.
- Returns a list of bytes. Rejected: no result, with a console error.

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

Describe the device profile in use for a device.

Example: `deviceProfile().name` gives the main synth's profile name.

- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- Returns { id, name, role, connected, … }; no profile chosen: no result.

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

List the synth's parameters, as the device profile describes them.

Example: `deviceParameters({ group = "Filter" })` lists the filter's parameters.

- `opts` (options, optional): The options below, every one of which must match.<br>Left out: every parameter.<br>Not a table: an empty list, with a console error.

Good to know:

- Returns a list of { id, name, group, type, min, max, access }; none to show: an empty list.

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

Describe one of the synth's parameters, by its id.

Example: `deviceParameter("cutoff").max` gives the highest value cutoff takes.

- `id` (text, required): The parameter's id, as the device profile names it.<br>Not one of its parameters: no result, without a word.<br>Left out: no result, with a console error.
- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- Returns { id, name, group, type, min, max, access }.
- Use it to see whether a synth has a parameter before writing it.

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

Read the last value the synth reported for a parameter.

Example: `deviceRead("cutoff")` gives the cutoff the synth last sent.

- `id` (text, required): The parameter's id.<br>Never reported: no result, without a word; not 0.<br>Left out: no result, with a console error.
- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- Not a live query: what arrived in a dump or a parameter message; the synth is not asked.

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

Change a parameter on the synth by its id, without a control.

Example: `deviceWrite("cutoff", 64)` sends cutoff 64 to the synth.

- `id` (text, required): The parameter's id, as the device profile names it or `deviceDefineParameter()` declared it.<br>Not one of them: rejected with a console error.
- `value` (number or text, required): In the parameter's own units: those `deviceParameter()` gives the min and max of.<br>A choice: its name, in any case, or its number.<br>One it cannot read: rejected with a console error.
- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- The device profile builds the message.
- Returns true when the message was dispatched, not whether the synth took it. Rejected: false, with a console error; nothing is sent.

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

Check whether a device is connected and ready.

Example: `deviceConnected()` gives true once the main synth is.

- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- Quick to call: check it before asking for a dump.
- Returns true or false.

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

Describe a synth parameter from the script.

Example: `deviceDefineParameter("cutoff", { cc = 74 })` declares cutoff as CC 74.

- `id` (text, required): The id to give it.<br>One the profile has: replaced, for this project.
- `spec` (options, required): How it reaches the synth, `cc`, `nrpn` or `sysex`, and the options below.<br>Anything wrong in it: rejected with a console error saying what: no MIDI form, a byte that is not one, an unknown type, encoding, checksum or $token, or a range the MIDI form cannot carry.
- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- For a synth with no device profile, or a parameter a profile has wrong.
- Returns true when it was defined. Rejected: false, with a console error; nothing is defined.

*Short name: `deviceDefineParameter`.*

**`spec`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `name` | text | the id | What to call it in the parameter list. |
| `group` | text | — | Which group to file it under, such as "Filter". |
| `type` | text | "number" | What kind of value it holds: "number" (or "integer"), "boolean", "choice" (or "enum") for one of `choices`, or "text" for a name read out of a dump, which cannot be written on its own. A number reads a number or decimal text such as "64". A boolean reads true or false, a number (0 is off, any other number is on), or "on", "off", "true" or "false" in any case. Any case of the type is read; another type is refused. |
| `min` | number | 0 | The lowest value it accepts. Nothing here sends a negative number, so a minimum below 0 is refused: declare what the synth receives and add the offset in your script with ce.midi.toOffset. |
| `max` | number | 127 | The highest value it accepts, up to what the MIDI form carries: 127 for a CC or one SysEx byte, 16383 for an NRPN or "u14". With choices given as names it is the last one's value unless you say otherwise. A higher maximum is refused. |
| `access` | text | "readwrite" | Whether the synth lets you read this parameter, write it, or both. |
| `choices` | list of text | — | The settings, in order, when the parameter is a choice: their names, each worth its position plus `min` (so { "LP", "HP", "BP" } sends 0, 1 and 2), or { id, value } pairs. write() takes a name in any case, or the number itself; another name is refused, with the choices listed. |
| `trueValue` | number | 1 | What a boolean sends when it is on. |
| `falseValue` | number | 0 | What a boolean sends when it is off. |
| `cc` | number (0 to 127) | — | Send it as this CC number, 0 to 127. The simplest of the three wire formats. |
| `nrpn` | object | — | Send it as an NRPN, as { msb, lsb } or the two numbers as a list. |
| `sysex` | text or list | — | Send it as a SysEx message built from this template, a list or text such as "F0 41 10 $value F7". Each entry is one byte, a number from 0 to 255 or one or two hex digits, or one of the tokens $value, $deviceId (16 unless `variables` says otherwise), $channel, $checksumStart, $checksum, or any $name you listed in `variables`. Anything else is refused. The checksum covers everything after F0 unless $checksumStart says where it begins. A Roland checksum covers only the address and the data, so a Roland template (41 after F0) with $checksum and no $checksumStart is defined with a warning. |
| `channel` | number (1 to 16) | 1 | The MIDI channel to send on, 1 to 16. In a SysEx template it is what $channel puts there. |
| `encoding` | text | "u7" | How the number is packed into a SysEx template's $value: "u7" is one byte, "u14" two, most significant first, as ce.midi.to14bit gives them ("to14bit" is read as the same), and "nibbled" is `nibbles` 4-bit nibbles, most significant first. "boolean-u7", the device profiles' name for a switch's byte, is one byte too. Any case is read; another name is refused. |
| `nibbles` | number | 2 | How many nibbles a "nibbled" value takes, 1 to 8. |
| `checksum` | text | "roland" | Which checksum $checksum puts in the template: any of ce.midi.checksum's names, in any case, computed the same way. One wider than a byte, such as a CRC, takes as many bytes as it needs. An unknown name is refused, with the names listed. |
| `variables` | object | — | Extra named bytes your SysEx template can refer to as $name, such as an address or a part number. Each is a number from 0 to 255, or one or two hex digits as text. |
| `length` | number | 0 | For a text parameter, how many characters it holds. |
| `pad` | number | 32 | For a text parameter, the character code that fills it out to `length` (32 is a space). |

```lua
-- Lua
ce.device.defineParameter("cutoff", { name = "Cutoff", group = "Filter", min = 0, max = 127, cc = 74 })
```
```js
// JavaScript
ce.device.defineParameter("cutoff", { name: "Cutoff", group: "Filter", min: 0, max: 127, cc: 74 });
```

#### `ce.device.defineDump(kind, spec [, role]) -> boolean`

Describe a SysEx dump layout from the script.

Example: `deviceDefineDump("patch", { request = "F0 7D 01 F7", match = { prefix = "F0 7D 02" }, offset = 3, fields = { { parameter = "cutoff", offset = 0 } } })` declares a patch dump that starts with cutoff.

- `kind` (text, required): The name to give the dump, as `requestDump()` and `buildDump()` take it.
- `spec` (options, required): The options below: the bytes that ask for it, how to recognise it, and where each value sits.<br>Bytes are read as `deviceDefineParameter()` reads them.<br>Anything wrong in it, or no prefix to recognise it by: rejected with a console error saying what.
- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- Every field's parameter must be declared with `deviceDefineParameter()` first.
- A dump of the layout arriving fills the bound controls and runs `onDumpReceived`, as a device profile's does.
- Returns true when it was defined. Rejected: false, with a console error; nothing is defined.

*Short name: `deviceDefineDump`.*

**`spec`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `name` | text | the kind | What to call this dump where it is listed. |
| `request` | text or list | — | The bytes that ask the synth for it, a list or text such as "F0 7D 00 F7", one byte to an entry. |
| `match` | object | required | How to recognise the reply, as { prefix, suffix } — the bytes a matching message starts and ends with, which may include $deviceId (16) and $channel (1). A layout with no prefix is refused, because it would match every SysEx that arrives. |
| `prefix` | text or list | — | The same as `match.prefix`, used when `match` does not give one. |
| `suffix` | text or list | — | The same as `match.suffix`, used when `match` does not give one. |
| `offset` | number | 0 | How many bytes in from the start of the message the values begin. |
| `size` | number | whatever is left | How many bytes of values there are. |
| `checksum` | text or object | — | Which checksum the message carries, so it is checked on the way in and computed by buildDump: any of ce.midi.checksum's names. Named alone, it sits just before the suffix (at the end when there is none) and covers every byte from the end of the prefix up to it, which is the Roland layout when the prefix is the header. Anywhere else, give { type, fromOffset, toOffset, byteOffset }, counted from the start of the message; any you leave out are placed as for a name. An unknown name is refused. |
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

Connect a control to a synth parameter, so moving the control changes it.

Example: `deviceBind("Cutoff", "cutoff")` makes the control Cutoff send the synth's cutoff.

- `control` (text, required): The control's name.<br>Not a control: rejected with a console error.
- `parameterId` (text, required): The parameter's id, as the device profile names it or `deviceDefineParameter()` declares it.<br>Not one either knows yet: bound all the same, with a console warning; it works if the parameter arrives.
- `opts` (options, optional): The options below.

Good to know:

- It replaces a binding on the same port, and switches the control's device binding back on.
- Returns true when bound. Rejected: false, with a console error.

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

Disconnect a control from its synth parameter.

Example: `deviceUnbind("Cutoff")` stops Cutoff sending to the synth.

- `control` (text, required): The control's name.<br>Not a control: rejected with a console error.
- `port` (text, optional): The port to disconnect.<br>Left out: "value".

Good to know:

- Returns true when there was a binding to remove, false when not. Rejected: false, with a console error.

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

List the MIDI ports.

Example: `devicePorts({ direction = "out" })` lists the ports that send.

- `opts` (options, optional): The option below.<br>Left out: every port.<br>Not a table: an empty list, with a console error.

Good to know:

- Returns a list of { id, name, direction, type, hardware, role }.
- `hardware` is false for the two the app always shows, "No MIDI Input" and "Preview Only"; `role` names the device using the port, or is "".

*Short name: `devicePorts`.*

**`opts`** can contain:

| Name | Type | What it is |
|---|---|---|
| `direction` | text | "in": only the ports that receive.<br>"out": only the ones that send.<br>Case-insensitive.<br>Anything else: every port, with a console warning the first time. |

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

Read the values the device profile fills into its messages.

Example: `deviceVariables().deviceId` gives the device id the panel sends.

- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- Returns `channel`, `deviceId` and any others the profile has, with this project's settings applied; no profile chosen: no result.

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

Change one of the values the device profile fills into its messages, for this project.

Example: `deviceSetVariable("deviceId", 17)` talks to a second unit of the same synth.

- `name` (text, required): The value's name, such as "deviceId" or "channel".<br>Left out: rejected with a console error.
- `value` (number, required): A number.<br>Range: 0 ↔ 127, whole; a channel 1 ↔ 16.<br>A fraction: rounded.<br>Outside the range: the nearest end, with a console warning the first time.<br>Text that is not a number: rejected with a console error.
- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- Saved with this project: the shared device profile is not changed, so two panels can use different device ids for one synth.
- Returns true when it was set. Rejected: false, with a console error; nothing changes. A device no profile is chosen for: rejected.

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

Read how fast the panel may send to the device.

Example: `deviceTiming().minDelayBetweenMessagesMs` gives the least gap between messages.

- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- Returns `minDelayBetweenMessagesMs` and any other timing the device profile sets, with this project's settings applied.

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

Change one timing setting, for this project.

Example: `deviceSetTiming("minDelayBetweenMessagesMs", 20)` leaves at least 20 ms between messages.

- `name` (text, required): The setting's name, as `deviceTiming()` lists it. Case-insensitive.<br>Not one of them, or left out: nothing is changed, with a console error.
- `ms` (number, required): Milliseconds.<br>Range: 0 ↔ 60000, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end, with a console warning the first time.
- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- Saved with this project: the device profile is not changed.
- Returns true when it was set. Rejected: false, with a console error. A device no profile is chosen for: rejected.

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

Read what the device profile says it supports.

Example: `deviceCoverage("realtimeEditing")` gives "complete", "partial" or "notImplemented".

- `feature` (text, optional): A feature's name, such as "singleParameterWrite", "realtimeEditing" or "editBufferDumpParse".<br>Left out: every feature, as a table.<br>Not one the profile names: no result.
- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- A profile can answer in words of its own: check for the ones that matter.

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

List the message templates the device profile can build.

Example: `deviceRecipes()` gives the formats the synth's parameters are sent in.

- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- Returns a list of names; no profile chosen: an empty list.

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

List the requests the device profile can send.

Example: `deviceRequests()` gives names such as an identity request.

- `role` (text, optional): The device, by its role as the panel names it.<br>Left out: "mainSynth".

Good to know:

- Returns a list of names: check here before assuming a synth answers one.

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
| `ce.music.name(n [, flats])` | Give the name of a MIDI note number. Example: `ce.music.name(61)` gives "C#4". `n` (note, required): Note number: 60 is middle C, C4.<br>A fraction: rounded down.<br>Outside 0 to 127: named the same way; -1 is "B-2".<br>Not a number, or left out: no result, with a console error. `flats` (true or false, optional): Left out: # for a sharp, as "C#4", plain text to type and compare.<br>true: flats, as the panel spells them: "D♭4".<br>false: sharps, as the panel spells them: "C♯4". Returns the name as text. `ce.music.spelling()` says whether a key is spelled with flats. Short name: `noteName`. |
| `ce.music.number(name) -> number` | Give the MIDI note number of a note name. Example: `ce.music.number("Eb4")` gives 63. `name` (note, required): A letter from A to G, then #, ♯, b or ♭ if it has one, then the octave: "C4" is 60, middle C. Case-insensitive; spaces round it are ignored.<br>Cb is the B below; B# and E# are not read.<br>No octave, a name that cannot be read, a number, or left out: no result, with a console error. Returns the number. It can pass 127: "G#9" is 128. A name it cannot read gives no result rather than 0, since 0 is a note: C-1. Short name: `noteNumber`. |
| `ce.music.scale(root [, scale]) -> list` | Give the notes of a scale, one octave up from its root. Example: `ce.music.scale("D4", "dorian")` gives {62, 64, 65, 67, 69, 71, 72}. `root` (note, required): The first note.<br>A MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.<br>A fraction: rounded down.<br>A name that cannot be read, not a note, or left out: no result, with a console error. `scale` (text, optional): One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.<br>Left out: "major".<br>Any other: no result, with a console error. Returns 7 notes; 5 for the pentatonic scales, 6 for "blues". The root is not repeated at the top. Notes past 127 are given as they are; `sendNote()` refuses them. Short name: `scaleNotes`. |
| `ce.music.chord(root [, type]) -> list` | Give the notes of a chord of a type, up from its root. Example: `ce.music.chord("D4", "min7")` gives {62, 65, 69, 72}. `root` (note, required): The lowest note.<br>A MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.<br>A fraction: rounded down.<br>A name that cannot be read, not a note, or left out: no result, with a console error. `type` (text, optional): One of "major", "minor", "dim", "aug", "sus2", "sus4", "power", "maj6", "min6", "dom7", "maj7", "min7", "minMaj7", "dim7", "m7b5", "aug7", "add9", "dom9", "maj9" and "min9". Case-insensitive.<br>Left out: "major".<br>Any other: no result, with a console error. Returns the notes, lowest first. Notes past 127 are given as they are. A chord on a step of a key: `ce.music.degreeChord()`. Short name: `chordNotes`. |
| `ce.music.quantize(note, root [, scale]) -> number` | Move a note to the nearest note of a key. Example: `ce.music.quantize(61, "C4")` gives 62. `note` (note, required): The note to move.<br>A MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.<br>A fraction: rounded down.<br>A name that cannot be read, not a note, or left out: no result, with a console error. `root` (note, required): The key's note; its octave does not matter.<br>A MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.<br>A fraction: rounded down.<br>A name that cannot be read, not a note, or left out: no result, with a console error. `scale` (text, optional): One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.<br>Left out: "major".<br>Any other: no result, with a console error. Returns the note. A note in the key is returned as it is. Equally near two notes of the key: the higher. Short name: `quantizeNote`. |
| `ce.music.spelling(root [, scale]) -> boolean` | Tell whether a key is spelled with flats. Example: `ce.music.spelling("F4")` gives true. `root` (note, required): The key's note; its octave does not matter.<br>A MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.<br>A fraction: rounded down.<br>A name that cannot be read, not a note, or left out: no result, with a console error. `scale` (text, optional): One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.<br>Left out: "major".<br>Any other: no result, with a console error. Returns true for the keys of F, B♭, E♭, A♭, D♭ and G♭; false for the others. A minor-type scale ("minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "locrian", "pentatonicMin") is judged by the key a minor third above its root, as the Chord Pad judges it: C minor is spelled as E♭ major. Pass it to `ce.music.name()` to spell as the panel does. Short name: `noteSpelling`. |
| `ce.music.inScale(note, root [, scale]) -> boolean` | Tell whether a note is in a key. Example: `ce.music.inScale(66, "C4")` gives false. `note` (note, required): The note.<br>A MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.<br>A fraction: rounded down.<br>A name that cannot be read, not a note, or left out: no result, with a console error. `root` (note, required): The key's note; its octave does not matter.<br>A MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.<br>A fraction: rounded down.<br>A name that cannot be read, not a note, or left out: no result, with a console error. `scale` (text, optional): One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.<br>Left out: "major".<br>Any other: no result, with a console error. Returns true or false. In any octave: C2 is in the key of C5. Short name: `inScale`. |
| `ce.music.degree(note, root [, scale]) -> number` | Give which step of a key a note is. Example: `ce.music.degree("G4", "C4")` gives 5. `note` (note, required): The note, in any octave.<br>A MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.<br>A fraction: rounded down.<br>A name that cannot be read, not a note, or left out: no result, with a console error. `root` (note, required): The key's note; its octave does not matter.<br>A MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.<br>A fraction: rounded down.<br>A name that cannot be read, not a note, or left out: no result, with a console error. `scale` (text, optional): One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.<br>Left out: "major".<br>Any other: no result, with a console error. Returns the step, counted from 1: 1 the root, 5 the fifth. A note not in the key: no result, without a word. `ce.music.quantize()` moves it into the key first. Short name: `scaleDegree`. |
| `ce.music.degreeChord(root [, scale [, degree [, size]]]) -> table` | Give the chord a key builds on one of its steps. Example: `ce.music.degreeChord("C4", "major", 5).name` gives "G". `root` (note, required): The key's note; its octave places the chord.<br>A MIDI note number, or a name such as "C4": a letter from A to G, then #, ♯, b or ♭ if it has one, then the octave. Middle C is 60, C4. Case-insensitive.<br>A fraction: rounded down.<br>A name that cannot be read, not a note, or left out: no result, with a console error. `scale` (text, optional): One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.<br>Left out: "major".<br>Any other: no result, with a console error. `degree` (number, optional): Step, counted from 1: 1 the root, 5 the fifth.<br>Past the last step: on into the octave above; 8 is the root an octave up.<br>0 and below: the octave below; 0 is the last step.<br>A fraction: rounded down.<br>Left out: 1.<br>Not a number: 1, with a console warning the first time. `size` (number, optional): Notes: 3 a triad, 4 a seventh chord.<br>Below 2: 2.<br>A fraction: rounded down.<br>Left out: 3.<br>Not a number: 3, with a console warning the first time. Returns { notes, names, name, quality, roman, degree, rootNote, offsets }: the notes; their names without the octave, and the chord's ("E♭m7"), spelled as the key is; its quality, as `ce.music.quality()` names it; its roman numeral ("V", "vii°"); the step; its lowest note; the notes as semitones above the root. Built from every other note of the scale, as the Chord Pad builds it. Named from its first four notes: a chord of 5 or more is named as its seventh chord. A chord of a type: `ce.music.chord()`. Short name: `degreeChord`. |
| `ce.music.quality(notes) -> string` | Name a chord from its notes. Example: `ce.music.quality({60, 63, 67, 70})` gives "min7". `notes` (list of notes, required): MIDI note numbers or names, such as {60, "E4", 67}.<br>Not a list, a list with anything else in it, or left out: no result, with a console error that says where. Returns one of "maj", "min", "dim", "aug", "sus2", "sus4", "maj7", "dom7", "min7", "minMaj7", "dim7" and "m7b5", as the Chord Pad names chords. Named from the lowest note: an inverted chord is named from its bass. A chord it cannot place, such as a bare fifth or one note: "maj". An empty list: no result, without a word. Short name: `chordQuality`. |
| `ce.music.lead(notes [, previous [, mode]]) -> list` | Rearrange a chord so its notes move as little as they can from the chord before. Example: `ce.music.lead({72, 76, 79}, {60, 64, 67})` gives {60, 64, 67}. `notes` (list of notes, required): The chord to rearrange: MIDI note numbers or names, such as {60, "E4", 67}.<br>Not a list, a list with anything else in it, or left out: an empty list, with a console error that says where. `previous` (list of notes, optional): The chord before, as `notes`.<br>Left out, or empty: the notes sorted, low to high.<br>Not a list, or a list with anything else in it: an empty list, with a console error. `mode` (text, optional): "closest": all the notes together move as little as they can.<br>"smooth": the top note moves as little as it can; the others may jump.<br>"off": the notes sorted, low to high.<br>Case-insensitive.<br>Left out: "closest".<br>Any other: "closest", with a console warning the first time. Returns the notes as numbers. As the Harmoniser leads its voices. Short name: `voiceLead`. |
| `ce.music.octaves(notes [, octaves]) -> list` | Repeat notes in the octaves above, as an Arpeggiator spreads them. Example: `ce.music.octaves({60, 64}, 2)` gives {60, 64, 72, 76}. `notes` (list of notes, required): MIDI note numbers or names, such as {60, "E4", 67}.<br>Not a list, a list with anything else in it, or left out: an empty list, with a console error that says where. `octaves` (number, optional): Octaves, counting the notes' own.<br>Range: 1 ↔ 4, whole.<br>Outside the range: the nearest end, with a console warning the first time.<br>A fraction: rounded down, with a console warning the first time.<br>Not a number: 1, with a console warning the first time.<br>Left out: 1. Returns the notes sorted, low to high, then again an octave up for each octave more. A note that would pass 127 is left out. The step before `ce.music.arp()`. Short name: `expandOctaves`. |
| `ce.music.arp(notes, pattern) -> list` | Give the order an arpeggiator pattern plays notes in. Example: `ce.music.arp({60, 64, 67}, "updown")` gives {{60}, {64}, {67}, {64}}. `notes` (list of notes, required): MIDI note numbers or names, such as {60, "E4", 67}.<br>Not a list, a list with anything else in it, or left out: an empty list, with a console error that says where. `pattern` (text, required): "up": in the order given.<br>"down": the order given, reversed.<br>"updown": up, then down, not playing the top or the bottom twice.<br>"downup": down, then up, the same way.<br>"asPlayed": in the order given.<br>"random": in the order given; the Arpeggiator picks each step as it plays.<br>"chord": every note at once, in one step.<br>Case-insensitive.<br>Any other: "up", with a console warning the first time.<br>Left out: an empty list, with a console error. Returns a list of steps, each a list of notes. Sort the notes first for a rising run; `ce.music.octaves()` sorts them. Shuffled: `ce.math.shuffle()`. Short name: `arpOrder`. |

### ce.time: timers and musical time

Timers, and the musical clock. A timer runs your code later or repeatedly; the musical commands read the tempo and the song position, convert between beats and milliseconds, and help you step a sequence in time. Musical timing here is accurate to about a thirtieth of a second: right for lights, displays and stepping patterns, not for timing audio.

- Beats are quarter notes; bars and beats count from 1, as musicians do.
- A required value that is left out: rejected with a console error.
- A number outside its range: the nearest end, with a console warning, the first time only.
- A number that is not one: the fallback in its row, with a console warning, the first time only.
- Number arguments also accept text that is a number, such as "500"; a timer's interval or delay does not.

#### `ce.time.startTimer(id, ms)`

Start a repeating timer.

Example: `startTimer("blink", 250)` runs onTimer with info.id "blink" every 250 ms.

- `id` (text, required): The timer's name, as onTimer's info.id reports it.<br>Left out, or "": rejected with a console error.
- `ms` (number, required): Interval in milliseconds.<br>Range: > 0.<br>Text, even "250", ≤ 0, or invalid: rejected with a console error.

Good to know:

- Runs onTimer each time, until `ce.time.stopTimer()` with the same id.
- An id already running: restarted with the new interval; a `ce.time.syncTimer()` of that name becomes a millisecond one.
- Returns no value; rejected with a console error: no timer is started.

*Short name: `startTimer`.*

```lua
ce.time.startTimer("id", 250)
```

#### `ce.time.after(ms, fn) -> id`

Run a function once, after a delay.

Example: `after(500, function() set("gate", 0) end)` sets gate to 0 half a second from now.

- `ms` (number, required): Delay in milliseconds.<br>Range: ≥ 0.<br>0: as soon as the handler has returned.<br>Text, even "1000", < 0, or invalid: rejected with a console error.
- `fn` (function, required): The function to run.<br>Not a function: rejected with a console error.

Good to know:

- Returns an id for `ce.time.stopTimer()`, which cancels it before it runs.
- Rejected with a console error: nothing is scheduled, no result.

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

Stop a timer, or cancel a one-off before it runs.

Example: `stopTimer("blink")` stops the timer called blink.

- `id` (text, required): The timer's name, or the id `after()` returned.<br>Left out, or "": rejected with a console error.

Good to know:

- Stops a `ce.time.startTimer()` or `ce.time.syncTimer()` timer, or cancels an `after()` or `afterBeats()` by the id it returned.
- An id that is not running: nothing happens, and nothing is said.
- Returns no value.

*Short name: `stopTimer`.*

```lua
ce.time.stopTimer("id")
```

#### `ce.time.tempo()`

Read the tempo in beats per minute.

Example: `tempo()` gives 120 at 120 BPM.

Good to know:

- Returns the tempo; nothing supplying one: no result. Read it rather than assuming 120.

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

Read whether the transport is running.

Example: `ce.time.playing()` gives true while the transport runs.

Good to know:

- Returns true while running; stopped, or nothing supplying a transport: false.

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

Read the whole transport state in one table.

Example: `ce.time.transport().bar` gives the current bar, counted from 1.

Good to know:

- Returns { playing, bpm, beats, bar, beat, beatsPerBar, source, valid }.
- `beats` counts quarter notes from the start (bar 1, beat 1); `bar` and `beat` count from 1.
- `source` names what drives the clock. `valid` false: nothing supplies a position, and the rest are defaults.

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

Convert beats to milliseconds.

Example: `beatsToMs(0.75)` gives 375 at 120 BPM.

- `beats` (number, required): Length in beats (quarter notes).<br>Invalid: 0.
- `bpm` (number, optional): Tempo to convert at.<br>Range: > 0.<br>Left out, ≤ 0, or invalid: the transport's tempo.

Good to know:

- Returns milliseconds; no tempo to work from: no result.
- Rejected with a console error: no result.

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

Convert milliseconds to beats.

Example: `msToBeats(500)` gives 1 at 120 BPM.

- `ms` (number, required): Length in milliseconds.<br>Invalid: 0.
- `bpm` (number, optional): Tempo to convert at.<br>Range: > 0.<br>Left out, ≤ 0, or invalid: the transport's tempo.

Good to know:

- Returns beats (quarter notes); no tempo to work from: no result.
- Rejected with a console error: no result.

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

Start a repeating timer with an interval in beats.

Example: `syncTimer("step", 0.25)` runs onTimer with info.id "step" every sixteenth note.

- `id` (text, required): The timer's name, as onTimer's info.id reports it.<br>Left out, or "": rejected with a console error.
- `beats` (number or text, required): Interval in beats, or a division name such as "1/16" or "1/8T" (any case).<br>Range: > 0.<br>Text that is not a division, ≤ 0, or invalid: rejected with a console error.
- `opts` (options, optional): The options below.<br>Left out: the interval follows the tempo.

Good to know:

- Works as `ce.time.startTimer()`: onTimer each time, `ce.time.stopTimer()` stops it.
- A tempo change changes the interval, and restarts the timer from that moment.
- Returns no value; rejected with a console error, or no tempo to work from: no timer is started.

*Short name: `syncTimer`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `follow` | true or false | true | Follow the tempo: the interval changes with it.<br>false: the interval stays as the tempo at the start gave it.<br>Invalid: true. |

```lua
-- Lua
ce.time.syncTimer("step", 0.25)
```
```js
// JavaScript
ce.time.syncTimer("step", 0.25);
```

#### `ce.time.afterBeats(beats, fn) -> id`

Run a function once, after a number of beats.

Example: `afterBeats(2, fn)` runs fn two beats from now.

- `beats` (number or text, required): Delay in beats, or a division name such as "1/4" (any case).<br>Range: ≥ 0.<br>0: as soon as the handler has returned.<br>Text that is not a division, < 0, or invalid: rejected with a console error.
- `fn` (function, required): The function to run.<br>Not a function: rejected with a console error.

Good to know:

- The delay is worked out from the tempo at the call; a later tempo change does not move it.
- Returns an id for `ce.time.stopTimer()`; rejected with a console error, or no tempo to work from: nothing is scheduled, no result.

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

List the repeating timers that are running.

Example: `ce.time.timers()` gives {"blink", "step"} with those two running.

Good to know:

- Returns the ids of `ce.time.startTimer()` and `ce.time.syncTimer()` timers, sorted.
- One-off timers from `after()` and `afterBeats()` are not listed: their ids were returned when they were started.

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

Read a clock in milliseconds, for measuring how long something takes.

Example: `ce.time.now() - t0` gives the milliseconds since t0 was read.

Good to know:

- Returns milliseconds. One reading alone means nothing: subtract an earlier reading to find how much time has passed.
- It is not the time of day or a date, and it does not jump when the computer's clock is changed.

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

Convert a note division to beats.

Example: `ce.time.division("1/16")` gives 0.25.

- `name` (text, required): A division name: "1/16", "1/8T", "1/4D".<br>Any case.<br>Invalid: rejected with a console error.

Good to know:

- The names the sequencer components use: "1/1" to "1/32", "D" dotted, "T" triplet; any case.
- Returns beats; not a division: rejected with a console error, no result.

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

List every note division.

Example: `ce.time.divisions()` gives 14 entries, "1/1" first.

Good to know:

- Returns { id, label, beats } per division, in menu order: "1/16", "16th", 0.25.

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

Convert a position in beats to bar, beat and tick.

Example: `ce.time.position(4.5)` gives bar 2, beat 1, tick 12, text "2.1.12".

- `beats` (number, required): Position in beats from the start.<br>Range: ≥ 0.<br>< 0: 0.<br>Invalid: 0.
- `beatsPerBar` (number, optional): Beats in a bar.<br>Range: ≥ 1.<br>Default: 4.<br>< 1: 1.<br>Invalid: default.

Good to know:

- Returns { bar, beat, tick, text }: bars and beats from 1, ticks 0 ↔ 23 (24 per beat, as MIDI clock), text as the Transport shows it.
- Rejected with a console error: no result.

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

Find which step of a note grid a position is on.

Example: `ce.time.step(2.5, "1/16")` gives 10.

- `beats` (number, required): Position in beats from the start.<br>Range: ≥ 0.<br>< 0: 0.<br>Invalid: 0.
- `division` (text, required): A division name, as `ce.time.division()` reads it.<br>Invalid: rejected with a console error.

Good to know:

- Steps count from 0 at the start.
- Returns the step; rejected with a console error: no result.

*Short name: `stepAt`.*

#### `ce.time.steps(from, to, division [, max]) -> table`

Find the grid steps that start between two positions.

Example: `ce.time.steps(0, 1, "1/16")` gives steps {1, 2, 3, 4}, dropped 0.

- `from` (number, required): Position in beats from the start.<br>Range: ≥ 0.<br>< 0: 0.<br>Invalid: 0.
- `to` (number, required): Position in beats from the start.<br>Range: ≥ 0.<br>< 0: 0.<br>Invalid: 0.
- `division` (text, required): A division name, as `ce.time.division()` reads it.<br>Invalid: rejected with a console error.
- `max` (number, optional): Most steps returned.<br>Range: ≥ 1, whole.<br>Default: 16.<br>A fraction: rounded.<br>< 1: 1.<br>Invalid: default.

Good to know:

- Returns { steps, dropped }: the steps after from, up to and including to, and how many were left out.
- More than max crossed: the most recent are kept, the rest counted in dropped. Use it to catch up after a late update.
- Rejected with a console error: no result.

*Short name: `stepsBetween`.*

#### `ce.time.swing(step, amount, division) -> number`

Find how far to delay a step for swing, in beats.

Example: `ce.time.swing(1, 0.5, "1/16")` gives 0.0625: step 1 is delayed a quarter of a step.

- `step` (number, required): Step number.<br>A fraction: rounded.<br>Invalid: 0.
- `amount` (number, required): Swing amount.<br>Range: 0 ↔ 1 (0: straight; 1: half a step).<br>Outside the range: the nearest end.<br>Invalid: 0.
- `division` (text, required): A division name, as `ce.time.division()` reads it.<br>Invalid: rejected with a console error.

Good to know:

- Even steps (0, 2, 4…) stay; odd steps are delayed by up to half a step. Add it to the step's position.
- The Transport's own calculation, so a script's timing matches the panel's sequencers.
- Rejected with a console error: no result.

*Short name: `swingOffset`.*

#### `ce.time.cycle(beats, bars [, beatsPerBar]) -> table`

Find where a position falls in a cycle of bars.

Example: `ce.time.cycle(6, 1)` gives phase 0.5, count 1, length 4.

- `beats` (number, required): Position in beats from the start.<br>Range: ≥ 0.<br>< 0: 0.<br>Invalid: 0.
- `bars` (number, required): Cycle length in bars.<br>Range: 0.25 ↔ 64.<br>Outside the range: the nearest end.<br>Invalid: 0.25.
- `beatsPerBar` (number, optional): Beats in a bar.<br>Range: ≥ 1.<br>Default: 4.<br>< 1: 1.<br>Invalid: default.

Good to know:

- Returns { phase, count, length }: 0 ↔ 1 through the current cycle, whole cycles finished, and the cycle in beats.
- Worked out from the position each time, so it does not drift.
- Rejected with a console error: no result.

*Short name: `cycleAt`.*

#### `ce.time.looped(beats, startBeats, lengthBeats) -> table`

Fold a position into a loop.

Example: `ce.time.looped(13, 4, 8)` gives beats 5, pass 1.

- `beats` (number, required): Position in beats from the start.<br>Range: ≥ 0.<br>< 0: 0.<br>Invalid: 0.
- `startBeats` (number, required): Loop start in beats.<br>Range: ≥ 0.<br>< 0: 0.<br>Invalid: 0.
- `lengthBeats` (number, required): Loop length in beats.<br>Range: ≥ 0.01.<br>< 0.01: 0.01.<br>Invalid: 0.01.

Good to know:

- Returns { beats, pass }: the position inside the loop, and which time round, from 0.
- Before the loop start: the position unchanged, pass -1, so a count-in works.
- Worked out from the position each time, so it does not drift; a change of pass is a wrap.
- Rejected with a console error: no result.

*Short name: `loopedBeats`.*

#### `ce.time.tap(times [, resetMs]) -> number`

Work out a tempo from tap times.

Example: `ce.time.tap({1000, 1500, 2000, 2500})` gives 120.

- `times` (list, required): A list of tap times in milliseconds, as `ce.time.now()` gives them.<br>An item that is not a number above 0: left out.<br>Not a list: rejected with a console error.
- `resetMs` (number, optional): Gap that starts a new measurement, in milliseconds.<br>Range: > 0.<br>Default: 2000.<br>≤ 0, or invalid: default.

Good to know:

- Only the taps since the last pause count: a gap longer than resetMs starts a new measurement.
- Returns BPM, 20 ↔ 300; fewer than two usable taps: no result.
- Rejected with a console error: no result.

*Short name: `tapTempo`.*

#### `ce.time.clockTempo(intervalsMs) -> number`

Work out a tempo from the gaps between MIDI clock pulses.

Example: `ce.time.clockTempo({20.8, 20.8, 20.9})` gives 120.

- `intervalsMs` (list, required): A list of gaps in milliseconds.<br>An item that is not a number above 0: left out.<br>Not a list: rejected with a console error.

Good to know:

- 24 pulses per beat, as between the 0xF8 messages `ce.midi.interceptIn()` sees; the median gap, so one late pulse does not move the result.
- Returns BPM, 20 ↔ 300; an empty list: no result.
- Rejected with a console error: no result.

*Short name: `clockTempo`.*

## Commands: Working out values

Value and range arithmetic, and moving a value over time.

### ce.math: numbers, ranges and colours

Helper functions for working out values: scaling a value from one range to another, curves, snapping, decibels, random numbers you can repeat, and colours. They only calculate — nothing changes on the panel until you pass the result to `set`.

**Colours that every colour command reads**

| Written as | Example | Read as |
|---|---|---|
| Six hex digits | "#FF8800" or "FF8800" | #FF8800 |
| Eight hex digits, alpha first | "80FF8800" | #FF8800 (alpha ignored) |
| Three hex digits, with # | "#F80" | #FF8800 |
| A colour name | "red", "steelblue" | #FF0000, #4682B4 |
| rgb() or rgba() | "rgb(255, 136, 0)" | #FF8800 |
| hsl() or hsla() | "hsl(32, 100%, 50%)" | #FF8800 |

**Not accepted.** The command writes an error to the console and returns no value.

| Written as | Example |
|---|---|
| A number | 255 |
| Three hex digits without # | "F80" |
| # with four digits | "#F808" |
| Spaces around it | " #FF8800" |

Colour commands return "#RRGGBB" unless their description says otherwise.

**Random numbers**

- Every random command takes its numbers from the script's own random sequence.
- `ce.math.seed(n)` sets where that sequence starts. The same seed gives the same numbers every time: in every scripting language, in the editor and in the exported plugin.
- `ce.math.stream(name, fn)` gives a block of code its own separate sequence, so two parts of a script don't affect each other's numbers.

#### `ce.math.lighten(colour [, amount]) -> string`

Make a colour lighter.

Example: `lighten("#336699", 0.5)` gives "#99B3CC".

- `colour` (colour, required): The colour, in any form a colour property takes, such as "#FF8800", "red" or rgb(255, 136, 0).
- `amount` (number, optional): Range: 0 ↔ 1 (unchanged ↔ white).<br>Default: 0.4.<br>Outside the range: an error in the console and no result.

*Short name: `lighten`.*

#### `ce.math.darken(colour [, amount]) -> string`

Make a colour darker.

Example: `darken("#336699", 0.5)` gives "#1A334D".

- `colour` (colour, required): The colour, in any form a colour property takes, such as "#FF8800", "red" or rgb(255, 136, 0).
- `amount` (number, optional): Range: 0 ↔ 1 (black ↔ unchanged).<br>Default: 0.55.<br>Outside the range: an error in the console and no result.

Good to know:

- The amount works the opposite way to lighten's: a smaller amount makes the colour darker.

*Short name: `darken`.*

#### `ce.math.mix(a, b, t) -> string`

Blend two colours.

Example: `mixColour("#00FF00", "#FF0000", 0.5)` gives "#808000".

- `a` (colour, required): The first colour, in any form a colour property takes.
- `b` (colour, required): The second colour, in any form a colour property takes.
- `t` (number, required): Range: 0 ↔ 1 (first colour ↔ second colour). 0.5 is halfway.<br>Left out: 0.<br>Outside the range: held at 0 or 1.<br>Not a number: an error in the console and no result.

Good to know:

- Red, green and blue are each blended in a straight line. This suits a meter that fades from green to red.

*Short name: `mixColour`.*

#### `ce.math.alpha(colour, a) -> string`

Give a colour a transparency, ready to store in a control's colour property.

Example: `colourAlpha("#FF0000", 0.5)` gives "80FF0000".

- `colour` (colour, required): The colour, in any form a colour property takes. Any alpha it already has is replaced.
- `a` (number, required): Range: 0 ↔ 1 (fully transparent ↔ fully solid).<br>Outside the range or left out: an error in the console and no result.

Good to know:

- It returns AARRGGBB without "#", the form a colour property stores. The other colour commands return "#RRGGBB".
- The web's #RRGGBBAA form has the same four bytes in a different order, so the two forms can't be swapped.
- To make something you draw see-through, use `ce.draw.opacity`.

*Short name: `colourAlpha`.*

#### `ce.math.rgb(colour) -> table`

Split a colour into its red, green and blue parts.

Example: `hexToRgb("#FF8000")` gives r 255, g 128 and b 0.

- `colour` (colour, required): The colour, in any form a colour property takes. Any alpha is ignored.

Good to know:

- It returns r, g and b, each in the range 0 ↔ 255.

*Short name: `hexToRgb`.*

#### `ce.math.hex(r, g, b) -> string`

Build a colour from red, green and blue parts.

Example: `rgbToHex(255, 128, 0)` gives "#FF8000".

- `r` (number, required): Red.<br>Range: 0 ↔ 255.<br>Left out: 0.<br>Outside the range: held at 0 or 255. A fraction is rounded.<br>Not a number: an error in the console and no result.
- `g` (number, required): Green.<br>Range: 0 ↔ 255.<br>Left out: 0.<br>Outside the range: held at 0 or 255. A fraction is rounded.<br>Not a number: an error in the console and no result.
- `b` (number, required): Blue.<br>Range: 0 ↔ 255.<br>Left out: 0.<br>Outside the range: held at 0 or 255. A fraction is rounded.<br>Not a number: an error in the console and no result.

*Short name: `rgbToHex`.*

#### `ce.math.fromARGB(colour) -> string`

Read a colour written with its alpha first, as AARRGGBB.

Example: `colourFromArgb("#80FF0000")` gives "80FF0000".

- `colour` (colour, required): 8 or 4 hex digits, alpha first, with or without "#". 6 or 3 hex digits: no alpha, returned solid.<br>Anything else, such as "red": an error in the console and no result.

Good to know:

- It returns "#RRGGBB" when the colour is fully solid, otherwise AARRGGBB without "#".
- "#" with 8 hex digits means AARRGGBB to a colour property and the colour commands, but RRGGBBAA to a drawing. This command says you mean alpha first; `ce.math.fromRGBA` says alpha last.

*Short name: `colourFromArgb`.*

#### `ce.math.fromRGBA(colour) -> string`

Read a colour written with its alpha last, as RRGGBBAA, the web's order.

Example: `colourFromRgba("#FF000080")` gives "80FF0000".

- `colour` (colour, required): 8 or 4 hex digits, alpha last, with or without "#". 6 or 3 hex digits: no alpha, returned solid.<br>Anything else, such as "red": an error in the console and no result.

Good to know:

- It returns "#RRGGBB" when the colour is fully solid, otherwise AARRGGBB without "#".
- "#" with 8 hex digits means RRGGBBAA to a drawing, but AARRGGBB to a colour property and the colour commands. This command says you mean alpha last; `ce.math.fromARGB` says alpha first.

*Short name: `colourFromRgba`.*

#### `ce.math.hsl(colour) -> table`

Describe a colour by its hue, saturation and lightness.

Example: `hexToHsl("#FF0000")` gives h 0, s 100 and l 50.

- `colour` (colour, required): The colour, in any form a colour property takes. Any alpha is ignored.

Good to know:

- It returns h in the range 0 ↔ 360, and s and l in the range 0 ↔ 100, as in the colour editor. The numbers are not rounded.
- A grey has hue 0 and saturation 0.

*Short name: `hexToHsl`.*

#### `ce.math.fromHsl(h, s, l) -> string`

Build a colour from hue, saturation and lightness.

Example: `hslToHex(120, 100, 50)` gives "#00FF00".

- `h` (number, required): Hue.<br>Range: 0 ↔ 360.<br>Left out: 0.<br>Outside the range: wraps round, so -120 is 240 and 480 is 120.<br>Not a number: an error in the console and no result.
- `s` (number, required): Saturation.<br>Range: 0 ↔ 100.<br>Left out: 0.<br>Outside the range: held at 0 or 100.<br>Not a number: an error in the console and no result.
- `l` (number, required): Lightness.<br>Range: 0 ↔ 100.<br>Left out: 0.<br>Outside the range: held at 0 or 100.<br>Not a number: an error in the console and no result.

Good to know:

- The reverse of `ce.math.hsl`.

*Short name: `hslToHex`.*

#### Helper functions in ce.math

| Function | What it does |
|---|---|
| `ce.math.scale(v, inLo, inHi, outLo, outHi)` | Move a value from one range to another. Example: `scale(64, 0, 127, 0, 100)` gives about 50. `v` (number, required): The value to move. `inLo` (number, required): The low end of the range the value is in. `inHi` (number, required): The high end of the range the value is in. If it equals the low end, the result is the new range's low end. `outLo` (number, required): The low end of the range to move it to. `outHi` (number, required): The high end of the range to move it to. The result is not kept inside the new range: a value outside the first range lands outside the second. Use `ce.math.norm()` and `ce.math.denorm()` when it must stay inside. Short name: `scale`. |
| `ce.math.clamp(v, lo, hi)` | Keep a value inside a range. Example: `clamp(140, 0, 127)` gives 127. `v` (number, required): The value to keep in range. `lo` (number, required): The bottom of the range. Must be below hi. A value below it gives lo. `hi` (number, required): The top of the range. A value above it gives hi. Short name: `clamp`. |
| `ce.math.round(v)` | Round to the nearest whole number. Example: `round(2.5)` gives 3. `v` (number, required): The number to round. A half always rounds up, so -2.5 gives -2. To keep decimal places, use `ce.math.roundTo`. Short name: `round`. |
| `ce.math.snap(v, step)` | Round a value to the nearest step. Example: `snap(37, 10)` gives 40. `v` (number, required): The value to round. `step` (number, required): The size of the steps, such as 10 or 0.25. 0 leaves the value unchanged.<br>Left out: an error in the console and no result. Halfway rounds up, as with `ce.math.round`: 35 gives 40. For steps that are not evenly spaced, use `ce.math.quantize`. Short name: `snap`. |
| `ce.math.curve(v, shape)` | Bend a value from 0 to 1 with a response curve. Example: `curve(0.5, "exp")` gives 0.25. `v` (number, required): The value.<br>Range: 0 ↔ 1.<br>Outside the range: not held at 0 or 1. `shape` (text, optional): "linear" (unchanged), "exp" (slow, then fast), "log" (fast, then slow) or "s" (slow at both ends). Case-insensitive.<br>Left out: "linear". An unknown name: a note in the console, and "linear" is used. For a curve of your own, use `ce.math.map`. For the curves the panel's Envelopes use, use `ce.math.shape`. Short name: `curve`. |
| `ce.math.lerp(a, b, t)` | Blend between two numbers. Example: `lerp(10, 20, 0.25)` gives 12.5. `a` (number, required): The first number. `b` (number, required): The second number. `t` (number, required): Range: 0 ↔ 1 (a ↔ b). 0.5 is halfway.<br>Left out: an error in the console and no result.<br>Outside the range: not held at 0 or 1, so the result goes past a or b. For whole lists of numbers, use `ce.math.blend`. Short name: `lerp`. |
| `ce.math.wrap(v, lo, hi)` | Wrap a value into a range, so going past the top starts again from the bottom. Example: `wrap(-1, 0, 12)` gives 11. `v` (number, required): The value to wrap. `lo` (number, required): The bottom of the range. Must be below hi. The result can equal lo. `hi` (number, required): The top of the range.<br>The result never equals hi: wrap(12, 0, 12) gives 0. Use it for pitch classes, LFO phase and step numbers instead of your language's % operator. With a negative number, % differs between languages: -1 % 12 gives 11 in Lua and -1 in JavaScript. Short name: `wrap`. |
| `ce.math.map(v, points)` | Map a value through a curve you draw as points. Example: `mapCurve(0.25, {{0, 0}, {0.5, 0.9}, {1, 1}})` gives 0.45. `v` (number, required): The value to map. `points` (list, optional): A list of points, each {x, y}, joined by straight lines and sorted by x first. A third entry bends the line that ends at the point: "exp", "log", "s" or "hold", as in ce.math.shape. A fourth sets how far it bends.<br>Left out or empty: the value is returned unchanged. Below the first point or above the last: held at that point's y. Two points with the same x make a step, and the later one wins. {1, 1, "exp"} rises slowly, then fast. Short name: `mapCurve`. |
| `ce.math.quantize(v, values)` | Snap a value to the nearest entry in a list. Example: `quantizeTo(9, {0, 8, 16})` gives 8. `v` (number, required): The value to snap. `values` (list of numbers, optional): The entries to choose from, in any order.<br>Left out or empty: the value is returned unchanged. Exactly halfway between two entries, the lower one wins: 12 gives 8. For evenly spaced steps, use `ce.math.snap`. Short name: `quantizeTo`. |
| `ce.math.choice(values [, weights])` | Pick an entry from a list at random. Example: `randomChoice({"C", "E", "G"}, {3, 1, 1})` picks "C" three times as often as "E" or "G". `values` (list, required): The entries.<br>Empty: no result. `weights` (list of numbers, optional): How likely each entry is: its weight divided by the total.<br>Default: all equal. A missing or negative weight counts as 0; if every weight is 0, all are equal. It uses one random number, with or without weights, so adding weights does not change later random numbers. Short name: `randomChoice`. |
| `ce.math.dbToGain(db)` | Convert decibels to a linear gain. Example: `dbToGain(-6)` gives about 0.5. `db` (number, required): The level in dB. 0 dB gives 1. Short name: `dbToGain`. |
| `ce.math.gainToDb(gain)` | Convert a linear gain to decibels. Example: `gainToDb(0.5)` gives about -6. `gain` (number, required): The linear gain. 1 gives 0 dB. 0 or below gives -144 dB, the floor of 24-bit audio; no result is lower than that. Short name: `gainToDb`. |
| `ce.math.norm(v, lo, hi)` | Turn a value into its position within a range, from 0 to 1. Example: `norm(64, 0, 127)` gives about 0.5. `v` (number, required): The value.<br>Outside the range: held at 0 or 1. `lo` (number, required): The value that gives 0. `hi` (number, required): The value that gives 1. It may be below lo, for a range that runs the other way. The reverse is `ce.math.denorm`. Short name: `norm`. |
| `ce.math.denorm(t, lo, hi)` | Turn a position from 0 to 1 back into a value in a range. Example: `denorm(0.5, 0, 127)` gives 63.5. `t` (number, required): Range: 0 ↔ 1 (lo ↔ hi).<br>Outside the range: held at 0 or 1. `lo` (number, required): The value at 0. `hi` (number, required): The value at 1. It may be below lo, for a range that runs the other way. The reverse of `ce.math.norm`. Short name: `denorm`. |
| `ce.math.bipolar(t)` | Turn a value from 0 to 1 into one from -1 to +1. Example: `bipolar(0.75)` gives 0.5. `t` (number, required): Range: 0 ↔ 1 (-1 ↔ +1). 0.5 gives 0.<br>Outside the range: not held. The reverse is `ce.math.unipolar`. Short name: `bipolar`. |
| `ce.math.unipolar(v)` | Turn a value from -1 to +1 into one from 0 to 1. Example: `unipolar(0.5)` gives 0.75. `v` (number, required): Range: -1 ↔ +1 (0 ↔ 1). 0 gives 0.5.<br>Outside the range: not held. The reverse of `ce.math.bipolar`. Short name: `unipolar`. |
| `ce.math.fold(v, lo, hi)` | Bounce a value back off the ends of a range. Example: `fold(12, 0, 10)` gives 8. `v` (number, required): The value. Past the top it heads back down; below the bottom it heads back up. `lo` (number, required): The bottom of the range. Must be below hi. `hi` (number, required): The top of the range. Where `ce.math.wrap` jumps from the top to the bottom, fold keeps the movement smooth. Fold suits modulation depths; wrap suits pitch classes. Short name: `fold`. |
| `ce.math.index(t, count)` | Turn a position from 0 to 1 into a slot number, such as which of eight waveforms a knob picks. Example: `indexOfRange(0.5, 8)` gives 4. `t` (number, required): Range: 0 ↔ 1 (first slot ↔ last slot).<br>Outside the range: held at the first or last slot. `count` (number, required): How many slots. They count from 0, so the last is count - 1. Short name: `indexOfRange`. |
| `ce.math.crossfade(a, b, t [, law])` | Fade from one value to another with one of the Crossfader's fade laws. Example: `crossfade(0, 1, 0.5, "equalPower")` gives about 0.71. `a` (number, required): The value at 0. `b` (number, required): The value at 1. `t` (number, required): Range: 0 ↔ 1 (a ↔ b).<br>Left out: 0.<br>Outside the range: held at 0 or 1. `law` (text, optional): "linear", "equalPower" or "sharp". Case-insensitive.<br>Default: "linear". An unknown name is used as "linear". A linear fade between two sounds dips audibly in the middle; "equalPower" does not. "equalPower" adds the two values, weighted, so halfway it gives more than either: (10, 20, 0.5) gives about 21.2. That is right for two volumes. Short name: `crossfade`. |
| `ce.math.approach(current, target, maxStep)` | Move a value toward a target by no more than a set step. Example: `approach(10, 50, 15)` gives 25. `current` (number, required): The value now. `target` (number, required): Where it is going.<br>Within one step of it: the target exactly. `maxStep` (number, required): The most it moves in one call. 0 or left out: straight to the target. A negative step counts as positive. It keeps nothing between calls, so it works in any handler without a timer, such as each time an expression pedal sends a value. Short name: `approach`. |
| `ce.math.roundTo(v, decimals)` | Round to a number of decimal places. Example: `roundTo(3.14159, 2)` gives 3.14. `v` (number, required): The number to round. `decimals` (number, optional): How many decimal places to keep.<br>Default: 0.<br>Below 0: 0. It returns a number, not text, so you can keep calculating with it. Short name: `roundTo`. |
| `ce.math.almost(a, b [, epsilon])` | Check whether two numbers are equal to within a small margin. Example: `almost(0.1 + 0.2, 0.3)` gives true. `a` (number, required): The first number. `b` (number, required): The second number. `epsilon` (number, optional): How far apart they may be.<br>Default: 0.000000001. Use it instead of == on numbers that have been through arithmetic such as `ce.math.scale`, where rounding can leave two numbers that should match very slightly apart. Short name: `almost`. |
| `ce.math.min(values)` | Find the smallest number in a list. Example: `minOf({3, 1, 2})` gives 1. `values` (list of numbers, required): The numbers.<br>Empty or left out: no result. Short name: `minOf`. |
| `ce.math.max(values)` | Find the largest number in a list. Example: `maxOf({3, 1, 2})` gives 3. `values` (list of numbers, required): The numbers.<br>Empty or left out: no result. Short name: `maxOf`. |
| `ce.math.sum(values)` | Add up a list of numbers. Example: `sumOf({1, 2, 3})` gives 6. `values` (list of numbers, required): The numbers.<br>Empty or left out: 0. Short name: `sumOf`. |
| `ce.math.mean(values)` | Find the average of a list of numbers. Example: `meanOf({1, 2, 6})` gives 3. `values` (list of numbers, required): The numbers.<br>Empty or left out: no result. Short name: `meanOf`. |
| `ce.math.blend(fromList, toList, t) -> list` | Blend one list of numbers into another, entry by entry. Example: `blend({0, 100}, {10, 0}, 0.5)` gives {5, 50}. `fromList` (list of numbers, required): The list at 0. `toList` (list of numbers, required): The list at 1. If the lists differ in length, the result is as long as the shorter one. `t` (number, required): Range: 0 ↔ 1 (fromList ↔ toList).<br>Left out: 0.<br>Outside the range: not held at 0 or 1. Use it to morph between two snapshots. For two single numbers, use `ce.math.lerp`. Short name: `blend`. |
| `ce.math.randomFloat(lo, hi)` | Get a random number with a fractional part. Example: `randomFloat(0.5, 2)` gives a number from 0.5 up to, but not including, 2. `lo` (number, optional): The bottom of the range.<br>Both left out: 0 ↔ 1.<br>Given alone: the top of a range from 0, so randomFloat(5) is from 0 up to 5. `hi` (number, optional): The top of the range, which it never reaches. It may be below lo. `ce.math.random` with two numbers gives whole numbers; use this one for fractions. Short name: `randomFloat`. |
| `ce.math.gaussian([mean, sd])` | Get a random number on a bell curve, so most results land near the middle. Example: `randomGaussian(100, 5)` gives a number near 100: within 5 of it about two times in three. `mean` (number, optional): Where most results land.<br>Default: 0. `sd` (number, optional): How widely they spread, the standard deviation: about two thirds land within one sd of the mean.<br>Default: 1. Use it to humanise velocity or timing, where an even spread sounds mechanical. It always uses two random numbers, so a replayed seed stays in step. Short name: `randomGaussian`. |
| `ce.math.walk(current, step, lo, hi)` | Take one step of a random walk, for a value that drifts instead of jumping. Example: `randomWalk(64, 3, 0, 127)` gives a number from 61 to 67. `current` (number, required): The value now. Pass back what the last call returned. `step` (number, required): The most it moves, either way. `lo` (number, optional): The bottom. At it, the walk bounces back.<br>Left out, with hi: no limits. `hi` (number, optional): The top. At it, the walk bounces back. Short name: `randomWalk`. |
| `ce.math.chance([chance])` | Get true or false at random. Example: `randomBool(0.25)` gives true about one time in four. `chance` (number, optional): The probability of true.<br>Range: 0 ↔ 1 (never ↔ always).<br>Default: 0.5.<br>Outside the range: held at 0 or 1. Use it as a probability gate on sequencer steps. Short name: `randomBool`. |
| `ce.math.shuffle(values)` | Put a list in random order. Example: `shuffle({1, 2, 3})` gives the same three numbers in a random order. `values` (list, required): The list.<br>It is not changed: a new list is returned.<br>Empty or left out: an empty list. It uses one random number for each entry after the first, so the same seed always shuffles the same way. Short name: `shuffle`. |
| `ce.math.degrees(radians)` | Convert an angle from radians to degrees. Example: `toDegrees(3.14159)` gives about 180. `radians` (number, required): The angle in radians. ce.draw measures arcs in degrees. Short name: `toDegrees`. |
| `ce.math.radians(degrees)` | Convert an angle from degrees to radians. Example: `toRadians(180)` gives about 3.14159. `degrees` (number, required): The angle in degrees. Your language's own sin and cos take radians. Short name: `toRadians`. |
| `ce.math.distance(x1, y1, x2, y2)` | Measure the straight-line distance between two points. Example: `distance(0, 0, 3, 4)` gives 5. `x1` (number, required): The first point's x. `y1` (number, required): The first point's y. `x2` (number, required): The second point's x. `y2` (number, required): The second point's y. Use it for XY pads, joysticks and the Orbit, or to check whether a click landed on something you drew. Short name: `distance`. |
| `ce.math.angle(x1, y1, x2, y2)` | Find the angle from one point to another. Example: `angleOf(0, 0, 10, 0)` gives 90. `x1` (number, required): The first point's x. `y1` (number, required): The first point's y. `x2` (number, required): The second point's x. `y2` (number, required): The second point's y. It returns degrees in the range 0 ↔ 360: 0 at twelve o'clock, increasing clockwise, as ce.draw measures them. y counts downwards, as on screen, so a point straight above gives 0. The same point twice gives 0. Short name: `angleOf`. |
| `ce.math.polar(angle, radius)` | Turn an angle and a distance into x and y offsets from a centre. Example: `polar(0, 10)` gives x 0 and y -10: straight up, as y counts downwards. `angle` (number, required): The angle in degrees: 0 at twelve o'clock, increasing clockwise, as ce.math.angle returns it. `radius` (number, required): The distance from the centre.<br>Left out: 0. Add the offsets to your centre to find, for example, the tip of a knob's pointer. Short name: `polar`. |
| `ce.math.shape(v, curve [, tension])` | Bend a value from 0 to 1 with the curves the panel's Envelope segments and Router breakpoints use. Example: `shapeCurve(0.5, "exp")` gives about 0.16. `v` (number, required): The value.<br>Range: 0 ↔ 1.<br>Outside the range: held at 0 or 1. `curve` (text, optional): "linear", "exp" (slow, then fast), "log" (fast, then slow), "scurve" or "s" (slow at both ends), or "hold" (0 until the end, then 1). Case-insensitive.<br>Left out or unknown: "linear". `tension` (number, optional): How strongly "exp" and "log" bend.<br>Default: 1.6, as in the app; 0 also gives 1.6, not a straight line. At 1 it matches the curve a Macro slot uses. This is a different family from `ce.math.curve`. `ce.math.unshape` reverses it. Short name: `shapeCurve`. |
| `ce.math.deadzone(v, amount [, invert])` | Add a dead zone to the bottom of a value from 0 to 1, as the Expression Router does. Example: `deadzone(0.55, 0.1)` gives 0.5. `v` (number, required): The value.<br>Range: 0 ↔ 1.<br>Outside the range: held at 0 or 1. `amount` (number, required): The size of the dead zone.<br>At or below it: 0. The rest is stretched to fill 0 ↔ 1. `invert` (true or false, optional): true flips the value first.<br>Default: false. The response starts at the edge of the dead zone instead of jumping up from it. Short name: `deadzone`. |
| `ce.math.weights(points, x, y [, power])` | Work out how much each anchor point counts at a position, as a Timbre Space or Preset Constellation does. `points` (list, required): The anchors, as a list of {x, y}.<br>Empty: an empty list. `x` (number, required): The position's x.<br>Range: 0 ↔ 1. `y` (number, required): The position's y.<br>Range: 0 ↔ 1. `power` (number, optional): How sharp the blend is: higher lets the nearest anchor take over sooner.<br>Default: 2. It returns one weight per anchor, adding up to 1: the closer the anchor, the bigger its share. Pass the result to `ce.math.blendBy` to morph values. Short name: `weightsFor`. |
| `ce.math.blendBy(values, weights)` | Combine many values into one weighted average. Example: `blendBy({0, 100}, {3, 1})` gives 25. `values` (list of numbers, required): The values to combine. `weights` (list of numbers, required): How much each value counts. They need not add up to 1.<br>Adding up to 0 or less: 0. If the lists differ in length, the shorter one decides. This is how a morph pad turns its weights into one value. `ce.math.blend` blends two lists instead. Short name: `blendBy`. |
| `ce.math.ticks(major [, minor])` | Get the positions of a slider's scale marks, the same ones the app draws. Example: `tickStops(3, 1)` gives major {0, 0.5, 1} and minor {0.25, 0.75}. `major` (number, optional): How many major marks, counting both ends.<br>Default: 11. `minor` (number, optional): How many smaller marks between each pair of major ones.<br>Default: 0. It returns two lists, major and minor, of positions in the range 0 ↔ 1. Use it when you draw your own scale, so its marks line up with the app's. Short name: `tickStops`. |
| `ce.math.dbPosition(fraction [, floorDb, ceilDb])` | Find how far up a dB meter a level reaches. Example: `dbPosition(1)` gives about 0.91: 0 dB on a meter from -60 to +6. `fraction` (number, required): The level, as a linear value.<br>Range: 0 ↔ 1.<br>Outside the range: held at 0 or 1. `floorDb` (number, optional): The bottom of the meter, in dB.<br>Default: -60, as on the Meter component. `ceilDb` (number, optional): The top of the meter, in dB.<br>Default: +6. It returns a position in the range 0 ↔ 1 (bottom ↔ top). Short name: `dbPosition`. |
| `ce.math.smooth(current, target, coefficient [, epsilon])` | Move a value part of the way toward a target, so it eases in as it gets close. Example: `smooth(0, 100, 0.2)` gives 20. `current` (number, required): The value now. `target` (number, required): Where it is going. `coefficient` (number, required): The share of the remaining distance covered in each call.<br>Range: 0 ↔ 1 (stays put ↔ jumps to the target).<br>Outside the range: held at 0 or 1. `epsilon` (number, optional): How close counts as arrived: within it, the value lands on the target.<br>Default: 0.0001. Use it to steady a jittery pedal or a noisy CC. For a fixed step size, use `ce.math.approach`. Short name: `smooth`. |
| `ce.math.hysteresis(value, on, low, high)` | Turn a changing value into an on/off state that does not flicker. Example: `hysteresis(0.5, true, 0.3, 0.7)` gives true: between the two thresholds the state stays as it was. `value` (number, required): The changing value. `on` (true or false, required): The state now. Pass back what the last call returned. `low` (number, required): At or below this, the state switches off. Must be below high. `high` (number, required): At or above this, the state switches on. With two thresholds, a value hovering around one line cannot flip the state back and forth. Electronics calls this a Schmitt trigger. Short name: `hysteresis`. |
| `ce.math.median(values)` | Find the middle value of a list. Example: `median({1, 2, 100})` gives 2. `values` (list of numbers, required): The numbers, in any order.<br>With an even count: the average of the two middle ones.<br>Empty or left out: no result. Unlike the average, one stray spike does not move it. Short name: `median`. |
| `ce.math.euclid(steps, pulses [, rotation])` | Make a Euclidean rhythm: hits spread as evenly as possible across a number of steps. Example: `euclid(8, 3)` gives {false, false, true, false, false, true, false, true}. `steps` (number, required): How many steps.<br>Range: 1 ↔ 64.<br>Outside the range: held at 1 or 64. `pulses` (number, required): How many of the steps are hits.<br>More than steps: every step is a hit. `rotation` (number, optional): How many steps to shift the pattern by, without changing the spacing.<br>Default: 0. Negative shifts the other way. It returns a list of true and false, the same pattern the Arpeggiator uses for its rests. Short name: `euclid`. |
| `ce.math.unshape(y, curve [, tension])` | Undo a curve: give a value after the curve and get the value from before it. Example: `unshape(shapeCurve(0.3, "exp"), "exp")` gives 0.3. `y` (number, required): The value after the curve. `curve` (text, required): The same curve that was used. `tension` (number, optional): The same tension that was used.<br>Default: 1.6. The reverse of `ce.math.shape`. Use it when a value returns from the synth through a taper, so the control lands where it started. "hold" has no exact reverse: it returns the earliest value that gives the same result. Short name: `unshape`. |
| `ce.math.random([lo, hi])` | Get a random number. Example: `random(1, 6)` gives a whole number from 1 to 6, as a die does. `lo` (number, optional): The lowest whole number it can return. Give lo and hi together; with only lo, or neither, it returns a fraction in the range 0 ↔ 1, never 1. `hi` (number, optional): The highest whole number it can return. It may be below lo. Only whole numbers inside the range: random(1.5, 3.5) gives 2 or 3. With none inside, such as random(1.2, 1.8): an error in the console and no result. Short name: `random`. |
| `ce.math.seed(n)` | Set where this script's random numbers start, so the same seed gives the same sequence. `n` (number, required): The seed. 0 uses the default. Until you set one, every script starts from the same default, so its numbers repeat each time it loads. Every script and every named stream has its own sequence, so this never affects another script. Short name: `randomSeed`. |
| `ce.math.stream(name, fn)` | Run a block of code with random numbers from a separate, named sequence. `name` (text, required): The sequence's name. Two scripts using the same name get separate sequences. `fn` (function, required): The code to run. The script's own sequence returns when it ends, even if it ends in an error. Use it so two parts of one script, such as a melody and a drum pattern, do not affect each other's random numbers or seeds. Short name: `randomStream`. |

### ce.anim: smooth movement

Moving a value smoothly over time instead of jumping: to a target, with a spring, or through a shape you draw. Moves can wait, repeat, follow the tempo, and call you back when they finish. These keep working when the plugin window is closed, so they can also sweep a synth parameter.

- A required value that is missing or of the wrong type: the call is rejected with a console error.
- An option with a wrong value: a console warning, the first time only, and the fallback in its row is used.
- Number options also accept text that is a number, such as "500".

#### `ce.anim.to(path, target [, opts])`

Move a value smoothly to a new number over time.

Example: `animateTo("cutoff", 127, {duration = 500})` moves cutoff to 127 in half a second.

- `path` (path, required): The value to animate, or a list of values.<br>Colour property, or a control not on the panel: rejected with a console error.<br>List containing either: the entire list is rejected.
- `target` (number, required): The end value.
- `opts` (options, optional): The options below.<br>Left out: curve "linear", duration 300.

Good to know:

- A new move on a value that is already moving replaces the old one, and the old one's `done` is called with false.
- Returns false if the call is rejected.

*Short name: `animateTo`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `duration` | number (milliseconds) | 300 | Length of the animation.<br>Range: ≥ 0.<br>0 or below: immediate jump.<br>Invalid: default. |
| `beats` | number (beats) | — | Length in beats, overriding duration.<br>Range: > 0.<br>Tempo: read at the start; with sync, followed.<br>Outside the range, or invalid: duration. |
| `sync` | true or false | false | `true`: moves only while the transport plays, and follows tempo changes.<br>Invalid: false. |
| `curve` | text or list | "linear" | Easing curve: a name, or cubic Bézier control points {x1, y1, x2, y2}.<br>Range: x1, x2: 0 ↔ 1; y1, y2: -2 ↔ 3.<br>Invalid: linear.<br>One of "linear", "exp", "log", "s", "inQuad", "outQuad", "inOutQuad", "inCubic", "outCubic", "inOutCubic", "inBack", "outBack", "inOutBack" or "spring". Case-insensitive. |
| `damping` | number | 6 | Spring damping (curve = "spring").<br>Range: ≥ 0.<br>0: undamped.<br>Invalid: default. |
| `frequency` | number | 12 | Spring oscillation frequency (curve = "spring").<br>Range: ≥ 0.<br>0: no oscillation.<br>Below 0: sign ignored.<br>Invalid: default. |
| `from` | number | — | Start value.<br>Default: the current value.<br>Invalid: default. |
| `delay` | number (milliseconds) | 0 | Wait before the start.<br>Range: ≥ 0.<br>Below 0, or invalid: no wait. |
| `stagger` | number (milliseconds) | 0 | Delay per list entry: entry n starts n × stagger after the first.<br>Lists only.<br>Range: ≥ 0.<br>Invalid: 0. |
| `repeat` | number | 1 | Number of runs.<br>Fraction: rounded.<br>≤ 0: repeats until stopped.<br>Invalid: 1.<br>Lua: `["repeat"] = 3` (keyword). |
| `pingpong` | true or false | false | `true`: alternate runs play in reverse.<br>Requires repeat 0, or ≥ 2.<br>Invalid: false. |
| `done` | function | — | Callback at the end: done(completed).<br>completed: true after the last run or `ce.anim.finish()`; false after `ce.anim.stop()` or replacement.<br>List: called once, after the last entry; true only if every entry completed.<br>Invalid: no callback. |

```lua
-- Lua
ce.anim.to("cutoff", 127, { duration = 500, curve = "s" })
```
```js
// JavaScript
ce.anim.to("cutoff", 127, { duration: 500, curve: "s" });
```

#### `ce.anim.spring(path, target [, opts])`

Move a value to a new number with a spring motion.

Example: `animateSpring("cutoff", 127)` moves cutoff to 127 with a spring, in 600 ms.

- `path` (path, required): The value to animate, or a list of values.<br>Colour property, or a control not on the panel: rejected with a console error.<br>List containing either: the entire list is rejected.
- `target` (number, required): The end value.
- `opts` (options, optional): The options below.<br>Left out: duration 600, damping 6, frequency 12.

Good to know:

- A new move on a value that is already moving replaces the old one, and the old one's `done` is called with false.
- Returns false if the call is rejected.

*Short name: `animateSpring`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `duration` | number (milliseconds) | 600 | Length of the animation.<br>Range: ≥ 0.<br>0 or below: immediate jump.<br>Invalid: default. |
| `damping` | number | 6 | Spring damping.<br>Range: ≥ 0.<br>0: undamped.<br>Invalid: default. |
| `frequency` | number | 12 | Spring oscillation frequency.<br>Range: ≥ 0.<br>0: no oscillation.<br>Below 0: sign ignored.<br>Invalid: default. |
| `from` | number | — | Start value.<br>Default: the current value.<br>Invalid: default. |
| `beats` | number (beats) | — | Length in beats, overriding duration.<br>Range: > 0.<br>Tempo: read at the start; with sync, followed.<br>Outside the range, or invalid: duration. |
| `sync` | true or false | false | `true`: moves only while the transport plays, and follows tempo changes.<br>Invalid: false. |
| `delay` | number (milliseconds) | 0 | Wait before the start.<br>Range: ≥ 0.<br>Below 0, or invalid: no wait. |
| `stagger` | number (milliseconds) | 0 | Delay per list entry: entry n starts n × stagger after the first.<br>Lists only.<br>Range: ≥ 0.<br>Invalid: 0. |
| `repeat` | number | 1 | Number of runs.<br>Fraction: rounded.<br>≤ 0: repeats until stopped.<br>Invalid: 1.<br>Lua: `["repeat"] = 3` (keyword). |
| `pingpong` | true or false | false | `true`: alternate runs play in reverse.<br>Requires repeat 0, or ≥ 2.<br>Invalid: false. |
| `done` | function | — | Callback at the end: done(completed).<br>completed: true after the last run or `ce.anim.finish()`; false after `ce.anim.stop()` or replacement.<br>List: called once, after the last entry; true only if every entry completed.<br>Invalid: no callback. |

```lua
-- Lua
ce.anim.spring("cutoff", 127)
```
```js
// JavaScript
ce.anim.spring("cutoff", 127);
```

#### `ce.anim.stop([path])`

Stop an animation where it is.

- `path` (path, optional): The value.<br>Left out: every animation on the panel.

Good to know:

- The animation's `done` function is called with false.
- To jump to the end instead, use `ce.anim.finish()`.

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

Report whether a value is being animated.

Example: `animateRunning("cutoff")` gives true while cutoff is being animated.

- `path` (path, optional): The value.<br>Left out: any value on the panel.

Good to know:

- Returns true while an animation is on the value, paused or not.

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

Move a value through a shape given as points.

Example: `animateEnvelope("cutoff", {{0, 0}, {0.1, 1}, {1, 0}}, {duration = 800, to = 127})` moves cutoff to 127 in 80 ms, then back to 0 by 800 ms.

- `path` (path, required): The value to animate, or a list of values.<br>Colour property, or a control not on the panel: rejected with a console error.<br>List containing either: the entire list is rejected.
- `points` (list, required): The shape: a list of {x, y} or {x, y, curve}.<br>x: position in the animation. Range: 0 ↔ 1. Outside the range: rejected with a console error.<br>y: level. Range: 0 ↔ 1 (from ↔ to). Outside the range: not held.<br>curve: shape of the segment leading to the point: "linear", "exp", "log", "s" or "hold". Unknown: linear.<br>Points are sorted by x. Before the first and after the last: that point's y.<br>Fewer than 2 points: rejected.
- `opts` (options, optional): The options below.<br>Left out: from 0, to 1, duration 300.

Good to know:

- A new move on a value that is already moving replaces the old one, and the old one's `done` is called with false.
- Returns false if the call is rejected.

*Short name: `animateEnvelope`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `from` | number | 0 | Value at y = 0.<br>Invalid: default. |
| `to` | number | 1 | Value at y = 1.<br>Invalid: default. |
| `duration` | number (milliseconds) | 300 | Length of the animation.<br>Range: ≥ 0.<br>0 or below: immediate jump.<br>Invalid: default. |
| `beats` | number (beats) | — | Length in beats, overriding duration.<br>Range: > 0.<br>Tempo: read at the start; with sync, followed.<br>Outside the range, or invalid: duration. |
| `sync` | true or false | false | `true`: moves only while the transport plays, and follows tempo changes.<br>Invalid: false. |
| `delay` | number (milliseconds) | 0 | Wait before the start.<br>Range: ≥ 0.<br>Below 0, or invalid: no wait. |
| `stagger` | number (milliseconds) | 0 | Delay per list entry: entry n starts n × stagger after the first.<br>Lists only.<br>Range: ≥ 0.<br>Invalid: 0. |
| `repeat` | number | 1 | Number of runs.<br>Fraction: rounded.<br>≤ 0: repeats until stopped.<br>Invalid: 1.<br>Lua: `["repeat"] = 3` (keyword). |
| `pingpong` | true or false | false | `true`: alternate runs play in reverse.<br>Requires repeat 0, or ≥ 2.<br>Invalid: false. |
| `done` | function | — | Callback at the end: done(completed).<br>completed: true after the last run or `ce.anim.finish()`; false after `ce.anim.stop()` or replacement.<br>List: called once, after the last entry; true only if every entry completed.<br>Invalid: no callback. |

```lua
-- Lua
ce.anim.envelope("cutoff", { {x=0,y=0}, {x=0.1,y=1}, {x=0.4,y=0.6}, {x=1,y=0} }, { duration = 800, to = 127 })
```
```js
// JavaScript
ce.anim.envelope("cutoff", [{x:0,y:0},{x:0.1,y:1},{x:0.4,y:0.6},{x:1,y:0}], { duration: 800, to: 127 });
```

#### `ce.anim.value(path) -> table`

Describe the animation on a value.

Example: `animateValue("cutoff").progress` gives how far the move is, 0 ↔ 1.

- `path` (path, required): The value.

Good to know:

- Returns {path, kind, value, progress, from, to, elapsed, remaining, paused, cycle, sync}.
- kind: "to", "spring" or "envelope". progress: 0 ↔ 1. elapsed, remaining: ms; none with sync.
- No animation on the value: no result.

*Short name: `animateValue`.*

#### `ce.anim.list() -> list`

List every running animation.

Example: `animateList()` gives {} while nothing is animated.

Good to know:

- Returns a list of tables as `ce.anim.value()` returns them, sorted by path.
- None running: an empty list.

*Short name: `animateList`.*

#### `ce.anim.pause(path)`

Hold an animation where it is.

Example: `animatePause("cutoff")` holds cutoff's animation.

- `path` (path, required): The value.

Good to know:

- Returns true if it was running; false if none, or already paused.
- `ce.anim.resume()` continues from the held point.

*Short name: `animatePause`.*

#### `ce.anim.resume(path)`

Continue a paused animation from where it was held.

Example: `animateResume("cutoff")` continues cutoff's animation.

- `path` (path, required): The value.

Good to know:

- Returns true if it was paused; false otherwise.

*Short name: `animateResume`.*

#### `ce.anim.reverse(path)`

Turn a running animation around, back to its start at the same speed.

Example: `animateReverse("cutoff")` sends cutoff's animation back to where it started.

- `path` (path, required): The value.

Good to know:

- Returns true if it was running; false otherwise.
- An envelope plays its shape backwards; a paused animation turns around and stays paused.
- Arriving back at the start counts as completed: `done` is called with true.

*Short name: `animateReverse`.*

#### `ce.anim.finish(path)`

End an animation at its end value now.

Example: `animateFinish("cutoff")` sets cutoff to the end value of its animation.

- `path` (path, required): The value.

Good to know:

- Returns true if it was running; false otherwise.
- The value is set to the end of the current run (its start, on a reversed run); an envelope to the end of its shape. `done` is called with true.
- To stop where it is instead: `ce.anim.stop()`.

*Short name: `animateFinish`.*

#### `ce.anim.play(control, animation)`

Play one of a control's keyframe animations from its first frame.

Example: `animatePlay("Lamp", "flash")` plays Lamp's flash animation.

- `control` (text, required): The control's name.
- `animation` (text, required): The animation's name, as in the Animation tab. Not case-sensitive.

Good to know:

- Returns true if the control has a keyframe animation of that name. Already playing: restarts.
- A transition cannot be played this way: rejected with a console error listing the keyframe animations.

*Short name: `animatePlay` · Panel window only.*

## Commands: The panel itself

Creating and arranging controls, and saving things that outlive the session.

### ce.panel: building and arranging the panel

Changing the panel itself from a script: creating, copying and removing controls, finding them, lining them up, and editing the lists inside a control such as its states and animations. Most of these need the panel window; each entry says so. While you preview, everything a script changes is put back when the preview stops — `ce.panel.keep` is how you keep it.

#### `ce.panel.create(type, props)`

Create a control of a type, and give back its name.

Example: `ce.panel.create("Knob", { name = "Cutoff", x = 20, y = 40 })` makes a knob called Cutoff at 20, 40.

- `type` (text, required): The control's type, such as "Knob": one of `ce.panel.types()`. Case-insensitive.<br>Not a type, or left out: rejected with a console error.
- `props` (options, optional): Its name, place, size and container, and any of its sections' settings: the options below.<br>Left out: the type's own, at the top level.

Good to know:

- Returns its name. Rejected: no result, with a console error; nothing is created.
- A control a script creates is not saved with the panel, and is cleared before each `onPanelBuild`, which is where to create it.

*Short name: `panelCreate` · Panel window only.*

**`props`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `name` | text | one derived from the type | The name every other command reaches it by.<br>Taken already: a number is added; use the name given back. |
| `x` | number (pixels) | 0 | Pixels from the left edge of its container.<br>Not a number: as it was, with a console warning the first time. |
| `y` | number (pixels) | 0 | Pixels from the top edge of its container.<br>Not a number: as it was, with a console warning the first time. |
| `width` | number (pixels) | the type's own | Pixels.<br>0 or below, or not a number: as it was, with a console warning the first time. |
| `height` | number (pixels) | the type's own | Pixels.<br>0 or below, or not a number: as it was, with a console warning the first time. |
| `parent` | text | the panel itself | The name of a container to put it in: a control with a Children section, such as a Container or a Group.<br>Not a control, or not a container: rejected with a console error. |
| `<section>` | object | — | Any section of the control, by the name set() uses, such as { Behavior = { min = 0, max = 127 } }.<br>The section's name as written: Behavior, not behavior.<br>A section the control does not have: rejected with a console error.<br>Inside one, names in any case, as in a path; a child given is merged into the one there: { Background = { Fill = { colour = "red" } } } changes the Fill and keeps the rest.<br>A colour: stored as set() stores it; one it would refuse: rejected with a console error.<br>A setting the section does not have: written, with a console warning, as set() writes one. |

```lua
-- Lua
ce.panel.create("Knob", { name = "cutoff", x = 20, y = 40 })
```
```js
// JavaScript
ce.panel.create("Knob", { name: "cutoff", x: 20, y: 40 });
```

#### `ce.panel.clone(name, props)`

Copy a control, with all its settings, and give back the copy's name.

Example: `ce.panel.clone("Cutoff", { name = "Cutoff2", y = 120 })` makes a copy of Cutoff called Cutoff2, at y 120.

- `name` (text, required): The control to copy.<br>Not a control, or left out: rejected with a console error.
- `props` (options, optional): As `ce.panel.create()`'s: the options below.<br>Left out: a copy called its name with "_copy" added, in the same container.

Good to know:

- Returns the copy's name. Rejected: no result, with a console error; nothing is copied.

*Short name: `panelClone` · Panel window only.*

**`props`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `name` | text | the original's name with _copy added | The name every other command reaches it by.<br>Taken already: a number is added; use the name given back. |
| `x` | number (pixels) | 0 | Pixels from the left edge of its container.<br>Not a number: as it was, with a console warning the first time. |
| `y` | number (pixels) | 0 | Pixels from the top edge of its container.<br>Not a number: as it was, with a console warning the first time. |
| `width` | number (pixels) | the type's own | Pixels.<br>0 or below, or not a number: as it was, with a console warning the first time. |
| `height` | number (pixels) | the type's own | Pixels.<br>0 or below, or not a number: as it was, with a console warning the first time. |
| `parent` | text | the original's container | The name of a container to put it in: a control with a Children section, such as a Container or a Group.<br>Not a control, or not a container: rejected with a console error. |
| `<section>` | object | — | Any section of the control, by the name set() uses, such as { Behavior = { min = 0, max = 127 } }.<br>The section's name as written: Behavior, not behavior.<br>A section the control does not have: rejected with a console error.<br>Inside one, names in any case, as in a path; a child given is merged into the one there: { Background = { Fill = { colour = "red" } } } changes the Fill and keeps the rest.<br>A colour: stored as set() stores it; one it would refuse: rejected with a console error.<br>A setting the section does not have: written, with a console warning, as set() writes one. |

```lua
-- Lua
ce.panel.clone("template", { name = "copy", y = 120 })
```
```js
// JavaScript
ce.panel.clone("template", { name: "copy", y: 120 });
```

#### `ce.panel.destroy(name)`

Remove a control, and everything inside it.

Example: `ce.panel.destroy("Cutoff")` removes the control called Cutoff.

- `name` (text, required): The control's name.<br>Not a control: false, without a word.<br>Left out: rejected with a console error.

Good to know:

- Any control: placed in the editor or made by a script.
- Returns true when it was removed; false when there was no control of that name.

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

Move a control into a container, or out to the top level of the panel.

Example: `ce.panel.parent("Cutoff", "Row")` moves Cutoff into the container called Row.

- `name` (text, required): The control to move.<br>Not a control, or left out: rejected with a console error.
- `containerName` (text, optional): A control with a Children section, such as a Container or a Group.<br>Left out, or "": the top level of the panel.<br>Not a control, not a container, or the control itself or one inside it: rejected with a console error.

Good to know:

- Returns true when it moved. Rejected: false, with a console error; nothing moves.

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

List the names of the controls that match a query.

Example: `ce.panel.find({ type = "Knob" })` gives the name of every knob.

- `query` (options, optional): Part of a name, in any case; or a table of the filters below, every one of which must match.<br>Left out: every control.<br>Anything else, or a filter it does not have: rejected with a console error.

Good to know:

- Containers and the controls inside them are both listed.
- Returns a list of names, in panel order. Rejected: an empty list, with a console error.

*Short name: `panelFind` · Panel window only.*

**`query`** can contain:

| Name | Type | What it is |
|---|---|---|
| `name` | text | Part of a name, in any case. |
| `type` | text | A control type, such as "Knob": one of ce.panel.types(). Case-insensitive.<br>Not a type: rejected with a console error. |
| `generated` | true or false | Whether a script made the control.<br>true: only the controls a script made.<br>false: only the ones placed in the editor.<br>Not true or false, such as the text "true": rejected with a console error. |
| `parent` | text | A container's name, in any case: only the controls directly inside it. |

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

Describe a control: its name, id, type, place, size and container, and whether a script made it.

Example: `ce.panel.info("Cutoff").type` gives "Knob".

- `name` (text, required): The control's name.<br>Not a control: no result, without a word.<br>Left out: rejected with a console error.

Good to know:

- Returns { name, id, type, x, y, width, height, parent, generated }. `x` and `y` are from its container's corner; `ce.panel.rect()` gives its place on the panel.

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

List every control type `ce.panel.create()` takes.

Example: `ce.panel.types()` gives { "Background", "Label", "Button", … }.

Good to know:

- Returns a list of type names.

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

Line controls up on one edge or centre line.

Example: `ce.panel.align({ "Cutoff", "Res" }, "top")` lines up the tops of Cutoff and Res.

- `names` (list, required): Control names: a list, or one name.<br>A name that is not a control: said in the console, and skipped.<br>No control: rejected with a console error.
- `edge` (text, required): "left", "right", "top" or "bottom": that edge.<br>"hCenter": the centre line across; "vCenter": the centre line down.<br>Case-insensitive.<br>Invalid: rejected with a console error.
- `opts` (options, optional): The options below.<br>Left out: each its default.

Good to know:

- Returns how many controls it placed, whether or not they moved. Rejected: 0, with a console error; nothing moves.

*Short name: `panelAlign` · Panel window only.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `to` | text | the box the whole group occupies | One of the names given: the others line up on it, the canvas's key object.<br>Not one of the names: rejected with a console error. |

```lua
-- Lua
ce.panel.align({ "knob1", "knob2" }, "left")
```
```js
// JavaScript
ce.panel.align(["knob1", "knob2"], "left");
```

#### `ce.panel.distribute(names, what [, opts]) -> number`

Space controls out evenly between the first and the last.

Example: `ce.panel.distribute({ "A", "B", "C" }, "hSpacing")` makes the gaps between A, B and C equal.

- `names` (list, required): Control names: a list of two or more.<br>A name that is not a control: said in the console, and skipped.<br>Fewer than two controls: rejected with a console error.
- `what` (text, required): "leftEdges", "hCenters", "rightEdges", "topEdges", "vCenters" or "bottomEdges": those positions evened out.<br>"hSpacing" or "vSpacing": the gaps between them evened out, for controls of different sizes.<br>Case-insensitive.<br>Invalid: rejected with a console error.
- `opts` (options, optional): The options below.<br>Left out: each its default.

Good to know:

- The first and the last stay where they are, unless `opts.gap` is given.
- Returns how many controls it placed, whether or not they moved. Rejected: 0, with a console error; nothing moves.

*Short name: `panelDistribute` · Panel window only.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `gap` | number (pixels) | worked out from the space available | Pixels between one control and the next, with "hSpacing" or "vSpacing": the last control moves too.<br>Not a number: as left out, with a console warning the first time. |
| `align` | true or false | false | With "hSpacing" or "vSpacing" only.<br>true: also lined up across: every top edge level with the leftmost control's, or every left edge with the topmost's.<br>Anything but true, such as "top": not. |

#### `ce.panel.match(names, what [, opts]) -> number`

Make controls the same width, height, or both.

Example: `ce.panel.match({ "A", "B" }, "both")` gives B the size of A.

- `names` (list, required): Control names: a list of two or more.<br>A name that is not a control: said in the console, and skipped.<br>Fewer than two controls: rejected with a console error.
- `what` (text, required): "width", "height" or "both".<br>Case-insensitive.<br>Invalid: rejected with a console error.
- `opts` (options, optional): The options below.<br>Left out: each its default.

Good to know:

- Returns how many controls it sized, whether or not they changed. Rejected: 0, with a console error; nothing changes.

*Short name: `panelMatch` · Panel window only.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `to` | text | the first name you gave | One of the names given: the others take its size, and it keeps its own.<br>Not one of the names: rejected with a console error. |

#### `ce.panel.grid(names [, opts]) -> number`

Arrange controls in a grid of equal cells, each as big as the largest.

Example: `ce.panel.grid(pads, { columns = 4 })` lays the pads out four to a row.

- `names` (list, required): Control names: a list of two or more.<br>A name that is not a control: said in the console, and skipped.<br>Fewer than two controls: rejected with a console error.
- `opts` (options, optional): The options below.<br>Left out: each its default.

Good to know:

- In reading order, not the order listed: top to bottom, then left to right; controls within about 20 pixels of the same height are one row.
- The first in that order stays where it is, and the grid grows from there.
- Returns how many controls it placed, whether or not they moved. Rejected: 0, with a console error; nothing moves.

*Short name: `panelGrid` · Panel window only.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `columns` | number | 3 | Controls to a row.<br>A fraction: rounded.<br>Below 1: 1, with a console warning the first time.<br>Not a number: 3, with a console warning the first time. |
| `gapX` | number (pixels) | 10 | Pixels between columns.<br>Not a number: 10, with a console warning the first time. |
| `gapY` | number (pixels) | 10 | Pixels between rows.<br>Not a number: 10, with a console warning the first time. |

```lua
-- Lua
ce.panel.grid(pads, { columns = 4, gapX = 8, gapY = 8 })
```
```js
// JavaScript
ce.panel.grid(pads, { columns: 4, gapX: 8, gapY: 8 });
```

#### `ce.panel.circle(names [, opts]) -> number`

Arrange controls evenly round a circle, in the order listed.

Example: `ce.panel.circle(knobs, { radius = 80 })` sets the knobs round a circle of radius 80.

- `names` (list, required): Control names: a list of two or more.<br>A name that is not a control: said in the console, and skipped.<br>Fewer than two controls: rejected with a console error.
- `opts` (options, optional): The options below.<br>Left out: each its default.

Good to know:

- Centred on the middle of the box they fill now; each control's centre on the circle.
- 0 degrees is three o'clock here, where `ce.draw.arc()` has twelve.
- Returns how many controls it placed, whether or not they moved. Rejected: 0, with a console error; nothing moves.

*Short name: `panelCircle` · Panel window only.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `radius` | number (pixels) | 100 | Pixels from the centre to each control's centre.<br>Below 0: rejected with a console error.<br>Not a number: 100, with a console warning the first time. |
| `startAngle` | number (degrees) | 0 | Degrees, clockwise from three o'clock: where the first control goes.<br>Not a number: 0, with a console warning the first time. |

#### `ce.panel.flip(names, axis) -> number`

Mirror the positions of controls across the middle of the box they fill.

Example: `ce.panel.flip({ "A", "B" }, "horizontal")` swaps A and B left for right.

- `names` (list, required): Control names: a list of two or more.<br>A name that is not a control: said in the console, and skipped.<br>Fewer than two controls: rejected with a console error.
- `axis` (text, required): "horizontal": left and right swap.<br>"vertical": top and bottom swap.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Only their places change: the controls are not turned.
- Returns how many controls it placed, whether or not they moved. Rejected: 0, with a console error; nothing moves.

*Short name: `panelFlip` · Panel window only.*

#### `ce.panel.rect(name) -> table`

Get a control's box on the panel, or the box around several.

Example: `ce.panel.rect("Cutoff").right` gives Cutoff's right edge, in panel pixels.

- `name` (text or list, required): A control's name, or a list of names.<br>A name that is not a control: said in the console, and skipped.<br>No control: rejected with a console error.

Good to know:

- Returns { x, y, width, height, right, bottom }, from the panel's corner: a container's offset included, which Transform.x and Transform.y leave out.
- Rejected: no result, with a console error.

*Short name: `panelRect` · Panel window only.*

#### `ce.panel.order(names, where) -> number`

Bring controls to the front, or send them to the back, among the controls in their container.

Example: `ce.panel.order({ "Glow" }, "back")` draws Glow behind the other controls in its container.

- `names` (list, required): Control names: a list, or one name.<br>A name that is not a control: said in the console, and skipped.<br>No control: rejected with a console error.
- `where` (text, required): "front": over all the others.<br>"forward": over one more.<br>"backward": under one more.<br>"back": under all the others.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- A control later in its container is drawn over the ones before it.
- Returns how many controls it placed, whether or not they moved. Rejected: 0, with a console error; nothing moves.

*Short name: `panelOrder` · Panel window only.*

#### `ce.panel.batch(fn) -> boolean`

Make a set of changes count as one step, so one undo takes them all back.

Example: `ce.panel.batch(function() ce.panel.grid(pads) end)` makes the grid one undo step.

- `fn` (function, required): The function that makes the changes: run at once.<br>If it fails with an error: the step is closed all the same.<br>Not a function, or left out: rejected with a console error.

Good to know:

- Code after an `await` in the function is not part of the batch.
- The panel shows the changes together when the function ends. Code inside it already sees its own earlier changes.
- The exported plugin has no undo: there the function just runs.
- Returns true. Rejected: false, with a console error; nothing runs.

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

Keep a change made in preview, so it stays when preview stops.

Example: `ce.panel.keep("Cutoff.Background.Fill.colour")` keeps the colour a script gave Cutoff's fill.

- `path` (path, optional): A property's path, as `set()` takes it.<br>Left out: every change this run made.

Good to know:

- Preview is a rehearsal: when it stops, the panel goes back to how it was built, and a script's changes with it.
- A control a script made cannot be kept: the next run makes it again.
- Returns true when something was kept; false when nothing could be, as when the panel is not previewing.

*Short name: `panelKeep` · Panel window only.*

```lua
ce.panel.keep("Cutoff.Background.Fill.colour")
```

#### `ce.panel.entries(control, section)`

List the names of the entries in one of a control's collection sections.

Example: `ce.panel.entries("Cutoff", "States")` gives { "Hover", "Pressed", … }.

- `control` (text, required): The control's name.<br>Not a control: rejected with a console error.
- `section` (text, required): One of "States", "Bindings", "Animations", "Parts", "ValueChannels", "Behaviors", "HitZones", "Generators", "Links" or "Variants". Case-insensitive.<br>Any other: rejected with a console error.

Good to know:

- Returns the names, in the control's order. Rejected: an empty list, with a console error.

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

Get one entry of a collection section, by its name.

Example: `ce.panel.entry("Cutoff", "States", "Hover")` gives Cutoff's Hover state.

- `control` (text, required): The control's name.<br>Not a control: rejected with a console error.
- `section` (text, required): One of "States", "Bindings", "Animations", "Parts", "ValueChannels", "Behaviors", "HitZones", "Generators", "Links" or "Variants". Case-insensitive.<br>Any other: rejected with a console error.
- `name` (text, required): The entry's name. Case-insensitive.<br>Not one of the section's: no result, without a word.

Good to know:

- Returns the entry as a table. Rejected: no result, with a console error.

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

Add an entry to a collection section, or replace the one of that name.

Example: `ce.panel.define("Cutoff", "States", "Held", { when = { pressed = true } })` adds a state that applies while Cutoff is pressed.

- `control` (text, required): The control's name.<br>Not a control: rejected with a console error.
- `section` (text, required): One of "States", "Bindings", "Animations", "Parts", "ValueChannels", "Behaviors", "HitZones", "Generators", "Links" or "Variants". Case-insensitive.<br>Any other: rejected with a console error.
- `name` (text, required): The entry's name. Case-insensitive: one of that name is replaced.
- `spec` (table, optional): The entry's settings, only those to set: the rest are the section's defaults.<br>A key the section's entries do not have, in any case: rejected with a console error that lists the ones they take.<br>Left out: every setting its default.

Good to know:

- A new state has no condition and no changes; it applies while its `when` flags hold and its `rule` is true, such as `rule = "value > 64"`.
- A new animation is a 120 ms change into hover and back; with `kind = "keyframes"`, one that plays all the time over the frames given.
- Returns true when it was written. Rejected: false, with a console error; nothing is defined.

*Short name: `panelDefine` · Panel window only.*

```lua
-- Lua
ce.panel.define("knob", "States", "Held", { when = { pressed = true } })
```
```js
// JavaScript
ce.panel.define("knob", "States", "Held", { when: { pressed: true } });
```

#### `ce.panel.undefine(control, section, name)`

Remove an entry from a collection section.

Example: `ce.panel.undefine("Cutoff", "States", "Disabled")` removes Cutoff's Disabled state.

- `control` (text, required): The control's name.<br>Not a control: rejected with a console error.
- `section` (text, required): One of "States", "Bindings", "Animations", "Parts", "ValueChannels", "Behaviors", "HitZones", "Generators", "Links" or "Variants". Case-insensitive.<br>Any other: rejected with a console error.
- `name` (text, required): The entry's name. Case-insensitive.<br>Not one of the section's: false, without a word.

Good to know:

- `set(path, nil)` does not remove an entry: this does.
- Returns true when it was removed; false when there was none. Rejected: false, with a console error.

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

Change how a control looks in one of its states, such as hovered or pressed.

Example: `ce.panel.patch("Cutoff", "Hover", { ["Background.Fill.colour"] = "red" })` turns Cutoff's fill red while it is hovered.

- `control` (text, required): The control's name.<br>Not a control: rejected with a console error.
- `state` (text, required): The state's name, as `ce.panel.entries(control, "States")` lists them.<br>Not one of its states: rejected with a console error.
- `patch` (table, required): Property paths, such as "Background.Fill.colour", with their values in that state: added to what it changes already.<br>A path in any case.<br>A path that leads nowhere, a whole section, or a property its section lacks: not applied, with a console line saying why.<br>A colour: stored as `set()` stores it; one it would refuse: rejected with a console error, and nothing is applied.
- `part` (text, optional): One part of a custom component, to change in that state.<br>Not one of its parts: rejected with a console error.

Good to know:

- This reaches the settings inside a state, which `set()` cannot.
- Returns how many settings were applied. Rejected: 0, with a console error.

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

Capture every control's value, by name.

Example: `local before = ce.panel.snapshot()` keeps the panel's values, to put back with `ce.panel.restore(before)`.

Good to know:

- A control without a value of its own is left out.
- Keep it with `ce.storage.saveSetting()`, or in `state` for an A/B comparison.
- Returns a table of control names and their values.

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

Call a function once for every control, with its name.

Example: `ce.panel.each(function(name) log(name) end)` logs every control's name.

- `fn` (function, required): Called as fn(name) for every control, those inside containers too, in panel order.<br>The names are taken first, so it can make or remove controls.<br>Not a function, or left out: rejected with a console error.

Good to know:

- `ce.panel.info()` tells more about each.
- Returns how many controls it was called for. Rejected: 0, with a console error.

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

Write the values of a `ce.panel.snapshot()` back to the controls.

Example: `ce.panel.restore(before)` puts back the values `before` holds.

- `snapshot` (table, required): A table of control names and values, as `ce.panel.snapshot()` gives.<br>A control the panel no longer has: skipped.<br>Not a table, or left out: rejected with a console error.

Good to know:

- Returns how many values were written. Rejected: 0, with a console error.

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

A table the script keeps its own values in between handler calls.

Example: `state.count = (state.count or 0) + 1` counts the calls.

Good to know:

- This script's only.
- Emptied when the script loads again; `ce.storage.saveSetting()` keeps a value longer.

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

Save a value under a name, to keep it when the script loads again.

Example: `saveSetting("lastPatch", 12)` keeps 12 under lastPatch.

- `key` (text, required): A name you choose, matched as written.<br>A number: used as text.<br>Left out, or anything else: nothing is saved, with a console error.
- `value` (any value, required): Numbers, text, true or false, lists and tables.<br>Left out: nothing is saved, with a console error. `ce.storage.forget()` deletes a setting.
- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- Kept with the panel; in an exported plug-in, in the DAW project.
- Returns true; false when it could not be saved, such as where storage is not available.

*Short name: `saveSetting`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scope` | text | "panel" | "panel": every script on the panel; kept with the panel.<br>"script": this script only.<br>"local": this computer only, never written into the panel; in an exported plug-in, this instance only.<br>Case-insensitive.<br>Left out: "panel".<br>Any other: nothing is saved or read, with a console error; it does not fall back to "panel", which would share a private value. |

```lua
ce.storage.saveSetting("key", value)
```

#### `ce.storage.loadSetting(key [, fallback [, opts]])`

Read a value saved with `ce.storage.saveSetting()`.

Example: `loadSetting("lastPatch", 1)` gives the saved patch, or 1 if none was saved.

- `key` (text, required): The name it was saved under, matched as written.<br>A number: used as text.<br>Left out, or anything else: the fallback, with a console error.
- `fallback` (any value, optional): Given back when nothing is saved under the name.<br>Left out: no result.
- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- Returns the value.
- Each scope keeps its own: the same name in two scopes is two values.

*Short name: `loadSetting`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scope` | text | "panel" | "panel": every script on the panel; kept with the panel.<br>"script": this script only.<br>"local": this computer only, never written into the panel; in an exported plug-in, this instance only.<br>Case-insensitive.<br>Left out: "panel".<br>Any other: nothing is saved or read, with a console error; it does not fall back to "panel", which would share a private value. |

```lua
-- Lua
local v = ce.storage.loadSetting("key", default)
```
```js
// JavaScript
const v = ce.storage.loadSetting("key", default);
```

#### `ce.storage.settings([opts]) -> list`

List the names saved in one scope.

Example: `listSettings()` gives the names saved for the panel.

- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- Returns a list of names, in no order. An empty list: nothing saved yet; `ce.storage.info()` says whether storage works.
- The "panel" scope leaves out every script's own.

*Short name: `listSettings`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scope` | text | "panel" | "panel": every script on the panel; kept with the panel.<br>"script": this script only.<br>"local": this computer only, never written into the panel; in an exported plug-in, this instance only.<br>Case-insensitive.<br>Left out: "panel".<br>Any other: nothing is saved or read, with a console error; it does not fall back to "panel", which would share a private value. |

```lua
-- Lua
for _, k in ipairs(ce.storage.settings()) do  end
```
```js
// JavaScript
for (const k of ce.storage.settings()) {  }
```

#### `ce.storage.forget(key [, opts]) -> boolean`

Delete one saved value.

Example: `forgetSetting("lastPatch")` deletes lastPatch.

- `key` (text, required): The name it was saved under, matched as written.<br>A number: used as text.<br>Left out, or anything else: false, with a console error.
- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- Returns true if there was one to delete; false if not.

*Short name: `forgetSetting`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scope` | text | "panel" | "panel": every script on the panel; kept with the panel.<br>"script": this script only.<br>"local": this computer only, never written into the panel; in an exported plug-in, this instance only.<br>Case-insensitive.<br>Left out: "panel".<br>Any other: nothing is saved or read, with a console error; it does not fall back to "panel", which would share a private value. |

```lua
-- Lua
ce.storage.forget("key")
```
```js
// JavaScript
ce.storage.forget("key");
```

#### `ce.storage.all([opts]) -> table`

Give every value saved in one scope, by name.

Example: `allSettings().lastPatch` gives the saved lastPatch.

- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- Returns a table of names and values.
- The "panel" scope leaves out every script's own.

*Short name: `allSettings`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scope` | text | "panel" | "panel": every script on the panel; kept with the panel.<br>"script": this script only.<br>"local": this computer only, never written into the panel; in an exported plug-in, this instance only.<br>Case-insensitive.<br>Left out: "panel".<br>Any other: nothing is saved or read, with a console error; it does not fall back to "panel", which would share a private value. |

```lua
-- Lua
for k, v in pairs(ce.storage.all()) do log(k, v) end
```
```js
// JavaScript
for (const [k, v] of Object.entries(ce.storage.all())) log(k, v);
```

#### `ce.storage.clear([opts]) -> number`

Delete every value saved in one scope.

Example: `clearSettings({ scope = "script" })` deletes this script's own.

- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- Returns how many were deleted.
- Clearing "panel" leaves every script's own.

*Short name: `clearSettings`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scope` | text | "panel" | "panel": every script on the panel; kept with the panel.<br>"script": this script only.<br>"local": this computer only, never written into the panel; in an exported plug-in, this instance only.<br>Case-insensitive.<br>Left out: "panel".<br>Any other: nothing is saved or read, with a console error; it does not fall back to "panel", which would share a private value. |

#### `ce.storage.info([opts]) -> table`

Tell where one scope's values are kept, and whether they will last.

Example: `storageInfo().available` gives true where saved values are kept.

- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- Returns { scope, backing, available, count, bytes }.
- `backing`: "panel", with the panel, in the editor; "project", in the DAW project, in an exported plug-in; "machine", on this computer.
- `available` false: nothing saved there is kept.
- `count`: how many; `bytes`: their size as JSON text.

*Short name: `storageInfo`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `scope` | text | "panel" | "panel": every script on the panel; kept with the panel.<br>"script": this script only.<br>"local": this computer only, never written into the panel; in an exported plug-in, this instance only.<br>Case-insensitive.<br>Left out: "panel".<br>Any other: nothing is saved or read, with a console error; it does not fall back to "panel", which would share a private value. |

#### `ce.storage.encode(value [, opts]) -> string`

Write a value as JSON text.

Example: `encodeJson({ b = 1, a = 2 })` gives {"a":2,"b":1}.

- `value` (any value, required): Numbers, text, true or false, lists and tables.
- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- Returns the text, the keys sorted, so the same data gives the same text.
- A value with no JSON form, such as a function or a table inside itself, or left out: no result, without a word.
- The same in every language; Lua has no JSON of its own.

*Short name: `encodeJson`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `indent` | number | 0 | Spaces to indent each level, laid out over several lines.<br>0: one line.<br>Range: 0 ↔ 10.<br>A fraction: rounded down.<br>Above 10: 10, with a console warning the first time.<br>Below 0, or not a number: one line, with a console warning the first time. |

```lua
-- Lua
sendSysex(toAscii(ce.storage.encode(patch)))
```
```js
// JavaScript
sendSysex(toAscii(ce.storage.encode(patch)));
```

#### `ce.storage.decode(text) -> value`

Read JSON text back into a value.

Example: `decodeJson("[1, 2]")` gives {1, 2}.

- `text` (text, required): JSON text.<br>Text that is not JSON, not text, or left out: no result, with a console error.

Good to know:

- Returns the value.
- A JSON null is nothing: {"a":1,"b":null} gives a table with a only, and [1,null,2] a list of two.

*Short name: `decodeJson`.*

## Commands: How it looks

Drawing, images, typography, and dialogs with the user.

### ce.draw: drawing

Drawing your own graphics on top of a control, from its script's onDraw. Set the colours and line style first, then draw shapes and text; everything is measured in pixels from the control's top-left corner.

- Drawing commands add to what is there: clear first.
- A coordinate or size that is not a number, or a size below 0: 0, with a console warning, the first time only.
- A shape wholly outside the control: a console warning, the first time only.
- An option with a wrong value: a console warning, the first time only, and the fallback in its row.
- A required value that is left out: rejected with a console error.

**Colours that fill, stroke and gradient read**

| Written as | Example |
|---|---|
| Six hex digits, the panel's form | "5B9BD5" |
| Eight hex digits, alpha first, the panel's form | "805B9BD5" (drawn with that alpha) |
| "#" with 3, 4, 6 or 8 digits, alpha last | "#F80", "#5B9BD580" |
| A CSS colour name, in any case | "red", "steelblue", "transparent" |
| rgb(), rgba(), hsl(), hsla() | "rgb(91, 155, 213)" |
| A gradient from `ce.draw.gradient()` | |

Not accepted: a number, three digits without "#", anything else: rejected with a console error; the colour in force stays.

Everything in this chapter needs the panel window. With the window closed these commands do nothing and write a note to the log.

#### `ce.draw.clear([target])`

Erase everything drawn on a control.

Example: `drawClear("Scope")` erases what is drawn on Scope.

- `target` (text, optional): The control's name.<br>Left out: the control the script is attached to.

Good to know:

- Drawing commands add to what is there, so this is usually the first line of onDraw.
- Returns true; unknown control, or no control to draw on: rejected with a console error.

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

Set the fill colour for the shapes drawn after it.

Example: `drawFill("#5B9BD5")` fills the shapes drawn after it with that blue.

- `colour` (colour, optional): A colour (the table in the introduction), or a gradient from `ce.draw.gradient()`.<br>Left out, "" or "none": no fill.<br>Not a colour: rejected with a console error; the fill stays as it was.

Good to know:

- Applies to everything drawn after it; each onDraw starts with no fill and no stroke.
- Returns no value.

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

Set the line colour and width for the shapes drawn after it.

Example: `drawStroke("#5B9BD5", 2)` outlines the shapes drawn after it in that blue, 2 pixels wide.

- `colour` (colour, optional): A colour (the table in the introduction), or a gradient from `ce.draw.gradient()`.<br>Left out, "" or "none": no outlines.<br>Not a colour: rejected with a console error; the stroke stays as it was.
- `width` (number, optional): Line width in pixels.<br>Range: > 0.<br>Default: 1.<br>≤ 0, or invalid: 1.
- `opts` (options, optional): The options below.<br>Left out: solid lines, butt ends, mitred corners.

Good to know:

- Applies to everything drawn after it; each onDraw starts with no fill and no stroke.
- Returns no value.

*Short name: `drawStroke`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `dash` | list of numbers | a solid line | On and off lengths in pixels, alternating.<br>A length < 0, or invalid: 0.<br>Not a list: solid line. |
| `dashOffset` | number (pixels) | 0 | Where the dash pattern starts.<br>Advanced on a timer: the dashes move.<br>Invalid: 0. |
| `cap` | text | "butt" | Line ends: "butt", "round" or "square". Case-insensitive.<br>Invalid: default. |
| `join` | text | "miter" | Corners: "miter", "round" or "bevel". Case-insensitive.<br>Invalid: default. |

```lua
-- Lua
ce.draw.stroke("#5B9BD5", 2)
```
```js
// JavaScript
ce.draw.stroke("#5B9BD5", 2);
```

#### `ce.draw.rect(x, y, w, h [, radius])`

Draw a rectangle.

Example: `drawRect(10, 10, 40, 20, 4)` draws a 40 × 20 rectangle at (10, 10) with rounded corners.

- `x` (number, required): Left edge, in pixels from the control's left.
- `y` (number, required): Top edge, in pixels from the control's top.
- `w` (number, required): Width in pixels.<br>Range: ≥ 0.<br>< 0, or invalid: 0.
- `h` (number, required): Height in pixels.<br>Range: ≥ 0.<br>< 0, or invalid: 0.
- `radius` (number, optional): Corner radius in pixels.<br>Range: ≥ 0.<br>Default: 0.<br>< 0, or invalid: 0.

Good to know:

- Drawn with the fill and stroke in force.
- Returns true; no control to draw on: rejected with a console error.

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

Draw a circle.

Example: `drawCircle(50, 50, 20)` draws a circle of radius 20 centred on (50, 50).

- `cx` (number, required): Centre, in pixels from the control's left.
- `cy` (number, required): Centre, in pixels from the control's top.
- `r` (number, required): Radius in pixels.<br>Range: ≥ 0.<br>< 0, or invalid: 0.

Good to know:

- Drawn with the fill and stroke in force.
- Returns true; no control to draw on: rejected with a console error.

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

Draw a straight line.

Example: `drawLine(0, 0, 100, 50)` draws a line from (0, 0) to (100, 50).

- `x1` (number, required): Start, in pixels from the control's left.
- `y1` (number, required): Start, in pixels from the control's top.
- `x2` (number, required): End, in pixels from the control's left.
- `y2` (number, required): End, in pixels from the control's top.

Good to know:

- Drawn with the stroke in force; the fill does not apply.
- Returns true; no control to draw on: rejected with a console error.

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

Draw a line through a series of points.

Example: `drawPath({0, 20, 10, 5, 20, 20})` draws a line through (0, 20), (10, 5) and (20, 20).

- `points` (list, required): One flat list of coordinates: {x1, y1, x2, y2, …}.<br>A pair that is not two numbers: left out.<br>An odd number of values: the last left out.<br>Fewer than two points left, or not a list: rejected with a console error.
- `closed` (true or false, optional): Join the last point to the first.<br>Default: false.<br>Invalid: false.

Good to know:

- Drawn with the stroke in force; closed, it is filled too.
- One flat list of coordinates, unlike `ce.draw.curve()` and `ce.draw.points()`, which take a list of points.
- Returns true; fewer than two points, or no control to draw on: rejected with a console error.

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

Draw part of a circle.

Example: `drawArc(50, 50, 40, 0, 90)` draws a quarter circle of radius 40 centred on (50, 50), from twelve o'clock clockwise to three o'clock.

- `x` (number, required): Centre, in pixels from the control's left.
- `y` (number, required): Centre, in pixels from the control's top.
- `radius` (number, required): Radius in pixels.<br>Range: ≥ 0.<br>< 0, or invalid: 0.
- `from` (number, required): Start angle in degrees.<br>0: twelve o'clock, increasing clockwise, as the Meter's arcStart.
- `to` (number, required): End angle in degrees.<br>Above from: drawn clockwise; below from: anticlockwise.<br>360 or more apart: a full circle.

Good to know:

- Drawn with the stroke in force; with a fill, filled as a pie slice through the centre.
- Returns true; no control to draw on: rejected with a console error.

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

Make a gradient to use as a fill or stroke colour.

Example: `drawGradient({"red", "blue"}, 90)` gives a gradient from red on the left to blue on the right.

- `stops` (list, required): A list of colours (the table in the introduction), of { at, colour, opacity } tables, or a mix.<br>at: position along the gradient. Range: 0 ↔ 1. Left out: spaced evenly.<br>opacity: Range: 0 ↔ 1. Default: 1.<br>Fewer than two stops, not a list, a colour that is not one, or at or opacity outside its range: rejected with a console error.
- `angle` (number, optional): Direction in degrees.<br>0: upwards; 90: to the right, as the Background section's gradients.<br>Default: 180 (top to bottom).<br>Invalid: default.

Good to know:

- Returns a gradient for `ce.draw.fill()` or `ce.draw.stroke()`. Rejected: no result.

*Short name: `drawGradient`.*

```lua
-- Lua
ce.draw.fill(ce.draw.gradient({ "#2A6BD4", "#0A1830" }, 180))
```
```js
// JavaScript
ce.draw.fill(ce.draw.gradient(["#2A6BD4", "#0A1830"], 180));
```

#### `ce.draw.opacity([a])`

Set how solid the shapes drawn after it are.

Example: `drawOpacity(0.5)` draws the shapes after it half see-through.

- `a` (number, optional): Opacity.<br>Range: 0 ↔ 1 (0: invisible; 1: solid).<br>Left out: solid, which switches it off.<br>Outside the range, or invalid: rejected with a console error; the opacity stays as it was.

Good to know:

- Applies to everything drawn after it, like the fill and stroke.
- One colour see-through instead: `ce.math.alpha()`.
- Returns no value.

*Short name: `drawOpacity`.*

#### `ce.draw.transform([opts])`

Rotate, move or scale the shapes drawn after it.

Example: `drawTransform({rotate = 135, cx = 40, cy = 40})` turns the shapes after it 135° clockwise about (40, 40).

- `opts` (options, optional): The options below.<br>Left out: no transform.

Good to know:

- Replaces the transform before it; left out, it clears it.
- Returns no value.

*Short name: `drawTransform`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `rotate` | number (degrees) | 0 | Rotation in degrees, clockwise.<br>Invalid: default. |
| `cx` | number (pixels) | the top-left corner | Centre of rotation, in pixels from the control's left.<br>Given without cy: the top-left corner.<br>Invalid: 0. |
| `cy` | number (pixels) | the top-left corner | Centre of rotation, in pixels from the control's top.<br>Given without cx: the top-left corner.<br>Invalid: 0. |
| `x` | number (pixels) | 0 | Shift to the right, in pixels.<br>Invalid: default. |
| `y` | number (pixels) | 0 | Shift down, in pixels.<br>Invalid: default. |
| `scale` | number | 1 | Size factor.<br>2: double; 0.5: half; negative: mirrored.<br>Invalid: default. |

```lua
-- Lua
ce.draw.transform({ rotate = 135, cx = w / 2, cy = h / 2 })
```
```js
// JavaScript
ce.draw.transform({ rotate: 135, cx: w / 2, cy: h / 2 });
```

#### `ce.draw.ellipse(cx, cy, rx, ry)`

Draw an ellipse.

Example: `drawEllipse(50, 25, 40, 20)` draws an ellipse 80 wide and 40 tall centred on (50, 25).

- `cx` (number, required): Centre, in pixels from the control's left.
- `cy` (number, required): Centre, in pixels from the control's top.
- `rx` (number, required): Horizontal radius in pixels.<br>Range: ≥ 0.<br>< 0, or invalid: 0.
- `ry` (number, required): Vertical radius in pixels.<br>Range: ≥ 0.<br>< 0, or invalid: 0.

Good to know:

- Drawn with the fill and stroke in force.
- Returns true; no control to draw on: rejected with a console error.

*Short name: `drawEllipse`.*

#### `ce.draw.pixelText(text, x, y [, scale])`

Write text in the built-in 5 × 7 LCD font.

Example: `drawPixelText("128", 4, 4, 2)` writes 128 at (4, 4), each font pixel 2 screen pixels.

- `text` (text, required): The text.<br>A number: written as text.
- `x` (number, required): Left edge, in pixels from the control's left.
- `y` (number, required): Top edge, in pixels from the control's top.
- `scale` (number, optional): Screen pixels per font pixel.<br>Range: ≥ 1, whole.<br>Default: 1.<br>A fraction: rounded.<br>< 1, or invalid: 1.

Good to know:

- Drawn in the fill colour, or the stroke colour with no fill; each lit pixel a sharp square.
- (`x`, `y`) is the top-left corner of the text, unlike `ce.draw.text()`, where `y` is the baseline.
- A character the font has no glyph for: a gap, with a console warning the first time.
- Returns true; no control to draw on: rejected with a console error.

*Short name: `drawPixelText`.*

#### `ce.draw.measure(text [, opts]) -> table`

Measure text before drawing it.

Example: `drawMeasure("Hello", {size = 14}).width` gives the width of Hello at size 14.

- `text` (text, required): The text.<br>A number: measured as text.
- `opts` (options, optional): The options below.<br>Left out: size 12, sans-serif.

Good to know:

- Returns { width, height, exact }: pixels, and whether the width was measured (true) or estimated (false; the LCD font is always exact).
- Rejected: no result.

*Short name: `drawMeasure`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `size` | number (pixels) | 12 | Text size in pixels.<br>Range: > 0.<br>≤ 0, or invalid: default. |
| `family` | text | — | Font family.<br>Left out: sans-serif. |
| `pixel` | true or false | false | Measure in the LCD font of `ce.draw.pixelText()` instead.<br>Invalid: false. |
| `scale` | number | 1 | Screen pixels per font pixel, with pixel.<br>Range: ≥ 1, whole.<br>A fraction: rounded.<br>< 1, or invalid: 1. |

#### `ce.draw.batch(fn) -> boolean`

Run a function and show everything it draws in one update.

Example: `drawBatch(function() for i = 0, 63 do ce.draw.line(i, 0, i, 20) end end)` draws 64 lines in one update.

- `fn` (function, required): The function to run.<br>An error in it: written to the console; what it drew before it stays.

Good to know:

- Several times faster for a loop of commands; `ce.draw.grid()`, `ce.draw.lines()` and `ce.draw.points()` are one command already.
- Returns true; not a function: rejected with a console error.

*Short name: `drawBatch`.*

#### `ce.draw.grid([opts]) -> boolean`

Draw a grid of lines in one command.

Example: `drawGrid({columns = 16, rows = 4})` draws 17 vertical and 5 horizontal lines over the control.

- `opts` (options, optional): The options below: a box, and a spacing or a count.<br>Left out: rejected with a console error.

Good to know:

- Drawn with the stroke in force; the closing lines are drawn, so 4 columns are 5 lines.
- Returns true; neither a spacing nor a count, or no control to draw on: rejected with a console error.

*Short name: `drawGrid`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `x` | number (pixels) | 0 | Left edge, in pixels from the control's left.<br>Invalid: 0. |
| `y` | number (pixels) | 0 | Top edge, in pixels from the control's top.<br>Invalid: 0. |
| `width` | number (pixels) | to the control's right edge | Width in pixels.<br>Range: ≥ 0.<br>< 0, or invalid: 0. |
| `height` | number (pixels) | to the control's bottom edge | Height in pixels.<br>Range: ≥ 0.<br>< 0, or invalid: 0. |
| `step` | number (pixels) | — | Spacing both ways, in pixels.<br>Range: > 0.<br>Given with columns or rows: ignored that way.<br>≤ 0, or invalid: ignored. |
| `stepX` | number (pixels) | — | Spacing across, in pixels.<br>Range: > 0.<br>Given with columns: ignored.<br>≤ 0, or invalid: ignored. |
| `stepY` | number (pixels) | — | Spacing down, in pixels.<br>Range: > 0.<br>Given with rows: ignored.<br>≤ 0, or invalid: ignored. |
| `columns` | number | — | Number of columns across the width.<br>Range: ≥ 1, whole.<br>A fraction: rounded.<br>< 1, or invalid: ignored. |
| `rows` | number | — | Number of rows down the height.<br>Range: ≥ 1, whole.<br>A fraction: rounded.<br>< 1, or invalid: ignored. |

#### `ce.draw.lines(segments) -> boolean`

Draw separate straight lines in one command.

Example: `drawLines({{0, 0, 10, 0}, {0, 5, 10, 5}})` draws two horizontal lines.

- `segments` (list, required): A list of segments, each {x1, y1, x2, y2} or {x1 = , y1 = , x2 = , y2 = }.<br>An item that is not a segment: left out.<br>Empty, or not a list: rejected with a console error.

Good to know:

- Drawn with the stroke in force; the fill does not apply.
- One connected line through points: `ce.draw.path()`.
- Returns true; no segments, or no control to draw on: rejected with a console error.

*Short name: `drawLines`.*

#### `ce.draw.points(points [, radius]) -> boolean`

Draw a set of dots in one command.

Example: `drawPoints({{10, 10}, {20, 14}}, 2)` draws two dots of radius 2.

- `points` (list, required): A list of points, each {x, y} or {x = , y = }.<br>An item that is not a point: left out.<br>Empty, or not a list: rejected with a console error.
- `radius` (number, optional): Radius of each dot, in pixels.<br>Range: > 0.<br>Default: 1.5.<br>≤ 0, or invalid: default.

Good to know:

- Drawn with the fill and stroke in force.
- Returns true; no points, or no control to draw on: rejected with a console error.

*Short name: `drawPoints`.*

#### `ce.draw.curve(points [, opts]) -> boolean`

Draw a smooth curve through a list of points in one command.

Example: `drawCurve({{0, 30}, {30, 0}, {60, 30}}, {tension = 0.8})` draws a rounded curve through three points.

- `points` (list, required): A list of points, each {x, y} or {x = , y = }.<br>An item that is not a point: left out.<br>Fewer than two left, or not a list: rejected with a console error.
- `opts` (options, optional): The options below.<br>Left out: tension 0.5, open.

Good to know:

- Drawn with the stroke in force; closed, it is filled too.
- Returns true; fewer than two points, or no control to draw on: rejected with a console error.

*Short name: `drawCurve`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `tension` | number (0 to 1) | 0.5 | Roundness.<br>Range: 0 ↔ 1 (0: straight lines between the points; 1: fully rounded).<br>Outside the range: the nearest end.<br>Invalid: default. |
| `closed` | true or false | false | Join the last point to the first.<br>Invalid: false. |

#### `ce.draw.polygon(cx, cy, radius, sides [, opts]) -> boolean`

Draw a regular polygon.

Example: `drawPolygon(50, 30, 20, 6)` draws a hexagon centred on (50, 30), its corners 20 pixels from the centre.

- `cx` (number, required): Centre, in pixels from the control's left.
- `cy` (number, required): Centre, in pixels from the control's top.
- `radius` (number, required): Distance from the centre to each corner, in pixels.<br>Range: ≥ 0.<br>< 0, or invalid: 0.
- `sides` (number, required): Number of sides.<br>Range: ≥ 3, whole.<br>A fraction: rounded.<br>< 3, or invalid: 3.
- `opts` (options, optional): The options below.<br>Left out: a corner at twelve o'clock.

Good to know:

- Drawn with the fill and stroke in force.
- Returns true; no control to draw on: rejected with a console error.

*Short name: `drawPolygon`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `rotation` | number (degrees) | 0 | Rotation in degrees, clockwise.<br>0: a corner at twelve o'clock, as `ce.draw.arc()` measures its angles.<br>Invalid: default. |

#### `ce.draw.image(src, x, y, w, h [, opts]) -> boolean`

Draw an image in a box.

Example: `drawImage(ce.image.asset("logo").dataUrl, 0, 0, 64, 64, {fit = "contain"})` draws the library icon logo in a 64 × 64 box, keeping its shape.

- `src` (text, required): The image data: a data URL, or the dataUrl of `ce.image.asset()`.<br>An icon's name: rejected with a console error, which names the call to use.
- `x` (number, required): Left edge, in pixels from the control's left.
- `y` (number, required): Top edge, in pixels from the control's top.
- `w` (number, required): Width in pixels.<br>Range: ≥ 0.<br>< 0, or invalid: 0.
- `h` (number, required): Height in pixels.<br>Range: ≥ 0.<br>< 0, or invalid: 0.
- `opts` (options, optional): The options below.<br>Left out: fit "fill".

Good to know:

- Returns true; a source that is not image data, or no control to draw on: rejected with a console error.

*Short name: `drawImage`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `fit` | text | "fill" | How the image fills the box: "fill" (stretched), "contain" (its shape kept, with gaps) or "cover" (its shape kept, cropped). Case-insensitive.<br>Invalid: default. |

#### `ce.draw.clip([x, y, w, h]) -> boolean`

Limit the shapes drawn after it to a rectangle.

Example: `drawClip(0, 0, 60, 20)` shows only what the shapes after it draw inside the top-left 60 × 20.

- `x` (number, optional): Left edge, in pixels from the control's left.<br>Invalid: 0.
- `y` (number, optional): Top edge, in pixels from the control's top.<br>Invalid: 0.
- `w` (number, optional): Width in pixels.<br>Range: > 0.<br>≤ 0, or invalid: 0, which hides everything drawn after it.
- `h` (number, optional): Height in pixels.<br>Range: > 0.<br>≤ 0, or invalid: 0, which hides everything drawn after it.

Good to know:

- Applies to everything drawn after it, like the fill and stroke; `ce.draw.save()` and `ce.draw.restore()` include it.
- All four left out: no clip.
- Drawing never goes outside the control: a clip only makes the area smaller.
- Returns true; some of the four left out: rejected with a console error; the clip stays as it was.

*Short name: `drawClip`.*

#### `ce.draw.blend(mode) -> boolean`

Set how the shapes drawn after it mix with what is under them.

Example: `drawBlend("multiply")` darkens what is under the shapes drawn after it.

- `mode` (text, required): One of "normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference" or "exclusion". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Applies to everything drawn after it, like the fill and stroke; "normal" switches it off.
- Returns true; not a mode: rejected with a console error; the blend stays as it was.

*Short name: `drawBlend`.*

#### `ce.draw.save() -> boolean`

Remember the drawing style, for `ce.draw.restore()`.

Example: `drawSave()` remembers the style; `drawRestore()` brings it back.

Good to know:

- The style: fill, stroke, width, dash, cap, join, opacity, transform, clip and blend.
- Saved styles are forgotten at the start of each onDraw.
- Returns true.

*Short name: `drawSave`.*

#### `ce.draw.restore() -> boolean`

Bring back the style remembered by the last `ce.draw.save()`.

Example: `drawRestore()` brings back the style `drawSave()` remembered.

Good to know:

- Returns true; nothing saved: rejected with a console error; the style stays as it was.

*Short name: `drawRestore`.*

#### `ce.draw.text(x, y, text [, opts])`

Write text.

Example: `drawText(4, 12, "hello", {size = 10})` writes hello at size 10, its baseline at y 12.

- `x` (number, required): Left end, centre or right end of the text, by align, in pixels from the control's left.
- `y` (number, required): Baseline, in pixels from the control's top.
- `text` (text, required): The text.<br>A number: written as text.
- `opts` (options, optional): The options below.<br>Left out: size 12, left-aligned, the control's font.

Good to know:

- Drawn in the fill colour, or the stroke colour with no fill.
- `y` is the baseline: the line the letters sit on. `ce.draw.pixelText()` takes the top-left corner.
- Returns true; no control to draw on: rejected with a console error.

*Short name: `drawText`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `size` | number (pixels) | 12 | Text size in pixels.<br>Range: > 0.<br>≤ 0, or invalid: default. |
| `align` | text | "left" | Which part of the text sits at x: "left", "middle" or "right". Case-insensitive.<br>"center", "centre" and "centred": "middle".<br>Invalid: rejected with a console error. |
| `family` | text | — | Font family.<br>Left out: the control's font. |

```lua
-- Lua
ce.draw.text(4, 12, "hello")
```
```js
// JavaScript
ce.draw.text(4, 12, "hello");
```

#### `ce.draw.redraw([target])`

Run onDraw again for a control.

Example: `drawRedraw()` in onTimer redraws the control the script is attached to every tick.

- `target` (text, optional): The control's name.<br>Left out: the control the script is attached to.

Good to know:

- Nothing is redrawn on its own: to animate, call this from onTimer.
- Returns true; unknown control, or no control to redraw: rejected with a console error.

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

List the images a control can show: the icon library's, then the panel's own.

Example: `imageAssets({ vector = true })` gives the vector icons.

- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- Returns a list of { id, name, source, mime, vector, width, height, filePath, dataUrl, portable, embeddable }.
- `source` "panel": carried with the panel. `portable`: in the panel already; true for those, false for the library's.
- A library icon is copied into the panel on sharing or export when a control shows it or a script names it in quotes; not one whose name a script builds as it runs.
- `embeddable`: it has image data that `ce.image.embed()` can copy into the panel.

*Short name: `imageAssets`.*

**`opts`** can contain:

| Name | Type | What it is |
|---|---|---|
| `vector` | true or false | Set true to list only vector icons, which stay sharp at any size. |
| `embeddable` | true or false | Set true to list only icons ce.image.embed() can copy into the panel, so they survive an export. |

#### `ce.image.asset(idOrName) -> table|nil`

Find one image by its id or name.

Example: `imageAsset("Logo")` gives the image called Logo.

- `idOrName` (text, required): The image's id or name; a name in any case.<br>Not an image: no result, without a word.<br>Left out: no result, with a console error.

Good to know:

- Returns the entry, as `ce.image.assets()` gives each.
- By id first, then by name, as the panel finds an icon to draw.

*Short name: `imageAsset`.*

#### `ce.image.set(target, src [, opts]) -> boolean`

Put a picture on one of a control's image layers, and switch the layer on.

Example: `imageSet("Pad", "textures/metal.png", { opacity = 60 })` shows the picture behind Pad at 60%.

- `target` (text, required): The control's name.<br>Not a control on the panel: rejected with a console error.
- `src` (text, required): The picture: a file's path or address, or a data URL ("data:image/png;base64,…").<br>Only a data URL survives an export; `ce.image.embed()` copies a file in.<br>Left out: the picture is kept; only the options are set.<br>"": the layer is emptied and switched off.<br>Left out, with no option: nothing is set, with a console error.
- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- The picture and the switch are set together: a layer is never on with nothing in it.
- A text layer replaces the text's fill.
- Returns true. An option the layer does not have: refused, with a console error, and false.

*Short name: `imageSet`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `layer` | text | "image" | Which of the control's four image layers to write. The first two are background layers and stack; the last two fill the text and are exclusive. Each option below applies only to layers that have it; an unsupported option is refused and reported.<br>One of "image", "overlay", "textImage" or "textTexture". Case-insensitive. |
| `fit` | text | "fill" on a background, "cover" on text | How the image fills the layer. The meaning differs by layer type: on a background it is one of fill, fit, stretch, tile, original and "fill" means COVER; on text it is one of cover, contain, fill and "fill" means stretch. The text texture layer always tiles and takes no fit.<br>One of "fill", "fit", "stretch", "tile", "original", "cover" or "contain". Case-insensitive. |
| `align` | text | "center" | Where the image sits when it does not fill the layer. Background layers only — on a text layer use offsetX and offsetY instead. Note the hyphens.<br>One of "top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom" or "bottom-right". Case-insensitive. |
| `opacity` | number (0 to 100) | 100 | How solid the layer is, on the panel's own 0 to 100 scale — not 0 to 1. A value above 0 and up to 1 is applied as written, which is almost invisible, and writes a warning. |
| `tint` | colour | — | Tint colour, as "#RRGGBB", or "AARRGGBB" with its alpha first; the "#" is optional. A web colour with only one meaning is taken too and stored as those digits, as `set()` stores one: "#000" as "000000", "red" as "FF0000", and rgb(), rgba(), hsl() or hsla() the same way, as AARRGGBB when it is see-through. Anything else, a number or "#" with four digits included, is refused with a message, and the other options still apply. Omit it to leave the image untinted. |
| `blend` | text | "normal" | How the layer mixes with what is underneath it. Background layers only.<br>One of "normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference" or "exclusion". Case-insensitive. |
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
| `clipMode` | text | "shape" | Whether the image is clipped to the control's drawn shape or to its plain rectangle. Background layers only.<br>One of "shape" or "box". Case-insensitive. |
| `muted` | true or false | false | Keep the layer configured but hide it, so you can switch it back on without setting it up again. Background layers only. |

#### `ce.image.clear(target [, layer]) -> boolean`

Switch an image layer off and empty it.

Example: `imageClear("Pad", "overlay")` takes the overlay away.

- `target` (text, required): The control's name.<br>Not a control on the panel: rejected with a console error.
- `layer` (text, optional): "image" or "overlay": the background layers, which stack.<br>"textImage" or "textTexture": the text's fill.<br>Case-insensitive.<br>Left out: "image".<br>Any other: rejected with a console error.

Good to know:

- A text layer sets the text's fill back to "solid": a text fill with no picture shows nothing.
- Returns true; false with a console error.

*Short name: `imageClear`.*

#### `ce.image.read(target [, layer]) -> table`

Read every setting of one image layer.

Example: `imageRead("Pad").source` gives "data", "file" or "none".

- `target` (text, required): The control's name.<br>Not a control on the panel: rejected with a console error.
- `layer` (text, optional): "image" or "overlay": the background layers, which stack.<br>"textImage" or "textTexture": the text's fill.<br>Case-insensitive.<br>Left out: "image".<br>Any other: rejected with a console error.

Good to know:

- Returns the layer's settings, with three more:
- `active`: whether it is drawn; a text layer's by the text's fill, not its switch.
- `source`: "data", "file" or "none".
- `portable`: whether it survives an export; only embedded data does.

*Short name: `imageRead`.*

#### `ce.image.icon(target, idOrName [, opts]) -> boolean`

Show an image in a control's Icon section, by its id or name.

Example: `imageIcon("Play", "play-circle", { size = 24 })` shows the play-circle icon on Play.

- `target` (text, required): The control's name.<br>Not a control on the panel: rejected with a console error.
- `idOrName` (text, required): The image's id or name; a name in any case.<br>Not an image: rejected with a console error.
- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- A control showing only its text is switched to show the icon beside it, or alone with no text.
- Write the id or name in quotes: sharing and exporting find the icon that way, and copy it into the panel.
- Use it rather than `set()`: it writes the asset's id and name together.
- Returns true; false with a console error.

*Short name: `imageIcon`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `size` | number (pixels) | 16 | How big the icon is drawn. |
| `fit` | text | "contain" | How the icon fills its box, using the Icon section's own values. |
| `tint` | colour | — | Tint colour, as "#RRGGBB", or "AARRGGBB" with its alpha first; the "#" is optional. A web colour with only one meaning is taken too and stored as those digits, as `set()` stores one: "#000" as "000000", "red" as "FF0000", and rgb(), rgba(), hsl() or hsla() the same way, as AARRGGBB when it is see-through. Anything else, a number or "#" with four digits included, is refused with a message, and the other options still apply. Omit it to leave the image untinted. |
| `opacity` | number (0 to 1) | 1 | Image opacity. 0 is invisible, 1 is fully opaque. A value above 1, such as 50 written for ce.image.set's scale, draws fully opaque and writes a warning. |
| `rotation` | number (degrees) | 0 | Turn the image clockwise, with 0 upright. |

#### `ce.image.embed(target [, layer]) -> boolean`

Copy a layer's picture into the panel, so it survives an export.

Example: `imageEmbed("Pad")` copies Pad's background picture into the panel.

- `target` (text, required): The control's name.<br>Not a control on the panel: rejected with a console error.
- `layer` (text, optional): "image" or "overlay": the background layers, which stack.<br>"textImage" or "textTexture": the text's fill.<br>Case-insensitive.<br>Left out: "image".<br>Any other: rejected with a console error.

Good to know:

- Returns true; the picture already in the panel: true, changing nothing.
- A file not read yet: false, and its reading starts; call it again once it has loaded.

*Short name: `imageEmbed`.*

#### `ce.image.load(path) -> boolean`

Start reading an image file, and say whether it is ready.

Example: `imageLoad("textures/metal.png")` gives false at first, then true once the file is read.

- `path` (text, required): The file's path, or a data URL.<br>Left out, or "": false, with a console error.

Good to know:

- A layer that points at a file shows nothing until it is read, which happens in the background.
- Returns true when it is ready; a data URL at once.

*Short name: `imageLoad`.*

### ce.text: fonts and lettering

Fonts and lettering: which fonts are available, setting a control's type in one call, variable-font settings, and measuring text so it fits.

Everything in this chapter needs the panel window. With the window closed these commands do nothing and write a note to the log.

#### `ce.text.fonts([opts]) -> list`

List every font the panel can use, and what each supports.

Example: `textFonts({ variable = true })` gives the variable fonts.

- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- Returns a list: the built-in fonts, the font library's, and the panel's own, `source` "panel".
- `portable`: there wherever the panel goes; true for the built-in fonts and the panel's own, false for the library's.
- A library font is copied into the panel on sharing or export when a control uses it or a script names it in quotes.
- `featuresKnown` false: an empty `features` list means they are not known, not that there are none.

*Short name: `textFonts`.*

**`opts`** can contain:

| Name | Type | What it is |
|---|---|---|
| `portable` | true or false | Set true to list only fonts that are already there wherever the panel goes: the built-in fonts and the ones the panel carries. A font from your font library is packed in when you share or export the panel, if a control uses it or a script names it in quotes. |
| `variable` | true or false | Set true to list only variable fonts, the ones with adjustable axes such as weight and width. |

#### `ce.text.font(family) -> table|nil`

Find one font by its family name.

Example: `textFont("Inter").variable` gives true for a variable Inter.

- `family` (text, required): The family, or its display name, as the Properties panel shows it, in any case.<br>Not a font the panel has: no result, without a word.<br>Left out: no result, with a console error.

Good to know:

- Returns its description, as `ce.text.fonts()` gives each.
- Use it to see that a font is there before setting it, or which axes it has.

*Short name: `textFont`.*

#### `ce.text.style(target, opts) -> boolean`

Set a control's typography in one call: font, size, weight, spacing, alignment and the rest.

Example: `textStyle("Title", { family = "Inter", size = 18, weight = "Bold" })` sets Title in 18-point Inter Bold.

- `target` (text, required): The control's name.<br>Not a control on the panel: rejected with a console error.
- `opts` (options, required): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- Use it rather than `set()` for the weight: it is two fields that must agree, and this writes both.
- Name the font in quotes: sharing and exporting find a library font that way, and copy it into the panel.
- Returns true. A font the panel has not, or a feature the font has not: refused, with a console error, the other options set, and false.

*Short name: `textStyle`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `family` | text | — | The font family. An unavailable family is refused rather than stored; a bare set() would store it and quietly fall back to a system font. |
| `size` | number (pixels) | — | How big the text is drawn. |
| `weight` | number or text | — | How heavy the text is, either as a number from 100 to 900 or as a name such as "Bold". The panel stores this as a pair of fields that must agree, and this always writes both. |
| `bold` | true or false | — | A shorthand for a heavy weight. |
| `italic` | true or false | — | Slant the text over. |
| `caseMode` | text | "normal" | Re-case the text as it is drawn, without changing what it says.<br>One of "normal", "uppercase", "lowercase", "title", "sentence" or "smallcaps". Case-insensitive. |
| `scriptMode` | text | "normal" | Draw the text smaller and raised or lowered, as superscript or subscript.<br>One of "normal", "superscript" or "subscript". Case-insensitive. |
| `justification` | text | — | Where the text sits inside the control.<br>One of "topLeft", "top", "topRight", "left", "centred", "right", "bottomLeft", "bottom" or "bottomRight". Case-insensitive. |
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

Set one axis of a variable font, by its four-letter tag.

Example: `textAxis("Title", "wght", 650)` sets Title's weight axis to 650.

- `target` (text, required): The control's name.<br>Not a control on the panel: rejected with a console error.
- `tag` (text, required): The axis's tag, such as "wght" or "wdth".<br>Not one the font has: rejected with a console error.
- `value` (number, required): The axis's value.<br>Outside the font's range: the nearest end.

Good to know:

- "wght" sets the control's weight too, as the Properties panel's slider does.
- Returns true; false with a console error.

*Short name: `textAxis`.*

#### `ce.text.read(target [, name]) -> value|table`

Read one text setting by name, or every one.

Example: `textRead("Title", "size")` gives Title's text size.

- `target` (text, required): The control's name.<br>Not a control on the panel: rejected with a console error.
- `name` (text, optional): A setting's name, such as "size" or "lineHeight", wherever in the Text section it is.<br>Left out: every setting, as a table.<br>Not a setting: no result, with a console error.

Good to know:

- Returns the value; left out, { content, resolvedWeight, font, multiline, position }.
- `resolvedWeight`: the weight the text is drawn at, from its two weight fields.

*Short name: `textRead`.*

#### `ce.text.measure(target [, text]) -> table`

Measure how much room a control's text takes, in its own font.

Example: `textMeasure("Title").truncated` gives true when some of the text is cut off.

- `target` (text, required): The control's name.<br>Not a control on the panel: rejected with a console error.
- `text` (text, optional): Text to measure in the control's font.<br>Left out: the control's own.

Good to know:

- Returns { width, height, lines, truncated, exact }.
- Laid out as the panel lays it out: spacing, wrapping and the line limit count.
- `exact` false: it could not be measured, and the answer is an estimate.

*Short name: `textMeasure`.*

#### `ce.text.fit(target [, opts]) -> table`

Find the largest text size at which a control's text fits, and set it.

Example: `textFit("Title", { min = 8 })` makes Title's text as large as fits, and 8 at least.

- `target` (text, required): The control's name.<br>Not a control on the panel: rejected with a console error.
- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- Returns { size, fits, changed, exact }.
- Tries whole sizes from `max` down to `min`. Even `min` too large: set to `min`, `fits` false.
- Unlike Text.Multiline.fitMode "shrink", which only draws the text smaller, this writes the size.

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

Show a short message to the person using the panel.

Example: `uiNotify("Patch saved")` shows Patch saved for three seconds.

- `message` (text, required): The text.<br>A number: written as text.<br>Left out, or "": nothing is shown, with a console error.
- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- Returns its id, for `ce.ui.update()` and `ce.ui.dismiss()`.
- For what the player should know; `log()` is for you.
- A click on it removes it.

*Short name: `uiNotify`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `kind` | text | "info" | Severity of the message. Sets the colour and the icon.<br>One of "info", "warn" or "error". Case-insensitive. |
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

Show a line of text in the status bar, until it is replaced.

Example: `uiStatus("Recording", { kind = "warn" })` shows Recording in the status bar.

- `message` (text, optional): The text.<br>Left out, or "": the status bar is cleared.
- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- For a state that lasts, such as "Synced"; `ce.ui.notify()` is for an event.
- `ce.ui.state()` reads it back.
- Returns true.

*Short name: `uiStatus`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `kind` | text | "info" | Severity of the message. Sets the colour and the icon.<br>One of "info", "warn" or "error". Case-insensitive. |

```lua
-- Lua
ce.ui.status("Recording")
```
```js
// JavaScript
ce.ui.status("Recording");
```

#### `ce.ui.dialog(opts [, onChoice]) -> boolean`

Ask a question with buttons.

Example: `uiDialog({ title = "Overwrite the patch?", buttons = { "Cancel", "Overwrite" } }, fn)` asks, and calls fn with the button clicked.

- `opts` (options, required): Options, below.<br>An option it does not have: nothing is done, with a console error.
- `onChoice` (function, optional): Called later with the label of the button clicked; nothing when it was closed without one.

Good to know:

- One dialog at a time.
- Returns true if it appeared. Another dialog open: false, and `onChoice` called with nothing; `ce.ui.state()` says so.
- No title and no message: false, with a console error, and `onChoice` called with nothing.

*Short name: `uiDialog`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `title` | text | — | The bold line at the top. |
| `message` | text | — | The body text under the heading. |
| `buttons` | list of text | one button labelled "OK" | The button labels, left to right. Whichever is clicked is what `onChoice` is given. |
| `kind` | text | "info" | Severity of the message. Sets the colour and the icon.<br>One of "info", "warn" or "error". Case-insensitive. |
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

Ask for a line of text.

Example: `uiPrompt({ title = "Name this patch", value = "Init" }, fn)` asks, and calls fn with what was typed.

- `opts` (options, required): Options, below.<br>An option it does not have: nothing is done, with a console error.
- `onAnswer` (function, optional): Called later with the text typed; "" when an empty field was accepted; nothing when it was cancelled.

Good to know:

- Enter accepts.
- Returns true if it appeared. Another dialog open: false, and `onAnswer` called with nothing.
- No title and no message: false, with a console error, and `onAnswer` called with nothing.

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
| `kind` | text | "info" | Severity of the message. Sets the colour and the icon.<br>One of "info", "warn" or "error". Case-insensitive. |
| `default` | text | the accept label | Which of the two buttons is drawn as the default one: the accept label or the cancel label. Pressing Enter in the field accepts either way. |

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

Ask for a choice from a list.

Example: `uiChoose({ title = "Load which bank?", items = { "A", "B", "C" } }, fn)` asks, and calls fn with the bank chosen.

- `opts` (options, required): Options, below.<br>An option it does not have: nothing is done, with a console error.
- `onAnswer` (function, optional): Called later with the item chosen; a list of them with `multiple`; nothing when it was cancelled.

Good to know:

- A long list scrolls.
- Returns true if it appeared. Another dialog open: false, and `onAnswer` called with nothing.
- No title and no message, or no items: false, with a console error, and `onAnswer` called with nothing.

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
| `kind` | text | "info" | Severity of the message. Sets the colour and the icon.<br>One of "info", "warn" or "error". Case-insensitive. |

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

Remove a message `ce.ui.notify()` showed, or every one.

Example: `uiDismiss(id)` removes that message.

- `id` (number, optional): The id `ce.ui.notify()` gave.<br>Left out: every message.<br>Not a number: nothing is removed, with a console error.

Good to know:

- Returns how many were removed.

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

Change the text of a message that is showing.

Example: `uiUpdate(id, "Sending 3 of 8")` changes the message in place.

- `id` (number, required): The id `ce.ui.notify()` gave.
- `message` (text, required): The new text.
- `opts` (options, optional): Options, below.<br>An option it does not have: nothing is done, with a console error.

Good to know:

- For progress: show the first with `duration = 0`, so it stays, then change it as you go.
- Returns true; false once the message has gone, such as when it was clicked away, so you know to stop.
- No id, or no message: false, with a console error.

*Short name: `uiUpdate`.*

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `kind` | text | "info" | Severity of the message. Sets the colour and the icon.<br>One of "info", "warn" or "error". Case-insensitive. |
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

Give what is on screen: the status bar, the messages and whether a dialog is open.

Example: `uiState().dialog` gives true while a dialog is open.

Good to know:

- Returns { status, statusKind, notifications, dialog }; each notification { id, message, kind, sticky }.
- `dialog` true: why `ce.ui.dialog()` gave false, rather than there being no panel window.

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

Copy text to the clipboard.

Example: `uiCopy(encodeJson(allSettings()))` copies the panel's settings as JSON.

- `text` (text, required): The text.<br>A number: written as text.

Good to know:

- Returns true when it was tried, not that it worked: the system may refuse a copy that does not follow a click, which the console says.
- Scripts cannot read the clipboard.
- No text: false, with a console error.

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

Components live in the panel window, so these commands need the window open. Each component's
commands follow, grouped by what the component does, with what each one takes.

### Note sources

Components that produce notes.

#### ce.components.arp: Arpeggiator

Play notes one at a time from its own chord, a Chord Pad or the MIDI input: their order, speed, length, swing and rhythm.

##### `ce.components.arp.run(target [, run]) -> boolean`

Start or stop the arp.

Example: `ce.components.arp.run("Arp", false)` stops it.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `run` (true or false, optional): true: plays.<br>false: stops.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Free-running: it starts again where it stopped.
- Synced: it plays only while the Transport runs.
- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpRun`.*

##### `ce.components.arp.pattern(target, pattern) -> boolean`

Set the order the notes are played in.

Example: `ce.components.arp.pattern("Arp", "updown")` plays the notes low to high, then back down.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `pattern` (text, required): "up": low to high.<br>"down": high to low.<br>"updown": up, then down; the top and bottom notes once.<br>"downup": down, then up; the same.<br>"asPlayed": in the order the notes were pressed. Its own chord: as "up".<br>"random": one note at random each step.<br>"chord": every note at once, each step.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "up".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpPattern`.*

##### `ce.components.arp.rate(target, rate) -> boolean`

Set how many steps a second it plays, while not synced.

Example: `ce.components.arp.rate("Arp", 8)` plays eight steps a second.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `rate` (number, required): Steps per second.<br>Range: 0.1 ↔ 40.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- While synced to the Transport: no effect; `division()` sets the step.
- Default: 6.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpRate`.*

##### `ce.components.arp.division(target, division) -> boolean`

Set how long each step is while synced.

Example: `ce.components.arp.division("Arp", "1/8T")` plays eighth-note triplets.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `division` (text, required): A note value, "1/1" a whole note to "1/32".<br>"D" after it: dotted, half as long again.<br>"T" after it: a triplet, two-thirds as long.<br>One of "1/1", "1/2", "1/4", "1/8", "1/16", "1/32", "1/2D", "1/4D", "1/8D", "1/16D", "1/2T", "1/4T", "1/8T" or "1/16T". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- While synced only: free-running, `rate()` sets the step.
- Default: "1/16".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpDivision`.*

##### `ce.components.arp.sync(target [, sync]) -> boolean`

Follow the Transport's tempo, or run at its own rate.

Example: `ce.components.arp.sync("Arp", true)` steps in time with the Transport, one step per `division()`.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `sync` (true or false, optional): true: one step per `division()` at the Transport's tempo, in step with its position.<br>false: `rate()` steps a second.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Synced: silent while the Transport is stopped.
- Synced: `rate()` and `phase()` have no effect, and the Transport's swing plays unless `swingSource()` is "own".
- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpSync`.*

##### `ce.components.arp.octaves(target, octaves) -> boolean`

Set how many octaves the notes are repeated over, upward.

Example: `ce.components.arp.octaves("Arp", 2)` plays the notes, then the same notes an octave up.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `octaves` (number, required): Octaves, from the notes up.<br>1: the notes only.<br>Range: 1 ↔ 4, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- A note above 127 is left out.
- With "chord": every octave at once.
- Default: 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpOctaves`.*

##### `ce.components.arp.gate(target, gate) -> boolean`

Set how long each note is held, as a part of its step.

Example: `ce.components.arp.gate("Arp", 0.5)` holds each note for half its step.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `gate` (number, required): Part of the step.<br>1: held to the next step; 99% of it, so a repeated note sounds again.<br>Range: 0.05 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.6.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpGate`.*

##### `ce.components.arp.swing(target, swing) -> boolean`

Set how far every second step is delayed.

Example: `ce.components.arp.swing("Arp", 0.5)` delays every second step by a quarter of a step.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `swing` (number, required): Part of half a step: 1 delays every second step by half a step.<br>0: straight.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- While synced: the Transport's swing, unless `swingSource()` is "own".
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpSwing`.*

##### `ce.components.arp.swingSource(target, swingSource) -> boolean`

Set whose swing a synced arp plays: the Transport's or its own.

Example: `ce.components.arp.swingSource("Arp", "own")` plays its own swing while synced.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `swingSource` (text, required): "transport": the Transport's swing, while synced.<br>"own": `swing()`, always.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Not synced: its own swing, either way.
- Default: "transport".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpSwingSource`.*

##### `ce.components.arp.latch(target [, latch]) -> boolean`

Keep playing the last notes held after they are let go.

Example: `ce.components.arp.latch("Arp", true)` keeps playing the last chord held on the linked Chord Pad after it is let go.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `latch` (true or false, optional): true: the last notes held keep playing.<br>false: it stops when they are let go.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- With `source()` "link" or "input" only: its own chord always plays.
- Notes held again replace the latched ones.
- A Panic lets them go.
- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpLatch`.*

##### `ce.components.arp.key(target, key) -> boolean`

Set the key of its own chord.

Example: `ce.components.arp.key("Arp", "F#")` builds its chord in F♯.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `key` (number or name, required): The key's note: "C", "F#", "Eb", in any case; or a number, 0 C to 11 B.<br>Past 11 or below 0: round the octave; 12 is C.<br>A fraction: rounded.<br>Invalid: rejected with a console error.

Good to know:

- Its own chord only: with `source()` "link" or "input" the notes come from there.
- Following the panel's key: replaced at its next change.
- Default: 0 (C).
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpKey`.*

##### `ce.components.arp.scale(target, scale) -> boolean`

Set the scale of its own chord.

Example: `ce.components.arp.scale("Arp", "dorian")` builds its chord from the Dorian scale.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `scale` (text, required): One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" or "blues". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Its own chord only.
- Following the panel's key: replaced at its next change.
- Default: "minor".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpScale`.*

##### `ce.components.arp.followPanelKey(target [, followPanelKey]) -> boolean`

Follow the panel's key and scale, or keep its own.

Example: `ce.components.arp.followPanelKey("Arp", true)` takes the panel's key and scale, and changes with them.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `followPanelKey` (true or false, optional): true: the panel's key and scale, at once and at every change.<br>false: its own.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpFollowPanelKey`.*

##### `ce.components.arp.degree(target, degree) -> boolean`

Set which step of the scale its chord is built on.

Example: `ce.components.arp.degree("Arp", 5)` builds its chord on the fifth step.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `degree` (number, required): Step of the scale, counted from 1: 1 is the key's own chord.<br>Range: 1 ↔ the scale's notes: 7, 6 for "blues", 5 for the pentatonics.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Its own chord only.
- A scale changed to a shorter one: its last step.
- Default: 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpDegree`.*

##### `ce.components.arp.chordType(target, chordType) -> boolean`

Set how many notes its chord has.

Example: `ce.components.arp.chordType("Arp", "seventh")` adds the seventh: four notes.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `chordType` (text, required): "triad": three notes.<br>"seventh": four, the seventh added.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Its own chord only.
- Default: "triad".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpChordType`.*

##### `ce.components.arp.velocity(target, velocity) -> boolean`

Set how hard every note it plays is struck.

Example: `ce.components.arp.velocity("Arp", 110)` plays every note at velocity 110.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `velocity` (number, required): MIDI velocity.<br>Range: 1 ↔ 127, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The same for every note: the velocity the notes were held at is not used.
- Default: 96.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpVelocity`.*

##### `ce.components.arp.channel(target, channel) -> boolean`

Set which MIDI channel it plays on.

Example: `ce.components.arp.channel("Arp", 10)` plays its notes on channel 10.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `channel` (number, required): MIDI channel.<br>Range: 1 ↔ 16, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpChannel`.*

##### `ce.components.arp.euclid(target [, euclid]) -> boolean`

Switch the Euclidean rhythm on or off.

Example: `ce.components.arp.euclid("Arp", true)` plays only the steps the rhythm hits.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `euclid` (true or false, optional): true: the rhythm decides which steps sound.<br>false: every step sounds.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- The rhythm: `euclidPulses()` hits spread evenly over `euclidSteps()` steps, turned by `euclidRotate()`.
- It runs against the notes: an 8-step rhythm over a 3-note chord lands on different notes each time round.
- Hand mutes stay silent either way.
- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpEuclid`.*

##### `ce.components.arp.euclidSteps(target, euclidSteps) -> boolean`

Set how many steps the rhythm is long.

Example: `ce.components.arp.euclidSteps("Arp", 8)` makes an 8-step rhythm.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `euclidSteps` (number, required): Steps in the rhythm.<br>Range: 1 ↔ 32, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 8.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpEuclidSteps`.*

##### `ce.components.arp.euclidPulses(target, euclidPulses) -> boolean`

Set how many of the rhythm's steps sound.

Example: `ce.components.arp.euclidPulses("Arp", 3)` sounds 3 steps, spread as evenly as they go.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `euclidPulses` (number, required): Hits, spread as evenly as they go.<br>0: none sound.<br>Range: 0 ↔ `euclidSteps()`, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Steps lowered below it later: every step sounds.
- Default: 5.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpEuclidPulses`.*

##### `ce.components.arp.euclidRotate(target, euclidRotate) -> boolean`

Turn the rhythm by a number of steps.

Example: `ce.components.arp.euclidRotate("Arp", 1)` moves every hit a step earlier.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `euclidRotate` (number, required): Steps to turn it: each hit that many steps earlier.<br>Past the steps, or below 0: round them; -1 is the last.<br>A fraction: rounded.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpEuclidRotate`.*

##### `ce.components.arp.phase(target, phase) -> boolean`

Move the arp to a point in its sequence.

Example: `ce.components.arp.phase("Arp", 0.5)` moves it halfway through its sequence.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `phase` (number, required): Where in the sequence: 0 the start, 0.5 halfway.<br>1: the start again.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Running: the next step plays from there. Stopped: it starts from there.
- While synced: no effect; the Transport's position decides.
- `read(target, "phase")` gives where it is now.
- Nothing is written to the panel.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpPhase`.*

##### `ce.components.arp.mute(target, index [, on]) -> boolean`

Mute or unmute one step.

Example: `ce.components.arp.mute("Arp", 3)` mutes step 3 if it plays, and lets it play if it is muted.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `index` (number, required): Step number, counted from 1, as the cells are drawn from the left.<br>A fraction: rounded.<br>Past the last step: kept, for when the sequence grows.<br>Below 1, or invalid: rejected with a console error.
- `on` (true or false, optional): true: muted.<br>false: plays.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- A step is a place in the sequence, not a note: the mute stays on step 3 when the notes change.
- `read(target, "mute")`: the muted steps, counted from 1; `read(target, "mute", 3)`: true if step 3 is muted.
- Default: none muted.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpMute`.*

##### `ce.components.arp.inputChannel(target, inputChannel) -> boolean`

Set which MIDI channel it takes notes from.

Example: `ce.components.arp.inputChannel("Arp", 2)` plays only the notes held on channel 2.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `inputChannel` (number, required): Channel 1 ↔ 16, or 0: any channel.<br>Range: 0 ↔ 16, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `source()` is "input".
- Default: 0, any channel.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpInputChannel`.*

##### `ce.components.arp.baseOctave(target, baseOctave) -> boolean`

Set the octave its chord starts in.

Example: `ce.components.arp.baseOctave("Arp", 4)` puts the chord's root in octave 4, as in C4, middle C.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `baseOctave` (number, required): The root's octave, as in C3. Middle C is C4.<br>Range: -1 ↔ 8, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Its own chord only.
- A note above 127 is left out.
- Default: 3.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpBaseOctave`.*

##### `ce.components.arp.source(target, source) -> boolean`

Set where the notes come from.

Example: `ce.components.arp.source("Arp", "input")` plays the notes held on the MIDI input.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `source` (text, required): "chord": its own chord, from `key()`, `scale()` and `degree()`.<br>"link": the notes held on the Chord Pad set by `link()`.<br>"input": the notes held on the MIDI input, on `inputChannel()`.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "chord".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpSource`.*

##### `ce.components.arp.link(target [, name]) -> boolean`

Set the Chord Pad it plays from.

Example: `ce.components.arp.link("Arp", "Pads")` plays the chords held on the Chord Pad called Pads.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `name` (text, optional): The Chord Pad's name. Case-insensitive.<br>Left out, or "": none.<br>Not on this panel, or not a Chord Pad: rejected with a console error.

Good to know:

- Played only while `source()` is "link".
- The Chord Pad stays silent while the arp plays from it.
- Default: none.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.
- `read(target, "link")` gives the Chord Pad's name.

*Short name: `arpLink`.*

##### `ce.components.arp.editable(target [, editable]) -> boolean`

Let a click on a step mute it, or not.

Example: `ce.components.arp.editable("Arp", false)` stops clicks muting steps.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `editable` (true or false, optional): true: a click on a step mutes or unmutes it.<br>false: clicks do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Only clicks are locked: `mute()` still works.
- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpEditable`.*

##### `ce.components.arp.showNotes(target [, showNotes]) -> boolean`

Show or hide the note names in the steps.

Example: `ce.components.arp.showNotes("Arp", false)` hides the note names.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `showNotes` (true or false, optional): true: each step shows its note, "C3", or a chord's count, "3♪".<br>false: hidden.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- A step narrower than 22 or shorter than 26 pixels shows no name either way.
- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpShowNotes`.*

##### `ce.components.arp.showHeader(target [, showHeader]) -> boolean`

Show or hide the strip above the steps.

Example: `ce.components.arp.showHeader("Arp", false)` hides the strip, and the steps take its room.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `showHeader` (true or false, optional): true: the strip shows the pattern, where the notes come from and the rate.<br>false: hidden; the steps take its room.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `arpShowHeader`.*

##### `ce.components.arp.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.arp.read("Arp")` gives every setting as a table.

- `target` (control name, required): The Arpeggiator's control, by name.<br>Not an Arpeggiator: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): For "mute": a step number, counted from 1; true if that step is muted.<br>A fraction: rounded.<br>Below 1, or invalid: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name.
- `read(target, "phase")`: where it is now.
- `read(target, "mute")`: the muted steps; `read(target, "mute", 3)`: whether step 3 is.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `arpRead`.*

#### ce.components.chordpad: Chord Pad

Play a chord, or a note of the scale, from each pad: the key and scale they are built from, their voicing, and what they send.

##### `ce.components.chordpad.mode(target, mode) -> boolean`

Set what a pad plays: a chord, or one note of the scale.

Example: `ce.components.chordpad.mode("ChordPad", "notes")` gives each pad one note of the scale.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `mode` (text, required): "chords": one chord per step of the scale.<br>"notes": one note of the scale per pad, over `noteSpan()` octaves.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- With `layout()` "wheel": chords either way.
- Default: "chords".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadMode`.*

##### `ce.components.chordpad.key(target, key) -> boolean`

Set the key the pads are built in.

Example: `ce.components.chordpad.key("ChordPad", "F#")` builds the pads in F♯.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `key` (number or name, required): The key's note: "C", "F#", "Eb", in any case; or a number, 0 C to 11 B.<br>Past 11 or below 0: round the octave; 12 is C.<br>A fraction: rounded.<br>Invalid: rejected with a console error.

Good to know:

- Following the panel's key: replaced at its next change.
- Default: 0 (C).
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadKey`.*

##### `ce.components.chordpad.scale(target, scale) -> boolean`

Set the scale the pads are built from.

Example: `ce.components.chordpad.scale("ChordPad", "dorian")` builds the pads from the Dorian scale.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `scale` (text, required): One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" or "blues". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Following the panel's key: replaced at its next change.
- Default: "major".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadScale`.*

##### `ce.components.chordpad.followPanelKey(target [, followPanelKey]) -> boolean`

Follow the panel's key and scale, or keep its own.

Example: `ce.components.chordpad.followPanelKey("ChordPad", true)` takes the panel's key and scale, and changes with them.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `followPanelKey` (true or false, optional): true: the panel's key and scale, at once and at every change.<br>false: its own.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadFollowPanelKey`.*

##### `ce.components.chordpad.chordType(target, chordType) -> boolean`

Set how many notes each chord has.

Example: `ce.components.chordpad.chordType("ChordPad", "seventh")` adds the seventh: four notes.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `chordType` (text, required): "triad": three notes.<br>"seventh": four, the seventh added.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Only in "chords" mode.
- Default: "triad".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadChordType`.*

##### `ce.components.chordpad.voicing(target, voicing) -> boolean`

Set how each chord's notes are spread.

Example: `ce.components.chordpad.voicing("ChordPad", "drop2")` drops each chord's second note from the top an octave.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `voicing` (text, required): "close": stacked as built.<br>"spread": every second note an octave up.<br>"drop2": the second note from the top an octave down.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Only in "chords" mode.
- Applied after `inversion()`.
- Default: "close".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadVoicing`.*

##### `ce.components.chordpad.inversion(target, inversion) -> boolean`

Set how many of each chord's lowest notes move up an octave.

Example: `ce.components.chordpad.inversion("ChordPad", 1)` plays each chord in first inversion.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `inversion` (number, required): Inversions: each moves the lowest note up an octave.<br>0: root position.<br>Range: 0 ↔ 3, whole; a triad stops at 2.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only in "chords" mode.
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadInversion`.*

##### `ce.components.chordpad.octave(target, octave) -> boolean`

Transpose every pad by whole octaves.

Example: `ce.components.chordpad.octave("ChordPad", -1)` plays every pad an octave lower.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `octave` (number, required): Octaves, up or down from `baseOctave()`.<br>Range: -3 ↔ 3, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- With `baseOctave()`, stops at octaves -1 and 8.
- A note past the MIDI range sounds at its end, 0 or 127.
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadOctave`.*

##### `ce.components.chordpad.velocity(target, velocity) -> boolean`

Set how hard every note is struck.

Example: `ce.components.chordpad.velocity("ChordPad", 110)` plays every note at velocity 110.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `velocity` (number, required): MIDI velocity.<br>Range: 1 ↔ 127, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- While an Arp plays its chords (`arp.link()`), the pads sound nothing themselves.
- Default: 96.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadVelocity`.*

##### `ce.components.chordpad.channel(target, channel) -> boolean`

Set which MIDI channel the pads play on.

Example: `ce.components.chordpad.channel("ChordPad", 10)` plays the pads on channel 10.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `channel` (number, required): MIDI channel.<br>Range: 1 ↔ 16, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- While an Arp plays its chords (`arp.link()`), the pads sound nothing themselves.
- Default: 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadChannel`.*

##### `ce.components.chordpad.strum(target, strum) -> boolean`

Set the time between a chord's notes, lowest first.

Example: `ce.components.chordpad.strum("ChordPad", 30)` plays each chord's notes 30 ms apart, from the lowest.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `strum` (number, required): Milliseconds from one note to the next.<br>0: all at once.<br>Range: 0 ↔ 2000.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The inspector stops at 200.
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadStrum`.*

##### `ce.components.chordpad.latch(target [, latch]) -> boolean`

Keep a pad sounding after it is let go, until it is tapped again.

Example: `ce.components.chordpad.latch("ChordPad")` switches the latch on if it is off, and off if it is on.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `latch` (true or false, optional): true: a tap starts a pad, the next tap stops it.<br>false: a pad sounds while it is held.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadLatch`.*

##### `ce.components.chordpad.layout(target, layout) -> boolean`

Set how the pads are laid out: a circle of fifths, or a grid.

Example: `ce.components.chordpad.layout("ChordPad", "grid")` lays the pads out in rows.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `layout` (text, required): "wheel": the circle of fifths, each major chord with its relative minor inside; the chords in the key lit.<br>"grid": one pad per chord or note of the key, `gridCols()` to a row.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "wheel".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadLayout`.*

##### `ce.components.chordpad.baseOctave(target, baseOctave) -> boolean`

Set the octave the key's root is in.

Example: `ce.components.chordpad.baseOctave("ChordPad", 3)` puts the key's root in octave 3, as in C3.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `baseOctave` (number, required): The root's octave, as in C4: middle C.<br>Range: -1 ↔ 8, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- `octave()` moves the pads from here.
- Default: 4.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadBaseOctave`.*

##### `ce.components.chordpad.noteSpan(target, noteSpan) -> boolean`

Set how many octaves of the scale the pads cover.

Example: `ce.components.chordpad.noteSpan("ChordPad", 3)` lays out three octaves of the scale.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `noteSpan` (number, required): Octaves.<br>Range: 1 ↔ 3, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only in "notes" mode.
- Default: 2.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadNoteSpan`.*

##### `ce.components.chordpad.gridCols(target, gridCols) -> boolean`

Set how many pads a row of the grid has.

Example: `ce.components.chordpad.gridCols("ChordPad", 7)` puts seven pads in a row.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `gridCols` (number, required): Pads to a row.<br>Range: 1 ↔ 12, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `layout()` is "grid".
- The inspector stops at 8.
- Default: 4.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadGridCols`.*

##### `ce.components.chordpad.echo(target [, echo]) -> boolean`

Light the pads from the notes held on the MIDI input, as well as from taps.

Example: `ce.components.chordpad.echo("ChordPad")` switches the echo on if it is off, and off if it is on.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `echo` (true or false, optional): true: a pad is ringed while its notes are held on the input.<br>false: only taps light it.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadEcho`.*

##### `ce.components.chordpad.echoChannel(target, echoChannel) -> boolean`

Set which MIDI channel the echo listens to.

Example: `ce.components.chordpad.echoChannel("ChordPad", 2)` lights the pads from channel 2 only.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `echoChannel` (number, required): Channel 1 ↔ 16, or 0: any channel.<br>Range: 0 ↔ 16, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `echo()` is on.
- Default: 0, any channel.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadEchoChannel`.*

##### `ce.components.chordpad.editable(target [, editable]) -> boolean`

Let the pads be played by touch, or not.

Example: `ce.components.chordpad.editable("ChordPad")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `editable` (true or false, optional): true: a tap plays a pad.<br>false: taps do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadEditable`.*

##### `ce.components.chordpad.showPiano(target [, showPiano]) -> boolean`

Show or hide the keyboard strip of the notes sounding.

Example: `ce.components.chordpad.showPiano("ChordPad")` shows the piano if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `showPiano` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadShowPiano`.*

##### `ce.components.chordpad.showRomans(target [, showRomans]) -> boolean`

Show or hide the roman numerals on the pads, such as "I", "ii" and "♭VII".

Example: `ce.components.chordpad.showRomans("ChordPad")` shows the romans if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `showRomans` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `chordPadShowRomans`.*

##### `ce.components.chordpad.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.chordpad.read("ChordPad")` gives every setting as a table.

- `target` (control name, required): The Chord Pad's control, by name.<br>Not a Chord Pad: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `chordPadRead`.*

#### ce.components.noteribbon: Note Ribbon

Play notes, or glide between them, along a strip: its key and range, how it is touched, and what it sends.

##### `ce.components.noteribbon.mode(target, mode) -> boolean`

Set how the strip plays: the notes of the scale, every semitone, or a gliding pitch.

Example: `ce.components.noteribbon.mode("NoteRibbon", "glide")` bends the pitch as the finger moves.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `mode` (text, required): "snap": the notes of the scale only, one zone each.<br>"chromatic": every semitone, one zone each.<br>"glide": the pitch follows the finger, by pitch bend; past `bendRange()` the note starts again from a new one.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "snap".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonMode`.*

##### `ce.components.noteribbon.key(target, key) -> boolean`

Set the key whose scale is in key on the strip.

Example: `ce.components.noteribbon.key("NoteRibbon", "F#")` puts the strip in F♯.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `key` (number or name, required): The key's note: "C", "F#", "Eb", in any case; or a number, 0 C to 11 B.<br>Past 11 or below 0: round the octave; 12 is C.<br>A fraction: rounded.<br>Invalid: rejected with a console error.

Good to know:

- The notes in key: the zones of "snap", the marked ones otherwise.
- Following the panel's key: replaced at its next change.
- Default: 0 (C).
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonKey`.*

##### `ce.components.noteribbon.scale(target, scale) -> boolean`

Set the scale whose notes are in key.

Example: `ce.components.noteribbon.scale("NoteRibbon", "dorian")` puts the Dorian scale's notes in key.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `scale` (text, required): One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" or "blues". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Following the panel's key: replaced at its next change.
- Default: "major".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonScale`.*

##### `ce.components.noteribbon.followPanelKey(target [, followPanelKey]) -> boolean`

Follow the panel's key and scale, or keep its own.

Example: `ce.components.noteribbon.followPanelKey("NoteRibbon", true)` takes the panel's key and scale, and changes with them.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `followPanelKey` (true or false, optional): true: the panel's key and scale, at once and at every change.<br>false: its own.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonFollowPanelKey`.*

##### `ce.components.noteribbon.baseNote(target, baseNote) -> boolean`

Set the note at the low end of the strip.

Example: `ce.components.noteribbon.baseNote("NoteRibbon", 60)` starts the strip at middle C.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `baseNote` (number, required): MIDI note: 60 is middle C.<br>Range: 0 ↔ 127, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 48 (C3).
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonBaseNote`.*

##### `ce.components.noteribbon.octaves(target, octaves) -> boolean`

Set how many octaves the strip covers, up from `baseNote()`.

Example: `ce.components.noteribbon.octaves("NoteRibbon", 3)` spreads three octaves along the strip.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `octaves` (number, required): Octaves.<br>Range: 1 ↔ 5, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The strip stops at note 127.
- Default: 2.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonOctaves`.*

##### `ce.components.noteribbon.bendRange(target, bendRange) -> boolean`

Set the synth's pitch-bend range, which "glide" bends within.

Example: `ce.components.noteribbon.bendRange("NoteRibbon", 12)` bends up to an octave either way before a new note.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `bendRange` (number, required): Semitones: the synth's own bend range. Set to match it, or the glide is the wrong distance.<br>Range: 1 ↔ 48, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only in "glide" mode.
- Default: 2.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonBendRange`.*

##### `ce.components.noteribbon.velocity(target, velocity) -> boolean`

Set how hard every note is struck.

Example: `ce.components.noteribbon.velocity("NoteRibbon", 110)` plays every note at velocity 110.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `velocity` (number, required): MIDI velocity.<br>Range: 1 ↔ 127, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- While `velocityFrom()` is "position": not used.
- Default: 96.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonVelocity`.*

##### `ce.components.noteribbon.channel(target, channel) -> boolean`

Set which MIDI channel the notes, the bend and the CC go out on.

Example: `ce.components.noteribbon.channel("NoteRibbon", 2)` plays on channel 2.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `channel` (number, required): MIDI channel.<br>Range: 1 ↔ 16, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonChannel`.*

##### `ce.components.noteribbon.latch(target [, latch]) -> boolean`

Keep the note sounding after the finger lifts, until the strip is touched again.

Example: `ce.components.noteribbon.latch("NoteRibbon")` switches the latch on if it is off, and off if it is on.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `latch` (true or false, optional): true: it keeps sounding; the next touch silences it.<br>false: it stops when the finger lifts.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonLatch`.*

##### `ce.components.noteribbon.orientation(target, orientation) -> boolean`

Set which way the strip runs.

Example: `ce.components.noteribbon.orientation("NoteRibbon", "vertical")` runs the strip from low at the bottom to high at the top.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `orientation` (text, required): "horizontal": low at the left.<br>"vertical": low at the bottom.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "horizontal".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonOrientation`.*

##### `ce.components.noteribbon.velocityFrom(target, velocityFrom) -> boolean`

Set where each note's velocity comes from: fixed, or where across the strip it is touched.

Example: `ce.components.noteribbon.velocityFrom("NoteRibbon", "position")` plays harder the nearer the top edge it is touched.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `velocityFrom` (text, required): "fixed": `velocity()`.<br>"position": 8 at the bottom edge to 127 at the top; a vertical strip's left edge to its right.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "fixed".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonVelocityFrom`.*

##### `ce.components.noteribbon.modAxis(target, modAxis) -> boolean`

Set what a touch across the strip sends: nothing, or a CC.

Example: `ce.components.noteribbon.modAxis("NoteRibbon", "cc")` sends `modCc()` from where across the strip it is touched.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `modAxis` (text, required): "none": nothing.<br>"cc": `modCc()`, 0 at the bottom edge to 127 at the top; a vertical strip's left edge to its right.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonModAxis`.*

##### `ce.components.noteribbon.modCc(target, modCc) -> boolean`

Set which CC a touch across the strip sends.

Example: `ce.components.noteribbon.modCc("NoteRibbon", 74)` sends CC 74, often a synth's filter.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `modCc` (number, required): Controller number: 1 is the mod wheel.<br>Range: 0 ↔ 127, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `modAxis()` is "cc".
- Default: 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonModCc`.*

##### `ce.components.noteribbon.echo(target [, echo]) -> boolean`

Outline the zones of the notes held on the MIDI input.

Example: `ce.components.noteribbon.echo("NoteRibbon")` switches the echo on if it is off, and off if it is on.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `echo` (true or false, optional): true: a zone is outlined while its note is held on the input.<br>false: not.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonEcho`.*

##### `ce.components.noteribbon.echoChannel(target, echoChannel) -> boolean`

Set which MIDI channel the echo listens to.

Example: `ce.components.noteribbon.echoChannel("NoteRibbon", 2)` outlines the notes held on channel 2 only.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `echoChannel` (number, required): Channel 1 ↔ 16, or 0: any channel.<br>Range: 0 ↔ 16, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `echo()` is on.
- Default: 0, any channel.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonEchoChannel`.*

##### `ce.components.noteribbon.editable(target [, editable]) -> boolean`

Let the strip be played by touch, or not.

Example: `ce.components.noteribbon.editable("NoteRibbon")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `editable` (true or false, optional): true: a touch plays it.<br>false: touches do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonEditable`.*

##### `ce.components.noteribbon.showNames(target [, showNames]) -> boolean`

Show or hide the note names on the zones.

Example: `ce.components.noteribbon.showNames("NoteRibbon")` shows the names if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `showNames` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- A zone too narrow for its name shows none either way.
- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonShowNames`.*

##### `ce.components.noteribbon.showHeader(target [, showHeader]) -> boolean`

Show or hide the strip above the zones: the key, the mode and the note playing.

Example: `ce.components.noteribbon.showHeader("NoteRibbon")` shows the header if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `showHeader` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `noteRibbonShowHeader`.*

##### `ce.components.noteribbon.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.noteribbon.read("NoteRibbon")` gives every setting as a table.

- `target` (control name, required): The Note Ribbon's control, by name.<br>Not a Note Ribbon: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `noteRibbonRead`.*

#### ce.components.drumpads: Drum Pads

Play a fixed note from each pad of a grid: the notes and their names, how a hit is struck, rolls, and what the corners of a pad do.

##### `ce.components.drumpads.map(target, map) -> boolean`

Set how the pads are named, and whether the hi-hats choke each other.

Example: `ce.components.drumpads.map("DrumPads", "chromatic")` names the pads by pitch.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `map` (text, required): "gm": General MIDI drum names; the closed, pedal and open hi-hats choke each other.<br>"chromatic": named by pitch.<br>"custom": named as "gm", no choke groups.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- In every map pad 1 plays `baseNote()` and each pad after it a semitone higher; `note()`, `label()` and `choke()` change one pad.
- Default: "gm".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsMap`.*

##### `ce.components.drumpads.baseNote(target, baseNote) -> boolean`

Set the note pad 1 plays; each pad after it plays a semitone higher.

Example: `ce.components.drumpads.baseNote("DrumPads", 36)` starts the pads at 36, the GM bass drum.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `baseNote` (number, required): MIDI note: 36 is the GM bass drum.<br>Range: 0 ↔ 127, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- A pad past 127 plays 127.
- Default: 36.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsBaseNote`.*

##### `ce.components.drumpads.mode(target, mode) -> boolean`

Set how long a hit sounds.

Example: `ce.components.drumpads.mode("DrumPads", "toggle")` keeps a pad sounding until it is hit again.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `mode` (text, required): "momentary": while the pad is held.<br>"oneShot": for `gate()` milliseconds.<br>"toggle": until the pad is hit again.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "momentary".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsMode`.*

##### `ce.components.drumpads.gate(target, gate) -> boolean`

Set how long a one-shot hit sounds.

Example: `ce.components.drumpads.gate("DrumPads", 200)` holds each one-shot note for 200 ms.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `gate` (number, required): Milliseconds from the note-on to the note-off.<br>Range: 5 ↔ 2000, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `mode()` is "oneShot".
- Default: 60.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsGate`.*

##### `ce.components.drumpads.velocity(target, velocity) -> boolean`

Set how hard a hit is struck.

Example: `ce.components.drumpads.velocity("DrumPads", 110)` strikes every pad at velocity 110.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `velocity` (number, required): MIDI velocity.<br>Range: 1 ↔ 127, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- With `velocityFrom()` "position": not used; with "centre": a hit in the middle of a pad.
- Default: 100.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsVelocity`.*

##### `ce.components.drumpads.channel(target, channel) -> boolean`

Set which MIDI channel the pads play on.

Example: `ce.components.drumpads.channel("DrumPads", 10)` plays the pads on channel 10, the GM drum channel.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `channel` (number, required): MIDI channel.<br>Range: 1 ↔ 16, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 10.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsChannel`.*

##### `ce.components.drumpads.rows(target, rows) -> boolean`

Set how many rows of pads the grid has.

Example: `ce.components.drumpads.rows("DrumPads", 2)` makes the grid two rows high.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `rows` (number, required): Rows.<br>Range: 1 ↔ 8, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Pads beyond the grid keep what `note()` and the others set for them.
- Default: 4.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsRows`.*

##### `ce.components.drumpads.cols(target, cols) -> boolean`

Set how many pads a row has.

Example: `ce.components.drumpads.cols("DrumPads", 8)` puts eight pads in a row.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `cols` (number, required): Pads to a row.<br>Range: 1 ↔ 8, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 4.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsCols`.*

##### `ce.components.drumpads.origin(target, origin) -> boolean`

Set which corner of the grid pad 1 sits in.

Example: `ce.components.drumpads.origin("DrumPads", "topLeft")` numbers the pads in reading order.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `origin` (text, required): "bottomLeft": as hardware grids, row 1 at the bottom.<br>"topLeft": in reading order.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "bottomLeft".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsOrigin`.*

##### `ce.components.drumpads.velocityFrom(target, velocityFrom) -> boolean`

Set where a hit's velocity comes from.

Example: `ce.components.drumpads.velocityFrom("DrumPads", "centre")` strikes hardest in the middle of a pad.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `velocityFrom` (text, required): "fixed": `velocity()`.<br>"position": how high up the pad it lands, 10 at the bottom to 127 at the top.<br>"centre": `velocity()` in the middle, down to 28% of it at the edges.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "fixed".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsVelocityFrom`.*

##### `ce.components.drumpads.echo(target [, echo]) -> boolean`

Outline the pads of the notes held on the MIDI input.

Example: `ce.components.drumpads.echo("DrumPads")` switches the echo on if it is off, and off if it is on.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `echo` (true or false, optional): true: a pad is outlined while its note is held on the input.<br>false: not.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsEcho`.*

##### `ce.components.drumpads.echoChannel(target, echoChannel) -> boolean`

Set which MIDI channel the echo listens to.

Example: `ce.components.drumpads.echoChannel("DrumPads", 10)` outlines the notes held on channel 10 only.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `echoChannel` (number, required): Channel 1 ↔ 16, or 0: any channel.<br>Range: 0 ↔ 16, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `echo()` is on.
- Default: 0, any channel.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsEchoChannel`.*

##### `ce.components.drumpads.note(target, index, note) -> boolean`

Set the note one pad plays, by its number.

Example: `ce.components.drumpads.note("DrumPads", 3, 38)` makes pad 3 play 38, the GM snare.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `index` (number, required): Pad number, counted from 1.<br>A fraction: rounded.<br>Not one of the pads: rejected with a console error.
- `note` (number, required): MIDI note.<br>Range: 0 ↔ 127, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- `read(target, "note", 3)` gives the note pad 3 plays, from the map when none is set.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsNote`.*

##### `ce.components.drumpads.label(target, index, label) -> boolean`

Set the name one pad shows, by its number.

Example: `ce.components.drumpads.label("DrumPads", 3, "SNARE")` names pad 3 SNARE.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `index` (number, required): Pad number, counted from 1.<br>A fraction: rounded.<br>Not one of the pads: rejected with a console error.
- `label` (text, required): The name.<br>"": the name the map gives it.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsLabel`.*

##### `ce.components.drumpads.choke(target, index, choke) -> boolean`

Put one pad in a choke group, by its number.

Example: `ce.components.drumpads.choke("DrumPads", 3, 1)` puts pad 3 in choke group 1.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `index` (number, required): Pad number, counted from 1.<br>A fraction: rounded.<br>Not one of the pads: rejected with a console error.
- `choke` (number, required): Choke group: a hit silences the other pads in the same group.<br>0: none.<br>Range: 0 ↔ 8, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- With `map()` "gm", the hi-hats start in group 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsChoke`.*

##### `ce.components.drumpads.colour(target, index, colour) -> boolean`

Set the colour of one pad, by its number.

Example: `ce.components.drumpads.colour("DrumPads", 3, "red")` colours pad 3 red.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `index` (number, required): Pad number, counted from 1.<br>A fraction: rounded.<br>Not one of the pads: rejected with a console error.
- `colour` (colour, required): A colour, as `set()` takes one: a name, or "RRGGBB" or "AARRGGBB", with or without "#".<br>"": the grid's accent.<br>Not a colour: rejected with a console error.<br>Left out: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsColour`.*

##### `ce.components.drumpads.roll(target, index [, roll]) -> boolean`

Make one pad roll, by its number: it strikes again and again while it is on.

Example: `ce.components.drumpads.roll("DrumPads", 2, true)` makes pad 2 roll.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `index` (number, required): Pad number, counted from 1.<br>A fraction: rounded.<br>Not one of the pads: rejected with a console error.
- `roll` (true or false, optional): true: it rolls while held, or while toggled on.<br>false: one strike.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Not in "oneShot" mode: the pad stops at its gate.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsRoll`.*

##### `ce.components.drumpads.rollRate(target, rollRate) -> boolean`

Set how fast a rolling pad strikes, as a note value against the Transport.

Example: `ce.components.drumpads.rollRate("DrumPads", "1/32")` rolls in 32nd notes.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `rollRate` (text, required): One of "1/1", "1/2", "1/4", "1/8", "1/16", "1/32", "1/2D", "1/4D", "1/8D", "1/16D", "1/2T", "1/4T", "1/8T" or "1/16T". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- While `rollSync()` is on and the Transport has a tempo; otherwise `rollHz()`.
- Default: "1/16".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsRollRate`.*

##### `ce.components.drumpads.rollSync(target [, rollSync]) -> boolean`

Roll in time with the Transport, or at a fixed speed.

Example: `ce.components.drumpads.rollSync("DrumPads")` switches the roll sync on if it is off, and off if it is on.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `rollSync` (true or false, optional): true: at `rollRate()` against the Transport's tempo.<br>false: at `rollHz()`.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- With no tempo to follow: `rollHz()` either way.
- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsRollSync`.*

##### `ce.components.drumpads.rollHz(target, rollHz) -> boolean`

Set how fast a rolling pad strikes while it is not synced.

Example: `ce.components.drumpads.rollHz("DrumPads", 12)` rolls at 12 strikes a second.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `rollHz` (number, required): Strikes per second.<br>Range: 0.5 ↔ 50.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 8.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsRollHz`.*

##### `ce.components.drumpads.rollDelay(target, rollDelay) -> boolean`

Set how long a pad is held before its roll begins.

Example: `ce.components.drumpads.rollDelay("DrumPads", 250)` starts the roll after a quarter of a second.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `rollDelay` (number, required): Milliseconds.<br>0: it rolls from the first strike.<br>Range: 0 ↔ 4000, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsRollDelay`.*

##### `ce.components.drumpads.rollVelocity(target, rollVelocity) -> boolean`

Set how hard a roll strikes after the first hit.

Example: `ce.components.drumpads.rollVelocity("DrumPads", 0.5)` strikes the repeats at half the first hit's velocity.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `rollVelocity` (number, required): Part of the first hit's velocity.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.75.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsRollVelocity`.*

##### `ce.components.drumpads.zones(target [, zones]) -> boolean`

Let the corners of every pad do their own actions.

Example: `ce.components.drumpads.zones("DrumPads")` switches the zones on if they are off, and off if they are on.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `zones` (true or false, optional): true: a hit in a corner does what its corner command says.<br>false: every hit is a plain hit.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsZones`.*

##### `ce.components.drumpads.cornerSize(target, cornerSize) -> boolean`

Set how much of a pad each corner covers.

Example: `ce.components.drumpads.cornerSize("DrumPads", 0.2)` makes each corner a fifth of the pad each way.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `cornerSize` (number, required): Part of the pad's width and of its height, in from the corner.<br>Range: 0.05 ↔ 0.45: the middle is always a plain hit.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.28.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsCornerSize`.*

##### `ce.components.drumpads.cornerTopLeft(target, cornerTopLeft) -> boolean`

Set what a hit in the top left corner of a pad does.

Example: `ce.components.drumpads.cornerTopLeft("DrumPads", "flam")` plays a flam from the top left corner.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `cornerTopLeft` (text, required): "none": a plain hit.<br>"roll": rolls while held, as `roll()` does.<br>"flam": a grace note `flamMs()` before the hit, at `ghostVelocity()`.<br>"choke": silences the pad's choke group, and plays nothing.<br>"accent": at `velocity()`, wherever the pad is struck.<br>"ghost": at `ghostVelocity()`.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Only while `zones()` is on.
- Default: "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsCornerTopLeft`.*

##### `ce.components.drumpads.cornerTopRight(target, cornerTopRight) -> boolean`

Set what a hit in the top right corner of a pad does.

Example: `ce.components.drumpads.cornerTopRight("DrumPads", "flam")` plays a flam from the top right corner.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `cornerTopRight` (text, required): "none": a plain hit.<br>"roll": rolls while held, as `roll()` does.<br>"flam": a grace note `flamMs()` before the hit, at `ghostVelocity()`.<br>"choke": silences the pad's choke group, and plays nothing.<br>"accent": at `velocity()`, wherever the pad is struck.<br>"ghost": at `ghostVelocity()`.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Only while `zones()` is on.
- Default: "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsCornerTopRight`.*

##### `ce.components.drumpads.cornerBottomLeft(target, cornerBottomLeft) -> boolean`

Set what a hit in the bottom left corner of a pad does.

Example: `ce.components.drumpads.cornerBottomLeft("DrumPads", "flam")` plays a flam from the bottom left corner.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `cornerBottomLeft` (text, required): "none": a plain hit.<br>"roll": rolls while held, as `roll()` does.<br>"flam": a grace note `flamMs()` before the hit, at `ghostVelocity()`.<br>"choke": silences the pad's choke group, and plays nothing.<br>"accent": at `velocity()`, wherever the pad is struck.<br>"ghost": at `ghostVelocity()`.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Only while `zones()` is on.
- Default: "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsCornerBottomLeft`.*

##### `ce.components.drumpads.cornerBottomRight(target, cornerBottomRight) -> boolean`

Set what a hit in the bottom right corner of a pad does.

Example: `ce.components.drumpads.cornerBottomRight("DrumPads", "flam")` plays a flam from the bottom right corner.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `cornerBottomRight` (text, required): "none": a plain hit.<br>"roll": rolls while held, as `roll()` does.<br>"flam": a grace note `flamMs()` before the hit, at `ghostVelocity()`.<br>"choke": silences the pad's choke group, and plays nothing.<br>"accent": at `velocity()`, wherever the pad is struck.<br>"ghost": at `ghostVelocity()`.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Only while `zones()` is on.
- Default: "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsCornerBottomRight`.*

##### `ce.components.drumpads.flamMs(target, flamMs) -> boolean`

Set how long before the main hit a flam's grace note lands.

Example: `ce.components.drumpads.flamMs("DrumPads", 30)` lands the grace note 30 ms early.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `flamMs` (number, required): Milliseconds.<br>Range: 1 ↔ 500, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 22.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsFlamMs`.*

##### `ce.components.drumpads.ghostVelocity(target, ghostVelocity) -> boolean`

Set how hard a ghost hit, and a flam's grace note, is struck.

Example: `ce.components.drumpads.ghostVelocity("DrumPads", 0.2)` strikes ghost notes at a fifth of the velocity.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `ghostVelocity` (number, required): Part of the velocity the hit would have had.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.35.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsGhostVelocity`.*

##### `ce.components.drumpads.editable(target [, editable]) -> boolean`

Let the pads be struck by touch, or not.

Example: `ce.components.drumpads.editable("DrumPads")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `editable` (true or false, optional): true: a hit plays a pad; a drag across the grid rolls through them.<br>false: hits do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsEditable`.*

##### `ce.components.drumpads.showNotes(target [, showNotes]) -> boolean`

Show or hide the MIDI note number on each pad.

Example: `ce.components.drumpads.showNotes("DrumPads")` shows the notes if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `showNotes` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsShowNotes`.*

##### `ce.components.drumpads.showLabels(target [, showLabels]) -> boolean`

Show or hide the name on each pad.

Example: `ce.components.drumpads.showLabels("DrumPads")` shows the labels if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `showLabels` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- A pad too small for its name shows none either way.
- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsShowLabels`.*

##### `ce.components.drumpads.showHeader(target [, showHeader]) -> boolean`

Show or hide the strip above the pads: the map, the grid and the last hit.

Example: `ce.components.drumpads.showHeader("DrumPads")` shows the header if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `showHeader` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsShowHeader`.*

##### `ce.components.drumpads.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.drumpads.read("DrumPads")` gives every setting as a table.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name. `read(target, "choke")`: the whole list; `read(target, "choke", 3)`: one pad, counted from 1.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `drumPadsRead`.*

##### `ce.components.drumpads.size(target [, name]) -> number|table`

Read how many elements a list has.

Example: `ce.components.drumpads.size("DrumPads")` gives the length of every list as a table.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `name` (text, optional): A list verb of this component, by name.<br>Left out: every list, as a table.<br>Not a list verb: rejected with a console error.

Good to know:

- `size(target)`: every list as a table, by verb name; `size(target, "choke")`: one number.
- Returns the number.
- Rejected: no result, with a console error.

*Short name: `drumPadsSize`.*

##### `ce.components.drumpads.fill(target, name, values) -> boolean`

Write a whole list in one call.

Example: `ce.components.drumpads.fill("DrumPads", "note", {32, 64, 95})` writes pads 1 to 3.

- `target` (control name, required): The Drum Pads's control, by name.<br>Not a Drum Pads: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb: rejected with a console error.
- `values` (list, required): A list, one value per element from the first.<br>Longer than the list: rejected with a console error.<br>Not a list: rejected with a console error.

Good to know:

- One undo step for the whole list, instead of one per element.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `drumPadsFill`.*

#### ce.components.phrase: Phrase Sequencer

A step grid whose rows are the notes of a scale.

##### `ce.components.phrase.seed(target, seed)`

Fill the grid with a pattern: "clear", "octaves", "arpUp", "riff", "random".

Example: `ce.components.phrase.seed("Phrase", "riff")` fills the grid with a riff.

- `seed` (text, required): "clear": empty.<br>"octaves": the root and the octave above, by turns.<br>"arpUp": the chord walked upward across the bar.<br>"riff": a one-bar line, off the beat, with ties.<br>"random": a note of the scale on each step.<br>Case-insensitive.<br>Any other: rejected with a console error.

Good to know:

- What the grid held is replaced.
- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `phraseSeed`.*

##### `ce.components.phrase.clear(target)`

Empty the grid.

Example: `ce.components.phrase.clear("Phrase")` switches every cell off.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `phraseClear`.*

##### `ce.components.phrase.key(target, key)`

Set the key its rows play in.

Example: `ce.components.phrase.key("Phrase", "D")` plays the pattern in D.

- `key` (number, required): The key's note: a name, such as "F#", in any case, or a number round the octave, 0 being C: 14 is 2, D.<br>Any other: rejected with a console error.

Good to know:

- Row 1 is the key's note; each row up is the next step of the scale.
- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `phraseKey`.*

##### `ce.components.phrase.scale(target, scale)`

Set the scale its rows play.

Example: `ce.components.phrase.scale("Phrase", "dorian")` plays the pattern in the dorian mode.

- `scale` (text, required): One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.<br>Any other: rejected with a console error.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `phraseScale`.*

##### `ce.components.phrase.transpose(target, semitones)`

Transpose what the pattern plays, leaving the grid as it is.

Example: `ce.components.phrase.transpose("Phrase", 12)` plays the pattern an octave up.

- `semitones` (number, required): Semitones: 12 an octave up.<br>Range: -48 ↔ 48, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Not a number: rejected with a console error.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `phraseTranspose`.*

##### `ce.components.phrase.direction(target, direction)`

Set the order it plays the steps in: "forward", "reverse", "pingpong", "random".

Example: `ce.components.phrase.direction("Phrase", "pingpong")` plays forward and back.

- `direction` (text, required): "forward": first to last.<br>"reverse": last to first.<br>"pingpong": forward, then back.<br>"random": a step at random each time.<br>Case-insensitive.<br>Any other: rejected with a console error.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `phraseDirection`.*

##### `ce.components.phrase.run(target, running)`

Start or stop the sequencer.

Example: `ce.components.phrase.run("Phrase", false)` stops the sequencer.

- `running` (true or false, required): true: it plays.<br>false: it stops.<br>Left out: it plays.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `phraseRun`.*

##### `ce.components.phrase.cell(target, step, row, on)`

Switch one cell of the grid on or off.

Example: `ce.components.phrase.cell("Phrase", 1, 3, true)` plays row 3 on the first step.

- `step` (number, required): Step, counted from 1, left to right.<br>A fraction: rounded.<br>Not a step of the grid: rejected with a console error.
- `row` (number, required): Row, counted from 1, from the bottom: a step of the scale; a semitone in chromatic mode, set in the inspector.<br>A fraction: rounded.<br>Not a row of the grid: rejected with a console error.
- `on` (true or false, required): true: on.<br>false: off.<br>Left out: toggles.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `phraseCell`.*

##### `ce.components.phrase.read(target [, field])`

Read the Phrase Sequencer's settings.

Example: `ce.components.phrase.read("Phrase", "key")` gives the key, 0 being C.

- `field` (text, optional): A setting's name, in any case, such as "key" or "pattern".<br>Left out: every setting, as a table.<br>Not one of its settings: no result, with a console error naming them.

Good to know:

- Returns the value.

*Short name: `phraseRead`.*

#### ce.components.recorder: Phrase Recorder

Records what you play and loops it back.

##### `ce.components.recorder.record(target [, on])`

Arm the recorder, or stop it.

Example: `ce.components.recorder.record("Recorder")` arms it, or stops it if it is armed or recording.

- `on` (true or false, optional): true: armed; it records from the top of the next loop, after `countIn()`.<br>false: stopped.<br>Left out: armed if stopped, stopped if armed or recording.

Good to know:

- A take that has notes is recorded over: layered on, until it is stopped.
- Returns true. Already that way: true, with a console line.

*Short name: `recorderRecord`.*

##### `ce.components.recorder.stop(target)`

Stop recording, or arming.

Example: `ce.components.recorder.stop("Recorder")` stops recording; the loop goes on playing.

Good to know:

- The take plays on: `play(target, false)` stops it.
- Returns true. Already stopped: true, with a console line.

*Short name: `recorderStop`.*

##### `ce.components.recorder.play(target [, playing])`

Start or stop playing the take.

Example: `ce.components.recorder.play("Recorder", false)` silences the take.

- `playing` (true or false, optional): true: it plays.<br>false: it is silent.<br>Left out: toggles.

Good to know:

- Returns true. Already that way: true, with a console line.

*Short name: `recorderPlay`.*

##### `ce.components.recorder.clear(target)`

Delete the take.

Example: `ce.components.recorder.clear("Recorder")` empties the take.

Good to know:

- The stored slots are kept.
- Returns true. Recording, or no take: false, with a console error.

*Short name: `recorderClear`.*

##### `ce.components.recorder.undo(target)`

Delete the last pass recorded over the take.

Example: `ce.components.recorder.undo("Recorder")` takes away what the last pass added.

Good to know:

- Returns true. Recording, or no take: false, with a console error.

*Short name: `recorderUndo`.*

##### `ce.components.recorder.quantize(target, grid [, strength, scale, key])`

Move the take's notes toward a grid, and into a key.

Example: `ce.components.recorder.quantize("Recorder", 16, 1)` puts every note on a sixteenth of the loop.

- `grid` (number, required): Divisions of the loop: 16 over one bar is sixteenth notes.<br>Range: 1 ↔ 64, whole.<br>Outside the range: the nearest end.<br>Text, such as "1/16": rejected with a console error.
- `strength` (number, optional): How far each note moves: 1 onto the grid, 0.5 halfway, 0 not at all.<br>Range: 0 ↔ 1.<br>Left out: the inspector's Strength, 0 unless it is set, which moves nothing.
- `scale` (text, optional): With `key`, notes outside the key are moved to the nearest in it, ties down.<br>One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.<br>Left out, with `key` given: the inspector's scale.<br>Any other: rejected with a console error.
- `key` (text, optional): The key's note: a name, such as "F#", in any case, or a number round the octave, 0 being C.<br>Left out, with `scale` given: the inspector's key.<br>Both left out: the pitches are kept.<br>Any other: rejected with a console error.

Good to know:

- The lengths are kept.
- Returns true. Recording, or no take: false, with a console error.

*Short name: `recorderQuantize`.*

##### `ce.components.recorder.transpose(target, semitones)`

Transpose what the take plays, leaving the take as recorded.

Example: `ce.components.recorder.transpose("Recorder", -12)` plays the take an octave down.

- `semitones` (number, required): Semitones: 12 an octave up.<br>Range: -48 ↔ 48, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Not a number: rejected with a console error.

Good to know:

- `shift()` changes the notes of the take itself.
- Returns true. Already that way: true, with a console line.

*Short name: `recorderTranspose`.*

##### `ce.components.recorder.bars(target, bars)`

Set how many bars the loop is, while it follows the Transport.

Example: `ce.components.recorder.bars("Recorder", 4)` makes the loop four bars long.

- `bars` (number, required): Bars.<br>Range: 1 ↔ 16, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Not a number: rejected with a console error.

Good to know:

- Following the Transport is set in the inspector; otherwise the loop is a length in seconds.
- Returns true. Already that way: true, with a console line.

*Short name: `recorderBars`.*

##### `ce.components.recorder.source(target, source)`

Set where the notes it records come from: "input", "panel", "both".

Example: `ce.components.recorder.source("Recorder", "input")` records only the keyboard played into it.

- `source` (text, required): "input": the MIDI input.<br>"panel": the panel's own note controls, such as a Chord Pad.<br>"both": either.<br>Case-insensitive.<br>Any other: rejected with a console error.

Good to know:

- Returns true. Already that way: true, with a console line.

*Short name: `recorderSource`.*

##### `ce.components.recorder.nudge(target, by)`

Move every note of the take earlier or later.

Example: `ce.components.recorder.nudge("Recorder", -0.005)` moves a late take a little earlier.

- `by` (number, required): Part of the loop: 0.01 is a hundredth later; below 0, earlier.<br>Past the end of the loop: round to its start.<br>0, or not a number: rejected with a console error.

Good to know:

- Returns true. Recording, or no take: false, with a console error.

*Short name: `recorderNudge`.*

##### `ce.components.recorder.shift(target, semitones)`

Transpose the notes of the take itself.

Example: `ce.components.recorder.shift("Recorder", 7)` moves the take up a fifth.

- `semitones` (number, required): Semitones: 12 an octave up.<br>A fraction: rounded.<br>A note that would pass 0 or 127: deleted.<br>0, or not a number: rejected with a console error.

Good to know:

- Its timing is kept: nothing is quantized.
- `transpose()` changes only what it plays.
- Returns true. Recording, or no take: false, with a console error.

*Short name: `recorderShift`.*

##### `ce.components.recorder.store(target, slot [, name])`

Keep a copy of the take in a slot.

Example: `ce.components.recorder.store("Recorder", 2, "Verse")` keeps the take in slot 2, called Verse.

- `slot` (number, required): Slot, counted from 1.<br>Range: 1 ↔ 8.<br>A fraction: rounded.<br>Any other: rejected with a console error.
- `name` (text, optional): The slot's name.<br>Left out: its name as it was; a new slot is "Take" and its number.

Good to know:

- A slot that holds a take: replaced.
- Returns true. Recording: false, with a console error.

*Short name: `recorderStore`.*

##### `ce.components.recorder.load(target, slot)`

Make a stored take the take.

Example: `ce.components.recorder.load("Recorder", 2)` plays the take stored in slot 2.

- `slot` (number, required): Slot, counted from 1.<br>A fraction: rounded.<br>A slot that holds no take: rejected with a console error.

Good to know:

- A copy: the slot is kept as it was.
- Returns true. Recording: false, with a console error.

*Short name: `recorderLoad`.*

##### `ce.components.recorder.countIn(target, bars)`

Set how many bars it waits, once armed, before it records.

Example: `ce.components.recorder.countIn("Recorder", 1)` waits a bar before recording.

- `bars` (number, required): Bars.<br>0: none; it records from the top of the next loop.<br>Range: 0 ↔ 4, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Not a number: rejected with a console error.

Good to know:

- Counted in whole loops: a loop longer than the count-in waits one loop.
- Returns true. Already that way: true, with a console line.

*Short name: `recorderCountIn`.*

##### `ce.components.recorder.read(target [, field])`

Read the Phrase Recorder's settings and take.

Example: `ce.components.recorder.read("Recorder", "state")` gives "idle", "armed", "recording" or "overdub".

- `field` (text, optional): A setting's name, in any case, such as "state" or "take".<br>Left out: every setting, as a table.<br>Not one of its settings: no result, with a console error naming them.

Good to know:

- "take": { events }, each note { t, note, velocity, dur, pass }, `t` and `dur` as parts of the loop.
- Returns the value.

*Short name: `recorderRead`.*

#### ce.components.harmony: Harmoniser

Turns one played note into a whole chord.

##### `ce.components.harmony.mode(target, mode)`

Set how it builds the harmony: "diatonic", "memory".

Example: `ce.components.harmony.mode("Harmoniser", "memory")` plays one chord shape on every note.

- `mode` (text, required): "diatonic": the chord the played note's step of the key has; always in the key.<br>"memory": a fixed shape, `shape()`, on whatever note is played, in the key or not.<br>Case-insensitive.<br>Any other: rejected with a console error.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `harmonyMode`.*

##### `ce.components.harmony.key(target, key)`

Set the key it harmonises in.

Example: `ce.components.harmony.key("Harmoniser", "Bb")` harmonises in B♭.

- `key` (number, required): The key's note: a name, such as "F#", in any case, or a number round the octave, 0 being C: 14 is 2, D.<br>Any other: rejected with a console error.

Good to know:

- While `mode()` is "diatonic".
- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `harmonyKey`.*

##### `ce.components.harmony.scale(target, scale)`

Set the scale it harmonises in.

Example: `ce.components.harmony.scale("Harmoniser", "minor")` harmonises in the minor key.

- `scale` (text, required): One of "major", "minor", "harmonicMinor", "melodicMinor", "dorian", "phrygian", "lydian", "mixolydian", "locrian", "pentatonicMaj", "pentatonicMin" and "blues". Case-insensitive.<br>Any other: rejected with a console error.

Good to know:

- While `mode()` is "diatonic".
- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `harmonyScale`.*

##### `ce.components.harmony.size(target, size)`

Set how many notes each chord has.

Example: `ce.components.harmony.size("Harmoniser", 4)` plays seventh chords.

- `size` (number, required): Notes: 3 a triad, 4 a seventh chord.<br>Range: 2 ↔ 6, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Not a number: rejected with a console error.

Good to know:

- While `mode()` is "diatonic".
- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `harmonySize`.*

##### `ce.components.harmony.shape(target, shape)`

Set the chord shape it plays: "major", "minor", "sus4", "maj7", "min7", "fifths", "octaves", or a list of intervals.

Example: `ce.components.harmony.shape("Harmoniser", "min7")` plays a minor seventh on every note.

- `shape` (text, required): A shape by name, case-insensitive; or a list of semitones above the played note, such as {0, 4, 7}, -36 to 36 each, 6 at most.<br>Any other: rejected with a console error.

Good to know:

- While `mode()` is "memory".
- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `harmonyShape`.*

##### `ce.components.harmony.voicing(target, voicing)`

Set how the notes of each chord are spread: "close", "open", "drop2".

Example: `ce.components.harmony.voicing("Harmoniser", "open")` spreads each chord wider.

- `voicing` (text, required): "close": as close together as they go.<br>"open": the middle note an octave up.<br>"drop2": the second note from the top an octave down.<br>Case-insensitive.<br>Any other: rejected with a console error.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `harmonyVoicing`.*

##### `ce.components.harmony.inversion(target, inversion)`

Set which note of each chord is lowest.

Example: `ce.components.harmony.inversion("Harmoniser", 1)` puts the third lowest.

- `inversion` (number, required): 0: the root lowest. 1: the third. 2: the fifth. 3: the seventh.<br>Past the chord's notes: the highest inversion it has, 2 for a triad.<br>Range: 0 ↔ 3, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Not a number: rejected with a console error.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `harmonyInversion`.*

##### `ce.components.harmony.octave(target, octave)`

Move the added notes by whole octaves.

Example: `ce.components.harmony.octave("Harmoniser", -1)` puts the harmony an octave below.

- `octave` (number, required): Octaves: 1 up, -1 down.<br>Range: -3 ↔ 3, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Not a number: rejected with a console error.

Good to know:

- The played note stays where it is.
- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `harmonyOctave`.*

##### `ce.components.harmony.outOfKey(target, mode)`

Set what a played note outside the key does: "pass", "nearest", "mute".

Example: `ce.components.harmony.outOfKey("Harmoniser", "nearest")` harmonises a wrong note as the nearest right one.

- `mode` (text, required): "pass": the note sounds alone, without harmony.<br>"nearest": harmonised as the nearest note of the key.<br>"mute": nothing sounds.<br>Case-insensitive.<br>Any other: rejected with a console error.

Good to know:

- While `mode()` is "diatonic".
- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `harmonyOutOfKey`.*

##### `ce.components.harmony.keepPlayed(target [, keep])`

Sound the played note with its harmony, or only the harmony.

Example: `ce.components.harmony.keepPlayed("Harmoniser", false)` plays the harmony without the note played.

- `keep` (true or false, optional): true: the played note sounds too.<br>false: only the added notes.<br>Left out: toggles.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `harmonyKeepPlayed`.*

##### `ce.components.harmony.channel(target, channel)`

Set the MIDI channel the chords play on.

Example: `ce.components.harmony.channel("Harmoniser", 2)` plays the chords on channel 2.

- `channel` (number, required): MIDI channel.<br>Range: 1 ↔ 16, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Not a number: rejected with a console error.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `harmonyChannel`.*

##### `ce.components.harmony.voiceLeading(target, mode)`

Set how each chord moves from the one before: "off", "closest", "smooth".

Example: `ce.components.harmony.voiceLeading("Harmoniser", "closest")` keeps the chords close together.

- `mode` (text, required): "off": each chord as `inversion()` sets it.<br>"closest": the notes move as little as they can, all together.<br>"smooth": the top note moves as little as it can.<br>Case-insensitive.<br>Any other: rejected with a console error.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `harmonyVoiceLeading`.*

##### `ce.components.harmony.strum(target, ms)`

Spread the notes of each chord out in time, as a strum.

Example: `ce.components.harmony.strum("Harmoniser", 60)` strums each chord over 60 ms.

- `ms` (number, required): Milliseconds from the first note to the last.<br>0: all together.<br>Range: 0 ↔ 400.<br>Outside the range: the nearest end.<br>Not a number: rejected with a console error.

Good to know:

- Up or down: set in the inspector.
- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `harmonyStrum`.*

##### `ce.components.harmony.degree(target, degree, chord)`

Play a chord of your own on one step of the key.

Example: `ce.components.harmony.degree("Harmoniser", 6, {0, 5, 7})` plays a sus4 on the sixth step.

- `degree` (number, required): Step of the scale, counted from 1.<br>A fraction: rounded.<br>Not a step of the scale: rejected with a console error.
- `chord` (text, required): Semitones above the step's note, such as {0, 5, 7}, -36 to 36 each, 6 at most.<br>"clear": the key's own chord again.<br>Any other: rejected with a console error.

Good to know:

- While `mode()` is "diatonic".
- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `harmonyDegree`.*

##### `ce.components.harmony.read(target [, field])`

Read the Harmoniser's settings.

Example: `ce.components.harmony.read("Harmoniser", "mode")` gives "diatonic" or "memory".

- `field` (text, optional): A setting's name, in any case, such as "mode" or "degreeChords".<br>Left out: every setting, as a table.<br>Not one of its settings: no result, with a console error naming them.

Good to know:

- Returns the value.

*Short name: `harmonyRead`.*


### Movement and randomness

Components that keep changing on their own.

#### ce.components.turing: Turing Machine

Run a loop of stepped values that can change as it comes round: its speed, length, randomness, output levels and gate, and each step.

##### `ce.components.turing.run(target [, run]) -> boolean`

Start or stop the sequence.

Example: `ce.components.turing.run("Turing", false)` stops it on the step it is at.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `run` (true or false, optional): true: it advances.<br>false: it holds its step.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Synced: it advances only while the Transport runs.
- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `turingRun`.*

##### `ce.components.turing.rate(target, rate) -> boolean`

Set how many steps a second it advances, while not synced.

Example: `ce.components.turing.rate("Turing", 4)` advances four steps a second.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `rate` (number, required): Steps per second.<br>Range: 0.1 ↔ 40.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- While synced to the Transport: no effect; `division()` sets the step.
- The inspector stops at 30.
- Default: 2.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `turingRate`.*

##### `ce.components.turing.division(target, division) -> boolean`

Set how long a step is while synced to the Transport.

Example: `ce.components.turing.division("Turing", "1/16")` advances a step every sixteenth note.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `division` (text, required): One of "1/1", "1/2", "1/4", "1/8", "1/16", "1/32", "1/2D", "1/4D", "1/8D", "1/16D", "1/2T", "1/4T", "1/8T" or "1/16T". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Only while `sync()` is on.
- Default: "1/8".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `turingDivision`.*

##### `ce.components.turing.sync(target [, sync]) -> boolean`

Follow the Transport, or run at its own rate.

Example: `ce.components.turing.sync("Turing")` switches the sync to transport on if it is off, and off if it is on.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `sync` (true or false, optional): true: a step every `division()`, where the Transport's position puts it.<br>false: at `rate()`.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `turingSync`.*

##### `ce.components.turing.length(target, length) -> boolean`

Set how many steps the loop has.

Example: `ce.components.turing.length("Turing", 16)` makes the loop sixteen steps long.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `length` (number, required): Steps.<br>Range: 2 ↔ 64, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- A step added by a longer loop starts at 0.
- Default: 8.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `turingLength`.*

##### `ce.components.turing.randomness(target, randomness) -> boolean`

Set how likely a step is to change as the loop comes round to it.

Example: `ce.components.turing.randomness("Turing", 0.1)` lets the loop change slowly.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `randomness` (number, required): Chance a step is given a new value, each time it is reached.<br>0: a locked loop.<br>1: a new value every step.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.25.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `turingRandomness`.*

##### `ce.components.turing.quantize(target, quantize) -> boolean`

Set how many levels each step's output is snapped to.

Example: `ce.components.turing.quantize("Turing", 2)` makes every step's output on or off.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `quantize` (number, required): Levels, spread evenly from 0 to 1.<br>0 or 1: not snapped.<br>2: 0 or 1.<br>Range: 0 ↔ 32, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The output only: the steps keep their own values.
- The inspector stops at 24.
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `turingQuantize`.*

##### `ce.components.turing.gate(target, gate) -> boolean`

Set the level at which a step opens the gate.

Example: `ce.components.turing.gate("Turing", 0.7)` opens the gate only at the higher steps.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `gate` (number, required): Level: the gate output is 1 at a step at or above it, 0 below.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.5.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `turingGate`.*

##### `ce.components.turing.step(target, index, value) -> boolean`

Set the value of one step, by its number.

Example: `ce.components.turing.step("Turing", 3, 0.75)` sets step 3 to 0.75.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `index` (number, required): Step number, counted from 1.<br>A fraction: rounded.<br>Not one of the steps: rejected with a console error.
- `value` (number, required): Value.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- A running loop goes on from the steps as they now are; `randomness()` can change them as it comes round.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `turingStep`.*

##### `ce.components.turing.phase(target, phase) -> boolean`

Move the loop to a point in its sequence.

Example: `ce.components.turing.phase("Turing", 0.5)` moves it halfway through its loop.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `phase` (number, required): Where in the loop: 0 the start, 0.5 halfway.<br>1: the start again.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Running: it advances from there. Stopped: it starts from there.
- While synced: no effect; the Transport's position decides.
- `read(target, "phase")` gives where it is now.
- Nothing is written to the panel.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `turingPhase`.*

##### `ce.components.turing.editable(target [, editable]) -> boolean`

Let the steps be drawn by dragging, or not.

Example: `ce.components.turing.editable("Turing")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `editable` (true or false, optional): true: a drag across the bars sets the steps.<br>false: drags do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `turingEditable`.*

##### `ce.components.turing.showGate(target [, showGate]) -> boolean`

Show or hide the row of gate dots under the steps.

Example: `ce.components.turing.showGate("Turing")` shows the gate if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `showGate` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `turingShowGate`.*

##### `ce.components.turing.showDivisions(target [, showDivisions]) -> boolean`

Show or hide the level lines across the steps.

Example: `ce.components.turing.showDivisions("Turing")` shows the divisions if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `showDivisions` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- How many: set in the inspector, under Divisions.
- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `turingShowDivisions`.*

##### `ce.components.turing.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.turing.read("Turing")` gives every setting as a table.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name.
- `read(target, "phase")`: where it is now.
- `read(target, "step")`: every step; `read(target, "step", 3)`: one.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `turingRead`.*

##### `ce.components.turing.size(target [, name]) -> number|table`

Read how many elements a list has.

Example: `ce.components.turing.size("Turing")` gives the length of every list as a table.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `name` (text, optional): A list verb of this component, by name.<br>Left out: every list, as a table.<br>Not a list verb: rejected with a console error.

Good to know:

- `size(target)`: every list as a table, by verb name; `size(target, "step")`: one number.
- Returns the number.
- Rejected: no result, with a console error.

*Short name: `turingSize`.*

##### `ce.components.turing.fill(target, name, values) -> boolean`

Write a whole list in one call.

Example: `ce.components.turing.fill("Turing", "step", {0.25, 0.5, 0.75})` writes steps 1 to 3.

- `target` (control name, required): The Turing Machine's control, by name.<br>Not a Turing Machine: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb: rejected with a console error.
- `values` (list, required): A list, one value per element from the first.<br>Longer than the list: rejected with a console error.<br>Not a list: rejected with a console error.

Good to know:

- One undo step for the whole list, instead of one per element.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `turingFill`.*

#### ce.components.looper: Looper

Loop movements recorded by hand, each lane sending its value round the loop: the loop's length and sync, and each lane.

##### `ce.components.looper.run(target [, run]) -> boolean`

Start or stop the loop.

Example: `ce.components.looper.run("Looper", false)` stops the loop where it is.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `run` (true or false, optional): true: it plays.<br>false: it stops where it is.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Synced: it plays only while the Transport runs.
- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperRun`.*

##### `ce.components.looper.seconds(target, seconds) -> boolean`

Set how long the loop is while not synced.

Example: `ce.components.looper.seconds("Looper", 8)` makes the loop eight seconds long.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `seconds` (number, required): Seconds.<br>Range: 0.05 ↔ 600.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- While synced to the Transport: no effect; `bars()` sets the loop.
- The inspector takes 0.1 to 60.
- Default: 4.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperSeconds`.*

##### `ce.components.looper.bars(target, bars) -> boolean`

Set how many bars the loop is while synced to the Transport.

Example: `ce.components.looper.bars("Looper", 4)` makes the loop four bars long.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `bars` (number, required): Bars: 0.25 is one beat in 4/4.<br>Range: 0.25 ↔ 64.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `sync()` is on.
- Default: 2.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperBars`.*

##### `ce.components.looper.sync(target [, sync]) -> boolean`

Follow the Transport, or loop in its own time.

Example: `ce.components.looper.sync("Looper")` switches the sync to transport on if it is off, and off if it is on.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `sync` (true or false, optional): true: the loop is `bars()` long, and starts on the bar line.<br>false: `seconds()` long.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Synced: the grid in each lane marks the bars and beats.
- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperSync`.*

##### `ce.components.looper.quantize(target [, quantize]) -> boolean`

Round the loop's length to whole beats at the panel's tempo, or not.

Example: `ce.components.looper.quantize("Looper")` switches the quantize loop on if it is off, and off if it is on.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `quantize` (true or false, optional): true: `seconds()` is played to the nearest whole beat, one beat at least.<br>false: as set.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- While not synced; `seconds()` keeps the number set.
- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperQuantize`.*

##### `ce.components.looper.lane(target, index [, enabled]) -> boolean`

Switch one lane on or off, by its number.

Example: `ce.components.looper.lane("Looper", 2, false)` holds lane 2 at its rest value.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `index` (number, required): Lane number, counted from 1.<br>A fraction: rounded.<br>Not one of the lanes: rejected with a console error.
- `enabled` (true or false, optional): true: it plays its recording.<br>false: it sends its rest value, and is drawn faded.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperLane`.*

##### `ce.components.looper.laneRest(target, index, rest) -> boolean`

Set the value one lane sends while it has no recording or is off, by its number.

Example: `ce.components.looper.laneRest("Looper", 1, 0.5)` makes lane 1 send 0.5 until something is recorded.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `index` (number, required): Lane number, counted from 1.<br>A fraction: rounded.<br>Not one of the lanes: rejected with a console error.
- `rest` (number, required): Value.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- A recording is made by dragging across the lane: left to right is the loop, the height the value.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperLaneRest`.*

##### `ce.components.looper.phase(target, phase) -> boolean`

Move the loop to a point in its length.

Example: `ce.components.looper.phase("Looper", 0)` moves the loop back to its start.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `phase` (number, required): Where in the loop: 0 the start, 0.5 halfway.<br>1: the start again.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Running: it plays on from there. Stopped: it starts from there, and its lanes send their values there.
- While synced: no effect; the Transport's position decides.
- `read(target, "phase")` gives where it is now.
- Nothing is written to the panel.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperPhase`.*

##### `ce.components.looper.editable(target [, editable]) -> boolean`

Let a lane be recorded by dragging, or not.

Example: `ce.components.looper.editable("Looper")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `editable` (true or false, optional): true: a drag across a lane records it, replacing what it had.<br>false: drags do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperEditable`.*

##### `ce.components.looper.showPlayhead(target [, showPlayhead]) -> boolean`

Show or hide the line that moves across the lanes as the loop plays.

Example: `ce.components.looper.showPlayhead("Looper")` shows the playhead if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `showPlayhead` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperShowPlayhead`.*

##### `ce.components.looper.showGrid(target [, showGrid]) -> boolean`

Show or hide the time lines across the lanes.

Example: `ce.components.looper.showGrid("Looper")` shows the grid if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `showGrid` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Quarters of the loop; while synced, its bars and beats.
- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperShowGrid`.*

##### `ce.components.looper.showDivisions(target [, showDivisions]) -> boolean`

Show or hide the level lines across each lane.

Example: `ce.components.looper.showDivisions("Looper")` shows the divisions if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `showDivisions` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- How many: set in the inspector, under Major and Minor.
- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperShowDivisions`.*

##### `ce.components.looper.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.looper.read("Looper")` gives every setting as a table.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name.
- `read(target, "phase")`: where it is now.
- `read(target, "laneRest")`: every lane's; `read(target, "laneRest", 2)`: one.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `looperRead`.*

##### `ce.components.looper.size(target [, name]) -> number|table`

Read how many elements a list has.

Example: `ce.components.looper.size("Looper")` gives the length of every list as a table.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `name` (text, optional): A list verb of this component, by name.<br>Left out: every list, as a table.<br>Not a list verb: rejected with a console error.

Good to know:

- `size(target)`: every list as a table, by verb name; `size(target, "lane")`: one number.
- Returns the number.
- Rejected: no result, with a console error.

*Short name: `looperSize`.*

##### `ce.components.looper.fill(target, name, values) -> boolean`

Write a whole list in one call.

Example: `ce.components.looper.fill("Looper", "lane", {true, false, true})` writes lanes 1 to 3.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb: rejected with a console error.
- `values` (list, required): A list, one value per element from the first.<br>Longer than the list: rejected with a console error.<br>Not a list: rejected with a console error.

Good to know:

- One undo step for the whole list, instead of one per element.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperFill`.*

##### `ce.components.looper.insert(target, name [, index]) -> boolean`

Add one element to a list.

Example: `ce.components.looper.insert("Looper", "lane")` adds a lane at the end.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot grow: rejected with a console error.
- `index` (number, optional): Position of the new element, counted from 1.<br>A fraction: rounded.<br>Left out: after the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The new element is the canvas's own template. Appended; with an index, inserted before that position, counted from 1.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperInsert`.*

##### `ce.components.looper.remove(target, name [, index]) -> boolean`

Remove one element from a list.

Example: `ce.components.looper.remove("Looper", "lane")` removes the last lane.

- `target` (control name, required): The Looper's control, by name.<br>Not a Looper: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot shrink: rejected with a console error.
- `index` (number, optional): Element number, counted from 1.<br>A fraction: rounded.<br>Left out: the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The last; with an index, that one, counted from 1. An element the component needs stays: an envelope keeps its endpoints.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `looperRemove`.*

#### ce.components.orbit: Orbit

Turn satellites round a centre as modulation sources, each sending a value from where it is: their speed, and each one's orbit and depth.

##### `ce.components.orbit.run(target [, run]) -> boolean`

Start or stop the satellites.

Example: `ce.components.orbit.run("Orbit", false)` stops the satellites where they are.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `run` (true or false, optional): true: they turn.<br>false: they stop where they are.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Synced: they turn only while the Transport runs.
- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitRun`.*

##### `ce.components.orbit.rate(target, rate) -> boolean`

Set how many cycles a second it turns, while not synced.

Example: `ce.components.orbit.rate("Orbit", 0.5)` turns once every two seconds.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `rate` (number, required): Cycles per second. In one cycle a node turns as many times as `nodeRatio()` says.<br>Range: 0.1 ↔ 40.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- While synced to the Transport: no effect; `bars()` sets the cycle.
- The inspector stops at 10.
- Default: 0.25.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitRate`.*

##### `ce.components.orbit.bars(target, bars) -> boolean`

Set how many bars one cycle takes while synced to the Transport.

Example: `ce.components.orbit.bars("Orbit", 2)` turns once every two bars.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `bars` (number, required): Bars: 0.25 is one beat in 4/4.<br>Range: 0.25 ↔ 64.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `sync()` is on.
- Default: 4.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitBars`.*

##### `ce.components.orbit.sync(target [, sync]) -> boolean`

Follow the Transport, or turn at its own rate.

Example: `ce.components.orbit.sync("Orbit")` switches the sync to transport on if it is off, and off if it is on.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `sync` (true or false, optional): true: a cycle every `bars()`, where the Transport's position puts it.<br>false: at `rate()`.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitSync`.*

##### `ce.components.orbit.phase(target, phase) -> boolean`

Move the satellites to a point in their cycle.

Example: `ce.components.orbit.phase("Orbit", 0)` puts every satellite back where its angle starts it.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `phase` (number, required): Where in the cycle: 0 the start, 0.5 halfway.<br>1: the start again.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Running: they turn on from there. Stopped: they start from there.
- While synced: no effect; the Transport's position decides.
- `read(target, "phase")` gives where it is now.
- Nothing is written to the panel.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitPhase`.*

##### `ce.components.orbit.node(target, index [, enabled]) -> boolean`

Switch one node on or off, by its number.

Example: `ce.components.orbit.node("Orbit", 2, false)` silences node 2.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `index` (number, required): Node number, counted from 1.<br>A fraction: rounded.<br>Not one of the nodes: rejected with a console error.
- `enabled` (true or false, optional): true: it turns and sends.<br>false: it sends 0 and is drawn as an outline.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitNode`.*

##### `ce.components.orbit.nodeRadius(target, index, radius) -> boolean`

Set how far from the centre one node turns, by its number.

Example: `ce.components.orbit.nodeRadius("Orbit", 1, 0.5)` puts node 1 halfway out.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `index` (number, required): Node number, counted from 1.<br>A fraction: rounded.<br>Not one of the nodes: rejected with a console error.
- `radius` (number, required): Distance: 0 the centre, 1 the edge.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- A node that sends its radius sends this; one that sends its place across or its height swings wider at a larger radius.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitNodeRadius`.*

##### `ce.components.orbit.nodeAngle(target, index, angle) -> boolean`

Set where one node starts its orbit, by its number.

Example: `ce.components.orbit.nodeAngle("Orbit", 1, 90)` starts node 1 at the top.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `index` (number, required): Node number, counted from 1.<br>A fraction: rounded.<br>Not one of the nodes: rejected with a console error.
- `angle` (number, required): Degrees, counter-clockwise: 0 the right, 90 the top.<br>Below 0: clockwise; -90 is 270.<br>Range: -360 ↔ 360.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Where it is at phase 0; a drag sets it too.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitNodeAngle`.*

##### `ce.components.orbit.nodeRatio(target, index, ratio) -> boolean`

Set how many turns one node makes in a cycle, by its number.

Example: `ce.components.orbit.nodeRatio("Orbit", 3, -2)` turns node 3 twice a cycle, clockwise.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `index` (number, required): Node number, counted from 1.<br>A fraction: rounded.<br>Not one of the nodes: rejected with a console error.
- `ratio` (number, required): Turns per cycle.<br>Above 0: counter-clockwise. Below 0: clockwise.<br>0: it stands still.<br>Range: -16 ↔ 16.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- A whole number comes back to where it started every cycle.
- The inspector stops at -8 and 8.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitNodeRatio`.*

##### `ce.components.orbit.nodeDepth(target, index, depth) -> boolean`

Set how much of its value one node sends, by its number.

Example: `ce.components.orbit.nodeDepth("Orbit", 2, 0.5)` sends half of node 2's value.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `index` (number, required): Node number, counted from 1.<br>A fraction: rounded.<br>Not one of the nodes: rejected with a console error.
- `depth` (number, required): Part of the value: 1 all of it, 0.5 half.<br>0: nothing.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- What it sends: `nodeOutput()`. Turned upside down: `nodeInvert()`, before the depth is taken.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitNodeDepth`.*

##### `ce.components.orbit.nodeOutput(target, index, output) -> boolean`

Set what one node sends, by its number.

Example: `ce.components.orbit.nodeOutput("Orbit", 2, "sine")` makes node 2 send a sine of its angle.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `index` (number, required): Node number, counted from 1.<br>A fraction: rounded.<br>Not one of the nodes: rejected with a console error.
- `output` (text, required): "y": its height: 0.5 level with the centre, 1 at the top of a ring of radius 1.<br>"x": its place across, the same way: 1 at the right.<br>"sine": a sine of its angle: 0 to 1, whatever its radius.<br>"radius": its distance from the centre, which stays the same as it turns.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "y".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitNodeOutput`.*

##### `ce.components.orbit.nodeInvert(target, index [, invert]) -> boolean`

Turn what one node sends upside down, or back, by its number.

Example: `ce.components.orbit.nodeInvert("Orbit", 3, true)` makes node 3 send 1 where it would send 0.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `index` (number, required): Node number, counted from 1.<br>A fraction: rounded.<br>Not one of the nodes: rejected with a console error.
- `invert` (true or false, optional): true: upside down: 1 less what it would send.<br>false: as it is.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Turned before `nodeDepth()` takes its part.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitNodeInvert`.*

##### `ce.components.orbit.editable(target [, editable]) -> boolean`

Let the satellites be dragged, or not.

Example: `ce.components.orbit.editable("Orbit")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `editable` (true or false, optional): true: a drag moves a satellite to a new radius and angle.<br>false: drags do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitEditable`.*

##### `ce.components.orbit.showTrails(target [, showTrails]) -> boolean`

Show or hide the trail behind each satellite.

Example: `ce.components.orbit.showTrails("Orbit")` shows the trails if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `showTrails` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitShowTrails`.*

##### `ce.components.orbit.showSpokes(target [, showSpokes]) -> boolean`

Show or hide the line from the centre to each satellite.

Example: `ce.components.orbit.showSpokes("Orbit")` shows the spokes if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `showSpokes` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitShowSpokes`.*

##### `ce.components.orbit.showRings(target [, showRings]) -> boolean`

Show or hide the ring each satellite turns on.

Example: `ce.components.orbit.showRings("Orbit")` shows the rings if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `showRings` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitShowRings`.*

##### `ce.components.orbit.showValues(target [, showValues]) -> boolean`

Show or hide each satellite's value, as a percentage, above it.

Example: `ce.components.orbit.showValues("Orbit")` shows the values if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `showValues` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitShowValues`.*

##### `ce.components.orbit.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.orbit.read("Orbit")` gives every setting as a table.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name.
- `read(target, "phase")`: where it is now.
- `read(target, "nodeRadius")`: every node's; `read(target, "nodeRadius", 2)`: one.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `orbitRead`.*

##### `ce.components.orbit.size(target [, name]) -> number|table`

Read how many elements a list has.

Example: `ce.components.orbit.size("Orbit")` gives the length of every list as a table.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `name` (text, optional): A list verb of this component, by name.<br>Left out: every list, as a table.<br>Not a list verb: rejected with a console error.

Good to know:

- `size(target)`: every list as a table, by verb name; `size(target, "node")`: one number.
- Returns the number.
- Rejected: no result, with a console error.

*Short name: `orbitSize`.*

##### `ce.components.orbit.fill(target, name, values) -> boolean`

Write a whole list in one call.

Example: `ce.components.orbit.fill("Orbit", "node", {true, false, true})` writes nodes 1 to 3.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb: rejected with a console error.
- `values` (list, required): A list, one value per element from the first.<br>Longer than the list: rejected with a console error.<br>Not a list: rejected with a console error.

Good to know:

- One undo step for the whole list, instead of one per element.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitFill`.*

##### `ce.components.orbit.insert(target, name [, index]) -> boolean`

Add one element to a list.

Example: `ce.components.orbit.insert("Orbit", "node")` adds a node at the end.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot grow: rejected with a console error.
- `index` (number, optional): Position of the new element, counted from 1.<br>A fraction: rounded.<br>Left out: after the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The new element is the canvas's own template. Appended; with an index, inserted before that position, counted from 1.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitInsert`.*

##### `ce.components.orbit.remove(target, name [, index]) -> boolean`

Remove one element from a list.

Example: `ce.components.orbit.remove("Orbit", "node")` removes the last node.

- `target` (control name, required): The Orbit's control, by name.<br>Not an Orbit: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot shrink: rejected with a console error.
- `index` (number, optional): Element number, counted from 1.<br>A fraction: rounded.<br>Left out: the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The last; with an index, that one, counted from 1. An element the component needs stays: an envelope keeps its endpoints.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `orbitRemove`.*

#### ce.components.kinetic: Kinetic

Bounce a ball round a box as a modulation source: its gravity, bounce and drag, and where and how hard it is thrown.

##### `ce.components.kinetic.run(target [, run]) -> boolean`

Start or stop the ball.

Example: `ce.components.kinetic.run("Kinetic", false)` stops the ball where it is.

- `target` (control name, required): The Kinetic's control, by name.<br>Not a Kinetic: rejected with a console error.
- `run` (true or false, optional): true: it moves.<br>false: it stops where it is.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `kineticRun`.*

##### `ce.components.kinetic.sync(target [, sync]) -> boolean`

Move the ball in the Transport's time, or in its own.

Example: `ce.components.kinetic.sync("Kinetic")` switches the sync to transport on if it is off, and off if it is on.

- `target` (control name, required): The Kinetic's control, by name.<br>Not a Kinetic: rejected with a console error.
- `sync` (true or false, optional): true: a faster tempo speeds it up, and a stopped Transport holds it.<br>false: in real time.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `kineticSync`.*

##### `ce.components.kinetic.gravity(target, gravity) -> boolean`

Set how hard the ball is pulled down.

Example: `ce.components.kinetic.gravity("Kinetic", 1)` lets the ball fall and settle.

- `target` (control name, required): The Kinetic's control, by name.<br>Not a Kinetic: rejected with a console error.
- `gravity` (number, required): Pull, in boxes a second, a second.<br>0: none.<br>Range: 0 ↔ 4.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `kineticGravity`.*

##### `ce.components.kinetic.bounce(target, bounce) -> boolean`

Set how much of its speed the ball keeps at a wall.

Example: `ce.components.kinetic.bounce("Kinetic", 0.5)` halves its speed at every wall.

- `target` (control name, required): The Kinetic's control, by name.<br>Not a Kinetic: rejected with a console error.
- `bounce` (number, required): Part kept: 1 all of it, 0 none.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.92.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `kineticBounce`.*

##### `ce.components.kinetic.friction(target, friction) -> boolean`

Set how fast the ball slows as it moves.

Example: `ce.components.kinetic.friction("Kinetic", 0.2)` slows the ball sooner.

- `target` (control name, required): The Kinetic's control, by name.<br>Not a Kinetic: rejected with a console error.
- `friction` (number, required): Drag through the air.<br>0: none.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.04.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `kineticFriction`.*

##### `ce.components.kinetic.keepAlive(target, keepAlive) -> boolean`

Set how hard the ball is kicked when it nearly stops.

Example: `ce.components.kinetic.keepAlive("Kinetic", 0)` lets the ball settle.

- `target` (control name, required): The Kinetic's control, by name.<br>Not a Kinetic: rejected with a console error.
- `keepAlive` (number, required): Strength of a kick in a random direction.<br>0: none; it settles.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.35.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `kineticKeepAlive`.*

##### `ce.components.kinetic.launch(target [, x] [, y]) -> boolean`

Put the ball at a point and throw it from there.

Example: `ce.components.kinetic.launch("Kinetic", 0.5, 0.9)` throws the ball from the top middle of the box.

- `target` (control name, required): The Kinetic's control, by name.<br>Not a Kinetic: rejected with a console error.
- `x` (number, optional): Across the box: 0 the left, 1 the right.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Left out: unchanged.<br>Invalid: rejected with a console error.<br>Both left out: rejected with a console error.
- `y` (number, optional): Up the box: 0 the bottom, 1 the top.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Left out: unchanged.<br>Invalid: rejected with a console error.<br>Both left out: rejected with a console error.

Good to know:

- With the speed `velocity()` sets. A running ball is thrown again at once.
- Default: 0.5, 0.7.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `kineticLaunch`.*

##### `ce.components.kinetic.velocity(target [, vx] [, vy]) -> boolean`

Set how fast, and which way, the ball is thrown.

Example: `ce.components.kinetic.velocity("Kinetic", 1, 0.5)` throws the ball to the right and up.

- `target` (control name, required): The Kinetic's control, by name.<br>Not a Kinetic: rejected with a console error.
- `vx` (number, optional): Boxes a second across: below 0 to the left.<br>Range: -4 ↔ 4.<br>Outside the range: the nearest end.<br>Left out: unchanged.<br>Invalid: rejected with a console error.<br>Both left out: rejected with a console error.
- `vy` (number, optional): Boxes a second up: below 0 down.<br>Range: -4 ↔ 4.<br>Outside the range: the nearest end.<br>Left out: unchanged.<br>Invalid: rejected with a console error.<br>Both left out: rejected with a console error.

Good to know:

- Its speed stops at 2.5 boxes a second.
- A running ball is thrown again at once, from where `launch()` puts it.
- Default: 0.6, 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `kineticVelocity`.*

##### `ce.components.kinetic.editable(target [, editable]) -> boolean`

Let the ball be thrown by dragging, or not.

Example: `ce.components.kinetic.editable("Kinetic")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Kinetic's control, by name.<br>Not a Kinetic: rejected with a console error.
- `editable` (true or false, optional): true: a drag throws it.<br>false: drags do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `kineticEditable`.*

##### `ce.components.kinetic.showTrail(target [, showTrail]) -> boolean`

Show or hide the trail behind the ball.

Example: `ce.components.kinetic.showTrail("Kinetic")` shows the trail if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Kinetic's control, by name.<br>Not a Kinetic: rejected with a console error.
- `showTrail` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `kineticShowTrail`.*

##### `ce.components.kinetic.showWalls(target [, showWalls]) -> boolean`

Show or hide the walls of the box.

Example: `ce.components.kinetic.showWalls("Kinetic")` shows the walls if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Kinetic's control, by name.<br>Not a Kinetic: rejected with a console error.
- `showWalls` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `kineticShowWalls`.*

##### `ce.components.kinetic.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.kinetic.read("Kinetic")` gives every setting as a table.

- `target` (control name, required): The Kinetic's control, by name.<br>Not a Kinetic: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `kineticRead`.*

#### ce.components.constellation: Constellation

Move a probe over a map of presets, each a star with a value for every target, and send the presets' values from where it is: the probe, how it blends, and its wander.

##### `ce.components.constellation.probe(target [, x] [, y]) -> boolean`

Move the probe to a point on the map.

Example: `ce.components.constellation.probe("Constellation", 0.25, 0.75)` moves the probe to the upper left.

- `target` (control name, required): The Constellation's control, by name.<br>Not a Constellation: rejected with a console error.
- `x` (number, optional): Across the map: 0 the left, 1 the right.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Left out: unchanged.<br>Invalid: rejected with a console error.<br>Both left out: rejected with a console error.
- `y` (number, optional): Up the map: 0 the bottom, 1 the top.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Left out: unchanged.<br>Invalid: rejected with a console error.<br>Both left out: rejected with a console error.

Good to know:

- Every target is sent its value from there, as `mode()` says.
- While `run()` is on, the wander places the probe; it comes back here when it stops.
- Default: 0.5, 0.5.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constellationProbe`.*

##### `ce.components.constellation.mode(target, mode) -> boolean`

Set whether the probe recalls the nearest preset or blends them.

Example: `ce.components.constellation.mode("Constellation", "snap")` sends the nearest preset's values exactly.

- `target` (control name, required): The Constellation's control, by name.<br>Not a Constellation: rejected with a console error.
- `mode` (text, required): "blend": a mix of every preset's values, the nearer the more.<br>"snap": the nearest preset's values, and `onRecall` when that changes.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "blend".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constellationMode`.*

##### `ce.components.constellation.blend(target, blend) -> boolean`

Set how strongly the nearer presets win in a blend.

Example: `ce.components.constellation.blend("Constellation", 6)` lets the nearest preset take over sooner.

- `target` (control name, required): The Constellation's control, by name.<br>Not a Constellation: rejected with a console error.
- `blend` (number, required): Power of the distance.<br>Low: an even mix. High: the nearest preset wins.<br>Range: 0.5 ↔ 16.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `mode()` is "blend".
- The inspector takes 1 to 6.
- Default: 2.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constellationBlend`.*

##### `ce.components.constellation.run(target [, run]) -> boolean`

Let the probe wander over the map on its own, or not.

Example: `ce.components.constellation.run("Constellation")` switches the running on if it is off, and off if it is on.

- `target` (control name, required): The Constellation's control, by name.<br>Not a Constellation: rejected with a console error.
- `run` (true or false, optional): true: it wanders, in a loop across the map.<br>false: it stays where `probe()` puts it.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- A drag moves the probe all the same.
- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constellationRun`.*

##### `ce.components.constellation.rate(target, rate) -> boolean`

Set how many times a second the wander goes round, while not synced.

Example: `ce.components.constellation.rate("Constellation", 0.05)` goes round once in twenty seconds.

- `target` (control name, required): The Constellation's control, by name.<br>Not a Constellation: rejected with a console error.
- `rate` (number, required): Times round per second.<br>0: it stands still.<br>Range: 0 ↔ 4.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- While synced to the Transport: no effect; `bars()` sets it.
- The inspector takes 0.01 to 2.
- Default: 0.08.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constellationRate`.*

##### `ce.components.constellation.sync(target [, sync]) -> boolean`

Time the wander by the Transport, or by its own rate.

Example: `ce.components.constellation.sync("Constellation")` switches the sync to transport on if it is off, and off if it is on.

- `target` (control name, required): The Constellation's control, by name.<br>Not a Constellation: rejected with a console error.
- `sync` (true or false, optional): true: once round every `bars()`, where the Transport's position puts it.<br>false: at `rate()`.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constellationSync`.*

##### `ce.components.constellation.bars(target, bars) -> boolean`

Set how many bars the wander takes to go round, while synced to the Transport.

Example: `ce.components.constellation.bars("Constellation", 16)` goes round once in sixteen bars.

- `target` (control name, required): The Constellation's control, by name.<br>Not a Constellation: rejected with a console error.
- `bars` (number, required): Bars: 0.25 is one beat in 4/4.<br>Range: 0.25 ↔ 64.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `sync()` is on.
- Default: 8.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constellationBars`.*

##### `ce.components.constellation.links(target, links) -> boolean`

Set how many lines each preset draws to the presets that sound most like it.

Example: `ce.components.constellation.links("Constellation", 3)` links each preset to its three closest.

- `target` (control name, required): The Constellation's control, by name.<br>Not a Constellation: rejected with a console error.
- `links` (number, required): Presets, by how close their values are.<br>0: no lines.<br>Range: 0 ↔ 16, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Drawn while `showLinks()` is on.
- The inspector takes 1 to 6.
- Default: 2.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constellationLinks`.*

##### `ce.components.constellation.editable(target [, editable]) -> boolean`

Let the probe and the presets be dragged, or not.

Example: `ce.components.constellation.editable("Constellation")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Constellation's control, by name.<br>Not a Constellation: rejected with a console error.
- `editable` (true or false, optional): true: a drag on a preset moves it; anywhere else, it moves the probe.<br>false: drags do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constellationEditable`.*

##### `ce.components.constellation.showLinks(target [, showLinks]) -> boolean`

Show or hide the lines between presets that sound alike.

Example: `ce.components.constellation.showLinks("Constellation")` shows the links if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Constellation's control, by name.<br>Not a Constellation: rejected with a console error.
- `showLinks` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- How many: `links()`.
- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constellationShowLinks`.*

##### `ce.components.constellation.showField(target [, showField]) -> boolean`

Show or hide the glow round each preset.

Example: `ce.components.constellation.showField("Constellation")` shows the field if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Constellation's control, by name.<br>Not a Constellation: rejected with a console error.
- `showField` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constellationShowField`.*

##### `ce.components.constellation.showLabels(target [, showLabels]) -> boolean`

Show or hide the presets' names.

Example: `ce.components.constellation.showLabels("Constellation")` shows the labels if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Constellation's control, by name.<br>Not a Constellation: rejected with a console error.
- `showLabels` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- The nearest preset's is always shown; the others' only while there are 8 or fewer.
- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constellationShowLabels`.*

##### `ce.components.constellation.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.constellation.read("Constellation")` gives every setting as a table.

- `target` (control name, required): The Constellation's control, by name.<br>Not a Constellation: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `constellationRead`.*

#### ce.components.timbre: Timbre Pad

Move a puck over anchors, each a patch with a value for every target, and send their values blended by how near it is: the puck, the blend and each anchor.

##### `ce.components.timbre.move(target [, x] [, y]) -> boolean`

Move the puck to a point on the pad.

Example: `ce.components.timbre.move("TimbrePad", 0.8, 0.8)` moves the puck to the upper right.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `x` (number, optional): Across the pad: 0 the left, 1 the right.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Left out: unchanged.<br>Invalid: rejected with a console error.<br>Both left out: rejected with a console error.
- `y` (number, optional): Up the pad: 0 the bottom, 1 the top.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Left out: unchanged.<br>Invalid: rejected with a console error.<br>Both left out: rejected with a console error.

Good to know:

- Every target is sent a mix of the anchors' values, the nearer the more.
- Default: 0.5, 0.5.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `timbreMove`.*

##### `ce.components.timbre.power(target, power) -> boolean`

Set how strongly the nearer anchors win the blend.

Example: `ce.components.timbre.power("TimbrePad", 6)` lets the nearest anchor take over sooner.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `power` (number, required): Power of the distance.<br>Low: an even mix. High: the nearest anchor wins.<br>Range: 0.5 ↔ 16.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The inspector takes 1 to 6.
- Default: 2.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `timbrePower`.*

##### `ce.components.timbre.anchorX(target, index, x) -> boolean`

Move one anchor across the pad, by its number.

Example: `ce.components.timbre.anchorX("TimbrePad", 2, 0.9)` moves anchor 2 to the right edge.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `index` (number, required): Anchor number, counted from 1.<br>A fraction: rounded.<br>Not one of the anchors: rejected with a console error.
- `x` (number, required): Across the pad: 0 the left, 1 the right.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `timbreAnchorX`.*

##### `ce.components.timbre.anchorY(target, index, y) -> boolean`

Move one anchor up or down the pad, by its number.

Example: `ce.components.timbre.anchorY("TimbrePad", 2, 0.1)` moves anchor 2 near the bottom.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `index` (number, required): Anchor number, counted from 1.<br>A fraction: rounded.<br>Not one of the anchors: rejected with a console error.
- `y` (number, required): Up the pad: 0 the bottom, 1 the top.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `timbreAnchorY`.*

##### `ce.components.timbre.axisX(target, axisX) -> boolean`

Set the name written along the bottom, for what the pad changes from left to right.

Example: `ce.components.timbre.axisX("TimbrePad", "dark → bright")` writes dark → bright along the bottom.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `axisX` (text, required): The name.<br>"": none.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Default: "dark → bright".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `timbreAxisX`.*

##### `ce.components.timbre.axisY(target, axisY) -> boolean`

Set the name written up the left side, for what the pad changes from bottom to top.

Example: `ce.components.timbre.axisY("TimbrePad", "soft → aggressive")` writes soft → aggressive up the left side.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `axisY` (text, required): The name.<br>"": none.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Default: "soft → aggressive".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `timbreAxisY`.*

##### `ce.components.timbre.editable(target [, editable]) -> boolean`

Let the puck and the anchors be dragged, or not.

Example: `ce.components.timbre.editable("TimbrePad")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `editable` (true or false, optional): true: a drag on an anchor moves it; anywhere else, it moves the puck.<br>false: drags do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `timbreEditable`.*

##### `ce.components.timbre.showField(target [, showField]) -> boolean`

Show or hide the coloured glow round each anchor.

Example: `ce.components.timbre.showField("TimbrePad")` shows the field if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `showField` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `timbreShowField`.*

##### `ce.components.timbre.showAnchors(target [, showAnchors]) -> boolean`

Show or hide the anchors and their names.

Example: `ce.components.timbre.showAnchors("TimbrePad")` shows the anchors if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `showAnchors` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Hidden, they still blend.
- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `timbreShowAnchors`.*

##### `ce.components.timbre.showReadout(target [, showReadout]) -> boolean`

Show or hide how many targets are bound to a parameter, as "2/3 MIDI" at the top right.

Example: `ce.components.timbre.showReadout("TimbrePad")` shows the readout if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `showReadout` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `timbreShowReadout`.*

##### `ce.components.timbre.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.timbre.read("TimbrePad")` gives every setting as a table.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name. `read(target, "anchorX")`: the whole list; `read(target, "anchorX", 3)`: one anchor, counted from 1.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `timbreRead`.*

##### `ce.components.timbre.size(target [, name]) -> number|table`

Read how many elements a list has.

Example: `ce.components.timbre.size("TimbrePad")` gives the length of every list as a table.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `name` (text, optional): A list verb of this component, by name.<br>Left out: every list, as a table.<br>Not a list verb: rejected with a console error.

Good to know:

- `size(target)`: every list as a table, by verb name; `size(target, "anchorX")`: one number.
- Returns the number.
- Rejected: no result, with a console error.

*Short name: `timbreSize`.*

##### `ce.components.timbre.fill(target, name, values) -> boolean`

Write a whole list in one call.

Example: `ce.components.timbre.fill("TimbrePad", "anchorX", {0.25, 0.5, 0.75})` writes anchors 1 to 3.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb: rejected with a console error.
- `values` (list, required): A list, one value per element from the first.<br>Longer than the list: rejected with a console error.<br>Not a list: rejected with a console error.

Good to know:

- One undo step for the whole list, instead of one per element.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `timbreFill`.*

##### `ce.components.timbre.insert(target, name [, index]) -> boolean`

Add one element to a list.

Example: `ce.components.timbre.insert("TimbrePad", "anchorX")` adds an anchor at the end.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot grow: rejected with a console error.
- `index` (number, optional): Position of the new element, counted from 1.<br>A fraction: rounded.<br>Left out: after the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The new element is the canvas's own template. Appended; with an index, inserted before that position, counted from 1.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `timbreInsert`.*

##### `ce.components.timbre.remove(target, name [, index]) -> boolean`

Remove one element from a list.

Example: `ce.components.timbre.remove("TimbrePad", "anchorX")` removes the last anchor.

- `target` (control name, required): The Timbre Pad's control, by name.<br>Not a Timbre Pad: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot shrink: rejected with a console error.
- `index` (number, optional): Element number, counted from 1.<br>A fraction: rounded.<br>Left out: the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The last; with an index, that one, counted from 1. An element the component needs stays: an envelope keeps its endpoints.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `timbreRemove`.*


### Routing and modulation

Components that send one value somewhere else, or shape it on the way.

#### ce.components.router: Router

Take a signal from the MIDI input or a control, shape it through a curve, and send it to several destinations, each with its own depth.

##### `ce.components.router.source(target, source) -> boolean`

Set the signal it follows.

Example: `ce.components.router.source("Router", "aftertouch")` follows channel aftertouch.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `source` (text, required): "modwheel": CC 1.<br>"aftertouch": channel aftertouch.<br>"polyAftertouch": per-note aftertouch, one note's, as `poly()` picks it.<br>"breath": CC 2.<br>"expression": CC 11.<br>"foot": CC 4.<br>"velocity": the velocity of the last note played.<br>"cc": the CC set by `cc()`.<br>"link": the control set by `sourceControl()`.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- From the MIDI input on `channel()`; until one arrives, `input()` stands in.
- Default: "modwheel".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerSource`.*

##### `ce.components.router.cc(target, cc) -> boolean`

Set the CC it follows while `source()` is "cc".

Example: `ce.components.router.cc("Router", 74)` follows CC 74.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `cc` (number, required): Controller number.<br>Range: 0 ↔ 127, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `source()` is "cc".
- Default: 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerCc`.*

##### `ce.components.router.channel(target, channel) -> boolean`

Set which MIDI channel it listens to.

Example: `ce.components.router.channel("Router", 2)` follows channel 2 only.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `channel` (number, required): Channel 1 ↔ 16, or 0: any channel.<br>Range: 0 ↔ 16, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0, any channel.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerChannel`.*

##### `ce.components.router.poly(target, poly) -> boolean`

Set which note's aftertouch it follows while `source()` is "polyAftertouch".

Example: `ce.components.router.poly("Router", "last")` follows the note pressed last.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `poly` (text, required): "highest": the note pressed hardest.<br>"last": the note pressed last.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "highest".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerPoly`.*

##### `ce.components.router.invert(target [, invert]) -> boolean`

Turn the signal upside down before the curve.

Example: `ce.components.router.invert("Router")` switches the invert on if it is off, and off if it is on.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `invert` (true or false, optional): true: 0 becomes 1 and 1 becomes 0.<br>false: as it comes.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Before `deadzone()`.
- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerInvert`.*

##### `ce.components.router.deadzone(target, deadzone) -> boolean`

Set how much of the bottom of the signal is ignored.

Example: `ce.components.router.deadzone("Router", 0.1)` ignores the bottom tenth of the signal.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `deadzone` (number, required): Part of the signal, from 0: 0 up to it gives 0, and the rest is spread over 0 to 1.<br>0: none.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerDeadzone`.*

##### `ce.components.router.input(target, input) -> boolean`

Set the signal it uses until the MIDI input sends one.

Example: `ce.components.router.input("Router", 0.8)` drives it at 80% until a controller moves.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `input` (number, required): Signal: 0 ↔ 1.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Not used once the source has arrived, or while `source()` is "link".
- Default: 0.5.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerInput`.*

##### `ce.components.router.dest(target, index [, enabled]) -> boolean`

Switch one destination on or off, by its number.

Example: `ce.components.router.dest("Router", 2, false)` stops sending to destination 2.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `index` (number, required): Destination number, counted from 1.<br>A fraction: rounded.<br>Not one of the destinations: rejected with a console error.
- `enabled` (true or false, optional): true: it is sent to.<br>false: not.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerDest`.*

##### `ce.components.router.destDepth(target, index, depth) -> boolean`

Set how strongly one destination follows, by its number.

Example: `ce.components.router.destDepth("Router", 1, -0.5)` sends half of the curve, upside down, to destination 1.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `index` (number, required): Destination number, counted from 1.<br>A fraction: rounded.<br>Not one of the destinations: rejected with a console error.
- `depth` (number, required): Part of the curve: 1 all of it, 0.5 half.<br>Below 0: the curve upside down.<br>0: nothing.<br>Range: -1 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The result is spread over the destination's own range, set in the inspector.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerDestDepth`.*

##### `ce.components.router.curveX(target, index, x) -> boolean`

Move one point of the curve along the signal axis, by its number.

Example: `ce.components.router.curveX("Router", 2, 0.3)` moves point 2 to a signal of 0.3.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `index` (number, required): Point number, counted from 1.<br>A fraction: rounded.<br>Not one of the points: rejected with a console error.
- `x` (number, required): Signal: 0 ↔ 1.<br>Range: between the points either side; the first point at 0, the last at 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerCurveX`.*

##### `ce.components.router.curveY(target, index, y) -> boolean`

Set the output of one point of the curve, by its number.

Example: `ce.components.router.curveY("Router", 2, 0.8)` sends 0.8 at point 2.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `index` (number, required): Point number, counted from 1.<br>A fraction: rounded.<br>Not one of the points: rejected with a console error.
- `y` (number, required): Output: 0 ↔ 1.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerCurveY`.*

##### `ce.components.router.curveShape(target, index, curve) -> boolean`

Set the shape of the segment of the curve that ends at one point, by its number.

Example: `ce.components.router.curveShape("Router", 2, "exp")` curves the segment into point 2.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `index` (number, required): Point number, counted from 1.<br>A fraction: rounded.<br>Not one of the points: rejected with a console error.
- `curve` (text, required): "linear": straight.<br>"exp": slow, then fast.<br>"log": fast, then slow.<br>"scurve": slow at both ends.<br>"hold": flat, then a jump at the point.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerCurveShape`.*

##### `ce.components.router.sourceControl(target [, name]) -> boolean`

Name the control it follows while `source()` is "link".

Example: `ce.components.router.sourceControl("Router", "Expression")` makes the control called Expression the signal.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `name` (text, optional): The driving control's name.<br>Left out, or "": unlinked.<br>Its range is the signal's 0 to 1.<br>Not on this panel, or not a knob, slider or other range control: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.
- `read(target, "sourceControl")` gives the control's name.

*Short name: `routerSourceControl`.*

##### `ce.components.router.editable(target [, editable]) -> boolean`

Let the curve's points be dragged, or not.

Example: `ce.components.router.editable("Router")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `editable` (true or false, optional): true: a drag moves a point.<br>false: drags do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerEditable`.*

##### `ce.components.router.showGrid(target [, showGrid]) -> boolean`

Show or hide the grid behind the curve.

Example: `ce.components.router.showGrid("Router")` shows the grid if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `showGrid` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerShowGrid`.*

##### `ce.components.router.showDivisions(target [, showDivisions]) -> boolean`

Show or hide the level lines across the curve.

Example: `ce.components.router.showDivisions("Router")` shows the divisions if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `showDivisions` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerShowDivisions`.*

##### `ce.components.router.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.router.read("Router")` gives every setting as a table.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name. `read(target, "curveShape")`: the whole list; `read(target, "curveShape", 3)`: one point, counted from 1.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `routerRead`.*

##### `ce.components.router.size(target [, name]) -> number|table`

Read how many elements a list has.

Example: `ce.components.router.size("Router")` gives the length of every list as a table.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `name` (text, optional): A list verb of this component, by name.<br>Left out: every list, as a table.<br>Not a list verb: rejected with a console error.

Good to know:

- `size(target)`: every list as a table, by verb name; `size(target, "curveShape")`: one number.
- Returns the number.
- Rejected: no result, with a console error.

*Short name: `routerSize`.*

##### `ce.components.router.fill(target, name, values) -> boolean`

Write a whole list in one call.

Example: `ce.components.router.fill("Router", "dest", {true, false, true})` writes destinations 1 to 3.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb: rejected with a console error.
- `values` (list, required): A list, one value per element from the first.<br>Longer than the list: rejected with a console error.<br>Not a list: rejected with a console error.

Good to know:

- One undo step for the whole list, instead of one per element.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerFill`.*

##### `ce.components.router.insert(target, name [, index]) -> boolean`

Add one element to a list.

Example: `ce.components.router.insert("Router", "curveShape")` adds a point at the end.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot grow: rejected with a console error.
- `index` (number, optional): Position of the new element, counted from 1.<br>A fraction: rounded.<br>Left out: after the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The new element is the canvas's own template. Appended; with an index, inserted before that position, counted from 1.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerInsert`.*

##### `ce.components.router.remove(target, name [, index]) -> boolean`

Remove one element from a list.

Example: `ce.components.router.remove("Router", "curveShape")` removes the last point.

- `target` (control name, required): The Router's control, by name.<br>Not a Router: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot shrink: rejected with a console error.
- `index` (number, optional): Element number, counted from 1.<br>A fraction: rounded.<br>Left out: the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The last; with an index, that one, counted from 1. An element the component needs stays: an envelope keeps its endpoints.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `routerRemove`.*

#### ce.components.macro: Macro

Turn one knob that drives several parameters, each slot with its own depth, curve and range.

##### `ce.components.macro.value(target, value) -> boolean`

Turn the knob.

Example: `ce.components.macro.value("Macro", 0.75)` turns the knob three quarters of the way.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `value` (number, required): Position: 0 fully left, 1 fully right.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Every slot that is on is sent its value from there.
- Default: 0.28.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `macroValue`.*

##### `ce.components.macro.slot(target, index [, enabled]) -> boolean`

Switch one slot on or off, by its number.

Example: `ce.components.macro.slot("Macro", 2, false)` stops slot 2 following the knob.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `index` (number, required): Slot number, counted from 1.<br>A fraction: rounded.<br>Not one of the slots: rejected with a console error.
- `enabled` (true or false, optional): true: it follows the knob.<br>false: it sends 0.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `macroSlot`.*

##### `ce.components.macro.slotDepth(target, index, depth) -> boolean`

Set how much of the knob's turn one slot follows, by its number.

Example: `ce.components.macro.slotDepth("Macro", 3, -0.5)` makes slot 3 fall half as far as the knob turns.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `index` (number, required): Slot number, counted from 1.<br>A fraction: rounded.<br>Not one of the slots: rejected with a console error.
- `depth` (number, required): Part of the turn: 1 all of it, 0.5 half.<br>Below 0: it goes down as the knob turns up.<br>0: it stays at `slotMin()`.<br>Range: -1 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `macroSlotDepth`.*

##### `ce.components.macro.slotCurve(target, index, curve) -> boolean`

Set how one slot follows the turn, by its number.

Example: `ce.components.macro.slotCurve("Macro", 1, "exp")` makes slot 1 change slowly at first.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `index` (number, required): Slot number, counted from 1.<br>A fraction: rounded.<br>Not one of the slots: rejected with a console error.
- `curve` (text, required): "linear": evenly.<br>"exp": slowly, then fast.<br>"log": fast, then slowly.<br>"scurve": slowly at both ends.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `macroSlotCurve`.*

##### `ce.components.macro.slotMin(target, index, min) -> boolean`

Set the value one slot sends with the knob at 0, by its number.

Example: `ce.components.macro.slotMin("Macro", 1, 0.2)` keeps slot 1 at 0.2 or more.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `index` (number, required): Slot number, counted from 1.<br>A fraction: rounded.<br>Not one of the slots: rejected with a console error.
- `min` (number, required): Value.<br>Above `slotMax()`: the slot runs the other way.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `macroSlotMin`.*

##### `ce.components.macro.slotMax(target, index, max) -> boolean`

Set the value one slot sends with the knob at 1, by its number.

Example: `ce.components.macro.slotMax("Macro", 1, 0.8)` keeps slot 1 at 0.8 or less.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `index` (number, required): Slot number, counted from 1.<br>A fraction: rounded.<br>Not one of the slots: rejected with a console error.
- `max` (number, required): Value.<br>Below `slotMin()`: the slot runs the other way.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `macroSlotMax`.*

##### `ce.components.macro.label(target, label) -> boolean`

Set the caption above the knob.

Example: `ce.components.macro.label("Macro", "TONE")` captions the knob TONE.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `label` (text, required): The caption, drawn in capitals.<br>"": none.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Default: "Macro".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `macroLabel`.*

##### `ce.components.macro.editable(target [, editable]) -> boolean`

Let the knob be turned by dragging, or not.

Example: `ce.components.macro.editable("Macro")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `editable` (true or false, optional): true: a drag up turns it up.<br>false: drags do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `macroEditable`.*

##### `ce.components.macro.showLanes(target [, showLanes]) -> boolean`

Show or hide a lane for each slot beside the knob.

Example: `ce.components.macro.showLanes("Macro")` shows the lanes if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `showLanes` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Hidden, the knob fills the control.
- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `macroShowLanes`.*

##### `ce.components.macro.showValues(target [, showValues]) -> boolean`

Show or hide the knob's value and each slot's.

Example: `ce.components.macro.showValues("Macro")` shows the values if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `showValues` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `macroShowValues`.*

##### `ce.components.macro.showDivisions(target [, showDivisions]) -> boolean`

Show or hide the level lines along each slot's lane.

Example: `ce.components.macro.showDivisions("Macro")` shows the divisions if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `showDivisions` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- How many: set in the inspector, under Major and Minor.
- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `macroShowDivisions`.*

##### `ce.components.macro.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.macro.read("Macro")` gives every setting as a table.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name. `read(target, "slot")`: the whole list; `read(target, "slot", 3)`: one slot, counted from 1.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `macroRead`.*

##### `ce.components.macro.size(target [, name]) -> number|table`

Read how many elements a list has.

Example: `ce.components.macro.size("Macro")` gives the length of every list as a table.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `name` (text, optional): A list verb of this component, by name.<br>Left out: every list, as a table.<br>Not a list verb: rejected with a console error.

Good to know:

- `size(target)`: every list as a table, by verb name; `size(target, "slot")`: one number.
- Returns the number.
- Rejected: no result, with a console error.

*Short name: `macroSize`.*

##### `ce.components.macro.fill(target, name, values) -> boolean`

Write a whole list in one call.

Example: `ce.components.macro.fill("Macro", "slot", {true, false, true})` writes slots 1 to 3.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb: rejected with a console error.
- `values` (list, required): A list, one value per element from the first.<br>Longer than the list: rejected with a console error.<br>Not a list: rejected with a console error.

Good to know:

- One undo step for the whole list, instead of one per element.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `macroFill`.*

##### `ce.components.macro.insert(target, name [, index]) -> boolean`

Add one element to a list.

Example: `ce.components.macro.insert("Macro", "slot")` adds a slot at the end.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot grow: rejected with a console error.
- `index` (number, optional): Position of the new element, counted from 1.<br>A fraction: rounded.<br>Left out: after the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The new element is the canvas's own template. Appended; with an index, inserted before that position, counted from 1.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `macroInsert`.*

##### `ce.components.macro.remove(target, name [, index]) -> boolean`

Remove one element from a list.

Example: `ce.components.macro.remove("Macro", "slot")` removes the last slot.

- `target` (control name, required): The Macro's control, by name.<br>Not a Macro: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot shrink: rejected with a console error.
- `index` (number, optional): Element number, counted from 1.<br>A fraction: rounded.<br>Left out: the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The last; with an index, that one, counted from 1. An element the component needs stays: an envelope keeps its endpoints.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `macroRemove`.*

#### ce.components.matrix: Mod Matrix

Route sources to destinations, each crosspoint with its own amount: one at a time, or all set to 0.

##### `ce.components.matrix.cell(target, row, col, amount) -> boolean`

Set how much one source sends to one destination.

Example: `ce.components.matrix.cell("ModMatrix", 2, 3, -0.5)` sends source 2 to destination 3 at half, upside down.

- `target` (control name, required): The Mod Matrix's control, by name.<br>Not a Mod Matrix: rejected with a console error.
- `row` (number, required): Row, counted from 1.<br>A fraction: rounded.<br>Not a row the grid has: rejected with a console error.
- `col` (number, required): Column, counted from 1.<br>A fraction: rounded.<br>Not a column the grid has: rejected with a console error.
- `amount` (number, required): Amount: 1 all of it, 0.5 half, 0 none; below 0, upside down.<br>Range: -1 ↔ 1; 0 ↔ 1 while `bipolar()` is off.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The rows are the sources and the columns the destinations, as the grid labels them.
- Not snapped: `step()` snaps a drag.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `matrixCell`.*

##### `ce.components.matrix.clear(target) -> boolean`

Set every crosspoint to 0.

Example: `ce.components.matrix.clear("ModMatrix")` routes nothing anywhere.

- `target` (control name, required): The Mod Matrix's control, by name.<br>Not a Mod Matrix: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `matrixClear`.*

##### `ce.components.matrix.bipolar(target [, bipolar]) -> boolean`

Let amounts go below 0, or keep them 0 to 1.

Example: `ce.components.matrix.bipolar("ModMatrix")` switches the bipolar on if it is off, and off if it is on.

- `target` (control name, required): The Mod Matrix's control, by name.<br>Not a Mod Matrix: rejected with a console error.
- `bipolar` (true or false, optional): true: -1 to 1; below 0 sends the source upside down.<br>false: 0 to 1.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Amounts already below 0 are kept as they are.
- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `matrixBipolar`.*

##### `ce.components.matrix.step(target, step) -> boolean`

Set the step a drag snaps an amount to.

Example: `ce.components.matrix.step("ModMatrix", 0.25)` snaps a drag to quarters.

- `target` (control name, required): The Mod Matrix's control, by name.<br>Not a Mod Matrix: rejected with a console error.
- `step` (number, required): Amount.<br>0: no snap.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- A drag only: `cell()` is not snapped.
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `matrixStep`.*

##### `ce.components.matrix.cellStyle(target, cellStyle) -> boolean`

Set how each crosspoint shows its amount.

Example: `ce.components.matrix.cellStyle("ModMatrix", "dot")` shows each amount as a dot.

- `target` (control name, required): The Mod Matrix's control, by name.<br>Not a Mod Matrix: rejected with a console error.
- `cellStyle` (text, required): "bar": a bar, from the middle while bipolar.<br>"fill": the cell filled.<br>"dot": a dot.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "bar".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `matrixCellStyle`.*

##### `ce.components.matrix.editable(target [, editable]) -> boolean`

Let the crosspoints be dragged, or not.

Example: `ce.components.matrix.editable("ModMatrix")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Mod Matrix's control, by name.<br>Not a Mod Matrix: rejected with a console error.
- `editable` (true or false, optional): true: a drag up a cell raises its amount.<br>false: drags do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `matrixEditable`.*

##### `ce.components.matrix.showLabels(target [, showLabels]) -> boolean`

Show or hide the sources' and destinations' names.

Example: `ce.components.matrix.showLabels("ModMatrix")` shows the labels if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Mod Matrix's control, by name.<br>Not a Mod Matrix: rejected with a console error.
- `showLabels` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `matrixShowLabels`.*

##### `ce.components.matrix.showValues(target [, showValues]) -> boolean`

Show or hide each amount, as a number, in its cell.

Example: `ce.components.matrix.showValues("ModMatrix")` shows the values if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Mod Matrix's control, by name.<br>Not a Mod Matrix: rejected with a console error.
- `showValues` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Not 0s.
- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `matrixShowValues`.*

##### `ce.components.matrix.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.matrix.read("ModMatrix")` gives every setting as a table.

- `target` (control name, required): The Mod Matrix's control, by name.<br>Not a Mod Matrix: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name. `read(target, "cell")`: the whole grid, as rows; `read(target, "cell", 2, 3)`: row 2, column 3.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `matrixRead`.*

##### `ce.components.matrix.size(target [, name]) -> number|table`

Read how many elements a list has.

Example: `ce.components.matrix.size("ModMatrix")` gives the length of every list as a table.

- `target` (control name, required): The Mod Matrix's control, by name.<br>Not a Mod Matrix: rejected with a console error.
- `name` (text, optional): A list verb of this component, by name.<br>Left out: every list, as a table.<br>Not a list verb: rejected with a console error.

Good to know:

- `size(target)`: every list as a table, by verb name; `size(target, "cell")`: { rows, cols }.
- Returns the number.
- Rejected: no result, with a console error.

*Short name: `matrixSize`.*

##### `ce.components.matrix.fill(target, name, values) -> boolean`

Write a whole list in one call.

Example: `ce.components.matrix.fill("ModMatrix", "cell", {{0.5, 0}, {0, 0.5}})` writes rows 1 and 2 of the grid.

- `target` (control name, required): The Mod Matrix's control, by name.<br>Not a Mod Matrix: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb: rejected with a console error.
- `values` (list, required): A list, one value per element from the first.<br>Longer than the list: rejected with a console error.<br>Not a list: rejected with a console error.

Good to know:

- One undo step for the whole list, instead of one per element.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `matrixFill`.*

#### ce.components.constraint: Constraint

Keep several values to a rule as one of them moves: adding up to 1, in order, in proportion, or mirrored.

##### `ce.components.constraint.mode(target, mode) -> boolean`

Set the rule the members keep.

Example: `ce.components.constraint.mode("Constraint", "order")` keeps each member at or above the one before.

- `target` (control name, required): The Constraint's control, by name.<br>Not a Constraint: rejected with a console error.
- `mode` (text, required): "sum": they add up to 1; the others share what is left, as they stood.<br>"order": each at or above the one before, by `gap()` at least.<br>"ratio": all scaled together, keeping their proportions.<br>"mirror": member 2 is 1 minus member 1; the others are free.<br>"free": no rule.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Kept from the next move on: the values are not changed now.
- Default: "sum".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constraintMode`.*

##### `ce.components.constraint.gap(target, gap) -> boolean`

Set the least space between members, while `mode()` is "order".

Example: `ce.components.constraint.gap("Constraint", 0.1)` keeps each member 0.1 above the one before.

- `target` (control name, required): The Constraint's control, by name.<br>Not a Constraint: rejected with a console error.
- `gap` (number, required): Space.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `mode()` is "order".
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constraintGap`.*

##### `ce.components.constraint.member(target, index, value) -> boolean`

Move one member, by its number; the others move to keep the rule.

Example: `ce.components.constraint.member("Constraint", 1, 0.8)` sets member 1 to 0.8, and the others share 0.2 under "sum".

- `target` (control name, required): The Constraint's control, by name.<br>Not a Constraint: rejected with a console error.
- `index` (number, required): Member number, counted from 1.<br>A fraction: rounded.<br>Not one of the members: rejected with a console error.
- `value` (number, required): Value.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- As a drag moves it: under "ratio", a member at 0 moves alone.
- `fill(target, "member", …)` writes every value as given, without the rule.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constraintMember`.*

##### `ce.components.constraint.editable(target [, editable]) -> boolean`

Let the members be dragged, or not.

Example: `ce.components.constraint.editable("Constraint")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Constraint's control, by name.<br>Not a Constraint: rejected with a console error.
- `editable` (true or false, optional): true: a drag on a bar moves that member, and the others keep the rule.<br>false: drags do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constraintEditable`.*

##### `ce.components.constraint.showValues(target [, showValues]) -> boolean`

Show or hide each member's value.

Example: `ce.components.constraint.showValues("Constraint")` shows the values if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Constraint's control, by name.<br>Not a Constraint: rejected with a console error.
- `showValues` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constraintShowValues`.*

##### `ce.components.constraint.showBadge(target [, showBadge]) -> boolean`

Show or hide the rule's sign, such as "Σ = 100%".

Example: `ce.components.constraint.showBadge("Constraint")` shows the badge if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Constraint's control, by name.<br>Not a Constraint: rejected with a console error.
- `showBadge` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constraintShowBadge`.*

##### `ce.components.constraint.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.constraint.read("Constraint")` gives every setting as a table.

- `target` (control name, required): The Constraint's control, by name.<br>Not a Constraint: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name. `read(target, "member")`: the whole list; `read(target, "member", 3)`: one member, counted from 1.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `constraintRead`.*

##### `ce.components.constraint.size(target [, name]) -> number|table`

Read how many elements a list has.

Example: `ce.components.constraint.size("Constraint")` gives the length of every list as a table.

- `target` (control name, required): The Constraint's control, by name.<br>Not a Constraint: rejected with a console error.
- `name` (text, optional): A list verb of this component, by name.<br>Left out: every list, as a table.<br>Not a list verb: rejected with a console error.

Good to know:

- `size(target)`: every list as a table, by verb name; `size(target, "member")`: one number.
- Returns the number.
- Rejected: no result, with a console error.

*Short name: `constraintSize`.*

##### `ce.components.constraint.fill(target, name, values) -> boolean`

Write a whole list in one call.

Example: `ce.components.constraint.fill("Constraint", "member", {0.25, 0.5, 0.75})` writes members 1 to 3.

- `target` (control name, required): The Constraint's control, by name.<br>Not a Constraint: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb: rejected with a console error.
- `values` (list, required): A list, one value per element from the first.<br>Longer than the list: rejected with a console error.<br>Not a list: rejected with a console error.

Good to know:

- One undo step for the whole list, instead of one per element.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constraintFill`.*

##### `ce.components.constraint.insert(target, name [, index]) -> boolean`

Add one element to a list.

Example: `ce.components.constraint.insert("Constraint", "member")` adds a member at the end.

- `target` (control name, required): The Constraint's control, by name.<br>Not a Constraint: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot grow: rejected with a console error.
- `index` (number, optional): Position of the new element, counted from 1.<br>A fraction: rounded.<br>Left out: after the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The new element is the canvas's own template. Appended; with an index, inserted before that position, counted from 1.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constraintInsert`.*

##### `ce.components.constraint.remove(target, name [, index]) -> boolean`

Remove one element from a list.

Example: `ce.components.constraint.remove("Constraint", "member")` removes the last member.

- `target` (control name, required): The Constraint's control, by name.<br>Not a Constraint: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot shrink: rejected with a console error.
- `index` (number, optional): Element number, counted from 1.<br>A fraction: rounded.<br>Left out: the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The last; with an index, that one, counted from 1. An element the component needs stays: an envelope keeps its endpoints.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `constraintRemove`.*

#### ce.components.envelope: Envelope

Shape an envelope from its points: a preset, each point's place, level and curve, the sustain point, the loop and the playhead.

##### `ce.components.envelope.preset(target, preset) -> boolean`

Give the envelope a preset shape.

Example: `ce.components.envelope.preset("Envelope", "ad")` makes the envelope an attack and a decay.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `preset` (text, required): "adsr": attack, decay, sustain, release; the sustain at point 3.<br>"ad": attack and decay.<br>"ar": attack and release.<br>"dahdsr": delay, attack, hold, decay, sustain, release; the sustain at point 5.<br>"mseg" or "free": five points, every one free to move.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Its points and sustain point are replaced, as the inspector's Preset does.
- Default: "adsr".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopePreset`.*

##### `ce.components.envelope.pointX(target, index, x) -> boolean`

Move one point along the time axis, by its number.

Example: `ce.components.envelope.pointX("Envelope", 2, 0.1)` moves point 2 to a tenth of the way along.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `index` (number, required): Point number, counted from 1.<br>A fraction: rounded.<br>Not one of the points: rejected with a console error.
- `x` (number, required): Part of the time axis: 0 the start, 1 the end.<br>Range: between the points either side; the first point at 0, the last at 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- 1 on the time axis is `timeMax()` milliseconds.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopePointX`.*

##### `ce.components.envelope.pointY(target, index, y) -> boolean`

Set the level of one point, by its number.

Example: `ce.components.envelope.pointY("Envelope", 3, 0.6)` puts point 3 at 60%.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `index` (number, required): Point number, counted from 1.<br>A fraction: rounded.<br>Not one of the points: rejected with a console error.
- `y` (number, required): Level: 0 the bottom, 1 the top.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The canvas keeps the levels a preset fixes, such as an ADSR's first and last at 0; a script can move them.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopePointY`.*

##### `ce.components.envelope.pointCurve(target, index, curve) -> boolean`

Set the shape of the segment that ends at one point, by its number.

Example: `ce.components.envelope.pointCurve("Envelope", 2, "exp")` curves the rise into point 2.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `index` (number, required): Point number, counted from 1.<br>A fraction: rounded.<br>Not one of the points: rejected with a console error.
- `curve` (text, required): "linear": straight.<br>"exp": slow, then fast.<br>"log": fast, then slow.<br>"scurve": slow at both ends.<br>"hold": flat, then a jump at the point.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Point 1 starts the envelope: its curve is not drawn.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopePointCurve`.*

##### `ce.components.envelope.sustain(target, sustain) -> boolean`

Set which point holds while a note is held.

Example: `ce.components.envelope.sustain("Envelope", 3)` holds at point 3.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `sustain` (number, required): Point number, counted from 1.<br>0 or -1: no sustain point.<br>Range: -1 ↔ the number of points, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 3, as "adsr" puts it.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeSustain`.*

##### `ce.components.envelope.loop(target [, loop]) -> boolean`

Mark a loop on the curve, from `loopStart()` to `loopEnd()`, or not.

Example: `ce.components.envelope.loop("Envelope")` switches the loop enabled on if it is off, and off if it is on.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `loop` (true or false, optional): true: marked.<br>false: not.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeLoop`.*

##### `ce.components.envelope.loopStart(target, loopStart) -> boolean`

Set the point the loop starts at.

Example: `ce.components.envelope.loopStart("Envelope", 2)` starts the loop at point 2.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `loopStart` (number, required): Point number, counted from 1.<br>Range: 1 ↔ the number of points, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeLoopStart`.*

##### `ce.components.envelope.loopEnd(target, loopEnd) -> boolean`

Set the point the loop ends at.

Example: `ce.components.envelope.loopEnd("Envelope", 3)` ends the loop at point 3.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `loopEnd` (number, required): Point number, counted from 1.<br>Range: 1 ↔ the number of points, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeLoopEnd`.*

##### `ce.components.envelope.timeMax(target, timeMax) -> boolean`

Set how many milliseconds the whole time axis stands for.

Example: `ce.components.envelope.timeMax("Envelope", 2000)` makes the time axis two seconds long.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `timeMax` (number, required): Milliseconds, at 1 on the time axis.<br>Range: 1 ↔ 600000.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The times read out only: it does not change the shape.
- Default: 1000.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeTimeMax`.*

##### `ce.components.envelope.phase(target, phase) -> boolean`

Put the playhead at a point along the time axis.

Example: `ce.components.envelope.phase("Envelope", 0.5)` puts the playhead halfway along.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `phase` (number, required): Part of the time axis: 0 the start, 1 the end.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Shown while `showPlayhead()` is on.
- While `phaseSource()` links a control, that control places it.
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopePhase`.*

##### `ce.components.envelope.addOnDoubleClick(target [, addOnDoubleClick]) -> boolean`

Let a double-click on the curve add a point, or not.

Example: `ce.components.envelope.addOnDoubleClick("Envelope")` switches the add on double click on if it is off, and off if it is on.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `addOnDoubleClick` (true or false, optional): true: a double-click adds a point there.<br>false: it does nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeAddOnDoubleClick`.*

##### `ce.components.envelope.snapX(target, snapX) -> boolean`

Set the step a dragged point snaps to along the time axis.

Example: `ce.components.envelope.snapX("Envelope", 0.125)` snaps points to eighths of the time axis.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `snapX` (number, required): Part of the time axis.<br>0: no snap.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Dragging only: `pointX()` is not snapped.
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeSnapX`.*

##### `ce.components.envelope.snapY(target, snapY) -> boolean`

Set the step a dragged point snaps to in level.

Example: `ce.components.envelope.snapY("Envelope", 0.25)` snaps points to quarters of the level.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `snapY` (number, required): Part of the level.<br>0: no snap.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Dragging only: `pointY()` is not snapped.
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeSnapY`.*

##### `ce.components.envelope.fillUnder(target [, fillUnder]) -> boolean`

Shade the area under the curve, or not.

Example: `ce.components.envelope.fillUnder("Envelope")` switches the fill under on if it is off, and off if it is on.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `fillUnder` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: on.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeFillUnder`.*

##### `ce.components.envelope.phaseSource(target [, name]) -> boolean`

Name the control that places the playhead.

Example: `ce.components.envelope.phaseSource("Envelope", "Position")` makes the control called Position move the playhead.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `name` (text, optional): The driving control's name.<br>Left out, or "": unlinked.<br>Its range sets 0 to 1.<br>Not on this panel, or not a knob, slider or other range control: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.
- `read(target, "phaseSource")` gives the control's name.

*Short name: `envelopePhaseSource`.*

##### `ce.components.envelope.editable(target [, editable]) -> boolean`

Let the points be dragged, added and removed by touch, or not.

Example: `ce.components.envelope.editable("Envelope")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `editable` (true or false, optional): true: they can be.<br>false: touches do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Only touch is locked: the commands still work.
- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeEditable`.*

##### `ce.components.envelope.showPlayhead(target [, showPlayhead]) -> boolean`

Show or hide the playhead: a dot on the curve at `phase()`.

Example: `ce.components.envelope.showPlayhead("Envelope")` shows the playhead if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `showPlayhead` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeShowPlayhead`.*

##### `ce.components.envelope.showGrid(target [, showGrid]) -> boolean`

Show or hide the grid behind the curve.

Example: `ce.components.envelope.showGrid("Envelope")` shows the grid if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `showGrid` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Its divisions are set in the inspector. Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeShowGrid`.*

##### `ce.components.envelope.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.envelope.read("Envelope")` gives every setting as a table.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name. `read(target, "pointCurve")`: the whole list; `read(target, "pointCurve", 3)`: one point, counted from 1.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `envelopeRead`.*

##### `ce.components.envelope.size(target [, name]) -> number|table`

Read how many elements a list has.

Example: `ce.components.envelope.size("Envelope")` gives the length of every list as a table.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `name` (text, optional): A list verb of this component, by name.<br>Left out: every list, as a table.<br>Not a list verb: rejected with a console error.

Good to know:

- `size(target)`: every list as a table, by verb name; `size(target, "pointCurve")`: one number.
- Returns the number.
- Rejected: no result, with a console error.

*Short name: `envelopeSize`.*

##### `ce.components.envelope.fill(target, name, values) -> boolean`

Write a whole list in one call.

Example: `ce.components.envelope.fill("Envelope", "pointX", {0.25, 0.5, 0.75})` writes points 1 to 3.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb: rejected with a console error.
- `values` (list, required): A list, one value per element from the first.<br>Longer than the list: rejected with a console error.<br>Not a list: rejected with a console error.

Good to know:

- One undo step for the whole list, instead of one per element.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeFill`.*

##### `ce.components.envelope.insert(target, name [, index]) -> boolean`

Add one element to a list.

Example: `ce.components.envelope.insert("Envelope", "pointCurve")` adds a point at the end.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot grow: rejected with a console error.
- `index` (number, optional): Position of the new element, counted from 1.<br>A fraction: rounded.<br>Left out: after the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The new element is the canvas's own template. Appended; with an index, inserted before that position, counted from 1.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeInsert`.*

##### `ce.components.envelope.remove(target, name [, index]) -> boolean`

Remove one element from a list.

Example: `ce.components.envelope.remove("Envelope", "pointCurve")` removes the last point.

- `target` (control name, required): The Envelope's control, by name.<br>Not an Envelope: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot shrink: rejected with a console error.
- `index` (number, optional): Element number, counted from 1.<br>A fraction: rounded.<br>Left out: the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The last; with an index, that one, counted from 1. An element the component needs stays: an envelope keeps its endpoints.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `envelopeRemove`.*

#### ce.components.split: Zone Splitter

Splits the keyboard into zones, each with its own channel and transpose.

##### `ce.components.split.preset(target, preset [, lowNote, highNote])`

Replace every zone with a layout: "whole", "classic", "splitLayer", "threeWay", "velLayer".

Example: `ce.components.split.preset("Split", "classic", "C2", "C6")` splits C2 to C6 in two halves.

- `preset` (text, required): "whole": one zone, channel 1.<br>"classic": the lower half on channel 1, an octave down; the upper half on channel 2.<br>"splitLayer": a bass below; two channels layered above.<br>"threeWay": bass, pad and lead across channels 1 to 3.<br>"velLayer": the same keys, played softly on channel 1 and hard on channel 2.<br>Case-insensitive.<br>Any other: rejected with a console error.
- `lowNote` (note, optional): The lowest note of the layout.<br>A MIDI note number, or a name such as "C4".<br>Range: 0 ↔ 127.<br>Outside the range: the nearest end.<br>Any other: rejected with a console error.<br>Left out: 36, C2.
- `highNote` (note, optional): The highest note of the layout.<br>A MIDI note number, or a name such as "C4".<br>Range: 0 ↔ 127.<br>Outside the range: the nearest end.<br>Any other: rejected with a console error.<br>Left out: 96, C7.<br>Below `lowNote`: the two are swapped.

Good to know:

- Returns true. Rejected: false, with a console error.

*Short name: `splitPreset`.*

##### `ce.components.split.mute(target, zone, enabled)`

Let one zone sound, or mute it.

Example: `ce.components.split.mute("Split", "Bass", false)` mutes the zone called Bass.

- `zone` (number, required): The zone: its number, counted from 1, as the panel labels it, or its name, in any case.<br>Not a zone: rejected with a console error naming them.
- `enabled` (true or false, required): true: it sounds.<br>false: muted.<br>Left out: it sounds.

Good to know:

- Returns true. Rejected: false, with a console error.

*Short name: `splitMute`.*

##### `ce.components.split.channel(target, zone, channel)`

Set the MIDI channel one zone plays on.

Example: `ce.components.split.channel("Split", 2, 5)` sends zone 2 on channel 5.

- `zone` (number, required): The zone: its number, counted from 1, as the panel labels it, or its name, in any case.<br>Not a zone: rejected with a console error naming them.
- `channel` (number, required): MIDI channel.<br>Range: 1 ↔ 16, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Not a number: rejected with a console error.

Good to know:

- Returns true. Rejected: false, with a console error.

*Short name: `splitChannel`.*

##### `ce.components.split.transpose(target, zone, semitones)`

Transpose one zone.

Example: `ce.components.split.transpose("Split", 1, -12)` plays zone 1 an octave down.

- `zone` (number, required): The zone: its number, counted from 1, as the panel labels it, or its name, in any case.<br>Not a zone: rejected with a console error naming them.
- `semitones` (number, required): Semitones: 12 an octave up.<br>Range: -48 ↔ 48, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Not a number: rejected with a console error.

Good to know:

- Returns true. Rejected: false, with a console error.

*Short name: `splitTranspose`.*

##### `ce.components.split.point(target, zone, note)`

Move the top note of one zone.

Example: `ce.components.split.point("Split", 1, "B3")` ends zone 1 at B3.

- `zone` (number, required): The zone: its number, counted from 1, as the panel labels it, or its name, in any case.<br>Not a zone: rejected with a console error naming them.
- `note` (note, required): Its new top note.<br>A MIDI note number, or a name such as "C4".<br>Range: 0 ↔ 127.<br>Outside the range: the nearest end.<br>Any other: rejected with a console error.

Good to know:

- A zone that starts just above it moves with it, as a drag of the split point does.
- Returns true. Rejected: false, with a console error.

*Short name: `splitPoint`.*

##### `ce.components.split.read(target [, field])`

Read the Zone Splitter's settings.

Example: `ce.components.split.read("Split", "zones")` gives the zones, each { label, lowNote, highNote, channel, transpose, enabled, … }.

- `field` (text, optional): A setting's name, in any case, such as "zones" or "lowNote".<br>Left out: every setting, as a table.<br>Not one of its settings: no result, with a console error naming them.

Good to know:

- Returns the value.

*Short name: `splitRead`.*


### Hands-on controls

Components you play with directly.

#### ce.components.ribbon: Ribbon

Drive a touch strip or wheel, such as a pitch or mod wheel: its value, its style, and where it goes when let go.

##### `ce.components.ribbon.value(target, value) -> boolean`

Set its position.

Example: `ce.components.ribbon.value("Ribbon", 0.75)` puts it three quarters of the way.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `value` (number, required): Position: 0 the start, 1 the end.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- `snap()` steps a drag, not this.
- Default: 0.5; a Mod Wheel's: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `ribbonValue`.*

##### `ce.components.ribbon.bipolar(target [, bipolar]) -> boolean`

Send its value as -1 to 1, as a pitch wheel does, or as 0 to 1.

Example: `ce.components.ribbon.bipolar("Ribbon")` switches the bipolar on if it is off, and off if it is on.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `bipolar` (true or false, optional): true: -1 at the start, 0 in the middle, 1 at the end; filled from the middle.<br>false: 0 to 1.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- The readout shows it the same way.
- Default: false; a Pitch Wheel's: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `ribbonBipolar`.*

##### `ce.components.ribbon.returnMode(target, returnMode) -> boolean`

Set where it goes when it is let go.

Example: `ce.components.ribbon.returnMode("Ribbon", "center")` springs back to the middle when let go.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `returnMode` (text, required): "none": it stays where it is let go.<br>"center": back to the middle.<br>"min": back to the start.<br>"max": back to the end.<br>"rest": back to `returnValue()`.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- On letting go of a drag: a script's value stays.
- Default: "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `ribbonReturnMode`.*

##### `ce.components.ribbon.returnValue(target, returnValue) -> boolean`

Set the position it goes back to with `returnMode()` "rest".

Example: `ce.components.ribbon.returnValue("Ribbon", 0.25)` goes back to a quarter of the way.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `returnValue` (number, required): Position: 0 the start, 1 the end.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `returnMode()` is "rest".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `ribbonReturnValue`.*

##### `ce.components.ribbon.returnTime(target, returnTime) -> boolean`

Set how long it takes to go back when let go.

Example: `ce.components.ribbon.returnTime("Ribbon", 500)` takes half a second to go back.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `returnTime` (number, required): Milliseconds for the whole way back.<br>0: at once.<br>Range: 0 ↔ 5000.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `returnMode()` is not "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `ribbonReturnTime`.*

##### `ce.components.ribbon.returnCurve(target, returnCurve) -> boolean`

Set how it moves on the way back.

Example: `ce.components.ribbon.returnCurve("Ribbon", "exp")` springs back fast, then settles.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `returnCurve` (text, required): "linear": at one speed.<br>"exp": fast, then settling, as a spring.<br>"ease": slow, fast, slow.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Only while `returnMode()` is not "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `ribbonReturnCurve`.*

##### `ce.components.ribbon.snap(target, snap) -> boolean`

Set the step a drag snaps to.

Example: `ce.components.ribbon.snap("Ribbon", 0.25)` snaps a drag to quarters.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `snap` (number, required): Part of the travel.<br>0: no snap.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- A drag only: `value()` is not snapped.
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `ribbonSnap`.*

##### `ce.components.ribbon.orientation(target, orientation) -> boolean`

Set which way it runs.

Example: `ce.components.ribbon.orientation("Ribbon", "horizontal")` runs it from left to right.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `orientation` (text, required): "vertical": from the bottom up.<br>"horizontal": from left to right.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "vertical".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `ribbonOrientation`.*

##### `ce.components.ribbon.style(target, style) -> boolean`

Set how it looks: a strip, a flat wheel, or a wheel drawn in 3D.

Example: `ce.components.ribbon.style("Ribbon", "wheel3d")` draws it as a wheel in 3D.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `style` (text, required): "ribbon": a touch strip.<br>"wheel": a flat wheel.<br>"wheel3d": a wheel drawn in 3D.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "ribbon"; a Pitch or Mod Wheel's: "wheel".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `ribbonStyle`.*

##### `ce.components.ribbon.label(target, label) -> boolean`

Set the caption under it.

Example: `ce.components.ribbon.label("Ribbon", "PITCH")` captions it PITCH.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `label` (text, required): The caption.<br>"": none.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `ribbonLabel`.*

##### `ce.components.ribbon.valuePrecision(target, valuePrecision) -> boolean`

Set how many decimal places the readout shows.

Example: `ce.components.ribbon.valuePrecision("Ribbon", 0)` shows the readout as a whole number.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `valuePrecision` (number, required): Decimal places.<br>Range: 0 ↔ 6, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The readout shows while `showValue()` is on.
- Default: 2.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `ribbonValuePrecision`.*

##### `ce.components.ribbon.editable(target [, editable]) -> boolean`

Let it be dragged, or not.

Example: `ce.components.ribbon.editable("Ribbon")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `editable` (true or false, optional): true: a drag moves it.<br>false: drags do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `ribbonEditable`.*

##### `ce.components.ribbon.showGlow(target [, showGlow]) -> boolean`

Show or hide the glow while it is held.

Example: `ce.components.ribbon.showGlow("Ribbon")` shows the glow if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `showGlow` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `ribbonShowGlow`.*

##### `ce.components.ribbon.showValue(target [, showValue]) -> boolean`

Show or hide the readout: its value as a number.

Example: `ce.components.ribbon.showValue("Ribbon")` shows the value if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `showValue` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- -1 to 1 while `bipolar()` is on.
- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `ribbonShowValue`.*

##### `ce.components.ribbon.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.ribbon.read("Ribbon")` gives every setting as a table.

- `target` (control name, required): The Ribbon's control, by name.<br>Not a Ribbon: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `ribbonRead`.*

#### ce.components.crossfader: Crossfader

Blend between two sides, A and B: the blend, how the two levels follow it, its centre snap, and where it goes when let go.

##### `ce.components.crossfader.mix(target, mix) -> boolean`

Set the blend between A and B.

Example: `ce.components.crossfader.mix("Crossfader", 0.25)` blends mostly A, a quarter B.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `mix` (number, required): Position: 0 all A, 0.5 the middle, 1 all B.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- `detent()` snaps a drag, not this.
- Default: 0.5.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `crossfaderMix`.*

##### `ce.components.crossfader.law(target, law) -> boolean`

Set how the levels of A and B follow the blend.

Example: `ce.components.crossfader.law("Crossfader", "linear")` makes the two levels add up to the whole.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `law` (text, required): "equalPower": constant loudness; each side at 71% (-3 dB) in the middle.<br>"linear": the two add up to 1; each side at half (-6 dB) in the middle.<br>"sharp": both full through the middle; a side cut only towards the far end.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "equalPower".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `crossfaderLaw`.*

##### `ce.components.crossfader.bipolar(target [, bipolar]) -> boolean`

Send the Mix output as -1 to 1, or as 0 to 1.

Example: `ce.components.crossfader.bipolar("Crossfader")` switches the bipolar on if it is off, and off if it is on.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `bipolar` (true or false, optional): true: -1 all A, 0 the middle, 1 all B.<br>false: 0 to 1.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- The A and B outputs, the two levels, are 0 to 1 either way.
- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `crossfaderBipolar`.*

##### `ce.components.crossfader.detent(target, detent) -> boolean`

Set how near the middle a drag snaps to it.

Example: `ce.components.crossfader.detent("Crossfader", 0.05)` snaps a drag within 5% of the middle to it.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `detent` (number, required): Distance from the middle, as part of the whole travel.<br>0: no snap.<br>0.5 or more: every drag lands in the middle.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- A drag only: `mix()` is not snapped.
- The inspector stops at 0.5.
- Default: 0.03.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `crossfaderDetent`.*

##### `ce.components.crossfader.returnMode(target, returnMode) -> boolean`

Set where it goes when it is let go.

Example: `ce.components.crossfader.returnMode("Crossfader", "center")` springs back to the middle when let go.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `returnMode` (text, required): "none": it stays where it is let go.<br>"center": back to the middle.<br>"min": back to all A.<br>"max": back to all B.<br>"rest": back to `returnValue()`.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- On letting go of a drag: a script's value stays.
- Default: "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `crossfaderReturnMode`.*

##### `ce.components.crossfader.returnValue(target, returnValue) -> boolean`

Set the blend it goes back to with `returnMode()` "rest".

Example: `ce.components.crossfader.returnValue("Crossfader", 0.25)` goes back to a quarter of the way.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `returnValue` (number, required): Position: 0 all A, 1 all B.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `returnMode()` is "rest".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `crossfaderReturnValue`.*

##### `ce.components.crossfader.returnTime(target, returnTime) -> boolean`

Set how long it takes to go back when let go.

Example: `ce.components.crossfader.returnTime("Crossfader", 500)` takes half a second to go back.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `returnTime` (number, required): Milliseconds for the whole way back.<br>0: at once.<br>Range: 0 ↔ 5000.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `returnMode()` is not "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `crossfaderReturnTime`.*

##### `ce.components.crossfader.returnCurve(target, returnCurve) -> boolean`

Set how it moves on the way back.

Example: `ce.components.crossfader.returnCurve("Crossfader", "exp")` springs back fast, then settles.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `returnCurve` (text, required): "linear": at one speed.<br>"exp": fast, then settling, as a spring.<br>"ease": slow, fast, slow.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Only while `returnMode()` is not "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `crossfaderReturnCurve`.*

##### `ce.components.crossfader.orientation(target, orientation) -> boolean`

Set which way the fader runs.

Example: `ce.components.crossfader.orientation("Crossfader", "vertical")` puts A at the bottom and B at the top.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `orientation` (text, required): "horizontal": A at the left.<br>"vertical": A at the bottom.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "horizontal".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `crossfaderOrientation`.*

##### `ce.components.crossfader.labelA(target, labelA) -> boolean`

Set the name shown at the A end.

Example: `ce.components.crossfader.labelA("Crossfader", "DRY")` names the A end DRY.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `labelA` (text, required): The name.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Shown while `showLabels()` is on.
- Default: "A".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `crossfaderLabelA`.*

##### `ce.components.crossfader.labelB(target, labelB) -> boolean`

Set the name shown at the B end.

Example: `ce.components.crossfader.labelB("Crossfader", "WET")` names the B end WET.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `labelB` (text, required): The name.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Shown while `showLabels()` is on.
- Default: "B".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `crossfaderLabelB`.*

##### `ce.components.crossfader.editable(target [, editable]) -> boolean`

Let the handle be dragged, or not.

Example: `ce.components.crossfader.editable("Crossfader")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `editable` (true or false, optional): true: a drag moves it.<br>false: drags do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `crossfaderEditable`.*

##### `ce.components.crossfader.showLabels(target [, showLabels]) -> boolean`

Show or hide the names at the two ends.

Example: `ce.components.crossfader.showLabels("Crossfader")` shows the labels if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `showLabels` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `crossfaderShowLabels`.*

##### `ce.components.crossfader.showGains(target [, showGains]) -> boolean`

Show or hide a bar for each side's level.

Example: `ce.components.crossfader.showGains("Crossfader")` shows the gains if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `showGains` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `crossfaderShowGains`.*

##### `ce.components.crossfader.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.crossfader.read("Crossfader")` gives every setting as a table.

- `target` (control name, required): The Crossfader's control, by name.<br>Not a Crossfader: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `crossfaderRead`.*

#### ce.components.joystick: Vector Joystick

Move a puck over a square, sending where it is on each axis and how near it is to each corner, and where it goes when let go.

##### `ce.components.joystick.move(target [, x] [, y]) -> boolean`

Move the puck to a point.

Example: `ce.components.joystick.move("VectorJoystick", 0.25, 0.75)` moves the puck to the upper left.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `x` (number, optional): Across: 0 the left, 1 the right.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Left out: unchanged.<br>Invalid: rejected with a console error.<br>Both left out: rejected with a console error.
- `y` (number, optional): Up: 0 the bottom, 1 the top.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Left out: unchanged.<br>Invalid: rejected with a console error.<br>Both left out: rejected with a console error.

Good to know:

- Sends x and y as `bipolar()` says, and each corner how near the puck is to it: 0 to 1, the four adding up to 1.
- Default: 0.5, 0.5.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `joystickMove`.*

##### `ce.components.joystick.bipolar(target [, bipolar]) -> boolean`

Send x and y as -1 to 1, or as 0 to 1.

Example: `ce.components.joystick.bipolar("VectorJoystick")` switches the bipolar on if it is off, and off if it is on.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `bipolar` (true or false, optional): true: -1 at the left or bottom, 0 in the middle, 1 at the right or top.<br>false: 0 to 1.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- The corners send 0 to 1 either way.
- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `joystickBipolar`.*

##### `ce.components.joystick.returnMode(target, returnMode) -> boolean`

Set where it goes when it is let go.

Example: `ce.components.joystick.returnMode("VectorJoystick", "center")` springs back to the middle when let go.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `returnMode` (text, required): "none": it stays where it is let go.<br>"center": back to the middle.<br>"min": back to 0 on each axis that goes back.<br>"max": back to 1 on each axis that goes back.<br>"rest": back to `returnValue()`.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- On letting go of a drag: a script's value stays.
- Default: "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `joystickReturnMode`.*

##### `ce.components.joystick.returnValue(target, returnValue) -> boolean`

Set the position it goes back to with `returnMode()` "rest".

Example: `ce.components.joystick.returnValue("VectorJoystick", 0.25)` goes back to a quarter of the way.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `returnValue` (number, required): Position on each axis that goes back: 0 the left or bottom, 1 the right or top.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `returnMode()` is "rest".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `joystickReturnValue`.*

##### `ce.components.joystick.returnTime(target, returnTime) -> boolean`

Set how long it takes to go back when let go.

Example: `ce.components.joystick.returnTime("VectorJoystick", 500)` takes half a second to go back.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `returnTime` (number, required): Milliseconds for the whole way back.<br>0: at once.<br>Range: 0 ↔ 5000.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `returnMode()` is not "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `joystickReturnTime`.*

##### `ce.components.joystick.returnCurve(target, returnCurve) -> boolean`

Set how it moves on the way back.

Example: `ce.components.joystick.returnCurve("VectorJoystick", "exp")` springs back fast, then settles.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `returnCurve` (text, required): "linear": at one speed.<br>"exp": fast, then settling, as a spring.<br>"ease": slow, fast, slow.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Only while `returnMode()` is not "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `joystickReturnCurve`.*

##### `ce.components.joystick.returnAxes(target, returnAxes) -> boolean`

Set which axes go back when the puck is let go.

Example: `ce.components.joystick.returnAxes("VectorJoystick", "x")` sends the puck back across, and leaves its height.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `returnAxes` (text, required): "both": both, in a straight line.<br>"x": across only.<br>"y": up and down only.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Only while `returnMode()` is not "none".
- Default: "both".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `joystickReturnAxes`.*

##### `ce.components.joystick.cornerLabel(target, index, text) -> boolean`

Name one corner, by its number.

Example: `ce.components.joystick.cornerLabel("VectorJoystick", 4, "Brass")` names the bottom right corner Brass.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `index` (number, required): Corner: 1 the top left, 2 the top right, 3 the bottom left, 4 the bottom right.<br>A fraction: rounded.<br>Not one of the corners: rejected with a console error.
- `text` (text, required): The name.<br>"": none.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Drawn while `showCorners()` is on.
- Default: "A", "B", "C" and "D".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `joystickCornerLabel`.*

##### `ce.components.joystick.editable(target [, editable]) -> boolean`

Let the puck be dragged, or not.

Example: `ce.components.joystick.editable("VectorJoystick")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `editable` (true or false, optional): true: a drag moves it.<br>false: drags do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `joystickEditable`.*

##### `ce.components.joystick.showGrid(target [, showGrid]) -> boolean`

Show or hide the grid behind the puck.

Example: `ce.components.joystick.showGrid("VectorJoystick")` shows the grid if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `showGrid` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- How many lines: set in the inspector, under Divisions.
- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `joystickShowGrid`.*

##### `ce.components.joystick.showCrosshair(target [, showCrosshair]) -> boolean`

Show or hide the lines through the puck.

Example: `ce.components.joystick.showCrosshair("VectorJoystick")` shows the crosshair if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `showCrosshair` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `joystickShowCrosshair`.*

##### `ce.components.joystick.showCorners(target [, showCorners]) -> boolean`

Show or hide the corners' marks and names.

Example: `ce.components.joystick.showCorners("VectorJoystick")` shows the corners if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `showCorners` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `joystickShowCorners`.*

##### `ce.components.joystick.showTrail(target [, showTrail]) -> boolean`

Show or hide the fading trail behind the puck.

Example: `ce.components.joystick.showTrail("VectorJoystick")` shows the trail if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `showTrail` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `joystickShowTrail`.*

##### `ce.components.joystick.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.joystick.read("VectorJoystick")` gives every setting as a table.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name. `read(target, "cornerLabel")`: the whole list; `read(target, "cornerLabel", 3)`: one corner, counted from 1.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `joystickRead`.*

##### `ce.components.joystick.size(target [, name]) -> number|table`

Read how many elements a list has.

Example: `ce.components.joystick.size("VectorJoystick")` gives the length of every list as a table.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `name` (text, optional): A list verb of this component, by name.<br>Left out: every list, as a table.<br>Not a list verb: rejected with a console error.

Good to know:

- `size(target)`: every list as a table, by verb name; `size(target, "cornerLabel")`: one number.
- Returns the number.
- Rejected: no result, with a console error.

*Short name: `joystickSize`.*

##### `ce.components.joystick.fill(target, name, values) -> boolean`

Write a whole list in one call.

Example: `ce.components.joystick.fill("VectorJoystick", "cornerLabel", {"One", "Two"})` writes corners 1 and 2.

- `target` (control name, required): The Vector Joystick's control, by name.<br>Not a Vector Joystick: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb: rejected with a console error.
- `values` (list, required): A list, one value per element from the first.<br>Longer than the list: rejected with a console error.<br>Not a list: rejected with a console error.

Good to know:

- One undo step for the whole list, instead of one per element.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `joystickFill`.*

#### ce.components.meter: Meter

Show a level on a bar or an arc: its value and range, scale, colour zones, peak marker, caption and readout.

##### `ce.components.meter.value(target, value) -> boolean`

Set the level shown, in the meter's own units.

Example: `ce.components.meter.value("Meter", 0.5)` fills the meter halfway while its range is 0 to 1.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `value` (number, required): The level, between `valueMin()` and `valueMax()`.<br>Outside them: drawn at the nearest end; the readout shows it as it is.<br>Invalid: rejected with a console error.

Good to know:

- While `source()` links a control, that control sets the value and its range.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterValue`.*

##### `ce.components.meter.scale(target, scale) -> boolean`

Set how the level is placed along the meter: in proportion, or in decibels.

Example: `ce.components.meter.scale("Meter", "db")` places the level in decibels.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `scale` (text, required): "linear": in proportion to the value.<br>"db": the value's part of its range as a level in decibels, the top of the range being 0 dB, placed between `dbFloor()` and `dbCeil()`.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "linear".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterScale`.*

##### `ce.components.meter.peakHold(target [, peakHold]) -> boolean`

Show or hide the peak marker: a line at the highest recent level.

Example: `ce.components.meter.peakHold("Meter")` switches the peak hold on if it is off, and off if it is on.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `peakHold` (true or false, optional): true: shown; it holds for `holdMs()`, then falls at `decay()`.<br>false: hidden.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterPeakHold`.*

##### `ce.components.meter.holdMs(target, holdMs) -> boolean`

Set how long the peak marker holds before it falls.

Example: `ce.components.meter.holdMs("Meter", 2000)` holds the peak for two seconds.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `holdMs` (number, required): Milliseconds.<br>0: it falls at once.<br>Range: 0 ↔ 60000.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 1200.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterHoldMs`.*

##### `ce.components.meter.decay(target, decay) -> boolean`

Set how fast the peak marker falls.

Example: `ce.components.meter.decay("Meter", 1)` drops the peak the meter's whole length in a second.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `decay` (number, required): Lengths of the meter per second.<br>0: it does not fall.<br>Range: 0 ↔ 100.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.4.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterDecay`.*

##### `ce.components.meter.valueMin(target, valueMin) -> boolean`

Set the value at which the meter is empty.

Example: `ce.components.meter.valueMin("Meter", -1)` empties the meter at -1.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `valueMin` (number, required): The value at the empty end.<br>Equal to `valueMax()`: the meter stays empty.<br>Above it: the meter fills the other way.<br>Range: -1000000000 ↔ 1000000000.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- While `source()` links a control, that control sets the value and its range.
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterValueMin`.*

##### `ce.components.meter.valueMax(target, valueMax) -> boolean`

Set the value at which the meter is full.

Example: `ce.components.meter.valueMax("Meter", 127)` fills the meter at 127.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `valueMax` (number, required): The value at the full end.<br>Equal to `valueMin()`: the meter stays empty.<br>Below it: the meter fills the other way.<br>Range: -1000000000 ↔ 1000000000.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- While `source()` links a control, that control sets the value and its range.
- Default: 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterValueMax`.*

##### `ce.components.meter.dbFloor(target, dbFloor) -> boolean`

Set the level in decibels at which the meter is empty, on a dB scale.

Example: `ce.components.meter.dbFloor("Meter", -48)` empties the meter at -48 dB.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `dbFloor` (number, required): Decibels.<br>Range: -200 ↔ 0.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `scale()` is "db".
- Default: -60.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterDbFloor`.*

##### `ce.components.meter.dbCeil(target, dbCeil) -> boolean`

Set the level in decibels at which the meter is full, on a dB scale.

Example: `ce.components.meter.dbCeil("Meter", 0)` fills the meter at 0 dB, the top of the value's range.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `dbCeil` (number, required): Decibels.<br>Above 0: the meter is not full at the top of the value's range.<br>Equal to `dbFloor()`: the meter stays empty; below it: the meter fills the other way.<br>Range: -200 ↔ 60.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `scale()` is "db".
- Default: 6.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterDbCeil`.*

##### `ce.components.meter.orientation(target, orientation) -> boolean`

Set which way the meter runs: across, up, or round an arc.

Example: `ce.components.meter.orientation("Meter", "vertical")` fills the meter from the bottom up.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `orientation` (text, required): "horizontal": left to right.<br>"vertical": bottom to top.<br>"arc": clockwise round an arc; its angles are set in the inspector, under Arc.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "horizontal".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterOrientation`.*

##### `ce.components.meter.gradient(target [, gradient]) -> boolean`

Blend the zone colours into each other, or step from one to the next.

Example: `ce.components.meter.gradient("Meter")` switches the gradient on if it is off, and off if it is on.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `gradient` (true or false, optional): true: blended.<br>false: each zone in its own colour.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: on; a Progress Bar's: off.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterGradient`.*

##### `ce.components.meter.label(target, label) -> boolean`

Set the caption shown with the meter.

Example: `ce.components.meter.label("Meter", "OUT")` captions the meter OUT.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `label` (text, required): The caption.<br>Shown above or below the meter, as `labelPosition()` says.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterLabel`.*

##### `ce.components.meter.labelPosition(target, labelPosition) -> boolean`

Set where the caption sits.

Example: `ce.components.meter.labelPosition("Meter", "below")` puts the caption under the meter.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `labelPosition` (text, required): "none": hidden.<br>"above": above the meter.<br>"below": below it.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Default: "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterLabelPosition`.*

##### `ce.components.meter.valuePrecision(target, valuePrecision) -> boolean`

Set how many decimal places the readout shows.

Example: `ce.components.meter.valuePrecision("Meter", 2)` shows the readout with two decimal places.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `valuePrecision` (number, required): Decimal places.<br>Range: 0 ↔ 6, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The readout shows while `showValue()` is on.
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterValuePrecision`.*

##### `ce.components.meter.valuePrefix(target, valuePrefix) -> boolean`

Set the text before the number in the readout and the scale labels.

Example: `ce.components.meter.valuePrefix("Meter", "Gain ")` shows the readout as Gain 1.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `valuePrefix` (text, required): The text.<br>On a dB scale, the scale labels say "dB" instead.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterValuePrefix`.*

##### `ce.components.meter.valueSuffix(target, valueSuffix) -> boolean`

Set the text after the number in the readout and the scale labels.

Example: `ce.components.meter.valueSuffix("Meter", " ms")` writes ms after the number.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `valueSuffix` (text, required): The text.<br>On a dB scale, the scale labels say "dB" instead.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterValueSuffix`.*

##### `ce.components.meter.zoneAt(target, index, from) -> boolean`

Set where a colour zone starts along the meter, by its number.

Example: `ce.components.meter.zoneAt("Meter", 2, 0.8)` starts zone 2 at 80% of the meter.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `index` (number, required): Zone number, counted from 1.<br>A fraction: rounded.<br>Not one of the zones: rejected with a console error.
- `from` (number, required): Part of the meter's length: 0 the empty end, 1 the full end.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- A zone colours the fill from its start up to the next zone's; the lowest also from 0.
- Their colours are set in the inspector, under Zones.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterZoneAt`.*

##### `ce.components.meter.source(target [, name]) -> boolean`

Name the control that drives the level.

Example: `ce.components.meter.source("Meter", "Volume")` makes the control called Volume drive the meter.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `name` (text, optional): The driving control's name.<br>Left out, or "": unlinked.<br>Its value and range are the meter's.<br>Not on this panel, or not a knob, slider or other range control: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.
- `read(target, "source")` gives the control's name.

*Short name: `meterSource`.*

##### `ce.components.meter.showTicks(target [, showTicks]) -> boolean`

Show or hide the tick marks along the meter.

Example: `ce.components.meter.showTicks("Meter")` shows the ticks if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `showTicks` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- How many divisions: set in the inspector, under Scale & readout. Default: 4.
- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterShowTicks`.*

##### `ce.components.meter.showScaleLabels(target [, showScaleLabels]) -> boolean`

Show or hide the values at the tick marks.

Example: `ce.components.meter.showScaleLabels("Meter")` shows the scale labels if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `showScaleLabels` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- On a dB scale in decibels; otherwise with `valuePrefix()` and `valueSuffix()`.
- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterShowScaleLabels`.*

##### `ce.components.meter.showValue(target [, showValue]) -> boolean`

Show or hide the readout: the value as a number.

Example: `ce.components.meter.showValue("Meter")` shows the value if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `showValue` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Written with `valuePrecision()`, `valuePrefix()` and `valueSuffix()`, as the value is: not in decibels.
- Default: hidden; a Progress Bar's: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterShowValue`.*

##### `ce.components.meter.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.meter.read("Meter")` gives every setting as a table.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name. `read(target, "zoneAt")`: the whole list; `read(target, "zoneAt", 3)`: one zone, counted from 1.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `meterRead`.*

##### `ce.components.meter.size(target [, name]) -> number|table`

Read how many elements a list has.

Example: `ce.components.meter.size("Meter")` gives the length of every list as a table.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `name` (text, optional): A list verb of this component, by name.<br>Left out: every list, as a table.<br>Not a list verb: rejected with a console error.

Good to know:

- `size(target)`: every list as a table, by verb name; `size(target, "zoneAt")`: one number.
- Returns the number.
- Rejected: no result, with a console error.

*Short name: `meterSize`.*

##### `ce.components.meter.fill(target, name, values) -> boolean`

Write a whole list in one call.

Example: `ce.components.meter.fill("Meter", "zoneAt", {0.25, 0.5, 0.75})` writes zones 1 to 3.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb: rejected with a console error.
- `values` (list, required): A list, one value per element from the first.<br>Longer than the list: rejected with a console error.<br>Not a list: rejected with a console error.

Good to know:

- One undo step for the whole list, instead of one per element.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterFill`.*

##### `ce.components.meter.insert(target, name [, index]) -> boolean`

Add one element to a list.

Example: `ce.components.meter.insert("Meter", "zoneAt")` adds a zone at the end.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot grow: rejected with a console error.
- `index` (number, optional): Position of the new element, counted from 1.<br>A fraction: rounded.<br>Left out: after the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The new element is the canvas's own template. Appended; with an index, inserted before that position, counted from 1.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterInsert`.*

##### `ce.components.meter.remove(target, name [, index]) -> boolean`

Remove one element from a list.

Example: `ce.components.meter.remove("Meter", "zoneAt")` removes the last zone.

- `target` (control name, required): The Meter's control, by name.<br>Not a Meter: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb, or a list that cannot shrink: rejected with a console error.
- `index` (number, optional): Element number, counted from 1.<br>A fraction: rounded.<br>Left out: the last.<br>Not one the list has: rejected with a console error.

Good to know:

- The last; with an index, that one, counted from 1. An element the component needs stays: an envelope keeps its endpoints.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `meterRemove`.*


### Displays

Components that show something rather than set it.

#### ce.components.lcd: LCD Display

Write to a character LCD by layout, row and column, plus backlight, brightness and scrolling.

##### `ce.components.lcd.text(target, at, text) -> boolean`

Write one row of the display.

Example: `ce.components.lcd.text("Screen", 1, "PATCH 12")` writes PATCH 12 on the first row.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `at` (number or table, required): Row, counted from 1, of the layout showing.<br>Or a table: {layout = 2, row = 4, col = 15}, `layout` and `col` optional.<br>`layout`: its number, counted from 1, or its name. Left out: the layout showing.<br>`col`: written from that column on, the rest of the row kept.<br>`col` as a range {5, 10}: written into those columns, padded with blanks or cut.<br>A fraction: rounded.<br>A range past the display: to its last column.<br>Not on the display: rejected with a console error.
- `text` (text, required): The text.<br>Longer than the display: cut at its width, with a console warning the first time.<br>On a display without layouts that scrolls: scrolled in instead.<br>A character the display cannot draw: a blank cell, with a console warning the first time.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- On a display with layouts: written on the layout, shown where no zone paints.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdText`.*

##### `ce.components.lcd.clear(target [, at]) -> boolean`

Blank the layout showing, or part of it.

Example: `ce.components.lcd.clear("Screen")` blanks the display.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `at` (number or table, optional): Row, counted from 1, of the layout showing.<br>Or a table: {layout = 2, row = 4, col = 15}, each part optional.<br>`layout`: its number, counted from 1, or its name. Left out: the layout showing.<br>`row`, `col`: a number, or a range {5, 10}. Left out: every row, every column.<br>A fraction: rounded.<br>A range past the display: to its last row or column.<br>Left out: the whole layout showing.<br>Not on the display: rejected with a console error.

Good to know:

- Only text is blanked: a zone still shows its control.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdClear`.*

##### `ce.components.lcd.backlight(target [, backlight]) -> boolean`

Switch the backlight on or off.

Example: `ce.components.lcd.backlight("Screen")` switches the backlight on if it is off, and off if it is on.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `backlight` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdBacklight`.*

##### `ce.components.lcd.brightness(target, brightness) -> boolean`

Set the brightness of the lit segments or pixels.

Example: `ce.components.lcd.brightness("Screen", 80)` sets the brightness to 80.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `brightness` (number, required): How bright the lit characters are.<br>Range: 0 ↔ 100.<br>0: the dimmest, still lit.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- While `brightnessSource()` links a control, that control sets the brightness.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdBrightness`.*

##### `ce.components.lcd.contrast(target, contrast) -> boolean`

Set the contrast, which is how visible the unlit segments are.

Example: `ce.components.lcd.contrast("Screen", 55)` sets the contrast to 55.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `contrast` (number, required): How visible the unlit segments are.<br>Also how strongly the backlight glows.<br>Range: 0 ↔ 100.<br>0: unlit segments hidden.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdContrast`.*

##### `ce.components.lcd.scroll(target, scroll) -> boolean`

Set which way the rows scroll, or stop them scrolling.

Example: `ce.components.lcd.scroll("Screen", "left")` scrolls the rows to the left.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `scroll` (text, required): One of "off", "left" or "right". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Only a row longer than the display moves.
- On a display with layouts: no effect. A zone set to scroll does so at `scrollSpeed()`.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdScroll`.*

##### `ce.components.lcd.scrollSpeed(target, scrollSpeed) -> boolean`

Set the scrolling speed, in characters per second.

Example: `ce.components.lcd.scrollSpeed("Screen", 30)` sets the scroll speed to 30.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `scrollSpeed` (number, required): Characters per second.<br>Range: 0 ↔ 60.<br>0: no scrolling.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdScrollSpeed`.*

##### `ce.components.lcd.blink(target [, blink]) -> boolean`

Switch the text blinking on or off.

Example: `ce.components.lcd.blink("Screen", true)` makes the text blink.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `blink` (true or false, optional): true: the text blinks.<br>false: the text is steady.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Only the text blinks: the backlight, the unlit segments, the cursor, images and animations stay.
- The speed is set by `blinkRate()`. Default: 500 ms on, then 500 ms off.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdBlink`.*

##### `ce.components.lcd.cursor(target, cursor) -> boolean`

Set the cursor's shape, or hide it.

Example: `ce.components.lcd.cursor("Screen", "block")` shows a block cursor.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `cursor` (text, required): One of "off", "block" or "underline". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdCursor`.*

##### `ce.components.lcd.cursorAt(target [, col] [, row]) -> boolean`

Put the cursor on a cell.

Example: `ce.components.lcd.cursorAt("Screen", 5, 2)` puts the cursor on column 5 of row 2.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `col` (number, optional): Column, counted from 1.<br>Range: 1 ↔ the display's columns.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Left out: unchanged.<br>Invalid: rejected with a console error.<br>Both left out: rejected with a console error.
- `row` (number, optional): Row, counted from 1.<br>Range: 1 ↔ the display's rows.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Left out: unchanged.<br>Invalid: rejected with a console error.<br>Both left out: rejected with a console error.

Good to know:

- The cursor shows only when `cursor()` is set to "block" or "underline". Default: "off".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdCursorAt`.*

##### `ce.components.lcd.value(target, value) -> boolean`

Set the value the {value}, {pct} and {bar} tokens show.

Example: `ce.components.lcd.value("Screen", 64)` shows 64 wherever a row has {value}.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `value` (number, required): The number shown.<br>Outside valueMin ↔ valueMax: shown as it is; `{pct}` and `{bar}` stop at the ends.<br>Invalid: rejected with a console error.

Good to know:

- While `valueSource()` links a control, that control sets the value and its range.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdValue`.*

##### `ce.components.lcd.anim(target, anim) -> boolean`

Set the animation behind the text of a graphic display: off, a file, or a preset.

Example: `ce.components.lcd.anim("Screen", "preset")` plays the chosen preset animation.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `anim` (text, required): One of "off", "file" or "preset". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdAnim`.*

##### `ce.components.lcd.animPreset(target, animPreset) -> boolean`

Choose the preset animation.

Example: `ce.components.lcd.animPreset("Screen", "rain")` plays the rain animation.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `animPreset` (text, required): One of "wave", "scanner", "rain", "starfield", "spinner" or "plasma". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Plays only on a graphic display, while `anim()` is "preset".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdAnimPreset`.*

##### `ce.components.lcd.animSpeed(target, animSpeed) -> boolean`

Set the speed of the preset animation, as a multiple of its normal speed.

Example: `ce.components.lcd.animSpeed("Screen", 2)` plays the preset animation at twice its normal speed.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `animSpeed` (number, required): Speed factor.<br>Range: 0.1 ↔ 5.<br>1: normal.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdAnimSpeed`.*

##### `ce.components.lcd.animFps(target, animFps) -> boolean`

Set the frame rate of a sprite-sheet animation.

Example: `ce.components.lcd.animFps("Screen", 24)` plays the sheet at 24 frames per second.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `animFps` (number, required): Frames per second.<br>Only for a sprite sheet: a GIF or APNG plays at its own speed.<br>Range: 1 ↔ 120.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdAnimFps`.*

##### `ce.components.lcd.animLoop(target [, animLoop]) -> boolean`

Switch looping of the animation on or off.

Example: `ce.components.lcd.animLoop("Screen")` switches the anim loop on if it is off, and off if it is on.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `animLoop` (true or false, optional): Left out: toggles.<br>false: the last frame holds.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdAnimLoop`.*

##### `ce.components.lcd.scrollMode(target, scrollMode) -> boolean`

Set whether scrolled text loops round or bounces.

Example: `ce.components.lcd.scrollMode("Screen", "bounce")` bounces the text between its ends.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `scrollMode` (text, required): One of "loop" or "bounce". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdScrollMode`.*

##### `ce.components.lcd.scrollRepeat(target, scrollRepeat) -> boolean`

Set how many times the text scrolls through.

Example: `ce.components.lcd.scrollRepeat("Screen", 3)` scrolls the text through three times, then stops.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `scrollRepeat` (number, required): Number of times.<br>Range: 0 ↔ 999, whole.<br>0: forever.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdScrollRepeat`.*

##### `ce.components.lcd.blinkRate(target, blinkRate) -> boolean`

Set how fast the text blinks.

Example: `ce.components.lcd.blinkRate("Screen", 250)` shows the text for 250 ms, then hides it for 250 ms: two blinks a second.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `blinkRate` (number, required): Time on, then the same time off, in milliseconds.<br>Range: 60 ↔ 5000.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Has an effect only while `blink()` is on. Default: off.
- The cursor blinks at its own fixed speed.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdBlinkRate`.*

##### `ce.components.lcd.cursorBlink(target [, cursorBlink]) -> boolean`

Switch blinking of the cursor on or off.

Example: `ce.components.lcd.cursorBlink("Screen")` switches the cursor blink on if it is off, and off if it is on.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `cursorBlink` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdCursorBlink`.*

##### `ce.components.lcd.valueMin(target, valueMin) -> boolean`

Set the low end of the value's range, for the {pct} and {bar} tokens.

Example: `ce.components.lcd.valueMin("Screen", 0)` makes 0 the empty end of the bar.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `valueMin` (number, required): Value min.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdValueMin`.*

##### `ce.components.lcd.valueMax(target, valueMax) -> boolean`

Set the high end of the value's range, for the {pct} and {bar} tokens.

Example: `ce.components.lcd.valueMax("Screen", 127)` makes 127 the full end of the bar.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `valueMax` (number, required): Value max.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdValueMax`.*

##### `ce.components.lcd.valuePrecision(target, valuePrecision) -> boolean`

Set how many decimal places the value shows.

Example: `ce.components.lcd.valuePrecision("Screen", 2)` shows the value with two decimal places.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `valuePrecision` (number, required): Decimal places `{value}` shows. `{pct}` is always whole.<br>Range: 0 ↔ 6, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdValuePrecision`.*

##### `ce.components.lcd.valuePrefix(target, valuePrefix) -> boolean`

Set the text written before the value.

Example: `ce.components.lcd.valuePrefix("Screen", "Vol ")` shows the value as Vol 64.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `valuePrefix` (text, required): Text before the number in `{value}`. Not used by `{pct}` or `{bar}`.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdValuePrefix`.*

##### `ce.components.lcd.valueSuffix(target, valueSuffix) -> boolean`

Set the text written after the value.

Example: `ce.components.lcd.valueSuffix("Screen", " dB")` shows the value as 64 dB.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `valueSuffix` (text, required): Text after the number in `{value}`. Not used by `{pct}` or `{bar}`.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdValueSuffix`.*

##### `ce.components.lcd.valueSource(target [, name]) -> boolean`

Name the control that drives the value.

Example: `ce.components.lcd.valueSource("Screen", "Cutoff")` makes the control called Cutoff drive the value.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `name` (text, optional): The driving control's name.<br>Left out, or "": unlinked.<br>Not on this panel, or not a knob, slider or other range control: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.
- `read(target, "valueSource")` gives the control's name.

*Short name: `lcdValueSource`.*

##### `ce.components.lcd.brightnessSource(target [, name]) -> boolean`

Name the control that drives the brightness.

Example: `ce.components.lcd.brightnessSource("Screen", "Cutoff")` makes the control called Cutoff drive the brightness.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `name` (text, optional): The driving control's name.<br>Left out, or "": unlinked.<br>Not on this panel, or not a knob, slider or other range control: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.
- `read(target, "brightnessSource")` gives the control's name.

*Short name: `lcdBrightnessSource`.*

##### `ce.components.lcd.backlightSource(target [, name]) -> boolean`

Name the control that drives the backlight.

Example: `ce.components.lcd.backlightSource("Screen", "Light")` makes the control called Light switch the backlight.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `name` (text, optional): The driving control's name.<br>Left out, or "": unlinked.<br>On while the control is on, or past halfway.<br>Not on this panel: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.
- `read(target, "backlightSource")` gives the control's name.

*Short name: `lcdBacklightSource`.*

##### `ce.components.lcd.glyph(target, index, bits) -> boolean`

Define one of the eight user glyphs.

Example: `ce.components.lcd.glyph("Screen", 1, ".#.#.|#####|#####|.###.|..#..|.....|.....|.....")` puts a heart in slot 1, shown in a row by \x00.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `index` (number, required): Glyph slot.<br>Range: 1 ↔ 8.<br>A fraction: rounded.<br>Outside the range: rejected with a console error.
- `bits` (text, required): Eight rows of five: "#" lit, "." unlit, rows separated by "|".<br>Shown in a row by \x00 to \x07 for slots 1 to 8.<br>"1" and "0": the same as "#" and ".".<br>Fewer than eight rows, or fewer than five cells in a row: the rest unlit.<br>Empty, or nothing lit: the slot is cleared.<br>Other characters: rejected with a console error.<br>More than eight rows, or a row longer than five: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdGlyph`.*

##### `ce.components.lcd.editText(target, editText) -> boolean`

Set the text in the display's editable field.

Example: `ce.components.lcd.editText("Screen", "INIT VOICE")` puts INIT VOICE in the field.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `editText` (text, required): The text in the field.<br>Not held to the field's characters or length: those apply to typing.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- `read(target, "editText")` gives what is in the field, typed at the screen or set here.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdEditText`.*

##### `ce.components.lcd.zoneText(target, name, text) -> boolean`

Set the text of a fixed-text zone, by its name.

Example: `ce.components.lcd.zoneText("Screen", "Title", "VOL")` writes VOL in the zone called Title.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `name` (text, required): The zone's name, as given in the zone table. Case-insensitive.<br>Every zone with that name, on every layout.<br>Not a zone of the display: rejected with a console error.
- `text` (text, required): The text.<br>Shown by a zone that shows fixed text.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdZoneText`.*

##### `ce.components.lcd.zoneLabel(target, name, label) -> boolean`

Set the name a name zone shows in place of its control's, by its name.

Example: `ce.components.lcd.zoneLabel("Screen", "Cutoff", "CUT")` shows CUT in the zone called Cutoff, in place of the control's name.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `name` (text, required): The zone's name, as given in the zone table. Case-insensitive.<br>Every zone with that name, on every layout.<br>Not a zone of the display: rejected with a console error.
- `label` (text, required): The name shown.<br>"": the control's own name.<br>Shown by a zone that shows a name.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdZoneLabel`.*

##### `ce.components.lcd.zoneShow(target, name [, on]) -> boolean`

Show or hide a zone, by its name.

Example: `ce.components.lcd.zoneShow("Screen", "Cutoff")` hides the zone called Cutoff if it is shown, and shows it if it is hidden.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `name` (text, required): The zone's name, as given in the zone table. Case-insensitive.<br>Every zone with that name, on every layout.<br>Not a zone of the display: rejected with a console error.
- `on` (true or false, optional): true: shown.<br>false: hidden; the layout's text shows through.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdZoneShow`.*

##### `ce.components.lcd.zoneAt(target, name, place) -> boolean`

Move a zone, by its name.

Example: `ce.components.lcd.zoneAt("Screen", "Cutoff", {row = 2, col = {1, 8}})` moves the zone called Cutoff to columns 1 to 8 of row 2.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `name` (text, required): The zone's name, as given in the zone table. Case-insensitive.<br>Every zone with that name, on every layout.<br>Not a zone of the display: rejected with a console error.
- `place` (number or table, required): A table: {row = 2, col = {1, 8}}, each part optional.<br>`row`: one row, counted from 1.<br>`col`: the first column, the zone keeping its width up to the display's edge; or a range {1, 8}.<br>A row number alone: the row.<br>A part left out: unchanged.<br>A fraction: rounded.<br>A range past the display: to its last column.<br>Not on the display: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdZoneAt`.*

##### `ce.components.lcd.zoneSource(target, name, control) -> boolean`

Link a zone to another control, by its name.

Example: `ce.components.lcd.zoneSource("Screen", "Cutoff", "Resonance")` makes the zone called Cutoff show the control called Resonance.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `name` (text, required): The zone's name, as given in the zone table. Case-insensitive.<br>Every zone with that name, on every layout.<br>Not a zone of the display: rejected with a console error.
- `control` (text, required): The control's name. Case-insensitive.<br>"": unlinked.<br>"@active": the control last touched.<br>"@active#value", "@active#switch" or "@active#choice": the last of that kind.<br>"@edit": the display's editable field.<br>This display, or not on this panel: rejected with a console error.<br>Left out: rejected with a console error.

Good to know:

- `read(target, "zoneSource", "Cutoff")` gives the control's name.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdZoneSource`.*

##### `ce.components.lcd.zoneKind(target, name, kind) -> boolean`

Set what a zone shows, by its name.

Example: `ce.components.lcd.zoneKind("Screen", "Cutoff", "bar")` makes the zone called Cutoff show its control as a bar.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `name` (text, required): The zone's name, as given in the zone table. Case-insensitive.<br>Every zone with that name, on every layout.<br>Not a zone of the display: rejected with a console error.
- `kind` (text, required): One of "static", "name", "value", "pct", "bar", "midiValue", "note", "text", "state", "address", "edit", "hbar", "vbar", "hslider", "vslider" or "needle". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdZoneKind`.*

##### `ce.components.lcd.layout(target, layout) -> boolean`

Show one of the display's layouts.

Example: `ce.components.lcd.layout("Screen", 2)` shows layout 2.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `layout` (number or name, required): Its number, counted from 1, or its name.<br>A name: case-insensitive.<br>A fraction: rounded.<br>A display without layouts: 1, its own rows.<br>Not a layout of the display: rejected with a console error.

Good to know:

- Shown as a soft key shows it: until a soft key, an overlay or the Selector changes it, or its own timeout returns it.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.
- `read(target, "layout")` gives the number of the layout showing.

*Short name: `lcdLayout`.*

##### `ce.components.lcd.showGlass(target [, showGlass]) -> boolean`

Show or hide the glass: a sheen across the screen.

Example: `ce.components.lcd.showGlass("Screen")` shows the glass if it is hidden, and hides it if it is shown.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `showGlass` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Its tint is set in the inspector, under Colour ▸ Glass. Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdShowGlass`.*

##### `ce.components.lcd.showGhost(target [, showGhost]) -> boolean`

Show or hide the ghost: the faint unlit cells behind the text.

Example: `ce.components.lcd.showGhost("Screen")` shows the ghost if it is hidden, and hides it if it is shown.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `showGhost` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- How faint is set by `contrast()`. Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdShowGhost`.*

##### `ce.components.lcd.showScanlines(target [, showScanlines]) -> boolean`

Show or hide the scanlines: thin horizontal lines across the screen.

Example: `ce.components.lcd.showScanlines("Screen")` shows the scanlines if they are hidden, and hides them if they are shown.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `showScanlines` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdShowScanlines`.*

##### `ce.components.lcd.showGrid(target [, showGrid]) -> boolean`

Show or hide the grid: faint lines between the cells or pixels.

Example: `ce.components.lcd.showGrid("Screen")` shows the grid if it is hidden, and hides it if it is shown.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `showGrid` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdShowGrid`.*

##### `ce.components.lcd.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.lcd.read("Screen")` gives every setting as a table.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>For "text": a row or a table, as `text()` takes it.<br>For a zone verb, such as "zoneText": the zone's name, case-insensitive.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name. `read(target, "glyph")`: the whole list; `read(target, "glyph", 3)`: one glyph, counted from 1. `read(target, "zoneText")`: every zone's, by name; `read(target, "zoneText", "Title")`: one zone's.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `lcdRead`.*

##### `ce.components.lcd.size(target [, name]) -> number|table`

Read how many elements a list has.

Example: `ce.components.lcd.size("Screen")` gives the length of every list as a table.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `name` (text, optional): A list verb of this component, by name.<br>Left out: every list, as a table.<br>Not a list verb: rejected with a console error.

Good to know:

- `size(target)`: every list as a table, by verb name; `size(target, "glyph")`: one number.
- Returns the number.
- Rejected: no result, with a console error.

*Short name: `lcdSize`.*

##### `ce.components.lcd.fill(target, name, values) -> boolean`

Write a whole list in one call.

Example: `ce.components.lcd.fill("Screen", "text", {"PATCH 12", "VOL 100"})` writes rows 1 and 2.

- `target` (control name, required): The LCD Display's control, by name.<br>Not an LCD Display: rejected with a console error.
- `name` (text, required): A list verb of this component, by name.<br>Not a list verb: rejected with a console error.
- `values` (list, required): A list, one value per element from the first.<br>Longer than the list: rejected with a console error.<br>Not a list: rejected with a console error.

Good to know:

- One undo step for the whole list, instead of one per element.
- Returns true.
- Rejected: false, with a console error. Nothing changes.

*Short name: `lcdFill`.*

#### ce.components.pixel: Pixel Display

Draw on a pixel screen by named elements: what each is, shows and where, plus its layouts, backlight, brightness and animation.

##### `ce.components.pixel.text(target, name, text) -> boolean`

Set the text of a "static" element, by its name.

Example: `ce.components.pixel.text("Screen", "Title", "INIT VOICE")` writes INIT VOICE in the element called Title.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `name` (text, required): The element's name, as given in the element table. Case-insensitive.<br>Every element with that name, on every layout.<br>Not an element of the display: rejected with a console error.
- `text` (text, required): The text.<br>Shown by "static", between its prefix and suffix.<br>Shown by "name" while it has no label and no control, and by "edit" while its control has no text.<br>"\n": a new line while the element wraps; a blank otherwise.<br>A character the font cannot draw: a blank. The built-in font has none for $ & ^ ` { | } ~ and letters with accents.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelText`.*

##### `ce.components.pixel.label(target, name, label) -> boolean`

Set an element's caption, or the name a "name" element shows, by its name.

Example: `ce.components.pixel.label("Screen", "Cutoff", "CUT")` shows CUT under the element called Cutoff.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `name` (text, required): The element's name, as given in the element table. Case-insensitive.<br>Every element with that name, on every layout.<br>Not an element of the display: rejected with a console error.
- `label` (text, required): The text.<br>"name": shown in place of its control's name; "": the control's name.<br>"hbar", "vbar", "hslider", "vslider", "needle", "wave", "scope" and "adsr": a caption 7 pixels high, centred under it, or above it when there is no room below; "": none.<br>Other kinds: not shown.<br>A character the font cannot draw: a blank.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelLabel`.*

##### `ce.components.pixel.show(target, name [, on]) -> boolean`

Show or hide an element, by its name.

Example: `ce.components.pixel.show("Screen", "Title")` hides the element called Title if it is shown, and shows it if it is hidden.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `name` (text, required): The element's name, as given in the element table. Case-insensitive.<br>Every element with that name, on every layout.<br>Not an element of the display: rejected with a console error.
- `on` (true or false, optional): true: shown.<br>false: hidden.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelShow`.*

##### `ce.components.pixel.blink(target, name [, on]) -> boolean`

Make an element blink, by its name.

Example: `ce.components.pixel.blink("Screen", "Title")` makes the element called Title blink if it is steady, and steady if it blinks.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `name` (text, required): The element's name, as given in the element table. Case-insensitive.<br>Every element with that name, on every layout.<br>Not an element of the display: rejected with a console error.
- `on` (true or false, optional): true: blinks: 530 ms shown, 530 ms hidden.<br>false: steady.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Every blinking element blinks in step. A hidden element does not blink.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelBlink`.*

##### `ce.components.pixel.x(target, name, x) -> boolean`

Set an element's left edge, by its name.

Example: `ce.components.pixel.x("Screen", "Title", 10)` puts the element called Title 10 pixels from the screen's left edge.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `name` (text, required): The element's name, as given in the element table. Case-insensitive.<br>Every element with that name, on every layout.<br>Not an element of the display: rejected with a console error.
- `x` (number, required): Pixels of the grid, from the screen's left edge; 0: at the edge.<br>Range: -4096 ↔ 4096, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Off the screen, wholly or in part: that part is not drawn. The grid is set in the inspector, under Grid: 128 × 64 by default.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelX`.*

##### `ce.components.pixel.y(target, name, y) -> boolean`

Set an element's top edge, by its name.

Example: `ce.components.pixel.y("Screen", "Title", 20)` puts the element called Title 20 pixels below the screen's top edge.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `name` (text, required): The element's name, as given in the element table. Case-insensitive.<br>Every element with that name, on every layout.<br>Not an element of the display: rejected with a console error.
- `y` (number, required): Pixels of the grid, from the screen's top edge; 0: at the edge.<br>Range: -4096 ↔ 4096, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Off the screen, wholly or in part: that part is not drawn. The grid is set in the inspector, under Grid: 128 × 64 by default.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelY`.*

##### `ce.components.pixel.w(target, name, w) -> boolean`

Set an element's width, by its name.

Example: `ce.components.pixel.w("Screen", "Title", 64)` makes the element called Title 64 pixels wide.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `name` (text, required): The element's name, as given in the element table. Case-insensitive.<br>Every element with that name, on every layout.<br>Not an element of the display: rejected with a console error.
- `w` (number, required): Pixels of the grid.<br>A text kind: the box its text is aligned and cut in; 0: as wide as the text.<br>Any other kind: its width; drawn at least 1 wide, 4 for "anim".<br>Range: 0 ↔ 4096, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The text kinds: "static", "name", "value", "pct", "midiValue", "note", "text", "state", "edit", "icon" and "clock".
- A text kind 0 wide is not wrapped or scrolled.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelW`.*

##### `ce.components.pixel.h(target, name, h) -> boolean`

Set an element's height, by its name.

Example: `ce.components.pixel.h("Screen", "Title", 16)` draws the text of the element called Title at twice the size.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `name` (text, required): The element's name, as given in the element table. Case-insensitive.<br>Every element with that name, on every layout.<br>Not an element of the display: rejected with a console error.
- `h` (number, required): Pixels of the grid.<br>A text kind: the size of its letters. The built-in font: 1× below 16, 2× from 16, 3× from 24, and on by 8. A custom font: by its glyph height.<br>Any other kind: its height; drawn at least 1 high, 4 for "anim".<br>Range: 0 ↔ 4096, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The text kinds: "static", "name", "value", "pct", "midiValue", "note", "text", "state", "edit", "icon" and "clock".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelH`.*

##### `ce.components.pixel.kind(target, name, kind) -> boolean`

Set what an element is, by its name.

Example: `ce.components.pixel.kind("Screen", "Cutoff", "vbar")` makes the element called Cutoff a vertical bar.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `name` (text, required): The element's name, as given in the element table. Case-insensitive.<br>Every element with that name, on every layout.<br>Not an element of the display: rejected with a console error.
- `kind` (text, required): One of "static", "name", "value", "pct", "midiValue", "note", "text", "state", "edit", "icon", "clock", "hbar", "vbar", "hslider", "vslider", "needle", "wave", "scope", "adsr", "anim" or "bitmap". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Its other settings are kept: its place, size, text and source.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelKind`.*

##### `ce.components.pixel.source(target, name, control) -> boolean`

Link an element to a control, by its name.

Example: `ce.components.pixel.source("Screen", "Cutoff", "Resonance")` makes the element called Cutoff show the control called Resonance.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `name` (text, required): The element's name, as given in the element table. Case-insensitive.<br>Every element with that name, on every layout.<br>Not an element of the display: rejected with a console error.
- `control` (text, required): The control's name. Case-insensitive.<br>"": unlinked.<br>"@active": the control last touched.<br>"@active#value", "@active#switch" or "@active#choice": the last of that kind.<br>"@edit": the display's editable field.<br>This display, or not on this panel: rejected with a console error.<br>Left out: rejected with a console error.

Good to know:

- Shown by the text kinds but "static", "icon" and "clock"; drives the bars, sliders and "needle", "wave"'s level and "scope". Not used by "adsr", "anim" or "bitmap".
- "wave"'s cutoff, resonance, LFO and pitch, and "adsr"'s four: set in the inspector.
- `read(target, "source", "Cutoff")` gives the control's name.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelSource`.*

##### `ce.components.pixel.editText(target, editText) -> boolean`

Set the text in the display's editable field.

Example: `ce.components.pixel.editText("Screen", "INIT VOICE")` puts INIT VOICE in the field.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `editText` (text, required): The text in the field.<br>Shown by an "edit" element linked to "@edit".<br>Not held to the field's characters or length: those apply to typing.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- `read(target, "editText")` gives what is in the field, typed at the screen or set here.
- Default: "INIT".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelEditText`.*

##### `ce.components.pixel.backlight(target [, backlight]) -> boolean`

Switch the backlight on or off.

Example: `ce.components.pixel.backlight("Screen")` switches the backlight on if it is off, and off if it is on.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `backlight` (true or false, optional): true: the backlight colour washes the screen.<br>false: off.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- While `backlightSource()` links a control, that control switches it.
- Default: on.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelBacklight`.*

##### `ce.components.pixel.brightness(target, brightness) -> boolean`

Set how bright the lit pixels are.

Example: `ce.components.pixel.brightness("Screen", 80)` sets the brightness to 80.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `brightness` (number, required): How bright the lit pixels are.<br>Range: 0 ↔ 100.<br>0: the dimmest, still lit: a tenth as bright.<br>Shaped by `gamma()`.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- While `brightnessSource()` links a control, that control sets the brightness.
- Default: 100.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelBrightness`.*

##### `ce.components.pixel.contrast(target, contrast) -> boolean`

Set the contrast: how visible the unlit pixels are.

Example: `ce.components.pixel.contrast("Screen", 55)` sets the contrast to 55.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `contrast` (number, required): How visible the unlit pixels are.<br>Also how strongly the backlight glows.<br>Range: 0 ↔ 100.<br>0: the unlit pixels at their faintest, still visible.<br>100: the unlit pixels half opaque.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The unlit pixels show only while `showGhost()` is on.
- Default: 55.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelContrast`.*

##### `ce.components.pixel.gamma(target, gamma) -> boolean`

Set the brightness curve.

Example: `ce.components.pixel.gamma("Screen", 2)` lifts the dimmer brightnesses.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `gamma` (number, required): The curve between `brightness()` and how bright the lit pixels are drawn.<br>1: straight.<br>Above 1: the lower brightnesses lifted.<br>Below 1: lowered.<br>Range: 0.2 ↔ 4.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelGamma`.*

##### `ce.components.pixel.glow(target, glow) -> boolean`

Set the glow: a halo around the lit pixels.

Example: `ce.components.pixel.glow("Screen", 0.5)` gives the lit pixels a halo.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `glow` (number, required): How large and strong the halo is.<br>0: none.<br>1: the largest, 2.6 times a pixel's size.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelGlow`.*

##### `ce.components.pixel.anim(target, anim) -> boolean`

Set the animation behind the elements: off, a file, or a preset.

Example: `ce.components.pixel.anim("Screen", "preset")` plays the chosen preset animation.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `anim` (text, required): One of "off", "file" or "preset". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- The file is chosen in the inspector.
- Default: "off".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelAnim`.*

##### `ce.components.pixel.animPreset(target, animPreset) -> boolean`

Choose the preset animation.

Example: `ce.components.pixel.animPreset("Screen", "rain")` plays the rain animation.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `animPreset` (text, required): One of "wave", "scanner", "rain", "starfield", "spinner" or "plasma". Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Plays while `anim()` is "preset".
- Default: "wave".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelAnimPreset`.*

##### `ce.components.pixel.animSpeed(target, animSpeed) -> boolean`

Set the speed of the preset animation, as a multiple of its normal speed.

Example: `ce.components.pixel.animSpeed("Screen", 2)` plays the preset animation at twice its normal speed.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `animSpeed` (number, required): Speed factor.<br>Range: 0.1 ↔ 5.<br>1: normal.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelAnimSpeed`.*

##### `ce.components.pixel.animLoop(target [, animLoop]) -> boolean`

Switch looping of the animation on or off.

Example: `ce.components.pixel.animLoop("Screen")` switches the anim loop on if it is off, and off if it is on.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `animLoop` (true or false, optional): Left out: toggles.<br>false: the last frame holds.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: on.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelAnimLoop`.*

##### `ce.components.pixel.animFps(target, animFps) -> boolean`

Set the frame rate of a sprite-sheet animation.

Example: `ce.components.pixel.animFps("Screen", 24)` plays the sheet at 24 frames per second.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `animFps` (number, required): Frames per second.<br>Only for a sprite sheet: a GIF or APNG plays at its own speed.<br>Range: 1 ↔ 120.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 12.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelAnimFps`.*

##### `ce.components.pixel.layoutTransition(target, layoutTransition) -> boolean`

Set how a layout comes in when it is shown.

Example: `ce.components.pixel.layoutTransition("Screen", "fade")` fades each layout in.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `layoutTransition` (text, required): "none": at once.<br>"fade": faded in.<br>"slide": faded in, sliding from the right.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Over `transitionMs()`.
- Default: "none".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelLayoutTransition`.*

##### `ce.components.pixel.transitionMs(target, transitionMs) -> boolean`

Set how long a layout takes to come in.

Example: `ce.components.pixel.transitionMs("Screen", 500)` brings each layout in over half a second.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `transitionMs` (number, required): Milliseconds.<br>0: at once.<br>Range: 0 ↔ 2000, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- With `layoutTransition()` "none": no effect.
- Default: 250.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelTransitionMs`.*

##### `ce.components.pixel.brightnessSource(target [, name]) -> boolean`

Name the control that drives the brightness.

Example: `ce.components.pixel.brightnessSource("Screen", "Cutoff")` makes the control called Cutoff drive the brightness.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `name` (text, optional): The driving control's name.<br>Left out, or "": unlinked.<br>Its range sets 0 to 100.<br>Not on this panel, or not a knob, slider or other range control: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.
- `read(target, "brightnessSource")` gives the control's name.

*Short name: `pixelBrightnessSource`.*

##### `ce.components.pixel.backlightSource(target [, name]) -> boolean`

Name the control that drives the backlight.

Example: `ce.components.pixel.backlightSource("Screen", "Light")` makes the control called Light switch the backlight.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `name` (text, optional): The driving control's name.<br>Left out, or "": unlinked.<br>On while the control is on, or past halfway.<br>Not on this panel: rejected with a console error.

Good to know:

- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.
- `read(target, "backlightSource")` gives the control's name.

*Short name: `pixelBacklightSource`.*

##### `ce.components.pixel.layout(target, layout) -> boolean`

Show one of the display's layouts.

Example: `ce.components.pixel.layout("Screen", 2)` shows layout 2.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `layout` (number or name, required): Its number, counted from 1, or its name.<br>A name: case-insensitive.<br>A fraction: rounded.<br>A display without layouts: 1, its elements.<br>Not a layout of the display: rejected with a console error.

Good to know:

- Shown until an overlay or the Selector changes it.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.
- `read(target, "layout")` gives the number of the layout showing.

*Short name: `pixelLayout`.*

##### `ce.components.pixel.showGlass(target [, showGlass]) -> boolean`

Show or hide the glass: a sheen across the screen.

Example: `ce.components.pixel.showGlass("Screen")` shows the glass if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `showGlass` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Its tint is set in the inspector, under Screen colours ▸ Glass. Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelShowGlass`.*

##### `ce.components.pixel.showGhost(target [, showGhost]) -> boolean`

Show or hide the ghost: the faint unlit pixels behind the elements.

Example: `ce.components.pixel.showGhost("Screen")` shows the ghost if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `showGhost` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- How faint is set by `contrast()`. Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelShowGhost`.*

##### `ce.components.pixel.showScanlines(target [, showScanlines]) -> boolean`

Show or hide the scanlines: thin horizontal lines across the screen.

Example: `ce.components.pixel.showScanlines("Screen")` shows the scanlines if they are hidden, and hides them if they are shown.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `showScanlines` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelShowScanlines`.*

##### `ce.components.pixel.showGrid(target [, showGrid]) -> boolean`

Show or hide the design grid: lines every few pixels, in the editor only.

Example: `ce.components.pixel.showGrid("Screen")` shows the grid if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `showGrid` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Not drawn in the preview or an exported plug-in.
- Its spacing is the inspector's Snap: 8 pixels while that is 0.
- Default: hidden.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `pixelShowGrid`.*

##### `ce.components.pixel.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.pixel.read("Screen")` gives every setting as a table.

- `target` (control name, required): The Pixel Display's control, by name.<br>Not a Pixel Display: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (text, optional): For an element verb, such as "text": the element's name. Case-insensitive.<br>Left out: every element's, by name.<br>Not an element of the display: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name.
- `read(target, "text")`: every element's, by name; `read(target, "text", "Title")`: one element's.
- `read(target, "layout")`: the number of the layout showing.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `pixelRead`.*


### Panel-wide

Components that act on the whole panel rather than one value.

#### ce.components.transport: Transport

Set the panel's clock: its tempo, swing, time signature, loop and count-in, where it follows, and its MIDI clock out. Reading it is ce.time.

##### `ce.components.transport.bpm(target, bpm) -> boolean`

Set the tempo.

Example: `ce.components.transport.bpm("Transport", 128)` sets the tempo to 128 beats a minute.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `bpm` (number, required): Beats a minute; a beat is a quarter note.<br>Range: 20 ↔ 300.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- The position does not jump: only what comes after the current beat speeds up or slows down.
- While `source()` is "external" or "host": not used.
- Default: 120.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportBpm`.*

##### `ce.components.transport.swing(target, swing) -> boolean`

Set how far every second step is delayed, for every component following the clock.

Example: `ce.components.transport.swing("Transport", 0.5)` delays every second step by a quarter of a step.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `swing` (number, required): Part of half a step: 1 delays every second step by half a step.<br>0: straight.<br>Range: 0 ↔ 1.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- An Arp with `swingSource()` "own" plays its own instead.
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportSwing`.*

##### `ce.components.transport.source(target, source) -> boolean`

Set which clock the panel follows: its own, a MIDI clock, or the host.

Example: `ce.components.transport.source("Transport", "host")` follows the DAW's playhead.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `source` (text, required): "internal": its own, at `bpm()`.<br>"external": a MIDI clock arriving on the input.<br>"host": the DAW's playhead, in a plug-in.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Following, `bpm()` is ignored, tapping sets nothing and no clock is sent.
- Default: "internal".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportSource`.*

##### `ce.components.transport.beatsPerBar(target, beatsPerBar) -> boolean`

Set how many beats a bar has: the time signature's upper number.

Example: `ce.components.transport.beatsPerBar("Transport", 3)` makes each bar three beats long.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `beatsPerBar` (number, required): Beats.<br>Range: 1 ↔ 32, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Sets the bar for the position, the loop and the count-in, and where the downbeat falls.
- Default: 4.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportBeatsPerBar`.*

##### `ce.components.transport.beatUnit(target, beatUnit) -> boolean`

Set the time signature's lower number.

Example: `ce.components.transport.beatUnit("Transport", 8)` shows the time signature over 8.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `beatUnit` (number, required): The note value of a beat in the time signature: 4 a quarter, 8 an eighth.<br>Range: 1 ↔ 32, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Shown only: a beat is a quarter note whatever it says.
- Default: 4.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportBeatUnit`.*

##### `ce.components.transport.loop(target [, loop]) -> boolean`

Switch the loop on or off.

Example: `ce.components.transport.loop("Transport")` switches the loop enabled on if it is off, and off if it is on.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `loop` (true or false, optional): true: the position runs from `loopStart()` for `loopBars()` and back, over and over.<br>false: it runs on.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Before the loop's first bar, the position runs into it.
- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportLoop`.*

##### `ce.components.transport.loopStart(target, loopStart) -> boolean`

Set the bar the loop starts on.

Example: `ce.components.transport.loopStart("Transport", 5)` starts the loop at bar 5.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `loopStart` (number, required): Bar, counted from 1.<br>Range: 1 ↔ 999, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportLoopStart`.*

##### `ce.components.transport.loopBars(target, loopBars) -> boolean`

Set how long the loop is.

Example: `ce.components.transport.loopBars("Transport", 0.5)` loops half a bar.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `loopBars` (number, required): Bars: 0.25 is one beat in 4/4.<br>Range: 0.25 ↔ 64.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Default: 4.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportLoopBars`.*

##### `ce.components.transport.countIn(target, countIn) -> boolean`

Set how many bars of silence come before the clock runs.

Example: `ce.components.transport.countIn("Transport", 1)` counts one bar in.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `countIn` (number, required): Bars.<br>0: none.<br>Range: 0 ↔ 8, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Every component following the clock holds and is quiet until it ends.
- Default: 0.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportCountIn`.*

##### `ce.components.transport.clockOut(target [, clockOut]) -> boolean`

Send MIDI clock, start, stop and song position, so hardware follows the panel.

Example: `ce.components.transport.clockOut("Transport")` switches the clock out on if it is off, and off if it is on.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `clockOut` (true or false, optional): true: sent to `clockDevice()`, 24 clocks a quarter note.<br>false: not sent.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- While `source()` is "external" or "host": not used.
- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportClockOut`.*

##### `ce.components.transport.clockDevice(target, clockDevice) -> boolean`

Set which device the MIDI clock is sent to.

Example: `ce.components.transport.clockDevice("Transport", "Drum Machine")` sends the clock to the device called Drum Machine.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `clockDevice` (text, required): The device's name, as the panel's devices list it.<br>"": the panel's own device, when it has exactly one; otherwise none.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Default: "".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportClockDevice`.*

##### `ce.components.transport.runOnLoad(target [, runOnLoad]) -> boolean`

Start the clock as soon as the panel opens.

Example: `ce.components.transport.runOnLoad("Transport")` switches the run on load on if it is off, and off if it is on.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `runOnLoad` (true or false, optional): true: running from the start, as an exported plug-in is.<br>false: stopped until played.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: false.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportRunOnLoad`.*

##### `ce.components.transport.editable(target [, editable]) -> boolean`

Let the Transport be played and tapped by touch, or not.

Example: `ce.components.transport.editable("Transport")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `editable` (true or false, optional): true: its play button and tap tempo work.<br>false: touches do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportEditable`.*

##### `ce.components.transport.showPosition(target [, showPosition]) -> boolean`

Show or hide the position, as bar.beat.tick, and the beat pulse.

Example: `ce.components.transport.showPosition("Transport")` shows the position if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `showPosition` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportShowPosition`.*

##### `ce.components.transport.showTap(target [, showTap]) -> boolean`

Let a tap on the face set the tempo, or not.

Example: `ce.components.transport.showTap("Transport")` shows the tap if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `showTap` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Not while following another clock.
- Default: on.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `transportShowTap`.*

##### `ce.components.transport.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.transport.read("Transport")` gives every setting as a table.

- `target` (control name, required): The Transport's control, by name.<br>Not a Transport: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `transportRead`.*

#### ce.components.panic: Panic

Set what a Panic button sends when pressed: which channels, and whether it also resets the controllers, centres pitch bend and stops the panel's own notes.

##### `ce.components.panic.scope(target, scope) -> boolean`

Set whether the button silences every channel or one.

Example: `ce.components.panic.scope("Panic", "channel")` silences only the channel `channel()` sets.

- `target` (control name, required): The Panic's control, by name.<br>Not a Panic: rejected with a console error.
- `scope` (text, required): "all": channels 1 to 16.<br>"channel": the channel `channel()` sets.<br>Case-insensitive.<br>Invalid: rejected with a console error.

Good to know:

- Each channel is sent All Sound Off (CC 120), then All Notes Off (CC 123).
- Default: "all".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `panicSetScope`.*

##### `ce.components.panic.channel(target, channel) -> boolean`

Set the channel the button silences while `scope()` is "channel".

Example: `ce.components.panic.channel("Panic", 10)` silences channel 10.

- `target` (control name, required): The Panic's control, by name.<br>Not a Panic: rejected with a console error.
- `channel` (number, required): MIDI channel.<br>Range: 1 ↔ 16, whole.<br>A fraction: rounded.<br>Outside the range: the nearest end.<br>Invalid: rejected with a console error.

Good to know:

- Only while `scope()` is "channel".
- Default: 1.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `panicSetChannel`.*

##### `ce.components.panic.resetControllers(target [, resetControllers]) -> boolean`

Also send Reset All Controllers (CC 121), or not.

Example: `ce.components.panic.resetControllers("Panic")` switches the reset controllers on if they are off, and off if they are on.

- `target` (control name, required): The Panic's control, by name.<br>Not a Panic: rejected with a console error.
- `resetControllers` (true or false, optional): true: sent, after the notes are stopped; a mod wheel or pedal left up is released.<br>false: not sent.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `panicSetResetControllers`.*

##### `ce.components.panic.centreBend(target [, centreBend]) -> boolean`

Also put pitch bend back to the centre, or not.

Example: `ce.components.panic.centreBend("Panic")` switches the centre bend on if it is off, and off if it is on.

- `target` (control name, required): The Panic's control, by name.<br>Not a Panic: rejected with a console error.
- `centreBend` (true or false, optional): true: a centred pitch bend is sent on each channel.<br>false: not sent.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `panicSetCentreBend`.*

##### `ce.components.panic.clearLocal(target [, clearLocal]) -> boolean`

Also stop the notes this panel's own controls are playing, or not.

Example: `ce.components.panic.clearLocal("Panic")` switches the clear local on if it is off, and off if it is on.

- `target` (control name, required): The Panic's control, by name.<br>Not a Panic: rejected with a console error.
- `clearLocal` (true or false, optional): true: the Chord Pads, Keyboards, Arps, Note Ribbons, Drum Pads and the panel's other note controls stop.<br>false: they play on.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `panicSetClearLocal`.*

##### `ce.components.panic.label(target, label) -> boolean`

Set the text on the button.

Example: `ce.components.panic.label("Panic", "ALL OFF")` writes ALL OFF on the button.

- `target` (control name, required): The Panic's control, by name.<br>Not a Panic: rejected with a console error.
- `label` (text, required): The text.<br>"": PANIC.<br>A number: written as text.<br>Left out: rejected with a console error.

Good to know:

- Default: "PANIC".
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `panicSetLabel`.*

##### `ce.components.panic.editable(target [, editable]) -> boolean`

Let the button be pressed, or not.

Example: `ce.components.panic.editable("Panic")` switches the editable on if it is off, and off if it is on.

- `target` (control name, required): The Panic's control, by name.<br>Not a Panic: rejected with a console error.
- `editable` (true or false, optional): true: a press sends it.<br>false: presses do nothing.<br>Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- The panic key, Escape unless the panel sets another, works either way, and sends the most: every channel, every message.
- Default: true.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `panicSetEditable`.*

##### `ce.components.panic.showSummary(target [, showSummary]) -> boolean`

Show or hide the line under the label that says what the button sends.

Example: `ce.components.panic.showSummary("Panic")` shows the summary if it is hidden, and hides it if it is shown.

- `target` (control name, required): The Panic's control, by name.<br>Not a Panic: rejected with a console error.
- `showSummary` (true or false, optional): Left out: toggles.<br>0, "", "false", "off" or "0": false. Case-insensitive.<br>Any other value: true.

Good to know:

- Drawn only on a button 46 pixels tall or more.
- Default: shown.
- Returns true. Already set: true, with a console line.
- Rejected: false, with a console error. Nothing changes.

*Short name: `panicSetShowSummary`.*

##### `ce.components.panic.read(target [, name [, index]]) -> value`

Read back a setting, or every setting.

Example: `ce.components.panic.read("Panic")` gives every setting as a table.

- `target` (control name, required): The Panic's control, by name.<br>Not a Panic: rejected with a console error.
- `name` (text, optional): A verb of this component, by name.<br>Left out: every setting, as a table.<br>Not a verb that sets something: rejected with a console error.
- `index` (number, optional): Element number of a list verb, counted from 1.<br>A fraction: rounded.<br>Left out: the whole list.<br>Not one the list has: rejected with a console error.

Good to know:

- `read(target)`: every setting as a table, by verb name.
- Returns the value.
- Rejected: no result, with a console error.

*Short name: `panicSetRead`.*

#### ce.components.setlist: Setlist

Scenes you step through, for example from a footswitch.

##### `ce.components.setlist.next(target)`

Go to the next scene it plays.

Example: `ce.components.setlist.next("Setlist")` recalls the next scene.

Good to know:

- Scenes switched off with `enable()` are passed over.
- At the last: to the first while `wrap()` is on; else rejected with a console error.
- Returns true. Rejected: false, with a console error.

*Short name: `setlistNext`.*

##### `ce.components.setlist.prev(target)`

Go back to the scene before.

Example: `ce.components.setlist.prev("Setlist")` recalls the scene before.

Good to know:

- Scenes switched off with `enable()` are passed over.
- At the first: to the last while `wrap()` is on; else rejected with a console error.
- Returns true. Rejected: false, with a console error.

*Short name: `setlistPrev`.*

##### `ce.components.setlist.jump(target, scene)`

Go to a scene by its number or name.

Example: `ce.components.setlist.jump("Setlist", "Ballad")` recalls the scene called Ballad.

- `scene` (number or text, required): Its number, counted from 1, or its name, as written.<br>Not a scene: rejected with a console error naming them.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `setlistGoto`.*

##### `ce.components.setlist.enable(target, scene, enabled)`

Play a scene in the set, or pass over it.

Example: `ce.components.setlist.enable("Setlist", 2, false)` skips scene 2 tonight.

- `scene` (number or text, required): Its number, counted from 1, or its name, as written.<br>Not a scene: rejected with a console error naming them.
- `enabled` (true or false, required): true: played.<br>false: passed over by `next()` and `prev()`.<br>Left out: played.

Good to know:

- `jump()` still goes to it.
- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `setlistEnable`.*

##### `ce.components.setlist.wrap(target [, wrap])`

Go round from the last scene to the first, or stop at the ends.

Example: `ce.components.setlist.wrap("Setlist", true)` goes from the last scene to the first.

- `wrap` (true or false, optional): true: round.<br>false: stops at the ends.<br>Left out: toggles.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `setlistWrap`.*

##### `ce.components.setlist.crossfade(target, ms)`

Set how long a scene's values take to fade in.

Example: `ce.components.setlist.crossfade("Setlist", 800)` fades each scene in over 0.8 s.

- `ms` (number, required): Milliseconds.<br>0: at once.<br>Range: 0 ↔ 10000.<br>Outside the range: the nearest end.<br>Not a number: rejected with a console error.

Good to know:

- Returns true. Already that way: true, with a console line.
- Rejected: false, with a console error.

*Short name: `setlistCrossfade`.*

##### `ce.components.setlist.read(target [, field])`

Read the Setlist's settings and scenes.

Example: `ce.components.setlist.read("Setlist", "index")` gives the scene in front, counted from 0.

- `field` (text, optional): A setting's name, in any case, such as "index" or "scenes".<br>Left out: every setting, as a table.<br>Not one of its settings: no result, with a console error naming them.

Good to know:

- "scenes": each { name, values, enabled, … }.
- Returns the value.

*Short name: `setlistRead`.*


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
