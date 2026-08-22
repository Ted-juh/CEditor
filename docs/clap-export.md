# CLAP export (and the rest of the format map)

The exported player ships as a `.clap` alongside the `.vst3` (and the standalone). JUCE has no
native CLAP support, so the format is produced by the vendored
[clap-juce-extensions](../ThirdParty/clap-juce-extensions/VENDORED.md) wrapper around the same
`CEditorPlayerVST` target — same PlayerHost, same panel, same WebView UI; only the host-facing
shell differs.

## How it's wired

- **CMake**: `CEDITOR_CLAP` (default ON) adds the vendored wrapper and calls
  `clap_juce_extensions_plugin` on `CEditorPlayerVST`, creating the `CEditorPlayerVST_CLAP`
  target. The plugin identity is `CE_CLAP_ID` — a freeform reverse-DNS string, so per-panel
  uniqueness needs no 4-char-code hashing.
- **Identity**: `exportIdentity.js` / `PanelExportIdentity.h` derive
  `com.<vendor-slug>.<name-slug>.<guid-hash>` from the panel GUID (shown read-only in
  Panel Properties → Export → Identity; pinned by `test/exportIdentity.test.js` on the web side
  and `PanelExportIdentityTests.cpp` on the native side).
- **Export pipeline**: `tools/scripts/export-panel-vst3.mjs` builds the CLAP target unless the
  panel's Export settings say `exportClap: false` (Panel Properties → Export → Formats), then
  copies `<name>.clap` to `export-out/`. No C++ bridge changes — the setting rides in the panel
  document like every other export setting.
- **Features**: the plugin declares CLAP features `utility, external` — a controller surface for
  outboard gear, not an audio processor.

## Who can load it

Windows hosts with CLAP support: Bitwig, Reaper, FL Studio (and other CLAP hosts). Cubase, Live,
and Studio One do not host CLAP — for those, the VST3 remains the door. CLAP is additive.

## The other formats

The policy is "every format reachable without a third-party gate ships":

- **LV2** — free with JUCE, so it builds by default too (`CEDITOR_LV2`, per-panel URI
  `urn:ceditor:<clapId>` via `CE_LV2_URI`, toggle in Export → Formats). Windows LV2 hosts are
  rare; this is mostly future-proofing for a Linux build.
- **AU** — declared in `FORMATS` behind `if (APPLE)`, so it costs nothing today and produces a
  real target the day a macOS port exists. The per-panel `auSubtype` has been derived and tested
  since Phase D.
- **AAX** — gated by Avid: SDK under developer agreement + PACE/iLok signing, without which
  release Pro Tools won't load it. Off until users ask.
- **AUv3** — the AU story plus App Store distribution; a separate product decision.
- **VST2** — Steinberg closed licensing in 2018. Permanently out.

## Standing caveats

- **First native build still unverified**: this environment cannot run MSVC, and CI cannot build
  the C++ side until the JUCE helper executables (excluded by `.gitignore`'s `*.exe`) are
  committed from a machine that has them (`JUCE/bin/JUCE-8.0.7/{juceaide,juce_lv2_helper,juce_vst3_helper}.exe`).
  The wrapper reads only properties `juce_add_plugin` sets, so the installed-JUCE
  (`find_package`) setup is expected to work — expected, not yet proven.
- **Python embed**: the CPython stdlib bundler only lays out the VST3 today. A `.clap` with
  embedded Python runs Python window-open only until a CLAP layout lands (the export script
  warns). Lua/JS are unaffected.
- **Native handlers** (C++/C#/Java modules): bundled next to the VST3 binary only, same story.
- The wrapper's known limitation (discrete/stepped parameters) does not apply: all exported
  panel parameters are continuous `AudioParameterFloat`s (`PanelParameters.h`).
