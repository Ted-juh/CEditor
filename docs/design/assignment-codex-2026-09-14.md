# Assignment — bounded cases for the editor/properties half

Issued 14 September 2026 against the handoff's own allocation: Claude owns the release checklist,
the remaining music/routing contracts, integration and final decisions; Codex takes bounded
assignments, especially the shared-property cases and combined/native Windows acceptance.

Everything below is **bounded on purpose**. Nothing here asks for a new harness, a new framework or
a rerun of anything already proven. Where a case is already covered, say so and move on — the point
is to close the map, not to grow a total.

---

## Ground rules, restated because they are what makes this evidence

- A changed property, a successful mount and a passing unit test are **not** evidence. Check the
  visible result, the runtime behaviour, the outgoing data where there is any, and a reopen in a
  fresh runtime.
- Keep unsupported, unverified and verified apart. `Ledger` now carries five statuses: `verified`,
  `inert` (declared, no reader), `not a property` (catalogued by assumption, never declared),
  `closed elsewhere` (another suite holds the evidence — name it), and `unverified` (a real gap,
  with the real reason).
- **Do not dismiss a row because the current helper cannot observe it.** Six rows were carried that
  way and five of the reasons did not survive being checked. If a helper is in the way, change the
  helper.
- Run the timing-sensitive browser suites serially, and do not edit source while they run.

---

## 1. The property gaps — DONE, and not yours to repeat

**This section is closed. It was assigned to you and I did it, because the same pass kept finding
defects and it was faster to keep going than to hand over mid-block.** Read it for what it found,
not as work to start.

Nine suites: `behaviourMouse`, `behaviourTrack`, `behaviourButtons`, `behaviourScreens`,
`behaviourLayout`, `behaviourWidgets`, `behaviourLists`, `behaviourShared`, `behaviourAssets`.
The matrix went **241 → 66 of 1,046**, and most of the 66 is a row that already has an answer the
matrix cannot see — see `coverage-matrix-2026-09-14.md` for the breakdown.

**Four defects, D-16 to D-19, each with a regression that fails on revert**, all recorded in full in
`editor-behaviour-claude-2026-09-13.md`. All four are one shape — a setting that is published,
edited and saved, and that nothing downstream can act on — and two of them are the same mistake
twice: **a default that happens to agree with a hard-coded value hides the fact that the field is
not read at all.**

- **D-16** `Mouse.dragSensitivity` did nothing on a slider in relative drag mode.
- **D-17** pressing a relative-mode slider snapped it to its minimum, on every press.
- **D-18** the Focusable switch did nothing on any of the five types that offer it.
- **D-19** both Slider label Gap cells did nothing until the dropdown beside them was moved.

**What is left of this section for you is not testing — it is the rulings in section 4**, which
now runs to about twenty user-visible options with nothing behind them, grouped in
`residual-issues-2026-09-14.md` §1a–1d by what each fix would cost. Three of them are a single
filter or strip away from being true; two become true by deleting an unimplemented option from a
dropdown, with no behaviour change at all.

**The two cautions from that work still stand, because they will catch the next person:**

- `Behavior.showTicks` and `Meter.showTicks` are different properties with the same name. The
  matrix is per-section for that reason; do not let a check on one count for the other.
- A null result is a LEAD, not a verdict. Across the nine suites, more rows first measured nothing
  for a reason that was the fixture's than for a reason that was the product's. Every one of those
  is written into the suite header where it was met — the editor chrome below `Transform.y` 240,
  the session override that `defaultValue` does not clear, the slider Parts that make a Behavior
  fallback unreachable, the meter's clip rather than its fill, the joystick trail that is cleared
  on release, and zone rows and columns being 1-based.

## 2. The authoring stages

The handoff's own line: *a renderer test is not proof that the corresponding editing workflow
works.* Three rows in my half are now explicitly parked here rather than dismissed, because they are
inspector actions and the rendered control never performs them:

- `Setlist.scenes[].note` — stored and shown in the Setlist editor; the renderer draws the name, the
  tempo and a badge, never the note.
- `Recorder.slot` — the store/recall buttons on the Recorder inspector. The **slots** themselves are
  now measured (the song-chain rows play two of them); it is the by-hand swap that is not.
- `Recorder.grid` / `quantizeStrength` / `quantizeLength` / `snapToScale` — all four are arguments
  to `quantizeTake`, which has exactly one caller: the Quantise button in `RecorderEditor.svelte`.
  Pressing that button and hearing the take change afterwards is the only way these are observable.

Beyond those: Panel editor, Custom designer, Screen Builder, the Sequencer and Envelope designers,
scripting/routing, and the Player/export workflow. `browser-checks/designerTab.mjs` already covers
the Sequencer designer writing `StepSequencer.pattern`, which is worth knowing before anyone
rebuilds it.

## 3. Combined-panel acceptance

Every built-in plus all 14 custom starters on one panel: independent selection and gestures, linked
values and outputs, clock-driven controls, multiple SVG/effect instances, nesting, undo/redo,
save/reopen, and responsiveness that is acceptable rather than merely finite.

**The prepared mixed-panel draft was not attached to the handoff I received** — only the handoff
document itself arrived. If it is to be reviewed and executed rather than rewritten, please send it.
It is described as a fragment for the `componentBehavior.mjs` harness whose fixture coordinates and
custom-part colour selectors may need adjustment, and explicitly as not evidence until it runs.

**Before building anything: most of the panel already exists, and it is GENERATED.**
`CE/qa/QA-01-components.cepanel` places **all 58 registered types** — `TestBox` included — across 125
controls. `qaPanels.test.js` already regenerates every sheet in memory, server-renders every control
on it, and fails if the committed copy differs. So the built-in half of "a panel containing almost
every built-in" is done, and rebuilding it by hand would be work thrown away twice over: once
because it exists, and once because `CE/qa/README.md` says in bold not to hand-edit these files.
They are generated from the model and hand edits are lost on the next regeneration. **Change
`tools/scripts/qa/make-qa-panels.mjs` instead.**

What is genuinely missing from it is two things, and they are the two the combined-panel assignment
is actually about:

- **The custom starters.** `CUSTOM_COMPONENT_STARTERS` exports 14; QA-01 carries **one**
  `CustomComponent` instance. Extending the generator to place all 14 is the smaller and more
  durable job than authoring a second panel beside it.
- **Interaction.** QA-01 is a render sheet. Every control on it is drawn and checked; none of it is
  touched. Independent selection and gestures, linked values and outputs, clock-driven components
  running together, undo/redo, save/reopen and responsiveness are all still to do, and they are
  what the assignment is for.

One thing that pass should look for specifically, because this pass found it twice and both times it
was invisible in the drawing: **live state written to one place and read from another.** D-15 is the
clean example — the Phrase song chain swapped the riff into the preview session, the renderer read
the session, the note-firing path read the document, and the grid and the sound disagreed silently
for as long as the song ran. A combined panel with several clock-driven components running at once
is the best chance of finding the next one.

## 4. Decisions needed, not tests

Five declared options have no reader. They need a small deliberate decision each; none of them wants
speculative implementation. The full derivation is in the ledger; the short form:

| Option | Reachable from | Smallest honest treatment |
| --- | --- | --- |
| `Looper.quantizeLoop` | a hand-written script verb, `looper.quantize` | Implement the snap, or drop the verb. A caller exists today and gets silence. |
| `Constellation.showField` | derived script verb | Drop `showField` from the Constellation block of `sectionDefaults.js` and the derivation stops minting it. No UI exposes it, so nothing is lost. |
| `Meter.showScaleLabels` | derived script verb | The unimplemented half of a shipping feature — `showTicks` and `tickCount` both work, so the meter draws ticks and never labels them. Either label them or drop the key. |
| `Core.alwaysOnTop` | nothing at all | Delete. `zIndex` beside it does the job and has 243 readers. |
| `ContentLayout.textAboveIcon` | nothing at all | Delete. `textZIndex`/`iconZIndex` beside it do the job. |
| `ChordPad.fieldColour`, `Envelope.xLabel`/`yLabel` | nothing at all | Delete, or implement. No user-visible symptom either way. |

**Do not remove a supported property to make a checklist green.** Everything on this list was
confirmed by hand against the renderer, the editor and the verb tables before it was listed — and
four candidates from the same sweep were thrown out as false positives, because the drum pads' four
corner actions are read through a key built by concatenation that no literal search can see.

---

## Reporting back

Reproductions, fixes, the exact validation each one got, and the limits that remain. Not another
independent roadmap — the map is the coverage matrix, and it is a file that can be re-run.
