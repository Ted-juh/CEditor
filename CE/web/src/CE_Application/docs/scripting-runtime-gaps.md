# Scripting Runtime — Unwired API Gaps

> Status: **findings / to-do.** An audit of what the JS panel API advertises vs
> what the live C++ script runtime actually backs. Part of the
> [panel parts backlog](./README.md).

## TL;DR

It's mostly a **wiring** gap, not a missing-import gap. The JUCE classes needed
are already imported and in use — `juce::Timer` (`DeviceProfileService`,
`PluginProcessor`, the VST build job) and `juce::MidiInput` / `MidiOutput` /
`MidiMessage` (`DeviceProfileService`). What's missing is routing those into the
live runtime's event dispatch and host API.

Scope note: the C++ `ScriptRuntime` is wired **only in the Player** (exported
plugin, `CE/src/Player/PluginProcessor.h`). In the editor, scripts run in the JS
preview simulator. So these gaps affect runtime / exported panels.

## What the C++ runtime dispatches today

From `PluginProcessor.h` + `ScriptRuntime.cpp`:

- `onValueChanged`
- `onDumpReceived` (only on the `dumpMessageParsed` device callback)
- Lifecycle: `onPanelLoad` / `onPanelReady` / `onPanelClose` /
  `onDawSaveState` / `onDawRestoreState`

`ScriptHostApi` (outbound) backs: `getValue` / `setValue`, `sendCC` /
`sendNRPN` / `sendSysex`, `requestDump` / `applyDump` / `sendDump` /
`buildDump`, `runAction`, `emitEvent`, `log`.

> ⚠️ **Interface ≠ implementation** (audit 2026-08-02): the Player's callbacks
> for `runAction` and `emitEvent` are **no-op stubs** (`PluginProcessor.h`
> ~583), and `buildDump` unconditionally returns an empty var — the interface
> exists, but `run()`/`emit()`/`on(custom)` and `buildDump()` do nothing in the
> exported plugin today (they are also stubbed in the editor preview). The
> `availability` metadata in `panelApi.js` reflects this.

## Advertised in `panelApi.js` but NOT wired in C++

### Inbound events (no `dispatchEvent` for these)
- ✅ **WIRED** (Player runtime, unverified by build): `onParameterReceived`
  (per decoded dump value), `onMidiIn`, `onCcIn`, `onSysexIn` — routed by
  extending `installScriptDeviceCallback` in `PluginProcessor.h` (branches on the
  existing `midiInputMessage` / `sysexInputMessage` / `dumpMessageParsed` events;
  hex→bytes). No `DeviceProfileService` change was needed.
- ✅ **WIRED**: `onTimer` — via the new `TimerManager` (see
  [timer-system.md](./timer-system.md)).
- Still open: `onDeviceConnected` / `onDeviceDisconnected`,
  `onControlChanged` / `onPanelStateChanged`; and the **editor-preview (JS)** side
  of the raw inbound events (this wired the C++ Player runtime only).

### Outbound host API
- ✅ **DONE**: `startTimer` / `stopTimer` — backed by the `juce::Timer`-based
  `TimerManager` (`CE/src/Scripting/TimerManager.h`), registered in the JS and
  Lua engines (see [timer-system.md](./timer-system.md)).
- ✅ `checksum` and the encoding helpers (`to7bit` / `to14bit` / `toNibbles` /
  `nibblize` / …) are installed engine-side in `JsScriptEngine` /
  `LuaScriptEngine` / `PythonScriptEngine`. (Earlier drafts named `buildSysex`
  and `to14Bit` — the actual members are `sendSysex` and lowercase `to14bit`.)

## JUCE classes involved

| Capability | JUCE class | Status |
|------------|-----------|--------|
| Timers (`startTimer` / `onTimer`) | `juce::Timer` | Used elsewhere; **not** in the scripting layer yet — add via `TimerManager`. |
| Raw / decoded MIDI in (`onMidiIn` / `onSysexIn` / `onParameterReceived`) | `juce::MidiInput`, `juce::MidiMessage` | Already imported + received in `DeviceProfileService`; **just route to `dispatchEvent`**. |
| Device connect/disconnect | `juce::MidiInput` device enumeration | Already available in `DeviceProfileService`; wire to events. |
| MIDI out (`sendCC` / `sendSysex`) | `juce::MidiOutput`, `juce::MidiMessage` | **Already wired** via `BridgeScriptHost` callbacks → `DeviceProfileService`. |

## To-do

- [ ] Route `DeviceProfileService`'s existing MIDI-in / decode path to
  `scriptRuntime->dispatchEvent("onParameterReceived" / "onMidiIn" / "onCcIn" /
  "onSysexIn", …)` (today its `setEventCallback` only forwards
  `dumpMessageParsed` → `onDumpReceived`).
- [ ] Dispatch `onDeviceConnected` / `onDeviceDisconnected` from device
  enumeration.
- [ ] Dispatch `onControlChanged` / `onPanelStateChanged`.
- [x] Add `startTimer` / `stopTimer` + `onTimer` via the `TimerManager`
  (see [timer-system.md](./timer-system.md)).
- [x] Confirm `checksum` / `to14bit` and the other encoding helpers are
  installed in every script engine (JS / Lua / Python — verified in source).
- [x] Surface these gaps to users: `panelApi.js` now carries `availability`
  metadata per member (rendered as badges in the generated
  `docs/scripting-manual.md`). **Update it when closing a gap here.**
- [ ] Keep `panelApi.js` and the C++ side in sync (the header already says so).

## Add findings below
<!-- New gaps go here as they surface. -->

- **`onDumpReceived` payload diverges between runtimes** (audit 2026-08-02):
  the API contract (and `panelApi.js`) says `dump.bytes` / `dump.kind`, but the
  editor preview dispatches `{ values, kind, role }` (`panelRuntime.js`
  `onDumpParsed`). A script reading `dump.bytes` works only in the exported
  plugin; one reading `dump.values` works only in preview. Unify on the
  contract shape (or add both fields in both runtimes).
