# MIDI input, completed, and `ce.mpe`

*Designed and approved by the owner on 2026-10-27. Nothing built.* Two halves of one gap. Scripts
hear only some of what a synth or a controller sends, so seven input events fill in the rest. And
scripts cannot play or hear MPE at all, so a new module, `ce.mpe`, adds 7 commands and one more
event for it. Every entry is written in the scripting manual's form, so it can go into `panelApi.js`
as it stands. Fourth in [Script modules: what is missing](script-modules-roadmap.md).

## What scripts get today

Notes (`noteIn`, `noteOffIn`), controllers (`ccIn`), SysEx (`sysexIn`), everything raw (`midiIn`),
and, through the device profile, decoded parameters, dumps and preset changes
(`DEVICE_EVENTS` in `panelApi.js`). Everything else arrives only as raw bytes in `midiIn`, so each
script decodes it by hand, in its own language:

- a pitch bend wheel, channel pressure, poly aftertouch;
- a program change from a synth without a profile;
- an NRPN, which arrives as four controllers (99, 98, 6, 38) that must be put together in order;
- start, stop and song position from a device.

**Two problems in the events that exist.**

- Channels are counted two ways: `noteIn` and `noteOffIn` count 1 to 16, like `sendNote`; `ccIn`
  and `midiIn` count 0 to 15. Their own descriptions warn about it.
- No event says which device a message came from. A panel with a synth and a controller cannot tell
  the two apart.

**What exists for MPE.** Hostage has an MPE insert module (`CE/src/Performance/MpeTransformer.h`)
that allocates member channels, converts between MPE, poly aftertouch, channel pressure and a
controller, and drops expression that arrives for no sounding note. JUCE's MPE classes are vendored
(`MPEZoneLayout`, `MPEChannelAssigner` in `juce_MPEUtils.h`, `MPEInstrument`). Scripts have neither.

## Everything at a glance

| New | Kind | What it gives |
|---|---|---|
| `bendIn` | event | A pitch bend: its value and its amount from -1 to 1 |
| `pressureIn` | event | Channel pressure, 0 to 127 |
| `polyPressureIn` | event | Pressure on one note |
| `programIn` | event | A program change, with the bank select that came before it |
| `nrpnIn`, `rpnIn` | event | An NRPN or RPN, put together from its controllers |
| `transportIn` | event | Start, stop, continue and song position from a device |
| `ce.mpe.zone` | command | Set up an MPE zone, and tell the synth |
| `ce.mpe.noteOn`, `noteOff` | command | Play a note on its own channel; give back its id |
| `ce.mpe.express` | command | Bend, pressure and timbre for one sounding note |
| `ce.mpe.allOff`, `notes` | command | End every note; list the sounding ones |
| `ce.mpe.listen` | command | Read MPE from a controller |
| `expressionIn` | event | A sounding note's bend, pressure or timbre changed |

## Rules every input event keeps

- **Channels count from 1 to 16**, as `sendNote`, `sendCC` and `noteIn` count them. Every new event
  does; `ccIn` and `midiIn` are the open question at the end.
- **`from` says which device sent it**: the role as the panel names it, such as `"mainSynth"` or
  `"controller"`. Every input event gains it, the existing ones too; a new field breaks no script.
- **The same in both runtimes.** Raised in the panel view and in an exported plug-in with its window
  shut, decoded the same way in each, checked against one shared table of messages and the events
  they give.
- **Fast messages are thinned, never reordered.** A bend wheel or pressure can send a thousand
  messages a second. `bendIn`, `pressureIn`, `polyPressureIn` and `expressionIn` are raised at most
  once every 10 ms per channel (per note for poly pressure), with the latest value; nothing waits
  longer than that. `midiIn` still gets every message.
- **Decoded once, before any script.** Running status, a note-on with velocity 0, and the order of an
  NRPN's controllers are dealt with by the decoder, not by each script.
- **Nothing listens, nothing is decoded.** An event no script listens for costs nothing.

## The new input events

Each is heard with `on("bendIn", fn)` or a function named after it, `onBendIn(bend)`, as the
existing events are. Every payload carries `channel` (1 to 16) and `from`.

### `bendIn`: a pitch bend

| Field | What it holds |
|---|---|
| `value` | -8192 to 8191, 0 in the middle. |
| `amount` | -1 to 1: the same, as a part of the full bend. |
| `raw` | 0 to 16383, as the two bytes carry it, for a script that sends it on unchanged. |

Good to know:

- How far that bends the pitch is the synth's setting (its bend range), which `rpnIn` reports when
  the device sends it.

```lua
-- Lua: bend moves a knob
function onBendIn(bend)
  set("Detune.value", ce.math.scale(bend.amount, -1, 1, 0, 127))
end
```
```js
// JavaScript
function onBendIn(bend) {
  set("Detune.value", ce.math.scale(bend.amount, -1, 1, 0, 127));
}
```

### `pressureIn`: channel pressure

| Field | What it holds |
|---|---|
| `value` | 0 to 127. |
| `amount` | 0 to 1. |

### `polyPressureIn`: pressure on one note

| Field | What it holds |
|---|---|
| `note` | The note, 0 to 127. |
| `value`, `amount` | 0 to 127, and 0 to 1. |

### `programIn`: a program change

| Field | What it holds |
|---|---|
| `program` | 0 to 127, as the message carries it. |
| `number` | 1 to 128, as most synths' displays show it. |
| `bankMsb`, `bankLsb` | The bank select (controllers 0 and 32) that came just before it on this channel; nothing when none did. |

Good to know:

- With a device profile that knows the synth's banks, `presetChange` fires too, with the preset's
  slot and name. `programIn` is the plain message, for any device.

### `nrpnIn` and `rpnIn`: a parameter number, put together

An NRPN arrives as up to four controllers: 99 and 98 for the parameter, then 6 and 38 for the value.
This event is raised once they are together, with the same names `sendNRPN` takes. `rpnIn` is the
same for the registered numbers (controllers 101 and 100).

| Field | What it holds |
|---|---|
| `msb`, `lsb` | The parameter number's two halves, 0 to 127, as `sendNRPN(channel, msb, lsb, value)` takes them. |
| `parameter` | The two as one number, 0 to 16383. |
| `value` | 0 to 16383 when the fine half (controller 38) came, 0 to 127 when only the coarse half did. |
| `fine` | Whether the fine half came. |
| `step` | For an increment or decrement (controllers 96 and 97): +1 or -1; `value` is then nothing. |
| `name` | `rpnIn` only: `"bendRange"`, `"fineTuning"`, `"coarseTuning"` or `"mpeConfiguration"` for the registered numbers that have one. |

Good to know:

- Raised when the fine half arrives, or 5 ms after the coarse half when no fine half follows, so a
  device that sends only the coarse half is still heard, once.
- With a device profile that decodes this NRPN as a parameter, `parameterReceived` fires too.
- Controllers 6, 38, 96 to 101 still raise `ccIn`, as now.

### `transportIn`: start and stop from a device

| Field | What it holds |
|---|---|
| `action` | `"start"`, `"stop"`, `"continue"` or `"position"`. |
| `beat` | For `"position"`: where the device's song position pointer says, in beats from the start. |

Good to know:

- Clock ticks are not raised one by one (24 a beat); `ce.time.clockTempo()` gives the tempo they make.
- The panel's own transport raises `transport` when it follows the device. `transportIn` is what the
  device said, whatever the panel's transport follows.

## `ce.mpe`: playing MPE

MPE gives every sounding note a MIDI channel of its own, so each note can bend, swell and change tone
by itself: pitch bend for pitch, channel pressure for pressure, controller 74 for timbre. A zone is
one manager channel and the member channels its notes use: the lower zone has channel 1 as manager
and members from 2 upwards; the upper zone has 16 as manager and members from 15 down.

The script plays notes by id; `ce.mpe` picks the channels, sends each note's expression on its own
channel, and frees the channel when the note ends. Runs everywhere, as `ce.midi` does.

### `ce.mpe.zone([opts]) -> boolean`

Set up the zone the panel plays into, and tell the synth.

Example: `ce.mpe.zone({ members = 7 })` plays into a lower zone of seven channels, 2 to 8.

- `opts` (options, optional): The options below.

Good to know:

- With `send` on, the synth gets the MPE Configuration Message (RPN 6) on the manager channel, and
  the bend range (RPN 0) on every member channel, so both ends agree.
- Changing the zone ends every sounding note first.
- Returns true when the zone is set.

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `zone` | text | `"lower"` | `"lower"` (manager channel 1) or `"upper"` (manager channel 16). |
| `members` | number (1 to 15) | 15 | How many member channels, and so how many notes can sound at once. |
| `bendRange` | number (semitones) | 48 | How far a full bend goes on a member channel. MPE's own default. |
| `managerBendRange` | number (semitones) | 2 | The same, for the manager channel. |
| `send` | on/off | on | Send the configuration to the synth. Off for a synth set up by hand. |
| `role` | text | `"mainSynth"` | The device. |

### `ce.mpe.noteOn(note, velocity [, opts]) -> id`

Play a note on a member channel of its own.

Example: `local id = ce.mpe.noteOn("C4", 100)` plays middle C and keeps its id.

- `note` (number or text, required): The note, 0 to 127, or a name such as "C4", as `sendNote` takes it.
- `velocity` (number, required): 1 to 127.
- `opts` (options, optional): `bend`, `pressure` and `timbre` the note starts with, as `express` takes them.

Good to know:

- The channel is a free member channel, the one released longest ago, so a release tail on the synth
  is not cut off.
- Every channel busy: the oldest note is ended first, with a console line the first time. More
  members, or fewer notes, avoid it.
- The starting bend and timbre are sent before the note, as MPE asks, so a note never starts at the
  last note's bend.
- Returns the note's id, a number. Before `zone` was called: a lower zone of 15 is set up first, with
  `send` on.

### `ce.mpe.express(id, values) -> boolean`

Change one sounding note's bend, pressure or timbre.

Example: `ce.mpe.express(id, { bend = 0.5, pressure = 0.8 })` bends the note up a quarter tone and presses it.

- `id` (number, required): A note's id from `noteOn`.
- `values` (table, required): Any of `bend`, in semitones, held to the zone's `bendRange`;
  `pressure`, 0 to 1; `timbre`, 0 to 1. What is left out is not sent.

Good to know:

- A note that has ended: false, and nothing sent, so a late gesture does not land on the next note
  to use that channel.
- Returns true when sent.

```lua
-- Lua: a knob presses the last note played
function onValueChange(value)
  if state.id then
    ce.mpe.express(state.id, { pressure = value / 127 })
  end
end
```
```js
// JavaScript
function onValueChange(value) {
  if (state.id) ce.mpe.express(state.id, { pressure: value / 127 });
}
```

### `ce.mpe.noteOff(id [, velocity]) -> boolean`

End a note.

Example: `ce.mpe.noteOff(id)` releases the note.

- `id` (number, required): The note's id.
- `velocity` (number, optional): The release velocity, 0 to 127.<br>Left out: 64.

Good to know:

- Returns true when the note was sounding; false when it had already ended.

### `ce.mpe.allOff() -> number`

End every note the panel is playing through MPE, and set every member channel's bend back to the middle.

Example: `ce.mpe.allOff()` in `onPanelClose` leaves the synth silent.

Good to know:

- Returns how many notes were ended.
- `ce.midi.panic` ends these too, and every other note.

### `ce.mpe.notes() -> list`

The notes sounding now.

Example: `#ce.mpe.notes()` is how many are held.

Good to know:

- Returns a list of `{ id, note, channel, velocity, bend, pressure, timbre }`, oldest first; none: an
  empty list.

## MPE coming in

An MPE controller (a Seaboard, a LinnStrument, an Osmose) sends each note on its own channel, with its
bend, pressure and timbre on that channel. Read as plain MIDI, that is sixteen channels of bends and
pressures with no note attached. `listen` turns it back into notes.

### `ce.mpe.listen([opts]) -> boolean`

Read MPE from a device: give each note an id, and raise `expressionIn` as it moves.

Example: `ce.mpe.listen({ from = "controller" })` reads MPE from the device the panel calls "controller".

- `opts` (options, optional): The options below.

Good to know:

- While listening, `noteIn` and `noteOffIn` from that device carry `note.id`, the same id
  `expressionIn` uses, and `bendIn`, `pressureIn` and controller 74 on its member channels are
  raised as `expressionIn` instead.
- The zone comes from the MPE Configuration Message the device sends when it starts, when it sends
  one; else from `zone` and `members` here.
- Returns true when listening. `listen({ off = true })` stops.

**`opts`** can contain:

| Name | Type | Default | What it does |
|---|---|---|---|
| `from` | text | every input | The device, by its role. |
| `zone` | text | `"lower"` | Until the device says otherwise. |
| `members` | number (1 to 15) | 15 | Until the device says otherwise. |
| `bendRange` | number (semitones) | 48 | For turning a member channel's bend into semitones. |
| `off` | on/off | off | Stop listening. |

### `expressionIn`: a sounding note moved

| Field | What it holds |
|---|---|
| `id` | The note's id, as `noteIn` gave it. |
| `note` | The note, 0 to 127. |
| `channel` | The member channel it sounds on. |
| `bend` | Its pitch bend, in semitones. |
| `pressure` | 0 to 1. |
| `timbre` | 0 to 1 (controller 74). |
| `changed` | Which moved this time: `"bend"`, `"pressure"` or `"timbre"`. |
| `from` | The device. |

Good to know:

- Thinned per note as the rules say: at most every 10 ms, the latest values.
- Expression on a channel with no sounding note is dropped, as Hostage's MPE module drops it.

```lua
-- Lua: an MPE controller's notes, played on the synth through MPE
function onPanelLoad()
  state.out = {}
  ce.mpe.listen({ from = "controller" })
end

function onNoteIn(note)
  if note.from == "controller" then state.out[note.id] = ce.mpe.noteOn(note.note, note.velocity) end
end

function onExpressionIn(e)
  local out = state.out[e.id]
  if out then ce.mpe.express(out, { bend = e.bend, pressure = e.pressure, timbre = e.timbre }) end
end

function onNoteOffIn(note)
  local out = state.out[note.id]
  if out then ce.mpe.noteOff(out); state.out[note.id] = nil end
end
```

## Build steps

Four steps. Each event and command goes into `panelApi.js`, the WebView runtime and the window-shut
engines, with one shared table of incoming messages and the events they must give, run against every
runtime. The plain-description rules in [api-descriptions-handoff.md](api-descriptions-handoff.md)
apply to every text above.

| Step | What | Builds on |
|---|---|---|
| 1. Input in the panel view | The seven events, and `from` on every input event | The WebView's MIDI input path that raises `noteIn` and `ccIn` today |
| 2. Input with the window shut | The same, decoded once in C++ and handed to each engine | The player host's input path |
| 3. MPE out | `zone`, `noteOn`, `express`, `noteOff`, `allOff`, `notes` | JUCE's `MPEZoneLayout` and `MPEChannelAssigner` for the native engines; a small port of the same rules for the WebView |
| 4. MPE in | `listen`, `expressionIn`, ids on `noteIn` | JUCE's `MPEInstrument`; `MpeTransformer.h` for the stale-expression rule |

## Open decisions

- [ ] Whether `ccIn` and `midiIn` should count channels from 1, as every other MIDI command and event
  does. It breaks scripts written for the old count; the release notes would say so, as they did
  when zones and phrase cells moved to counting from 1.
- [ ] Whether 14-bit controllers (0 to 31 paired with 32 to 63) get an event of their own. It would
  have to be asked for per controller, or a device that sends controller 1 alone would be heard late.
- [ ] Whether the Note Ribbon, Chord Pad and Drum Pads should get an "MPE out" setting, so a panel
  plays MPE without a script, as Hostage's MPE module already does for the rack.
- [ ] How this meets MIDI 2.0, where per-note expression needs no channel per note
  ([midi2-integration-plan.md](midi2-integration-plan.md)). Note ids, not channels, are what scripts
  hold, so a MIDI 2.0 path could replace the channels later without changing a script.
