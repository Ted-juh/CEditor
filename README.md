# CEditor

**CEditor** (originally *Ctrlr Editor*) builds editors for hardware synthesisers — and the editors
it builds are instruments in their own right.

Point it at a device, lay out a panel, and every knob is bound to a real synth parameter with the
range and option names the manual gives it. That much other editors do. What no other editor does
is the rest of the panel: it can **play** the synth. Chord pads, an arpeggiator, a ribbon keyboard,
drum pads, a harmoniser and a phrase sequencer emit notes. Four independent modulation
sources — geometric, gestural, generative and physical — move parameters on hardware that has none
of its own. A transport that follows MIDI clock or the DAW playhead, a setlist, a keyboard splitter
and a panic button make it a stage rig. Preset Constellation and Timbre Space turn a patch library
into a map you navigate by musical intention rather than by parameter number.

Panels carry behaviour written in any of seven languages, and export as a VST3, CLAP, LV2 or
standalone application, so the hardware ends up in a DAW session behaving like a plugin.

Windows only for now, and unsigned — see [RELEASE-NOTES.md](RELEASE-NOTES.md) before installing.
[docs/README.md](docs/README.md) is the full documentation index.

## Architecture

- **Svelte** — all UI (editor + runtime components)
- **JUCE 8** — backend engine (audio, MIDI, ValueTree data model, plugin formats)
- **WebView2** — bridges the Svelte UI to the JUCE backend
- **Vite** — development server with hot reload
- **Panel scripting** — Lua, JavaScript, TypeScript, Python, C++, C# and Java, each stored
  and run in the language it was written in. One shared API across all of them; see the
  [scripting manual](docs/scripting-manual.md) and the [docs index](docs/README.md).

The editor UI runs entirely in Svelte. JUCE handles the non-visual backend: MIDI, file I/O, undo management, and plugin compilation. Communication between the two happens via a native bridge over JUCE's `WebBrowserComponent`.

## Project Structure

```
CE/src/                      C++ backend (JUCE)
  Main.cpp                   Application entry point
  MainWindow.h               Window hosting the WebView
  WebViewHost.h/.cpp         WebBrowserComponent wrapper
  ValueTreeBridge*.h/.cpp    C++ <-> JS bridge over ValueTree
  Scripting/                 Script engines (Lua, JS, Python) + the native-handler ABI
  DeviceProfile/             The device profile engine: parameters, dumps, MIDI-CI
  Player/                    Runtime that plays an exported panel, and the value layer
  Export/                    Export identity shared with the exporter scripts

CE/web/src/                  Svelte frontend
  CE_Application/            Editor application (layout, panels, menus, tools, scripting)
  CE_Panel/                  Panel-side renderers
  Player.svelte, player.js   The exported panel's own entry point
```

The Custom Component designer lives in `CE_Application/sections/` (the `Custom*` editors),
not in a folder of its own.

## Getting Started

### Prerequisites

- **Git** — [git-scm.com](https://git-scm.com/)
- **Node.js** (v20+) — [nodejs.org](https://nodejs.org/)
- **CMake** (3.24+) — [cmake.org](https://cmake.org/)
- **Visual Studio 2022+** (Windows) with the "Desktop development with C++" workload
- **JUCE 8.0.7** — included in the repo under `JUCE/`
- **WebView2 SDK** — included in the repo under `CE/thirdparty/webview2/`

### Clone and Setup

```bash
# 1. Clone the repository
git clone https://github.com/Ted-juh/CEditor.git
cd CEditor

# 2. Install the Svelte/Vite frontend dependencies
cd CE/web
npm install
cd ../..
```

### Running in Development

You need two things running side by side: the Vite dev server (serves the Svelte UI with hot reload) and the JUCE application (the native window with WebView).

**Terminal 1 — Start the Svelte dev server:**
```bash
cd CE/web
npm run dev
```
This starts Vite on `http://localhost:5173`. Keep this running.

**Terminal 2 — Build and run the C++ backend:**
```bash
# Recommended (handles VS developer environment + deterministic config)
powershell -ExecutionPolicy Bypass -File ./tools/scripts/build-native.ps1 -Configuration Debug

# Alternative preset-based flow
cmake --preset native
cmake --build --preset native-debug

# Run
./build/native/CEditor_artefacts/Debug/CEditor.exe
```

The JUCE application opens a window that loads the Svelte UI from the Vite dev server. You can also open `http://localhost:5173` directly in your browser for UI-only development (runs with mock data, no C++ backend).

### Development Workflow

| What you're editing | What to do |
|---|---|
| Svelte UI (`CE/web/src/`) | Just save the file — Vite hot reloads instantly |
| CSS / styling | Same — instant hot reload |
| C++ backend (`CE/src/`) | Rebuild with `powershell -ExecutionPolicy Bypass -File ./tools/scripts/build-native.ps1 -Configuration Debug`, then restart the app |
| CMakeLists.txt | Re-run `cmake --preset native`, then rebuild |
| package.json (new npm dependency) | Run `cd CE/web && npm install`, then restart Vite |

### Project Folder Overview

```
CEditor/
  JUCE/                      JUCE 8.0.7 (pre-installed, do not modify)
  CE/
    thirdparty/
      webview2/              WebView2 SDK (pre-installed)
      clap-juce-extensions/  Vendored CLAP wrapper (the .clap build of the player)
    src/                     C++ backend source (see the tree above)
    dpd/                     Device profile schema, codecs and profile tooling
    include/                 Native app assets
    web/                     Svelte frontend
      src/
        CE_Application/      Editor app (layout, menus, panels, tools, scripting, bridge)
        CE_Panel/            Panel-side renderers
      test/                  Node test suite (npm test)
      package.json           Node dependencies
      vite.config.js         Vite configuration
  docs/                      User-facing docs — start at docs/README.md
    design/                  Design records for the editor and its tooling
  CMakeLists.txt             CMake build configuration
  build/                     Build output (gitignored)
  tools/
    installer/               Inno Setup script and installer assets
    scripts/                 Build, packaging, export and doc-generation helpers
      build-native.ps1       Windows-native build helper (loads vcvars + builds preset)
      gen-api-explorer.mjs   Builds docs/api-explorer.html from the scripting contract
```

### Troubleshooting

- **Vite not found / npm errors** — Make sure Node.js is installed and `npm install` was run in the `CE/web/` directory.
- **CMake can't find JUCE** — The JUCE install is expected at `JUCE/lib/cmake/JUCE-8.0.7/`. Don't move or rename it.
- **`windows.h` missing during native build** — Build from a VS developer environment or use `tools/scripts/build-native.ps1` (it initializes `vcvars64.bat` automatically).
- **Debug/Release confusion** — Use presets: `native-debug` and `native-release` build to `build/native`, so configuration is explicit.
- **WebView2.h not found** — The WebView2 SDK should be at `CE/thirdparty/webview2/build/native/include/`. If missing, re-extract the NuGet package.
- **App shows blank white window** — Make sure the Vite dev server is running on port 5173 before launching the app.
- **Port 5173 in use** — Another Vite instance may be running. Kill it or check `CE/web/vite.config.js` for the port setting.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Follow the folder structure conventions — UI code in `CE_Application/`, runtime components in `CE_Panel/`, etc.
   Property-panel hints and tooltips follow [docs/property-hints.md](docs/property-hints.md).
4. Test in both the browser (`localhost:5173`) and the JUCE app
5. Submit a pull request

## License

CEditor is licensed under the **GNU Affero General Public License v3.0** (see [LICENSE](LICENSE)).
AGPLv3 was chosen to match JUCE 8's free-tier license — the app and exported panels link JUCE, so
distributing them requires AGPL compliance unless a commercial JUCE license is purchased
(background in [docs/license-decision.md](docs/license-decision.md)).
