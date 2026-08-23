# CEditor 0.2.0 — beta

Editors for hardware synthesisers, that are instruments in their own right. Bind a panel to a
device, then give it chord pads, an arpeggiator, four kinds of modulation and a transport that
follows your DAW — and export the result as a plugin.

## Three things to know before you install

**Windows only.** The app links WebView2 and `dwmapi` unconditionally. The macOS and Linux branches
exist in the build files and are unverified; there is no build for either.

**Unsigned.** No Authenticode certificate yet, so Windows SmartScreen will warn you about the
installer, and about every plugin you export. It is not a sign anything is wrong — it is a sign
nothing has been signed. Choose *More info → Run anyway*. A certificate is planned before 1.0;
the app tells you the same thing in **About** and on the **Export** tab.

**One install, and it can export.** There is no cut-down beta build. This installer is the whole
program, and it exports plugins without needing Visual Studio, CMake or a source checkout — it
ships prebuilt player templates and copies one per panel. If you *do* have a source checkout, the
older compiling exporter runs there instead and produces identical plugin identities, so you can
move between the two freely.

## What you get

- **Panel designer** — 50 component types, seven scripting languages, a device-profile designer.
- **Export** to VST3, CLAP, LV2 and standalone.
- **Scripting toolchains** managed in-app (Settings → Scripting Toolchains). Lua, JavaScript and
  TypeScript need nothing. Python, C++, C# and Java download a toolchain on first use; C# and Java
  are large (~230 MB and ~195 MB) and entirely optional.

## Known limits, stated rather than discovered

- **Nothing here has been tested against a real synth.** The MIDI the profiles generate is derived
  from published implementation charts and cross-checked in tests, but no message in this build has
  reached hardware. If you have the synth a profile names, you are the first — please report what
  actually happened.
- **Some components cannot be automated from a host.** A meter, a modulation matrix and an envelope
  export no plugin parameter, deliberately (see `docs/known-issues.md` for why). Twenty-seven other
  component types are not yet ruled on and also export nothing — mostly structural ones where that
  is obviously right, but if you expect to automate something and cannot, that is worth reporting.
- **No update channel.** There is no in-app update check. Watch the repository.
- **Panel sharing is new and has never run on Windows.** A bare `.cepanel` references images by
  absolute path, so sending one to someone else loses its pictures — the file looks perfect on the
  machine that made it, which is why this went unnoticed. **File → Share Panel...** writes a
  `.cepanelpkg` with every image embedded, and **File → Open Shared Panel...** reads one back. It is
  covered by thirty-two tests, but no package has yet been through a real save dialog, so this is
  the one feature here whose end-to-end path has only been exercised in test. Please try it and say
  what happened.
- **AU is absent** (it needs the macOS port) and **AAX and VST2** are not planned — AAX needs Avid's
  SDK and PACE signing, and VST2 licensing closed in 2018.

## Reporting something

Open an issue with the panel (if you can share it), what you expected, and what happened. Crashes:
say what you were doing. Wrong MIDI: the synth, the parameter, and what the synth did.

The QA sheets in `CE/qa/` are a fast way to find rendering problems — open one, look for a blank
cell or a control that overlaps its neighbour. Each carries a note explaining how to read it.

## Licence

AGPL-3.0. Exported panels link JUCE and inherit the obligation; the app states this in **About** and
on the **Export** tab.
