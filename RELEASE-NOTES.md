# CEditor 0.2.0 — beta

Editors for hardware synthesisers, that are instruments in their own right. Bind a panel to a
device, then give it chord pads, an arpeggiator, four kinds of modulation and a transport that
follows your DAW — and export the result as a plugin.

## Three things to know before you install

**Windows release candidate.** The local Windows Release build is the verification target.
The macOS and Linux build paths remain unverified; neither has a release artifact.

**Unsigned.** No Authenticode certificate yet, so Windows SmartScreen will warn you about the
installer, and about every plugin you export. It is not a sign anything is wrong — it is a sign
nothing has been signed. Choose *More info → Run anyway*. A certificate is planned before 1.0;
the app tells you the same thing in **About** and on the **Export** tab.

**VST3, CLAP and LV2 export without a compiler.** The installer includes player templates, Node
and the export scripts. It exports VST3, CLAP and LV2 panels using Lua, JavaScript and TypeScript
without Visual Studio or a source checkout, into Documents → CEditor → Exports. A CLAP is exported
as a folder holding the `.clap` and its panel, and an LV2 as its bundle with the panel inside;
install the whole folder either way. Extra native script runtimes require the compiling exporter.
Unsupported runtimes are refused with an explanation.
The build log now says what the panel's bytes are made of: the document against its compact form,
controls by type, the heaviest section inside parts, embedded media with repeats, and carried
fonts. The panel inside a plug-in is written compact; the plug-in parses it, nobody reads it.
New panels select VST3 only; saved format choices are retained.

Animations: a fill, text or border colour transitions between states (the two colour choices
that silently did nothing now work), and an animation's easing can be a **spring**: it overshoots
and settles, with damping and bounce, the same curve a script gets from `ce.anim.spring`. Two new
kinds sit beside the transition. **Keyframes** play a shape of their own on one part — a pulse, a
blink — while a state holds, on the beat, or from a script. A **sequence** runs along a time axis,
one track per change, with a timeline in the Animation tab to drag and edit keyframes on, a
playhead that poses the control on the canvas, and Play. A sequence can loop, hold its last frame while the state that started it stays,
or follow the control's value like a scrubbed film. A track can be a part's transform, opacity or
colour, one of the control's value channels, or a filmstrip part's frame, so a filmstrip knob
turns on the sequence too.

**Scripts written for an earlier build: zones and phrase cells now count from 1.** The Zone
Splitter's verbs (`ce.components.split.mute`, `channel`, `transpose` and `point`) and
`ce.components.phrase.cell` count from 1, as the panel labels them and as every other component verb
counts, so zone 1 is the one labelled "Zone 1". They counted from 0, so a script that names a zone, a
step or a row by number now reaches the one before the one it meant: add 1 to each. Zone 0 and step
0 are refused, and the console says the range. A zone named by its label works as it did.

**Scripts written for an earlier build: some `ce.math` answers have changed.**

- `randomFloat(5)` gives a number from 0 up to 5. It was between 1 and 5.
- `random` gives only whole numbers inside its range: `random(1.5, 3.5)` gives 2 or 3, where it
  could give 1. A range with no whole number in it, such as 1.2 to 1.8, is refused.
- `hslToHex` with a negative hue gave the wrong colour in the editor and in JavaScript scripts; -120
  is blue now, as it was in Lua and Python. A saturation or lightness below 0 is held at 0.
- `angleOf` of the same point twice is 0. It was 180 in the editor and in JavaScript scripts.
- A number written as text, such as "128", is read as one in every language (Python read it as 0).
  A value that is not a number is refused in `rgbToHex`, `hslToHex`, `mixColour`, `snap` and `lerp`,
  where it was read as 0 or gave NaN, and the console says which one.

**Scripts written for an earlier build: `ce.anim` rejects a control the panel does not have.**

- `ce.anim.to`, `ce.anim.spring` and `ce.anim.envelope` given a control name the panel does not
  have, such as a misspelt `"cutof"`, return false and write one error to the console. The move
  used to start: it returned true, wrote an error on every step, and called `done` with true at
  the end. A list with such a name in it is rejected whole, as a list with a colour property is.
- An empty path, or none, writes an error to the console. It returned false without a word.
- A `damping` below 0 is replaced by the default, 6, with a console warning. It made the spring
  grow without limit instead of settling.
- A `curve` that cannot be used (an unknown name, control points out of range, or a value that is
  neither a name nor four numbers) is warned about once per command, as every other option is, and
  the move is linear. It was logged on every call, and the last case was linear in silence.
- A `from` that is not a number ("abc", true) starts from the current value, with a console
  warning. It started from 0 or 1 in silence.
- A `stagger` below 0 is replaced by 0, with a warning. It gave each path a delay below 0, and the
  warning named `delay`.
- A `repeat` that is not a number runs the move once, with a warning. It was silent.
- A `done` that is not a function is reported with a warning. It was dropped in silence.
- `ce.anim.envelope` with a `from` or `to` that is not a number uses the default (0 and 1), with a
  warning. "abc" was read as 0 and true as 1 in silence, so `to = "abc"` held the whole move at 0;
  in Python, "abc" raised an error.
- `ce.anim.envelope` with fewer than two points writes an error to the console, as every other
  rejection does. It wrote a plain line.

**Scripts written for an earlier build: `ce.draw` says more.**

- `ce.draw.clear` with a control name the panel does not have, or from a script attached to no
  control and given no name, writes an error to the console. It returned false in silence.
- `ce.draw.stroke` with a `dash` that is not a list, or a `cap` or `join` that is not one of its
  words, draws the default as before, but reports it as a warning, not an error: an error now
  always means the call did nothing.
- `ce.draw.stroke` with a `width` that is not a number above 0, or a `dashOffset` that is not a
  number, draws the default (1, and no offset) with a warning. Both were silent.
- A shape command with a required coordinate, size or text left out (`drawRect(0, 0)`,
  `drawText(0, 10)`) writes an error to the console and draws nothing. It drew at 0, or wrote no
  text, in silence. A size or radius below 0 is 0, with a warning; it drew nothing in silence.
- `ce.draw.gradient` with `stops` left out, not a list, or fewer than two colours writes an error
  and returns nothing. It returned nothing in silence, and read text in place of the list as its
  letters, so `"red"` was three stops, the first of which "is not a colour". An `angle` that is
  not a number is 180, with a warning.
- `ce.draw.path` with fewer than two points, or `points` that is not a list, writes an error and
  draws nothing; it drew nothing in silence. A pair that is not two numbers, and a trailing value
  with no partner, are left out with a warning. `ce.draw.lines` leaves out an item that is not a
  segment with a warning. Each was silent.
- `ce.draw.grid`: `columns` or `rows` given with a spacing wins over it, with a warning; a
  fraction of a column or row is rounded, with a warning; a count or spacing that cannot be used
  is ignored, with a warning; `x`, `y`, `width` and `height` are read as every shape's numbers are.
  Each was silent, and a fraction of a column drew a grid with no closing line.
- `ce.draw.polygon` with `sides` below 3, a fraction or not a number draws three sides, or the
  rounded number, with a warning, and a `rotation` that is not a number is 0 with a warning. Both
  were silent.
- `ce.draw.transform` with an option that is not a number uses its default, with a warning; `cx`
  without `cy`, or the reverse, rotates about the top-left corner with a warning. Both were silent.
- `ce.draw.text` and `ce.draw.measure` with a `size` that is not a number above 0 use 12, with a
  warning; `ce.draw.measure` with `text` left out writes an error and returns nothing (it measured
  ""), and a pixel `scale` it cannot use is 1 with a warning. `ce.draw.image` with a `fit` that is
  not "fill", "contain" or "cover" draws "fill", with a warning. Each was silent.
- `ce.draw.clip` with some of its four numbers left out writes an error and leaves the clip as it
  was; it took the missing ones as 0, which hid everything drawn after it. `ce.draw.blend` with no
  mode writes an error and leaves the blend as it was; it was "normal". `ce.draw.batch` with
  something that is not a function writes an error; it returned false in silence.
  `ce.draw.redraw` with a control name the panel does not have names it; it said "no control to
  redraw", which reads as the script's attachment being wrong when its spelling is.

**Scripts written for an earlier build: `ce.time` says more, in every language.**

- A musical helper with a number it cannot do without left out (`ce.time.position()`,
  `ce.time.beatsToMs()`, `ce.time.swing(1)`) writes an error to the console and returns nothing.
  It used the default without a word: bar 1, 0 ms, no swing. `beatsPerBar`, `max` and `bpm` keep
  their defaults, and say nothing.
- `ce.time.startTimer` and `ce.time.syncTimer` with no id, or "", write an error and start nothing;
  `syncTimer` started a timer called "". `ce.time.stopTimer` with no id writes an error; an id that
  is not running is still not a mistake.
- `ce.time.after` and `ce.time.afterBeats` with something that is not a function write an error
  that names the call; it was a plain line in `after`'s words for both. With no tempo to work from,
  `syncTimer` and `afterBeats` write an error, where it was a plain line: the call did nothing.
- `ce.time.tap` and `ce.time.clockTempo` with a list that is not one write an error; they returned
  nothing as if the taps were too few. An item that is not a number above 0 is left out with a
  warning, and a `resetMs` that is not a number above 0 is 2000 with a warning; both were silent,
  and a `resetMs` of 0 or below made every gap "after a pause".

**Scripts written for an earlier build: a component verb's text left out is refused.**

- A component verb that sets text (`ce.components.lcd.valuePrefix`, `ce.components.lcd.editText`,
  a `label`, a glyph's `bits`) called with the text left out writes an error to the console and
  changes nothing. It wrote "" in silence. An empty text given on purpose is still written.
- Every component verb has an example, a note saying what it returns, and a text for each
  parameter with its range and what is rejected, in the Insert picker, the hover card and the API
  explorer. The LCD Display's verbs say what each setting is: the scrolling speed in characters
  per second, the blink period in milliseconds, the value the {value}, {pct} and {bar} tokens show.

**A script on a control inside a container now runs in the exported plug-in.** It ran in the
editor and was left out of the plug-in: not loaded, its modules not built in, its TypeScript not
compiled. Scripts on top-level controls and panel scripts were never affected.

## What you get

- **A simulated device, for a panel without its synth.** Choose **Simulated device** as a device's
  output (Settings → MIDI, or Ports) and it answers from the profile: it keeps what the controls
  send, sends the patch back when the panel asks for it, and answers **Test**. For profiles with
  Roland-style addresses (GAIA SH-01, SH-201); other profiles get identity only. It makes no sound
  and is not a check of the profile against the instrument. **Internal cables 1–4** connect
  devices inside CEditor; other programs cannot see them (on Windows, loopMIDI still does that).
  The SH-201 profile now describes the synth's identity, so **Test** can recognise it, and its
  42 offset parameters read what the synth's display reads: Coarse Tune −36…+36 rather than
  28…100, depths −63…+63, Keyfollow −200…+200, Master Tune in cents.
- **A first-panel walkthrough** in Help, with binding status explaining missing MIDI settings,
  Dry Run and Preview. The status bar opens Ports; Ports configures the panel's named devices
  and reports the actual send result. Changing ports preserves its profile and parameter values.
  Ports, Routes and Snapshots now render their tools instead of remaining on “Loading…”.
  The toolbar's Bind action now adopts the parameter's range and value type, so a new knob
  controls the full MIDI range. Unmapped devices explain where to assign a profile.
- **Incoming DAW MIDI for panel scripts**, with the plugin window open or closed. Host note-on
  and note-off have been exercised through Lua, JavaScript and TypeScript in a real VST3 host.
  The host bus currently enters as `mainSynth`; processing is asynchronous control scripting,
  and individual DAWs/plugin formats determine which MIDI and SysEx messages they deliver.
- **Panel designer** — 50 component types, seven scripting languages, a device-profile designer.
- **A whole editor from a device profile** — File → New Panel from Device Profile builds one bound
  control per parameter, grouped, with the real range, choices and label read off the profile. The
  GAIA profile's 793 parameters become 1624 controls in a second.
- **Plugin export** to VST3, CLAP and LV2, with or without a compiler. A standalone
  player is a development build target, not a packaged per-panel export option.
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
- **Share panels with File → Share Panel...** The `.cepanelpkg` includes the backdrop, panel
  textures, nested component/part artwork and referenced text fonts. Open Shared Panel and Save
  create an editable copy. A Windows walkthrough verified the native dialogs, embedded SVG
  background, reopen, Save and restart; malformed packages now show an error and preserve the
  current panel. Missing files are reported. Arbitrary files read by scripts are not packaged.
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
