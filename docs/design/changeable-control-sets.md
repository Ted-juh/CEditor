# Changeable control sets: what it takes

Status: proposal, 2026-11-02. Nothing here is built yet, except the pin fix under Findings 8.

## The principle

The owner: "the whole idea of control sets is great as a quick starting point but the whole key of
the editor IS changeability." A set may give a panel any look it likes, but everything it puts on
the panel must stay changeable afterwards, in the editor, by the person who placed it:

- colours, shapes, sizes, text and fonts;
- linear or circular, unipolar or bipolar, 0..1 or 0..127, one value or a range;
- in the properties panel, and in the Component Designer once a control is taken there.

Filmstrips are welcome, but as a category of their own, marked for what they are: a picture of
every position, which cannot be recoloured, reshaped, turned from circular to linear, or given a
centre for bipolar.

A set should therefore only ever supply **starting values for properties a person can see and
edit**. Nothing it draws may live outside those properties.

## Findings: what is true today

These come from reading the code. File references are under `CE/web/src/CE_Application/` unless
they say otherwise.

### 1. Most of a set is data, and your edits win

A set is colour roles (tokens such as `{accent}`), a lamp, family patches per control type (values
for the control's own properties and parts), a font block, and label, section, display and
instrument designs that are family patches too (`models/controlSets.js:367-379`,
`models/controlSetFamilies.js:16-25`). It is applied when the control is drawn, not written into
the document. A family value applies only where the control still holds its factory value
(`controlSetFamilies.js:134-157`), and an edit equal to the factory value is protected by a pin
(`Core.setOverrides`, `controlSetFamilies.js:346-363`). So an edit survives switching sets, and the
inspector shows what is drawn (`drawnForInspector`). The value behaviour (range, step, geometry,
bipolar) is never touched by a set (`models/controlSetDesigns.js:428`). This part works as the
principle asks.

### 2. The exception: forms, drawn by hand-written code

On 76 of the 79 built-in sets, Knobs, the four kinds of Button, Switches and Meters are drawn by a
**form**: a fixed SVG drawing in a Svelte file (`Core.controlForm`, written by
`models/controlSetCoverage.js:122-130`). There are 60 forms in each of the four groups, 240 in all,
drawn by `editor/ControlAnatomy.svelte`, `AdditionalAnatomy.svelte`, `PhysicalAnatomy.svelte`,
`SynthExpansionAnatomy.svelte` and `SculptedSynthAnatomy.svelte`. While a form is on:

- its geometry cannot be edited at all;
- about 190 colours are written into those files as literals, beside the five a form exposes
  (Face, Housing, Ink, Legends, Indicator);
- its font sizes and its words ("VU", "SIGNAL", "ON/OFF", "PRESS") are fixed;
- the control's own parts, background and effects are not drawn, so edits to them do nothing
  visible (`editor/CanvasControl.svelte:302, 3264-3272`);
- it draws the current value only: a bipolar knob or a two-handle range is drawn as a plain
  single-value knob (`models/controlAnatomy.js:16-23`), where the slider renderer handles both.

The only ways out are another form, or "Original parts", which drops the set's look. Sliders have no
forms; they are drawn from parts and are as changeable as the principle asks. **Forms are the
main reason sets feel hardcoded.**

Smaller cases of the same kind: the Slider cap kind (8 drawings), the knob pointer kind, 49 pad
and step-cell shapes (`utils/performanceShapes.js`), and the styles of Ribbon, Crossfader, Matrix,
Tab container and Macro. Their sizes and colours are properties; their shapes are a choice from a
list.

### 3. No detach, no reset, no visible pins

There is no "make this look my own" (take the set's look into the control so a set switch leaves
it alone), no "reset to the set", and nothing shows which properties are yours and which are the
set's. All three were planned in `docs/design/control-sets.md` (95-103, 221, 270-271, 367) and not
built. The look is baked into a control only for an export (`stores/panelModel.js:181-187`).

### 4. Settings › Control Sets edits little of a set

It edits the name, the description, 9 of the 55 colour roles, the panel's surface material, and it
can copy a whole family (Knobs, Sliders, Buttons, Switches, Drum pads, Steppers, Labels) from one of
the 36 templates. It cannot edit any property of a family, the Meter, Momentary, Timed, One-shot,
Combobox or Number families, the fonts, the lamp, or the other 46 colours. A set travels as a file
(`models/controlSetPackage.js`, the whole set as JSON), so hand-editing the file is the only way to
change a family's properties.

### 5. The Component Designer and sets do not meet

- **From selection keeps the look by freezing it.** A knob becomes one `slidercontrol` part that
  holds a resolved copy of the knob and draws it with the panel's renderer
  (`utils/sliderControlPart.js:5-12`, `utils/customComponentFromControls.js:426-436`). It looks the
  same and behaves the same, but nothing in the designer edits it, and it no longer follows a set.
  A form set on the control itself is refused, buttons are refused, and so are a dozen other cases
  (`customComponentFromControls.js:277-317`).
- **A set cannot use a component.** A family is property values for a built-in type; a set has no
  field for a component (`controlSets.js:449-485`), and applying a set skips custom components
  (`utils/controlSetApply.js`).
- **Components do not follow a set's colours.** The designer writes literal colours; a part can
  hold `{accent}` and would follow the set, but only by editing the data by hand.
- **Ranges and curves.** A custom component has no `Behavior` section; its geometry changes how the
  pointer maps to a value, not the artwork. Channel curves (bipolar, exponential, stepped) are
  stored and read by nothing at run time (`utils/customComponentInteraction.js:146-162`).
- **Filmstrips are fixed.** Imported or baked, a strip can change its frame count, axis, channel
  and size; its colour only through a filter on the whole control. The baker draws a subset of the
  part kinds (no polygons, pen paths, arcs, knob parts or materials).

### 6. Real panels are built from components

The GAIA SH-01, AN1x and SH-201 panels have no built-in Knob or Slider: their 20 to 100 knobs each
are custom components with parts bound to a value channel. In practice the Component Designer is
where panels get their controls, and sets reach those panels only through colours a person writes
as tokens by hand.

### 7. How controls are drawn

Everything is SVG and HTML/CSS, through one tree of Svelte renderers that the exported plug-in
uses unchanged (`src/Player.svelte` mounts `PanelPreviewSurface`). There is no WebGL. Lighting today
is an SVG filter (`CE_Panel/components/MaterialFilter.svelte`): noise lit by the set's lamp.
Filmstrips are stepped by `background-position` (`editor/InteractivePartRenderer.svelte:368-398`),
and generated images already reach parts as data URLs (`utils/staticPartBaking.js`). On Windows the
webview runs with the GPU (no flags turn it off). On Linux, stock JUCE sets WebKitGTK's hardware
acceleration to never (`juce_WebBrowserComponent_linux.cpp:718-721`), so WebGL in a Linux plug-in is
doubtful without a patch.

### 8. Defects found on the way

- **Fixed:** a control pinned to a set of your own took the panel's set: a pin was looked up among
  the built-ins only. The Apply window's unticked controls are pinned that way. Pins are now looked
  up in the panel's sets and the library too (commit "A control pinned to a set of your own keeps
  it").
- Not fixed: from selection refuses a form set on the control itself, though the part renderer can
  now draw forms; the set import error says "version 1" where version 2 is read; channel curves are
  not applied; pins cover only paths a built-in set patches (`controlSetFamilies.js:321-337`).

## What it takes

Six pieces. The first is small and useful at once; the second is the root of the problem.

### A. Your own, and back (small)

- **Make this look my own**, for a control or a selection: write what the set draws into the
  control's own properties (what an export already does, `resolveControlForSet`), keep colour
  roles as roles if wanted, and let set switches leave it alone.
- **Reset to the set**, for one property and for a whole control.
- **Show it**: a mark on each field the set decides, and on each one you changed. The swatches
  already know (`utils/setSwatchValue.js`).

### B. Forms become parts (large; the root)

Rebuild each form as a composition of the parts the slider renderer and the Component Designer
already draw (cap, skirt, ring, pointer, ticks, value arc, readout, legends), adding the part
features the forms need: an outline with grooves, flutes or facets; a few gradient profiles
(dome, cone, dish); an inner shadow; a material per part (the renderer has one; no editor shows
it). A form then becomes a family patch, data like every other family, and:

- every shape, colour, text and size is a property;
- bipolar, range, linear and circular work, through the slider renderer;
- Knob to Slider keeps a coherent look;
- from selection can carry it into the designer as layers (D2).

Order: the 12 base knob forms first, checked against today's drawings with the pixel comparison
the knobsFromSelection check already uses; then buttons, switches and meters; then the 48
direction forms per group, which hold most of the literal colours. Documents that name a form keep
drawing with the old code until converted: **Convert to parts** on the control, and on a set apply.
Whatever does not convert well can stay as a "classic" category, marked like filmstrips.

### C. Edit a set by editing a control (medium)

The natural way to design a set is on the panel: style one knob in the properties panel, then
**Use this look for the set's Knobs** (its changed look properties become the family). And the
reverse: **Edit the set's Knob**, which places one to edit. Settings › Control Sets gets every
colour role (grouped), the fonts, the lamp, and every family, not 7.

### D. Components and sets meet (medium to large)

1. The designer's colour fields offer the set's roles (Accent, Knob cap, Panel surface...) beside a
   literal colour, so a component follows the panel's set.
2. From selection turns a knob into editable layers once forms are parts (B), not a frozen copy.
3. Channel curves (bipolar, exponential, stepped) take effect.
4. Later: a family may name a library component ("this set's knobs are Studio Knob 1.2"), placed as
   linked copies. The two models differ (Behavior on built-ins, channels on components), so this
   is the largest piece and can wait.

### E. Realistic looks that stay changeable (medium to large)

A rendered look is a **material of a part**, not a filmstrip: a part (a cap, a skirt, a fader cap, a
button face) can be filled by "Rendered", with its own properties: profile, grooves and their
depth, taper, top (flat, insert, dome), material (spun or brushed metal, gloss or satin plastic,
bakelite, rubber), colours as set roles, the set's lamp. The indicator, the scale, the labels, the
value arc and the readout stay ordinary parts, so text, bipolar, ranges and geometry keep working,
and every property stays editable.

- One renderer for the page: a WebGL shader that draws a part from its properties into an image,
  cached by its properties, size and screen scale. A round body is one image whatever the value; a
  shape that is not round (a chicken-head) gets one image per position, made when needed: a
  filmstrip **generated from properties**, made again when one changes.
- The prototype exists: about 400 lines, the knobs, fader cap and buttons of the mock-up, about 3
  seconds an image in software here, live on a graphics card.
- In an exported plug-in, the images are made at export and carried with it, so the plug-in needs
  no WebGL; that also settles Linux, where the webview has no GPU. Live rendering in the plug-in
  would need an eleventh JUCE patch.
- The "Control Studio" of the mock-up becomes this part's properties, in the properties panel and
  the designer, not a separate screen.

### F. Filmstrips as their own category (small)

Image controls (imported strips, KnobMan or Blender renders, vendor packs) in a category of their
own in the Library, marked for what they cannot do. They use the filmstrip support that exists. A
tint per part (hue, brightness) is the one cheap kind of change they can take.

## Recommended order

1. **A** (your own, reset, marks): small, and it answers "can I change it" for every set today.
2. **B** for knobs: the largest gain, and the condition for D2 and for a coherent Knob/Slider.
3. **C**: designing a set becomes editing a control.
4. **E**: realistic looks as a part material, with export baking.
5. **D1, D2, D3**, then **B** for buttons, switches and meters, then **F** and **D4**.

## Decisions for the owner

1. Forms: convert them to parts (recommended), or keep them as a fixed "classic" category beside
   filmstrips?
2. Rendered looks: live in the editor and baked into the plug-in at export (recommended), or live
   everywhere (needs the Linux JUCE patch)?
3. A set that names a library component (D4): later (recommended) or as part of this?
