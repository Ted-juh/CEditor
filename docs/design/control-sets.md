# Control sets — one design, every control

> Status: **phase 1 built, 2026-09-18** — see [What phase 1 shipped](#what-phase-1-shipped) at the
> end. The rest of this record is the idea as it was written the same morning, against the tree
> as it stood, in answer to a plain request: *it would be nice to have "sets" — designs for knobs, sliders, faders
> that belong to one set.* This record says what a set would have to be for that sentence to come
> true on this program, what in the tree it already stands on, what it costs, and where the open
> source world has solved the same problem. Companion to
> [`open-source-landscape.md`](open-source-landscape.md), whose findings it leans on.

## The sentence, unpacked

A panel author today picks a knob, then a slider, then a button, and colours each one. Three
controls, three sets of decisions, and nothing in the program knows they were meant to match. If the
author later decides the panel should be brushed aluminium rather than black plastic, that is every
control again, one at a time.

A **set** is the thing that knows they match. It is one visual language, decided once, that every
control on the panel draws from: the same body material, the same cap shape, the same indicator
style, the same track, the same label typeface, the same accent, the same way of glowing when
touched. Pick a set and a knob, a fader, a toggle and a meter all belong together. Switch sets and
the whole panel changes at once, and still belongs together.

The nearest things people already know: a *skin* in Surge XT, a *theme* in Godot, a *look-and-feel*
in JUCE, a *component library* in VCV Rack (every module by one author has the same knobs, ports and
switches because they come from one SVG family), a *variant set* in Figma. Each of those is this
idea for a different program, and each one is examined below for the part of it worth taking.

## Three layers, or it does not work

The trap is to build a set as "a folder of knob pictures". A folder of pictures matches nothing to
anything; it is the author's job again to pick the right picture for each control. A set has to be
three things stacked, and the bottom layer is the one that makes the others cheap.

### Layer 1 — tokens: the decisions, named

A set is first a small dictionary of named decisions. Not hues — *roles*:

| Group | Tokens (sketch) | Today, in the tree |
|---|---|---|
| Colour roles | `surface`, `surface.raised`, `control.body`, `control.cap`, `control.track`, `control.track.fill`, `control.indicator`, `accent`, `accent.hot`, `text.primary`, `text.muted`, `border`, `glow` | Literal ARGB strings in every Part and State: `'Background.Fill.colour': 'FF71B8F1'` |
| Material | `material`: flat / plastic / brushed / glass / rubber — a recipe of gradient, highlight and grain, not a picture | Per-control gradients in the Gradient editor |
| Shape | `radius`, `cap.shape` (round / skirted / chicken-head / d-shaft), `pointer.style` (line / dot / notch / none), `track.thickness`, `thumb.shape` | Per-control Parts geometry |
| Typography | `label.font`, `label.size`, `label.case`, `value.font` | Typography tab, per control |
| Elevation | `shadow.rest`, `shadow.raised` as layered shadow stacks | Effects tab, per control |
| Motion | `duration.fast`, `duration.slow`, `easing` | `easingTables.js`, per animation |
| State deltas | hover / pressed / dragging / focused / disabled, each as *token overrides* rather than literal colours | `createStatesDefaults()` writes literal colours per state |

The last row is the important one. Today a Slider's Dragging state says *"make the fill
`FF71B8F1`"*. Under a set it says *"make the fill `accent.hot`"*, and `accent.hot` is whatever the
set says it is — which is how one set of state rules can serve a black set and a cream set without
being written twice.

### Layer 2 — family designs: what each control does with the tokens

A knob and a fader do not share geometry, so a set is not one design; it is one design **per
ready-made family**, all drawing from the same tokens. The ready-made families already exist as
Parts + States + Animations trees (`interactionDefaults.js`): the Slider/Knob family with its
`bodyTrackFill`, `pointerCurrent`, `labelValue` parts; the button family; meters; displays. A set
supplies, for each family it covers:

- the Parts geometry and layering for that family (a skirted knob has a skirt part; a flat one does
  not), with every colour a token reference;
- the state rules, as token overrides;
- optionally, assets: a filmstrip or SVG for the cap, a texture for the body — for sets that are
  drawn rather than composed.

A set need not cover every family. It declares what it covers; the program shows a coverage matrix
(families × sizes × states) and falls back to the base set for anything missing, the way Godot's
theme resolution walks from the control's own overrides to its type, to its base type, to the
default theme. Partial sets are normal; "a knob set" is a legitimate thing to publish.

**Sizes are part of the design.** A 40px knob is not a shrunk 100px knob: the pointer gets thicker,
the label drops off, the skirt goes. A family design carries size classes (small / medium / large,
with the breakpoints the set chooses) or a rule for deriving them. This is the part filmstrip-based
sets cannot do gracefully, and the coverage matrix should say so rather than scale a bitmap.

### Layer 3 — the package: a set as a shareable thing

A set is a file with a name, a version, an author, a licence, a thumbnail, a coverage matrix and a
fingerprint. That envelope already exists: it is the custom-component package envelope
(`customComponentPackage.js`: metadata, licence, thumbnail, fingerprint, readiness, the "instance
drifted from source package" card). A set is the same envelope around a different payload.

It lives in the same two places card presets do, for the same reason `cardPresets.js` gives: in the
user's **library** (reusable across panels) and in the **panel document** (so a shared `.cepanel`
arrives with the set it was designed in). Document wins on collision.

## How it binds: the link, the override, the reset

The mechanism that makes this a set and not a preset is a **token reference** where a literal used
to be. A Part property may hold `'FF71B8F1'` or `{ token: 'accent.hot' }`. The renderer resolves
references against the panel's active set at draw time; the properties panel shows a linked chip
next to a bound value.

Three operations, all of which Figma, Penpot and Godot users already expect:

- **Override.** Type a colour into a linked field and the link breaks *for that instance and that
  property*. The chip changes to "overridden"; everything else on the control still follows the set.
- **Reset to set.** The arrow beside an overridden field puts the link back (Godot's revert arrow;
  the inspector already has a preset footer per card, which is the right place for it).
- **Detach.** Bake every token on this control to literals, so it survives the set being deleted.
  This is the same operation as `applyLibraryEntryToCurrent` today, with a different name.

Overrides are stored on the instance as a small map, not as a copy of the set. That is what keeps
"switch set" honest: overrides survive the switch (the author said *this* knob is red, and it stays
red), and everything not overridden follows the new set.

**Scope.** One active set per panel is the 90% case. A container may name its own set for its
subtree — a mixer strip in one style inside a panel in another — and a set may be applied to a
selection as a one-off, which is "detach after resolving against set X" and needs no new mechanism.

## What it stands on

Most of this is wiring. The table is the point.

| Asset | Where | What it gives |
|---|---|---|
| Parts / States / Animations trees per family | `models/interactionDefaults.js` | The family designs already exist; they carry literal colours instead of token references |
| Card presets, library + document, document wins | `stores/cardPresets.js` | The storage and merge model, already argued and built |
| Custom-component package envelope | `utils/customComponentPackage.js` | Metadata, licence, thumbnail, fingerprint, readiness, drift card |
| Variants | `sections/CustomVariantsEditor.svelte` | Named alternative appearances on one component — a set's per-family design is a variant chosen by set rather than by hand |
| Assets: images, filmstrips, Generate Filmstrip | `components/assets/`, `CustomAssetsEditor` | Bitmap sets |
| Palettes, swatches, colour target | `stores/palettes.js`, `colorTarget.js` | A palette is half a token dictionary already: named, persisted, shared |
| Component families | `models/componentFamilies.js` | "Which types share one engine" is exactly "which types share one family design" |
| Panel templates | `models/panelTemplates.js` | Where a set's specimen sheet would live |
| The retired roadmap line | Custom Component creator plan §12 (git history), "theme tokens" | This idea was on the list once and did not land; the reason is worth reading before starting |

## Authoring a set

Two ways in, and the second is the one that makes adoption possible.

**1. The specimen sheet.** A set editor is not a new surface. It is the existing designer and
properties panel over a generated panel that shows one of every covered family, at every size
class, in every state, side by side. Edit a token and every specimen changes; edit a specimen's part
and it edits the set's family design. "Save as set" writes the package. This is the Godot theme
editor's preview strip and the Storybook "all states" story, and it is mostly `panelTemplates.js`
plus a states-forcing toggle.

**2. Extract a set from an existing panel.** Every panel in existence today is literal colours. An
extractor walks a panel, clusters the literals (OKLCH distance — `culori` does this), proposes a
token per cluster with a guessed role from where it was found (fills on tracks become
`control.track`, on pointers `control.indicator`, on hover states `accent.hot`), and offers to
rewrite the literals as references. The author renames roles, merges clusters, accepts. Their panel
is now on a set they can share, and the migration problem is a button rather than a project.

And the cheap trick both enable: **derive a set from two colours**. Given `surface` and `accent`, a
perceptual colour library can generate the remaining roles and every state delta by lightness and
chroma steps (Radix Colors publishes exactly such twelve-step scales). "Steal a colour scheme from a
photo" (`product-ideas.md` §2) plus this is: drop a photo of the synth, get a set that matches it.

## Sharing

A set is the most shareable artefact this program can produce: it is small, it carries no MIDI, no
device, no scripts, and it is useful to somebody who owns a different synth entirely. It is the
natural first thing for a gallery — Patchstorage has a "request a platform" process, and a set is
one JSON file with a thumbnail. Which means the licence field is not optional: assets inside a set
(a filmstrip somebody rendered) need a licence the author can state, and the package's readiness
check should refuse to publish without one. KnobMan3D's sample knobs are CC0 and WebKnobMan's gallery
is a library of exactly the bitmap sets people will want to start from; the Synth Panels Designer
extension is where vector ones get drawn.

## What is awkward, honestly

- **Every existing document is literals.** Without the extractor this is a feature for new panels
  only. Build the extractor in the first phase, not the last.
- **States carry literals too.** Not just Parts — every `Hover`/`Dragging`/`Focused` node in
  `interactionDefaults.js` writes a hex string. The token pass has to go through the state rules as
  well, or the moment a control is touched it flips back to the old blue.
- **Bitmap sets do not recolour.** A filmstrip is fixed pixels. A set has to declare whether it is
  *tintable* (composed from parts; tokens apply) or *fixed* (bitmap; tokens apply only to the parts
  around it — labels, tracks, glow). Mixed sets are normal and the coverage matrix should show which
  is which. Recolouring a bitmap by hue rotation is a cheap partial answer and should be labelled
  as one.
- **A set is N designs.** The honest scope is one family design per ready-made family that
  matters: knob, linear slider, circular slider, range, button, toggle, combobox, meter, the two
  displays, label. That is ten designs to ship a *complete* set, and completeness is what makes the
  demo moment work. Partial sets are fine to publish; the *default* set must be complete.
- **Size classes double the work** for vector sets and are impossible for bitmap ones. Decide the
  breakpoints once, program-wide, so every set means the same thing by "small".
- **Set updates versus instance overrides** is the drift problem the Custom Component designer
  already has and already only mentions (`product-ideas.md`, the card that says "edited since
  source package load" and does nothing). Pull, push and detach have to exist for sets, and if they
  are built for sets first they will be built for custom components at the same time, because it is
  the same code.
- **Export.** The exported plugin should ship resolved values, not a resolver — the player has no
  business looking up tokens per frame. Resolve at export; keep the set in the `.cepanel` for the
  editor. If runtime set-switching is ever wanted (a light/dark stage panel), that is a deliberate
  second step, and it is what CSS custom properties are for.
- **Custom components** need a way in: a published property may declare a token slot
  (`'Background.Fill.colour' ← control.body`), so a community component *participates* in whatever
  set the panel uses instead of arriving in its own colours. Cheap, and the difference between a
  library of components and a library of components that match.
- **Package size.** A vector set is kilobytes. A bitmap set with a filmstrip per family per size is
  megabytes, and the package format already warns at 2 MB per asset and 8 MB per package. Sets
  should inherit those warnings.

## Prior art, and the piece of each worth taking

| Where | What it is | Take |
|---|---|---|
| **Godot `Theme`** (MIT) | A resource of per-control-type overrides (colours, fonts, styleboxes, icons, constants) with *type variations* and a fallback chain to the default theme; a theme editor with a live preview strip | The resolution chain, the per-type variation idea, and the editor-as-preview-strip |
| **JUCE `LookAndFeel`** | Named colour ids per component class, resolved up a hierarchy; one object restyles an app | The colour-id-per-role idea, which is the token dictionary |
| **VCV Rack component library** | One SVG family of knobs, ports, switches and lights that every module shares; a panel is drawn with placeholders and the family fills them | A set as a *family of drawings* with a placeholder convention; the `helper.py` colour-coded import |
| **Surge XT skins** (GPLv3) | XML: global colours by name, per-control image and geometry overrides, inheritance between skins | Named colours plus per-control overrides plus skin inheritance, in one file; also the evidence that users will make dozens of these |
| **Figma / Penpot variants** (Penpot MPL-2.0) | A component set with variant properties; instances follow the main; override, detach, reset | The three operations, and the expectation that they exist |
| **Design Tokens (W3C community group format), Style Dictionary** (Apache 2.0) | A JSON format for exactly this dictionary, with aliases (`accent.hot` → `{accent}` + delta) and a build tool that emits CSS, JSON, or anything | Do not invent the token file format |
| **Radix Colors / Open Props** (MIT) | Twelve-step perceptual scales with paired light and dark, designed to be swapped | The "derive a set from two colours" rule |
| **culori / color.js** (MIT) | OKLCH, gamut mapping, distance | Clustering for the extractor; state deltas by lightness |
| **KnobMan3D (MIT, CC0 samples), WebKnobMan gallery, StripKit (MIT)** | Bitmap knob families and the tools that render them | Where bitmap sets come from, and a "generate this set's filmstrips" button |
| **Open Stage Control themes** (GPLv3) | CSS custom properties per widget class | The runtime-switchable variant, if it is ever wanted |

## Phases, and where to stop

1. **Tokens and the resolver.** A token dictionary on the panel document, references allowed
   wherever a colour is today, resolution in the renderers, the base set expressed in tokens, and
   the state rules rewritten as token overrides. No new UI beyond the linked chip. **Deliverable:**
   switch between two built-in sets and watch every ready-made control change together. This is
   the demo, and it is most of the value.
2. **The extractor and the specimen sheet.** Existing panels can join; new sets can be authored
   without editing JSON. Override, reset, detach on the inspector.
3. **Packages and sharing.** The envelope, library + document storage, coverage matrix, licence
   gate, bitmap sets, size classes, custom-component token slots, pull/push for updates.

Stop after any phase and the program is better than before it.

**Cost.** Phase 1 medium: the resolver is small, the sweep through `interactionDefaults.js` and the
renderers is wide but mechanical. Phase 2 medium. Phase 3 is where the drift machinery gets built,
which is work the custom-component side owes anyway.

**The line:** *choose once; every control agrees.*

## What phase 1 shipped

Built the same day, on the plan above, with one deliberate departure.

- **The dictionary** is `CE/web/src/CE_Application/models/controlSets.js`: forty colour roles
  (`surface`, `control.track`, `control.cap.hot`, `accent`, `text.muted`, …) and three built-in
  sets — **Graphite**, which reproduces colour for colour what every ready-made control looked like
  before sets existed, and **Ember** and **Ivory**, which exist so that switching has something to
  switch to. A set value may alias another token (`'control.fill': '{accent}'`).
- **The reference form is a string, not an object.** The sketch above says `{ token: 'accent.hot' }`;
  what shipped is `'{accent.hot}'`, the alias syntax of the W3C Design Tokens format this record
  already points at. Every colour consumer in the tree is string-typed (`cssColour`, `hexToRgba`,
  the `.slice(-6)` in a dozen swatches) and every one has a fallback for a string that is not hex;
  an object would have thrown in all of them. And `shrinkControl` diffs against the type defaults
  with plain equality, which a string satisfies for free. The resolver only looks at keys that name
  a colour (`colour`, `underlineColour`, `'Background.Fill.colour'`), so a Label whose content is
  literally `{value}` stays `{value}`.
- **Every ready-made family is written in tokens**: the Slider/Knob anatomy in
  `utils/sliderEntityFactory.js`, the Number and Range parts and every family's state rules in
  `models/interactionDefaults.js`, the button family's states and the Combobox/Listbox/TextInput
  bodies in `models/componentTypes.js`, and the root `Background` fill and `Text` fill every control
  starts from in `models/sectionDefaults.js`. The displays (LCD, oscilloscope, the screens) keep their
  literals: they are fixed dark glass, and whether a light set should recolour them is the coverage
  matrix's question, not this phase's.
- **Resolution happens once, where a control enters the renderer.** `CanvasControl` renders the
  resolved tree and keeps the document's tree for edits; the preview surface (and so the Player)
  hands its panel's set down through Svelte context, the editor canvas takes the active panel's.
  Copy-on-write: a control without references is the same object it always was, so an existing
  document costs a walk and nothing more, and a set switch repaints only what changed.
- **The document** carries `controlSet: { id }` on the "right or absent" rule the rest of the file
  uses — a panel on Graphite writes no key, so every `.cepanel` from before round-trips byte-identical.
  An id this build does not know is kept and written back; the panel renders in Graphite meanwhile.
  The build payload is **baked** to literals against the panel's set, because the player has no
  resolver and the exported plugin's reader has never heard of a set.
- **The UI is the picker and the chip**, as the phase said: a *Control set* section on the panel
  card's Background tab, and a small token chip under a linked colour field in the Background and
  Text editors. Clicking a linked swatch opens the chooser at the colour the set gives it; what the
  chooser writes back is a literal — which is exactly *override* as defined above. *Reset to set*
  and *detach* are phase 2.
- **Tests**: `CE/web/test/controlSets.test.js` — completeness of every built-in set, Graphite's
  fidelity to the old literals for every family, copy-on-write, the unknown-token fallback, the
  document round trip, export baking, and the store.

What phase 1 did *not* do, so nobody looks for it: the extractor (existing literal-colour panels do
not join a set until phase 2), material / shape / typography / motion tokens (colour roles only), and
per-panel token overrides. Every existing document renders exactly as before.

## What the pilot shipped

Three sets, one per tier of what a set can be, chosen from the thirty mockup boards to prove the
whole path from a file to the picker to the redraw before the other twenty-seven follow:

- **Ivory** — colour only. It was already built in; the pilot makes it a *file*.
- **Tolex** — colour plus what a knob and a button *are*: a gold skirt, a cream cap with a black
  chicken-head, cream pushbuttons with dark legends, paper value fields, black tolex behind it all.
- **Machined** — colour, parts and a *lit material*: bead-blasted caps with a painted line, buttons
  milled from the same billet, a brushed combobox, a bead-blasted plate, one lamp.

**A set is a file.** `<name>.ceditor-controlset.json` (`models/controlSetPackage.js`): the same
envelope idea as a custom-component package — format id and version, metadata a person reads
(name, version, author, licence), a fingerprint of the set so "changed since import" is answerable,
and the set. `CE/sets/` holds the three pilot files, generated from the definitions in `models/` by
`scripts/export-control-sets.mjs`; the test suite reads them back and refuses a stale one. The panel
card's *Control set* section gained *Import set…* (a browser file input, into the library and the
open panel), *Export set*, and *Keep in library* for a set that arrived inside somebody's panel.

**Where a set lives** is the card presets' answer (`stores/controlSetLibrary.js`): the user's
library in localStorage, and the panel document (`panel.controlSets`) so a shared `.cepanel` arrives
with the set it was designed in. Lookup is document, then library, then built-in — an imported set
with a built-in's id wins over the built-in, which is what "I exported Ivory, changed it, imported it
again" should mean. Choosing a library set copies it into the document at that moment, so the
Player and the build, which have no library, still find it. Opening a file never grows the library.

**Beyond colour: the family patch** (`models/controlSetFamilies.js`). `set.families[type]` names
properties and values per control type — `component` paths from the control's sections, `parts`
paths per part, `addParts` for whole parts the family adds. The binding rule is the one this record
argued for and calls *"the set is the defaults the document diffs against"*: a patch value applies
only where the control still holds its **factory default** for that property. An author who typed a
radius or a colour keeps it; everything they left alone follows the set; a set switch redraws every
control and keeps every deliberate edit; nothing is written into the document. It is the `.cepanel`
diff-against-defaults idea applied at draw time, copy-on-write like the token resolver, and it runs
before the token pass because a family patch may write references. The build bakes both.

**What the knob gained** to have something to patch: a `bodyCap` semantic part — a disc under the
pointer, invisible by default so every existing knob keeps drawing its arc-and-dot — sized as a
percentage of the track's diameter so one set fits every knob size; and a `kind` on `pointerCurrent`
(`dot`, the original; `line`; `chicken`), the last two drawn from the centre out along the value
angle, over the cap. Circular geometry only.

**The lit material** (`utils/materialFilter.js`, `CE_Panel/components/MaterialFilter.svelte`) is
the mockup generator's filter, ported: fractal noise read as a height map by one distant lamp, the
light multiplied onto whatever the surface paints, a specular pass for the finishes that shine,
clipped to the surface's own alpha. Six recipes — blast, brushed, leather, hammer, rubber, glass —
behind `Effects.Material` (finish, relief, shine, grain), on the Effects tab like Bevel. It lights a
*surface*: a background, a fill layer, a border, a part; never the whole component, so text is not
lit as if embossed. **One lamp:** a material normally follows the set's `lamp`, put in Svelte
context by the surfaces that render a panel, so a knob, the button beside it and the panel behind
both are lit from the same side; a surface can pin its own. The panel's solid colour takes the set's
material and, while it still wears the default colour, the set's colour.

**Verified** by `test/controlSetPilot.test.js` (the file round trip, the lookup order, the library
and document stores, the patch rule against an edited knob, copy-on-write, the filter maths, the
bake) and by a picture: `browser-checks/controlSetShot.mjs` renders one specimen panel under every
set through the Player's own surface and writes a PNG per set. The picture is what caught the first
real bug — the new cap part rendered twice, once by the generic part renderer on top of the knob —
which no structural check could have seen.

What the pilot did *not* do: reset-to-set and detach on the inspector, the extractor, size classes,
bitmap sets, a per-panel lamp or material override in the UI, a fader-cap shape for linear sliders,
and any of the interaction-state boards (the physical Hover / Pressed / Dragging). The knob's arc is
still small in its box — an existing floor in the circular metrics, not a set's doing.
