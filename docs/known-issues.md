# Known issues

Things that were found, are not fixed, and should not be forgotten. This file exists so that
retiring a review document does not also retire the two or three findings in it that nobody closed.

The rule for putting something here: it was **observed**, it is **not fixed**, and no other place in
the tree already records it. A finding whose fix is verifiable in code does not belong here — it
belongs in the commit that closed it and the test that keeps it closed. A feature somebody wants is
not a known issue; that is the roadmap.

---

## Standing debts from the 2026-07-02 project review

That review's order-of-attack table is done and the document is retired. These are the items it
raised that were deliberately *not* actioned — kept because "we decided not to" is worth recording,
and because each one will look like an oversight to the next person who finds it.

- **Two files are still large enough to be their own problem.**
  `sections/CustomDesignSurfaceEditor.svelte` (~8,300 lines) and `sections/TextEditor.svelte`
  (~2,450). Both were split once — the surface editor gave up two geometry/helper modules plus
  `CustomArpeggiatorEditor` and `CustomStateFilmstrip`, and `editor/CanvasControl.svelte` went
  5,718 → ~4,550 behind three pure-JS modules — and the two above have since grown back toward
  where they started. The review's own note stands: the layer dock and palette are too entangled
  with the surface editor to extract safely, which is why that part was skipped the first time and
  why a second pass is not a free afternoon.
- **`kitEntries` in the surface editor rebuilds a Map over all parts and hit zones** on relevant
  updates, with several `$derived` filters downstream. Fine at present sizes. Profile before
  touching it; it matters only if components with hundreds of parts show up.
- **No `CONTRIBUTING` or `SECURITY`.** `LICENSE` — the one the review called out as mattering most,
  because without it nobody can legally use or contribute — is AGPLv3, decided deliberately and
  recorded in [license-decision.md](license-decision.md). The other two are unwritten.
- **No `.prettierrc`, and no Prettier.** `.clang-format` and `.editorconfig` exist. Prettier is not
  a dependency of this project and nothing runs it, so a config file would configure a tool that is
  not there. If Prettier is ever adopted it needs one; until then this is closed by absence, not by
  work.

---

## Standing decisions from the custom-component designer reviews

The 2026-07-12 workspace review and the 2026-08-14 properties-panel review are both closed and
retired. These are the things they raised that were deliberately **not** done, kept because each one
will look like an oversight to whoever finds it next.

### The canvas viewport is not extracted, and the number is why

`sections/CustomDesignSurfaceEditor.svelte` went from 8,325 lines to ~5,500 across eight
components. The one region left whole is the canvas viewport, and it was measured rather than
guessed: it needs **116 props**, and **68 pieces of parent state that its own handlers mutate** —
the interaction record, the active frame, the draw draft, the smart guides, the arpeggiator editing
state. Extracting it means 68 bindable props or 68 setters on top of the 116, or moving the
handlers with it — and the handlers are called from the keyboard shortcuts and the dock as well as
from the canvas. That is not a smaller file; it is the same coupling with a boundary drawn through
the middle of it. `test/surfaceDecomposition.test.js` ratchets the parent's line count so the rest
cannot grow back into it.

### Hit-zone rotation is not a UI job

Hit zones have no rotation field in the model. Adding one needs the field, the renderer and the
runtime hit test together — a zone that draws rotated while testing unrotated is worse than one
that does neither. Filed under Tier 2 in the review, but it belongs with the capability work below.

### Tier 3 stays Tier 3

Containers, image fill on shapes, colour tokens and constraints/anchors are capability features
spanning the model, the renderer, the runtime and the exporter, which is what the review's own
heading for them says. Two findings for whoever picks them up:

- **Shared swatches already exist** — `stores/palettes.js` is a persisted named palette library,
  reachable from the DisplayPanel. What is missing from "colour tokens" is the *reference*: a part
  storing a token name instead of a literal AARRGGBB, and something resolving it at render and
  export time.
- **Image fill is renderer work, not a model change.** `SECTION_DEFAULTS.Background.Fill` already
  declares `imageEnabled` and `imageSrc`; `editor/InteractivePartRenderer.svelte` never reads them.
  (The `Image` section it *does* read is the filmstrip, a different feature.)

### The Look bar triplication is a design decision, not a defect

Fill, gradient, stroke and corner live in three places: the Look bar, the palette's groups, and the
dock's Display tab. The review's advice was to "pick one quick home (the Look bar) and strip the
others to swatch-status only". That is a judgement about how the editor should feel, with no
obviously right answer, so it is left for whoever makes it rather than settled by whoever happened
to be closing the review.

### Not done from the properties-panel round

The bulk conversion of ~200 `<select>` and text inputs onto `PropertySelect`/`PropertyText`. The
widgets exist and new code uses them, but every `.val` in the panel already takes its metrics from
the shared tokens and carries `box-sizing: border-box` and `min-width: 0` — so the overflow bug and
the select-widens-its-own-track bug, the two things the widgets were needed for, are fixed where
they live. Conversion would buy less CSS and cost ~200 hand-edits that each change binding
semantics and each need an `<option>` list lifted into an expression, with no DOM-level test in the
suite to catch a slip.

---

## Eight component types are undecided for host automation

*(Was "twenty-seven cannot be automated". All fifty are now ruled; this is what is left.)*

`deriveExportParameters` reads a control's `Behavior`, its `ValueChannels`, or its type's own
`exportValues` declaration. As of 2026-08-23 every one of the fifty types says something:
**17 export parameters, 25 decline with a stated reason, 8 are deferred.** Nothing is silent any
more, and `qaPanels.test.js` fails if a new type reintroduces silence.

**The eight deferred, and why each is a question rather than an oversight.** Each has real
candidates and no obvious single answer, and an exported parameter is permanent once a saved session
references it — which is the whole reason these were not just decided in passing.

| Type | The candidates, and the snag |
|---|---|
| `Arp` | `rate`, `gate`, `swing`, `octaves` — four genuine ones |
| `Turing` | `rate`, `randomness`, `gateThreshold`, `length` are all knobs; `phase` is generated output and must **not** become one |
| `Orbit` | `rate` is obvious, but `nodes` carries per-node values, so "one parameter" may be the wrong shape |
| `Kinetic` | `gravity`, `restitution`, `friction` — picking one would be arbitrary |
| `Looper` | `loopSeconds`/`loopBars` are settings, `phase` is output; there may be no automatable value here at all |
| `Phrase` | `transpose`, `swing`, `gate`; `steps` is a pattern, with the Matrix's variable-cardinality problem |
| `Transport` | `bpm` and `swing` in principle — but a Transport that FOLLOWS the host already takes tempo from it, so a host parameter would fight its own source |
| `Setlist` | `index` is the obvious one and the trap: its range is the number of songs, which is per-panel, and the exported list must be FIXED |

The live version of this table is **QA-08**'s "Not decided yet" group, computed from the model.
Deciding one means giving the type an `exportValues` entry and removing it from `DEFERRED_TYPES` in
`tools/scripts/qa/sheets/export.mjs`; the test fails until both happen, in either direction.

**What was decided, for the record.** Structural types (`Background`, `Container`, `Group`, `Image`,
`Label`, `TestBox`) hold no value. Displays (`LcdDisplay`, `PixelDisplay`, `Meter`) are outputs — a
host parameter would let a DAW write what the component is meant to be reporting. Note emitters
(`ChordPad`, `NoteRibbon`, `DrumPads`, `Harmoniser`) send notes and hold no scalar to sweep.
`Router`, `SplitZone`, `Constraint` and `Recorder` are configuration or state machines. `Matrix` and
`Envelope` have variable cardinality against a fixed export list. `Timbre` and `Constellation` got
two parameters each — an XY space, the same ruling `VectorJoystick` got.

Why none of them got a `Behavior` section, which was the obvious route: `PropertiesPanel.svelte:223`
mounts a Behavior tab off the section's mere presence, so a crossfader would have grown a tab full
of `fireOn` and `buttonType`. The type declares what it exports instead, beside its own section.

## Two things the DPD Parameters screen wants and does not have

Both shipped for a while as disabled "Coming soon" buttons in the Parameters toolbar. They were
removed before the beta rather than left there: a permanently greyed button is a promise nobody is
keeping, and in a toolbar with one working action it was two-thirds clutter. Recorded here so the
intent is not lost with the buttons.

**Import CSV.** Every editor ever written starts with a human copying a MIDI implementation chart
out of a manual, and a chart is a table. Pasting or importing one and mapping its columns onto
`{ id, name, valueType, address, range, encoding }` is the single biggest saving available on the
authoring side, and `beta-differentiation.md` argues at length that profile acquisition — not any
component — is the category's real bottleneck.

**MIDI learn, for a parameter's address.** Wiggle a control on the synth and let the arriving
message fill in the address, rather than transcribing `F0 41 10 ...` by hand.

Worth being precise about what this is *not*, because the app already has something called MIDI
learn and it is a different thing. `MidiLearnChips.svelte` is a drag source in the MIDI Monitor: it
turns an inbound message into a chip you drop onto a control on a panel to *bind* it. That answers
"which control should this CC drive". The DPD needs the other direction — "what address does this
parameter live at" — which writes a profile definition, not a binding. Wiring the button to the
existing chips would have looked like progress and connected two unrelated subsystems.


---

## ~~Panel packaging exists but is not in the UI~~ — CLOSED

*(Was "no panel package format", then "the format is built, the button is not". Both halves now
exist: File → Share Panel... and File → Open Shared Panel....)*

A bare `.cepanel` holds ABSOLUTE PATHS to its images, so sending one to somebody else sends a panel
with no pictures. It looks perfect on the author's disk, which is exactly why it survived: the
failure only exists on the second computer, and the author is the one person who never sees it.

Three layers, kept apart on purpose:

| | | |
| --- | --- | --- |
| `utils/panelPackage.js` | the format | no filesystem, no bridge — testable anywhere |
| `stores/panelSharing.js` | the assets | supplies `readAsset`/`writeAsset` out of `fileCache` |
| `stores/panelSharingActions.js` | the commands | dialogs, file IO, landing the result in a tab |

A `ceditor-panel` envelope embeds every asset, content-addressed so one image used forty times is
stored once, deliberately the same envelope shape as the custom-component package so version
refusal and a reader's expectations are already established.

**The editor half needed almost no new code**, which is worth recording because the estimate was
much larger. Reading is `fileCache`, which already exists to show local images in the WebView: it
asks the bridge for a path and hands back a data URL, exactly the bytes the packager wants. Writing
turned out not to be needed at all — `CanvasControl.svelte:1789` accepts a `data:` URL wherever it
accepts a path, so an opened package puts the embedded bytes straight back into `imageSrc` and
`bgImage`. No temp files, no cleanup, and an opened panel is self-contained rather than pointing at
a folder the next person also needs. The only native support the format required is two file
dialogs (`savePanelPackageAs`, `openPanelPackage`).

Three places a panel points outside itself, listed because a fourth would be a package that works
until it doesn't: `panel.bgImage`, each control's `Background.Fill.imageSrc`, and `Text.path`. They
live in one collector for that reason.

Two things are stripped on the way out, and both are the kind of leak nobody notices until it is
in somebody else's hands: `filePath`, which is the author's name and folder layout, and
`deviceSession`, which names MIDI hardware the recipient does not have.

**Not yet driven on Windows.** Thirty-two tests cover the format, the asset binding and the
commands, but no package has been through a real FileChooser. Sharing is the one feature in this
build whose end-to-end path has only been exercised in Node.
