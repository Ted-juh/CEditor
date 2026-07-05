# CEditor Panel Scripting Runtime (C++ host — Milestone 1, tasks 5–7)

Model 2: scripts **always run here, in the C++ host, on the message thread** (never the audio
thread). One engine per language (Lua via Sol3, JavaScript via `juce_javascript`/QuickJS). A script
is stored and run in the language it was written in — **never converted**. The shared contract is the
panel API (mirrors `CE/web/src/CE_Application/scripting/panelApi.js`).

> **Status: written, NOT yet compiled.** Sol3, Lua, and `juce_javascript` are not in the current
> build. This module is **opt-in** (`-DCEDITOR_SCRIPTING=ON`) so the existing build is untouched
> until you wire it. Expect to fix build-specifics (especially the JS engine — see Confidence below).

## Files
| File | Role |
|------|------|
| `ScriptRuntime.h/.cpp` | Interfaces + routing: lifecycle hooks, event dispatch, origin/transmit tracking, error logging. Pure C++. |
| `LuaScriptEngine.cpp` | Lua 5.4 via Sol3. Per-script `sol::environment` isolation, native API bindings, pure-Lua helper prelude. |
| `JsScriptEngine.cpp` | JS via `juce::JavascriptEngine`. One engine per script, native `__api` object + JS prelude. |
| `BridgeScriptHost.h` | `ScriptHostApi` impl forwarding to app-supplied callbacks; computes transmit-by-default. |

## Build
```
cmake -B build -DCEDITOR_SCRIPTING=ON
```
Then add `ceditor_scripting` to the link libraries of the target that hosts scripts:
- **CEditor** (live authoring/preview),
- **CEditorPlayer** / **CEditorPlayerVST** (export).

The CMake block fetches Lua (walterschell/Lua → `lua_static`) and Sol3 (ThePhD/sol2), and links
`juce::juce_javascript`. Adjust the Lua provider/target name if you vendor Lua differently.

## Integration (the wiring left to do)
```cpp
using namespace ceditor::scripting;

BridgeScriptHost::Callbacks cb;
cb.getValue = [&](auto path, auto form) { return resolveAndReadValue (tree, path, form); };  // YOU: tree schema
cb.setValue = [&](auto path, auto value, bool transmit) {
    writeValueToTree (tree, path, value);                 // YOU: tree schema (control.value -> ValueTree)
    if (transmit) sendBoundMidiForPath (path, value);      // via DeviceProfileService::compileParameterMessage
};
cb.sendDump   = [&](auto kind) { deviceProfileService.startBulkDumpSend (makeBulkPayload (kind)); };  // YOU: payload schema
cb.applyDump  = [&](auto bytes) { InboundScope in (runtime); fillPanelFromDump (bytes); };            // silent (inbound)
// ... sendCC/sendNRPN/sendSysex/requestDump/buildDump/runAction/emitEvent/log ...

BridgeScriptHost host { std::move (cb) };
ScriptRuntime    runtime { host };
host.attachRuntime (&runtime);
runtime.setErrorLogger ([&](auto line) { emitToConsole (line); appendToLogFile (line); });

runtime.loadScripts (gatherScriptsFromPanel());  // array of {id,name,language,source,scope,event,target}
```

**Lifecycle (task 6)** — call from the right moments:
- `runtime.onPanelLoad()` — before the WebView/GUI exists (MIDI setup).
- `runtime.onPanelReady (firstTime)` — when the WebView signals ready; `firstTime=false` on VST3 reopen.
- `runtime.onPanelClose()` — teardown.
- `runtime.onDawSaveState (store)` / `onDawRestoreState (store)` — from `PlayerAudioProcessor::get/setStateInformation`
  (currently empty in `PluginProcessor.h`). Serialize `store` (a `juce::var`) to/from the MemoryBlock.

**Events / phase 3 (task 5)** — dispatch when things happen:
- Control value change → from `ValueTreeBridge::valueTreePropertyChanged`, call
  `runtime.dispatchEvent ("onValueChanged", controlName, payloadWithValue)`.
- Device events → in `DeviceProfileService::setEventCallback`, for `parameterReceived` / `dumpReceived`,
  wrap in `InboundScope in (runtime);` then `runtime.dispatchEvent ("onParameterReceived", ..., payload)`.
  The `InboundScope` makes any `set()` inside the handler **silent** (no feedback storm — Q2).

**Bulk data ↔ panel (task 7)** — map the API onto the existing service:
| API call | DeviceProfileService (confirm payload schema) |
|----------|-----------------------------------------------|
| `requestDump(kind)` | `startDeviceSync` / `startPresetListScan` |
| `applyDump(bytes)`  | `parseDumpMessage` → then write parsed values via `setValue` (inside `InboundScope`) |
| `sendDump(kind)` / `buildDump(kind)` | `startBulkDumpSend` |
| `sendCC/sendNRPN/sendSysex` | `compileRawMidiAction` |
| bound `setValue` transmit | `compileParameterMessage` |

## Confidence (be skeptical here when you build)
- **Solid:** `ScriptRuntime` routing/lifecycle/origin logic; the Lua engine (idiomatic Sol3); the API
  surface and prelude helpers (kept in sync with `panelApi.js`).
- **Verify:** `JsScriptEngine` — the exact `juce::JavascriptEngine` surface (`registerNativeObject`,
  `callFunction`, `NativeFunctionArgs`, `execute`/`evaluate` signatures) against the JUCE 8 headers.
- **You supply:** value-path resolution (`"cutoff.value"` ↔ the ValueTree schema) and the
  DeviceProfileService payload schemas — these live in your code, not guessed here.

## Threading
Every `ScriptRuntime` call must be on the JUCE message thread. The audio thread marshals incoming
MIDI to the message thread first (DeviceProfileService already uses `MessageManager::callAsync`).
Scripts must never run in `processBlock`.

## Anti-flood / loop guards (scripting-redesign §7 keep-list)
Backstops so a bad script can't freeze the DAW or spam MIDI. All invisible in normal use:

| Guard | Where | Limit | On trip |
|-------|-------|-------|---------|
| Lua instruction budget | `LuaScriptEngine` (`lua_sethook`, `LUA_MASKCOUNT`) | 20M instructions per outermost entry | Lua error → reported to the error sink, handler aborted |
| JS execution time | `JsScriptEngine` (`JavascriptEngine::maximumExecutionTime`) | 2 s per call | QuickJS interrupt → error reported, handler aborted |
| Python execution time | `PythonScriptEngine` (watchdog thread → `PyErr_SetInterrupt`) | 2 s per outermost entry | `KeyboardInterrupt` in the handler → error reported, handler aborted; a late interrupt that races past the call is absorbed so the next dispatch runs clean |
| Dispatch depth | `ScriptRuntime::dispatchEvent` | 16 nested dispatches | event dropped + reported (emit→dispatch feedback loop) |
| MIDI send rate | `BridgeScriptHost` | 1000 sends / rolling second (CC+NRPN+sysex+transmitting `set`) | excess sends dropped, local value writes still apply, one log notice per burst |

Caveat: a Python handler that swallows `KeyboardInterrupt` (`except: pass` in the loop) can still
run away — the watchdog fires once per entry. The MIDI rate guard still bounds what it can send.
