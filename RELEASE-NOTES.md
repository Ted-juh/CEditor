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
- **A whole editor from a device profile** — File → New Panel from Device Profile builds one bound
  control per parameter, grouped, with the real range, choices and label read off the profile. The
  GAIA profile's 793 parameters become 1624 controls in a second.
- **Export** to VST3, CLAP, LV2 and standalone.
- **Total Recall** — a reopened project puts the whole saved patch back on the synth, not just on
  the screen: the session stores a full device dump beside the automation values, and a restore
  sends the dump first and the values after. The exported plugin asks once, with the device's name
  in the question, and remembers the answer; the panel author sets the default (Export tab →
  Hardware Restore). If you bake a preset librarian bank into the export (Export tab → Programs),
  the DAW also gets a named program menu it can automate between. This has never been run against
  real hardware — see below.
- **Scripting toolchains** managed in-app (Settings → Scripting Toolchains). Lua, JavaScript and
  TypeScript need nothing. Python, C++, C# and Java download a toolchain on first use; C# and Java
  are large (~230 MB and ~195 MB) and entirely optional.

## Known limits, stated rather than discovered

- **Nothing here has been tested against a real synth.** The MIDI the profiles generate is derived
  from published implementation charts and cross-checked in tests, but no message in this build has
  reached hardware. If you have the synth a profile names, you are the first — please report what
  actually happened.
- **Some components cannot be automated from a host, on purpose.** All fifty component types are
  now ruled: 24 export plugin parameters and 26 decline with a stated reason — a meter and a display
  are outputs, note emitters hold no scalar to sweep, a matrix and an envelope have a variable
  number of cells against a parameter list that has to be fixed. `docs/known-issues.md` gives the
  reason for each. If you expect to automate something and cannot, that is worth reporting.
- **Update check, off by default.** Help → Check for Updates asks GitHub whether a newer release
  exists, and Settings → General can make it happen once per launch. It is off out of the box
  because the request tells GitHub this machine's IP address — choosing the menu item is the
  consent. There is no in-app installer: it tells you and links the release page.
- **No current editor manual.** Help → Documentation carries the scripting manual, cookbook,
  getting-started, these notes and the known-issues list, all searchable. What it does not carry is
  a manual for the editor itself: the one in the repository describes an editor two refactors ago,
  so shipping it would be worse than the gap. Help → Keyboard Shortcuts and the hint on every
  property are what the editor documents about itself today.
- **Panel sharing is new and has never run on Windows.** A bare `.cepanel` references images by
  absolute path, so sending one to someone else loses its pictures — the file looks perfect on the
  machine that made it, which is why this went unnoticed. **File → Share Panel...** writes a
  `.cepanelpkg` with every image embedded, and **File → Open Shared Panel...** reads one back. It is
  covered by thirty-two tests, but no package has yet been through a real save dialog, so this is
  the one feature here whose end-to-end path has only been exercised in test. Please try it and say
  what happened.
- **AU is absent** (it needs the macOS port) and **AAX and VST2** are not planned — AAX needs Avid's
  SDK and PACE signing, and VST2 licensing closed in 2018.

## Bringing a Ctrlr panel across

`node tools/scripts/ctrlr-import.mjs <your.panel>` reads a Ctrlr `.panel` or `.bpanelz` and tells
you what is in it. Add `--profile out.json` to harvest a device profile from its modulators, and
`--panel out.cepanel` to rebuild the interface on top of that profile. It needs a source checkout —
there is no in-app importer yet.

It converts a file you already have and fetches nothing. Two things it will not do: guess at a MIDI
message it cannot express (those modulators are flagged with the reason instead), and translate
Lua (methods are imported as reference text with a note saying which of them could be ported and
which drew the panel and cannot be). **No real community panel has been through it yet** — if you
have one, the report alone is useful and worth sending.

## Reporting something

Open an issue with the panel (if you can share it), what you expected, and what happened. Crashes:
say what you were doing. Wrong MIDI: the synth, the parameter, and what the synth did.

The QA sheets in `CE/qa/` are a fast way to find rendering problems — open one, look for a blank
cell or a control that overlaps its neighbour. Each carries a note explaining how to read it.

## Licence

AGPL-3.0. Exported panels link JUCE and inherit the obligation; the app states this in **About** and
on the **Export** tab.
