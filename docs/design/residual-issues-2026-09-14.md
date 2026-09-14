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
- **The installed RC3 is older than the frontend fixes**, D-1 through D-15 included. The bundle needs
  refreshing before any acceptance is quoted against it.
- **Preview is a rehearsal, not the player.** Runtime movement in preview is not an authored value
  saved in the document, and several checks exist only to keep that distinction honest.
- **Assertion rows are not unique properties.** Eleven suites report a few hundred rows between them;
  `tools/scripts/qa/coverage-matrix.mjs` reports the property-level figure, which is the smaller and
  more useful one — 241 of 1,046 declared properties are named by no check at all.

## 4. Defects found and fixed in this pass

D-1 through D-15, each with a regression that fails on revert. Recorded in full in
`editor-behaviour-claude-2026-09-13.md`; the shape is worth carrying into the next pass, because
fourteen of the fifteen are two mistakes rather than fifteen:

- **D-8 to D-14** were one fault — writing, from the render path, a store that the same render
  reads. Four of them blanked the canvas outright; the rest were silent.
- **D-15** is that fault's mirror image: live state written to one place and read from another. The
  Phrase song chain swapped the riff into the preview session, the renderer read the session, and
  the note-firing path read the document — so the grid and the sound disagreed for as long as the
  song ran, with every pixel correct.

**The lesson for the combined-panel pass** is that neither of those is visible in a screenshot. A
panel with several clock-driven components running at once is the best chance of finding the next
one, and the thing to watch is output, not appearance.
