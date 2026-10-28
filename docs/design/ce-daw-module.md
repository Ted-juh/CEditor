# `ce.daw`: the exported plug-in and its DAW

*Designed and approved by the owner on 2026-10-27. Built on 2026-10-28 on the `script-modules-build` branch; what differs from this record is listed in [the roadmap](script-modules-roadmap.md).* `ce.daw` gives a script in an
exported plug-in a view of its DAW and a say in what the DAW sees: 10 commands and 2 new events, plus
one command beside the module, `origin()`, that says who made the change a handler is running for.
It runs in the exported plug-in, with its window open or shut. In the editor there is no DAW, so the
commands that need one answer "nothing" and the rest still work, so a panel can be tested. Every
entry is written in the scripting manual's form, so it can go into `panelApi.js` as it stands. Fifth
in [Script modules: what is missing](script-modules-roadmap.md).

## What the plug-in does today

- **Parameters.** Every control with a value becomes one DAW parameter when the panel is saved
  (`collectExportParameters` in `exportParameters.js`). The list is baked into the plug-in and fixed
  from then on. An author can leave a control out ("Automatable in DAW" off) or write the list by
  hand. There are no groups.
- **A knob turned in the plug-in.** Each value is sent to the DAW as a gesture of its own: begin,
  value, end (`setParamFromUi`, `PluginProcessor.h`). A drag of 200 steps is 200 gestures, so a DAW in
  touch or latch mode sees the knob let go 200 times.
- **Automation played by the DAW.** Polled 30 times a second. With the window open it raises
  `onValueChange`, the same as a turn by the user. With the window shut it raises only
  `onValueChanged`, with a bare value. A script cannot tell the DAW's move from the user's.
- **A script's own change comes back.** With the window shut, a script's `set()` on a control moves
  its DAW parameter, and the next poll raises `onValueChanged` for it, as if the DAW had moved it
  (`lastScriptValue` in `PluginProcessor.h` is written only by that poll).
- **Saving with the project.** `onDawSaveState` and `onDawRestoreState` exist (the only two
  `RUNTIME_PLAYER` entries). They run only in the window-shut engines: the panel view never raises
  them, so with the window open a script's saved state is not the state of the script that is
  running.
- **Host facts.** Tempo, position and play state reach scripts through `ce.time`. Sample rate and
  block size are thrown away (`prepareToPlay` is empty). The DAW's name is never read. Programs from
  the bank baked at export are offered to the DAW, but a script cannot see which one the DAW chose.

## Everything at a glance

| New | Kind | What it gives |
|---|---|---|
| `ce.daw.host` | command | The DAW's name, the plug-in format, sample rate, block size, window open or shut |
| `ce.daw.parameters`, `parameter` | command | The plug-in's DAW parameters, with ids, names, ranges and current values |
| `ce.daw.program`, `programs` | command | The program the DAW chose, and the bank it chooses from |
| `ce.daw.beginGesture`, `endGesture` | command | One DAW gesture around a change a script makes over time |
| `ce.daw.rename` | command | Give a parameter a new name in the DAW |
| `ce.daw.assign` | command | Put a control on one of the panel's spare parameters |
| `ce.daw.markChanged` | command | Tell the DAW the project has unsaved changes |
| `automationIn` | event | The DAW moved a parameter |
| `dawProgramIn` | event | The DAW chose a program |
| `origin()` | command | Inside any handler: who made the change, the user, a script, the DAW or the synth |

## Rules every command keeps

- **A parameter is named by its control's path**, such as `"Cutoff.value"`, the address `set` and
  `get` use. The DAW's own id is in what `parameters` returns, for a script that needs it.
- **Values in the control's own range**, as `set` and `get` give them: 0 to 127 for a CC knob, the
  choice's text for a list. Never the DAW's 0 to 1.
- **The list of parameters is fixed at export.** A DAW stores automation by the parameter's id and
  place in the list; a list that changed after a project was saved would put the automation on the
  wrong knobs. So a script cannot add or remove a parameter. It can rename one, and fill the spare
  parameters the author reserved (`assign`).
- **A script's own change never comes back to it as the DAW's.** A `set()` reaches the DAW as
  before, raises the value events with `origin()` giving `"script"`, and never raises `automationIn`.
- **Every gesture is closed.** A DAW in touch mode holds a parameter while a gesture is open. A
  gesture a script leaves open is closed when the script reloads or the panel closes, with a console
  line.
- **The same with the window open or shut.** Both raise the same events with the same fields; one
  shared table of DAW moves and the events they give is run against the panel view and every
  window-shut engine.
- **Nothing here runs on the audio thread.** Scripts run on the message thread, as now. The DAW's
  moves are read from the parameters' atomics on the 30 Hz poll that exists; the plug-in's moves go
  to the DAW through `setValueNotifyingHost`, as now.
- **In the editor**, with no DAW: `host`, `program`, `programs` and `markChanged` answer nothing;
  `parameters` and `parameter` give the list the next export would bake; the gesture commands,
  `rename` and `assign` do nothing and return false. No event of this module is raised.

## Reading the host

### `ce.daw.host() -> table`

What the plug-in is running in.

Example: `ce.daw.host().name` is `"Bitwig Studio"` in Bitwig.

Good to know:

- Returns `{ name, format, sampleRate, blockSize, editorOpen }`. `name` is the DAW as JUCE's
  `PluginHostType` knows it, else `"Unknown"`; `format` is `"vst3"`, `"clap"`, `"lv2"`, `"au"` or
  `"standalone"`.
- `sampleRate` and `blockSize` are nothing until the DAW has started the plug-in.
- Tempo, position and play state are in `ce.time`, not here.
- In the editor: nothing.

### `ce.daw.parameters() -> list`

The plug-in's DAW parameters, in the order the DAW lists them.

Example: `#ce.daw.parameters()` is how many the DAW can automate.

Good to know:

- Each is `{ id, name, path, control, min, max, default, unit, kind, choices, group, value }`.
  `kind` is `"float"`, `"choice"` or `"bool"`; `choices` is the list's texts for a choice; `group` is
  the folder the DAW shows it in, or nothing.
- `name` is the name the DAW shows now, after any `rename`.
- Spare parameters (`assign`) are in the list too, with `path` nothing while empty.
- In the editor: the list the next export would bake, with `value` the control's value now.

### `ce.daw.parameter(path) -> table`

One DAW parameter, by its control's path.

Example: `ce.daw.parameter("Cutoff.value").name` is the name the DAW shows for the cutoff knob.

- `path` (text, required): The control's path, as `set` takes it.

Good to know:

- Returns one entry as `parameters` gives it; a control that is not a DAW parameter: nothing.

### `ce.daw.program() -> table`

The program the DAW has chosen from the plug-in's bank.

Example: `ce.daw.program().name` is what the DAW's program menu shows.

Good to know:

- Returns `{ index, number, name, count }`: `index` from 0, `number` from 1, `count` the size of
  the bank.
- The bank is the one baked at export from the device profile's presets. A panel without one:
  nothing.
- The program's MIDI is sent by the plug-in, as now; `dawProgramIn` says when.

### `ce.daw.programs() -> list`

The whole bank the DAW chooses from.

Example: `ce.daw.programs()[1].name` is the first program's name.

Good to know:

- Returns a list of `{ index, number, name }`; no bank: an empty list.

```lua
-- Lua: show the DAW's name and the program on an LCD
function onPanelReady()
  local host = ce.daw.host()
  local program = ce.daw.program()
  if host then ce.components.lcd.text("Display", 1, host.name) end
  if program then ce.components.lcd.text("Display", 2, program.number .. " " .. program.name) end
end
```
```js
// JavaScript
function onPanelReady() {
  const host = ce.daw.host();
  const program = ce.daw.program();
  if (host) ce.components.lcd.text("Display", 1, host.name);
  if (program) ce.components.lcd.text("Display", 2, `${program.number} ${program.name}`);
}
```

## Changing what the DAW sees

### `ce.daw.beginGesture(path) -> boolean`

Start one DAW gesture on a parameter: every `set` on it until `endGesture` is one move to the DAW.

Example: `ce.daw.beginGesture("Cutoff.value")` before a sweep the script plays.

- `path` (text, required): The control's path.

Good to know:

- Without it, each `set` is a gesture of its own, as now. A DAW writing automation in touch or latch
  mode then lets go of the parameter after every value.
- Only for changes the script makes over time: a morph, a sweep, an XY pad a script drives. A drag
  by the user is one gesture already (see [Panel and export side](#panel-and-export-side)).
- Returns true when started; false when one is already open on that parameter, or the path is not a
  DAW parameter.

### `ce.daw.endGesture(path) -> boolean`

End the gesture `beginGesture` started.

Example: `ce.daw.endGesture("Cutoff.value")` when the sweep is done.

- `path` (text, required): The control's path.

Good to know:

- Returns true when a gesture was open.

```lua
-- Lua: a button starts a two-second sweep, written to the DAW as one move
function onClick()
  state.step = 0
  ce.daw.beginGesture("Cutoff.value")
  startTimer("sweep", 20)
end

function onTimer(info)
  if info.id ~= "sweep" then return end
  state.step = state.step + 1
  set("Cutoff.value", state.step * 127 / 100)
  if state.step == 100 then
    ce.time.stopTimer("sweep")
    ce.daw.endGesture("Cutoff.value")
  end
end
```
```js
// JavaScript
function onClick() {
  state.step = 0;
  ce.daw.beginGesture("Cutoff.value");
  startTimer("sweep", 20);
}

function onTimer(info) {
  if (info.id !== "sweep") return;
  state.step += 1;
  set("Cutoff.value", state.step * 127 / 100);
  if (state.step === 100) {
    ce.time.stopTimer("sweep");
    ce.daw.endGesture("Cutoff.value");
  }
}
```

### `ce.daw.rename(path, name) -> boolean`

Give a parameter a new name in the DAW.

Example: `ce.daw.rename("Osc2Param.value", "Sync amount")` when the oscillator's mode changes what
its knob does.

- `path` (text, required): The control's path.
- `name` (text, required): The new name. Nothing: back to the name baked at export.

Good to know:

- For a synth whose knob means different things in different modes. The parameter's id and place
  stay the same, so automation already written stays on it.
- The name is saved with the project and comes back with it.
- Not every DAW shows a new name at once; some only after the project is reopened, and LV2 has no
  way to say it. The build step checks each DAW.
- Returns true when the name was changed.

### `ce.daw.assign(slot, path [, opts]) -> boolean`

Put a control on one of the panel's spare parameters, so the DAW can automate it.

Example: `ce.daw.assign(1, "LfoRate.value")` puts the LFO rate on spare parameter 1.

- `slot` (number, required): 1 to the number of spare parameters the panel has (set at export, see
  [Panel and export side](#panel-and-export-side)).
- `path` (text, required): The control's path. Nothing: empty the slot.
- `opts` (options, optional): `name`, the name the DAW shows. Left out: the control's name.

Good to know:

- For a panel with more controls than it can give the DAW, or a synth whose page decides what the
  knobs are: the author reserves a few spare parameters, and the script decides what is on them.
- The spare parameter takes the control's range and text: the DAW shows "440 Hz", not "0.53".
  Moving one moves the other, both ways.
- A control can be on one slot at a time; assigning it again moves it.
- The assignment is saved with the project and comes back before any automation plays, so
  automation written to a slot stays on the control it was written for.
- Returns true when assigned; false for a slot the panel does not have.

### `ce.daw.markChanged() -> boolean`

Tell the DAW the project has unsaved changes.

Example: `ce.daw.markChanged()` after a script changed something only `onDawSaveState` saves.

Good to know:

- Without it a DAW may close the project without asking, and lose what only the script holds. A
  change to a DAW parameter needs no call; the DAW knows of it.
- Also runs `onDawSaveState` on the next tick, so the state is ready when the DAW asks for it.
- Returns true when the DAW was told; in the editor, false.

## Events, and who made a change

### `origin() -> text`

Who made the change the running handler is for.

Example: in `onValueChanged`, `origin() == "host"` means the DAW's automation moved the knob.

Good to know:

- `"user"`: a hand on the panel. `"script"`: a `set()` from any script. `"host"`: the DAW.
  `"device"`: the synth, through a dump or a parameter it sent. `"load"`: the panel, a preset or the
  project being opened.
- Not under `ce.daw`, because it answers in the editor too, where the DAW is the one origin it never
  gives.
- Outside a handler: nothing.
- A command and not a field, because `onValueChange(value)` is given a plain number, and a second
  argument would break handlers in the typed languages (C++, C#, Java).

### `automationIn`: the DAW moved a parameter

| Field | What it holds |
|---|---|
| `control` | The control's name. |
| `path` | The control's path, such as `"Cutoff.value"`. |
| `value` | The new value, in the control's own range. |
| `id` | The DAW parameter's id. |

Good to know:

- A panel-wide event, heard by any script with `on("automationIn", fn)` or `onAutomationIn(move)` in
  the panel script.
- The control's own `onValueChange` and `onValueChanged` fire too, as now, with `origin()` giving
  `"host"`.
- Raised at most 30 times a second per parameter, the latest value, as the DAW's moves are read now.
- Never for a change a script or the user made.

### `dawProgramIn`: the DAW chose a program

| Field | What it holds |
|---|---|
| `index` | From 0, as the DAW counts it. |
| `number` | From 1. |
| `name` | The program's name. |

Good to know:

- Raised after the plug-in has sent the program's MIDI to the synth.
- `presetChange` fires too when the device profile knows the preset, as now.

### The DAW-state hooks, in both runtimes

`onDawSaveState` and `onDawRestoreState` keep their contract (return a table; read `store`, do not
change it). Two changes:

- **The panel view raises them too.** With the window open, the scripts that run are the panel
  view's, so their state is the one saved. Today only the window-shut engines raise them.
- **When `onDawSaveState` runs is written down.** On the next tick after any change a script makes,
  and after `ce.daw.markChanged()`; never inside the DAW's own save call, which can come on any
  thread and must not wait for a script. The DAW is given the state from the last run.

```lua
-- Lua: show when the DAW, not a hand, moved the filter
function onAutomationIn(move)
  if move.control == "Cutoff" then
    ce.components.lcd.text("Display", 2, "DAW: " .. tostring(move.value))
  end
end

-- and send to the synth only what did not come from it
function onValueChanged(value)
  if origin() ~= "device" then sendCC(1, 74, value) end
end
```
```js
// JavaScript
function onAutomationIn(move) {
  if (move.control === "Cutoff") ce.components.lcd.text("Display", 2, "DAW: " + move.value);
}

function onValueChanged(value) {
  if (origin() !== "device") sendCC(1, 74, value);
}
```

## Panel and export side

Three changes that are not commands, because they are decided when the panel is exported or need no
script at all.

| Change | Where it is set | What the DAW gets |
|---|---|---|
| A drag is one gesture | Nothing to set | Begin when the hand goes down on a control, end when it lets go; a mouse-wheel burst ends 300 ms after its last step. A DAW in touch mode holds the parameter for the whole drag. |
| Groups | "DAW group" in the control's inspector, beside "Automatable in DAW"; baked as `group` on each entry of `exportParameters` | Folders in the DAW's parameter list (JUCE's `AudioProcessorParameterGroup`). Ids and order stay as they are, so automation in saved projects is kept. |
| Spare parameters | "Spare DAW parameters" in the panel's export settings, 0 to 32, default 0 | Parameters `spare1` to `spareN`, named "Spare 1" and so on until a script uses `assign`. Added at the end of the list, so no existing parameter moves. |

Good to know:

- **The drag gesture changes what the panel sends over the bridge**: a `paramGesture` event with
  `begin` and `end` beside `paramChanged`, and `setParamFromUi` leaves out its own begin and end
  while one is open. A panel needs no change.
- **`rename` needs parameters whose name can change.** The plug-in's float, choice and on/off
  parameters become small classes of its own that return a name it can set, and tell the DAW with
  `updateHostDisplay` (parameter info changed). Their ids and ranges stay as they are.
- **A spare parameter is 0 to 1 to the DAW** and is shown through the assigned control's own range
  and text, so the list itself never changes after export.

## Build steps

Four steps; the first fixes what is wrong today and adds no command. Each step is checked with
`validate-plugins.mjs` over VST3, CLAP and LV2, and with one shared table of DAW moves and the events
they give, run against the panel view and every window-shut engine. The plain-description rules in
[api-descriptions-handoff.md](api-descriptions-handoff.md) apply to every text above.

| Step | What | Builds on |
|---|---|---|
| 1. Fixes | A drag as one gesture; `origin()`; no echo of a script's own `set()`; the same value events with the window shut as open; the DAW-state hooks in the panel view | `setParamFromUi`, the 30 Hz polls in `PluginProcessor.h`, the panel view's preview watcher |
| 2. Reading | `host`, `parameters`, `parameter`, `program`, `programs`, `automationIn`, `dawProgramIn`, `markChanged` | `prepareToPlay` keeping the sample rate and block size; `PluginHostType`; `ProgramBank.h`; `updateHostDisplay` (non-parameter state changed) |
| 3. Gestures and names | `beginGesture`, `endGesture`, `rename` | Parameter classes with a name that can change; a check in each DAW at hand of when it shows a new name |
| 4. Groups and spare parameters | "DAW group", "Spare DAW parameters", `assign` | `collectExportParameters`, `buildParameterLayout`, the plug-in state for the assignments |

## Open decisions

- [ ] Whether a control's "DAW group" defaults to the panel group it sits in, or to none, as now. A
  default fills the DAW's list with folders for every panel exported again.
- [ ] Whether `rename` is worth step 3 when DAWs differ in showing it. `assign` covers the same need
  (a knob that means different things) by giving each meaning its own spare parameter.
- [ ] How many spare parameters at most. 32 is a guess; some DAWs show a long list of parameters
  badly.
- [ ] Bypass and latency stay out: the plug-in passes audio through unchanged, so there is nothing
  for a script to report. Reading loop points and the bar start from the DAW belongs to `ce.time`,
  not here.
