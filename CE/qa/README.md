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

Planned, not yet built: QA-03 states/interaction, QA-04 scripting (7 languages × 36 events),
QA-05 component verbs (23 families / 425 verbs), QA-06 device & MIDI, QA-07 custom-component
packages, QA-08 export.

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

## A finding the suite produced immediately

`QA-01-components.cepanel` is **2.7 MB for 107 controls** — roughly 25 KB of JSON per control, which
is what a full section tree costs. Undo currently keeps 50 whole-panel snapshots, so a panel this
size implies well over 100 MB of undo history.

That is not a flaw in the sheet. It is the first thing the sheet is for: if the editor is
uncomfortable holding a panel with one of each component on it, that is a beta-blocking fact about
the editor, and it was invisible until something built that panel.
