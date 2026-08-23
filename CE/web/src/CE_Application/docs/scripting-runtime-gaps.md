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
- Lifecycle: `onPanelLoad` / `onPanelReady` / `onPanelClose` / `onPanelDestroy` /
  `onDawSaveState` / `onDawRestoreState` / `onError`

`ScriptHostApi` (outbound) backs: `getValue` / `setValue`, `sendCC` /
`sendNRPN` / `sendSysex`, `requestDump` / `applyDump` / `sendDump` /
`buildDump`, `runAction`, `emitEvent`, `log`.

> ✅ **FIXED** (2026-08-02, unverified by build on the C++ side): `run()` and
> `emit()`/`on(custom)` are now wired in BOTH runtimes. Player:
> `cb.runAction`/`cb.emitEvent` call the new `ScriptRuntime::runAction` and
> `dispatchEvent` (depth-guarded); `dispatchEvent` also delivers the
> `"valueChanged"` ↔ `"onValueChanged"` listener alias, and the Lua/JS engines
> accept the 2-arg `on(name, fn)` custom form. Preview: `panelRuntime.js`
> implements the same semantics (listener registry, emit-chain guard, sync
> `run()` return for JS/TS/C++/C#/Java targets) — covered by
> `test/scriptFlow.test.js`. Two things stayed open and are listed under **Still open** below,
> rather than here — a gap buried in the tail of a ✅ FIXED blockquote is a gap nobody reads.

## Advertised in `panelApi.js` but NOT wired in C++

### Inbound events (no `dispatchEvent` for these)
- ✅ **WIRED** (Player runtime, unverified by build): `onParameterReceived`
  (per decoded dump value), `onMidiIn`, `onCcIn`, `onSysexIn` — routed by
  extending `installScriptDeviceCallback` in `PluginProcessor.h` (branches on the
  existing `midiInputMessage` / `sysexInputMessage` / `dumpMessageParsed` events;
  hex→bytes). No `DeviceProfileService` change was needed.
- ✅ **WIRED**: `onTimer` — via the new `TimerManager` (see
  [timer-system.md](./timer-system.md)).
- ✅ **WIRED** (2026-08-03): `onDeviceConnected` / `onDeviceDisconnected` (both
  runtimes, from the DPD session-state `ready` transitions), `onControlChanged`
  (both runtimes), `onStateChanged` (preview session diff — a UI event), and the
  **editor-preview (JS)** side of the raw inbound events (`onMidiIn` / `onCcIn` /
  `onNoteIn` / `onSysexIn` via the bridge's midi/sysex input events, plus
  per-parameter `onParameterReceived` from decoded dumps).
- ✅ **WIRED on the C++ side too** (verified 2026-08-23): `PluginProcessor.h` dispatches `onMidiIn`
  (:679), `onCcIn` (:687), `onNoteIn`/`onNoteOffIn` (:742), `onSysexIn` (:762) and
  `onParameterReceived` (:819), alongside `onTransport`, `onBeat`, `onBar`, `onValueChanged`,
  `onPresetChange` and `onDumpReceived`. The entry above described the editor-preview half only.
- ~~Still open: `onPanelStateChanged`~~ — **gone, not pending.** `panelApi.js:505` records that it
  was removed: there is no panel-state feature in the model for it to observe, so the event was
  withdrawn rather than left advertised-and-undispatched. `ALL_EVENTS`' panel group is
  `onControlChanged` and `onTimer`.

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
| Timers (`startTimer` / `onTimer`) | `juce::Timer` | ✅ **Done** — `CE/src/Scripting/TimerManager.h`, held by `PluginProcessor` behind `CEDITOR_SCRIPTING` and built by CI, which configures `-DCEDITOR_SCRIPTING=ON`. Registered in the JS, Lua **and Python** engines (`PythonScriptEngine.cpp:424`). |
| Raw / decoded MIDI in (`onMidiIn` / `onSysexIn` / `onParameterReceived`) | `juce::MidiInput`, `juce::MidiMessage` | ✅ **Done** — dispatched from `PluginProcessor.h:679–819`. |
| Device connect/disconnect | `juce::MidiInput` device enumeration | ✅ **Done** — from the DPD session-state `ready` transitions, both runtimes. |
| MIDI out (`sendCC` / `sendSysex`) | `juce::MidiOutput`, `juce::MidiMessage` | **Already wired** via `BridgeScriptHost` callbacks → `DeviceProfileService`. |

## Still open

The short list, kept at the top level on purpose. Both were previously a trailing sentence inside a
"✅ FIXED" blockquote above, which is a good way to have a gap and not know it. Re-verified against
the tree on 2026-08-23.

- [x] ~~**`buildDump`** returns an empty var in the Player~~ — **done 2026-08-23** in the Player.
  `DeviceProfileEngine::buildDumpMessage` is the inverse of `parseDumpMessage`, built from the same
  pieces so the two cannot drift: `validateAndEncodeValue` is the encoder a knob move already uses,
  `parsePatternBytes` builds the prefix the parser matches, and the checksum comes from the shared
  `ce::checksums` table the verifier reads. The Player gathers values from the panel — every dump
  mapping names a device parameter, and `panelParams` already knows which control drives which.

  The assertion that matters is a ROUND TRIP, in `DeviceProfileEngineTests`: build a GAIA Patch
  Common from semantic values, parse the bytes back with the existing decoder, require the values to
  return. Asserting on bytes would only prove the builder agrees with itself.

  Two things worth knowing. Parameters no control is bound to are **not** an error — they keep the
  definition's default bytes and come back in `unmapped`, so a script can tell it is about to send a
  patch that is mostly defaults. And a non-numeric value is **coerced, not refused**: JUCE's `var`
  gives 0.0, which is in range, and that is the shared encoder every knob move goes through — pinned
  by test rather than changed, since changing it would change the knob path too.

  **Still open: the editor preview**, which returns null. The preview has no `DeviceProfileEngine`
  in-process, so it needs the bridge round-trip the other device reads use.
- [x] ~~**C++ / C# / Java preview interpreters cannot register `on()` callbacks**~~ — **done
  2026-08-23**, via a `setup` entry point rather than the top-level execution this line proposed.
  That proposal was wrong: a bare statement at file scope is illegal in all three languages, so
  there is no top-level code to run and copying `loadHandlersJs` could not have worked. What a
  person writes is a function, so `setup` (or `Setup`) is called once at load with the same `ctx`
  the handlers get.

  Everything it needed already existed — `api.on` is spread into `ctx`, and the interpreters already
  turn a named function into a JS callable when it is referenced as a value. The only missing piece
  was that nobody called `setup`. Pinned by `test/compiledPreviewSetup.test.js`, which checks both
  halves: that the listener registers, and that what `on()` receives is genuinely callable and
  reaches the script's body — the half that would otherwise fail at fire time rather than at load.

## To-do

This list drifted badly once: the body above said WIRED while these boxes stayed unchecked and the
table still said "just route to `dispatchEvent`", so the same file both claimed and denied the same
three things. Reconciled against the tree on 2026-08-23 — every box below was checked by looking at
the dispatch site, not at the paragraph above it.

- [x] Route `DeviceProfileService`'s existing MIDI-in / decode path to
  `scriptRuntime->dispatchEvent(…)` — done; `PluginProcessor.h:679–819`.
- [x] Dispatch `onDeviceConnected` / `onDeviceDisconnected` from device enumeration.
- [x] Dispatch `onControlChanged`. (`onPanelStateChanged` was removed from the API instead —
  see above.)
- [x] Add `startTimer` / `stopTimer` + `onTimer` via the `TimerManager`
  (see [timer-system.md](./timer-system.md)).
- [x] Confirm `checksum` / `to14bit` and the other encoding helpers are
  installed in every script engine (JS / Lua / Python — verified in source).
- [x] Surface these gaps to users: `panelApi.js` now carries `availability`
  metadata per member (rendered as badges in the generated
  `docs/scripting-manual.md`). **Update it when closing a gap here.**
- [x] Keep `panelApi.js` and the C++ side in sync — `panelApiParity.test.js` fails when they
  diverge, so this is enforced rather than remembered.

## Add findings below
<!-- New gaps go here as they surface. -->

- ✅ **FIXED** — `onDumpReceived` payload unified (2026-08-02): both runtimes
  now dispatch `{ values, kind, role, bytes }` — the Player adds `bytes` from
  the message hex (`PluginProcessor.h`), the preview parses `payload.hex`
  (`panelRuntime.js` `onDumpParsed`), and `panelApi.js`/the manual document
  that shape. (The old contract text claimed `bytes`/`kind` only, which neither
  runtime sent.)
