# QA panel suite

Generated `.cepanel` sheets that put the program's own surface on screen, so a beta pass is
"open eight files and look" rather than a checklist nobody finishes.

**Do not hand-edit these files.** They are generated from the model, and edits are lost on the next
regeneration. Change the generator instead:

```bash
node tools/scripts/qa/make-qa-panels.mjs           # regenerate
node tools/scripts/qa/make-qa-panels.mjs --check   # fail if the committed copies are stale
```

`npm test` (in `CE/web`) runs `qaPanels.test.js`, which regenerates every sheet in memory,
server-renders every control on it, and fails if the committed copy differs.

## The sheets

Eight sheets, numbered in the order a pass runs them: what renders, what renders under pressure,
what happens when you touch it, what a script can do to it, what the component API can do to it, a
whole real device, the components a user builds themselves, and what leaves the building.

| File | What it proves | What it cannot prove |
|---|---|---|
| `QA-01-components.cepanel` | Every one of the 50 component types renders at its **authored default** — the state a user meets first, and the one nothing else checks. | Nothing is interactive, bound, or scripted here. |
| `QA-02-properties.cepanel` | The cross-cutting sections survive being **driven hard**: nine stacked text-effect layers, four live background fill layers, rotation + scale + opacity at once. | Component-specific sections (Arp, Matrix, …) sit at defaults — those are their own sheet's job. |
| `QA-03-states.cepanel` | The **15 stateful types × 7 states** — hover, focused, checked, mixed, dragging, pressed, disabled — each with its own state patch already applied, so a state that paints wrong is side by side with the six that do not. | The states are baked in, not entered. That a control *reaches* `pressed` on a real press is a mouse. |
| `QA-04-scripting.cepanel` | Every **script language × every panel-API event**: 7 × 37 = 259 handlers, carried on the panel as scripts the editor will actually list and the player will actually load. | The handlers are stubs. That an event *fires* is `nativeHandlers/make-selftest-panel.mjs` and a running player. |
| `QA-05-verbs.cepanel` | The **23 verb families and all 426 verbs**, each beside the component it drives — the only place the scripting API and the thing it addresses are on screen together. | Verbs are listed, not called. Correctness of the reducers is `componentVerbs.test.js`. |
| `QA-06-roland-gaia.cepanel` | A real hardware editor: **every parameter of the Roland GAIA SH-01 profile bound to a control**, all three tone layers on screen at once, each control adopting its range and choices from the profile. | Without a synth attached it proves the bytes we would send, not that the synth liked them. |
| `QA-07-packages.cepanel` | All **14 custom-component starters**, built through the designer's own patch, instantiated by the real package path, each printing its readiness verdict. This is the sheet QA-02's eleven authoring exemptions defer to. | Wiring is validated, not exercised. A hit zone pointing at the right behavior and never firing looks identical here. |
| `QA-08-export.cepanel` | **The parameter list the exported plugin will have.** Which of the 50 types export anything and which do not and why, plus 14 recipes for the derivation branches a default panel never reaches — named choices, device wires, raw CC and NRPN, the inbound-only messages that must get no wire. | That the host and the panel agree. The C++ processor builds its APVTS from the same document, and the two have drifted before. |

### About QA-06

Why all three tones are visible: on the hardware you press TONE SELECT and one set of knobs points
at a different layer. That is a limit of having one set of knobs, not of the synth — Tone 1/2/3 are
three address blocks at a 0x0100 stride, so a screen can show all three. There is no keyboard on
the sheet: it edits a patch, and the synth has its own keys.

It was gitignored for a while at 28 MB. Eliding defaults took it to 392 KB and the reason to keep
it out went with them; it has since grown back to 2.2 MB as the profile gained the rest of the
synth's parameters, which is a fifth of what one tone layer used to cost.

The profile behind it is generated and cross-checked against Roland's published MIDI implementation
— see [tools/scripts/qa/roland-gaia/README.md](../../tools/scripts/qa/roland-gaia/README.md).

## How to run a pass

1. Open a sheet — **File → Open** → `CE/qa/QA-01-components.cepanel`.
2. Scan it. Each control sits under a caption naming what it is. A blank cell, a control collapsed
   to caption height, or a cell overlapping its neighbour is a finding.
3. Open the panel's **Notepad** — each sheet carries its own "how to read this / what a failure
   looks like" note, so the sheet explains itself without this file.
4. Work up the numbers. QA-02 is every cell a deliberate worst case: if the worst case renders, the
   ordinary case does. QA-03 onward each need something more than looking, and each note says what.

Two of them are worth a word here, because what they ask of a reader is unusual:

- **QA-05** wants the Console open. The verb cards are the script you type while watching the
  component beside them; a verb that returns cleanly and moves nothing is the finding, and the
  reducer tests already prove the return value.
- **QA-08** wants a judgement rather than a check. Its third group lists the component types the
  export deriver never looks at — no `Behavior` section, so no parameter. Several of them are
  things a user would plainly expect to automate from a DAW. Read that list and decide; the failure
  it describes is silent everywhere else, and only shows up in a host, weeks later.

## The coverage ratchet

The reason this suite does not go stale: `CE/web/test/qaPanels.test.js` asserts that

- every type in `COMPONENT_TYPES` appears on QA-01, exactly once, filed under a titled group;
- every section in `SECTION_DEFAULTS` is either driven by a QA-02 recipe **or** named in that
  sheet's `EXEMPT` map with a written reason;
- every type carrying a `States` section appears on QA-03 in every state the model resolves;
- every script language × every panel-API event has a handler on QA-04;
- every verb family on QA-05 resolves to a component that carries its section — an **orphaned
  family**, whose verbs would address nothing, fails here rather than rendering as a red card
  nobody reads;
- every starter in `CUSTOM_COMPONENT_STARTERS` appears on QA-07 **and still validates as a
  package** — a starter a user could pick and then not publish is a dead end in the designer, and
  nothing else in the suite would notice; and
- every component type carries an export verdict on QA-08, with a stated reason when it exports
  nothing, and every one of that sheet's derivation recipes still exercises the branch it claims.

Each list is read from the model, not from a copy of it, so none of them can be satisfied by
editing the test. Add a component, a section, a state, an event, a verb family or a starter without
the sheet following, and the test fails, naming the file to edit. That is deliberate, and it is the
same shape as `componentCoverage.test.js`: a gap has no symptom, so the gap itself has to be the
thing that fails.

### The gap the render gate does not cover

`qaPanels.test.js` asks whether a control produced output. Three rendering bugs shipped in a row
while every test was green, because all three produced plenty of perfectly valid output that simply
looked wrong: a linked border painting its corner arcs white at double width, every border throwing
away its alpha so a 40% hairline came out opaque, and every `Label` being born inside a 2px white
rectangle. Two were spotted by a human looking at a screenshot.

`visualGolden.test.js` closes that. Each specimen is server-rendered and reduced to what decides
its appearance — stroke colours and widths, fills, shape primitives — and compared against a
committed baseline in `CE/web/test/golden/`. Reintroducing the alpha bug fails four specimens
immediately. Update a baseline with `UPDATE_GOLDEN=1 npm test`, and read the diff in the commit; a
baseline regenerated without looking at it is worse than none.

What it still does not cover: a purely visual regression that changes no attribute — a part drawn
in the wrong z-order, a layout that overlaps. Pixel diffing would catch those, and it needs a
browser and a running dev server and drifts on font hinting between machines. The QA sheets and an
eye are still the backstop.

The same test server-renders every control through `CanvasControl`. One type is exempt and says so
in `NO_SSR`: `PixelDisplay` touches `window` during render, so it has no server pass. That is worth
knowing rather than working around — it is the one component this gate cannot see.

## Findings the suite produced immediately

**Panel documents were being written in full, and almost all of it was defaults.** *(fixed)*

`createControl()` materializes every section a component type declares, at its defaults. That is
the right in-memory model — everything that reads a control reads deep paths off it. It was also
what got written to disk, so an untouched Knob cost 100 KB (93 KB of it the seventeen slider parts,
each carrying a complete `Background` and `Text`), and a 162-control synth editor came to 28 MB.
Autosave paid it again; the undo stack, which keeps 50 whole-panel snapshots, paid it fifty times.

Documents now store each control as a **diff against the pristine control of its type**, and
`deserializePanel` applies the diff back. Nothing else in the editor changes: the model it holds is
the full control, exactly as before.

| | before | after |
|---|---|---|
| One knob (marginal) | ~100 KB | **~520 B** |
| One button (marginal) | ~16 KB | **~195 B** |
| `QA-01` (107 controls) | 2.7 MB | **88 KB** |
| `QA-02` (33 controls) | 1.3 MB | **36 KB** |
| `QA-06` (343 controls) | **28.2 MB** | **392 KB** |

Those are the measurements taken when the change was made, kept as a record of it. The sheets have
grown since — QA-06 is 1,626 controls and 2.2 MB now, having gained the rest of the GAIA's
parameters — and the ratio is what the table is for.

Three things this had to get right, all of them in `documentShape.test.js`:

- **It is lossless.** `expandControl(shrinkControl(c))` deep-equals `c`, asserted for all 50
  component types and for every kind of edit — deep single fields, shortened arrays, falsy values,
  three-deep nesting. The file being smaller is a free consequence of that; without it the size
  would not matter, because the panel would be wrong.
- **A missing key means two things.** "Unchanged, take the default" and "the author deleted it".
  A diff that cannot tell them apart resurrects deleted states and layers on the next load, on a
  panel that had been working. Removals are recorded explicitly in a `_removed` list.
- **The exported plugin never runs any of this.** `Player/PanelValueModel.h` parses the `.cepanel`
  in C++ and reads `Core`, `Behavior` and `Scripts` straight off `controls[]`; a field elided out
  of the authoring document is simply absent to it. So the build payload opts out
  (`serializePanel(panel, { elide: false })`) and the split is explicit rather than something the
  exporter has to remember.

Existing panels need no conversion — they load, and shrink the next time they are saved.

`CustomComponent` is never elided: its instances come from a saved package rather than from
`createControl`, so there is no meaningful default to diff against.

This was not a flaw in the sheets. It is the first thing the sheets were for: a document format
where a plain knob cost 100 KB was a beta-blocking fact, and it was invisible until something built
the panel that showed it.
