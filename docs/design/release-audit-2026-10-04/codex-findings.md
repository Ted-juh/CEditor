# Codex's findings — release audit 2026-10-04

Source tested: **`3c3c7721`**, fetched from `ccr-0d6b8446-x8nxzw` on 5 October 2026. Subsequent commits by Codex change only this file. The assignment's `f37550c` baseline has advanced: this branch contains the Save As undo, slider tick-count and Python boundary fixes. It does **not** contain the security hardening on the owner's local `main` (`08fb6eef`). Do not apply the audit branch over that work without reconciling the two.

Environment: Windows x64, OS build 26200; Visual Studio 18 Community, MSVC **19.51.36256.0**; Node **24.14.1**. Clean isolated Git worktree, Ninja Multi-Config Release, scripting ON, dev mode OFF. Builds limited to four jobs at below-normal priority. REAPER x64 is installed. Native Windows UI automation is unavailable in this session. WinMM enumerated `CEditor Test Out` input/output and Microsoft GS Wavetable Synth output; only the named virtual loop was used.

Only this findings file is edited in Git. Harnesses, temporary fixtures and full logs are outside the worktree, under `C:/Users/Tedjuh/Documents/Codex/2026-10-04/m/work/release-audit-evidence/` (called **evidence/** below). Existing installation and user documents/settings are untouched. No product fixes are included.

## W1–W9 coverage

| Work | Result and boundary |
| --- | --- |
| W1 — clean build | `npm ci` and production `npm run build` passed. Fresh `cmake --preset native -DCEDITOR_SCRIPTING=ON -DCEDITOR_DEV_MODE=OFF`, then `cmake --build --preset native-release --parallel 4 -- -k 0` passed. **38/38 CTest cases passed**, 0 failed, 55.47 seconds (`--output-on-failure --timeout 120`). The quoted 34 is stale; native Python is OFF and its optional test is not included. `evidence/build.log`. No MSVC compiler warning/error was found; configure warns about the deliberately panel-less generic player and the vendored Lua CMake minimum. |
| W2 — installer | **Not exercised.** Fresh install, upgrade, first-run defaults/WebView2, SmartScreen and uninstall residue need an attended installer/native UI session. The currently installed security-hardened app is a different revision and is not evidence for this audit tree. No downgrade or uninstall was performed. The correct build stamp for the source tested here is `3c3c7721`, not the README's old `f37550c`. |
| W3 — dialogs/recovery | **Not exercised.** Native New/Open/Save/Save As/Share/malformed-package dialogs and crash recovery remain D3 gaps. The assignment specifically says never to repeat that gate unattended. A store-level Save As regression is checked under C-09; that is not native-dialog acceptance. |
| W4 — export | **Partial, staged compiler-free exports.** All three template formats built from the audited source. Original Studio White starter: VST3/LV2 export fail X-04, CLAP succeeds. QA-09: all three export, VST3 validates, CLAP fails X-06, LV2 fails X-05. An ASCII-named starter copy exports all three; VST3 and CLAP validate, LV2 still fails. Both working VST3s complete real scanner/worker processing and state round-trip (64 blocks, 25 / 16 parameters, 3,072 / 2,499 state bytes). `export-check.log`, `validation.json`, `smoke-0.log`, `smoke-1.log`. These use freshly built staging templates, not the installed app. Installed-app GUI export, DAW window open/close/reopen, automation recording and saved-host-project reopen remain untested. |
| W5 — Hostage | **Partial, real Vanguard VST3.** Isolated scan, launch, 64 processing blocks and a 71,574-byte state round-trip pass; 2,213 parameters, one reported program. A scratch extension of the smoke harness terminates only its own worker: `running=0 detected=1 parentAlive=1`, with the expected worker-failure exception. The deterministic CTest also confirms the rack keeps a healthy part running while reporting a failed worker. `smoke-2.log`, `worker-probe.log`. Measured Vanguard audio peak was zero, so no sound-generation pass is claimed. Real UI instrument selection, audible playback, preset/program browsing and the on-screen worker-failure notice remain untested. |
| W6 — MIDI | **Partial, actual virtual-port bytes.** A native harness uses this revision's `DeviceProfileService`, maps role `auditVirtual` to `CEditor Test Out`, sets `test-cc-synth/filter.cutoff=64`, and receives **`B0 4A 40`** on the matching WinMM input. `evidence/device-probe.log`, `midi-ports.json`. No physical device was sent data. This does not cover control gestures, Ports/Routes/Snapshots rendering or Total Recall timing on hardware. |
| W7 — animation | **WebView2 visual gate not exercised.** Runtime/model probes confirm C-44 and C-88 below; they do not establish pixels, timeline dragging, spring easing, filmstrip movement or the exported plug-in window. |
| W8 — backend | Reviewed Player state/restore/MIDI paths, export identities, Hostage async loading/analysis/worker boundaries, scripting execution/lifetime, DeviceProfile dump/role/port paths, bridge handlers and WebView resource/navigation code. Findings X-01–X-06 below, plus independent verification of the relevant C findings. This is a targeted review, not a claim that every backend line is defect-free. |
| W9 — independent verification | Every S1/S2 heading in Claude's file at the tested revision has a verdict below. Tests use the actual source, not a reimplementation, except where explicitly called code review. Unrepeated visual/performance claims remain unverified rather than being promoted by a green unit suite. |

## Findings

### X-01 — A CLAP export named `..` deletes unrelated files above the export folder (S1 · data loss / security · Export)

**Repro.** In a disposable fixture, create `victim/KEEP.txt` and `victim/exports/`. Export a complete empty panel with `name` and `exportSettings.pluginName` equal to `..`, selecting only CLAP, with `outDir=victim/exports`. Supply an inert `Template.clap` fixture. Run the real `exportFromTemplate` (see `evidence/probes.mjs`). The harness verifies the resolved deletion target is inside its newly created scratch fixture before calling it.

**Observed.** Export succeeds; `KEEP.txt` and the `exports` directory are gone. The parent now contains `...clap`, `panel.cepanel` and `CE/`. `probes.log`: `sentinelSurvived:false`, `exportDirSurvived:false`.

**Expected.** An export must stay below its output directory and must not delete unrelated files. Reject dot-only/reserved names and verify the canonical destination before cleanup. This is more severe than C-18's loss of a previous export and C-20's same-name overwrite.

**Where.** `tools/scripts/export-panel-template.mjs:210` permits `..` through `safeName`; `:252-256` joins it as the CLAP root and calls recursive `rmSync` on the parent. **Already addressed in local main's security work; absent from this branch.**

**Evidence level.** observed-in-test on Windows; only a disposable sentinel was deleted.

### X-02 — Deferred Player callbacks can outlive the plug-in they access (S1 · crash risk · Player / native bridge)

**Repro.** Queue the Player's `playerReady` callback, then destroy its editor before the extra posted callback executes. For the device bridge, queue a device request and destroy the owning standalone Player or the entire processor before dispatching the posted request.

**Observed.** Code queues raw `this`/service pointers without a lifetime guard. `PlayerHost::~PlayerHost` clears the service's event callback, but cannot cancel the already posted `loadPanelIntoWebView`. `withDeviceRuntimeEvents` similarly posts `handler(*svc, ...)` using a raw service pointer. The safe component pointer in the *response emitter* does not guard this earlier service dereference. `DeviceProfileService` already supports JUCE weak references, but this bridge does not use one.

**Expected.** Closing/unloading the Player must invalidate queued work, as the adjacent MIDI-to-WebView response path already does with `SafePointer`.

**Where.** `CE/src/Player/PlayerHost.cpp:167-169,229-233`; `CE/src/DeviceProfile/DeviceRuntimeBridge.cpp:11-22`. Distinct from C-34's Hostage analysis completion callback.

**Evidence level.** read-in-code. The invalid lifetime is established by the captures and destructors; a crash was **not** induced in a DAW. The triggering dispatch order still needs an instrumented native lifecycle test.

### X-03 — Restoring an older state retains the later program and “always send” answer (S1 · unintended hardware restore · Player state)

**Repro.** Instantiate the actual `PlayerAudioProcessor` with a two-program panel. Save its initial state (program 0, no restore answer); choose program 1 and answer `always`; restore the initial saved bytes into the same processor, then save/read its state again. `evidence/state-probe.cpp` drives the real header, compiled with MSVC; GUI creation is stubbed and scripting is OFF to isolate this state path. The regular W1 build has scripting ON.

**Observed.** `state-probe.log`: `before-restore-program=1`, `after-restore-program=1 answer=always`. The initial state omitted both XML elements; the loader only changes them when present. The stale answer feeds `decideRestore`, so a state that never authorized sending can inherit a later state's `always` decision. A stale `never` likewise suppresses the question/send. The wrong program survives too.

**Expected.** Restore replaces the session's state: absent answer means unanswered, and an omitted default program means 0. The comments explicitly promise the answer is per session and not global. A DAW preset/state restore into an existing instance is supported by the surrounding code.

**Where.** `CE/src/Player/PluginProcessor.h:380-386` omits defaults on save; `:435-447` fails to reset them on load; `:924-925` consumes the retained answer. Reset defaults before parsing, and handle any pending program-change request consistently.

**Evidence level.** observed-in-test on Windows for retained state; read-in-code for the resulting automatic-send decision. No hardware dump was transmitted.

### X-04 — The shipped Unicode-named starter fails VST3/LV2 export on this Windows Node runtime (S1 · export broken · Windows packaging)

**Repro.** Compiler-free export of `CE/panels/Control set starters/studio-white.cepanel` without renaming it, using freshly built templates and Node 24.14.1. Its product name is `Studio White — starter`. Run `evidence/export-check.mjs`. Independently run `unicode-probe.mjs` with both system Node and the installed `tools/node/node.exe` (both v24.14.1).

**Observed.** VST3 and LV2 fail `ENOENT` reading the expected bundle. `fs.cpSync` creates `Studio White â€” starter.vst3` instead of the requested `Studio White — starter.vst3`. The minimal probe confirms `mkdirSync('mkdir-\u2014')` preserves the character while recursive `cpSync(...,'copy-\u2014')` creates `copy-â€”`; the intended child does not exist. CLAP's single-file copy succeeds. An ASCII-name copy of the same panel exports all three formats.

**Expected.** Shipped starter names and valid Unicode file paths must export. Packaging copies the build machine's Node executable, so this is also present in the currently installed bundled runtime; it is not confined to the audit's shell.

**Where.** `tools/scripts/export-panel-template.mjs:256` recursive `cpSync`; `tools/scripts/package-installer.ps1`, `Stage-NodeRuntime`. Minimal reproduction localizes the corruption below the exporter, in this Windows Node runtime's directory copy behavior. The precise Node implementation cause/version range is not established. Qualify the bundled runtime with a Unicode-path check or use a verified copy path.

**Evidence level.** observed-in-test on Windows, real templates and both runtime executables. No installer GUI assertion is implied. `export-check.log`, `unicode-probe.mjs`.

### X-05 — Windows LV2 exports report success but have empty URIs and cannot load (S1 · export broken · LV2)

**Repro.** Build with `CEDITOR_TEMPLATE_PLAYER=ON`, export QA-09 and the ASCII-renamed Studio White starter as LV2, then run `validate-plugins.mjs <bundle.lv2> --skip-gui --strictness 5 --require` with the available Windows pluginval.

**Observed.** Export exits successfully and reports generated Turtle files. Both `manifest.ttl` files use **`<> a lv2:Plugin`** and `<:UI>`; `dsp.ttl` uses `@prefix plug: <:>` and empty `doap:name`/vendor. Calling the stress DLL's actual `lv2_descriptor(0)` independently also returns an empty URI. pluginval finds a manifest-relative file URI and fails cold/warm instantiation: `No plugin <file:///.../manifest.ttl> in <...dll>` / `Unable to create juce::AudioPluginInstance`. The generic build's manifest is empty-URI too.

**Expected.** A generated LV2 has a stable, nonempty URI such as `urn:ceditor:com.tedjuh.custom-component-stress-rig.af5eafd0`, matching its descriptor, and loads in an LV2 host. Export must not claim success merely because `.ttl` files exist.

**Where.** Empty identity is observed at the runtime LV2 descriptor and Turtle writer; exact initialization cause **unknown**. Relevant boundary: `CE/src/Export/Lv2SidecarIdentity.h:83-87`, vendored `juce_audio_plugin_client_LV2.cpp:108,927,1464`. `tools/scripts/export-panel-template.mjs:153-172` accepts generated file presence without checking identity. This is a Windows result and does not dispute Claude's Linux LV2 pass.

**Evidence level.** observed-in-test on Windows. `validation.json` / `validation.log`, generated manifests under the `exports.json` run directory, `lv2-descriptor.txt` (empty URI).

### X-06 — QA-09's CLAP fails parameter text round-trip validation (S3 · host parameter formatting · CLAP)

**Repro.** Export `QA-09-custom-stress.cepanel` to CLAP and run the Windows `clap-validator` through `validate-plugins.mjs`.

**Observed.** `param-conversions` fails for **Bipolar Horizontal Scale**, parameter ID 3109257221: `0.7676767676767676` → text `0.5353535` → value `0.7676767110824585` → text `0.5353534`. 32 checks pass, 10 are not applicable, one fails. Both Studio White CLAPs pass 33 checks. All CLAPs emit the already-known nonfatal random-state warning.

**Expected.** Formatting/parsing a parameter value stabilizes to the same text. The last digit changes on round trip, violating the validator's host-conversion check. This is a small formatting/precision defect, not evidence that audio processing or every CLAP export is broken.

**Where.** Conversion boundary: `CE/thirdparty/clap-juce-extensions/src/wrapper/clap-juce-wrapper.cpp:1446-1479`, using the default `AudioParameterFloat` format/parser constructed at `CE/src/Player/PanelParameters.h:162-167`. Exact rounding fix not established in this audit.

**Evidence level.** observed-in-test on Windows. `validation.json` contains the full failure details.

## Verification of the other's findings

“Confirmed in code” is an independent trace of the cited path, not a claim of Windows UI observation. For closed findings, the original historical report can still be valid; the verdict concerns **3c3c7721**.

| Finding | Verdict / independent evidence |
| --- | --- |
| C-01 | **Confirmed on Windows, native test.** Same `Transport`/`ArpEngine`, same four-second note input: free clock 32 note-ons; external clock **62**. Windows count differs slightly from Claude's 60, but the repeated scheduling window is reproduced. `performance-probe.log`. |
| C-02 | **Confirmed in code.** Stopped launches use the old raw `positionPpq` (`PerformanceEngine.cpp:350`); `Transport::advance` resets position on Start without a jump notification. Pending/active clip offsets survive. No audible test. |
| C-03 | **Confirmed on Windows, native test.** Bypassed Key(+12) passes one C4 note-on; enable Key, release C4: **zero note-offs**. Real `MidiInsertRack`, `performance-probe.log`. |
| C-04 | **Confirmed on Windows, native test.** Key(+12) → Arp, bypass Key while held, release: **16 additional note-ons** over two seconds after all keys are up. `performance-probe.log`. |
| C-05 | **Confirmed in code.** Arp/note-module deadlines use transport-relative absolute beat positions; Start rewinds without forwarding a jump/reset to these modules. Their pending note releases can become unreachable across repeated DAW loops. Not counted on an actual DAW loop here. |
| C-08 | **Confirmed on Windows, runtime test + native sink review.** Real `runScript` top-level JS called a mock `window.__JUCE__.backend.emitEvent` with no approval. Native `savePanel` accepts the supplied path. The probe emitted only `auditOnly`, not a write request. `runtime-probes.log`. Security fixes in local main are absent from this branch. |
| C-09 | **Not reproduced — fixed in 062c8770.** Both current Save As/rename regression tests pass on Windows; undo retains B's identity and reverses the content edit. Native dialogs were not exercised. `fix-regressions.log`. |
| C-11 | **Confirmed on Windows, actual native engine.** `buildDumpMessage("system", {})` on shipped GAIA returns `ok=1`, **89 unmapped parameters**, payload beginning `F0 41 10 00 00 41 12 01 00 00 00 00…`. Player captures every successful dump without rejecting unmapped content. `device-probe.log`. No dump sent. |
| C-12 | **Confirmed in code and native default lookup.** `engineForRole({})` resolves `test-cc-synth`; Player restore/program/buildDump callers use the empty role. Named panel bindings do not replace that default. `device-probe.log`. |
| C-13 | **Confirmed in code.** Template exporter copies shipped `CE/profiles/test`; service scans that directory under its resolved root. Neither packages an arbitrarily imported profile. Installed import/export/restart not exercised. |
| C-14 | **Confirmed on Windows, identity probe.** Same GUID keeps VST3 code `DoPn`, but names Original/Renamed yield `com.vendor.original.34c6bc11` / `com.vendor.renamed.34c6bc11`. LV2 directly prefixes this CLAP identity with `urn:ceditor:`. `probes.log`; `Lv2SidecarIdentity.h:40-45`. |
| C-15 | **Confirmed in code, native UI not observed.** `ensureLicence` requires `hostProject.licencePublicKey`; default manifest has none and Free allows one loaded part. Do not confuse a passing licence unit test (which supplies a key) with a usable default product. |
| C-25 | **Confirmed in shipped data and emitter.** Scene 2's mappings name `scPolyMode`, `scPbUp`, etc., rather than the defined `scene2.*` instances. Dump emitter flattens resolved IDs while parameter emitter preserves later-instance prefixes. No AN1x hardware was used. |
| C-26 | **Confirmed on Windows, native encoding + Player trace.** AN1x `arpSceneSwitch` rejects numeric 0; 1/2/3 encode 01/02/03. Player passes the APVTS choice index directly instead of the wire value. Thus first menu index 0 cannot send. `device-probe.log`. |
| C-27 | **Confirmed in code.** `sendRestoredDumps` queues raw plug-in MIDI; `sendParamMidi` enters `DeviceProfileService::compileParameterMessage`, whose hardware destination calls `MidiOutput::sendMessageNow`. Those are different destinations/queues and cannot guarantee the claimed ordering. Real-port dump/value ordering not exercised. |
| C-28 | **Confirmed in code.** `emit-legacy-core.mjs` preserves the signed range but maps s7 to u7; native u7 validation/encoding supplies no +64 offset. No physical GAIA test. |
| C-29 | **Confirmed in code.** The native role-mapping payload reader accepts profile/ports/sync direction, not variables/timing overrides; recipe resolution still uses profile variables. The web store acknowledging the setting is insufficient. |
| C-34 | **Confirmed in code.** Analysis completion captures raw `this`; service destructor joins the producer thread, but HostPluginProcessor's `callAsync` queue can execute completion after service destruction. Preset-scan completion has an alive guard; analysis completion does not. DAW crash not induced. |
| C-35 | **Confirmed in code.** `primePartState` overwrites identity before `requestInstrument`; failed completion only reports. State capture reads the live old processor into the now-new identity. No failing third-party preset was loaded into the user's rack. |
| C-36 | **Confirmed in code.** `playPhrase` feeds all future timestamps immediately into `MidiMessageCollector`; the collector drains pending messages per block rather than retaining a future event schedule. Did not independently measure the reported 5/33 count or audible result. |
| C-37 | **Confirmed in code.** `auditionRecord` tests only whether *any* instrument exists after starting asynchronous replacement, so the old instance satisfies it and receives the early handoff. |
| C-38 | **Confirmed in code.** Same-class test compares the already primed document ID with B while `getInstrument` still returns A; a second pick can apply to A before B1's commit. Same identity-before-commit defect as C-35. |
| C-44 | **Confirmed on Windows, actual trigger functions.** Trigger `to:['hover']`: transition to `['Hover']` returns false; lowercase `['hover']` returns true; hold on `['Hover']` false. `probes.log`. |
| C-45 | **Confirmed in model/code; rendered pose not repeated.** Root scale/rotation/opacity use incompatible paths, and `offeredTargetsFor` supplies only part targets on bare button/list controls. Related to C-88. |
| C-57 | **Confirmed for JS on Windows, isolated runtime test.** Real `runScript` enters `while(true){}` and does not return before the parent kills its disposable Node subprocess after 3 seconds (`ETIMEDOUT`). Not an induced WebView2 hang. Other language hangs not repeated here. Local main's watchdog fixes are absent from this branch. |
| C-58 | **Confirmed on Windows, real Wasmoon/cached dispatch.** Load Lua A with global `label="first"`, then B with `label="second"`; dispatch A's cached handler: it logs **second**. Calling Run on A again would reload A and mask this defect. `runtime-probes.log`. |
| C-59 | **Fixed boundary in 3c3c7721; fresh Pyodide browser proof not repeated.** Current wrapper converts borrowed lists to JS arrays; argument-conversion regression passes. Original unconverted-list route no longer applies. |
| C-60 | **Confirmed in code; still separate from the Python argument fix.** Handler payload remains `fn(payload)` with JS attribute-style objects, while native Python builds dictionaries. `apiForPython` converts Python arguments, not these returned/event objects. |
| C-61 | **Confirmed in code; duplicate bytes not measured in DAW.** Player mount activates preview lifecycle on every new webview; processor separately observes editor-open and fires native ready. Each web runtime begins with fresh first-time state. |
| C-62 | **Confirmed in code.** Python installed status accepts `pythonEmbedDir()`, while export's runtime bundling still asks for system Python and CMake embedding development files. Did not remove the owner's Python to reproduce provisioning failure. |
| C-73 | **Confirmed on Windows, normalizer probe + runtime review.** A valid manifest supplied with `licencePublicKey` returns no key from `normalizeProject`; runtime still expects it from the shared data manifest. `model-probes.log`. |
| C-80 | **Unresolved for Windows.** Native quit has no explicit unsaved check; whether WebView2 delivers the recovery flush on teardown was not tested. Linux observation is not Windows proof. Keep the requested attended D3 test open. |
| C-87 | **Confirmed ignored transform path in code; exact 365/396 not remeasured.** SliderFamilyRenderer computes pointer/track geometry from selected width/height/offset fields, without applying generic part Layout.scale/rotation/x/y. Actual WebView2 render matrix remains open. |
| C-88 | **Confirmed on Windows, actual model + UI condition.** Button/ToggleButton/Combobox/Listbox each have zero resolved parts and zero control-scope sequence targets. Combined with the Add button's part requirement, no offered target can be added. `model-probes.log`. |
| C-89 | **Not independently reproduced as a performance result.** `tickAnimations` calls `setValue` per path, supporting the suspected repeated-update mechanism, but code reading cannot establish 2–14 fps. No timing numbers from this build-loaded machine are substituted for a quiet WebView2 measurement. |
| C-90 | **Code path supports the finding; DAW/visual result unverified.** Custom-channel writes and the renderer's normalized-value signal are separate paths. No host automation/filmstrip frame observation was made here, so the proposed DAW extension remains a hypothesis. |
| C-94 | **Not reproduced — capped in db847b08.** Passing major count 1,000,000 directly to current `buildSliderTickStops` returns 129 major stops in under 1 ms. UI limits and the geometry cap are present. This is geometry evidence, not an attended inspector walkthrough. `probes.log`. |
| C-96 | **Fixed boundary in 3c3c7721; full Pyodide save/reopen not repeated.** Dict argument is copied to a plain serializable object before its borrowed proxy expires. Regression passes on Windows. |
| C-97 | **Fixed boundary in 3c3c7721; all browser callback types not repeated.** Callable arguments use `.copy()` before the borrowed reference expires; delayed-call regression passes. This does not establish that copied proxies are eventually released. |
| C-98 | **Fixed in code at 3c3c7721; real Pyodide browser not repeated.** `py.toPy(...,{depth:1})` keeps nested `ce` namespaces as JS objects instead of recursively converting them to Python dicts. |
| C-99 | **Fixed boundary in 3c3c7721; browser options matrix not repeated.** Dict/list conversion regression covers nested options surviving the call. |
| C-100 | **Confirmed on Windows, actual Wasmoon.** `pairs(decodeJson('{"a":1}'))` stops with `TypeError: Cannot read properties of null (reading 'then')` in `PromiseTypeExtension.pushValue`. `runtime-probes.log`. |
| C-101 | **Confirmed on Windows, actual module inference.** `modulesUsedBy('ctx.SendCC(1,74,64);')` returns `[]`; lowercase call returns `["ce.midi"]`. `runtime-probes.log`. |
| C-108 | **Layout result not independently remeasured; severity disputed.** Uncapped `flex-shrink:0` footer and rows=10 Debug textarea support the overflow explanation. Claude documents collapsing the footer as a workaround, so **S3** fits the audit's stated scale better than S2 (“no workaround”). Native 1280×720 acceptance remains open. |

Supplemental S3 requests: C-06's port/channel note-off migration was not exercised; only simple virtual-port CC output was measured. C-66's Windows exception translation was read, not induced. C-81 is a Linux WebKit encoding path, not a demonstrated Windows defect. No claim is made that a Windows test disproves it on Linux.

## Reproducibility / evidence limits

- `build.mjs` invokes npm and CMake in the clean worktree; `build.log` contains the full build and CTest transcript. Scratch probes are untracked and do not replace product tests.
- `native-probe.mjs device` and `native-probe.mjs performance` compile scratch mains against the actual fresh test objects. They exercise the real C++ implementations; they do not port the algorithm to JavaScript. The device probe transmits only one cutoff CC to the named virtual port.
- `state-probe.mjs` compiles the real Player processor header with a disposable two-program panel, no GUI and scripting disabled; it tests serialization behavior directly. It does not claim to be a DAW project-reopen test.
- Run JS probes from `CE/web` with `node --import ./test/support/register-svelte.mjs <probe.mjs>`. The loader is needed for the repo's extensionless/Svelte/WASM imports. Runtime probes change cwd to `node_modules` for Wasmoon's test-loader URL and use a parent-controlled timeout for the loop probe.
- `node --import ./test/support/register-svelte.mjs --test test/historySaveAsIdentity.test.js test/pythonApiBoundary.test.js`: **7 passed, 0 failed**. The Python tests use borrowed-proxy stand-ins; their scope is explicitly limited above.

Additional export evidence: template configuration `CEDITOR_TEMPLATE_PLAYER=ON`, `CE_VST_GENERIC_PLAYER=ON`, opt-in `CEDITOR_REAL_VST_SMOKE=ON`; `template-build.log`. No product sources changed. Template configure occurred at docs-only commit `8e576f02`, whose product source is identical to `3c3c7721`. pluginval ran at strictness 5 **with GUI tests skipped**; neither its passes nor the worker smoke mean a DAW window or host project was exercised.

## Done

Completed the locally executable W1–W9 audit against product source **3c3c7721** on Windows, 5 October 2026. Clean MSVC Release build and **38/38 native tests passed**; six X findings recorded, including code-reviewed lifetime risk X-02. This is **not a release sign-off**: confirmed export/restore/security defects remain, and the attended installer/native-dialog/WebView2/DAW and physical-hardware checks listed above were not performed. Only this findings file is committed/pushed to the assigned branch.
