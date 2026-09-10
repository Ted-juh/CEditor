# What could go in the display panel

Status: **a worklist.** Candidates 1 to 4 are built — Effects, Typography, Assets and Screen are
dock tabs now, each with its own design record. Nothing is removed from the properties panel yet. The
rest of the list is for working through one entry at a time — is it worth it, and what does it look
like.

Companion to [`property-panel-space-plan.md`](property-panel-space-plan.md), which has the argument
and the triage rule. This document is the inventory it implies.

## How the list was built

Every `<PropertySection>` in `CE/web/src/CE_Application/sections/` and `panels/` was parsed, its
cells packed four columns wide by their `span`, and its rendered height computed from the stylesheet
(11px label + 2px gap + 26px field = 39px per cell; 6px row gap; 12px grid padding; 26px section
header). That gives **214 distinct section titles across 285 instances, 44,887px in total**.

Then grouped by title and ranked by height **per owner**, which turned out to matter more than the
total — and produced the first useful result, which was a negative one.

### The most repeated sections are already solved

`Appearance` appears in 19 editors and `Colours` in 5. Between them that is the most duplicated
shape in the application — and it is not a candidate, because it is already the success case. Both
are a `SwatchCluster`, which is used **53 times across 35 files** and already does exactly what this
document is about: clicking a swatch calls `activateColorTarget` and `displayTabRequest`, and the
dock's Colors tab does the picking. Each instance is about 89px in the panel.

So the pattern works and is widely adopted. The remaining height is somewhere else.

### Where the height actually is

**166 of the 214 titles — 235 instances, 27,410px — are under 200px per owner.** Those are five or
six settings in a row and they are fine. Leave them alone.

The height is concentrated in a few tall sections, and that is what the list below covers.

## The list

Ordered by how strong the case looks. The **Space** column is measured; the **Shape** column is the
proposal to argue about.

| # | Candidate | Owners | Space | Verdict |
|---|---|---|---:|---|
| 0a | Colours | 53 call sites | — | **shipped** |
| 0b | Gradient | 3 sections + call sites | — | **shipped** |
| 1 | Effects | Text, Effects, Display, PixelDisplay | 1,902px | **built** |
| 2 | Typography | Text | 1,163px | **built** |
| 3 | Assets (images, filmstrips) | CustomAssets | 1,073px | **built** |
| 4 | The screen (LcdDisplay, PixelDisplay) | 2 | 3,814px measured | **built** |
| 5 | Published API | CustomPublicProperties, CustomPublishedProperties | 1,343px | strong |
| 6 | Component library | CustomPackageLibrary | 842px | medium |
| 7 | Image / Texture layers | Background, Text, PanelCardContent | ~890px | medium |
| 8 | Animation | Animations, Display, PixelDisplay | ~870px | medium |
| 9 | Per-component designers | ~12 components | varies | medium, and the most interesting |
| 10 | Device bindings | DeviceBindings | 347px | weak |
| — | Everything under 200px per owner | 235 instances | 27,410px | **no** |

---

### 1. Effects — 1,902px over four owners

**Where it is now.** `Text` → Effects 1,067px (58 cells, the single tallest section in the app);
`EffectsEditor` → Component/Text/Icon Effects 321px; `Display` and `PixelDisplay` → Lighting 514px.

**Why it qualifies.** Every one of these controls changes how something *looks*, and none of them can
be judged without seeing the result. It is also the section the panel handles worst: 58 cells at four
columns is 23 rows of numbers with no indication of which effect each belongs to.

**Shape.** A row of effect cards — Outline, 2nd Stroke, Shadow, Glow, Inner, Emboss — each with its
own on/off switch and its three or four settings underneath, with a live specimen beside them. Four
cards fit across the dock at once. Drawn as plate 2 of
[`property-panel-space-mockups.html`](property-panel-space-mockups.html).

**Watch out.** An `effects` dock tab existed before, held the words "full editing coming soon", and
was deleted. `DisplayPanel.svelte` still carries the comment saying why. This tab has to do the
editing.

---

### 2. Typography — 1,163px on Text alone

**Where it is now.** `Text` → Font Settings 167px, Typography 167px, Multiline 167px, Flow 662px.
The `Font` section of the data model has 40 leaf fields.

**Why it qualifies.** A font is chosen by looking at it. There is no specimen anywhere in the current
editor, so choosing a family means setting it, looking at the canvas, and coming back.

**Shape.** Family list down the left, a specimen showing the control's own text in the middle, and
metrics (size, weight, tracking, line height, case) as a column on the right. Flow — reading
direction and glyph mirroring — belongs with it, since it is also judged by looking.

**Open.** Whether Multiline goes too. It is layout rather than type, and it may read better staying
in the panel.

---

### 3. Assets — 1,073px

**Where it is now.** `CustomAssets` → Images 347px, Filmstrips 212px, Generate Filmstrip 302px,
Filmstrip Setup 212px.

**Why it qualifies.** This is a media browser rendered as a four-column property grid. Images and
filmstrips are picked by looking at them, and a filmstrip in particular needs its frames laid out to
be checked — a mis-set frame count is invisible in a number field and obvious in a strip.

**Shape.** A thumbnail grid for images; for filmstrips, the frames laid out horizontally with a
frame-count readout and a scrubber. The generator settings sit beside the strip they generate.

**Note.** `customComponentFilmstripBaker.js` already produces the frames, so the preview data exists.

---

### 4. The screen — about 1,876px over two owners

**Where it is now.** `Display` is 2,107px and `PixelDisplay` is 1,818px, the second and third
tallest tabs. Between them: Screen 514px, Pages 636px, Lighting 514px, Motion 212px.

**Why it qualifies.** It is literally a screen, and its settings are describing what appears on it.
Pages in particular is a list of pages with no way to see them.

**Shape.** The simulated screen rendered at size, with the pages as thumbnails beneath it and the
screen settings beside it. `displayMaps.js` and `displayMode.js` already model this.

**Open.** Whether Display and PixelDisplay share one tab or get one each. They are different enough
(character grid vs pixel grid) that one tab may end up as two modes.

---

### 5. Published API — 1,343px over two owners

**Where it is now.** `CustomPublishedProperties` 1,465px and `CustomPublicProperties`: Published
Inputs 347px, Published Outputs 347px, Editable Properties 392px, API Preview 257px.

**Why it qualifies.** It is a table — name, type, range, direction, default, exposed — and a table in
a four-column portrait grid is the worst case for the panel. It also wants to be read as a whole,
because the question it answers is "what does this component expose", which is a list question.

**Shape.** A real table with sortable columns, inputs and outputs in one view, and the API preview
beside it rather than below.

**Connects to.** The publish gutter in the widget plan is the same information in a different place;
if both were built, the gutter is the glance and the tab is the edit.

---

### 6. Component library — 842px

**Where it is now.** `CustomPackageLibrary` — 33 cells in one section.

**Why it might qualify.** It is a browser of saved components with thumbnails, and it is currently a
property grid. `customComponentLibrary.js` already stores a `thumbnail` per entry.

**Why it might not.** It is a modal-ish task — you open it, pick something, and leave. A dock tab is
for things you keep open while working. Might be better as its own overlay than as a tab.

---

### 7. Image and texture layers — about 890px

**Where it is now.** `LayerEffectsSection.svelte` serves four call sites (Background ×2,
PanelCardContent ×2); `Text` has Image Geometry, Image Colour, Texture Geometry and Texture Colour at
77px each.

**Why it qualifies.** Already a shared parameterised editor, which is most of the work. Fit mode,
tiling and colour adjustment are all judged by looking.

**Why it is lower than it looks.** The individual sections are small; the win is consolidating four
owners rather than recovering height from any one.

---

### 8. Animation — about 870px over three owners

**Where it is now.** `Animations` 642px, plus the Animation section in `Display` and `PixelDisplay`
at 242px each.

**Why it might qualify.** Timing and easing are time-based and want a timeline. `ResponseCurveDesigner.svelte`
already exists and draws curves.

**Why it might not.** Much of the Animations editor is targets and triggers — which property, which
state — and that is list work, not visual work. This may split: the curve goes to the dock, the
wiring stays.

---

### 9. Per-component designers — the most interesting one

**What it is.** Twelve or so components have a section that is really a small editor: Arpeggiator
347px, Phrase Sequencer 482px, Zone Splitter 347px, Harmoniser 347px, Chord Pad 257px, Turing
Modulator 302px, Kinetic 302px, Expression Router 302px, Transport 302px, Recorder 257px, Numpad,
Drum Pads.

**Why it qualifies.** Every one of them is a grid, a keyboard, a curve or a step pattern being
described in words. And the geometry already exists: there are **34 layout modules** in `utils/` —
`arpLayout.js`, `splitZoneLayout.js`, `stepSequencerLayout.js`, `phraseLayout.js`,
`envelopeLayout.js`, `harmoniserLayout.js` and the rest — each computing where that component's parts
go. A designer in the dock would read the same geometry the component draws with.

**Shape.** One tab, many editors: the dock shows the designer for whatever is selected. Arpeggiator
gets its step grid, Zone Splitter its keyboard, Phrase its pattern, Envelope its curve.

**Precedent.** [`rack-canvas-plan.md`](rack-canvas-plan.md) already proposes exactly this for the
instrument host: *"Clicking a thumbnail opens its editor in a bottom display panel — the arpeggiator,
the step sequencer, the mixer, panning, whatever that node is. One dock, many editors."* If both were
built they should be the same mechanism, not two.

**Why it is not ranked first.** It is twelve editors, not one, so it is the largest piece of work
here — and unlike the others it needs a new drawing surface per component rather than a relayout of
existing controls. Best treated as a pattern proved on one component first. `CustomArpeggiatorEditor.svelte`
already draws an arpeggiator grid on the design surface, so that is the one to try.

---

### 10. Device bindings — 347px

Selected Binding is a routing table. It qualifies on shape but not on size, and the `device`, `ports`
and `routes` tabs already exist in the dock and cover neighbouring ground. Probably folds into one of
those rather than earning its own.

---

### Not candidates

Listed so they are not re-argued:

- **Appearance (19 owners), Colours (5 owners)** — already handing off to the Colors tab, already
  about 89px each. This is the pattern working.
- **Behavior, Value, Interaction, Return to rest, Momentary, Toggle, Radio Group** — not visual.
  Rows are the right control for a mode and a number.
- **Identity, Core** — names, ids and types. 227px and correctly boring.
- **The 166 titles under 200px per owner** — 235 instances, 27,410px in total, and none of them
  individually a problem. Moving them would cost clicks and buy nothing.

## What to settle before picking one

Three questions from the space plan apply to every entry, and answering them once is cheaper than
answering them per candidate:

1. **What is left in the panel?** If a group leaves nothing behind, hiding the dock loses access to
   it. If it leaves a compact form, the space is only partly recovered.
2. **Does the tab follow the selection or pin to a target?** Colour clears its target when the
   selection changes. An Effects tab probably wants to follow the selection instead — but then it is
   a second properties panel, and the difference needs stating.
3. **Search.** `propertyFilter` feeds every `PropertyCell`. A relocated group has to stay findable or
   it is lost, not moved.

## Notes

- 2026-09-10: Written. Inventory measured from source; verdicts are proposals.
