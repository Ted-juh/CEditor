# Ctrlr import — design record

> Status: **built, 2026-08-23** — all four stages, in `tools/ctrlr-import/` behind
> `node tools/scripts/ctrlr-import.mjs`. **Never run on a real community panel:** nobody here has a
> `.panel` or a `.bpanelz`, so every open question below is answered by refusing-and-reporting
> rather than by a guess, and the first real file is what turns those refusals into knowledge. See
> [What was built](#what-was-built) at the end.
>
> Originally written to answer one objection, because the objection is the reason this has never
> been attempted: *"converting Ctrlr panels must be enormously hard — Ctrlr is JUCE C++ modules and
> CEditor is Svelte."*
>
> The short answer is that the difficulty is real but it is **not** where the objection puts it.
> Ranked in [`docs/beta-differentiation.md`](../../docs/beta-differentiation.md) as Tier 2 #4.

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
tools/ctrlr-import/xml.mjs          a small XML reader — no dependency, and a DOCTYPE is refused
tools/ctrlr-import/read.mjs         S1: decode, parse, report. Converts nothing.
tools/ctrlr-import/harvest.mjs      S2: modulators -> a .ceditor-device profile
tools/ctrlr-import/reconstruct.mjs  S3: components -> a placement plan
tools/scripts/ctrlr-import.mjs      the CLI, and S4's Lua triage report
```

```
node tools/scripts/ctrlr-import.mjs panel.bpanelz                       # S1 only: report
node tools/scripts/ctrlr-import.mjs panel.panel --profile out.json      # + S2
node tools/scripts/ctrlr-import.mjs panel.panel --profile p --panel q   # + S3, + the S4 report
node tools/scripts/ctrlr-import.mjs --corpus ./panels                   # every file, never stops
```

### What the open questions turned into

None of them could be answered from here, so none of them was guessed at. Each became a refusal
that reports itself, which is what makes the first real file informative rather than a debugging
session:

| Open question | What the code does instead |
|---|---|
| The exact `componentRectangle` format | Accepts space- or comma-separated, requires four positive numbers, and **skips the component with the string it could not read**. A control silently placed at 0,0 size 0 is invisible, and a panel full of those looks like the importer worked. |
| `.bpanelz` compression | Tries gzip, zlib, raw deflate and plain, **reports which worked**, and refuses anything that decodes to something that is not a panel. |
| The `uiSliderStyle` / `midiMessageType` vocabularies | Both are **histogrammed by S1**. Run the corpus and the vocabulary is a table rather than an assumption. |
| How widely `modulatorValueExpression` is used | Only the identity is accepted; anything else is **flagged with the expression in the message**, and the corpus run prints the conversion rate. That number is the answer. |
| `vstIndex` ordering for automation-slot compatibility | Carried through on each parameter as `ctrlr.vstIndex` and otherwise unused, so whoever needs it has it. |

### The one thing that had to be right, and nearly was not

A parameter naming a `messageRecipe` the profile does not define makes `loadFromJson` reject the
**whole** profile — silently, taking every other parameter with it. The first draft of the harvester
emitted `messageRecipe: "cc"` with the controller on the parameter, which is not the schema: every
harvest would have produced a file that looked right and loaded as nothing. It now emits one recipe
per distinct CC / NRPN / SysEx shape and a test asserts that every parameter names one that exists,
plus a round trip through the editor's own validator and compiler — a harvested `Filter Cutoff` on
CC 74 compiles to `B0 4A 64`.

### And the one the reconstruction had to get right

A control bound to a parameter the harvest **flagged** would look connected in the editor and send
nothing. `planReconstruction` takes the set of ids that actually exist and places anything else
unbound, with a note saying how many and why.

### Still true

- **No real panel has been through this.** The fixture is hand-built from Ctrlr's identifier table.
- **No pixel fidelity**, and the reconstruction says so in its own notes rather than leaving it to
  be discovered — including which components drew themselves with Lua (placed as plain boxes) and
  which are image-strip controls (which CEditor renders natively and could match near-exactly once
  resources are extracted).
- **No Lua runs.** Methods are classified shimmable / port / paint and reported; nothing is
  translated. The `ctrlr` compatibility shim stays unbuilt until a corpus histogram says it pays.
- **No resource extraction yet**, so filmstrips are recognised and named but not unpacked.
- **Nothing is bundled and nothing is fetched.** It converts a file the user already has.
