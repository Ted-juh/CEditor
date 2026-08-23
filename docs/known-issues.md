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

## Twenty-seven component types cannot be automated from a host

`deriveExportParameters` reads a control's `Behavior` to decide what host parameter it contributes.
Twenty-seven of the fifty component types have no `Behavior`, no `ValueChannels` and no
`exportValues`, so nothing about them says anything and the deriver never looks. For a `Container`
or a `Label` that is obviously right, which is most of what remains.

**The eight that were the actual question are closed.** They were the ones a user would plainly
expect to reach from a DAW, and each is now ruled rather than overlooked:

| Type | Ruling |
|---|---|
| `Numpad` | one float, over its own declared `min`/`max` |
| `Crossfader` | one float, `mix`, stored 0–1 |
| `Ribbon` | one float, `value`, stored 0–1 |
| `Macro` | one float, the macro's own position; `slots` is routing, not an automation target |
| `VectorJoystick` | **two** floats, `.x` and `.y` — every host models an XY pad as two lanes, and flattening would lose the axis a user was drawing |
| `Meter` | **none.** It displays a level arriving from elsewhere (`valueSourceId`). A host parameter would let a DAW write a reading the component is supposed to be reporting |
| `Matrix` | **none.** A parameter per cell is rows × cols and both are per-panel, but the exported list must be FIXED — a panel whose parameter count changes when someone adds a row breaks every saved session. And a modulation matrix is routing, not performance |
| `Envelope` | **none.** Same variable-cardinality problem as the matrix, and the thing that does move continuously, `phase`, is an output driven by `phaseSourceId` |

The three that export nothing say so with `exportValues: []` rather than staying silent. That
distinction is the point: QA-08 files a declared "no" under *ruled* and an absent one under *nothing
in the type says anything*, so a future oversight cannot hide among the deliberate ones.

Why the ruling did not take the obvious route: giving those five a `Behavior` section would have
worked for the exporter and broken the editor. `PropertiesPanel.svelte:223` mounts a Behavior tab
off the section's mere presence, so a crossfader would have grown a tab full of button fields —
`fireOn`, `repeatEnabled`, `buttonType`. The type declares what it exports instead, beside its own
section, and no UI changes.

**What is left is the remaining twenty-seven**, and it is a smaller question than it looks: go down
QA-08's third group and either rule a type out with `exportValues: []` or give it a declaration.
Open `CE/qa/QA-08-export.cepanel` for the current list — it is computed from the model, so it will
be right even when this paragraph is not.


---

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
