# MIDI Workbench — Setup · Monitor · Controller

> Status: **design / mostly-plumbed.** Backend MIDI plumbing already exists; the
> gap is a cohesive UI. Part of the [panel parts backlog](./README.md).
>
> Scope assumption: this is an **app-level tool** (like the DPD screens), because
> "setup" is inherently app-level. Several pieces could *also* ship as placeable
> panel components — see "Spin-off panel components". If you meant only the
> placeable widgets, say so and this re-scopes.

## Why

A MIDI device editor needs a first-class way to choose ports, watch traffic, and
fire test messages. Today these capabilities exist as backend calls and a store,
but the only UI is a 4–20 event peek in `ParameterBrowserTab.svelte`. There is
no unified Setup, no real Monitor, no Controller/tester.

## What already exists (don't rebuild)

From `DeviceProfile/DeviceRuntimeBridge.cpp` + `stores/deviceProfiles.js`:

- **Ports:** `listMidiInputs`, `listMidiDestinations`; normalization in
  `appSettingsSchema.js`.
- **Monitor feed:** `getMidiMonitorEvents` + `onMidiMonitorEvents` → the
  `midiMonitorEvents` writable store (currently only sliced to the last few).
- **Ingest:** `ingestIncomingMidiMessage`.
- **Roles / session:** `setDeviceRoleMapping`, `getDeviceSessionState`,
  `getDeviceTransportCapabilities`, `startDeviceSync`.
- **MIDI-CI:** `requestMidiCiDiscovery`, `setMidiCiProfile`.
- **Send / compile:** `compileParameterMessage`, `setDeviceParameter`,
  `compileRawMidiAction`, `triggerRawMidiAction`, `parseDumpMessage`.

So the backend is ~70% there. The work is a cohesive UI + filtering/decode/learn/
export, plus a few event-dispatch hooks (see scripting-runtime-gaps.md).

---

## 1. MIDI Setup

- Enumerate & select **input / output ports** (`listMidiInputs` /
  `listMidiDestinations`).
- Map ports to **device roles** (`setDeviceRoleMapping`) — main synth,
  controller, aux.
- Per-role: **channel**, **SysEx device ID**, MIDI-CI on/off.
- **Connection status** indicators (`getDeviceSessionState`); "Test / Identify"
  (`requestMidiCiDiscovery`, `getDeviceTransportCapabilities`).
- **Persist** the setup in app settings; reconnect on launch; handle
  hot-plug (device connect/disconnect).
- Optional: virtual / loopback port support; Bluetooth-MIDI pairing
  (see juce-capabilities.md).

## 2. MIDI Monitor

- **Live scrolling log** of IN and OUT (`onMidiMonitorEvents`), not just the
  last few.
- Columns: time, **direction**, port/role, channel, **type** (Note / CC / PB /
  PC / AT / SysEx / Clock / RT), data bytes (hex).
- **Decode toggle** — raw hex ↔ human via the DPD (`parseDumpMessage` / profile
  decode): e.g. `B0 4A 64` → "CC#74 ch1 = 100 → Cutoff".
- **Filters:** by direction, port, channel, type; one-click **mute noise**
  (Clock / Active Sensing).
- **SysEx viewer:** expandable hex + ASCII, length, manufacturer-ID lookup.
- **Controls:** pause / freeze, clear, autoscroll, buffer size, search/highlight.
- **Stats:** msgs/sec rate meter, running per-type counts.
- **Export / capture:** save log as text / CSV / `.syx`.

## 3. MIDI Controller / Tester (send side)

- Send arbitrary messages: Note on/off, CC, PC, Pitch Bend, Channel/Poly
  Pressure, **NRPN/RPN**, **raw SysEx** (`compileRawMidiAction` /
  `triggerRawMidiAction`).
- **Test keyboard** (note send), **CC sliders / XY pad** for quick CC sweeps.
- **SysEx sender** with hex editor + checksum helper (`checksum` / `to14Bit`).
- **Panic** — all-notes-off / reset-all-controllers.
- **Macro / sequence sender** — a list of messages with delays (ties into the
  [Timer system](./timer-system.md)).
- **Replay** captured monitor messages back out.

## 4. MIDI Learn (flagship)

A capture-to-bind mode that ties Setup + Monitor + binding together: arm Learn,
wiggle a hardware control, capture the incoming CC/NRPN/note, and **bind it to a
panel control / device parameter** (reuses the routing/binding layer). This is
the highest-value feature for a controller editor — surfaces the whole tool.

## Cross-cutting

- **Decode via DPD** so the monitor shows semantic parameter names, not just hex.
- **Scripting:** the monitor is the natural place to surface `onMidiIn` /
  `onSysexIn` / `onParameterReceived` — currently unwired
  (see [scripting-runtime-gaps.md](./scripting-runtime-gaps.md)).
- **MIDI 2.0 / UMP:** decode/show UMP + MIDI-CI Property Exchange traffic.

## Spin-off panel components (if the end-user-placeable angle is wanted)

- **MIDI Activity LED** — blink on in/out traffic (bind to a port/channel).
- **MIDI Monitor widget** — a compact live log placeable on a panel.
- **Panic button** — all-notes-off (a Button preset).
- **MIDI Learn helper** — a control that captures + binds inline.

## Status / effort

- Backend: ~70% present (ports, monitor buffer, send/compile, decode).
- Missing: the cohesive Setup/Monitor/Controller UI, filters/decode/export,
  MIDI Learn, and a few event-dispatch hooks.
- So "fully established/working" is mostly **UI work over existing plumbing**.

## Open questions / parking lot

- App tool vs placeable components vs both (default: app tool + spin-offs).
- Where does it live — a new editor screen alongside the DPD screens, or a dock?
- Monitor buffer size / persistence; does capture survive reloads?
- Does MIDI Learn write into device bindings, panel routes, or both?

## Add your ideas below
<!-- New MIDI workbench ideas go here. -->
