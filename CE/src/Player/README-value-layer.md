# Milestone 2 — Value / Parameter Layer (DAW automation + state)

Goal: panel control values become **host-automatable parameters** so a DAW can automate them and
save/restore them with the plugin window closed. The WebView becomes a synced view.

This commit lands **step 1**: an opt-in APVTS built from the panel's baked parameter list, plus DAW
state persistence. It does not yet push automation back to the WebView or send MIDI window-closed —
those are the next sub-steps (below).

## What's here

| Piece | File | Status |
|------|------|--------|
| Parameter model (`exportParameters`) | `web/.../stores/panelModel.js` | ✅ verified (JS) |
| Derivation from controls | `web/.../utils/exportParameters.js` `collectExportParameters` | ✅ verified (22 params off the stress panel) |
| Baked into the `.cepanel` on save | `serializePanel` (fills when empty) | ✅ verified |
| C++ parse + APVTS layout | `CE/src/Player/PanelParameters.h` | ⏳ needs your build |
| C++ APVTS member + `get/setStateInformation` | `CE/src/Player/PluginProcessor.h` (gated) | ⏳ needs your build |
| CMake opt-in | `CMakeLists.txt` `CEDITOR_VALUE_LAYER` (OFF) | ⏳ |

The C++ is **gated behind `-DCEDITOR_VALUE_LAYER=ON` (default OFF)** so your current Player build is
untouched until you opt in — same pattern as `CEDITOR_SCRIPTING`.

## Build & test (your machine — MSVC + vcvars)

```
cmake -S . -B build/native -DCEDITOR_VALUE_LAYER=ON
cmake --build build/native --target CEditorPlayerVST
```

Each `exportParameter` in the baked `.cepanel` becomes one `AudioParameterFloat` (range = min..max,
default = defaultValue, label = unit). Verify:

1. **Automation**: load the VST3 in a DAW → the panel's controls appear as automation lanes.
2. **State persistence**: move parameters, save the project, reopen → values restore (APVTS state is
   serialized in `getStateInformation`, restored in `setStateInformation`).

To get parameters into a panel, **save it from the editor** (the serializer bakes
`collectExportParameters(panel)` when the author hasn't defined a list), or hand-add an
`exportParameters` array to the `.cepanel`.

## Remaining M2 sub-steps (not in this commit)

1. **APVTS → WebView sync** — on a parameter change (automation), push the value into the panel so
   the UI follows. Add an `APVTS::Listener` in `PlayerHost` → `setProperty(path, value)` over the
   bridge (the parameter's `path` is the script address). Marshal to the message thread.
2. **WebView → APVTS sync** — when the user moves a control, write the matching parameter so the host
   records automation. Reverse of (1).
3. **Window-closed MIDI** — on a parameter change with the window closed, the processor sends MIDI
   via `DeviceProfileService` (already decoupled from the WebView). Use the param's `midiCC` (or the
   device profile) to compile the message. This is the core "automation drives the synth" path.
4. **ScriptRuntime wiring** — instantiate `ceditor::scripting::ScriptRuntime` in the player and
   implement the `getValue`/`setValue` callbacks against the APVTS/panel tree, so scripts run in the
   exported plugin (Model 2), not just the editor WebView.

Risks flagged during scoping: APVTS change callbacks fire off the message thread (marshal before
touching the WebView); per-instance state isolation (two tracks, two plugins) needs a check; whether
the WebView keeps state across `setStateInformation` or reloads.
