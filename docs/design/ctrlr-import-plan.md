# Ctrlr import — design record

> Status: **built, 2026-08-23** — all four stages, now in `CE/web/src/CE_Application/ctrlrImport/`;
> **in the editor's File menu since 2026-11-07** (New Panel from Ctrlr Panel..., see
> [In the File menu](#in-the-file-menu)), and behind `node tools/scripts/ctrlr-import.mjs` for files
> and corpora. **Run on real panels since 2026-11-08:** 482 distinct community panels, every one
> read; 94.3% of the controls that send MIDI themselves become parameters; and every value of every
> one of those parameters, 2.5 million in all, sends the same bytes Ctrlr sends. **Since the same day,
> a control whose MIDI the panel's Lua sends is run and learned**: 7,269 of 18,971 such controls
> become parameters ([Lua: learning what it sends](#lua-learning-what-it-sends)). The plan below is
> kept as it was written, before anybody here had seen a panel; where the panels proved it wrong,
> [What real panels showed](#what-real-panels-showed) says so.
>
> Originally written to answer one objection, because the objection is the reason this has never
> been attempted: *"converting Ctrlr panels must be enormously hard — Ctrlr is JUCE C++ modules and
> CEditor is Svelte."*
>
> The short answer is that the difficulty is real but it is **not** where the objection puts it.
> Ranked in [`docs/beta-differentiation.md`](../beta-differentiation.md) as Tier 2 #4.

## The objection, and why it points the wrong way

The instinct is: Ctrlr renders panels with JUCE components; CEditor renders them with Svelte;
therefore importing a panel means porting a rendering stack.

**A Ctrlr panel file contains no JUCE code.** It is an XML property bag. Ctrlr's C++ is the
*interpreter* of that file, exactly as CEditor's Svelte is the interpreter of a `.cepanel`. Two
interpreters of two declarative documents; the import is a document translation, and the rendering
stacks on either side never meet.

The evidence is Ctrlr's own identifier table
([`Source/Resources/XML/CtrlrIDs.xml`](https://github.com/RomanKubiak/ctrlr/blob/master/Source/Resources/XML/CtrlrIDs.xml)),
which is the complete vocabulary a panel file can use. Every one of these is a value, not a
behaviour:

```text
componentRectangle   componentAlpha        componentVisibility   componentDisabled
uiSliderStyle        uiSliderMin           uiSliderMax           uiSliderInterval
uiSliderThumbColour  uiSliderTrackColour   uiSliderDoubleClickValue
uiButtonIsToggle     uiButtonIsMomentary   uiButtonColourOn      uiButtonColourOff
uiComboContent       uiLabelText           uiLabelBgColour       uiListBoxContent
uiImageResource      uiImageSliderResource
modulatorMin         modulatorMax          modulatorValueExpression
midiMessageType      midiMessageCtrlrNumber  midiMessageChannel  midiMessageSysExFormula
```

That is a component model with position, style, range and a MIDI binding — which is, structurally,
the same thing `.cepanel` writes down. Two of the mappings are not even conversions:

- **Colours are byte-identical.** Ctrlr stores JUCE `Colour::toString()` output — 8-digit ARGB hex,
  `ff000000`. So does CEditor: `componentTypes.js` is full of `'FF4A4A4A'`. A case fold is the
  entire transformation.
- **Geometry is a rectangle in panel pixels** on both sides, with the same origin convention,
  because both inherited it from the same framework.

So the real difficulty is not the renderer. It is that a Ctrlr panel has three layers of very
different character, and the honest plan treats them differently instead of averaging them into one
"converter" that half-works everywhere.

## The three layers

| Layer | What it is | Difficulty | Plan |
|---|---|---|---|
| **MIDI map** | `<modulator>` + its message definition: number, channel, type, range, SysEx formula | **Easy, and the valuable one** | Convert to a `.ceditor-device` profile |
| **Geometry & style** | `<uiComponent>`: rect, colours, slider style, combo contents, images | **Easy → moderate** | Convert to controls, filmstrips included |
| **Lua** | `luaMethodCode` bodies against Ctrlr's own API | **Hard. Genuinely hard.** | Import as quarantined text + a report. Do not translate. |

### Layer 1 — the MIDI map is the prize

A Ctrlr modulator is a named parameter with a min, a max, and a rule for turning a value into
bytes. A DPD parameter is a named parameter with a min, a max, and a rule for turning a value into
bytes. The impedance mismatch is close to zero, and the direction of travel is *toward* the richer
model — CEditor's engine expresses everything Ctrlr's does and more (transactions, checksums,
codecs, test vectors, sync direction).

The reframe that makes this whole feature cheap:

> **Do not write a UI converter. Write a profile harvester.**

Harvest the modulators into a `.ceditor-device` profile, then let **Auto-Panel** rebuild the
interface natively — in CEditor's own component vocabulary, with CEditor's own bindings, styled
however the user wants. The result is *better* than a faithful visual port: a native panel rather
than a transplant, and it inherits every capability the source panel never had.

And it scales the right way. There are on the order of a thousand community Ctrlr panels covering
several hundred devices. A harvester that runs over the corpus produces a device library; a
pixel-faithful UI converter produces a thousand debugging sessions.

The one piece of real work here is `midiMessageSysExFormula` together with
`modulatorValueExpression` / `modulatorValueExpressionReverse` / `modulatorControllerExpression`.
These are small expression strings — value arithmetic and byte placement — and they need a parser
that emits a DPD encoding. Tractable, well-bounded, and the place to spend the effort, because
every formula understood is a parameter that needs no human. Formulas that do not fit the DPD's
declarative model get flagged for review rather than guessed at.

### Layer 2 — geometry and style are a mapping table

| Ctrlr | CEditor | Notes |
|---|---|---|
| `componentRectangle` | control geometry | Same units, same origin |
| `uiSliderStyle` rotary | `Knob` | |
| `uiSliderStyle` linear h/v | `Slider` | Orientation from the style value |
| `uiSliderMin/Max/Interval` | Range section | Direct |
| `uiButtonIsToggle` / `uiButtonIsMomentary` | Button + interaction defaults | The button-first model covers both |
| `uiComboContent` | `Combobox` rows | Newline-separated list |
| `uiListBoxContent` | `Listbox` rows | |
| `uiLabelText` / `uiLabelBgColour` | `Label` | |
| `uiImageResource` | `Image` | Resource extracted from the archive |
| `uiImageSliderResource` | **filmstrip** | See below |
| `*Colour` attributes | section colours | ARGB hex, case fold only |
| `componentAlpha` / `componentVisibility` / `componentDisabled` | Transform / state | Direct |
| `componentGroupName` / `componentTabName` | `Group` / `Container` | Grouping survives |

**The filmstrip finding, which matters more than it sounds.** Most well-regarded Ctrlr panels are
image-strip panels: the knob is a PNG of sixty-four frames and `uiImageSliderResource` picks the
frame. That is exactly what `InteractivePartRenderer.svelte:258` already implements — `mode ===
'filmstrip'`, horizontal or vertical, driven by `frameCount` / `frameIndex` — and there is already
a filmstrip *baker* in `utils/customComponentFilmstripBaker.js`. So the single most common visual
idiom in the corpus has a working renderer on this side today. Visual fidelity on an image-based
panel could be near-exact, and it costs a resource extractor rather than a drawing engine.

### Layer 3 — Lua is where the difficulty actually lives

This is the honest hard part, and it is hard for a reason that has nothing to do with Svelte.

Ctrlr panels script against **Ctrlr's** API: `panel:getModulatorByName`, `modulator:setValue`,
`CtrlrMidiMessage`, and lifecycle hooks named `luaPanelLoaded`, `luaPanelMidiReceived`,
`luaModulatorValueChange`, `luaPanelPaintBackground`. CEditor scripts against `ce.*`. Two different
object models over two different runtimes.

Three sub-cases, and they are not equally bad:

1. **Value/MIDI logic** — `luaModulatorGetValueForMIDI`, `luaModulatorGetValueFromMIDI`,
   `luaPanelMidiReceived`. Mostly mechanical: they map onto things `ce.*` already does. A **`ctrlr`
   compatibility shim written in Lua on top of `ce.*`** would run a useful fraction of real panel
   scripts unmodified — and this is uniquely available to CEditor because it runs *real Lua 5.4*,
   not a lookalike. A shim is a few hundred lines and it is the highest-leverage thing in this
   layer.
2. **Panel orchestration** — assembling dumps, driving banks, patch-name handling. Portable in
   principle, panel-specific in practice. Import it, do not run it, let the user port it with the
   original in front of them.
3. **Custom paint callbacks** — `uiCustomPaintCallback`, `luaPanelPaintBackground`. These draw with
   JUCE's `Graphics` from Lua. *This* is the only place the original objection is correct, and it is
   correct completely: there is no mapping from immediate-mode JUCE drawing to CEditor's declarative
   section model. Detect them, report them, skip them, and let the Custom Component designer be the
   answer if the user wants that look back.

**The rule: never silently half-translate a script.** A converted panel that looks right and
behaves subtly wrong is worse than one that says plainly *"seven Lua methods were imported as
reference text and are not running; three of them paint, and will need rebuilding in the Custom
Component designer."* Quarantined text plus an honest report is the shippable product.

## Stages

Each stage ships alone and is useful alone. Stop after any of them.

**S1 — Read the file.** `.panel` is XML; `.bpanelz` is the compressed form carrying the resources.
Decompress, parse, and emit a **report**: device name, author, version, modulator count, component
type histogram, message-type histogram, Lua method count and which hooks they use, resource
inventory. No conversion at all. This alone is a research tool — run it over the corpus and you
learn what the corpus actually contains before committing to any mapping. It is also the cheapest
possible way to be wrong early.

**S2 — Harvest the profile.** Modulators → `.ceditor-device` parameters, with the expression /
formula parser and a coverage report (`n` parameters converted, `m` flagged). Open the result in the
DPD Designer. **This is the stage with the return** — it is where a thousand panels become a device
library, and where Auto-Panel takes over.

**S3 — Reconstruct the panel.** Geometry, colours, images, filmstrips, groups → a `.cepanel` with
bindings into the S2 profile. Aim for *recognisable and immediately editable*, not pixel-exact.

**S4 — Lua triage.** Import method bodies as inert script documents, attributed to their original
hooks, with a classification per method (shimmable / port-by-hand / paint — rebuild). Ship the
`ctrlr` compat shim if S1's histogram says the corpus rewards it.

## What this deliberately will not do

- **No JUCE porting.** Nothing in Ctrlr's C++ is read, referenced or reimplemented.
- **No pixel fidelity promise.** Fonts, look-and-feel and custom paint will differ. Say so in the
  import report rather than chasing it.
- **No round-trip.** Import is one-way. Exporting back to Ctrlr would constrain the model to the
  older one forever, for no user.
- **No silent Lua translation.** See above.
- **No bundled panels.** The tool converts what the *user* already has. Redistributing other
  people's panels is their decision, not the program's.

## Licensing

Ctrlr is GPLv3; CEditor is AGPL-3.0 — compatible, and in the permissive direction, so even reading
Ctrlr's source to confirm a format detail is safe. File formats are not themselves copyrightable,
and this plan reimplements a reader rather than lifting code. Panels remain the property of whoever
made them; a user-run converter distributes nothing.

## Verification

Follow the pattern the dump parity tests already use — fixtures shared between the JS and native
sides, so both agree:

- A hand-built minimal panel exercising each mapped property, asserted field by field.
- Two or three real community panels of different character — a CC panel, a SysEx panel, an
  image-strip panel — with their expected harvest recorded as a fixture.
- Round-trip through `shrinkControl` / `expandControl` on every produced control, since
  `documentShape.js` guarantees that inverse and an importer that violates it will produce panels
  that load wrong rather than fail loudly.
- A corpus run: point S1 at a directory of panels and assert it never throws. The failure mode to
  design against is not a bad conversion, it is a converter that dies on panel 40 of 300.

## Open questions

These need a real panel file in front of the implementer; they are cheap to answer at S1 and
expensive to guess at now:

- The exact string format of `componentRectangle` (assumed `x y w h`, unconfirmed).
- `.bpanelz` compression details and how resources are embedded — JUCE's own GZIP path is the
  likely answer, but confirm before choosing a decompressor.
- The value vocabulary of `uiSliderStyle`, `midiMessageType`, and the multi-message form
  (`midiMessageMultiList`).
- How widely `modulatorValueExpression` is used in practice versus left at the identity — this sets
  how much parser is worth writing.
- Whether `modulatorVstExported` / `vstIndex` ordering should be preserved on import, so a converted
  panel keeps automation-slot compatibility with the original for anyone migrating a live session.

## References

- [Ctrlr identifier table (`CtrlrIDs.xml`)](https://github.com/RomanKubiak/ctrlr/blob/master/Source/Resources/XML/CtrlrIDs.xml)
- [`CtrlrModulator.cpp`](https://github.com/RomanKubiak/ctrlr/blob/master/Source/Core/CtrlrModulator/CtrlrModulator.cpp)
- [An example community panel](https://github.com/theacodes/genesynth/blob/master/ctrlr/genesynth.panel)

## What was built

```
CE/web/src/CE_Application/ctrlrImport/xml.js          a small XML reader — no dependency, and a DOCTYPE is refused
CE/web/src/CE_Application/ctrlrImport/binary.js       JUCE's binary tree, JUCE's base64, and the panel inside a program
CE/web/src/CE_Application/ctrlrImport/read.js         S1: decode, parse, report. Converts nothing.
CE/web/src/CE_Application/ctrlrImport/expression.js   Ctrlr's value formulas, read and run as Ctrlr runs them
CE/web/src/CE_Application/ctrlrImport/harvest.js      S2: modulators -> a .ceditor-device profile
CE/web/src/CE_Application/ctrlrImport/reconstruct.js  S3: components -> a placement plan
CE/web/src/CE_Application/ctrlrImport/buildPanel.js   the plan as a panel (the CLI and the editor share it)
CE/web/src/CE_Application/ctrlrImport/ctrlrLua.js     a stand-in for Ctrlr's Lua objects, and Lua 5.1 on 5.4
CE/web/src/CE_Application/ctrlrImport/ctrlrDefaults.js  the property values Ctrlr's constructors set
CE/web/src/CE_Application/ctrlrImport/learn.js        S4: a control's Lua run through its values, made a parameter
CE/web/test/support/ctrlrReference.js                 the bytes Ctrlr sends, ported separately, to test against
tools/scripts/ctrlr-import.mjs                        the CLI, the S4 Lua report, and --verify
tools/scripts/ctrlr-corpus.mjs                        fetches the public panels below, outside the checkout
```

(Moved from `tools/ctrlr-import/` when the File menu took them on: the editor bundles what it runs,
and `read` decompresses with fflate rather than node:zlib so it runs in the page as well.)

```
node tools/scripts/ctrlr-import.mjs panel.bpanelz                       # S1 only: report
node tools/scripts/ctrlr-import.mjs panel.panel --profile out.json      # + S2
node tools/scripts/ctrlr-import.mjs panel.panel --profile p --panel q   # + S3, + the S4 report
node tools/scripts/ctrlr-import.mjs editor.exe --verify                 # a program's panel, bytes checked
node tools/scripts/ctrlr-import.mjs --corpus ./panels --verify          # every file, never stops
```

### The one thing that had to be right, and nearly was not

A parameter naming a `messageRecipe` the profile does not define makes `loadFromJson` reject the
**whole** profile — silently, taking every other parameter with it. The first draft of the harvester
emitted `messageRecipe: "cc"` with the controller on the parameter, which is not the schema: every
harvest would have produced a file that looked right and loaded as nothing. It emits one recipe
per distinct message shape, and a test asserts that every parameter names one that exists, plus a
round trip through the editor's own validator and compiler. The corpus run validates all 482
harvested profiles the same way.

### And the one the reconstruction had to get right

A control bound to a parameter the harvest **flagged** would look connected in the editor and send
nothing. `planReconstruction` takes the harvest's map from each modulator to the parameter it
became, binds by that, and places anything else unbound, listed by name with the reason.

## What real panels showed

The first version was written without a single real panel, and every open question was answered
by refusing and reporting rather than guessing. That made the first real files informative, and
the first one, `genesynth.panel`, converted **0 of 59** modulators. This section is what it took to
go from there to the numbers at the top.

### Where the panels came from

`tools/scripts/ctrlr-corpus.mjs` clones the public repositories (49 on GitHub, 5 on GitLab,
including the community index `ctrlr-panels/ctrlr-panels-list` and Damien Sellier's CtrlrX, the
maintained fork, whose test panels exercise its extended SysEx codes) and lists the SourceForge
projects to download by hand — twenty, most of them John Goodland's (dnaldoog, SourceForge user
`zaniah`), who distributes his panels as programs Ctrlr exported rather than as panel files. None of
it is in this repository: the panels belong to their authors.

| | |
|---|---|
| Files found | 648 panels and programs; 147 identical copies counted once |
| Read | **482 panels, none refused** (the other 19 were programs that are not Ctrlr exports) |
| Forms | 269 XML `.panel`; 187 `.bpanelz` that are zlib-compressed binary trees; 1 `.bpanelz` that is compressed XML; 10 uncompressed binary `.bpanel`; 15 inside programs (Windows `.exe` and `.dll`, Linux `.so` inside `.vst3` bundles) |
| Modulators | 66,931, of which 31,213 send MIDI themselves |
| Not reached | about 60 entries of the community index live only on personal sites or the Internet Archive, which this environment's network refuses. They are untested. |

### What the open questions turned out to be

| Open question | What the panels said |
|---|---|
| `componentRectangle` | `x y w h`, space-separated, in all 66,931 components. The refusal for anything else stays, unused. |
| `.bpanelz` compression | Not compressed XML, as assumed: **JUCE's binary `ValueTree`**, zlib-compressed — a name, then each property as a compressed integer for its name and a typed value. 187 of 188. A program Ctrlr exported carries the same tree as a zlib stream starting `panel\0`, and its pictures in a second stream, `resourceExportList`. |
| `midiMessageType` | A number as text (`0` CC, `5` SysEx, `6` Multi, `9` None…); a few old panels write the name. None 22,697, SysEx 22,373, CC 4,451, Multi 4,413, program change 201, aftertouch 101, channel pressure 14, pitch wheel 8. |
| `uiSliderStyle` | RotaryVerticalDrag 23,892, LinearVertical 5,002, Rotary 1,550, IncDecButtons 844, LinearHorizontal 676, LinearBar 183, and a misspelt `LinearVeritcal` that Ctrlr draws as a vertical slider. |
| `modulatorValueExpression` use | **10,501 modulators are not the identity.** Accepting only the identity lost most SysEx panels: signed values are written as `modulatorValue - 64`, `lt(modulatorValue,0) …`, and so on. The formula reader is now a port of Ctrlr's own, with its functions, and 188 formulas remain that it refuses (they read another modulator or a global variable, or do not give whole numbers). |
| `vstIndex` ordering | Unchanged: carried on each parameter as `ctrlr.vstIndex`. |

And what nobody asked, because nobody had looked:

- **The SysEx formula is a language.** CtrlrX's `sysExIdentifyToken` recognises some thirty codes,
  in a fixed order: the value (`xx`, `MS LS`, `ms ls`, Roland's split `r1`–`r4`, `Q0`–`Q3`), the
  channel (`yy`, `?y`), five checksums (Roland's `z`, ones' complement `O`, sum `w`, XOR `X`,
  Technics `tc`), global variables (`k`, `p`, `n`, `o`), Lua (`u`) and a formula (`v`). 10,184 of the
  22,062 SysEx formulas carry a checksum. A token that is none of these is `getHexValue32`, capped at
  255; and two spaces in a row are a `00` byte, because JUCE's tokeniser keeps the empty token.
  Panels rely on both.
- **Lua carries the panels.** 456 of 482 have it: 13,705 methods. **18,971 controls send nothing of
  their own**, and Lua sends for them when they change. Those are counted, not flagged: nothing is
  wrong with them, and nothing here can run it.
- **Layers are pages.** 116 panels have more than one; 459 layers start hidden and are shown from
  Lua. The CTX81Z keeps sixteen, seven of them hidden, stacked over each other.
- **Pictures are mostly there.** 4,163 resources are named; 1,756 are carried in the file, the rest
  were on the author's computer. 14,169 controls draw from one — image sliders (frames in a strip),
  image buttons (a frame per state) and plain images.
- **One saved panel ends in a NUL** after `</panel>`. Ctrlr reads the text as a JUCE String, which
  stops there; so does the reader now.

### How the bytes were checked

Not against expectations written by hand. `CE/web/test/support/ctrlrReference.js` is a separate port
of the code in CtrlrX that builds the bytes — `getValueForMidiMessage`, `sysexMessageFromString`,
the token identifier and its processor, the five checksums, the Multi list reader, JUCE's
`controllerEvent`. For every parameter the harvest made, every value (all of them up to 600, else
both ends and a spread of a few hundred) is compiled by the device-profile engine and compared byte
for byte with what the reference says Ctrlr sends. The corpus: **2,502,717 values of 29,432
parameters, none different.** `ctrlr-import.mjs --verify` runs it on any file; the unit tests run
it on every value of the fixture.

Two limits on what that proves. The reference and the importer share the formula evaluator and
the value-list reader (each a port with tests of its own); everything about bytes is ported twice.
And the reference is a port of Ctrlr, not Ctrlr: nobody has yet put these bytes on a synth.

### What the profile format gained

Three things the panels needed and profiles could not say, added to both engines
(`DeviceProfileEngine.cpp` and `deviceProfileLocalEngine.js`) and held to the same fixture,
`CE/profiles/test/test-transform-synth.ceditor-device.json` — eighteen value tests and a dump parse,
run by the C++ tests and the node suite:

- **`encoding.transform`** `{ scale, offset, negativeScale, negativeOffset }`: the wire value is
  `trunc(scale × value + offset)`, with the negative pair for values below zero; reading back takes
  the branch whose result is in range. That is an offset (`+64`), two's complement in 7 or 14 bits,
  sign and magnitude, an inverted range, and a scaled one.
- **`encoding.table`**: the wire value for each value, from `range.min` up — for lists whose values
  follow no rule. It wins over a transform.
- **The `ccSequence` recipe** `{ channel, messages: [{ controller, value }] }`, `value` a number or
  `"$byteN"`: several controllers in one change, for a pair that is not an NRPN.

### What does not convert, and why

Of the 31,213 controls that send MIDI themselves, 1,781 do not become parameters. Each is named in
the panel's **Ctrlr import** note with its reason. The corpus, by reason:

| Controls | Reason |
|---:|---|
| 351 | A channel message written inside a SysEx formula (`B0 07 xx` and the like): the value split around other bytes, which a recipe cannot write |
| 275 | Lua computes the byte (`u` codes, `luaModulatorGetValueForMIDI`) |
| 229 | A Multi message that sends several SysEx messages |
| 201 | A program change: it selects a patch, it is not a parameter value |
| 152 | A value formula that reads another modulator or a global variable |
| 109 | A range wider than the message can carry |
| 123 | Aftertouch, channel pressure, pitch wheel |
| 131 | A value, or a row of a list, the message cannot carry |
| 52 | A byte of 0x80 or more inside the SysEx — again a channel message in a SysEx formula |
| the rest | Empty or non-whole ranges, malformed formulas, two checksums in one message, a value written low nibble first |

### The reconstruction, on real panels

Five panels of different character were built and reopened in the editor: genesynth (59
components, CC and Multi), the Korg A2 (270, groups inside groups), the Roland JV-1010 (126, 36 picture
strips), the CTX81Z (688, 133 strips, sixteen layers) and the JD-990 Super Editor (1,657, 641
strips, a background picture). Each is recognisably the panel it came from.

| Ctrlr | CEditor |
|---|---|
| `uiSlider`, `uiFixedSlider` | Knob for the rotary styles, Slider for the linear ones, Number for IncDecButtons |
| `uiImageSlider`, `uiFixedImageSlider` | A custom component drawing the panel's own strip, its frame following the value |
| `uiImageButton` | A toggle button drawing a frame per state |
| `uiButton`, `uiToggleButton` | Button, or ToggleButton when it toggles |
| `uiCombo`, `uiListBox` | Combobox, Listbox — rows from the value list, `name=value` or by line |
| `uiLabel`, `uiLCDLabel` | Label, LCD display |
| `uiGroup`, `uiTabs` | Group, Tab container — the controls inside them placed inside, on their page |
| `uiImage`, `uiMidiKeyboard`, `uiProgressBar` | Image, Keyboard, Progress bar |
| `uiCustomComponent` | A placeholder: Lua drew it |
| `uiArrow`, `uiHyperlink`, `uiXYSurface`, `uiFileListBox`, `uiWaveform` | A placeholder, named in the notes: 284 in the corpus |

Captions take their band of the rectangle (`componentLabelHeight`) as a label attached to the
control; layers become panel layers, hidden ones hidden; the panel's background colour and picture
come across. One finding about size: the CTX81Z's 133 strips made a 6.4 MB file until identical
strips were stored once (the document's shared drawings), which made it 2.6 MB.

### Still true

- **The Lua does not run in the converted panel.** What a control's Lua sends is learned at import
  ([Lua: learning what it sends](#lua-learning-what-it-sends)); everything else it does is kept in
  the panel's notes as text.
- **Not pixel-exact.** Fonts, JUCE's look and feel and anything painted from Lua differ, and the
  reconstruction's notes say so.
- **Checked against a port of Ctrlr, not a synth**, as above.
- **Nothing is bundled and nothing is fetched** by the editor or the importer. `ctrlr-corpus.mjs` is a
  developer's tool, run by hand, into a directory outside the checkout.

## Lua: learning what it sends

The plan above says to quarantine the Lua, and the first corpus run made that the largest gap left:
on many of the best panels a control has no MIDI of its own, and its `luaModulatorValueChange`
method builds the message and sends it. Translating that code is the thing this record warns
against. But what the importer needs from it is not the code — it is the **bytes**, for each value
the control can take. So each such control is run, and what it sends is recorded.

### The stand-in

`ctrlrImport/ctrlrLua.js` is a stand-in for the Ctrlr a panel's Lua expects, written from CtrlrX's
own bindings (`Source/Lua/CtrlrLuaManager.cpp`, `Source/MIDI/CtrlrMidiMessage.cpp`,
`Source/Lua/JuceClasses/LMemory.cpp`, `Source/Lua/CtrlrLuaUtils.cpp`): the panel and its
modulators and components, `CtrlrMidiMessage`, `MemoryBlock`, `BigInteger`, the timer, `utils`,
JUCE's `File` (where no file exists). What a file leaves out, Ctrlr's constructors had set, and a
panel's Lua reads those defaults as if they were in the file; `ctrlrDefaults.js` holds them,
extracted from CtrlrX's constructors.

It runs in CEditor's own Lua — 5.4, where Ctrlr runs LuaJIT (5.1). The differences panels trip on
are bridged in a prelude: `unpack`, `loadstring`, `module`, the `bit` library with LuaJIT's signed
32-bit results, and a number with a fraction truncated where 5.4 refuses one (`string.format("%02x",
value / 128)` is everywhere). A string escape 5.1 let through and 5.4 refuses (`"\I"`) is rewritten
before the method is compiled.

**It is a sandbox.** A panel's Lua is somebody else's code. It runs in WebAssembly (wasmoon), and
inside that it gets no files, no processes and nothing loaded from disk: `io` and `os` (but its
clocks) fail as a missing file fails, `require` finds only the standard libraries, `load` takes
source text only, never a precompiled chunk, and every call is cut off after a fixed number of
instructions.

### What a control has to do to be learned

Each control is run through every value it can take (up to 4,096 of them; a wider range is sampled
and must then follow a straight rule), from the state the panel loads in: what one control's run
changed — a mute switch, the active edit buffer — is put back before the next. The recorder notes
everything the run touched, and the control is **not** learned if its Lua

- stopped with an error, or used something the stand-in does not reproduce;
- moved another control that sends MIDI of its own (Ctrlr would send that too);
- sent for some values and not others, or messages of different shapes for different values.

What it read is weighed, not refused. After every control has been learned, every other control
and every panel variable is moved, and each control is run again at a few values: if what it sends
did not change, it does not depend on what it read. If it did change, the control is learned **as
the panel loads** — what it sends with those controls as they load — and the note names them.

The channel is found the same way: the control is run again with the panel on another channel, and
the bytes that moved are the channel's.

### From bytes to a parameter

What was sent is written down the way a Ctrlr panel writes down its own MIDI: a CC, a Multi list
(four CCs that are an NRPN become an NRPN), or a SysEx formula in Ctrlr's codes — the value's bytes
(`xx`, `MS LS`, nibbles), the channel (`yy`, `1y`), a checksum found by trying each kind over the
bytes before it. That goes through the same `buildParameter` (harvest.js) as every modulator's own
MIDI, so it gets the same encodings, transforms and tables. And then the standard: the device-profile
engine compiles the parameter for **every value that was run**, and it must send exactly the bytes
the Lua sent. One differing byte and the control is not learned.

### What the collection showed

Over the collection (`ctrlr-import.mjs --corpus --verify`), 18,971 controls are sent by their Lua:

| Controls | |
|---:|---|
| **7,269** | became parameters (38%), each sending exactly what its Lua sent for every value run |
| 1,423 | of those depend on nothing but their own value — or read other controls and sent the same bytes when every one of those was moved |
| 5,846 | of those were learned as the panel loads: what they send changed when other controls moved |
| 5,146 | send nothing when moved: page switches, displays, buttons that open a dialog |
| 6,556 | not learned, each named in the panel's notes with the reason |

The reasons, most common first: the Lua stopped with an error (3,643 — in the state the panel loads
in, often code that only works with another page or mode selected, which Ctrlr meets the same way,
and calls the stand-in does not have); several messages with SysEx among them per move (782 — a
D-20 sends its display text and the parameter); a SysEx without its F7 (430); no values to run
(411); the value split around other bytes (256); moving controls that send MIDI of their own (about
330); different shapes for different values (174); a channel written some other way (105). The
importer's own MIDI side is unchanged: 29,432 parameters, 2,502,717 values, none different from
Ctrlr.

### Real Ctrlr as the judge

The learned parameters are held to what the panel's Lua sent in the stand-in. Whether the stand-in
sends what **Ctrlr** sends is a separate question, and Ctrlr's maintainer has built the instrument
that answers it: CtrlrX's test suite runs the real Ctrlr engine headless — it loads a panel, moves a
parameter, runs the Lua and captures every MIDI message on a mock device. It builds here (Ubuntu
packages, LuaJIT, its own JUCE), and a recording harness added to a local copy of it (not in this
repository) moves each Lua-driven control through its values and writes down what Ctrlr sent. On the
test panel it shows the cascade the stand-in refuses to learn, as Ctrlr does it: moving Filter
Cutoff to 16 sends its own `B2 4A 10`, and its Lua's move of Pan sends Pan's `B2 0A 50`; Pan already
at the value it is moved to sends nothing.

It has **not** been run over the collection. That would execute 455 third-party panels' Lua natively,
in LuaJIT with the machine's files and processes open to it — the opposite of the sandbox above — and
it waits for a sandbox of its own and the owner's go-ahead.

### Still not done

The Lua does not run in the converted panel. What it does besides sending a control's value —
moving other controls, librarians, dialogs, drawing — needs the stand-in to run live against
CEditor's script API (`ce.*`), with Ctrlr's hooks on CEditor's events. The stand-in is written so it
can: the same Lua, the same objects, a different recorder.

## In the File menu

**File → New Panel from Ctrlr Panel...** (`stores/ctrlrImportActions.js`) runs S1–S4 on a file the
author chooses, in the editor — a panel or a program Ctrlr exported:

- S1's report goes to the Console, line for line as the CLI prints it.
- S2's profile is saved into the engine as a **new** profile, which gets a file of its own in the
  user's profiles folder on its first save (DeviceProfileService). A re-import takes the next free id
  (`ctrlr.ts-1`, `ctrlr.ts-1-2`…) instead of writing over a profile the author may have edited since.
- S3's panel opens in a tab, unsaved, every binding naming a parameter that profile has.
- S4: each control whose MIDI the Lua sends is run through its values in the sandboxed stand-in,
  and becomes a parameter where what it sent allows ([Lua: learning what it sends](#lua-learning-what-it-sends)).
  Each Lua method's text also goes into the panel's notes (**Ctrlr Lua**), with its classification
  and the hooks that call it, and everything flagged, not learned, left out or left unbound into a
  **Ctrlr import** note. The notes travel with the panel, so what did not convert is still written
  down when somebody opens it next month.
