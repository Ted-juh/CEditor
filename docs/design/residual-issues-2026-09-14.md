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

### 1c. The `Behavior` section's ten — three model-only, two dock-only, five emit flags

From `behaviourButtons.mjs` and `behaviourTrack.mjs`. Each was checked three ways before being
written down — a repo-wide search for the key name, a search for computed access to `behavior`
(there is **none anywhere in src/**, so the drum-pad trap cannot apply here), and the scripting and
export tables — because "no reader" has been wrong in this repository before.

**Three have zero mentions outside the model defaults.** No cell, no reader, no verb:

| Option | Note |
| --- | --- |
| `Behavior.pressMode` | The idea is real and is spelled elsewhere twice — `momentaryButtonPreview` decides press-versus-release for the momentary family, and the timed family has subtypes. A third spelling, not a missing feature |
| `Behavior.toggleOn` | Declared beside it, same in every respect |
| `Behavior.activationKeys` | Defaults to `['Enter', 'Space']`. The keyboard path that exists reads `keyboardEnabled`, `arrowKeyAdjust`, `pageKeyAdjust` and `homeEndAdjust` — all four verified — and hard-codes which keys do what. A description of the behaviour, not a setting that shapes it |

**Two reach only the editor's Interaction Preview dock**, not the panel surface and not the player:

| Option | Note |
| --- | --- |
| `Behavior.uncheckOnClick` | The panel spells the same idea `allowUncheck`, which is read and has a cell. One concept, two names; the fix worth doing later is deleting one, not implementing the second |
| `Behavior.allowMixed` | **User-visible**: a chip in the Behavior tab, "Mixed — allow a mixed state where the design calls for it". On a real panel a toggle has two states whatever the chip says |

**The five emit flags**, which the handoff asked to be inspected by name:

| Option | Where it is offered | What reads it |
| --- | --- | --- |
| `emitClick` | chip, Behavior tab | nothing. Its own tooltip says "expose click events to the **future** scripting/runtime layer" |
| `emitStateChange` | chip, Behavior tab | nothing. Same tooltip wording |
| `emitValueChange` | toggle, Behavior tab | nothing |
| `emitValueCommit` | chip, Slider tab | one line — `InteractiveTestSurface.svelte:173`, a 180ms `executed` pulse in the editor dock. The only one of the five with real behaviour behind it, in the place a user is least likely to look |
| `emitActiveHandleChange` | chip, Slider tab | nothing, not even the test surface. The active handle itself is live and verified |

**Smallest honest release treatment.** The three model-only fields need nothing: no UI promises
them. The two dock-only ones and the five flags are a single decision — either drop the six chips
and the toggle until there is something behind them, or keep them and say in the release note that
the emit flags and the mixed state are design-time only. Three of the seven already carry the
caveat in their own tooltip.

**Two more, from the slider half, that are not options but are worth the same paragraph:**

- `Behavior.majorTickLength` / `minorTickLength` — no editor cell, and structurally unreachable on
  the renderer: the tick length is the `tickMajor`/`tickMinor` **part's** height, every slider and
  knob is created with those parts, and `resolveSliderSemanticParts` merges the full default set
  back in even if the Parts block is emptied. The second term of that fallback chain is dead code.
  There is a divergence behind it worth a look before the next release, though it needs a document
  state the editor does not produce: `PanelPreviewSurface.sliderPartsFor` reads `Parts` **raw**,
  with no merge, so for a parts-less slider the drawn tick length and the one the hit geometry
  computes from come from different places — and on a circular slider that feeds the radius.
- `Behavior.dragEnabled` — no editor cell; both readers exclude the slider role by name in the same
  expression that reads it; and the only role left, the spinbox, never delivers the press, because
  the zone a scrub would start in is an `<input>` whose focus handler opens text editing and stops
  propagation first. Measured, not read off the source.

### 1d. Seven more user-visible options with nothing behind them, from the rest of priority 2

All found the same way and each checked the same three ways before being written down — the key
name repo-wide, computed access to the section object, and the scripting and export tables. They
are grouped by what it would take to make the promise true, because that is the decision each one
needs.

**~~A small fix, not a feature~~ / ~~Remove the unimplemented options~~ — RULED, AND ALL FIVE NOW WORK
(14 September 2026).** The owner's ruling was to implement rather than remove, including the two
this list had proposed deleting. What each does now, and what it cost:

| Option | What it does now |
| --- | --- |
| `ExternalAPI.acceptsExternalLinks` | Off, the component offers no inputs: nothing external can drive it. **And it applies at run time**, not only to the picker — a link authored before the switch went off stops carrying a value. That half is the point of the setting; a permission the editor enforces and the runtime ignores is a suggestion |
| `ExternalAPI.emitsExternalLinks` | The mirror: off, the component offers no outputs and drives nothing, while remaining drivable |
| `ExternalAPI.linkPolicy` | All three options implemented against markers the model already carried. `publishedOnly` (unchanged, still the default) reaches the published contract; `advancedOptIn` adds value channels the author has **not** marked private — `publicInput`/`publicOutput`, which the Value Channels editor already shows as "private in"/"private out" and the export layer already honours; `allInternals` reaches the private ones too. A published entry always wins over the bare channel behind it, so publishing's renames and narrowed ranges survive a wider policy. The dropdown's three raw values were relabelled to say what they do |
| `Assets.packagePolicy.embedAssets` | Off, the artwork is left out of the package and **the references are kept** — every asset still appears by name, at its real size, with its mime type and source filename, marked `sourceType: 'linked'`. The envelope carries `assetsEmbedded` so a reader can tell a deliberate omission from a truncated file |
| `Assets.packagePolicy.warnMissingFonts` | The check now exists. `listCustomComponentFontFamilies` collects the families a component's parts actually render with (from the materialized snapshot, so generated tick labels count) merged with any declared in `Assets.fonts` — which gains a writer and a reader in the same change — and `missingCustomComponentFonts` compares them against `availableFonts`. Surfaced in the **import preview**, where it is still a decision, rather than after the package is in the library |

Three things worth keeping from doing it:

- **The endpoint lister is also the run-time resolver**, which is what made "one filter" the right
  size for the first two and the wrong description of the job. `applyPanelCustomLinkRoutes` looked
  endpoints up but fell back to the raw channel when it found none — correct for working out a type
  to convert through, and useless as a gate. The gate is now explicit and separate from that
  fallback. A test caught this; the first implementation passed the picker rows and failed the
  run-time one.
- **A refused link is still LISTED, marked `blocked`.** Hiding it would leave the author with a link
  in their document that they cannot see, understand or delete. Kept apart from `missing`, because
  the two need different answers — a setting to change, versus a component to restore.
- **The envelope carries the Assets section twice**, once on its own and once inside `component`, so
  a strip that missed either would leave the bytes in the file by the other route and the toggle
  would appear to do nothing for the one reason nobody checks.

**The one behaviour change to know about.** Narrowing the Policy, unpublishing a property, or
disabling one now stops links that depended on it from carrying a value. That is the same sentence
read forwards — those settings decide what other components may reach — and it is the same family
of defect as the rest of this pass, where a control could be disabled and go on being driven. It is
recorded here rather than left to be discovered.

Evidence: `panelCustomComponentLinks.test.js` (+7), `customComponentPackage.test.js` (+11),
`browser-checks/behaviourShared.mjs` (6 rows, was 2 inert) and `browser-checks/behaviourAssets.mjs`
(5 rows, was 2 inert). Each fix was reverted on its own and fails exactly its own rows: 7, 4 and 5.

**A feature, so say so in the release note or drop the cell:**

| Option | Note |
| --- | --- |
| `Icon.tint` | **Two places in the UI say it exists**: a colour field in the Icon tab ("Primary tint applied to the imported icon") and the Effects tab's own help text pointing at it ("Primary icon tint still lives in Icon"). `CanvasControl` draws the icon as a plain `<img src={dataUrl}>`, and the style it builds carries object-fit, opacity, both flips, the rotation and the effect filters — with no colour step anywhere. Recolouring an arbitrary image needs a mask or an SVG rewrite |
| `Core.tooltip` | A text field in the Core tab. The element carries no `title` and no `aria-describedby` after it is set. The one a user is most likely to try, because every other editor on the panel has working hints |
| `Core.screenReaderText` | The same shape and worse in kind, because it is an **accessibility** promise. The element's measured `aria-label` is the surface's own "<name> preview" — exactly the value this field should be overriding |

**And four that are correctly editor-only or export-only, recorded so the matrix row has an
answer rather than looking like a gap:** `Value.showMapping` (opens the mapping section of the
inspector), `Value.storeByValue` (read by `exportParameters.js`, so the export suite owns it),
`Grid.lineWidth` (the design grid is not painted in preview or in the player), and
`Transform.affectsFit` (`sceneryCompile.js`, the Screen Builder's compile step).

**Two that the product already documents as dead:** `Core.stylePreset`, which CoreEditor renders
as a chip titled *"Left over from a field that was never read by anything. Safe to clear."*, and
`ContentLayout.textAboveIcon`, whose idea is spelled twice more in its own section —
`ContentLayout.mode` offers `text_above_icon_below`, and the stacking order is
`textZIndex`/`iconZIndex`.

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
  more useful one — **66** of 1,046 declared properties are named by no check at all, down from 241
  when this list was written. **The editor-and-shared half is closed.** What each section leaves
  behind is recorded above with its reason rather than papered over with a row that names the
  property and proves nothing, and the matrix cannot see those notes: of the 66, ten are the
  `Behavior` group in §1c, ten are the `Designer` session-state block already ruled out of the
  denominator, and most of the rest are the inert and closed-elsewhere rows listed here. The
  genuine remainder is a handful of two-property tails.

## 4. Defects found and fixed in this pass

D-1 through D-19, each with a regression that fails on revert. Recorded in full in
`editor-behaviour-claude-2026-09-13.md`; the shape is worth carrying into the next pass, because
fourteen of the first fifteen are two mistakes rather than fifteen:

- **D-8 to D-14** were one fault — writing, from the render path, a store that the same render
  reads. Four of them blanked the canvas outright; the rest were silent.
- **D-15** is that fault's mirror image: live state written to one place and read from another. The
  Phrase song chain swapped the riff into the preview session, the renderer read the session, and
  the note-firing path read the document — so the grid and the sound disagreed for as long as the
  song ran, with every pixel correct.

- **D-16 to D-19** are the four of the editor-and-shared half, and they are a third shape
  again: **a setting that is published, edited and saved, and that nothing downstream can act on.**
  Two of the four are one mistake seen twice — a default that happens to agree with a hard-coded
  value, hiding the fact that the field is not read at all. D-18's five type templates pinned
  `tabIndex: 0`, which is what the code would have done anyway; D-19's `auto` branches inlined 22
  and 14, which are the declared defaults of the two gaps they were standing in for. In both the
  cell showed the right number and moved nothing.
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
