# Hostage integration audit

The Hostage baseline (the *CEditor / Hostage Builder* implementation document,
v1.0) makes its first required engineering task a source-tree integration audit: before any
host-builder infrastructure lands, map what CEditor already has, rule on what Stage 1 reuses,
and document every deviation. This is that audit.

Everything below was verified against this tree at the commit that introduces this file — by
reading the code, not by trusting other documents (this one included: per the design-records
convention, **when this record and the code disagree, the code is right**). File references
give the line numbers as of that commit.

The one-paragraph conclusion: the baseline's reuse assumptions hold almost everywhere — the
bridge, settings, document, scripting, controller-page, CTRL49, export and installer systems
it wants to build on all exist and are healthier than it assumes. What does not exist, anywhere
in this tree, is plugin *hosting* and an audio path: no `juce_audio_processors` hosting class
is used, no `AudioDeviceManager` is constructed, and the shipped player plugin is deliberately
an audio passthrough. Stage 1's host engine is greenfield; everything around it is extension.

---

## 1. Application shell and editor registration

The C++ shell is deliberately thin. `CE/src/Main.cpp` is a 37-line `JUCEApplication`
(single-instance, owns `AppSettings` + `MainWindow`); `MainWindow.h` is a `DocumentWindow`
with a native dark title bar (the `dwmapi` link dependency, the only Windows-only line in the
link); its sole content component is `WebViewHost` (`CE/src/WebViewHost.h`), an ordinary
`juce::Component` owning the `ValueTreeBridge` and the `WebBrowserComponent`.

There is **no C++ editor registration to extend** — "editors" are frontend workspaces. The
Svelte application (`CE/web/src/CE_Application/`) carries the Panel editor, the Custom
Component designer (the `Custom*` files under `sections/`), the Scripting workspace
(`scripting/`), and the Screen Builder (`ScreenBuilderEditor.svelte`, `screen/`), all driving
the one bridge, with ~100 stores under `stores/` holding UI state.

**Ruling.** The Hostage Builder registers the way every existing editor did: a new
CE_Application workspace (sections + stores) plus new bridge event listeners plus native
services behind them. No new shell, no separate application, no second window architecture.

## 2. Project and document infrastructure

The document of record is JSON authored on the web side. A panel is serialized by the frontend
and written by the bridge (`savePanel` / `savePanelAs`, `CE/src/ValueTreeBridgeHandlers.cpp:433`;
the handler literally writes the posted JSON string to the chosen file), reopened through
`openPanel` / `openPanelFile`, and packaged/unpacked through the panel-package handlers. The
session's open documents persist in `AppSettings` (`openPanelPaths`,
`openScriptWorkspacePaths`). Export/build settings already live *inside* the panel document
(`exportSettings`, consumed by `utils/panelIdentityInputs.js` and the exporters). The C++ side
mirrors live document state in a `juce::ValueTree` with `juce::UndoManager` undo/redo and
dot-path `setProperty` (`CE/src/ValueTreeBridge.h`).

**Ruling.** The Host Project is a new document type on the same mechanism: a JSON document
with its build/target settings embedded, saved/opened through bridge file handlers, listed in
`AppSettings` for session restore. No second project system, no second persistence layer.

## 3. WebView2 host and native/web bridge

The WebView is `juce::WebBrowserComponent` over WebView2 with the static loader
(`JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1`), sitting as a normal JUCE child component
inside the JUCE window. This is a load-bearing finding for the baseline's native-editor-pane
requirement: **a native pane beside the WebView is ordinary `resized()` layout in
`WebViewHost`**, not a window-architecture change. The plugin build even proves WebView2
works inside a DAW window already (the player embeds its web bundle as `PlayerWebData`
BinaryData precisely to survive host-loaded contexts — `CMakeLists.txt:165`).

The bridge protocol: `ValueTreeBridge::buildOptions()` chains **42** `.withEventListener`
registrations (`ValueTreeBridgeHandlers.cpp:382–1561`); C++ emits back through
`browser->emitEventIfBrowserIsVisible (name, var)`. Payloads are `juce::var` JSON. Handlers
hop to the message thread via `MessageManager::callAsync`; the teardown lifetime invariant is
documented at `ValueTreeBridge.h:20` (browser destroyed before bridge, both on the message
thread). Long-running native work has an established shape: a concrete job class held as
`std::unique_ptr<juce::Timer>` polling a child process and streaming progress events —
`buildJob` (the in-app VST3 export) and `toolchainJob` are the two shipped instances
(`ValueTreeBridge.h:131`).

**Ruling.** Catalogue, rack, device and build commands are new listeners and events on this
bridge; scans and builds are new instances of the Timer-job pattern. No second bridge, and no
bridge traffic on any audio path (the baseline's own rule).

## 4. Persistence and user settings

`AppSettings` (`CE/src/AppSettings.h`) is a `juce::PropertiesFile` in the per-user application
data directory (`CEditor/CEditor.settings`): window bounds, open documents, and a JSON blob of
app-level UI settings. The per-user data directory is already used for machine-level installed
content — third-party script modules live there because Program Files is not writable
unelevated (`ValueTreeBridge.h:108`). There is no SQLite anywhere in the tree.

**Ruling.** The plugin catalogue is machine-level cache, not project data: a JSON file under
the same per-user directory, read/written by native code only. User scan paths and
audio/MIDI device choices go into `AppSettings`. SQLite stays out until Stage 4's search and
transaction load actually justifies it, which is the baseline's own §11.2 position.

## 5. MIDI and CTRL49 transport/runtime

Ordinary MIDI is owned by the DeviceProfile service family
(`CE/src/DeviceProfile/DeviceProfileService*.cpp`): port I/O, jobs, request/response
transactions, variables, and MIDI-CI (`juce_midi_ci`, `MidiCiSession`), bridged to the web
runtime by `DeviceRuntimeBridge`.

The CTRL49 stack (`CE/src/ControlSurface/`) is real, tested, and further along than the
baseline assumes:

- `Ctrl49Protocol` — vendor SysEx builders, golden bytes from the reverse-engineering handoff;
  the keepalive constant is literally `kKeepaliveIntervalMs = 900` (`Ctrl49Protocol.h:135`).
- `Ctrl49Session` — upload/activate sequence, keepalive thread, watchdog-safe teardown.
- `Ctrl49WinMmOutput` (public cable-0 output) and `Ctrl49PrivateInput` (hidden cable-2 input
  carrying the VIP-layer controls).
- `Ctrl49Reducer` (event decoding), `Ctrl49Assignment` (pages → device-profile parameters),
  `Ctrl49PresetBank`, and a self-contained product exe `Ctrl49Bridge` with embedded assets
  and a `--selftest` registered in CTest.
- Seven hardware-free test targets (Protocol, Reducer, Preset, PresetBank, SynthCompile,
  Assignment, MultiSynth) plus five Windows hardware demonstrators.

The baseline's §2.3 demand — "formalize the proven work into a protocol test harness" — is
substantially met at the protocol layer. What does not exist is any connection between this
stack and the editor application: no app target compiles ControlSurface sources. That gap is
exactly Stage 3's scope, and nothing in Stage 1 touches it.

**Ruling.** Stage 3 attaches `Ctrl49Session`/`Reducer`/`Assignment` to the editor through the
bridge; Stage 1 neither duplicates nor disturbs them.

## 6. Panel, Custom Component, Scripting and controller-page systems

- **Panels**: authored in CE_Application, rendered by `CE_Panel`, executed at runtime by
  `PlayerHost` (shared by the standalone player and the plugin).
- **Custom Components**: the `Custom*` designer suite under `sections/` with package
  import/export (`utils/customComponentPackage.js`).
- **Scripting**: seven languages over one API — Lua (sol2) and JS/TS (`juce_javascript`)
  always with `CEDITOR_SCRIPTING=ON`, embedded CPython optional, C++/C#/Java as
  compile-at-export native handler modules over a flat C ABI
  (`CE/src/Scripting/NativeHandlerAbi.h`); the `ceditor_scripting` static library is defined
  at `CMakeLists.txt:852–992`.
- **Controller pages**: the Screen Builder frontend plus the assignment model — pages bound to
  device-profile parameters, compiled to hardware bytes through `Ctrl49Assignment` +
  `DeviceProfileEngine`, shipped as JSON (`tools/ctrl49/bridge-default.assignment.json`).
  Design record: `screen-builder-design.md` ("templates + assignments, never panel
  rendering"; device Lua renders host state).

**Ruling.** The baseline's neutral `PageDefinition` (§9.3) has a working ancestor: the
assignment model. Stage 2/3 extend page bindings to plugin-parameter addresses alongside
device-profile parameters. Building a second page system is prohibited and unnecessary.

## 7. Logging, shutdown and recovery

Logging is `juce::Logger::writeToLog` in the scripting engines, bridge-emitted `debugLog`/perf
events into the web console (with an opt-in message-thread stall watch), and per-run
transcripts for the installer script. **There is no durable native log sink** — no
`FileLogger` anywhere. Shutdown is `systemRequestedQuit → MainWindow::saveAndClose → quit`,
with the bridge teardown invariant above. Recovery exists at the web-storage level
(`stores/panelSessionPersistence.js`, `utils/localStorageState.js`); the player has
`RestorePolicy.h` governing when a restored patch may be pushed at hardware. There are no
native crash-recovery snapshots.

**Ruling.** Stage 1's scan/load diagnostics need a durable sink: install a `juce::FileLogger`
in the per-user directory where `Logger::writeToLog` already flows, and write the
scan dead-man marker beside the catalogue. Both are small additions following existing
conventions, not new subsystems.

## 8. Build/export, process execution and Inno Setup

This is where the baseline's central packaging idea turns out to be **already shipped, for
panels**:

- **In-app export**: the `buildVst3` bridge event (`ValueTreeBridgeHandlers.cpp:1420`) runs a
  Timer-polled child process and streams progress. It picks between **two pipelines by what
  the install has** (`ValueTreeBridgeHandlers.cpp:1455`): `export-panel-vst3.mjs`
  (compile-per-panel via CMake cache vars — needs a build environment) or
  `export-panel-template.mjs` (compiler-free).
- **The template player** (`CEDITOR_TEMPLATE_PLAYER`, `CMakeLists.txt:301–328`): a prebuilt,
  panel-agnostic binary that takes identity and content from the `.cepanel` beside it, with
  identity bytes proven identical to the compiled path against JUCE's own
  `convertJucePluginId` (`CEditorIdentitySidecarTests`). This is precisely the baseline
  §16.6 model — "maintained prebuilt native target wrapper + validated packaged project" —
  running in production.
- **Identity**: one derivation shared by editor UI, exporters and C++
  (`utils/exportIdentity.js` ↔ `CE/src/Export/PanelExportIdentity.h`, self-checked on every
  export run).
- **Installer**: `tools/installer/CEditor.iss` + `tools/scripts/package-installer.ps1`
  (version from CMakeLists, vcvars, build, stage, locate `ISCC.exe`, compile, optional VC++
  redist/WebView2 bootstrap) + `build-installer.cmd` (transcript log). **Developer-invoked
  only** — nothing in the app UI reaches it. The baseline's claim of "automated Inno Setup
  integration" is true of the scripts and not yet true of the application.

**Ruling.** Standalone/outer-VST3 assembly for Host Projects extends the template-player
pattern (maintained wrappers + packaged project), not per-build compilation. The Build menu
is new bridge events over the existing job pattern; the installer step generates a defines
file against a maintained template descended from `CEditor.iss` and invokes `ISCC.exe`
through the same child-process machinery. No second installer engine, no second export
identity scheme.

## 9. Build system, JUCE, compiler, frontend, CI

- CMake ≥ 3.24, C++23, **vendored JUCE 8.0.7 install** (headers + CMake package + the three
  helper executables, overridable via `CEDITOR_JUCE_HELPER_DIR` for Wine wrappers off
  Windows). MSVC is required for the app; MinGW is refused at configure
  (`CMakeLists.txt:23`). App/player/plugin targets are gated by `CEDITOR_BUILD_APP`
  (default ON only on Windows); tests configure everywhere.
- Modules linked by the editor app today: `core, audio_basics, audio_devices, midi_ci,
  data_structures, events, graphics, gui_basics, gui_extra` — **no `audio_processors`**.
  The player plugin adds `audio_utils` for the plugin-client side. Two Linux-capable test
  targets already link `juce_audio_processors` (`CEditorIdentitySidecarTests`,
  `CEditorPanelParametersTests`), so there is precedent for host-side test targets. The
  vendored install carries the full VST3 hosting SDK
  (`modules/juce_audio_processors/format_types/VST3_SDK`), so `JUCE_PLUGINHOST_VST3=1`
  needs no new dependency.
- Frontend: Vite/Svelte; 4,100+ node tests plus Playwright browser checks; `CE/web/dist`
  embedded via `PlayerWebData`.
- CI: one `windows-latest` job — web tests → bundle → MSVC/Ninja build → ctest. Free on this
  public repo. The export smoke and installer scripts are explicitly not covered yet
  (`.github/workflows/ci.yml` header). Local off-Windows verification recipes are in
  CLAUDE.md and they apply unchanged to new host code.
- Licensing: the repo is AGPLv3 because there is no JUCE commercial license
  (`docs/license-decision.md`). Not a Stage 1 concern — it becomes one on the day a
  closed-source generated binary is distributed, which requires a JUCE commercial tier and
  Steinberg's VST3 agreement first. Recorded here so no release plan inherits the omission.

---

## What Stage 1 genuinely has to build

The gaps, in dependency order — everything not listed here is extension of the systems above:

1. **VST3 catalogue + isolated scanner.** No hosting class is used anywhere today. New:
   class-level catalogue records with stable identities and fingerprints (JSON, per-user
   dir), and the scanner **helper executable** with timeout, crash attribution, dead-man
   marker and quarantine.
2. **The audio path.** No `AudioDeviceManager` is constructed anywhere; the player plugin's
   processor is an intentional passthrough. Device selection, the multi-part
   `AudioProcessorGraph`, the MIDI router, per-part gain/pan, and real-time discipline are
   all new — the one area with no prior art in this tree.
3. **The native editor pane.** New, but ordinary JUCE layout given §3; one editor-host
   component owning one `AudioProcessorEditor`, per the baseline.
4. **The outer VST3 target.** A **new** `juce_add_plugin` target: an instrument with audio
   outputs and inner-state-embedding DAW recall. It cannot be the existing
   `CEditorPlayerVST`, whose identity scheme, passthrough buses and Fx category are a
   shipped product contract for panel exports.
5. **The in-app Build menu** (validate / preview / assemble / installer) over the existing
   job pattern, ending in `ISCC.exe`.
6. **A durable native log sink** (§7).

## Documented deviations

The baseline prohibits second systems "unless the audit demonstrates a concrete technical
need and the deviation is documented." Three new things qualify, none of them parallel
systems:

- **A second executable, the scanner helper** — required by the baseline itself (§8.6.6):
  third-party module scanning must not run in the editor process.
- **A new module dependency** — `juce_audio_processors` with `JUCE_PLUGINHOST_VST3=1` on the
  host-side targets. Hosting cannot exist without it.
- **A second plugin target for the outer VST3** — because the existing plugin target's
  identity and bus contract belongs to panel exports and must not change (see gap 4). Both
  targets wrap shared runtime code; neither is a second host engine.

Everything else — bridge, documents, settings, pages, scripting, CTRL49, export identity,
installer route, CI — is reuse.
