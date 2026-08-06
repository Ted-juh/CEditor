# QA panel suite

Generated `.cepanel` sheets that put the program's own surface on screen, so a beta pass is
"open four files and look" rather than a checklist nobody finishes.

**Do not hand-edit these files.** They are generated from the model, and edits are lost on the next
regeneration. Change the generator instead:

```bash
node tools/scripts/qa/make-qa-panels.mjs           # regenerate
node tools/scripts/qa/make-qa-panels.mjs --check   # fail if the committed copies are stale
```

`npm test` (in `CE/web`) runs `qaPanels.test.js`, which regenerates every sheet in memory,
server-renders every control on it, and fails if the committed copy differs.

## The sheets

| File | What it proves | What it cannot prove |
|---|---|---|
| `QA-01-components.cepanel` | Every one of the 49 component types renders at its **authored default** — the state a user meets first, and the one nothing else checks. | Nothing is interactive, bound, or scripted here. |
| `QA-02-properties.cepanel` | The cross-cutting sections survive being **driven hard**: nine stacked text-effect layers, four live background fill layers, rotation + scale + opacity at once. | Component-specific sections (Arp, Matrix, …) sit at defaults — those are their own sheet's job. |
| `QA-06-roland-gaia.cepanel` | A real hardware editor: **162 controls bound to the Roland GAIA SH-01 profile**, all three tone layers on screen at once, every control adopting its range and choices from the profile. | Without a synth attached it proves the bytes we would send, not that the synth liked them. |

Planned, not yet built: QA-03 states/interaction, QA-04 scripting (7 languages × 36 events),
QA-05 component verbs (23 families / 425 verbs), QA-07 custom-component packages, QA-08 export.

### About QA-06

Why all three tones are visible: on the hardware you press TONE SELECT and one set of knobs points
at a different layer. That is a limit of having one set of knobs, not of the synth — Tone 1/2/3 are
three address blocks at a 0x0100 stride, so a screen can show all three. There is no keyboard on
the sheet: it edits a patch, and the synth has its own keys.

It was gitignored for a while at 28 MB. It is 392 KB now, so it is checked in like the others.

The profile behind it is generated and cross-checked against Roland's published MIDI implementation
— see [tools/scripts/qa/roland-gaia/README.md](../../tools/scripts/qa/roland-gaia/README.md).

## How to run a pass

1. Open a sheet — **File → Open** → `CE/qa/QA-01-components.cepanel`.
2. Scan it. Each control sits under a caption naming what it is. A blank cell, a control collapsed
   to caption height, or a cell overlapping its neighbour is a finding.
3. Open the panel's **Notepad** — each sheet carries its own "how to read this / what a failure
   looks like" note, so the sheet explains itself without this file.
4. Repeat for QA-02, where every cell is a deliberate worst case. If the worst case renders, the
   ordinary case does.

## The coverage ratchet

The reason this suite does not go stale: `CE/web/test/qaPanels.test.js` asserts that

- every type in `COMPONENT_TYPES` appears on QA-01, exactly once, filed under a titled group; and
- every section in `SECTION_DEFAULTS` is either driven by a QA-02 recipe **or** named in that
  sheet's `EXEMPT` map with a written reason.

Add a component or a section without doing one of those and the test fails, naming the file to
edit. That is deliberate, and it is the same shape as `componentCoverage.test.js`: a gap has no
symptom, so the gap itself has to be the thing that fails.

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

Three things this had to get right, all of them in `documentShape.test.js`:

- **It is lossless.** `expandControl(shrinkControl(c))` deep-equals `c`, asserted for all 49
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
