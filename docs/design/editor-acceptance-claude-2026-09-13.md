# Editor acceptance — component & property coverage ledger

Claude's half of the two-agent release QA, from main `00c6bf12`. Codex owns full-app/native UI,
canvas editing, docks, save/reopen/recovery, packaging/export and integration; this file covers
component/property coverage and adversarial model tests only.

**Rule for this ledger: a cell is "tested" only if a test or probe actually executed against it.**
Reading the source does not count. Cells nothing exercised are listed as untested rather than
assumed working.

## Baseline

`node --test` over `test/**/*.test.js` at `00c6bf12`: **4,669 files / 4,662 pass / 1 skip** after a
clean `npm ci`. An earlier run in this container reported 6 failures
(`qaPanels`, `gaiaPanel`, `visualGolden`, `sceneryFold`, `canvasTextVisual`,
`canvasHiddenLockedPointer`); all six were one stale dependency — `gifuct-js`, declared in
`package.json` but absent from a `node_modules` predating the GIF work. After `npm ci` those six
run 106/106. **Not a product regression**; recorded so the number is not mistaken for one later.

## Measured coverage: the QA sheets exercise 7% of component properties

Method: build a default control for each of the 56 `INSERT_CATEGORIES` types via `createControl`,
enumerate every non-underscore property across its sections, then walk all eight `CE/qa/*.cepanel`
sheets (including nested `Children`) and count properties whose saved value differs from the type's
default.

| | |
|---|---|
| Insertable types | 56 |
| Properties across those types | 4,538 |
| Properties set to a non-default value in any QA sheet | **337 (7%)** |
| Types absent from every QA sheet | **0** |
| Types in QA sheets but not in the catalog | 2 (`TestBox`, `Button`) |

Every type is *present*; almost every property sits at its default. Type presence is not property
coverage, and the eight sheets should not be read as a component matrix.


### buttons

| Type | Props | Exercised by QA sheets | % |
|---|---|---|---|
| MomentaryButton | 165 | 6 | 4% |
| CyclicButton | 165 | 6 | 4% |
| Listbox | 194 | 7 | 4% |
| TimedButton | 165 | 6 | 4% |
| OneShotButton | 165 | 6 | 4% |
| RadioButtonGroup | 165 | 10 | 6% |
| ToggleButton | 165 | 12 | 7% |
| Combobox | 165 | 13 | 8% |

### values

| Type | Props | Exercised by QA sheets | % |
|---|---|---|---|
| Range | 148 | 6 | 4% |
| Number | 146 | 6 | 4% |
| Crossfader | 56 | 4 | 7% |
| Numpad | 59 | 4 | 7% |
| Ribbon | 56 | 4 | 7% |
| PitchWheel | 56 | 4 | 7% |
| ModWheel | 56 | 4 | 7% |
| VectorJoystick | 59 | 4 | 7% |
| Macro | 48 | 4 | 8% |
| Slider | 146 | 14 | 10% |
| Knob | 146 | 21 | 14% |
| CustomComponent | 86 | 21 | 24% |

### layout

| Type | Props | Exercised by QA sheets | % |
|---|---|---|---|
| TextInput | 154 | 7 | 5% |
| Group | 77 | 4 | 5% |
| Meter | 66 | 4 | 6% |
| ProgressBar | 67 | 4 | 6% |
| TabContainer | 60 | 4 | 7% |
| ScrollArea | 58 | 4 | 7% |
| PixelDisplay | 77 | 6 | 8% |
| LcdDisplay | 97 | 9 | 9% |
| Shape | 38 | 4 | 11% |
| Background | 27 | 4 | 15% |
| Image | 27 | 4 | 15% |
| Label | 54 | 14 | 26% |
| Container | 50 | 15 | 30% |

### modulation

| Type | Props | Exercised by QA sheets | % |
|---|---|---|---|
| Envelope | 64 | 4 | 6% |
| Router | 55 | 4 | 7% |
| Turing | 54 | 4 | 7% |
| Constellation | 54 | 4 | 7% |
| Matrix | 52 | 4 | 8% |
| Orbit | 50 | 4 | 8% |
| Looper | 52 | 4 | 8% |
| Timbre | 49 | 4 | 8% |
| Kinetic | 50 | 4 | 8% |
| Constraint | 45 | 4 | 9% |

### music

| Type | Props | Exercised by QA sheets | % |
|---|---|---|---|
| Arp | 66 | 4 | 6% |
| DrumPads | 68 | 4 | 6% |
| Phrase | 64 | 4 | 6% |
| Recorder | 66 | 4 | 6% |
| Harmoniser | 63 | 4 | 6% |
| StepSequencer | 54 | 4 | 7% |
| ChordPad | 60 | 4 | 7% |
| NoteRibbon | 58 | 4 | 7% |
| Setlist | 55 | 4 | 7% |
| Keyboard | 53 | 4 | 8% |
| SplitZone | 48 | 4 | 8% |
| Transport | 51 | 4 | 8% |
| Panic | 44 | 4 | 9% |

## Confirmed defect

### C-1 — a custom response curve containing NaN yields a NaN 7-bit MIDI value

`CE/web/src/CE_Application/utils/responseCurve.js`

`normalizeResponseCurvePoints` substitutes only for `null`/`undefined`:

```js
return Math.round(clamp(source?.[index] ?? identity, 0, 127));
```

`??` does not catch `NaN`, and the module's `clamp` is
`Math.min(high, Math.max(low, Number(value)))`, which propagates NaN rather than clamping it.

Reproduced:

```
pts = [0,16,32,48,NaN,80,96,112,127]
normalizeResponseCurvePoints(pts)              -> 0,16,32,48,NaN,80,96,112,127
responseCurveValue(0.5, 'custom', pts)         -> NaN
responseCurveDisplayPoints('custom', pts)      -> NaN at index 4  (breaks the drawn curve)
applyResponseCurve7(64, {curve:'custom', points:pts})                  -> NaN
applyResponseCurve7(64, {curve:'custom', points:pts, noteVelocity:true}) -> NaN
```

The asymmetry is the tell: both scalar inputs are guarded (`responseCurveValue` line 21,
`applyResponseCurve7` line 52) and the points array is not.

**Reachability — stated honestly.** The designer UI cannot produce this:
`ResponseCurveDesigner.svelte` `setPoint` uses `Math.round(Number(value) || 0)`, and `NaN || 0` is
`0`. So NaN can only arrive from a non-UI producer (`stores/instrumentHost.js`, a script, or the
native side). This is a model-boundary robustness gap, not a demonstrated user-facing bug. I have
not traced the host producer; that path is Codex's.

**Smallest fix:** make `clamp` NaN-safe, or use `Number.isFinite(source?.[index]) ? … : identity`.

## Probed and clean (tested evidence, not source reading)

- **Serialization round-trip, all 56 types.** Every scalar property set to a boundary value
  (`0`, `-1`, `1e9`, `0.1`, inverted booleans, empty / 300-char / `<&">éBP` strings), then
  `serializePanel` → `deserializePanel` → per-property compare. **No diffs, no throws.**
- **`responseCurve`** — every curve × `{0, 1, 0.5, -1, 2, NaN, ±Infinity, undefined, null, '0.5'}`;
  all finite except C-1.
- **`rangeBehavior.snapRangeValue`** — zero-span, inverted, zero/negative/NaN step, NaN min, bare
  behavior × `{-5, 0, 0.5, 1, 5, NaN, Infinity}`. All finite, no throws.
- **`returnToRest.returnStep`** — all 5 modes × 3 curves × degenerate elapsed/from values. Value
  always finite; always reaches `done` at large elapsed.
- **`stepSequencerLayout`** — `advanceStep` over 40 iterations × 4 directions × step counts
  `{0,1,2,16,-4,NaN}` stays in range; `stepMs`/`gateMs` at BPM `{0,-1,1,20,300,1e6,NaN,null}` all
  finite and non-negative; `sequencerGeometry`/`cellRect` at degenerate sizes finite;
  `setCellVelocity` clamps `{-1,0,1,127,128,1e9,NaN}`. Only `advanceStep` with a NaN step count
  returns `position: null`, and a real control cannot supply that.

## Explicitly untested

- **The 4,201 properties** the QA sheets leave at default (table above). The node suite covers many
  of these models independently; this ledger does not yet cross-reference which.
- **~90 `utils/` modules with no dedicated test file.** In my scope and stateful:
  `customComponentArpeggiator`, `customComponentLayout`, `customComponentRecipes`,
  `customComponentScaffold`, `customComponentInteraction`, `musicalContext`, `keyboardLayout`,
  `numpadLayout`, `scrollAreaLayout`, `tabContainerLayout`, `shapeGeometry`, `sliderBehavior`,
  `enumBehavior`, `parameterAdoption`, `parameterAdoptionRules`, `randomizer`, `deepClone`.
- **Structural properties** (arrays/objects: patterns, zones, layouts, steps) — the round-trip probe
  deliberately skipped these. Next target.
- **Rendered behaviour** for all 56 types. Only the models were exercised here.

---

## Round 2 — structural and package interactions

### C-1 fixed

`utils/responseCurve.js`: NaN-safe `clamp`, and a non-finite custom point now falls back to the
identity value rather than the floor (a missing point already did). `test/responseCurve.test.js`
added — 6 tests; **4 of the 6 fail against the unfixed file**, 6/6 pass with it.

### C-2 — a freshly inserted package component always reads as "edited"

`CE/web/src/CE_Application/utils/customComponentPackage.js`

`fingerprintCustomComponent` (`:517`) hashes the whole control and deletes only `Core.id`:

```js
const clone = deepClone(control ?? {});
if (clone?._children?.Core) delete clone._children.Core.id;
return hashString(stableStringify(clone));
```

`instantiateCustomComponentPackageControl` (`:937`) stamps eight provenance fields onto the
instance that the authored control never had — `packageName`, `packageVersion`, `packageId`,
`packageFingerprint`, `packageImportedAt`, `sourcePackage`, `designWidth`, `designHeight` — and the
fingerprint therefore hashes them.

`CustomPackageLibrary.svelte:80` compares the stored provenance fingerprint against a live one:

```js
currentPackageMatchesSource = currentSourcePackage.fingerprint === packageFingerprint
```

Measured on QA-07's "Status Lamp", instantiated and **not touched**:

```
stored sourcePackage.fingerprint : 99d743e1
live fingerprintCustomComponent  : 6d3f6e9d
UI says                          : "edited since package load"
```

All **14** custom components in QA-07 drift on instantiate. The drift indicator is therefore stuck
in the "edited" state for every packaged component from the moment it is inserted, which is worse
than having none: a genuine edit is indistinguishable from the false baseline.

Second half: `packageImportedAt` is a timestamp inside the hash, so the fingerprint is not stable
between two instantiations of the same package 1.1s apart. The author-side envelope fingerprint
*is* stable — only the instance side moves.

**Proposed fix (not applied — claiming the file first):** exclude the `Designer` provenance keys
from the hash the same way `Core.id` is excluded, so the fingerprint describes the component rather
than its import event.

### Probed and clean — round 2

- **First open loses nothing.** Raw `.cepanel` JSON vs `deserializePanel` output, deep compare,
  counting only dropped keys and changed values: **0 across all eight sheets / 2,943 controls.**
  Keys ADDED by expansion are the sparse format filling defaults and are correct.
- **`expandControl(shrinkControl(c))` deep-equals `c` for 2,943/2,943 controls** across all eight
  sheets — the invariant `documentShape.js` names as the easy one to get wrong.
- **Deletions survive the sparse format.** QA-07 control 2 carries
  `ValueChannels._children._removed: ["mainValue","mode"]`; after expansion those two channels are
  absent and the other three remain. Nothing resurrected. (My first probe flagged `_removed` as
  dropped data; it is a consumed directive, not data. False positive, chased down.)
- **Package export → instantiate → export** for all 14 QA-07 custom components: no public-API
  members lost (`inputs`/`outputs`/`editableProperties` counts hold), no ValueChannels resurrected,
  nothing valid-before-invalid-after. Only the fingerprint drifts (C-2).

### Environment

- Rendered tests **are** available here: `playwright-core` present, `/opt/pw-browsers/chromium-1194`
  present. No gap.
- `npm ci` was required to reach a green baseline; the container's `node_modules` predated
  `gifuct-js`.

---

## Round 3

### C-2 fixed

`utils/customComponentPackage.js`: `fingerprintCustomComponent` now excludes the keys
`instantiateCustomComponentPackageControl` stamps onto an instance — the six `package*` /
`sourcePackage` provenance fields, plus `designWidth`/`designHeight`, which instantiate derives from
`Transform.width`/`height` and the hash already covers. Same reasoning as the existing `Core.id`
exclusion: two copies of one component are the same component.

After the fix, on all 14 QA-07 components:

```
stored sourcePackage.fingerprint : 99d743e1
live fingerprintCustomComponent  : 99d743e1
UI says                          : "unchanged from source package"
two instantiations 1.1s apart    : fingerprints equal
```

`test/customComponentFingerprint.test.js` — 6 tests, **3 of 6 fail against the unfixed file**:

- all 14 starter instances read as unchanged on insert
- the fingerprint does not depend on `packageImportedAt`
- **a real authored edit still moves it** — a resize and a rename both do, while changing only
  `Core.id` does not (the fix must not be a blanket "ignore Designer")
- export → instantiate → export **settles** rather than drifting further each round (3 rounds,
  all 14 components, one distinct fingerprint each, equal to the author-side value)
- the public surface survives the round trip

### Rendered path — `browser-checks/musicModulationRuntime.mjs`

Drives the real app the way `shapeEffects.mjs` does, so it needs no entry/html and does not touch
`browser-checks/vite.config.mjs` (avoiding the `editorAcceptance*` inputs).

```
ok  19/19 stateful components mount and occupy space
ok  a sequencer pattern edit reaches the document and reads back
music/modulation runtime: all checks passed
```

Covers `StepSequencer, Envelope, Turing, Orbit, Kinetic, Looper, Matrix, Constellation, Timbre, Arp,
ChordPad, DrumPads, Phrase, Recorder, Harmoniser, SplitZone, Setlist, NoteRibbon, Keyboard` — each
inserted into a real panel, found in the DOM, non-zero size, and no `pageerror` during its render.

Two things the harness had to learn, both matching what the full-app harness hit:
a fresh app has **no panel** (so `addControl` is a silent no-op until one exists), and a new control
**nests under the selected container**, so any collector has to walk `Children`.

### Probed clean — round 3

- **Modulation family**: `stepKinetic` over 500 iterations × dt `{0,1,16,1000,1e6,-16,NaN}` never
  goes non-finite; `kineticKick` at strength `{0,1,1e9,-1,NaN}` stays finite through 200 further
  steps; `nodePos` across phase `{0,…,1e6,NaN}`; `stepOutput` across quantize `{0,1,2,8,128,-1,NaN}`
  and out-of-range indices; `normalizePoints` with NaN x/y/tension, reversed order, duplicate x and
  200 points — always ordered, always finite.
- **Sequencer cross-property**: authoring 16 cells then shrinking to 4 steps and growing back keeps
  all 16 — shrinking is non-destructive, which is the desirable behaviour.

### Two false positives, chased down rather than reported

- `stepNotes` returns notes for steps past the configured count — but `seqStepOnce` derives its
  index from `advanceStep`, which is already bounded, so it is never called out of range.
  Garbage-in only, not a defect.
- A first pass "found" 206 envelope failures. The model's points are `{id,x,y,curve,tension}`, not
  `{t,v}`; the predicate was wrong, not the code.

---

## Round 4 — customComponent utils, and the suite with both fixes

**Full node suite: 4,781 tests / 4,780 pass / 0 fail / 1 skip**, with C-1 and C-2 applied and the
two new test files in. Baseline for comparison was 4,669/4,662/6 before `npm ci`.

### Probed — `customComponentLayout`, `customComponentArpeggiator`, `customComponentScaffold`

`resolveLayoutUnit` across units `{px,%,percent,fr,'',null,bogus}` × values
`{0,-10,50,1e9,NaN,'50',null}` × totals `{0,1,100,-5,NaN}`; `layoutAnchorOffset` across seven
anchors × sizes `{0,100,-1,NaN}`; `resolvePartPixelRect` over six layouts × four control sizes;
`normalizeCustomArpeggiator` and `resolveCustomArpeggiatorStep` across seven configurations × step
indices `{0,1,7,64,-1,NaN}`.

Result: **no defect with a demonstrated consequence.** Arpeggiator notes stayed inside 0..127 for
every configuration including empty and NaN step lists; nothing threw.

### L-1 (latent, not filed as a bug) — `resolvePartPixelRect` does not clamp

`utils/customComponentLayout.js:31`. Width and height pass straight through, so a negative
`layout.width` yields a negative rect, and `mode: 'fill'` returns the control's own dimensions
unchecked.

Reachability argues against filing it: the artboard's own size is clamped at
`CustomDesignSurfaceEditor.svelte:1936` (`Math.max(1, …)`), and `customDesignSurfaceGeometry.js`
clamps bounds at `:51`, `:52`, `:91`, `:92`, `:136`. I could not demonstrate a path that reaches
`resolvePartPixelRect` with a negative size, so this is recorded as a robustness gap rather than a
defect. Unlike C-1 it has no demonstrated consequence — C-1's NaN reached a MIDI byte.

A NaN *parent* size also produces NaN out of both helpers, but that is garbage-in: the parent
dimension is already clamped upstream, and root has since closed `Infinity` entry via
`NumberCell.svelte`.

### One more flawed probe, recorded

`nextInteractiveBaseName` appeared to repeat "knob" across twelve calls. It reads the control to
pick the next free name, and my probe never applied the patch between calls — so the input never
changed. Not a finding.

---

## Round 5 — the button and values families

The ledger puts these lowest (4–6% property coverage) and they are what an ordinary panel is mostly
made of, so this is where a finding was most expected. **None found.**

### Probed clean

- **`enumBehavior`** — the option list behind Cyclic Button, Combobox and Radio Group, and
  previously untested. Across seven lists (normal, all-duplicates, blank-padded, mixed
  object/null/number members, whitespace variants, 500 options, empty) × seven current values
  including deleted, blank, null and numeric:
  - normalising trims before de-duplicating, drops blanks, and survives `null` / a non-array;
  - **a selection whose option was deleted resolves to a real member** — the interaction I expected
    to be broken. `resolveEnumDefaultValue` falls back to the first option rather than returning a
    token nothing matches, so a control cannot point at an option that no longer exists;
  - the normalised position is always a finite 0..1;
  - cycling with wrap visits every option exactly once and returns to the first;
  - without wrap the last option is the end of the line.
- **`numpadLayout`** — nine press sequences (repeated `.`, repeated `-`, twelve digits, clear,
  three backspaces from empty, `-.5`) never leave a pending string `Number()` cannot read, and
  `numpadKeys` is finite at sizes `{0×0, 1×1, -10×50, NaN×100, 300×200}`.

### New coverage

`test/enumBehavior.test.js` — 5 tests. **Not regressions**: the module held under probing. They pin
the invariants a caller depends on so the next edit has to keep them, including the deleted-option
fallback and the deliberate "one option reads as 1, not 0" (`enumBehavior.js:35`), which is
surprising enough to be worth writing down.

## Honesty note on this pass

Four of my probe "findings" across five rounds were **my predicate, not the code**:

| Probe | What I got wrong |
|---|---|
| `_removed` | A consumed directive read as dropped data |
| `stepNotes` past the end | Never called out of range by the bounded caller |
| 206 envelope failures | Points are `{id,x,y,curve,tension}`, not `{t,v}` |
| 36 enum failures | `getEnumNormalizedValue` returns a 0..1 position, not a token |

Each was chased to the source and discarded before being reported as a defect. Recorded because a
QA ledger that lists only hits misrepresents its own precision — and because the fix in each case
was to read the contract first, which is cheaper than the probe.

---

## Round 6 — prop-contract sweep, and real rendered interactions

### C-3 — two more components handed a prop they do not declare

Root found `RecorderEditor` passing `{control, section}` to `TransportSyncCells`, which declares
`{synced, onchange, span, hint, children}`. That is a *class* of bug, so I swept for siblings by
parsing every `.svelte` with **the real Svelte compiler** (`parse` from `svelte/compiler`) and
comparing each component's `$props()` object pattern against the attributes of every call site.

253 components have a closed prop list (no `{...rest}`). **8 call sites pass something undeclared:**

| Call site | Component | Undeclared | Verdict |
|---|---|---|---|
| `sections/RecorderEditor.svelte` | `TransportSyncCells` | `control`, `section` | root's finding, confirmed independently |
| `sections/SurfaceDockInspector.svelte:271` | `NumberCell` | `title` | **real, minor** |
| `sections/SurfaceDockInspector.svelte:281` | `NumberCell` | `title` | **real, minor** |
| 5 others | — | `this` | false positive — `<X this={…}>` is dynamic-component syntax |

The two `NumberCell` sites pass
`title={multiSelectionActive ? 'Resize one layer at a time — a group width has no single meaning' : undefined}`.
`NumberCell` declares `{value, step, min, max, label, defaultValue, disabled, onchange}` and no rest
spread, so the sentence explaining why the field is greyed out never reaches the user. The disabling
itself works; only the explanation is lost.

**Not fixed — `NumberCell.svelte` is root's file.** The fix is either accepting `title` there or
wrapping the caller in a titled element.

Worth noting the method: three hand-written parsers produced 84, 166 and 592 "findings", all of them
artefacts of my own regex (comments inside `$props()`, assignments inside `{(v) => x = v}`, values
mistaken for shorthand). Using the compiler's own AST gave 8, of which 3 are real. The lesson is the
same one as the false positives below: parse with the thing that owns the grammar.

### Rendered interactions — `browser-checks/musicModulationRuntime.mjs`

```
ok  19/19 stateful components mount and occupy space
ok  a sequencer pattern edit reaches the document and reads back
ok  19/19 renderers redraw when a real property of their own section changes
```

The third check is the one worth having: a renderer that mounts but ignores its model is the real
risk. The property to change is **derived from the type's own section at runtime** rather than named
in a table — a named path proves nothing when it turns out not to exist, which is exactly how the
first version produced nine false negatives.

Two behaviours it had to learn, both correct and both initially read as failures:

- `phase` is a **0..1 loop clock** (`sectionDefaults.js:1154`), so `+1` lands on the same point of
  the cycle and redraws nothing. It moves half a turn instead. This accounted for 3 of the 9.
- `running` is documented "animate in preview / player": on the static edit canvas a stopped
  simulation is identical to a running one at rest, so Kinetic is an explicit expected exception.

### False positives this round

| Probe | What I got wrong |
|---|---|
| 3 hand-written prop parsers | Comments, inline assignments, and `name={value}` misread as shorthand |
| 9 renderers "inert" | 8 of 9 property paths were invented; they do not exist on those sections |
| 3 phase renderers "inert" | `+1` on a cyclic 0..1 clock is a no-op |

### Rendered pass, completed

```
ok  19/19 stateful components mount and occupy space
ok  a sequencer pattern edit reaches the document and reads back
ok  19/19 renderers redraw when a real property of their own section changes
ok  14/14 starter packages instantiate, reach the panel and draw
```

The starter-package check needed three corrections, all mine and all the same shape — an assumption
about an API or the DOM, written before reading it:

- the sheet is **sparse on disk**, so a control must go through `deserializePanel` before the
  package API can read it;
- an already-built control goes in through `addCustomComponentPackage`, not `addControl`, which
  takes a TYPE STRING and answers `Unknown component type: [object Object]`;
- "did it draw" cannot be asked with a selector naming `svg`/`canvas`: custom components draw with
  `div.interactive-part`. The check now counts descendants with a non-zero bounding box, which no
  markup choice can fool. Before that it called twelve perfectly good components blank.

Running total across six rounds: **10 false positives, 3 confirmed defects.** Recorded because the
ratio is the honest measure of this pass — every one came from writing the predicate before reading
the contract, and every one was caught before it reached a report.

---

## Round 7 — real gestures, and the adoption rules

### C-4 (fixed) — a malformed profile range adopts NaN as the control's range

`utils/parameterAdoptionRules.js`

```js
const min = Number(parameter?.range?.min ?? 0);
```

`??` substitutes for null and undefined only, so a range that is **present but not a number** goes
straight to `Number()`:

```
{"min":"abc","max":"def"}  ->  Behavior.min = NaN   Behavior.max = NaN
{"min":[],"max":{}}        ->  Behavior.min = 0     Behavior.max = NaN
```

Profiles are external files — nine ship in `CE/profiles`, users add their own, and DPD generates
more — and **nothing on the load path checks the type of a range**: no validation in
`DeviceProfileService.cpp`, none on the JS side. A single typo therefore poisons every value the
adopted control maps afterwards, and unlike the response-curve case this is the control's *core*
range rather than a curve point.

Fixed with a finite check falling back to the same 0/127 a **missing** range already used. Numeric
strings still adopt exactly — `{min:'12',max:'80'}` is a legitimate profile and still yields 12/80.

`test/parameterAdoptionRules.test.js` — 7 tests, **2 fail against the unfixed file**. They also pin
the two regressions the module's own header records (a `BPM` unit surviving a rebind to a unitless
parameter; `+64` surviving a rebind away from a bipolar one), so the documented "rebind, not merge"
rule is now enforced rather than described.

Same root cause as C-1, in a different file: `??` does not catch a value that is present and wrong.

### C-5 (fixed) — every Timbre AND Constellation drag threw and lost the edit

`editor/PanelPreviewSurface.svelte:7148`

```js
if (timbreDrag && activeControl) {
  timbreDrag = null;              // cleared one line too early
  releaseTimbreDrag(activeControl);
}
```

`releaseTimbreDrag` reads `timbreDrag.kind` as its first statement (`:2396`), on the value that was
just nulled. The guard is right; the clearing is one line above where it belongs.

Every completed Timbre Space drag therefore throws
`TypeError: Cannot read properties of null (reading 'kind')` on pointer-up **and silently loses the
edit** — the throw precedes `updateControlProperty(id, 'Timbre.x'/'Timbre.y', …)` at `:2401–2402`
and the session cleanup at `:2405`, so the puck snaps back and stale `timbreX`/`timbreY`/
`timbreDrag` keys stay on the session. `:6668` guards the same variable correctly, which is what
makes this read as a slip.

**It is two components, not one.** `releaseConstDrag` (`:2786`) has the identical defect: the
pointer-up handler at `:7167` nulls `constDrag` and then calls a function whose first statement
reads `constDrag.kind`. So a Preset Constellation star or probe drag threw and lost its position
too.

Three other release functions looked the same to a grep — `orbitDrag`, `routerDrag`,
`constraintDrag` — and are **not** affected: the match was a session KEY NAME in a string literal
(`orbitNodes`, `routerCurve`, `constraintDrag`), not a dereference. `releaseTuringDrag` never reads
its variable at all.

Fixed by passing the drag in as an argument rather than reading the module variable, so the call
order cannot break the function again, plus an early return if it is ever absent.

Found by a **real pointer gesture**, not a model write — the model path is fine; the pointer path
into it is broken. That is the coverage direct edits cannot reach.

### The gesture regression, and what it took to aim it

`browser-checks/musicModulationRuntime.mjs` now presses the handle's **own rendered position**
(`svg.timbre circle[r="9"]`, `svg circle[r="14"]`) rather than a fraction of the control. Two things
a generic drag would never have found, both of which made the first attempts prove nothing:

- the renderer's `<svg>` is **`pointer-events: none`** — the preview surface takes the pointer and
  converts it itself, so aiming at the SVG's own hit area is meaningless;
- pointerdown and the first pointermove **in the same frame are treated as one event** and no drag
  starts at all. The press needs a settle before the move.

Verified as a regression test: with the fix reverted it fails with the exact
`TypeError: Cannot read properties of null (reading 'kind')`.

### Open question for root, not filed as a defect

Adoption clears stale fields **within** a type branch but not **across** one. Rebinding a Knob from
a float parameter to a boolean leaves `Behavior.min/max/unit/displayMin/displayMax/showSign`
behind; choice→numeric leaves `Value.rows`; action→numeric leaves `Behavior.buttonType/subtype`.
24 such pairs.

The header's rule ("adoption is a REBIND, not a merge") argues these should be cleared too, but the
sentence sits inside the numeric branch and may only ever have meant that branch. I could not
demonstrate a user-visible symptom — nothing obvious renders `Behavior.unit` for a non-numeric
control — so it is recorded as a question rather than a bug. Root owns the adopt entry points.

### Probed clean — `customComponentClipboard`

Against its documented contract: pasted names never collide with existing ones or with each other
across 25 repeated pastes; a zone following a pasted part re-points at the copy while a zone
following a part **outside** the payload is correctly left alone; z-index climbs above the
destination's top and is unique per part; offsets are applied; parts arrive unlocked.

Latent only: `buildPastePatch({parts:[null]})` throws. Unreachable — the sole producer filters with
`.filter(Boolean)` (`CustomDesignSurfaceEditor.svelte:2362`).

### Gesture pass, stated honestly

```
1/8 controls changed their own model from a real pointer drag
```

**Only Timbre is a confirmed defect.** The other six that did not move — StepSequencer, Envelope,
DrumPads, Keyboard, NoteRibbon, Orbit — are most likely my generic 30%→60% horizontal drag landing
outside their interactive regions, not bugs. They are not reported as findings and each needs a
gesture shaped for it before anything can be claimed.

Running total: **12 false positives, 5 confirmed defects** (4 fixed, 1 awaiting ownership).

---

## Round 8 — the six gestures shaped for their own components, and three packages

The previous round closed with six types unproven and an explicit refusal to call them defects. All
six now have a gesture aimed at the region the component itself decides, plus three multi-part
starter packages. Eight of the nine are green; the ninth is a defect and is committed failing.

Everything below is in `CE/web/browser-checks/musicModulationRuntime.mjs`, run against the real app
through Chromium — not a harness mount, and not a model write.

| Gesture | Interaction region, and how it was found | Result |
| --- | --- | --- |
| Envelope breakpoint | the node's own rendered circle (index 1, an interior node) | drag commits `Envelope.points` |
| Orbit satellite | the satellite's own circle, with `running: false` first | drag commits `Orbit.nodes` |
| Drum pad strike | the pad's own rect, **index 1** | note-on 36 ch10, note-off on release, `drumHits` empties |
| Ribbon Keyboard touch | a zone rect from the strip | note-on, note-off on release, rail cleared |
| Step Sequencer cell | `cellRect(sequencerGeometry(…))` over the designer stage | lights on the click, out on the next |
| Dual Slider Switch | `sliderAZone` + `switchModeZone`, located by hover | `valueA` 0.25→0.28, `mode` A→B |
| Triple Value Slider | `mainZone`, located by hover | middle 0.5→0.61, min and max untouched |
| Tab Group | a **generated** tab zone, located by hover | `tab` one→two |
| Keyboard key | `keyboardNoteAt` over the key's own rect | **FAILS — C-7** |

### How the multi-part packages were aimed

Their hit zones are declared in percent, some are circles or rings, and the Tab Group's do not exist
in the authored document at all — a generator makes one per tab at run time. So nothing here reads
bounds. The preview surface writes `hoveredCustomHitZone` as the pointer moves, so the check hovers
an 11×11 grid and lets the app name the zone under each point. That locates authored and generated
zones by the same mechanism, and it is the app's own hit test doing the locating.

### Note emitters: the document is the wrong evidence

A Drum Pad, a Ribbon Keyboard and a Keyboard never write the panel, so "did something change?" is
satisfied by nothing at all. Each is asserted on four things instead: a note-on on
`noteOutputEvents`, a held mark in the preview session, a matching note-off on release with the held
set empty again, and the control's serialised document **unchanged**.

`noteOutputEvents` is one funnel for the whole panel. A running ChordPad on channel 1 at velocity 96
was sounding during this work and would have been counted as the Keyboard playing. Every emitter is
therefore filtered to notes its own model could have produced — the pad map, the ribbon's zones, and
for the Keyboard `keyboardPress`'s exact note, velocity **and** channel.

### C-6 — a properties-panel "open in dock" button opens nothing

`OpenInDock` is the only advertised way into the Designer tab from the properties panel. It calls
`activateEditorTarget(…)` and `displayTabRequest.set({ tab })`. `App.svelte:261-265` holds an
`$effect` whose entire purpose is to open the dock when that request appears:

```js
$effect(() => {
  if ($colorTarget || $gradientTarget || $displayTabRequest) showDisplayPanel.set(true);
});
```

It does not fire in time. `DisplayPanel.svelte:188-193` consumes and clears the request first, so the
parent's effect never observes a truthy value. Measured on a fresh profile:

```
before          { show: false, req: null,  areaH: 0   }
after request   { show: false, req: null,  areaH: 0   }   <- displayTabRequest.set({tab:'designer'})
after set(true) { show: true,  req: null,  areaH: 430 }   <- showDisplayPanel.set(true)
```

The dock ships **closed** (`panelVisibility.js:31`, `DEFAULTS = { tree: true, display: false,
properties: true }`), so this is the default state, not an edge case. The editor target does arm, so
the tab is correct the moment the dock is opened by hand from the icon rail — which is what the
Step Sequencer gesture now does, and why it needs to.

Scope: every `OpenInDock` button (designer, effects, assets, screen, api, library, animation), plus
`CanvasContextMenu`'s Align and `DeviceBindingsEditor`'s "Configure ports" / "MIDI learn".

Not fixed here — reported to root, who reads it as a test-only concern. Recording the disagreement
rather than arguing it: the fact this rests on is that App.svelte contains an effect written to open
the dock on a tab request, and that effect never runs. Whether the button *should* open the dock is
the owner's call; whether the code that says it does works is not a matter of opinion.

### C-7 — the Keyboard is a picture (confirmed, committed failing)

`keyboardLayout.js` exports the whole interaction: `keyboardNoteAt`, `keyboardPress`,
`keyboardHold`, `keyboardGlide`. **Nothing in `src/` imports any of the four.** The preview surface's
pointer-down dispatcher has a branch for twenty-six control types and none for the Keyboard, and
`KeyboardRenderer` draws held keys from `previewSession.keyboardHeld` — a session key nothing
anywhere writes.

Measured, not inferred. Pressing the first white key at the position the component's own
`keyboardNoteAt` calls note 48:

```
session.pressed       true      <- the press reaches the control
notes sounded         []        <- nothing plays
session.keyboardHeld  undefined <- the renderer is never told
```

It is the same shape the Designer tab's own header records for the Step Sequencer: the layout module
had the hit test and the writers all along and nothing imported them.

The regression asserts the **correct** behaviour — note 48, channel 1, velocity 100, note-off on
release, `keyboardHeld` carrying the note and then empty — so wiring the surface turns it green with
nothing to remember to invert. Root owns that wiring.

### False positive 13 — `rect[rx="6"]` is also the header

The first drum-pad gesture reported "pressed, but nothing is held". The pad bodies carry `rx="6"`;
so does the header strip, and the header is first in document order. Index 0 was never a pad. The
note-on that made it look like a partial failure came from elsewhere on the panel entirely.

Two lessons, both already on this page in another form: the note tap is panel-wide and needs
filtering to the control under test, and a selector is an assumption about markup until it is
checked against the renderer that writes it.

Running total: **13 false positives, 7 confirmed defects** — C-1 through C-5 fixed, C-6 reported and
disputed, C-7 confirmed and owned by root.

### Still untested, stated plainly

- The Keyboard's `latch`, `scaleLock` (`refuse` / `quantize`) and `glide` paths. There is no runtime
  to exercise them against until C-7 is wired; the unit tests in `test/remainingComponents.test.js`
  cover the functions, nothing covers them through a pointer.
- The eleven starter packages other than the three above. Mount and draw are covered for all
  fourteen; only these three have had a value or button gesture.
- Everything behind `#if JUCE_WINDOWS`, and the native GUI acceptance gate, which is blocked on the
  window-automation failure and is not mine.

## Integrated result — Codex verification after a85ecb06

The historical failing/disputed status above is superseded by the integrated checks. Codex
independently reproduced C-6 by clicking the actual properties opener with the dock closed, then
verified the fix that opens the dock before DisplayPanel consumes the request. C-7 is wired into
the existing note-output path; this entire music/modulation check now passes locally on Windows
Edge, including the originally failing Keyboard assertion.

Codex's additional full-App Keyboard tests cover white/black keys, glissando, latch chords, note
on/off, pointer cancellation, transpose/channel, exit cleanup, local key/scale, pentatonic refusal,
panel-key following and quantization. The note/velocity device-binding resolver also has a unit
regression. The combined Node suite passes 4,810 tests with zero failures/skips, and the complete
existing browser suite passes. Native dialogs/shutdown and physical hardware remain open acceptance
requirements; this is not release sign-off.
