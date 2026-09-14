# Residual issues and unsupported features

Compiled 14 September 2026 by the behaviour pass. **This is not release approval.** It is the list
of things that are known, are not fixed, and should not be discovered by a user instead.

Three kinds of thing are kept apart on purpose, because collapsing them is how a release note comes
to overclaim:

- **Inert** — a declared option nothing reads. Some are reachable by a script, which is worse.
- **Unverified** — real behaviour this pass has not measured, with the actual reason.
- **Not proven** — things no test here could establish, however green it is.

---

## 1. Inert options — declared, and read by nothing

Nine, derived rather than collected: every key in `sectionDefaults.js` (1,046 across 63 sections)
checked against every mention in `CE/web/src` (723 files), then each survivor confirmed by hand
against the renderer, the editor and the script verb tables. Four candidates from the same sweep
were thrown out as false positives — the Drum Pads' corner actions are read through a key built by
concatenation, which no literal search can see.

**Reproducible, not a snapshot.** `node tools/scripts/qa/published-verbs-without-readers.mjs`
derives this list. A hand-made list goes stale the moment somebody adds a verb — which is exactly
what happened to the custom-export count in the behaviour ledger — and the mechanism below means new
ones arrive without anybody writing a verb-table line. The script reports two buckets: verbs with no
reader at all, and verbs whose key name is shared across sections so a reader cannot be attributed
(`Constellation.showField` lands there, because the Timbre reads a `showField` of its own).

**These three have a caller and give it silence. Worst of the group.**

| Option | Published as | What a script author gets |
| --- | --- | --- |
| `Looper.quantizeLoop` | `looper.quantize`, written by hand in `componentVerbs.js` | The call succeeds; the loop length snaps to nothing |
| `Constellation.showField` | `constellation.showField`, **derived** — `derivedFlagVerbs` mints a verb for every `show*` boolean in a section | The call succeeds; there is no field to show |
| `Meter.showScaleLabels` | `meter.showScaleLabels`, derived the same way | The call succeeds; the meter never labels its ticks |

`Meter.showScaleLabels` is the one worth a second look: it is not an orphan key but **the
unimplemented half of a shipping feature.** `showTicks` and `tickCount` are both read, so the meter
draws its scale ticks and has never labelled them, under a comment that says "Scale ticks + labels".

**These six are reachable from nowhere — no UI, no verb — so they have no user-visible symptom.**

| Option | Note |
| --- | --- |
| `Core.alwaysOnTop` | Sits beside `zIndex`, which does the job and has 243 readers |
| `ContentLayout.textAboveIcon` | Sits beside `textZIndex`/`iconZIndex`, which do the job |
| `StepSequencer.position` | The live index lives in a module map and reaches the renderer as `__position`; the document's own field is seeded, read and written by nothing. The Step Sequencer has no script verb family at all |
| `ChordPad.fieldColour` | `ChordPadRenderer` has no `fieldCss` |
| `Envelope.xLabel`, `Envelope.yLabel` | `EnvelopeRenderer` draws no `<text>` at all; written only by `tools/scripts/an1x-panel/` |

**The decision each one needs is small.** Implement it, or stop the API promising it — for the two
derived verbs that means removing the `show*` key from the section, since the verb is generated from
the declaration rather than written down. **Do not delete a supported property to make a checklist
green**; every row above was hand-checked precisely so that nobody has to take that risk.

### 1a. `Mouse.interceptChildClicks` — read, and unreachable. Needs a ruling, not a fix

Added after the Mouse pass, and it is a different shape from the nine above: **this one has a
reader.** `CanvasControl` puts `children-interactive` on the `.children-clip` layer and the CSS
beside it gives that layer back its pointer events, under a comment that names the use case
exactly — *"a decorative frame can stop taking clicks without disabling the controls it contains"*.

The layer only exists for a control that **has** children, and no component type can both have
children and carry the setting:

| | Types |
| --- | --- |
| Declare `Children` | Container, Group, TabContainer, ScrollArea |
| Declare `Mouse` | Range, Number, Slider, Knob, CustomComponent |
| Both | **none** |

So the Child Clicks chip is in the Mouse tab for every control that can never use it, and absent
from the four that the feature was written for. Two ways out, and **the choice is the owner's
because it is a product decision, not a defect fix**:

- **Hide the chip** where the control has no `Children` section. One `{#if}` in `MouseEditor.svelte`;
  changes no document; leaves the container case unbuilt.
- **Add `Mouse` to the four container types.** What the CSS was written for, and it would also give a
  container `interceptClicks` (a transparent decorative frame, which is what a container mostly is),
  `cursor` and `bringToFrontOnClick`. Bigger: adding a section to a type changes the shape of every
  newly created control of that type, so the QA panels and the generated fixtures want a look.

Not done here, deliberately. The behaviour pass records what is true; adding a section to four types
on my own initiative is the kind of change the handoff asks to be proposed rather than taken.

### 1b. The Mouse tab reaches five of fifty-eight types — worth knowing, probably correct

Not a defect and not on anybody's list, but it surprised this pass and it belongs where somebody
will find it. `Mouse` is declared by **Range, Number, Slider, Knob and CustomComponent**. A Label,
a Button, an LCD, a Meter, a Keyboard — the other fifty-three — have no Mouse section at all, and a
write to `Mouse.cursor` on one of them is silently dropped rather than creating the section
(`createControl` builds only what a type declares; measured, not assumed).

For the drag half that is plainly right: nothing else has a value a drag could move. For `cursor`,
`interceptClicks`, `hitTestShape` and `bringToFrontOnClick` it is arguable — a decorative Shape that
does not swallow clicks, or a Label that says "grab" over a drag handle, are both reasonable things
to want. Recorded as a question rather than a gap, and it is the same question as 1a: which types
should carry this section.

## 2. Unverified behaviour, with the real reason

Six rows across eleven suites. Every one that could be closed by looking harder has been: of the
rows carried into this pass, five of the six stated reasons did not survive checking, and one turned
out to be a property that was never declared.

**Authoring actions the rendered control never performs.** These belong to the editor pass:

- `Setlist.scenes[].note` — stored and shown in the Setlist inspector; the renderer draws the name,
  the tempo and a badge, never the note.
- `Setlist.capturePaths` — capture is an inspector action. `captureScene` is pure and unit-tested,
  and the recall half of the same contract is verified.
- `Recorder.slot` — the store/recall buttons. The *slots* are measured (the song chain plays two of
  them); the by-hand swap is not.
- `Recorder.grid` / `quantizeStrength` / `quantizeLength` / `snapToScale` — all four are arguments
  to `quantizeTake`, whose only caller is the Quantise button. **Worth stating plainly in any release
  note: an out-of-key note plays back exactly as recorded whatever `snapToScale` says.** That is a
  reasonable design — a destructive edit applied on demand — and it is not what the property name
  suggests.

**Conditional, and honest about it:**

- `Router.polyMode` — closed in `behaviourInbound.mjs` when the `polyAftertouch` source responds to
  injected pressure, and recorded as unverified in the run where it does not.

**A statement of fact rather than a gap:**

- Custom starters in the display class declare no hit zones. They are driven by bindings from public
  inputs, and there is nothing to press.

## 3. Scope limits — what a green run here does not mean

- **No physical hardware.** Every inbound check injects at `latestMidiInputMessage`, the store a MIDI
  device delivers into. That is the right seam for the panel's behaviour and says nothing about
  drivers, ports or timing on a real machine.
- **No claim beyond Windows.** macOS and Linux, other DAWs and export formats besides the tested
  VST3 path are not covered by the Windows evidence in `release-readiness-2026-09-13.md`.
- **The installed RC3 is older than the frontend fixes**, D-1 through D-18 included. The bundle needs
  refreshing before any acceptance is quoted against it.
- **Preview is a rehearsal, not the player.** Runtime movement in preview is not an authored value
  saved in the document, and several checks exist only to keep that distinction honest.
- **Assertion rows are not unique properties.** Fifteen suites report a few hundred rows between them;
  `tools/scripts/qa/coverage-matrix.mjs` reports the property-level figure, which is the smaller and
  more useful one — **204** of 1,046 declared properties are named by no check at all, down from 241
  when this list was written. The Mouse section accounts for the latest eleven; its remaining two
  are `interceptChildClicks` and `draggable`, both recorded above rather than papered over with a
  row that names them and proves nothing.

## 4. Defects found and fixed in this pass

D-1 through D-18, each with a regression that fails on revert. Recorded in full in
`editor-behaviour-claude-2026-09-13.md`; the shape is worth carrying into the next pass, because
fourteen of the first fifteen are two mistakes rather than fifteen:

- **D-8 to D-14** were one fault — writing, from the render path, a store that the same render
  reads. Four of them blanked the canvas outright; the rest were silent.
- **D-15** is that fault's mirror image: live state written to one place and read from another. The
  Phrase song chain swapped the riff into the preview session, the renderer read the session, and
  the note-firing path read the document — so the grid and the sound disagreed for as long as the
  song ran, with every pixel correct.

- **D-16 to D-18** are the first three of the editor-and-shared half, and they are a third shape
  again: **a setting that is published, edited and saved, and that nothing downstream can act on.**
  A drag sensitivity with no number to multiply, a relative drag seeded at zero because the path was
  written when only an absolute one existed, and a Focusable switch outranked by an index its own
  type template had already set. None of them throws, none of them looks wrong, and all three
  needed the value measured on the other side of a real gesture.

**The lesson for the combined-panel pass** is that none of those is visible in a screenshot. A
panel with several clock-driven components running at once is the best chance of finding the next
one, and the thing to watch is output, not appearance.

**And the lesson from D-16 to D-18 for the rest of priority 2**, where the remaining 204 unreached
properties are mostly settings rather than sounds: check what a setting does at the far end of the
chain it belongs to, not that the tab wrote it. Each of the three was written correctly into the
document and read correctly out of it; the break was one layer further on, in a default that was
never named, a seed that was never used, or a precedence rule that was right in isolation and wrong
against the templates the product actually ships.
