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
| `QA-06-roland-gaia.cepanel` *(generated on demand)* | A real hardware editor: **162 controls bound to the Roland GAIA SH-01 profile**, all three tone layers on screen at once, every control adopting its range and choices from the profile. | Without a synth attached it proves the bytes we would send, not that the synth liked them. |

Planned, not yet built: QA-03 states/interaction, QA-04 scripting (7 languages × 36 events),
QA-05 component verbs (23 families / 425 verbs), QA-07 custom-component packages, QA-08 export.

### QA-06 is not committed

It is **28 MB**, and it is gitignored for that reason — run `npm run qa:panels` (or the generator
directly) and it appears in this folder. Everything else about it is still checked on every
`npm test`: the sheet is rebuilt in memory, every control is rendered, and its bindings are
asserted against the profile.

Why all three tones are visible: on the hardware you press TONE SELECT and one set of knobs points
at a different layer. That is a limit of having one set of knobs, not of the synth — Tone 1/2/3 are
three address blocks at a 0x0100 stride, so a screen can show all three. There is no keyboard on
the sheet: it edits a patch, and the synth has its own keys.

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

**1. Panel documents do not scale.** `QA-01` is 2.7 MB for 107 controls. `QA-06` — a *small*
hardware editor, 162 bound controls — is **28 MB**. Undo keeps 50 whole-panel snapshots, so
editing that panel implies over a gigabyte of undo history.

**2. The cost is concentrated, and it is the Parts tree.** Per-control document size:

| Component | Size | Of which `Parts` |
|---|---|---|
| Knob | 100 KB | 93 KB (17 parts) |
| Slider | 100 KB | 93 KB |
| ToggleButton / Combobox | ~16 KB | — |
| Label | ~12 KB | — |

Every one of a knob's 17 parts carries a full `Background`/`Text`/`Effects` section at its
defaults. Nothing elides defaults on serialization, so a knob that has never been touched still
writes 93 KB. Sixty knobs — an ordinary synth panel — is 6 MB before anything is styled.

Neither of these is a flaw in the sheets. They are the first thing the sheets are for: an editor
that is uncomfortable holding one of each component, or a document format where a plain knob costs
100 KB, are beta-blocking facts, and both were invisible until something built the panel that
showed them.
