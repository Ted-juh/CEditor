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
cb.setValue = [&](auto path, auto value, bool transmit, auto form) {
    writeValueToTree (tree, path, value, form);           // YOU: tree schema; `form` = value|normalizedValue
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
- `runtime.onPanelClose()` — the *view* went away (window shut, preview stopped). The scripts keep
  running: a plugin with its editor closed is still playing.
- `runtime.onPanelDestroy()` — the *scripts* are going away (plugin unloaded). Call it FIRST at
  shutdown, before stopping timers or unhooking the device service, so a handler restoring the synth
  still has a working API. `loadScripts` already calls it on the outgoing set, so a panel switch or
  a reload is covered; only real shutdown needs the explicit call. It fires at most once per loaded
  set and is deliberately not called from `~ScriptRuntime` — see §17 of the design doc.
- `onError(info)` needs no call: the runtime raises it itself, from `reportError`. See "Error
  reporting" below.
- `runtime.onDawSaveState (store)` / `onDawRestoreState (store)` — from `PlayerAudioProcessor::get/setStateInformation`.
  Serialize `store` (a `juce::var`) to/from the MemoryBlock. Handlers RETURN what they want saved;
  see "`onDawSaveState` returns; it does not mutate" below.

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
| Events & flow | `on` `off` `emit` `run` `startTimer` `stopTimer` | everywhere |
| Device / MIDI | `sendCC` `sendNRPN` `sendSysex` `sendMidi` `requestDump` `applyDump` `sendDump` `buildDump` `checksum` `panic` | everywhere |
| Device reads | `deviceProfile` `deviceParameters` `deviceParameter` `deviceConnected` | everywhere — need the device host |
| Time | `tempo` `isPlaying` `transportInfo` `beatsToMs` `msToBeats` `syncTimer` | everywhere — the editor's master clock, the DAW playhead window-closed |
| Channel messages | `sendNote` `sendNoteOff` `sendProgramChange` `sendPitchBend` `sendAftertouch` `sendClock` `sendTransport` | everywhere — arithmetic over `sendMidi`, defined in each prelude |
| Storage | `state` `saveSetting` `loadSetting` | everywhere |
| Debug | `log` | everywhere |
| Music | `noteName` `noteNumber` `scaleNotes` `chordNotes` `quantizeNote` | everywhere (pure; tables generated into each prelude) |
| Helpers | `scale` `clamp` `round` `snap` `curve` `lerp` `noteName` `noteNumber` + 14 MIDI-encoding helpers | everywhere (pure, defined in each prelude) |
| Panel components | 229 verbs across 28 families: `split*` `phrase*` `recorder*` `harmony*` `setlist*` hand-written, the other 23 families expanded from `scripting/componentVerbs.js` | **panel view only** — see below |
| Panel structure | `panelCreate` `panelClone` `panelDestroy` `panelParent` `panelFind` `panelInfo` `panelTypes` | **panel view only** — creating a control needs a renderer |
| Drawing | `drawClear` `drawFill` `drawStroke` `drawRect` `drawCircle` `drawLine` `drawPath` `drawText` `drawRedraw` | **panel view only** — drawing needs a surface |
| Animation | `animateTo` `animateSpring` `animateStop` `animateRunning` | everywhere — the engine lives in ScriptRuntime |
| User feedback | `uiNotify` `uiStatus` | **panel view only** — nobody to tell with the window shut |

`checksum(type, bytes)` takes `"roland"`/`"yamaha"` (the same two's-complement 7-bit sum, both
spellings accepted), `"sum"`, or `"xor"`. `panic([opts])` expands to All Sound Off → All Notes Off →
Reset All Controllers, which is why it is portable to every runtime: it is three `sendCC` calls.

The channel-message row is the same trick one level down. `sendMidi(bytes)` is the only new host
primitive; `sendNote(1, "C4", 100)` is `sendMidi({0x90, 60, 100})` computed in the prelude, so no
engine can disagree about a byte. Note arguments take a number or a name — `noteName(60)` is `"C4"`
(scientific pitch notation, middle C = C4), and `sendNote` accepts either spelling.

`state` is a plain table (Lua/JS) or namespace (Python) that lives in the script's own environment:
scratch that survives between handler calls in one session and is cleared when the script reloads.
`saveSetting`/`loadSetting` are the durable pair — the player stores them in the DAW session as a
`ScriptSettings` child of its plugin state, the editor under `panel.scripting.settings`. Scripts see
the same two verbs either way.

### Animation

`ce.anim.to/spring/stop/running` move a value over time. CROSS-RUNTIME — a sweep triggered by a
note has to work with the panel shut — so the engine lives in `ScriptRuntime` and the host only
supplies the clock (`tickAnimations(nowMs)`, called from the player's 30Hz timer).

The position is a PURE FUNCTION of elapsed time, `from + (to - from) * ease(elapsed/duration)`,
never an accumulated step: two integrators drift, two evaluations of one formula cannot.
`ScriptRuntime::animationEase`/`animationSpring` and the JS pair in `panelRuntime.js` are pinned to
the same fixture by both test suites. A spring lands exactly on its target; `from` defaults to where
the value is; a second animation on a path replaces the first.

### User feedback

`ce.ui.notify(message, opts)` and `ce.ui.status(message)`. Panel view only. A notification is an
event and expires; a status is a state and stays until changed — which is why they are two verbs.
`ce.ui.dialog(opts, onChoice)` asks rather than tells. The ANSWER arrives through the callback; the
return value says whether a dialog was actually shown, and `false` always means the callback has
already run with no answer — so a script never has to wonder whether it is still waiting. One dialog
at a time, refused rather than queued, and the callback runs exactly once however it ends (choice,
dismissal, or panel teardown).

`dialog` is the one webview-only verb that does NOT get the plain explaining stub window-closed: a
script waiting in a callback would wait forever. It logs, calls back with no answer, and returns
false. See §15 and §18 of `docs/scripting-modules-design.md`.

### Drawing

`ce.draw.*` paints on top of ANY control — a scope trace over a Background, a readout over a Knob —
with no canvas component to place. Immediate mode: each verb records a command carrying the style in
force, and the overlay emits one SVG element per command in order. Coordinates are the control's
own, so a drawing scales with it, and the overlay clips to its bounds.

Nothing repaints on its own: `onDraw(info)` runs when asked, and a script animates by calling
`ce.draw.redraw()` from `onTimer`. Nothing is persisted either. Panel view only, so the C++ engines
stub the verbs and never raise the hook. See §14 of `docs/scripting-modules-design.md`.

### Panel structure

`ce.panel.create/clone/destroy/parent/find/info/types` let a panel build itself — generate a control
per device parameter, then lay them out. Panel view only, so the C++ engines stub them, and the
`onPanelBuild` hook (phase 1b, between `onPanelLoad` and `onPanelReady`) is declared webview-only so
it never fires window-closed at all.

Everything a script creates is marked `Core.generatedBy`, cleared before each build, and stripped on
save. That makes a build idempotent and keeps the author's document free of it. The trade: a
generated control is not an exported parameter and cannot be DAW-automated — drive it from a script.
See §13 of `docs/scripting-modules-design.md`.

### Error reporting

`setErrorLogger` is still the floor and nothing changes about it: **every** script failure is logged
through it, always. On top of that the runtime raises `onError(info)` on any loaded script that
declares it, so the panel can report its own failures — light a warning, fall back to a safe patch,
tell the person using it — instead of the failure living only in a log they never open.

`info` carries `script`, `scriptId`, `event`, `phase` (`"load"` or `"dispatch"`) and `message`; all
five are always present and always strings. Dispatch is by handler presence rather than declared
event, so any loaded script in any language can watch any other's failure.

Two guards, both in `ScriptRuntime` and mirrored exactly in the WebView runtime:
- `inErrorHook` — a failure raised while reporting a failure is logged (marked `(in onError)`) and
  stops there, so a broken reporter cannot loop.
- `deferErrors` — `loadScripts` holds load-time errors until the whole load loop is done, then
  drains them with `phase = "load"`. Without it, the first script that fails to compile would be
  reported to an `onError` that has not been loaded yet.

Cross-runtime by design: the failures a panel most wants to report are the ones happening in a DAW
with the window shut. See §16 of `docs/scripting-modules-design.md`.

### Component verbs

Twenty-eight families. The first five (Zone Splitter, Phrase, Recorder, Harmoniser, Setlist) each
have a hand-written reducer in `CE/web/src/CE_Application/utils/*Layout.js`, because their actions
are structural. The other twenty-three are declared as DATA in
`CE/web/src/CE_Application/scripting/componentVerbs.js` and expanded from there: the descriptors,
the implementations, the stub names in these preludes, and the documentation all come from the one
spec, so a verb cannot exist in one place and not another.

Nothing to implement C++-side — every one of them is `runtime: 'webview'`. What matters here is
that the generated stub list stays regenerated: **edit the spec, then run the generator.**

### Music theory

`ce.music.scale(root, name)`, `.chord(root, type)` and `.quantize(note, root, name)`, over interval
tables GENERATED into every prelude from `CE/web/src/CE_Application/scripting/musicTheory.js` — which
re-exports the Chord Pad's own `SCALES`, so a script and a component asking for "dorian" cannot mean
different notes. Regenerate after touching that file.

Three behaviours the cross-engine tests pin: an unknown name returns nil rather than falling back to
"major"; a quantise tie goes **up**, always; and quantise keeps the octave it was given. See §20 of
`docs/scripting-modules-design.md`.

### One-shot delays

`ce.time.after(ms, fn)` runs `fn` once and returns the timer id it armed, so `stopTimer(id)` cancels
it. Built on `startTimer` (QuickJS has no `setTimeout`), with one prelude-level
`on("*", "onTimer", …)` listener per engine that swallows the ticks belonging to a one-shot — so a
one-shot never surfaces as `onTimer`.

The entry is cleared and the timer stopped BEFORE the callback runs: a throw cannot leave it
repeating, and a callback can schedule the next one. See §21 of `docs/scripting-modules-design.md`.

### Musical time

`ce.time.tempo()`, `.playing()`, `.transport()`, `.beatsToMs()`, `.msToBeats()`, `.syncTimer()`,
plus the `onBeat` / `onBar` / `onTransport` events. One host primitive, `transportState()`, backs
the reads; the conversions are pure prelude arithmetic, so a dotted eighth at 120bpm is 375ms in
every runtime — which is what a delay-time control depends on.

The flat aliases of `.playing` and `.transport` are `isPlaying` and `transportInfo`: bare `playing`
and `transport` as globals are too easy for a panel author to shadow by accident.

`valid: false` means nothing is reporting a position; `tempo()` is then nil and the conversions are
nil rather than computed from an invented 120bpm. The events are raised from a ~30Hz message-thread
poll — fine for an LED or a sequencer step, never for timing audio.

### Device reads

`ce.device.profile()`, `.parameters([opts])`, `.parameter(id)` and `.connected()` ask the synth what
it actually has, rather than hard-coding what the panel author remembered. All four are wrappers in
each prelude over ONE host primitive, `deviceQuery(kind, payload)` — the same trick `sendMidi` plays
for the channel messages, and the reason no engine can invent a different parameter descriptor.

Window-closed they are synchronous calls into `DeviceProfileService`, complete on the first call. In
the editor the parameter table arrives over the async bridge and is cached, so a cold first call
returns `[]`, requests the load, and says which of those two things happened. See §11 of
`docs/scripting-modules-design.md` for why that asymmetry is preferred to making the verbs async.

### Modules, and what a panel opts into

Every member above belongs to a module (`ce.midi`, `ce.math`, …) and is reachable both flat and
namespaced — `sendCC(…)` and `ce.midi.sendCC(…)` are the same function. A panel declares which
modules it uses in `scripting.modules`:

```jsonc
"scripting": { "modules": ["ce.core", "ce.midi", "ce.music"], "apiVersion": "1.0" }
```

`ScriptRuntime::setEnabledModules()` pushes that list into every engine, which calls the generated
`__ce_apply_modules(enabled)` in its prelude. Call it **before** `loadScripts` — a script's
top-level code runs during the load, so a late gate lets that first pass through ungated.

Three rules worth knowing:

- **An empty list means "the panel declared nothing", not "the panel wants nothing."** Every module
  stays on. That is what keeps a panel written before modules existed working unchanged. A panel
  that genuinely wants nothing but `ce.core` says so in the editor, and the exporter bakes the
  resolved list in — so what reaches the player is always explicit or deliberately absent.
- **A gated member is a stub, never a missing name.** It logs a sentence naming the module and where
  to switch it on. `attempt to call a nil value` tells a user nothing, and the same sentence is
  compiled into all three preludes from one template in `panelApi.js`.
- **`ce.core` is never gated**, and value members (`state`) are never replaced — a function stub in
  place of a table turns `state.count = 1` into a type error, which explains less than nothing.

Tier 1 comes from the same generated block: `ce.version`, `ce.runtime`, `ce.language`, `ce.modules`
and `ce.has("ce.midi")`. `ce.has` answers for *this* runtime and *this* panel's list, so it is the
honest way to ask "can I call this here" before calling it.

A native handler has no prelude and is not gated — it calls the vtable directly, and the host
already checks every call. See the note in `NativeHandlerAbi.h`.

### Third-party modules (`ce.ext.*`)

A user can ship a module. It is one JSON file — `<id>.cemodule` — holding a manifest plus a prelude
per language, installed into the app under `userAppData/CEditor/modules/`. `ScriptRuntime::
setExtensionModules()` hands the list to every engine, which evaluates its own language's source and
calls the generated `__ce_register_module` to wire the namespace. After that a third-party module is
indistinguishable from a built-in one: same tables, same gate, same `ce.has()`, same picker group.

Three rules make that safe:

- **It must live under `ce.ext.*`** — provenance stays visible, and `ce.<module>` stays ours.
- **Install-time collision check.** No registry means no name authority, so the authority is local:
  a module may not define a member anything else already defines, may not use a word that is a
  keyword in Lua/JS/Python, and may not depend on something absent. A rejected module is not
  registered at all.
- **The exporter copies it into the panel.** A shipped plugin has no CEditor install to read from,
  so `scripting.extensions` carries the modules the panel enabled. The player loads them from there.

`CE/profiles/modules/ce.ext.roland_sysex.cemodule` is the reference example. It is not installed by
default; `ScriptRuntimeTests` loads that exact file and asserts the bytes it packs in Lua and JS.

Not a sandbox, and it does not pretend to be one: a module's code runs at the same trust level as a
script the user wrote. What this provides is namespacing and collision safety. A native handler
(C++/C#/Java) has no prelude and cannot be extended — see the note in `NativeHandlerAbi.h`.

Module sizes are **measured**, not declared: `@module <id>` markers delimit regions in each prelude
and `tools/scripts/gen-script-modules.mjs` sums them into `moduleCost.generated.js`, which a test
regenerates and diffs. Those are source bytes for the Export tab, not a binary delta — Lua and JS
are compiled in either way.

### Value representations (Q8)
`get`/`set` take the accessor either as a path **suffix** or as a second **argument** — both work
everywhere, because the suffix is what the picker inserts and the argument is what the engines'
host bindings pass:

```lua
get("cutoff")                       -- the value; a bare control name means .value
get("cutoff.normalizedValue")       -- 0–1 position
get("cutoff", "normalizedValue")    -- the same question, the other spelling
set("cutoff.normalizedValue", 0.5)  -- writes the midpoint of the control's own range
```

`.value` and `.normalizedValue` are arithmetic over the control's `Behavior.min/max`, so they work
in every runtime. `.midiValue` is what the DPD codec would put on the wire; only the device host
can answer it, so elsewhere it logs an explanation and returns nothing rather than a quiet
`undefined`. `buildDump` is host-dependent in the same way and says so the same way.

### Scope
`scopes` limits where a member may be used, and the only members that carry one are the
panel-component verbs — they need a component to exist, and a device script runs at `onPanelLoad`
before the GUI is there. The Device/MIDI verbs used to declare `device`/`panel` scope; enforcing
that denied a **component** script the ability to send a CC, which is the ordinary thing a panel
control does, so the list was withdrawn rather than enforced as written.

### What does NOT cross the window-open / window-closed line
| | Why |
|---|---|
| `async` / `await` in a handler | The WebView awaits a returned promise; the C++ engines dispatch synchronously and drop it, so anything after the first `await` never runs in the export. `scriptValidate` warns. Use `onTimer` for work that has to wait. |
| `onDawSaveState` / `onDawRestoreState` | Declared `runtime: 'player'`. The editor has no DAW to save a project, so they never fire in preview — test them in the exported plugin. |
| the panel-component verbs | Declared `runtime: 'webview'`, stubbed with an explanation here. The stub lists are GENERATED into all three preludes — 248 names by hand in three files is 744 chances to mistype one, and a mistyped stub is an undefined global in exactly one engine. Run `node tools/scripts/gen-script-modules.mjs --write` after touching the contract. |

### `onDawSaveState` returns; it does not mutate
`store` arrives as a **copy** — each engine marshals it into the script's own language, so writing
into it changes something the host never reads. **Return** an object instead; `ScriptRuntime::
onDawSaveState` merges the returned keys into the shared store.

```lua
function onDawSaveState(store)
  return { lastPatch = get("patch.value") }   -- returning is what persists
end
```

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
