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

**1. A knob cost 100 KB to write down, and 93 KB of it was nothing.** *(fixed — see below)*

Every Slider and Knob is created with seventeen fully-materialized semantic parts, each carrying a
complete `Background` (a `Fill` with sixty-odd fields, a `Border` with a per-side object) and a
`Text` at defaults. Nothing elided defaults on save, so a knob nobody had styled still wrote 93 KB.

It was pure redundancy: `SliderFamilyRenderer` has always resolved parts through
`resolveSliderSemanticParts()`, which rebuilds every default part whether the document carried it
or not. Documents now store only the parts that differ, and `deserializePanel` restores the rest on
load — that second half is not optional, because only the *renderer* resolves. The Slider,
Slider-label, Animations and Behavior editors and `interactionRuntime`'s hit-testing all read
`getSection(control, 'Parts')` directly, so eliding without rehydrating would have produced a knob
that draws perfectly and has an empty Parts inspector.

| | before | after |
|---|---|---|
| One knob (marginal) | ~100 KB | **~12 KB** |
| `QA-01` (107 controls) | 2.7 MB | **2.3 MB** |
| `QA-02` (33 controls) | 1.3 MB | **0.68 MB** |
| `QA-06` (343 controls) | **28.2 MB** | **6.7 MB** |

Existing panels need no conversion: they load, and shrink the next time they are saved (a 213 KB
one-knob fixture re-saves to 26 KB with the author's edit intact). `sliderPartsElision.test.js`
holds all of it, including the byte figures — a default that quietly re-materialized parts on save
would otherwise put the 93 KB back with no other symptom.

**2. Panel documents are still heavy, and the rest is the section tree.** QA-06 is 6.7 MB, not
0.7 MB. What is left in a knob is `States`, `Behavior`, `Animations` and the remaining sections, all
written at their defaults — the same class of problem one level up, and not this change's to fix.
With 50 whole-panel undo snapshots, editing QA-06 still implies a few hundred MB of history.
General default-elision across all sections is the follow-on, and it needs the same
elide-plus-rehydrate discipline to be safe.

Neither of these is a flaw in the sheets. They are the first thing the sheets are for: a document
format where a plain knob cost 100 KB was a beta-blocking fact, and it was invisible until
something built the panel that showed it.
