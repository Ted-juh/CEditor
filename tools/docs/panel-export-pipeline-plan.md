# Panel Export Pipeline Plan — Compile-Per-Panel VST3 / Standalone

This document defines the implementation plan for converting a CEditor panel into a
**unique, self-contained JUCE artifact** (VST3 plugin and/or standalone application),
built fresh per panel.

It is the companion to [device-profile-engine-mvp-plan.md](device-profile-engine-mvp-plan.md).
That plan covers the *authoring* loop (design → preview → adjust). This plan covers the
*delivery* loop (panel document → compiled binary → runs in a DAW against real hardware).

> The editor is not the product. The exported artifact is the product.
> The editor is the means to produce artifacts.

## Why Compile-Per-Panel (Non-Negotiable)

A generic runtime "player" plugin — one fixed binary that loads different panel files —
fails the way **Ctrlr** failed: a VST3 is identified to the host by a fixed 128-bit class
ID (FUID). With one shared binary, every "different" panel is the *same plugin* to the DAW:
same ID, same plugin-cache entry, and saved sessions reload the wrong panel.

Therefore: **every exported panel produces its own uniquely-identified binary.**

- Different panels → different plugins (distinct FUID / AU subtype / CLAP id).
- Re-exporting the *same* panel → the *same* identity (so DAW sessions reload correctly).
- The unique identity is generated once and **persisted in the `.cepanel`** document.

## Locked Architecture Decisions

These four decisions shape the whole pipeline. Revisit deliberately, not by accident.

1. **Unique identity is a property of the generator, persisted in the panel, with an
   export-time policy.** On first export, generate a real **128-bit random GUID** (not a
   hash of the name — two identically-named panels must still differ), store it in the
   `.cepanel`, and derive from it: distinct VST3 component **and** controller FUIDs, a
   unique product name, a unique 4-char `PLUGIN_CODE`, a unique AU subtype, a unique CLAP
   id, and a unique bundle filename. JUCE derives the VST3 FUID from *company name + plugin
   name + `PLUGIN_MANUFACTURER_CODE` + `PLUGIN_CODE`*, so making those strings unique makes
   the FUID unique.

   Re-export offers an **identity policy**:
   - **Update this plugin** — reuse the stored GUID → same FUID → existing DAW sessions
     reload correctly (the iterate workflow). Default when the panel already has an identity.
   - **Export as a new independent plugin** — mint a fresh GUID → guaranteed not to collide
     with the prior export, even though it is the same panel.

   Maintain a small registry of issued GUIDs so "new copy" never accidentally reuses one.

2. **The artifact opens its own MIDI port to the device — it does NOT route SysEx
   through the host.** This is how Ctrlr and every real synth editor works, and it
   sidesteps unreliable SysEx-over-VST3 host behavior. Standalone and plugin both open a
   direct hardware MIDI in/out to the synth. Host MIDI routing via `processBlock` is a
   later, optional nicety. Reuses the existing `juce::MidiOutput`/`MidiInput` machinery in
   `DeviceProfileService`.

3. **Self-contained binary via BinaryData.** The web *player bundle* is identical for
   every panel; only `panel.json` + the device profile(s) differ (and are tiny). Per
   export, bake panel + profile (+ prebuilt player bundle) into the binary with
   `juce_add_binary_data`. The artifact's WebView serves from embedded resources — no
   external files, no localhost server in the shipped binary. Prebuild the heavy web
   bundle once to keep per-panel compiles fast.

4. **Reuse the interaction-preview renderer as the player.** Do not build a new renderer.
   Add a "player mode" boot path to the web app that reuses the existing
   preview/interaction runtime, minus the editor chrome (no MenuBar / IconPanel /
   PropertiesPanel).

5. **Two interchangeable export backends, one contract; zero user toolchain by default.**
   Export means *"produce a uniquely-identified, self-contained artifact running the player
   runtime + this panel's data."* Two backends satisfy it identically:
   - **Fast (D)** — template patch / runtime-data read. Instant, no dependencies. Default.
   - **Compile (B)** — bundled MinGW/Clang + prebuilt JUCE, recompiles the runtime. Slower,
     larger install, maximum host compatibility, signable.
   Both build the **same** player-runtime source of truth and obey the **same** identity
   rules, so D and B outputs behave identically. Validate D output and auto-offer B as
   fallback. **No end user ever needs Visual Studio or a separate toolchain.**

6. **Runtime instance isolation (non-interference).** Two instances of the same exported
   plugin, on two tracks, must not affect each other. This is a property of the *player
   runtime*, independent of B/D:
   - Device runtime (`DeviceProfileService`), parameter cache, and WebView are instantiated
     **per `AudioProcessor` instance** — **no `static`/singleton state**.
   - **Per-instance WebView user-data folder** (avoid WebView2 file-lock contention).
   - **Graceful shared-MIDI-port handling** — opening a hardware port may fail if another
     client holds it (driver-dependent on Windows; some USB MIDI devices are single-client).
     Warn, never crash or deadlock.
   - `getStateInformation`/`setStateInformation` is fully self-contained per instance.

## Grounding: What Already Exists

Confirmed by inspection of the current project.

- **JUCE 8.0.7**, vendored via `find_package` in [CMakeLists.txt](../../CMakeLists.txt)
  (`CMAKE_PREFIX_PATH` → `JUCE/lib/cmake/JUCE-8.0.7`). Adding a `juce_add_plugin` target
  is straightforward.
- Only `juce_add_gui_app(CEditor)` exists. **No plugin target, no plugin identity
  settings yet.**
- **Device engine is pure C++ and already does real MIDI.** `DeviceProfileService`
  (`CE/src/DeviceProfile/`) owns `juce::MidiOutput`/`MidiInput` and implements
  `juce::MidiInputCallback`. Send path: `compileParameterMessage()` → `MidiTransaction` →
  queued → timer sends to `MidiOutput`. Defaults to `previewOnly` but real I/O is wired.
- `DeviceProfileService` is instantiated **inside** `ValueTreeBridge`
  (`ValueTreeBridge.h:92`), which is otherwise coupled to editor-only concerns
  (`undoManager`, `juce::FileChooser`, file save/open). Needs extraction.
- **Web app has a single editor entry** (`CE/web/src/main.js` → `App.svelte`); no player
  mode. But the **interaction-preview runtime already renders panels without editor
  chrome** — that is the player renderer.
- Release WebView serves from the `dist/` filesystem via a resource provider in
  `CE/src/WebViewHost.cpp` (`provideFrontendResource()`); dev mode uses Vite at
  `localhost:5173`. Nothing is embedded as BinaryData except the app icon.
- WebView2 static lib is linked (`CE/thirdparty/webview2`).

**No architectural blockers.** The engine is reusable, MIDI lives in the service layer
(not the UI), and the bridge is event-based.

## First Target Device: Roland GAIA (SH-01)

Replaces the SH-201 (which has USB-on-Windows-11 issues). The GAIA is easier to bring up.
Profile lives alongside the existing fixtures in `CE/profiles/test/`.

**Confirmed from the official MIDI Implementation (Model SH-01, v1.01, 2010):**

- Manufacturer ID `41` (Roland); Device ID `10`–`1F` (default `10`), broadcast `7F`.
- Model ID `00 00 41`; commands **RQ1 = `11`** (request), **DT1 = `12`** (set).
  4-byte address, 4-byte size.
- **Checksum** `(128 - (sum(address+data) & 0x7F)) & 0x7F` — the Roland scheme the engine
  already supports.
- **Identity Reply** `F0 7E dev 06 02 41 41 02 00 00 00 03 00 00 F7` (family `41 02`,
  family-no `00 00`, rev `00 03 00 00`).
- Memory map: System `01 00 00 00`; **Temporary (edit-buffer) Patch `10 00 00 00`** (write
  live here); User patches `20 00 00 00`+. Patch offsets: Common `00 00 00`,
  Tone 1 `00 01 00`, Tone 2 `00 02 00`.
- First controls (Tone 1, edit buffer): FILTER Cutoff **`10 00 01 0C`** (0–127),
  FILTER Resonance **`10 00 01 0F`** (0–127), FILTER Mode `10 00 01 0A` (0–4),
  AMP Level `10 00 01 15` (0–127).
- Single-param DT1 write: `F0 41 <dev> 00 00 41 12 <aa bb cc dd> <data…> <sum> F7`.

> **Important:** GAIA synth-design params (cutoff/resonance/etc.) are **SysEx/DT1 only — not
> CC**. The CC list is generic (Volume CC7, Mod CC1, Pan CC10, Expression CC11, Hold1 CC64,
> Bank Select, Program Change, Pitch Bend). So Phase A proves the **CC path via Volume
> (CC7)**, then **FILTER Cutoff via DT1** as the first meaningful control.

> Source extracted to `C:\tmp\sh01_mi.txt` (from `SH-01_MI.pdf`). Set the GAIA's **USB Driver
> = GENERIC** (class-compliant, no Roland driver needed on Win11). Primary test host:
> **Reaper** (most permissive about plugins opening hardware MIDI ports); Studio One secondary.

## Export UX — Candidate 3 (Hybrid)

Export is three concerns on three surfaces, never one blocking modal. Long B/compile
builds (minutes) mean **the run must be non-blocking**.

- **Menu header "Export"** (its own top-level header in `MenuBar.svelte`): quick items
  *Export VST3*, *Export Standalone*, *Export As…*, *Export Settings…*. Plain items run
  immediately using saved defaults.
- **Export tab** (new tab in `TabBar.svelte`, alongside Display / Device / Scripts): the
  home for per-export config, a live build log, and export history (per-target re-export).
  Uses the `display:block/none` tab convention so a running build stays alive while the
  user works elsewhere. Opened by *Export As…*.
- **Progress is non-blocking**: a toast / status-bar chip for quick (D) exports; the full
  build log lives in the Export tab for B builds. The editor never locks.
- **Modals only for the consequential fork**: the identity choice at commit time —
  **Update this plugin** (reuse GUID) vs **Export as new independent plugin** (fresh GUID)
  — plus final confirms. Everything else is inline.
- **Persistent defaults** live in the existing `appSettings` infrastructure
  (`stores/appSettingsSchema.js`), surfaced as an "Export Defaults" section: vendor/company
  name + 4-char manufacturer code, default output folder, default format, backend
  preference (Fast / Recompile / Auto), signing. **Vendor/company name + manufacturer code
  are a global default that each panel inherits and may override per-panel** (stored in the
  `.cepanel` alongside the identity GUID block).

Controls follow project conventions (no comboboxes <5 options, segmented toggles,
select-all-on-focus inputs, dark minimal):

- Format / Backend / Identity policy → segmented icon toggles.
- Output folder → path field + Browse (native chooser via the existing `FileChooser` bridge).
- Vendor / version → text inputs (select-all on focus).
- Result → success card with output path + "Reveal in folder"; error → inline log.

This UX is a front-end over the Phase D export contract — the engine is unchanged if the
shape evolves. Wire it in Phase E.

---

## The Plan — Six Phases

Ordered to **de-risk before automating**: prove the runtime by hand, prove the plugin
wrapper by hand, *then* build the generator that stamps them out. Each phase ends in a
concrete test you can run.

### Phase A — Author the GAIA profile + a tiny test panel *(content, no C++)*

Goal: the smallest real target to aim at.

- [x] A1. Wrote `CE/profiles/test/roland-gaia.ceditor-device.json`. Scope expanded beyond
      the minimum to the **entire FILTER section** (11 params: mode, slope, cutoff,
      keyfollow, env-velocity-sens, resonance, env A/D/S/R, env depth) + **AMP Level** +
      **Master Volume (CC7)** — 13 parameters, `dt1`/`rq1`/`volumeCc` recipes.
- [x] A2. DT1 SysEx params address-mapped (Temp Patch Tone 1 `10 00 01 0A`–`15`) with the
      `roland-7bit` checksum (the real Roland scheme — note the test profiles' `sum-7bit` is
      a *different*, plain additive checksum).
- [x] A3. GAIA identity (mfr `41`, family `41 02`, model `00 00`, rev `00 03 00 00`) +
      identity request/reply matcher, and **15 test vectors** (checksums computed in
      `C:\tmp\gaia_checksums.py`).
- [x] **Verified**: added the profile to the C++ harness
      (`CE/tests/DeviceProfileEngineTests.cpp`), built `CEditorDeviceProfileTests` (MSVC via
      `vcvars64.bat` — the build shell needs the VS dev env), and **all 15 GAIA tests pass;
      whole suite passes**. The engine itself compiles the bytes + checksum and matches the
      expected hex. Cross-check: `filter.envRelease=64` @ `10 00 01 13` → `…13 40 1C F7`,
      identical to the SH-201's existing passing test at the same address.
- [x] A4. Built the test-bed panel by driving the real Release app via CDP: 12 sliders in
      a 4×3 grid, each bound to a GAIA filter-section parameter (mode, slope, cutoff,
      keyfollow, env-vel-sens, resonance, env A/D/S/R, env depth, amp level). Verified the
      bound params compile correct MIDI through the live C++ engine (`compileParameterMessage`
      → `midiPreview`), e.g. cutoff=64 → `F0 41 10 00 00 41 12 10 00 01 0C 40 23 F7`.
      *(Not yet saved to a `.cepanel` file — first save needs the native dialog.)*

**Exit proof:** in the existing editor, moving the controls previews correct bytes, and
(with a real MIDI port selected) the GAIA responds. Validates the profile before any new
binary exists.

### Phase B — Runtime as a hand-built standalone, talking to the real GAIA

Goal: prove rendering-outside-the-editor + device engine + real hardware. No code-gen yet.
This is the same code the generator will later template.

- [~] B1. **Decouple the device runtime.**
      - [x] Audit: `DeviceProfileService.cpp` has **no static/singleton mutable state** — all
        state is instance members; fully per-instance (decision #6 met). The service already
        builds & runs standalone (proven by `CEditorDeviceProfileTests`, which constructs one
        without `ValueTreeBridge`), so the runtime is already editor-independent.
      - [x] Shared seam created: `CE/src/DeviceProfile/DeviceRuntimeBridge.{h,cpp}` —
        `withDeviceRuntimeEvents(options, service, emit)` wires the ~26 runtime device events
        (list/map/compile/sync/scan/bulk/parse/ingest/runtime queries) onto a WebView Options
        builder, driving a `DeviceProfileService` and reporting via an `emit` callback.
        Omits editor/authoring events (file-chooser import, profile-source editing). Compiles
        + links into the CEditor target.
      - [x] Migrated `ValueTreeBridge::buildOptions` to call `withDeviceRuntimeEvents`:
        removed ~333 lines of inline runtime handlers (kept editor-only authoring events
        inline). Builds clean; functionally verified via CDP on the running editor —
        `listDeviceProfiles` returns all 5 profiles incl. `roland-gaia`, and
        `compileParameterMessage` (filter.cutoff=64) returns the correct DT1 bytes through
        the seam. **B1 complete.**
      - [ ] The player bridge (B3) consumes `withDeviceRuntimeEvents` with its own emit.
- [x] B2. **Player web mode.** Added multi-entry Vite (`index.html` + `player.html`),
      `src/player.js`, `src/Player.svelte` — renders ONE panel read-only/interactive via the
      existing `PanelPreviewSurface` (no editor chrome), reusing the real bg/grid helpers +
      `syncPanelPreviewSessions`. Boots from `window.__CE_PANEL__` or `window.__CE_LOAD_PANEL__(doc)`.
      Verified: `npm run build` emits `dist/player.html` + bundle; loaded the real 12-slider
      GAIA panel in-browser → renders correctly, no editor chrome. **Fix:** `panel` must be
      `$state.raw` — a deep `$state` proxy makes `PanelPreviewSurface`'s `structuredClone`
      throw `DataCloneError` (the editor sidesteps this via a `$derived`, non-proxied panel).
- [x] B3. **Player bridge.** `PlayerHost` wires the shared `withDeviceRuntimeEvents(service,
      emit)` seam (so `compileParameterMessage`/`setParameter`/etc. reach the player's own
      `DeviceProfileService`) plus a panel-load handshake: JS `Player.svelte` emits
      `playerReady` → C++ hands over the panel. No undo/file dialogs. **Bidirectional bridge
      verified in the player binary**: `compileParameterMessage(filter.cutoff=64)` →
      `F0 41 10 00 00 41 12 10 00 01 0C 40 23 F7` round-tripped through the player's own engine.
      - Note: `emitEventIfBrowserIsVisible` is gated on `isVisible()`, so events emitted before
        the window is visible (e.g. the very-early `playerReady`→`loadPanel`) get dropped. Panel
        load therefore uses `evaluateJavascript` (not visibility-gated) — the correct fix for the
        startup race. Device echoes via the event channel work once the window is visible. MIDI-in
        → param updates / `getState` still deferred.
- [x] B4. **Player target (standalone GUI app).** Added `juce_add_gui_app(CEditorPlayer)`
      (`CE/src/Player/PlayerMain.cpp`, `PlayerHost.{h,cpp}`) linking the device engine +
      `DeviceRuntimeBridge`, hosting a WebView2 that serves `player.html` from dist (or
      localhost in dev). Loads a `.cepanel` passed as argv[1]. Builds + runs; **verified**:
      `CEditor Player.exe <gaia.cepanel>` launches, auto-loads, and renders the 12-slider
      GAIA filter panel in its own window with no editor chrome.

**Exit proof:** `CEditorPlayer.exe` runs a panel outside the editor ✓. Remaining for full
proof: device-echo channel fix (B3 follow-up), then pick a MIDI port + confirm a control
move reaches the GAIA (JS→C++ send path is in place; needs the echo fix or a real-port test).

### Phase C — Wrap the same runtime as a hand-built VST3, load it in a DAW

Goal: prove plugin packaging, WebView-in-plugin, unique ID, and state save — still one
panel, still hand-built.

- [x] C1. Added `juce_add_plugin(CEditorPlayerVST)` — `FORMATS VST3 Standalone`,
      `PLUGIN_CODE Cep1` / `PLUGIN_MANUFACTURER_CODE Tdjh` (hardcoded identity for now; Phase D
      derives it). **VST3 bundle builds** (`…/VST3/CEditor Player VST.vst3` + moduleinfo.json).
- [x] C2. Minimal `AudioProcessor` (audio passthrough) in `CE/src/Player/PluginProcessor.{h,cpp}`;
      the `AudioProcessorEditor` **reuses the same `PlayerHost`** the standalone uses. **Verified
      via the Standalone wrapper**: renders the 12-slider GAIA panel, bridge live, and
      `compileParameterMessage(filter.resonance=32)` → `F0 41 10 00 00 41 12 10 00 01 0F 20 40 F7`
      through the plugin's own engine. (Also fixed `PlayerHost` dist lookup to walk up robustly —
      the Standalone wrapper exe nests one level deeper than the standalone app.)
      Plugin-opens-own-MIDI-port (decision #2) not yet wired (preview/dry-run only so far).
      **Still true as of 2026-08-23**, and re-checked rather than assumed: the processor holds a
      `DeviceProfileService` and calls `compileParameterMessage(payload, true)` on a parameter move,
      but that second argument is `updateState`, not "transmit", and nothing in that call reaches a
      `juce::MidiOutput`. Raw-wire moves go through `sendParamRawMidi`, which builds bytes. Whether
      those bytes leave the machine is the one thing here that only a synth can answer.
- [x] C3. `getStateInformation`/`setStateInformation` — **done**, and wider than this line asked
      for: `PluginProcessor.h` defines both, saving APVTS state, the device role→port mapping
      (`exportRoleMappings`/`importRoleMappings` at :255 and :286), script state and `ce.storage`.
- [x] C4. **Serve WebView from embedded resources (BinaryData).** `juce_add_binary_data(PlayerWebData)`
      embeds the built web bundle into the player + plugin; `PlayerHost` serves `player.html` +
      assets from it by basename (filesystem dist kept as dev fallback). **Self-contained &
      host-path-independent — fixes the blank panel in a DAW** (the old filesystem path resolved
      to the host, not the plugin). Verified: VST Standalone built with the embedded bundle renders
      the 12-slider GAIA panel with no `dist` on disk. *(Per-instance WebView user-data folder:
      ✅ done — `PlayerHost` derives a unique temp folder per instance from hi-res ticks + an
      instance counter; the two-instance TEST (C5) is still the open item.)*
- [ ] C5. **Two-instance test** + real-DAW scan/load. **Deferred** (needs a DAW — yours).

**Exit proof:** ✅ **VST3 builds, loads in Reaper, and its panel UI PAINTS inside the host**
(the WebView-in-plugin milestone — the riskiest part of the pipeline). The blank-panel blocker
was a WebView2 user-data-folder conflict (fixed: unique folder per instance) + the embedded-bundle
asset fix (C4).

**Re-checked 2026-08-23.** Of the four things this paragraph listed as remaining, three are done and
one is not:

- ~~hide JUCE's stock MIDI-CC params~~ — done, `CMakeLists.txt:381` sets
  `JUCE_VST3_EMULATE_MIDI_CC_WITH_PARAMETERS=0`.
- ~~C3 state save~~ — done, see C3 above.
- ~~the unique-folder build is in `build/native`; swap into `export-out`~~ — done, the exporter
  writes to `export-out` (`export-panel-vst3.mjs:39`).
- **Still open: live MIDI to the synth via the plugin's own port** (decision #2), and **C5**, the
  two-instance test in a real DAW. Both need a Windows box, and the first needs a synth on the end
  of it.

### Phase D — Build the exporter inside CEditor (the "Conversion" feature)

Goal: automate Phases B–C into one button, behind a backend-agnostic contract, with **zero
user toolchain by default**. Unique-binary-per-panel + the identity policy become real.

- [~] D1. **Identity block + policy in `.cepanel`.**
      - [x] Derivation core implemented + verified: `CE/src/Export/PanelExportIdentity.h`
        (`deriveIdentity(guid, name, vendor, mfrCode, version)` → unique `pluginCode`,
        `auSubtype`, `clapId`, productName). Deterministic per GUID, unique across panels
        even with identical names, valid 4-char codes (JUCE-safe). Test:
        `CE/tests/PanelExportIdentityTests.cpp` (target `CEditorExportIdentityTests`, all pass).
      - [ ] Mint a random GUID on first export, persist it in the `.cepanel`, keep a registry
        of issued GUIDs, and wire the **Update vs New-copy** policy. *(needs generator + file I/O)*
- [~] D2/D4. **Export contract + compile backend — PROVEN end-to-end.**
      `tools/scripts/export-panel-vst3.mjs`: given a panel + GUID, derives the identity
      (JS port of `PanelExportIdentity`, **self-checks `pluginCode`/`auSubtype` against the
      C++** so they can't diverge), then builds a uniquely-identified VST3 from the shared
      `CEditorPlayerVST` template via CMake cache vars (`CE_VST_PLUGIN_CODE` /
      `CE_VST_PRODUCT_NAME` / `CE_VST_PANEL_PATH`) and copies it to `export-out/`.
      **Verified the Ctrlr fix:** three builds → three distinct VST3 FUIDs
      (`…43657031`=Cep1, `…47663262`=Gf2b, `…4A6D6C45`=JmlE from GUID `panel-guid-7c3e-demo`).
      The FUID encodes mfr+pluginCode, so a GUID-derived `pluginCode` ⇒ a unique plugin per panel.
      Remaining: bake the panel via `juce_add_binary_data` (vs the current fixed path),
      persist the GUID in the `.cepanel` (D1 second half), bundle a toolchain for end users
      (currently uses the dev MSVC), and the **Update vs New-copy** policy.
- [ ] D3. **Fast backend (D — default).** Ship a prebuilt template artifact. Differentiate
      per export by (a) embedding the panel/profile data blob and (b) applying the identity.
      Two flavors to prototype in order:
      - **D-patch**: fixed-length placeholder FUIDs/name strings in the template, byte-
        patched per export. Works with a stock-JUCE template. Build this first.
      - **D-runtime**: template reads its data blob at load and returns the stored GUID as
        its class FUID from a custom VST3 factory (signable once, byte-identical binaries).
        Migrate to this if the cleaner end state is wanted.
- [ ] D4. **Compile backend (B — advanced/fallback).** Bundle MinGW-w64 (self-contained
      runtime, no MSVC/SDK redistribution issue) or Clang. Emit a parameterized CMake +
      source skeleton, bake data into `juce_add_binary_data`, write identity into
      `juce_add_plugin`, build against vendored JUCE. Warm build dir to keep rebuilds fast.
- [ ] D5. **Validation + auto-fallback.** After a D export, validate the artifact (loads,
      reports correct unique FUID, runtime boots). On failure, offer B automatically.

**Exit proof:** from the editor, export the Phase A panel via D → a uniquely-identified
`.vst3` behaving exactly like the hand-built Phase C one, with no toolchain installed.
Export the **same** panel again as "new independent plugin" → the DAW shows two
non-colliding plugins (the "even if same panel" guarantee). Export a different panel via
**B** → identical behavior. Ctrlr bug gone in all cases.

### Phase E — Wire the in-editor UX and close the loop

Implements the Hybrid (Candidate 3) UX above.

- [ ] E1. Add the top-level **Export** menu header in `MenuBar.svelte` with quick items
      (*Export VST3*, *Export Standalone*, *Export As…*, *Export Settings…*).
- [ ] E2. Add the **Export tab** to `TabBar.svelte` (config + build log + history).
- [ ] E3. Non-blocking progress: status-bar/toast chip for quick exports; full log in tab.
- [ ] E4. Identity confirm modal (Update vs New copy); success card with "Reveal in folder."
- [ ] E5. Export Defaults section in `appSettings` (vendor, manufacturer code, output dir,
      default format, backend preference, signing).

**Exit proof (the stated goal):** design a panel in CEditor → click Export → open the
resulting VST3 in your DAW → it controls the GAIA. Loop closed.

### Phase F — Extend (only after E works end-to-end)

- [ ] F1. More GAIA controls / a full section.
- [ ] F2. **MIDI-in feedback** in the player (turn a knob on the GAIA → panel follows).
      The engine's `MidiInputCallback` + echo-suppression design already anticipate this.
- [ ] F3. Host-automatable parameters (APVTS) so the DAW can automate controls.
- [ ] F4. AU / CLAP formats (CLAP id trivially unique; AU needs the unique subtype from the
      identity block).

---

## Prerequisites / Open Items

- [ ] **GAIA MIDI implementation chart** (CC list + DT1 address map + model id + checksum)
      — required for Phase A.
- [ ] **Dev-machine toolchain** (for Phases B–C hand-builds only): CMake + a C++ compiler.
      Vendored JUCE 8.0.7 is already present. **End users need nothing** — the D backend
      requires no toolchain, and the B backend bundles its own (MinGW/Clang) inside CEditor.
- [ ] **Confirm sequencing** (standalone-first, then VST3, then generator). Going straight
      at the VST3 target is possible but riskier.

## Key Risks

- **WebView-in-plugin** reliability across DAW hosts (focus, resize, multiple instances).
  Mitigated by proving on one host (Reaper) in Phase C before generalizing.
- **Per-panel compile time.** A fresh JUCE plugin build is minutes. Mitigated by a warm
  build directory and prebuilt player web bundle; the per-panel data is tiny.
- **`PLUGIN_CODE` 4-char uniqueness space is small.** Rely primarily on a unique product
  name + the persisted GUID; treat `PLUGIN_CODE` as derived, with collision avoidance.
- **Opening hardware MIDI ports inside a plugin.** Standard for synth editors and fine on
  Windows; note that some hosts sandbox aggressively, and some USB MIDI devices are
  single-client (handle "port busy" gracefully — decision #6).
- **D-patch fragility / code signing.** Byte-patch offsets must be stable across template
  rebuilds (mitigate with explicit fixed-length sentinels; spike before committing).
  Patching after signing invalidates the signature, so sign per-export or ship unsigned for
  now; D-runtime can be signed once.
- **Bundled-toolchain size (B).** MinGW/Clang + prebuilt JUCE adds hundreds of MB to the
  CEditor install. Acceptable because B is the advanced/fallback path, not the default.
