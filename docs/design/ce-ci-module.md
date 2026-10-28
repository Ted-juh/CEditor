# `ce.ci`: MIDI-CI for scripts

*Designed and approved by the owner on 2026-10-27. Built on 2026-10-28 on the `script-modules-build` branch; what differs from this record is listed in [the roadmap](script-modules-roadmap.md).* `ce.ci` lets a script ask a
MIDI-CI device who it is, read and change its properties, follow them as they change, and turn its
profiles on and off: 9 commands and 3 events. It runs wherever the device layer runs: the editor,
the player and an exported plug-in, with the window open or shut. One command, `draftProfile`, runs
in the panel view only. Every entry is written in the scripting manual's form, so it can go into
`panelApi.js` as it stands. Eighth in [Script modules: what is missing](script-modules-roadmap.md).

**Not yet tried on real hardware.** The app's MIDI-CI code has only ever talked to itself, in a
loopback test; no MIDI-CI device has been on the other end of the cable
([midi2-integration-plan.md](midi2-integration-plan.md),
[open-source-landscape.md](open-source-landscape.md)). Build step 1 is a test against a MIDI-CI
device or a MIDI-CI test tool before any command is added.

## What the app already does

- **Discovery.** "Discover Device (MIDI-CI)…" sends a Discovery on the device's output and listens
  for 6 seconds (`DeviceProfileServiceMidiCi.cpp`). For each device that answers it asks for
  DeviceInfo, ChannelList, AllCtrlList and ProgramList, and asks which profiles it has.
- **A draft profile.** The DPD tools turn those answers into a draft device profile
  (`import-midici.mjs`), shown on the Discovery screen.
- **Profiles on and off.** The Discovery screen can turn a device's profile on or off, for the whole
  device only.
- **Built on JUCE.** `MidiCiSession` uses JUCE's `midi_ci` module, which is linked into the editor,
  the player and the exported plug-in. Much of it is unused: setting a property, subscriptions, the
  identity a device gives in its Discovery reply, and every "something changed" callback.

**What scripts get today: nothing.** No event, no command; `panelApi.js` has no MIDI-CI or MIDI 2.0
entry. A script that wants to know whether a MIDI-CI device is there has to build the SysEx by hand.

## Everything at a glance

| New | Kind | What it gives |
|---|---|---|
| `ce.ci.discover` | command | Ask who is there; the devices that answer, with who they are and what they support |
| `ce.ci.devices` | command | The devices found so far, without asking again |
| `ce.ci.get` | command | Read a property: a device's info, controller list, program list or any resource it has |
| `ce.ci.set` | command | Change a property |
| `ce.ci.subscribe`, `unsubscribe` | command | Be told when a property changes on the device |
| `ce.ci.profiles` | command | The device's profiles, and which are on |
| `ce.ci.setProfile` | command | Turn a profile on or off |
| `ce.ci.draftProfile` | command | A draft device profile made from what the device reports (panel view only) |
| `ciDiscovered`, `ciDeviceRemoved` | event | A device answered; a device is gone |
| `ciProfileChanged` | event | A profile was turned on or off, by anyone |

## Rules every command keeps

- **One session per device, kept open.** The app talks MIDI-CI to a device through one session that
  lives as long as the device is connected. Replies are heard at any time, not only in a 6-second
  window, so a slow reply, a later `get` and a subscription all arrive. Today the session is made
  again on every Discovery, which gives the app a new address each time and ends any subscription.
- **A MUID is not a name.** MIDI-CI gives each device a random address, its MUID, which changes every
  time the device is switched on. Scripts may hold it for a session; to find a device again, keep its
  `manufacturer`, `family` and `model`.
- **Nothing waits.** Every command that talks to a device returns at once and calls its function when
  the answer comes, or when it does not: each has a timeout (default 3000 ms).
- **Errors are never silent.** A failed request gives `ok` false with the reason: no reply, the
  device's own status (404 for a resource it does not have, 405 for one it will not change) and its
  message. Today a failed property read is dropped.
- **Bodies come decoded.** A JSON body is given as a table; text as text; anything else as bytes with
  its `mediaType`. Mcoded7 and zlib packing are undone first, as JUCE's `Encodings` does it.
- **A device's limit is kept.** A device says how many property requests it takes at once; more wait
  their turn in order, rather than being refused by the device.
- **On the device's own MIDI ports.** MIDI-CI goes out on the role's hardware output and comes back on
  its input, as the device layer sends today. In a DAW these are the plug-in's own ports to the synth,
  not the DAW's MIDI track.
- **The same answers everywhere.** The session lives in the device layer in C++, so the panel view and
  the window-shut engines see the same devices, results and events.

## Finding devices

Every command that finds a device describes it the same way:

| Field | What it holds |
|---|---|
| `muid` | The device's MIDI-CI address for this session, a number. |
| `role` | The panel's device it was found on, such as `"mainSynth"`. |
| `manufacturer`, `family`, `model`, `version` | Who it is, as hex text in the form device profiles use (`"41"`, `"00 20 6B"`). From its Discovery reply, so every device has them. |
| `names` | `{ manufacturer, family, model, version }` as words, from its DeviceInfo; nothing for a device without property exchange. |
| `propertyExchange`, `profiles` | Whether it supports each. |
| `matchesProfile` | True when it is the synth the panel's device profile describes (its `identity`). |

### `ce.ci.discover([opts,] fn) -> boolean`

Ask who is there, and get the devices that answer.

Example: `ce.ci.discover(function(found) log(#found .. " MIDI-CI devices") end)`.

- `opts` (options, optional): `role`, the device's ports to ask on (left out: the main device);
  `timeoutMs`, how long to listen (default 3000).
- `fn` (function, required): Called once, when the time is up, with the list of devices that
  answered; none: an empty list.

Good to know:

- Each device is also raised as `ciDiscovered` as soon as it answers.
- A device that does not support MIDI-CI says nothing, so an empty list is the normal answer for most
  synths.
- Returns true when sent; false when the role has no hardware output.

### `ce.ci.devices([role]) -> list`

The devices found so far, without asking again.

Example: `#ce.ci.devices() > 0` is true once a MIDI-CI device has answered.

- `role` (text, optional): Only the devices on this role's ports. Left out: all.

Good to know:

- A device stays in the list until it says it is leaving, its ports close, or the next `discover` on
  that role does not find it.

### `ciDiscovered`: a device answered

The payload is the device, as the table above describes it. Raised for each answer to a `discover`,
and for a device that announces itself.

### `ciDeviceRemoved`: a device is gone

| Field | What it holds |
|---|---|
| `muid` | Its address. |
| `role` | The panel's device it was found on. |

Good to know:

- Its subscriptions end with it; their functions are called a last time with `command` `"end"`.

```lua
-- Lua: find the synth and show its name, or say it does not speak MIDI-CI
function onPanelReady()
  ce.ci.discover(function(found)
    for _, d in ipairs(found) do
      if d.matchesProfile then
        state.synth = d.muid
        ce.components.lcd.text("Display", 1, d.names and d.names.model or d.model)
        return
      end
    end
    ce.components.lcd.text("Display", 1, "No MIDI-CI")
  end)
end
```
```js
// JavaScript
function onPanelReady() {
  ce.ci.discover((found) => {
    const d = found.find((x) => x.matchesProfile);
    if (!d) return ce.components.lcd.text("Display", 1, "No MIDI-CI");
    state.synth = d.muid;
    ce.components.lcd.text("Display", 1, d.names?.model ?? d.model);
  });
}
```

## Property Exchange

A device that supports property exchange keeps named resources: its `DeviceInfo`, a `ResourceList`
naming the rest, controller lists (`AllCtrlList`, `ChCtrlList`), a `ProgramList`, and resources of its
own, whose names start with `X-`. Each is usually JSON.

### `ce.ci.get(muid, resource [, opts], fn) -> boolean`

Read a resource from a device.

Example: `ce.ci.get(state.synth, "ResourceList", fn)` gives the list of resources the device has.

- `muid` (number, required): The device, from `discover` or `devices`.
- `resource` (text, required): The resource's name, as the device names it.
- `opts` (options, optional): `resId`, for a resource that holds several items (one program, one
  channel); `offset` and `limit`, for a long list the device gives in pages; `timeoutMs`.
- `fn` (function, required): Called with the result.

Good to know:

- The result is `{ ok, status, message, body, mediaType }`: `status` the device's own (200 is fine),
  `body` decoded as the rules say.
- `ResourceList` first: it says which resources exist and whether each can be set or followed.
- Returns true when sent; false for a device without property exchange.

### `ce.ci.set(muid, resource, body [, opts], fn) -> boolean`

Change a resource on a device.

Example: `ce.ci.set(state.synth, "X-PatchName", { name = "Warm Pad" }, fn)` renames the patch on a
device that has that resource.

- `muid` (number, required): The device.
- `resource` (text, required): The resource's name.
- `body` (table, text or bytes, required): A table is sent as JSON; text as text; bytes as they are.
- `opts` (options, optional): `resId`; `partial`, true to send only the fields that change, for a
  device that allows it; `timeoutMs`.
- `fn` (function, required): Called with `{ ok, status, message }`.

Good to know:

- Changes the device, as `sendSysex` can; `ResourceList` says which resources a device lets be set.
- Returns true when sent.

### `ce.ci.subscribe(muid, resource [, opts], fn) -> id`

Be told when a resource changes on the device.

Example: `ce.ci.subscribe(state.synth, "ProgramList", fn)` calls `fn` when the user renames or stores
a program on the synth.

- `muid` (number, required): The device.
- `resource` (text, required): The resource's name.
- `opts` (options, optional): `resId`.
- `fn` (function, required): Called with each update.

Good to know:

- An update is `{ command, body }`. `command` is `"full"` (the whole resource), `"partial"` (only what
  changed), `"notify"` (it changed: `get` it again) or `"end"` (the device or the panel stopped it, or
  the device is gone).
- A device that refuses calls `fn` once with `command` `"end"` and `ok` false.
- Returns an id for `unsubscribe`; a device without property exchange: nothing.

### `ce.ci.unsubscribe(id) -> boolean`

Stop following a resource.

Example: `ce.ci.unsubscribe(state.programs)` in `onPanelClose`.

- `id` (number, required): The id `subscribe` gave.

Good to know:

- A script's subscriptions end when it reloads or the panel closes; the device is told.
- Returns true when there was one.

```lua
-- Lua: keep the synth's program names, and show the first four on an LCD
local function fill(result)
  if not result.ok then log("ProgramList: " .. result.status .. " " .. (result.message or "")) return end
  state.programNames = {}
  for i, p in ipairs(result.body) do state.programNames[i] = p.title end
  for row = 1, 4 do ce.components.lcd.text("Programs", row, state.programNames[row] or "") end
end

function onPanelReady()
  if not state.synth then return end
  ce.ci.get(state.synth, "ProgramList", fill)
  state.programs = ce.ci.subscribe(state.synth, "ProgramList", function(update)
    if update.command ~= "end" then ce.ci.get(state.synth, "ProgramList", fill) end
  end)
end
```
```js
// JavaScript
function fill(result) {
  if (!result.ok) return log(`ProgramList: ${result.status} ${result.message ?? ""}`);
  state.programNames = result.body.map((p) => p.title);
  for (let row = 1; row <= 4; row++) ce.components.lcd.text("Programs", row, state.programNames[row - 1] ?? "");
}

function onPanelReady() {
  if (!state.synth) return;
  ce.ci.get(state.synth, "ProgramList", fill);
  state.programs = ce.ci.subscribe(state.synth, "ProgramList", (update) => {
    if (update.command !== "end") ce.ci.get(state.synth, "ProgramList", fill);
  });
}
```

## Profiles, and a draft device profile

A MIDI-CI profile is an agreed way for a device to behave, such as a drawbar organ or a set of drum
controllers, which it can turn on for the whole device or for one channel. (Not to be confused with
CEditor's device profiles, the JSON files that describe a synth.)

### `ce.ci.profiles(muid [, fn]) -> list`

The device's profiles, and which are on.

Example: `ce.ci.profiles(state.synth)` gives what the last inquiry found.

- `muid` (number, required): The device.
- `fn` (function, optional): Ask the device again and call `fn` with the fresh list.

Good to know:

- Each is `{ id, name, address, enabled }`. `id` is the profile's five bytes as hex text
  (`"7E 21 09 01 00"`); `name` comes from a table of the profiles the MIDI Association has published,
  or is nothing; `address` is `"device"` or a channel, 1 to 16.
- Without `fn`: the list as last asked, answered at once.

### `ce.ci.setProfile(muid, id, on [, opts]) -> boolean`

Turn a profile on or off.

Example: `ce.ci.setProfile(state.synth, "7E 21 09 01 00", true)`.

- `muid` (number, required): The device.
- `id` (text, required): The profile, as `profiles` gives it.
- `on` (on/off, required): On or off.
- `opts` (options, optional): `channel`, 1 to 16, for a profile turned on per channel. Left out: the
  whole device.

Good to know:

- The device answers with its new state, raised as `ciProfileChanged`; a device that refuses raises
  nothing, and `profiles` still shows the old state.
- Returns true when sent.

### `ciProfileChanged`: a profile was turned on or off

| Field | What it holds |
|---|---|
| `muid` | The device. |
| `id`, `name` | The profile. |
| `address` | `"device"` or the channel. |
| `enabled` | Its new state. |

Good to know:

- Raised also when the user turns a profile on or off on the device itself.

### `ce.ci.draftProfile(muid, fn) -> boolean`

Make a draft device profile from what the device reports. Panel view only.

Example: `ce.ci.draftProfile(state.synth, function(draft) log(draft.summary.parameters .. " parameters")
end)`.

- `muid` (number, required): The device.
- `fn` (function, required): Called with `{ profile, summary }`: `profile` the draft as a table, ready
  to save as JSON; `summary` counts what it holds (`parameters`, `programs`) and lists what the device
  did not say.

Good to know:

- Asks for DeviceInfo, AllCtrlList, ChCtrlList and ProgramList, then builds the draft the way the
  Discovery screen does (`import-midici.mjs`), marked as partial.
- A starting point, not a finished profile: MIDI-CI says which controllers a device has, not its SysEx
  dumps.
- Once `ce.file` is built, `ce.file.save` writes it where the user chooses
  ([ce-file-module.md](ce-file-module.md)).
- Returns true when started; false for a device without property exchange, or outside the panel view.

## Found on the way

| What | Where | Effect today |
|---|---|---|
| Replies are heard only for 6 seconds after a Discovery (3 after a profile change) | `DeviceProfileServiceMessages.cpp` passes SysEx to the session only while `midiCiActive` | A slow device, a later read and every subscription are lost |
| The session is made again on every Discovery | `startMidiCiDiscovery` | The app's own MUID changes each time; a device's subscriptions to it end |
| A failed property read is dropped | `MidiCiSession::fetchProperty` | No error reaches the screen; a device that says 404 looks like one that never answered |
| The identity in a Discovery reply is never used | `getDiscoveryInfoForMuid` is never called | A MIDI-CI device is not matched to its device profile, though its reply carries the same manufacturer and model codes |
| `ChCtrlList` is never asked for | `startMidiCiDiscovery` asks for `AllCtrlList` and `ProgramList` only | Per-channel controllers are missing from the draft profile |
| Two shapes for a profile's `identity` | `dpd.schema.json` (`family`, `member`, `firmware`, hex text) and the profiles the engine reads (`familyCode`, `modelNumber`, `revision`, arrays) | `matchesProfile` has to read both until one is chosen |
| The device tab lists found profiles by a name they do not have | `DeviceWorkbenchTab.svelte` shows `profile.name ?? profile.profileId`; the entries are `{ muid, profile, … }` | Only the MUID shows |
| The MIDI 2.0 plan is behind the code | `midi2-integration-plan.md` names the wrong bridge event and line, says MIDI-CI is "compiled-in but not wired", and does not mark profile inquiry as built | A reader thinks less is built than is |

## Build steps

Four steps. The session lives once, in the device layer in C++; the panel view and the window-shut
engines reach it the way they reach the device layer today (`deviceQuery` in `BridgeScriptHost.h`).
JUCE 8.0.7's `midi_ci` module has everything below except Process Inquiry. The plain-description rules
in [api-descriptions-handoff.md](api-descriptions-handoff.md) apply to every text above.

| Step | What | Builds on |
|---|---|---|
| 1. Meet a real device | Run today's Discovery against a MIDI-CI device or test tool (JUCE's CapabilityInquiryDemo, MIDI2.0Workbench, ktmidi-ci-tool), and fix what that shows | `MidiCiSession`, the loopback tests in `DeviceProfileEngineTests.cpp` |
| 2. A session that stays | One session per role, open while the device is connected; replies heard at any time; errors reported; the Discovery identity used to match the device profile | `DeviceProfileServiceMidiCi.cpp`, the SysEx gate in `DeviceProfileServiceMessages.cpp`, `getDiscoveryInfoForMuid` |
| 3. Finding and reading | `discover`, `devices`, `get`, `profiles`, `ciDiscovered`, `ciDeviceRemoved`, `draftProfile` | `sendPropertyGetInquiry`, the `deviceAdded` and `deviceRemoved` callbacks, `import-midici.mjs` |
| 4. Changing and following | `set`, `subscribe`, `unsubscribe`, `setProfile` per channel, `ciProfileChanged` | `sendPropertySetInquiry`, `beginSubscription`, `propertySubscriptionDataReceived`, `profileEnablementChanged` |

## Open decisions

- [ ] Which real device to test with first. Nothing in the tree has met one; step 1 needs one, or a
  test tool on a second computer.
- [ ] Process Inquiry (asking a device for its current controller values). JUCE 8.0.7 does not support
  it; it would mean building the messages by hand, or waiting for a JUCE that does.
- [ ] Whether a panel can also *answer* MIDI-CI for an old synth, so other software sees the synth as
  a MIDI-CI device ([raising-the-bar.md](raising-the-bar.md), Thesis C). That is a responder, a much
  larger piece of work, and needs a newer JUCE for a virtual port; it is left out of `ce.ci`.
- [ ] Which `identity` shape device profiles keep, the schema's or the engine's.
