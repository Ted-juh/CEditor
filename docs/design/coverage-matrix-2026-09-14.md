# Coverage matrix — what is reached, what is not, and how the numbers were got

Built 14 September 2026, as the reconciliation the handoff asked for: *"Reconcile the existing tests
against current exposed controls and build a concise matrix of actual remaining cases. Do not rerun
already-proven cases merely to generate larger totals."*

This is a **map of what to do next**, not a claim about quality. A property counted here as "reached"
has been *named by a check*. That is a much weaker statement than "its promised effect was verified",
which is what the per-component ledgers record. Both numbers are useful and they are not the same
number, so they are kept apart on purpose.

---

## How it was measured, including what the method cannot see

Every key declared in `models/sectionDefaults.js` — **1,046 of them across 63 sections** — against
every check in `CE/web/browser-checks`. A property counts as reached when a test names it in any of
three ways:

1. the dotted path the behaviour suites use, `'Harmoniser.forwardBend'`;
2. a bare key inside a section object of the shape the editor fixtures use, `{Meter:{value:0.5}}`;
3. **a UI label the section editor pairs with that key.**

The third one is not a refinement, it is the difference between a useful number and a misleading
one. The editor half drives the real properties panel by label —

```js
await number('Stroke width', 8);
await toggle('Ticks');
```

— so the key `strokeWidth` never appears as text anywhere in a test that exercises it thoroughly
through the actual authoring surface. Counting only keys reported **386 properties (37%) unreached**.
Counting labels as well reports **241 (23%)** at the time of writing. The first number was wrong, and
wrong in the worst direction: it called the editor half untested where it is strongest.

The figure is **live, not a snapshot**: the script is committed as `tools/scripts/qa/coverage-matrix.mjs`
and reads the suites as they stand, so it moves as checks are added. It dropped from 244 to 241 while
this document was being written, which was the three `followPanelKey` rows described below.

**The blind spot that remains, stated because it has already bitten twice.** A key built by string
concatenation is invisible to any search for its literal name. The inert sweep on the same data
reported the Drum Pads' four corner actions as having no reader; they are read through
`cornerField(corner)`, which builds `cornerTopLeft` from a prefix and a corner name. The same trap
caught the type-level pass below, where `PitchWheel` and `ModWheel` looked untested because they are
created from a loop array rather than a literal call. **Every candidate in this document was checked
by hand before being listed.** Treat any single row as a lead, not a verdict.

---

## Component types: not the gap

All **58 registered types** were checked against both halves.

| | Types |
| --- | --- |
| Both halves | 23 |
| Editor/properties half only | 30 |
| Behaviour/output half only | 4 — Router, Panic, Transport, Constraint |
| Neither | 1 — `TestBox` |

`TestBox` is internal and not user-reachable: `models/insertCatalog.js` records that shipping it in
the insert palette was itself the bug that catalogue was written to fix. So **every type a user can
place has a fixture in at least one half.**

What the split does say is that the two halves have barely met. Only Slider, Knob and the music
components are exercised from both directions; thirty types are authored-and-checked in the editor
with no output-level test, and four are measured at the output with no authoring test. That is the
real shape of the remaining work, and it is about *depth per type*, not about missing types.

---

## Properties: 241 of 1,046 reached by no check

Largest concentrations first. Run `node tools/scripts/qa/coverage-matrix.mjs` for the current full list.

| Section | Unreached / total | Character of what is missing |
| --- | --- | --- |
| `Behavior` | 48 / 94 | Button modes (`buttonType`, `requiredClicks`, `clickWindow`, `lockoutDuration`), keyboard adjustment (`arrowKeyAdjust`, `pageKeyAdjust`, `homeEndAdjust`), tick geometry and min/max label placement, readout `prefix`/`suffix`/`unit`, and the four `emit*` flags |
| `Display` | 24 / 64 | LCD image/animation sources, palette and glass, char/line spacing, value prefix/suffix |
| `Pixel` | 14 / 44 | The same families on the pixel screen, plus `layoutTransition`/`transitionMs` |
| `Mouse` | 10 / 13 | `cursor`, the three `intercept*`, `draggable`, `hitTestShape`, drag mode/sensitivity, axis inversion |
| `Designer` | 10 / 13 | Authoring-stage state; arguably not behaviour at all — see below |
| `ContentLayout` | 8 / 15 | Icon/text offsets and z-order |
| `Listbox` | 8 / 29 | `density`, `zebra`, `cardRows`, `fadeEdges`, `scrollbar`, `selectionAnim`, `recallOnSelect`, `nowPlaying` |
| `TabContainer` | 8 / 10 | `pageIndex`, `edge`, `showStrip` and the five colours |
| `ExternalAPI` | 6 / 8 | The whole external-link contract |

The long tail is **colours**: `fieldColour`, `labelColour`, `trackColour` and friends across a dozen
components. Cheap to check and cheap to break, since a renderer that stops reading one is invisible
until somebody authors a dark panel.

**Two sections should probably be struck from the denominator rather than tested.** `Designer`
(13 keys) and `Assets` (5) are authoring-session state and asset bookkeeping, not component
behaviour — a `selectedHitZone` has no promised effect to verify. They are left in the count here
rather than quietly removed, because deciding what does not need testing is a decision somebody
should make deliberately.

---

## What this already found

The matrix is not a plan for later; it earned its place on the first run.

**`followPanelKey` was tested on three of the seven sections that declare it.** `KEY_SCALE_SECTIONS`
names ChordPad, Arp, NoteRibbon, Phrase, Harmoniser, Recorder and Keyboard. The assignment named
three, and those three plus the ChordPad holdout were done. Arp, NoteRibbon and Keyboard were
reached by nothing at all. The interesting risk there is not that the broadcast fails again — it is
that a section missing from `panelKeyPlan` would follow nothing and look **exactly like a section
that had opted out**, which no per-component test would ever notice. `behaviourOutbound.mjs` now
covers all seven and asserts the count of followers moved by one call.

---

## Suggested allocation

Unchanged from the handoff's own split, with the matrix attached to it:

- **Editor/properties half:** `Behavior`, `Display`, `Pixel`, `Listbox`, `TabContainer`,
  `ContentLayout`, `Mouse` — 112 of the 244, and all of it authored through the panel that half
  already drives.
- **Behaviour/output half:** the colour tail on the music components, `ExternalAPI`, and the
  authoring-stage rows the per-component ledgers now carry explicitly (`Setlist.scenes[].note`,
  `Recorder.slot`, the `quantizeTake` argument group).
- **A decision, not a test:** `Designer` and `Assets`.
