# Changeable control sets: what it takes

Status: proposal, 2026-11-02; the owner's decisions are under Decisions. Built so far: the pin fix
(Findings 8); piece A (`models/controlSetOwnership.js`, the Control set card, override marks and
Revert on the fields that name their property); and piece B for the knob: all twelve base knob
forms are drawn with the knob's own parts (`models/knobFormParts.js`), with a housing plate, cap
and housing outlines (circle, polygon, rounded square, scallop, flutes, ring), a needle pointer and
a tight fit added to the knob (`utils/knobOutlines.js`). The tight fit keeps the knob, housing
and all, above a readout placed under it. The sets that used the forms name none any more. The
Knob tab has a section per part, in drawing order: Housing, Track and Value Arc, Cap, Pointer
(`sections/KnobPartsEditor.svelte`), every field with the override marks. The twelve base
button forms and the twelve base switch forms are drawn with the control's own device parts
(`models/buttonDeviceParts.js`: housing, guard, key, symbol, indicator, legend, each a shape in a
box of the form frame, `utils/deviceShapes.js`, that moves, swings and lights when pressed or on;
recipes in `models/buttonFormParts.js`). Their fields wait on the Button and Switch tab's mock-up.
Still drawn by code: the 48 direction forms, and the meter forms. SVG and Photoshop drawings import
as layered components (Bringing designs in, below).

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

## Bringing designs in: Photoshop and Blender

The owner: "Call it KnobMan on steroids but without the filmstrips. The usage of filmstrips is for
those that WANT to use Photoshop/Blender etc. OR we must make it easy to import Blender files that
convert it (without loss of look/design) into a customisable component in layers."

KnobMan builds a knob from layered primitives with lighting effects and writes a filmstrip. CEditor
can do the same composition and keep it: the layers stay layers, drawn live, so nothing has to be
written out and nothing is frozen. Pieces B and E are that, for designs made in CEditor. The
question here is designs made elsewhere.

### What "without loss" can and cannot mean

A Blender knob is geometry, materials and lights, path-traced into pixels. Pixels reproduce that
look exactly, but only for the view, the light and the colours they were rendered with. Anything
that changes after the render (a colour, the light, the shape) has to be either worked out from what
the render recorded, or rendered again. So the two wishes, the exact look and every change, are met
in levels: the more of the scene comes across, the more can change, and the more CEditor has to
draw itself.

### Level 0: a picture or a filmstrip (exists)

An image or a strip of frames, from anywhere. Exact, and fixed: size, timing and which value drives
it, nothing else (F).

### Level 1: layers rendered by Blender (recommended first)

A small add-on for Blender, shipped with CEditor and installed once in Blender's preferences. The
author names the objects as the SVG and PSD importers already ask (`cap`, `pointer` turn with the
value; `fader` moves with it; `lamp` lights with a state; everything else stays still), and the
add-on renders from a camera that matches CEditor's (straight above, the light where a set's lamp
is) the render passes Cycles already makes, per object:

- **colour**: the object's own colour, with no light on it;
- **light** and **reflections**: what the lights and the room do to it;
- **shadow** on the panel, from a shadow catcher, and **occlusion** where parts meet;
- **emission**, for lamps and lit legends.

It writes them as one file of PNG layers and a manifest, and CEditor imports it into the Component
Designer as an ordinary component: the layers stacked with their blend modes (colour times light,
plus reflections, the shadow multiplied onto whatever panel it sits on), the turning objects bound
to the value, and CEditor's own vector layers on top for the scale, the legends, the value arc and
the readout.

- **Lossless where it can be**: added back together, the passes are Blender's render, to within the
  rounding of 8-bit images (they are made to add up; it is how compositing works in Blender).
- **Changeable**: each object's colour (its colour layer is retinted; its light and reflections are
  untouched, so a red cap is lit exactly as the grey one was); which objects turn or move, and how
  far; size; hiding, swapping or combining objects from several imported knobs; everything CEditor
  draws on top, with bipolar, ranges and text; behaviour; and the panel colour under the shadow.
- **Not changeable in CEditor**: the 3D shape and the direction of the light. The add-on keeps the
  scene, so changing them is a re-render and a re-import that keeps what was set in CEditor.
- **Round and not round**: a round object's light does not change as it turns (its knurls and
  flutes repeat all the way round), so one image turns while its light stays still, the classic
  trick done right. An object that is not round (a chicken-head) is rendered at each position, its
  passes still separate: a filmstrip for that one object, whose colour can still be changed.
- **Metals**: a coloured metal reflects in its own colour. A retinted colour layer approximates it
  well for anodised, brass and copper; an exact metal colour is a re-render.
- **In a plug-in**: images and blend modes, no WebGL, so Windows and Linux alike.
- **What it needs**: the add-on (a few hundred lines of Python); the import, which writes a
  component the designer already understands; blend modes on component layers (the part renderer
  honours them; no editor shows them yet), and a tint on an image layer.

**The same import for Photoshop.** The PSD importer (`utils/psdPanelImport.js`, `psdComposite.js`)
already reads Photoshop's layers, blend modes, masks and groups and composites them as Photoshop
does, for a panel's background. The same reader can make a component instead: each layer a
component layer with its blend mode and opacity, `pointer`/`cap` layers bound to the value, colour
layers tintable. That is a layered, skeuomorphic knob drawn in Photoshop, with no filmstrip. Both
importers write the same kind of component, so the designer treats a Photoshop knob and a Blender
knob alike.

### Level 2: the model itself, drawn by CEditor (later)

Blender exports glTF 2.0 (File › Export › glTF), its standard exchange format: meshes and their
physically based materials (colour, metal, roughness, clear coat, anisotropy). CEditor imports it as
a 3D layer, each object a part, drawn by the renderer of the realistic-looks prototype (E) extended
from the shapes it builds itself to meshes, and lit by the set's lamp.

- Changeable: every material (metal to plastic, roughness, colour, as set roles), the light (it
  follows the set), which objects turn or move, size. Re-import keeps CEditor's edits by object name.
- Close to Blender, not identical: a renderer that draws live approximates what Cycles traces (soft
  shadows, light bouncing between parts). Roughly Blender's own real-time renderer, Eevee.
- The shape is still Blender's: CEditor does not edit meshes.
- In a plug-in: baked to images at export, as E does.
- Large: a glTF reader (a library such as three.js would serve, in the editor only, since the export
  bakes), meshes and materials in the renderer, caching and baking.

### Level 3: CEditor's own 3D parts (E)

Shapes CEditor builds from properties (turned bodies, knurls, flutes, skirts, tops, pointers) with
the same materials and light: everything changeable, the shape included, and no other program. It
shares the renderer with Level 2.

### Built: SVG and Photoshop as layered components

File › New Component from SVG Artwork and New Component from Photoshop Artwork make a drawing the
control itself, a custom component of layers, opened in the Component Designer
(`utils/svgComponentImport.js`, `utils/psdComponentImport.js`, the wiring in
`utils/artworkComponent.js`):

- **SVG**: every shape a vector layer (a path part, `meta.pathData` in its box), transforms applied
  to its points, its fill, linear or radial gradient, pattern (as its picture), stroke (a gradient
  stroke as the outline's gradient) and opacity from attributes, `style` and class rules, inherited
  as SVG inherits them; text as text, pictures as pictures, linked ones read from beside the file.
  A plain filled shape under a clip path is cut to it with Paper.js; masks and other clips are the
  layer's mask.
- **Photoshop**: every pixel layer a picture layer, cropped to its pixels, the layers clipped to it
  blended in (`psdComposite.js`); every shape layer a vector layer (`utils/psdVectors.js`); layer and
  vector masks the layer's mask; opacity, blend mode (CSS's, or the nearest) and visibility kept;
  Drop Shadow and Outer Glow the layer's shadows, the other styles a shape layer's settings or drawn
  into a picture (`utils/psdLayerStyles.js`); adjustment layers applied to what is under them
  (`utils/psdAdjustments.js`). Pass Through groups unfolded, isolated groups flattened; text as text
  where the file says its size and colour. A layer's colour is changed with the image tint.
- **Layer masks** (`utils/partMask.js`): a part may carry `mask: { enabled, src, x, y, width,
  height, invert }`, a PNG or SVG whose alpha is the mask, in % of the part's box, drawn with CSS
  masking; a masked part is never baked into a static picture. A picture layer casts its shadows
  from its pixels (`drop-shadow()`), not its box. Editing a mask in the Component Designer waits on
  its mock-up.
- **What moves**, from the names, as the panel importers read them: `pointer`/`indicator`/
  `needle`/`rotor` turn about the `pivot` (or the middle of the knob they sit on), `fader`/`thumb`
  slide along the `track`, `lamp`/`led`/`on` and `off` show the state, `pressed` shows while held. The
  component gets the dial, fader, switch or button wiring the designer builds (value channel,
  behaviour, grab area, bindings). Not `cap`: a cap's highlight would swing round with it.

This is Level 1 for Photoshop without the add-on: a knob painted in layers in any of the programs
that write PSD comes in as a layered, changeable control.

### Native files: Illustrator (.ai), Figma (.fig), Blender (.blend)

The owner asked about reading these directly. What each format is, and the route that works:

- **Illustrator .ai.** Since Illustrator 9 an .ai file is saved, by default ("Create PDF Compatible
  File"), as a PDF with Illustrator's own data in private streams. The PDF part holds the artwork as
  drawing operators: paths, fills, axial and radial shadings (the gradients), text as positioned
  glyphs, and the layers as optional content groups. So reading .ai is reading PDF: pdf.js (Mozilla,
  Apache 2.0) parses it into an operator list that maps onto the same vector layers the SVG importer
  makes. Medium work; text would come as outlines or glyph runs rather than editable text. A file
  saved without PDF compatibility holds only Illustrator's private, undocumented data and cannot be
  read; the answer there is SVG export (Export As › SVG with "Object IDs: Layer Names"), which works
  today. **Recommendation:** worth doing if Illustrator is a main tool; until then SVG export.
- **Figma .fig.** A proprietary binary (a "fig-kiwi" header, a Kiwi-schema message, compressed),
  undocumented and changed by Figma without notice. Community parsers exist, but an importer built on
  one breaks with the format. Figma's supported routes are better: its SVG export (works today; tick
  "Include id attribute" to keep layer names), its REST API (`GET /v1/files/:key` returns the whole
  document as JSON: every node's name, vector geometry, fills, strokes and effects; it needs the
  user's access token and the network), and a Figma plugin, which runs inside Figma and could write a
  CEditor component file directly. **Recommendation:** SVG now; a Figma plugin, or the REST API, if
  Figma becomes a main source. Not the .fig file itself.
- **Blender .blend.** Blender's own database (structures described by the file itself, "SDNA"),
  readable in principle, but what makes a knob look like a knob (materials, lights, the render) only
  exists once Blender renders it. Importing the file without Blender would mean rebuilding Blender's
  renderer. So Blender works from inside: the add-on of Level 1 renders each named object's passes
  and writes them as a layered file CEditor reads. The Photoshop component import above is that
  reader already: an add-on that writes the passes as a layered PSD (or a component file directly),
  the layers named as above and blended as compositing adds them (colour, multiply the shadow and
  occlusion, add the reflections), comes in as a changeable layered control with no new import code.
  glTF (Level 2) stays the route for live 3D. **Recommendation:** the add-on, writing PSD.

### Order

Built: SVG and Photoshop as layered components. Next: the Blender add-on writing a layered PSD (the
reader exists); .ai through its PDF part if Illustrator files are wanted directly; a Figma plugin if
Figma is; Level 3 with piece E; Level 2 when somebody needs a shape only Blender can make.

## Recommended order

1. **A** (your own, reset, marks): small, and it answers "can I change it" for every set today.
2. **B** for knobs: the largest gain, and the condition for D2 and for a coherent Knob/Slider.
3. **C**: designing a set becomes editing a control.
4. **E**: realistic looks as a part material, with export baking.
5. **D1, D2, D3**, then **B** for buttons, switches and meters, then **F** and **D4**.

## Decisions

Taken by the owner, 2026-11-02:

1. **Forms become parts.** "The whole idea of the editor is that components are adjustable in any
   way", with a few exceptions such as the orbit, the arpeggiator and the step sequencer.
2. **Start with piece A.**
3. **Filmstrips are for those who want them** (Photoshop, Blender), as their own category; the way
   in for those designs should be layers, not strips (Bringing designs in, above).

Open:

1. Rendered looks: live in the editor and baked into the plug-in at export (recommended), or live
   everywhere (needs the Linux JUCE patch)?
2. A set that names a library component (D4): later (recommended) or as part of this?
