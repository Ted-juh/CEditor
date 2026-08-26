# The generated instrument-host product (Stage 1, as built)

The record for the VIP-successor's first shippable shape: what CEditor's Instrument Host tab
authors, what the two generated targets are, and where the installer comes from. Written as the
Stage 1 code landed — per this directory's rule, when this document and the code disagree, the
code is right.

## The shape

One service, four consumers. `CE/src/InstrumentHost/InstrumentHostService` owns the catalogue,
the out-of-process scanner, the rack (a real `AudioProcessorGraph` — per-part MIDI gate,
instrument, gain/pan, stereo sum), session persistence and the editor-pane policy, behind a
single `instrumentHost` command surface. Its consumers:

| Consumer | Audio | Session | Editor pane |
|---|---|---|---|
| CEditor's tab (the **Builder**, preview runtime) | own device (`enableAudio`) | per-user file | `WebViewHost`'s pane |
| `CEHostStandalone` (the generated app) | own device | per-user file | `HostRuntimeShell`'s pane |
| `CEHostVST3` (the generated plug-in) | the DAW's — `processBlock` delegates to the graph | the DAW's project chunk (`persistSession=false`, capture/restore vars) | attached and detached with the DAW-owned window |
| the test executables | none | temp dirs | stub hooks |

That last row is the point of the arrangement: everything the wrappers rely on is service API
(`prepareRuntime`, `captureStateVar`/`restoreFromVar`, `setEditorPaneHooks`/`reassertEditorPane`),
so `CEditorInstrumentHostServiceTests` proves the wrapper contracts on any machine, and the
wrappers themselves stay glue thin enough to read (`HostRuntimeShell.cpp`,
`HostPluginProcessor.cpp`, shared pieces in `HostRuntimeShared.h`).

The runtime interface is `host.html` — a third Vite entry that mounts the same
`InstrumentHostView` the editor's tab uses, full-viewport, with none of CEditor's authoring
chrome. It rides in `PlayerWebData` with the player bundle, so the generated targets serve it
from memory wherever the binary was loaded from.

## The Host Project and its identity

`host-project.json` (in the editor's instrument-host data directory) is the manifest:
productName, version, publisher, the two target switches, and an `appId`. The appId is minted
once per project and is **not writable** from the page or the manifest merge — it is Inno
Setup's AppId, and a changed AppId turns an upgrade into a second, parallel install. Rename the
product all you like; upgrades keep finding it.

## The build pipeline

`buildHostProduct` → `Options::runBuild` → the app streams
`node tools/scripts/build-host-product.mjs` (a `HostBuildJob`, same shape as the export and
toolchain jobs) → `instrumentHostBuildProgress` lines into the workspace's Project panel.

The script does **assembly, not compilation**: find what CMake already built
(`CEHostStandalone`, `CEHostVST3`, `CEditorPluginScanner` — the scanner ships beside every
target, inside the VST3 bundle next to the module), stage it as the installer's source tree,
and compile `tools/installer/HostProductTemplate.iss` with the manifest as `/D` switches.
Per-product *binary* identity (`CE_HOST_PRODUCT_NAME`, `CE_HOST_PLUGIN_CODE`, …) is CMake cache
territory — a rebuild, deliberately not this script's job, the same split the panel export
pipeline settled first.

Without ISCC the script stages everything, prints the exact ISCC invocation it would have run,
and exits 0 saying so — staging is verifiable on any machine, and only the installer compile is
Windows-bound. `CE/web/test/hostProductBuild.test.js` drives the pure half (path resolution,
staging plan, switch list) and holds the template to the switch list: every `/D` the script can
pass must have an `#ifndef` default in the template, enforced instead of remembered.

## What Stage 1 leaves open

- Per-product binary identity wired from the manifest into the CMake rebuild (the cache vars
  exist; the pipeline passes nothing into them yet).
- The standalone/VST3 pairing of a *specific* Host Project's rack as its factory default —
  Stage 1 products open with their saved session (standalone) or the DAW chunk (VST3).
- Icons, signing, and the WebView2 bootstrapper in the installer.
- Everything the baseline stages later: effects and buses on the same graph, pop-out editors,
  the CTRL49 surface on the runtime.
