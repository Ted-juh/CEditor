# `ce.osc`: Open Sound Control in and out

*Designed and approved by the owner on 2026-10-27. Built on 2026-10-28 on the `script-modules-build` branch; what differs from this record is listed in [the roadmap](script-modules-roadmap.md).* `ce.osc` lets a panel receive and
send Open Sound Control: from a tablet running TouchOSC or Lemur, from Max or Pure Data, to a DAW or a
lighting desk. 8 commands and 1 event for scripts, and OSC learn on a control for panels without a
script. It runs everywhere: the editor, the player, and an exported plug-in with its window open or
shut. Every entry is written in the scripting manual's form, so it can go into `panelApi.js` as it
stands. Ninth and last in [Script modules: what is missing](script-modules-roadmap.md).

## What exists today

- **No OSC, no open port.** JUCE's OSC module is in the tree but no target links it. The app opens no
  UDP or TCP port; its only network use is an update check, off by default because it shows GitHub
  the computer's address (`ValueTreeBridgeHandlers.cpp`).
- **A plan for a tablet panel.** [product-ideas.md](product-ideas.md) describes showing the panel
  itself on a tablet through a small web server, with a pairing code and off by default. That is a
  different thing: the panel on the tablet. OSC is for the tablet apps and programs people already
  use.
- **MIDI learn exists**, and OSC learn can follow its shape: a binding on the control
  (`DeviceBindings`), written into the preview without echoing back out, and carried into the
  exported plug-in.

**What JUCE's OSC module cannot read.** It knows five argument types: whole number, decimal number,
text, bytes and colour. A message with any other type (a double-precision number, true, false,
nothing, a time) makes it drop the whole packet (`juce_OSCReceiver.cpp`, `OSCFormatError`). Max, Pure
Data and DAWs can send those types. So `ce.osc` reads and writes OSC itself, over JUCE's plain UDP
socket; OSC's format is small enough for that.

## Everything at a glance

| New | Kind | What it gives |
|---|---|---|
| `ce.osc.listen`, `stop` | command | Start and stop receiving on a port |
| `ce.osc.on`, `off` | command | Run a function for messages to an address, wildcards allowed |
| `oscIn` | event | Every message received, for a script that wants them all |
| `ce.osc.target` | command | Give a destination a name, such as "tablet" |
| `ce.osc.send`, `bundle` | command | Send one message, or several that belong together |
| `ce.osc.status` | command | Is it listening, on which port, what was received, sent and dropped |
| OSC learn | panel | A control follows an OSC address and sends its value back, with no script |

## Rules every command keeps

- **Nothing opens until asked.** No port is opened when a panel loads; only `listen`, or a control
  with OSC learn, opens one.
- **This computer freely, the network only with a yes.** Listening on this computer only, and sending
  to it, needs no question. Listening on the network, or sending to another computer, asks the user
  once per panel: "This panel wants to receive OSC from your network on port 8000" or "…send OSC to
  192.168.1.20". The answer is kept on this computer, never in the panel file, as `ce.file` keeps its
  grants ([ce-file-module.md](ce-file-module.md)). A panel shared with someone asks them again.
- **Every common OSC type, both ways.** Read and written by `ce.osc`'s own code, not JUCE's, so no
  message is dropped for its types:

  | OSC type | Tag | A script gets |
  |---|---|---|
  | 32-bit and 64-bit whole numbers | `i` `h` | a number |
  | 32-bit and 64-bit decimal numbers | `f` `d` | a number |
  | text, symbol | `s` `S` | text |
  | true, false | `T` `F` | on/off |
  | nothing, impulse | `N` `I` | nothing; the impulse as true |
  | bytes | `b` | bytes |
  | colour | `r` | text, `"#RRGGBBAA"` |
  | MIDI message | `m` | a list of bytes |
  | time, character | `t` `c` | a number; text |

- **UDP, as OSC almost always is.** A message can be lost and nothing says so; a packet is at most
  64 KB. TCP and the SLIP framing some programs use are left out.
- **Bundles arrive in order, at once.** Their messages are delivered one after another as they arrive;
  the bundle's time is given, not waited for.
- **One port, one owner.** In a DAW every plug-in instance is its own listener. A second instance on a
  port in use is refused with the reason, not silently deaf; `listen` can take the next free port
  instead.
- **Nothing on the audio thread.** Packets are read on a network thread, put in a queue, and handed to
  scripts on the message thread at least every 10 ms, in the order they came. A queue that overflows
  drops the newest and counts them, as MIDI input does today (`HostMidiInputQueue.h`).
- **No echo.** A control moved by OSC sends nothing back to the address it came from, and `origin()`
  gives `"osc"` for it ([ce-daw-module.md](ce-daw-module.md)).

## Receiving

Every message a script receives looks the same:

| Field | What it holds |
|---|---|
| `address` | Where it was sent, such as `"/synth/filter/cutoff"`. |
| `args` | Its values, in order, as the types table says. |
| `types` | Its type tags as text, such as `"if"`, for a script that needs to tell `1` from `1.0`. |
| `from` | `{ host, port }`: who sent it. Can be passed to `send` to answer. |
| `time` | The bundle's time, for a message that came in a bundle; else nothing. |

### `ce.osc.listen([opts]) -> boolean`

Start receiving OSC.

Example: `ce.osc.listen({ port = 8000, network = true })` receives from a tablet on the same network,
after the user says yes.

- `opts` (options, optional): `port`, 1024 to 65535 (default 8000); `network`, true to receive from
  other computers (default false: this computer only); `nextFree`, true to take the next free port
  when this one is in use.

Good to know:

- With `network`, the user is asked the first time; listening starts when they say yes. `status` says
  whether it is waiting.
- The port actually used is in `status().port`; with `nextFree` it may not be the one asked for, so
  show it where the user can type it into the tablet.
- Calling it again with other options moves to the new port.
- Returns true when listening or waiting for the user's answer; false when the port is in use, the
  user said no, or the port is out of range. `status().error` says which.

### `ce.osc.stop() -> boolean`

Stop receiving and close the port.

Example: `ce.osc.stop()` from an "OSC off" switch.

Good to know:

- Closed by itself when the panel closes. Controls with OSC learn keep the port open until they are
  gone too.
- Returns true when a port was open.

### `ce.osc.on(pattern, fn) -> id`

Run a function for every message to an address.

Example: `ce.osc.on("/fader/*", fn)` runs `fn` for `/fader/1`, `/fader/2` and so on.

- `pattern` (text, required): An address, with OSC's wildcards if needed: `*` any part of a name, `?`
  one character, `[1-4]` one of a range, `{cutoff,reso}` one of a list.
- `fn` (function, required): Called with the message.

Good to know:

- Several patterns can match one message; each function runs, in the order they were made.
- A script's patterns are removed when it reloads.
- Returns an id for `off`.

### `ce.osc.off(id) -> boolean`

Remove a pattern `on` made.

Example: `ce.osc.off(state.faders)`.

- `id` (number, required): The id `on` gave.

Good to know:

- Returns true when there was one.

### `oscIn`: a message arrived

The payload is the message. Panel-wide, heard with `on("oscIn", fn)` or `onOscIn(msg)` in the panel
script; raised for every message, whether or not a pattern matched it.

```lua
-- Lua: eight faders on a tablet move the eight sliders on the panel
function onPanelReady()
  ce.osc.listen({ port = 8000, network = true })
  ce.osc.on("/fader/[1-8]", function(msg)
    local n = tonumber(msg.address:match("(%d)$"))
    set("Slider" .. n .. ".value", msg.args[1] * 127)
  end)
end
```
```js
// JavaScript
function onPanelReady() {
  ce.osc.listen({ port: 8000, network: true });
  ce.osc.on("/fader/[1-8]", (msg) => {
    const n = Number(msg.address.slice(-1));
    set(`Slider${n}.value`, msg.args[0] * 127);
  });
}
```

## Sending

### `ce.osc.target(name, address) -> boolean`

Give a destination a name, so `send` can use it.

Example: `ce.osc.target("tablet", "192.168.1.20:9000")`.

- `name` (text, required): The name scripts will use.
- `address` (text or table, required): `"host:port"`, or `{ host, port }`, or a message's `from`.
  Nothing: forget the name.

Good to know:

- Another computer asks the user once, as the rules say; this computer (`"127.0.0.1"` or
  `"localhost"`) does not.
- Names belong to the panel and are shared by its scripts; they are kept until the panel closes.
- Returns true when set, or waiting for the user's answer.

### `ce.osc.send(to, address [, args [, types]]) -> boolean`

Send one message.

Example: `ce.osc.send("tablet", "/label/1", "Cutoff")` sets a label in TouchOSC.

- `to` (text or table, required): A name from `target`, `"host:port"`, or a message's `from` to answer
  it.
- `address` (text, required): Where to send it, starting with `/`.
- `args` (list or one value, optional): The values. Every number goes as `f`, the type most receivers
  expect; text as `s`, on/off as `T` or `F`, bytes as `b`. A whole number needs `types` `"i"`, because
  some languages cannot tell `1` from `1.0`.
- `types` (text, optional): The type tags to use instead, such as `"d"` for a double-precision number
  or `"h"` for a 64-bit whole number; one per value.

Good to know:

- Sending never waits: messages go out from a network thread, in the order sent.
- An unnamed address on another computer asks the user, as `target` does; until the answer, the
  message waits.
- Returns true when queued; false for an address that is not OSC (no leading `/`), a `types` that does
  not fit the values, or a destination the user refused.

### `ce.osc.bundle(to, messages [, opts]) -> boolean`

Send several messages as one packet, so they arrive together.

Example: `ce.osc.bundle("tablet", { { address = "/fader/1", args = { 0.5 } }, { address = "/label/1",
args = { "64" } } })`.

- `to` (text or table, required): As `send` takes it.
- `messages` (list, required): A list of `{ address, args, types }`.
- `opts` (options, optional): `time`, when the receiver should act on it, for a receiver that
  schedules bundles. Left out: at once.

Good to know:

- For a tablet showing many values: one bundle for a page of faders is one packet, not twenty.
- A bundle larger than 64 KB is refused; split it.
- Returns true when queued.

### `ce.osc.status() -> table`

What OSC is doing.

Example: `ce.osc.status().port` is the port to type into the tablet.

Good to know:

- Returns `{ listening, waiting, port, network, received, sent, dropped, error }`: `waiting` while the
  user has not answered; `received`, `sent` and `dropped` counted since the panel opened; `error` the
  last reason something was refused, such as `"portInUse"`, `"refusedByUser"` or `"badPacket"`.

```lua
-- Lua: send the knob's value to the tablet, so its fader follows the panel
function onValueChanged(value)
  if origin() ~= "osc" then
    ce.osc.send("tablet", "/fader/1", value / 127)
  end
end
```
```js
// JavaScript
function onValueChanged(value) {
  if (origin() !== "osc") ce.osc.send("tablet", "/fader/1", value / 127);
}
```

## Panel side: OSC learn

Most people want a tablet fader to move a knob, and the knob to move the fader back. That needs no
script: it is a binding on the control, beside MIDI learn, made the same way.

**On a control** (the bindings editor, next to MIDI control bindings; stored in `DeviceBindings` as
`kind: "oscControl"`):

| Setting | Default | What it does |
|---|---|---|
| Address | Learned | The OSC address that moves the control, such as `/fader/1`. "Learn" takes the next message that arrives. |
| Value | 1 | Which of the message's values to use, for a message that carries several (an XY pad sends two). |
| Range | 0 to 1 | The range the sender uses; it is scaled to the control's own range. TouchOSC sends 0 to 1. |
| Send back | On | When the control moves for any other reason (a hand, a dump, the DAW), send its value to the address, so the tablet follows. Never for a move that came from that address. |
| Send to | The sender | Where to send back: the computer the last message came from, or a named target. |

**On the panel** (the panel's settings, beside the panic key):

| Setting | Default | What it does |
|---|---|---|
| OSC port | 8000 | The port the panel listens on when a control has an OSC binding. |
| From the network | Off | Receive from other computers; the user is asked once, as for scripts. |
| Targets | none | Named destinations, such as `tablet = 192.168.1.20:9000`, for "Send to" and for scripts. |

Good to know:

- **In an exported plug-in** the bindings and the panel settings are baked in, as MIDI control
  bindings are (`exportParameters.js`). Each instance keeps its own port in its saved state, so two
  instances in one project do not fight over one port; the second takes the next free one and shows
  it.
- A control moved by OSC writes straight into the panel, as MIDI learn does, so it does not echo back
  out; scripts see `origin()` as `"osc"`.
- The panel's settings show the port actually in use and the computer's own address, for typing into
  the tablet.

## Found on the way

| What | Where | Effect today |
|---|---|---|
| JUCE's OSC receiver drops a whole packet for one argument type it does not know | `juce_OSCReceiver.cpp`: an unknown tag throws `OSCFormatError` | Messages with doubles, true/false or nothing in them never arrive; why `ce.osc` reads OSC itself |
| JUCE's OSC receiver binds its port without allowing reuse | `juce_OSCReceiver.cpp` | A second plug-in instance on the same port cannot listen; `ce.osc` reports it and can take the next port |
| "The plugin never opens a port itself" | Comment in `PluginProcessor.h`; release audit finding C-27 says profile-bound sends do open a MIDI output | The comment is wrong already, and will be more wrong with OSC |

## Build steps

Three steps. The socket, the OSC reading and writing and the queue live once in C++, shared by the
editor and the exported plug-in; the panel view reaches them over the bridge and the window-shut
engines through the host callbacks, as `ce.device` does. Only JUCE's `DatagramSocket` (in `juce_core`)
is needed, not `juce_osc`. The plain-description rules in
[api-descriptions-handoff.md](api-descriptions-handoff.md) apply to every text above.

| Step | What | Builds on |
|---|---|---|
| 1. The transport | The OSC reader and writer for every type in the rules, tested with packets captured from TouchOSC, Max and Pure Data; the socket on a network thread; the queue drained every 10 ms; the user's yes for the network, kept per panel; `listen`, `stop`, `status` | `DatagramSocket`; `HostMidiInputQueue.h` for the queue; `ce.file`'s grants for the yes; `InboundScope` so incoming values do not echo |
| 2. Scripts | `on`, `off`, `oscIn`, `target`, `send`, `bundle` in the panel view and every window-shut engine | The bridge pattern of `ce.device.ports`; `deviceQuery` in `BridgeScriptHost.h` |
| 3. OSC learn | The `oscControl` binding, learn, send back, the panel's OSC settings, baked into the plug-in with a port per instance | `midiControlBindings.js`, `midiLearnTap.js`, `DeviceBindingsEditor.svelte`, `exportParameters.js`, `getStateInformation` |

## Open decisions

- [ ] Write our own OSC reader, as above, or patch the vendored JUCE module to read every type. The
  tree already carries vendored JUCE patches; our own code avoids another.
- [ ] Whether the computer announces itself on the network (Bonjour/mDNS), so TouchOSC finds it
  without typing an address. It means one more library and one more thing listening.
- [ ] TCP and SLIP framing, which a few programs use instead of UDP. Left out until someone needs it.
- [ ] How this meets the tablet panel in `product-ideas.md`. That shows the panel itself on a tablet;
  OSC talks to apps already on the tablet. Both could share the "network, with a yes" setting.
