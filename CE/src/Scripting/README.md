# CEditor Panel Scripting Runtime (C++ host — Milestone 1, tasks 5–7)

Model 2: scripts **always run here, in the C++ host, on the message thread** (never the audio
thread). One engine per language (Lua via Sol3, JavaScript via `juce_javascript`/QuickJS). A script
is stored and run in the language it was written in — **never converted**. The shared contract is the
panel API (mirrors `CE/web/src/CE_Application/scripting/panelApi.js`).

> **Status: compiled and covered.** `CMakeLists.txt` builds `ceditor_scripting` plus three test
> targets behind `-DCEDITOR_SCRIPTING=ON` (still opt-in, so a default build is untouched), and
> `CE/src/Player/PluginProcessor.h` wires the full host — lifecycle, value writes, device events,
> timers. `CEditorScriptingTests` runs Lua and JS through the real engines.
>
> **The API surface is enforced, not just documented.** `CE/web/test/panelApiParity.test.js`
> fails the build if a member declared in `panelApi.js` is missing from any runtime, or if a
> runtime exposes one the contract doesn't declare; `scriptPreludeAgreement.test.js` executes the
> Lua and JS preludes below and checks they compute the same values as the WebView runtime. Add a
> member to `panelApi.js` first, then implement it in every engine.

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

## Integration (done in `PluginProcessor.h`; this is the shape)
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
// ... sendCC/sendNRPN/sendSysex/requestDump/buildDump/log/startTimer/stopTimer ...
// runAction and emitEvent: LEAVE UNSET. BridgeScriptHost routes them to the ScriptRuntime, which
// resolves them against the loaded script set — which is what run() and emit() need. Stubbing them
// per host is how the exported player shipped with both as silent no-ops.

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

## Confidence
- **Verified by running it:** `ScriptRuntime` routing/lifecycle/origin logic, the Lua engine, and
  the `JsScriptEngine` surface (`registerNativeObject` / `callFunction` / `NativeFunctionArgs` /
  `execute` / `evaluate`) — `CEditorScriptingTests` and `CEditorPlayerScriptTests` execute real Lua
  and real QuickJS and pass.
- **Verified by comparison:** the prelude helpers, against the WebView runtime, value by value
  (`scriptPreludeAgreement.test.js` runs both and diffs the results).
- **Name parity only:** the Python prelude — CPython is not in the JS test run.
  `CEditorPythonScriptTests` covers it wherever a Python dev install exists.
- **You supply:** value-path resolution (`"cutoff.value"` ↔ the ValueTree schema) and the
  DeviceProfileService payload schemas — these live in your code, not guessed here.

## Numbers across the language boundary
Lua 5.4 has a real integer subtype, so `varToSol` hands whole numbers over as integers — including
a `double` that arrived from JS, where `21` is a float. Without that fold, `tostring(21)` read
`"21.0"` in Lua while the same payload printed `"21"` in JS and Python, and a value used as a table
index had to be floored first. `solToVar` already folded the other direction; the two now match.

## The API surface (what `panelApi.js` declares, and who implements it)

| Group | Members | Where they run |
|---|---|---|
| Values | `set` `get` | everywhere |
| Transmit | `noTransmit` `transmit` | everywhere — they gate `set()`, **not** the explicit senders. `sendCC` inside `noTransmit` still sends. |
| Events & flow | `on` `emit` `run` `startTimer` `stopTimer` | everywhere |
| Device / MIDI | `sendCC` `sendNRPN` `sendSysex` `requestDump` `applyDump` `sendDump` `buildDump` `checksum` `panic` | everywhere |
| Debug | `log` | everywhere |
| Helpers | `scale` `clamp` `round` `snap` `curve` `lerp` `noteName` `noteNumber` + 14 MIDI-encoding helpers | everywhere (pure, defined in each prelude) |
| Panel components | 47 verbs: `split*` `phrase*` `recorder*` `harmony*` `setlist*` | **panel view only** — see below |

`checksum(type, bytes)` takes `"roland"`/`"yamaha"` (the same two's-complement 7-bit sum, both
spellings accepted), `"sum"`, or `"xor"`. `panic([opts])` expands to All Sound Off → All Notes Off →
Reset All Controllers, which is why it is portable to every runtime: it is three `sendCC` calls.

### Panel-component verbs and the window-closed boundary
The Zone Splitter, Phrase Sequencer, Recorder, Harmoniser and Setlist are modelled and rendered in
the panel view. There is no C++ counterpart to drive, so their verbs are declared
`runtime: 'webview'` in `panelApi.js`. The engines here still **define** every one of those names,
as a stub that logs *"needs the panel window open"* — a script that strays across the boundary says
why it did nothing instead of aborting the whole handler on an undefined global. `scriptValidate`
warns at edit time when one appears in a handler that also fires window-closed.

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
| Action depth | `ScriptRuntime::runAction` | shares the same 16 | `run()` dropped + reported — a run→handler→run loop recurses through C++ frames, so it needs the same backstop as `emit` |
| MIDI send rate | `BridgeScriptHost` | 1000 sends / rolling second (CC+NRPN+sysex+transmitting `set`) | excess sends dropped, local value writes still apply, one log notice per burst |
| Emit depth (WebView) | `panelRuntime.js` `deliverEmit` | 16 nested emits | event dropped + reported — the same limit as the C++ side, so a feedback loop behaves the same window-open and window-closed |

Caveat: a Python handler that swallows `KeyboardInterrupt` (`except: pass` in the loop) can still
run away — the watchdog fires once per entry. The MIDI rate guard still bounds what it can send.
