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

## Thirty-five component types cannot be automated from a host

Found while building QA-08. `deriveExportParameters` reads a control's `Behavior` section to decide
what parameter it contributes to the exported plugin. Thirty-five of the fifty component types have
no `Behavior` section at all, so the deriver never looks at them and they export nothing.

For most of the thirty-five that is right — a `Container` is not a parameter. For these it is at
best a question, because they are things a user would expect to reach from a DAW:

`Crossfader` · `Ribbon` · `VectorJoystick` · `Meter` · `Macro` · `Envelope` · `Matrix` · `Numpad`

`Numpad` is the sharpest case: it carries a `Value` section, so it stores a value, and still
exports nothing.

Not fixed here, because the fix is not a bug fix. Giving one of these a `Behavior` is deciding what
its automatable value *is* — a joystick has two, a matrix has a grid of them, a meter is arguably an
output and not a parameter at all — and each answer changes the exported plugin's interface. That
is a design call.

The live record is **QA-08**, whose third group is this list, computed from the model rather than
copied here: open `CE/qa/QA-08-export.cepanel` and it will be current even if this paragraph is not.
What makes it worth writing down at all is that nothing else shows it. The editor automates all of
these perfectly; the gap only appears in a host, after export, on somebody else's machine.
