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
recipes in `models/buttonFormParts.js`). The Button tab (Switch on a toggle) edits them one part at
a time, as the owner approved in its mock-up (`sections/ButtonPartsEditor.svelte`): Shape,
Position, Appearance, When On or When Pressed, and the legend's text, every field with the override
marks.
The twelve base meter forms are drawn with the meter's own parts (`models/meterDeviceParts.js`:
housing, face, track, scale, indicator, marker, cover, legend, in the form frame's 160 by 100
units; each answers the reading by filling, sliding, swinging or lighting its cells, a scale is
ticks along a line or round an arc with a zone, a legend says words, the percentage or the figures;
what a part draws at a reading is `utils/meterParts.js`, recipes in `models/meterFormParts.js`).
Each matches its form drawn by code to within 0.4% of its pixels at empty, 5%, 62% and full: the
form drew a one-unit sliver at empty, and the rest is anti-aliasing. A capsule's sheen runs
through the set's face colour, which a gradient stop holds as a colour, not a role. The Meter tab
edits them below the meter's own value, colour zones and peak hold, as the owner approved in its
mock-up (`sections/MeterPartsEditor.svelte`): part chips, Reading (fill, slide, swing, light, or a
clip lamp that lights at its level and holds with the peak; the reading or the held peak; Zone
Colours by position or by level, from the meter's own zones, the ones scripts' zone events
report), Shape, Position, Appearance (Fill Type solid or gradient), and on the Scale part major
and minor ticks in the Knob tab's words, each kind its own length and width, and numerals. A
ninth part, the Clip Lamp, is a round lamp in the top right corner from the start. The knobs of the
36 synth sets (Vintage Mono to Future Lab, Heritage to Carbon Pro, Valve Console to Prism Cap) are the
knob's parts too (`models/directionKnobParts.js`), each written as its drawing was, in its 160 by 170
units: a skirt between the housing and the cap and an insert set into the cap (two more plates, the
Knob tab's **Skirt** and **Insert**), a shadow under any plate (its outline again, lower, as soft as
asked; with no drop, a glow), a plate in perspective for the sculpted series (an oval, `aspect`,
moved up or down, `shiftY`: the outline squashed, then turned with the value, then moved, so an
oval ring turns as a gimbal does), a **gear** and a **chicken-head** outline, a **bar** pointer with
square ends that can taper, carry an edge or be shaded (Lever Dial's brushed lever),
the scale on a radius of its own (`Behavior.tickRadius`) with its 0 to 10 numbers round it
(`Behavior.scaleNumberCount`, `Parts.tickNumber`), and ticks that light in a colour of their own up
to the value (`activeColour`, the LED ring). Their shading is the drawing's gradients laid over the
part's own colour, clear where the drawing used the set's face, so the knob still follows its set.
Compared side by side with the drawings at two values: the same knobs, a little smaller in the box
since the scale numbers take room of their own (the sculpted drawings let them run off the top of
the frame); a cap's highlight, and the sculpted series' perspective, stay put while the knob turns
(the drawings turned them with it). Left out, as no part draws them yet: Vintage Mono's faint inner
ring, the line under the digital knobs, Dual Scale's second scale and inner bar, the pointer tails
of Classic Poly and Heritage, Precision's knurling, Recessed's grip line, Arc Line's centre dot and
the gap between its two arcs; the sculpted series' specular glints, the lines painted along their
pointers, Prism Cap's facets, Coin Edge's accent tick and Gimbal Ring's two beads. Still drawn by
code, a classic category as the owner decided: the 12 additional designs, most of which are not
turning knobs at all (a bellows, an iris, a fan, a balance).
The 36 synth sets' buttons, switches and meters are their own device parts too
(`models/directionDeviceParts.js`), each written as drawn in its device frame: a key in a well that
goes down and lights its bar, a rocker that tips, a piano key (a new **bevel** shape), a key with a
lamp in a side window that rises, flat touch, membrane and edge-lit keys; the sculpted series' keys
on a drop shadow, which device parts now cast (`shadowOffset`, `shadowBlur`, `shadowColour`, on the
Button and Meter tabs). The meters: paper VU meters with their scale's curve (a **bow**), ticks
round it and a needle, two side by side on Studio Console (the right needle the marker), bars that
fill with a cursor at their end, LED ladders, dots and twin rows that light, the sculpted series'
split ladder (its low cells the marker). Device gradients are drawn in SVG, which fades through a
clear stop's own colour, so a clear stop takes its neighbours'; and a linear one now runs as CSS
runs it, across the part's box in the drawing's units, where it ran in the box's fractions and so
skewed at an angle on a box that is not square: the part, the Gradient dock and a layer made from it
agree (the base sets' gradients run straight down and draw as they did). Compared side by side with the
drawings off and on, empty and full: the same controls. Left out: the faint lines across the console
keys, a border that lights (Edge Light, Floating Halo), the slant of the guard keys' bars, Gimbal
Ring's frame in metal, the lens keys' highlight line, the second VU's ticks on Studio Console, and
the paper meters' curved tick lines (an arc of ticks instead). As layers, every one of them
converts, the sculpted ones' shadows a layer of their own under each part (see piece D2). The twelve classic
sets' buttons, switches and meters are illustrations like their knobs and stay drawn by code.
SVG and Photoshop
drawings import as layered components (Bringing designs in, below).

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

**Built** (owner's approved mock-up, in the words of Unity's prefab overrides and Figma's main
components):

- **Overrides list** on Core › Control design: each override by part and property, with Revert and
  Apply. `models/setFromControl.js controlOverrides` reads them from `setOwnership`, which now
  counts every look path the set may write (`EDITOR_PATHS`, part properties included), not only
  colour roles; a colour role counts only where the control differs from both the factory value
  and what the family gives it.
- **Apply to Set…** (`layout/ApplyToSetDialog.svelte`, `stores/setFromControl.js`): the overrides
  ticked, and what changes (how many other controls of the type follow, how many keep a value of
  their own). Applying writes the values as the control holds them into the family (a role stays a
  role), marks the family the author's own (`chosenFamilies[type] = 'own'`, so no derived design
  writes over it) and hands the control back to the set. A set of the author's is changed in the
  library and in the copy the panel carries (the panel's copy wins a lookup, so both must change).
  A built-in set is copied under a name the window offers, and the panel moves to the copy, or the
  control does where it was assigned a set of its own. One panel write, one undo step.
- **Settings › Control Sets** (`models/setEditing.js`): the 45 colour roles in six groups, the ten
  derived ones shown read-only; the swatch opens the Colors dock on the role (colours go through
  the dock, never a popup). Lettering: typeface, weight and spacing written to every family's text,
  a knob's readout part included. Lamp: direction and height. Families grouped as the Insert menu
  groups them, each with its design source, Edit on Panel and Reset (back to the built-in the set
  was copied from).
- **Edit on Panel**: places one of the family's controls on the open panel where a new control
  goes, drawn with the set (assigned to it if it is not the panel's), selected, with a banner in the
  window's notice row: Apply to Set, or Cancel, which removes it.

### D. Components and sets meet (medium to large)

1. The designer's colour fields offer the set's roles (Accent, Knob cap, Panel surface...) beside a
   literal colour, so a component follows the panel's set. **Built:** the Colors dock's **Set
   colours** (`panels/DisplayPanel.svelte`), for every target that can hold a role
   (`colorTargetAcceptsRoles`: a colour property of a control or a layer, or a callback marked
   `acceptsRoles`), from the set the target's control is drawn with (`colorTargetSet`). A role is
   written as a token (`applyRoleToTarget`), which `resolveControlForSet` already resolves for parts;
   a colour picked after it is a literal again. The designer's look bar draws a linked swatch as the
   panel's set gives it and names the role. Library cards draw with the open panel's set.
2. From selection turns a knob into editable layers once forms are parts (B), not a frozen copy.
   **Built** for knobs and sliders (`utils/valueControlLayers.js`), chosen in the new Create
   Component from Selection window (`layout/ComponentFromSelectionDialog.svelte`): housing and cap
   as path layers (any outline, its fill, gradient, finish and border; a see-through or lit border
   as a separate edge layer, as the panel strokes it over the fill), track and value arc as arc
   layers, ticks (line, dot, engraved, numeral) lit up to the value by opacity bindings, the
   pointer turning about the centre, readout and labels as text; a slider's track, edge and slot,
   a fill that grows from its origin, and a fader cap (dot, ring, line, bar) moving along it.
   Geometry from the renderer's own helpers; colours from the family with roles kept; the knob's
   interaction states written to its layers. `browser-checks/knobLayers.mjs` draws each built-in
   set's knob and slider, converts it and compares the pixels at four values (within 2.5 %, a
   one-pixel shift forgiven): all 79 sets' knobs match. What a layer cannot draw yet comes in as
   one exact part, named: a control form not made of parts.

   **Every offered set converts** (Iris and Satellite, drawn whole, aside). Of the 64, 41 knobs and
   52 sliders used to come in as one exact part and 12 buttons, 13 switches and 17 meters were
   refused; now none is. What it took:

   - *A path layer whose light stays put* (`meta.fixedLight`, InteractivePartRenderer): turned, only
     its outline turns about its pivot (`rotatePathData`), its fill, gradient, finish and shadows
     drawn upright under it, as the panel draws a plate through a mask of its turned outline. A gear,
     a scallop, flutes or a chicken-head turn under the set's lamp.
   - *Plates as the panel draws them* (`plateLayers`): any outline, curves kept
     (`transformPathData` maps a path, arcs included, under any affine map); in perspective, squashed
     then moved; a skirt and an insert; a drop shadow as a layer of its own under the plate (a blurred
     path, so it shows through a plate you can see through); grooves; the box the panel's fill box,
     so a gradient runs as it does. The metrics take the skirt, the shadows, the ovals, the scale's
     radius and its numbers, as the renderer's do.
   - *Knob pointers and scales*: a bar with its taper and its edge (a mitred band, `offsetPolygon`),
     a shaded bar, a second bar on it, a second scale, numbers round the scale, ticks on a radius of
     their own, and ticks lit in their own colour.
   - *Fader caps*: block, console, lens and glass, the sheen and the dome as gradient layers, a glow
     as a blurred layer, a ring's glow, gradients and finishes on caps, tracks and fills. The panel's
     glowing fill draws nothing (its blur's region is a share of a straight line's box, which has no
     width), so its layers draw none either.
   - *Buttons, switches and meters*: a part's shadow a blurred layer moving with it; a plain
     switch's lamp (an LED, a jewel or a window, lit by a state); a legend that shows the reading; a
     fill drawn in a pattern or a shape, each cell bound to where it stands; a counter, its digits a
     **Counter Figures** binding (`mapMode: 'figures'`, utils/interactionRuntime.js: the reading to N
     places, one character of it, only at a given count of figures) and its windows shown for each
     count (`figureLengths`).
   - A layer's box shadow keeps its colour's alpha (it was cut to six digits, so a soft shadow drew
     solid).
   - *A held peak*: a value channel can hold its peak (`peakHold`: hold time, fall rate, and what
     it reads where nothing runs, `idle`), kept by the preview surface as a meter's is (`meterPeak`,
     on the same ticker) and read by bindings as `channel.<name>.peak`. A meter with Peak Hold, a
     clip lamp or a part showing the peak carries it, so the clip lamp (lit at `clipFrom`, held
     while the peak holds), a peak needle and Peak Hold's marker convert; where nothing runs a
     device meter reads its value as the peak and a plain one has none, as each renderer draws
     them. A range binding can write only inside its range (`band`, **Inside Only**): the segment
     the peak rounds to.
   - *A button's or a label's text*: a text layer draws what the label draws: its colour's alpha,
     the nine placements, lines of its own at their line height, a baseline shift, and an
     underline, strikethrough or overline (thickness, offset, colour, insets, in front or behind)
     across centred text. Still refused by name: such a line across text not centred, one that
     leaves gaps round the letters, and an outline inside the text. A device's caption is one line
     of SVG text in the text's colour, family, size, weight and spacing and nothing else, so its
     layer takes only those.
   - *Turned and scaled*: the panel turns and scales a whole control about its box's centre; each
     layer of a button, switch, meter or piece of artwork, built upright, turns by the same angle and
     scales by the same factor about its own pivot, its box moved so the pivot lands where the
     control's turn puts it (`turnControlLayers`). A layer a binding moves or sizes is placed so at
     both ends of the binding, one place binding per axis, so it travels along the turned direction;
     one moved by two readings is refused. A button's grab area follows a layer of its box that draws
     nothing (`source: 'part:…'`), turned with the rest. A component clips to its own box (the
     canvas's `.control-content`), so it holds the box as drawn, turned and scaled. Knobs and
     sliders turned or scaled are still refused.
   - *Effects*: every set gives its buttons, switches and meters a drop shadow, and one drawn as a
     device does not draw it (the canvas skips a device's effect surface); a plain one does, and its
     layers used to drop it. Now a control's shadows and bevel are cast through the canvas's own
     surface (EffectSurface) by the layer that holds its shape (`meta.surfaceEffects`): its plate,
     when the plate is opaque and the rest lies on it, or its only layer; the component's box grows
     by the shadows' reach, since the canvas draws them past the control's. Its colour filters
     change each pixel by itself, so every layer takes them. A blur or a blend over a control of
     several layers, and shadows with no one layer to cast them, are refused by name.
   - *Icons*: an icon is a layer of its own (an `Icon` section), drawn and placed by the same code
     as the canvas's (`editor/iconLook.js`): fitted, tinted, turned, flipped, with its shadow, glow
     and blur, beside the text in the layout's mode, which makes room for it. `CE_KNOB_LAYERS_ICON=1`
     puts a test icon in the library for the pixel check.

   - *A bat switch* (ContentLayout `lamp: 'bat'`, a lever in a round bezel beside the legend):
     the panel draws it as SVG in a box a lamp wide and three tall; each circle and round-capped
     line of it is a path layer, its strokes edge layers (`batLampLayers`), and the lever, its
     shadow and its ball are drawn twice, down in the off colour and up in the lit one, the lamp's
     state showing the one and hiding the other. The ball's highlight is a radial gradient over its
     box, as the SVG's is. Every set that names a bat draws its switches as devices, which draw no
     lamp; the bat shows on a plain button where an author chooses it, and comes in as layers there.

   - *Rendered looks* (piece E's lit pictures): a layer can carry a part's rendered look
     (`look: 'rendered'` and the part's render properties, with `renderShape` round or block, a
     block's `renderCorner` and `renderAxis`), and draws the same picture through the same renderer
     (utils/layerRenderedLook.js, its spec from renderedLookCore's): a turned body the size of its
     larger side, or a block its box, centred, its fill colour the body's and its fill the fallback
     while the picture is made. One whose light stays put (`meta.fixedLight`) picks the picture of its
     turn (`meta.renderTurn` plus its rotation) rather than turning as a picture. A rendered knob
     plate, fader cap (with its groove unless its top is ridged), key, housing, guard or indicator,
     and a meter's housing and clip lamp (unlit and lit), come in as such layers; a part the meter's
     zones colour draws flat, as on the panel. The static part bake keeps them live, and both export
     bakers (the editor's and the tools') bake a component's rendered layers, a state's colour
     resolved through the set, so a plug-in draws them without WebGL.
     The dock's **Render** tab (components/RenderTab.svelte, in the designer only, beside Mask;
     approved from its mock-up) edits a layer's rendered look with the fields the Knob, Slider,
     Button and Meter tabs show for a part's: Look, Shape (turned body or block), Light Stays Put,
     profile, ridges, depth, taper, height, corner, top, ridge direction, materials and colours.

   - *Track gradients, riding labels and synth readouts* (R5): a knob's track or value arc in a
     gradient, a picture or a finish is an arc layer that paints its background through the arc
     (`meta.arcTrack.paint: 'background'`, over its box and `paintPad` pixels, as SliderShapeFill
     paints it), and a dot pointer in one is a path layer, with its edge, that goes round the knob
     upright (`meta.orbit`: its rotation applied as a move round its pivot). A label that rides the
     pointer (`showHandleLabels`) is a text layer bound to the channel's display text, orbiting the
     centre the panel's label anchors use (the label metrics' circle, which is not quite the knob's
     drawn centre), or moved along a slider's travel between its two end anchors. A value written as
     the synth writes it (`displayFormat`, a table: utils/parameterDisplay.js) is carried on the
     channel (`format.display`) and printed by `formatChannelValue` through the same
     `formatBehaviorDisplay`; the min and max labels use `formatSliderNumericValue`, as the panel's.
     The channel's display range follows the panel's rule for a cleared bound (`null` is no bound;
     `Number(null)` had made it 0, and every value read 0), and a plus on positive values
     (`showSign`) is carried too. Checked against the panel on Graphite and Ceramic at four values:
     a knob with a gradient track, value arc and dot pointer 8 of 8; its riding label written as a
     pan, with a plus sign, and with a cleared display range 24 of 24; a slider's riding label 8 of 8
     each way (at most 0.21 % of pixels apart).

   - *Ranges* (R5): a knob's or slider's range (`valueMode: 'range'`, a start and an end) or band
     (the value between them) comes in as layers, a value for each handle (`valueHandles`): the
     control's own channel keeps the value the panel's range sends and its host parameter, and
     `<name>Start` and `<name>End` are values beside it, published, kept in order by the channel
     constraints the runtime already enforces (`normalizedMax: 'channel.<end>.normalized'`, the
     panel's normalizeHandleOrder). The fill from start to end (bodySelectedRange) is one layer moved
     by both: its near edge (or an arc's start angle) by the start, its length (or sweep) by the end,
     less the start's travel. That takes a binding that **adds** (`add: true`,
     interactionRuntime's `addedBindingValue`): its result added to what the bindings before it
     wrote, numbers summed and text joined, so the readout is the start, the separator and the end
     (`rangeSeparator`, a band's `bandSeparator`), as formatSliderReadout writes it. Ticks light
     between the handles as highlightStop lights them, the end setting the opacity and the start
     adding to it, which never comes out below nothing since the start never passes the end. Each
     handle is drawn as the panel draws it (a knob's start and end as circles, a slider's as caps of
     their own kind on the travel their size lays out) with its riding label. One grab area takes the
     handle nearest the press (`targetValueChannels`, `resolveCustomHitZoneAtPoint`), as the panel
     takes its nearest handle. Handles that may pass each other or wrap round the end were refused by
     name (layers since R6, with Minus); as one exact part a range is still refused, as a part holds one value. Each handle glides
     to a value it is given other than by a drag, on the control's glide timing, as the panel moves
     its start, value and end along one curve (SliderFamilyRenderer's glide). A knob in the
     tight fit leaves room for a range's start and end dots, as the panel sizes it (without them the
     converted knob drew larger than the panel's, 4 to 19 % of its pixels apart). Run over every
     offered set, a band from 15 to 80 with its riding labels: knobs, sliders across and sliders
     upright, 256 of 256 rows each (strict).
     The designer shows and edits what these use (approved from its mock-up): on the React tab, a
     binding's **Combine** (Set the value, or Add to the bindings before it) and, in its Range Map,
     **Scale** (Linear or Decibels, with **Floor dB** and **Ceil dB**); on the Interact card, a
     behaviour's **Measured in** (its grab area or the whole component) and, on a grab area over
     several values, **Takes** the nearest of them.
     The behaviour of a knob or slider made into layers now measures a point against its own grab
     area (`frame: 'zone'`). It used to measure against the whole component, so a knob beside
     another turned about a point between them: pressing straight above the second of two knobs set
     75.7 where the panel sets 50.

   - *Decibel scales* (R5): a meter on a decibel scale (`Meter.scale: 'db'`, `dbFloor` to `dbCeil`)
     comes in as layers. Every binding that places a part by the reading or the held peak reads it
     on that scale (`scale: 'db'` on a range or Counter Figures binding: interactionRuntime places
     the source with meterLayout's `decibelPosition`, the curve meterPosition uses), so the needle,
     the bar and its cover, lit cells, segments, an arc's sweep, the peak marker and a percentage
     legend stand where the meter puts them; the printed reading stays the raw value, as the meter
     prints it. The held peak falls on the same scale (`peakHold.scale`): the preview surface holds
     and drops it in dB, as the meter does, and hands it on as a fraction again (`decibelFraction`),
     so a binding reads the peak as it reads the value. The static layers are seeded through the
     same curve. Found on the way: an arc meter of segments drew the whole track arc behind them,
     where the panel draws only the segments and leaves the gaps open (Ceramic, 3 % of pixels
     apart); the track now comes only without segments. Run over every offered set's own meter on
     a -40 to +6 dB scale: with peak hold, 256 of 256 rows; turned 25 degrees and scaled 1.1, 256 of
     256 (strict).

   - *Zone colours* (R5): a device meter's part coloured by the meter's zones (`zoneColours`) comes
     in as layers. By position: each lit cell in the zone it sits in, each scale mark in its own
     (the marks grouped by colour, a layer each, drawn without an outline as the panel draws them),
     and a fill as the box painted in the zones' gradient along its direction, one layer to each of
     its cells (one, for a plain fill), each shown through a mask of the cell's shape placed where the
     cell stands and bound to the reading as the cell moves and grows: a rectangle with the part's
     corner in pixels (an SVG with no view box, so the corner keeps its size however the mask is
     sized) or an ellipse. Its outline is a rectangle growing over it. By the reading's zone ('level', or 'position' on a part with no
     positions of its own: a needle, a lamp, a legend): each layer whose paint the zone decides
     becomes a copy in each zone's colour (`zoneLevelCopies`). Stepped zones show one copy at a time,
     an Inside Only binding on its zone (and, for a lit cell or a clip lamp, no lower than its own
     level); blended zones stack the copies, each fading in across the span from the zone before,
     which composites to the meter's own blend of the two colours. The part's other paths come apart
     as the panel draws them: its own in its paint and outline, the zoned ones without, and a scale's
     marks past Zone From in its lit colour (they had been drawn in the part's own paint). Refused by
     name then, and layers since (R6, below): a fill by position in cells of another shape, or
     patterned and outlined; counter windows by the reading's zone; and blended level colour on lit
     cells, a clip lamp or a part you can see through. Run over every offered set's own meter with three zones: as the set draws it, 256 of
     256; the indicator by level (stepped), 256 of 256; the indicator and the scale by position, 248
     of 256, the eight Neon's and Obsidian's scale, which is counter windows, refused by name.

   - *A value from another control* (R5): a meter that shows another control's value (Meter
     `valueSourceId`, a knob or slider) comes in as layers. Its value names its source
     (`channel.valueSource`): `channel:<name>` when the knob came into the same component (the value
     that knob became), or the panel control's id when it stayed on the panel. Each time the
     component is drawn the value is set as far along its range as its source is along its own
     (`sourcedCustomValues`): the runtime does it for a source inside the component, wherever it is
     drawn, and the panel's preview surface for a panel control (read as the meter reads its Value
     Source, lcdRangeForSource), before its peak is held. So the value follows its source however
     that moves: a drag, a host's automation, a message from the synth. The value is over the
     source's range, as the panel's meter is while the source drives it, so its readout prints the
     source's value; it starts at the meter's own test value, at the same place along that range, as
     the panel's meter stands in the editor (where its readout prints the test value itself, the
     layers' that place in the source's range). Checked: the plan and the runtime (unit tests); the
     editor's canvas against the panel's on Graphite and Tolex, the place the same and only the
     readout's words apart. A meter's value in the editor's Preview could not be driven from the
     check (a value set there did not reach the canvas, for the panel's meter as for the layers).
     The designer shows it, as the owner approved in its mock-up (`utils/valueSources.js`): a value
     nothing in the component drives says on the Interact card what it follows ("follows Cutoff, a
     knob on the panel"), and Interact › Advanced › channel › Definition has **Value From**: its own
     value, another numeric value of the component, or a knob or slider on the panel (a source the
     panel no longer has is kept and said to be missing).

   - *Classic designs* (R5): a control drawn in a classic form (Core › Control design names one:
     Flat disc, Moulded pebble, Studio needle…) comes in as layers that draw what the panel draws. A knob in one
     of the twelve base forms comes in as its drawing (`utils/formDrawingLayers.js`): shape by shape
     as ControlAnatomy draws it in its 160 by 170 frame, fitted to the box as the SVG fits its
     viewBox, the form's Size scaling it about the knob's centre. Each shape is a filled path layer;
     a stroke is the band it paints, a path of its own (square ends, mitred corners, bevelled past a
     mitre of four, a dashed ring its dashes), so its opacity lies over the fill as the drawing's
     did; the dome and metal shading sit on the shape's own box, as strong as the form's Depth; the
     readout and the tuning dial's ends are text layers. What moves is bound to the value: the
     turning group about its centre (the tuning dial's small knob about its own), the disc's arc,
     the roller's ribs (the twelfth back to the top at the very end, an adding binding) and its
     marker, the tuning needle, the encoder's segments each lit from its own point of the travel over
     the faint ring of all of them. Its drag is the drag the same knob in parts has, as the panel's
     is. A form's parts (Convert to Parts) are close in spirit and not in pixels (the tab's card
     square where the drawing's is askew, the parts filling the box where the drawing keeps to its
     frame: 10 to 53 % of pixels apart), so a knob's drawing is not made from its parts.
     A button, switch or meter in a base form comes in as its parts, made on a copy
     (`withFormAsParts`) in the form's own colours: Core's Face, Housing, Ink, Legends and Indicator,
     a role kept a role, where Convert to Parts writes the set's roles. The drawing shows the
     control's colours, which a set fills from its roles and an author may since have changed.
     A gradient painted in SVG (the drawings, and every device part) is sampled for its layer
     (`unpremultipliedStops`, every 2.5 % and at each stop): SVG blends a stop's colour and its
     opacity apart, CSS premultiplied, and between a clear white and an opaque face the two part by
     a fifth of the shading (the pebble, lens, roller and scallop 2.4 to 7.9 % apart before).
     The synth sets' knobs (`new-<set>`) come in as their drawings too, read from markup: the knob
     branch of each drawing written out once as SVG (`utils/synthKnobDrawings.js`), with marks where
     the drawing used the value (a group that turns, an arc to the value, ticks that light), and
     read shape by shape (`utils/svgDrawingItems.js`: circles, ellipses, rects, paths, polygons and
     text, groups and their turns, fills and strokes, gradients by id). An SVG gradient is redrawn on
     the layer's own box from the shape's, where SVG measured it (a linear one's value rises across
     that box at an angle CSS can draw, its stops placed where the CSS line meets them; a radial one
     an ellipse in the layer's percentages), so a gradient on a stroke keeps its place. A group's
     drop shadow is its silhouette (the shapes marked to cast, hulled, or an outline drawn for it),
     lower, blurred, under it and turning with it, as the filter ran in the group's turned space;
     cast by a fill clear in places it is as clear there, the gradient's opacities in black. A glow
     is a blurred copy under the shape. Ticks drawn alike and not crossing share a layer.
     The five base buttons and switches whose parts only approximated their drawings are drawn
     outlines now: a device part takes a `path` shape (`shapePath`, SVG path data in 0..1 of its
     box, several outlines allowed; `shapePathOn` for pressed or on, a state on its layer, as the
     rocker tips, the latch sinks and the strap flips), Drawn Outline on the Button and Meter tabs.
     The forms' metal and dome are the drawings' own, written as white then black over the part's
     colour (the same over any colour, as strong as the form's Depth), which brings the Soft,
     Carbon, Console and Machined sets' keys to their forms' drawings (their starters regenerated).
     The synth sets' buttons, switches and meters come in as their drawings too
     (`utils/synthDeviceDrawings.js`, `utils/deviceDrawingLayers.js`), in the frame ControlAnatomy
     draws them in (a button's 160 by 100 with its caption under it, or laid out in the box's own
     pixels where the caption does not fit; a meter's 160 by 100). A button or switch is drawn
     twice, at rest and pressed or on, with the same shapes in the same order, and what differs
     (a key moved down, a lamp lit, a rocker tipped, an edge lit) is its layers' state while pressed
     or on. A meter's needle swings over its own arc about its own foot, its bar grows with the
     reading and the mark at its end moves with it, and each cell lights past its own point, as the
     drawings' `<` compares them; unlit cells drawn alike share a layer. No classic design is
     refused now but the two illustrated sets'.
     Checked against the panel on Graphite: the twelve base knobs 48 of 48 (four readings, at most
     0.27 % of pixels apart); the 36 synth knobs 144 of 144 (at most 0.54 %); the base buttons 12
     of 12, switches 12 of 12 off and on (0.12 %), meters 12 of 12 at four readings (0.26 %); a
     cushion and a rocker drawn in their parts against their layers, 0.00 %. The synth sets'
     devices as their drawings: buttons 36 of 36 (0.40 %), switches 36 of 36 off and on (0.46 %),
     meters 36 of 36 at four readings (0.78 %). Every offered set's own devices, drawn in their
     parts, after these changes (strict): buttons 64 of 64 in both sizes, switches 128 of 128,
     meters 256 of 256.
   - *The last meter refusals* (R6): what a meter drew that layers did not, now layers. Counter
     cells that fill or light (pattern Digits, motion Fill or Light): for each count of figures the
     reading can have, the part laid out as that many columns and drawn as a fill or a ladder is.
     Each of those layers, and every copy the zones make of it, shows only while the reading has
     that many figures: a Counter Figures binding, applied after every other, adds nothing to its
     opacity while it has and takes one off it while it has not (`meta.lengthGate` marks the layers
     until the binding is written). Counter windows took the same gate in place of the binding that
     set their opacity, so their zone copies (Neon's and Obsidian's windows by the reading's zone)
     keep it. Blended zone colour on a lit cell or a clip lamp: its copies blend as on any part, and
     a gate at the cell's level hides them all until the reading reaches it. On a part you can see
     through, a copy fading in over another no longer hides it, so each copy also fades out under the
     next as that one fades in (`zoneFadeUnder`): at alpha·(1 − s)/(1 − alpha·s) against the upper
     copy's alpha·s, which keeps the pair as opaque as the part and weighs the two colours as the
     meter blends them. That curve is four to eight straight pieces, adding bindings, so no colour
     strays more than about 2 % of the way between two zones'. A fill coloured by position in cells
     of any shape is masked by each cell's outline stretched to the cell, as a patterned fill's
     cells stretch, and an outlined one has each cell's outline as a layer growing with it. A bar
     meter on a track you can see through shows its fill through a mask as wide as the reading; an
     opaque track keeps its cover. For a shadow the whole control casts, a text layer counts by where
     its words are rather than its box, so a Ceramic meter with scale labels (their boxes as wide as
     the body, past the meter's edge) casts its shadow from its plate, as the panel does.
     Checked against the panel (strict): lit cells by level, blended, on Ember and Carbon 8 of 8;
     see-through lit cells on Pop and Bakelite 8 of 8; a see-through needle on Tolex 4 of 4; counter
     windows by level on Neon and Obsidian 8 of 8, stepped 4 of 4; counter digits that light, that
     fill, that fill by position and that light by level, 4 of 4 each; a fill by position in
     hexagons, in outlined columns and in an outlined ellipse, 4 of 4 each; a bar on a see-through
     track across (Graphite, Ceramic) 8 of 8 and upright 4 of 4; Ceramic and Graphite with scale
     labels 8 of 8, Ceramic with scale labels, ticks and readout 4 of 4. Every offered set's own
     meter after these changes 256 of 256, and with its indicator coloured by level, blended, 256 of
     256; every set's button 64 of 64 in both sizes and switch 128 of 128 (the text-layer change is
     theirs too).
     The last two, built as approved from their mock-up:
     - *Minus* (React tab, a binding): a binding may read its source less another value
       (`minus`, interactionRuntime's bindingSourceValue; seeding and a range's glide read it too).
       A range whose handles may pass each other (Allow Handle Cross) or wrap round the end (a
       knob's Allow Wrap-Around) comes in as layers, its handles kept in no order, as the panel
       keeps them. Everything that depended on their order reads the end less the start: a knob's
       arc runs from the start round to the end, through the gap when the end is below the start
       (360 degrees less what lies between them, no more than the sweep unless it wraps); a
       slider's bar runs from whichever comes first, its near edge moved back by that difference
       where it is below nothing and its length the difference either way; and a tick that lights
       between the handles lights outside them when they are crossed (one more adding binding, the
       step highlightStop takes). A slider's two handles of different sizes, laid out on two travels,
       are still refused by name. Checked against the panel (strict) on six sets of
       different kinds (Graphite, Ember, Tolex, Ivory, Carbon, Pop): knobs crossed, knobs with
       crossing allowed and in order, knobs wrapped, sliders across crossed and in order, sliders
       upright crossed, 24 of 24 each. Every offered set's (strict): knobs crossed 256 of 256,
       knobs wrapped 256 of 256, knobs as a range in order 256 of 256, sliders across and upright
       crossed 256 of 256 each. The wrapped run first found 9 rows apart on the sets whose cap turns
       with the control's own value (Chicken-head, Hex-drive, Gimbal-ring): a range keeps that value
       at its start, as the panel does (getSliderDefaultValues), and the component had given it the
       knob's own; it stands at the start now.
     - *Fires and Afterwards* (Interact card, a button's behaviour; utils/customButtonFiring.js):
       a button fires when pressed, when released (a toggle's way), after a hold, on a number of
       clicks within a window, again and again while held (at the press, after a delay, then every
       interval), or only while held (a momentary button's way); afterwards it is ready again,
       disabled, or locked for a time. A toggle flips when it fires; a momentary button sends its
       value on for a moment (150 ms, no more than half a repeat's interval). `pending` is set while
       a hold or a run of clicks is under way and `executed` for the moment it fires, as the
       panel's timed buttons set them; a spent button disables the component when it is the
       component's only behaviour. The preview surface (the panel and the plug-in player) and the
       Test Bench time it, by pointer and by Enter or Space. A timed button comes in firing after
       its hold or on its clicks, a one-shot firing on release and then disabled or locked for its
       lockout, a repeating one again and again; it looks pressed while held, as the panel's does.
       Pressed in Preview: a hold of 600 ms pending until it fires; a one-shot fired on release and
       then disabled; a repeat of 200 then 100 ms fired 6 times in 650 ms held. Radio, cyclic and
       combo-box buttons are still refused by name. Their look at rest against the
       panel (strict, eight sets): hold to confirm, one-shot and repeating, 8 of 8 each.

   Run after these, against the panel: every set's button 64 of 64 (strict), every set's switch
   turned 20 degrees and scaled 0.9 128 of 128, a meter of each kind 136 of 136 upright and turned
   25 degrees and scaled 1.1, a knob of each kind 120 of 120 and a slider of each kind 40 of 40 (the
   text layers they share changed), and the text, icon and effect cases above.

   `knobLayers.mjs` with `CE_KNOB_LAYERS_STRICT=1` checks every offered set but the two illustrated
   ones, and fails a control that comes in as one exact part or is refused. Run over all of them:
   knobs 256 of 256 rows (four readings each, at most 1.4 % of pixels apart), sliders 256 of 256 each
   way (0.1 %), meters 256 of 256 (1.0 %), buttons 64 of 64 in both sizes (1.9 %), switches 128 of
   128, off and on (0.7 %);
   `test/everySetAsLayers.test.js` plans each set's six controls (a knob, a slider each way, a button,
   a switch, a meter) through the real path.
   Value glide is carried: the knob's value-change animation (`pointerSlide`, 140 ms) becomes one on
   its channel over every layer property its bindings move that can ease, an arc's sweep included,
   which the part renderer eases in JS as the slider renderer eases a knob (CSS cannot ease an SVG
   attribute). The tracker drops it during a drag, as it does the knob's own.
   **Buttons and switches** (Button, MomentaryButton, ToggleButton) come in as layers only: a plain
   one as its plate and its text (the label's text part and rules), one drawn as a device as a path
   layer per part (housing, guard, key, symbol, indicator; `utils/deviceShapes.js` shapes over their
   pattern cells, placed as ControlAnatomy places the 160 by 80 frame) with its legend and caption as
   text. A bool channel; a toggle's grab area `toggleValue`, a momentary one the new
   `momentaryValue` action (on while pressed, by the pointer or by Space or Enter, off on release
   or a lost pointer, on the panel and in the designer's Preview). Pressed or on, a part's travel and swing are bindings, its lit
   colour, opacity and legend a state (`rule: '<channel> == true'`); the button's own hover,
   focus, pressed and selected looks are states on its layers. The pixel check compares them in
   Preview, off and on. Refused by name: control forms not made of parts, a part that moves on a key
   that turns, timed and one-shot buttons. A device part with a border is two layers, its
   fill and its edge, the edge an open path the part renderer strokes as the panel does (round
   joins, half outside the outline).
   **Meters** come in as layers only, with a display-only channel (no grab area) printed as the
   meter's readout. A plain one (MeterRenderer) as its plate, its track, the zones as one gradient
   over the whole track and a cover in the track's colour from the reading to the end (square at
   the reading, rounded at the end, bound by the reading), or its segments each lit from its middle,
   and its ticks. One drawn with device parts (`utils/meterParts.js`) as a layer per part in its own
   box, fitted as ControlAnatomy fits the 160 by 100 frame: a needle swinging, a pointer or marker
   sliding, a bar growing from its edge (a rectangle, so its corners keep their radius), lit cells
   each lit from its level and moved by the lit offset, a scale's marks and numerals, a fixed legend
   and the readout. A plain meter's readout, label (above or below, its line measured in its font,
   as it takes that much from the body) and scale labels are text layers, with the shadow or outline
   the meter draws them with (text layers draw a soft shadow and an outer outline now). An arc meter
   is its SVG fitted to the body: the track, its segments each lit by the reading, or one fill arc in
   the zones' colours whose sweep is the reading. An arc layer draws zone colours (`zones`, fixed to
   `zoneSweep`, blended or hard) as a conic gradient on a ring; the meter's own blended arc, 128
   spans, had a seam at every join, and its spans now overlap. Refused by name: peak hold and parts
   that follow the peak, decibel scales, zone-coloured parts, counter digits, legends that show the
   reading, patterned or shaped fills, a value taken from another control, and a bar meter's track
   you can see through (its fill shows under a cover in the track's colour).
   The pixel check compares, since buttons, by the other picture's 3 by 3 neighbourhood: a pixel
   differs when a channel falls outside that neighbourhood's range by more than 24, so a half-pixel
   edge or an anti-aliased one against a crisp one passes and a part missing, moved or recoloured
   does not (a switch compared with another set's: 47 %).
3. Channel curves (bipolar, exponential, stepped) take effect. **Built:** `utils/channelCurves.js`
   maps travel to value (Linear, Exponential and Logarithmic through a Centre value, S-Curve,
   Stepped with Steps and Hysteresis, Bipolar, Dead Zone). `normalizeCustomChannelValue` is the
   travel and `denormalizeCustomChannelValue` the value it gives, so the drag, the wheel and keys
   (`stepCustomChannelValue`) and artwork bound to `.normalized` move by travel; Bipolar adds
   `channel.x.bipolar` (-1 to 1) and rests at its centre. The exported parameter carries the curve
   and `PanelParameters.h parameterRange` gives the host's range the same maths.
4. A family may name a library component ("this set's knobs are Studio Knob 1.2"), placed as
   linked copies. **Built** (`utils/setLibraryComponents.js`). The two models differ (Behavior on
   built-ins, channels on components), so the component is not drawn over the knob: applying the set
   puts a linked copy where each knob was. The set holds `libraryComponents[type]`, the package as the
   library knows it; the exact version is used when the library has it, else the newest of its
   family. A component can stand for knobs and sliders with one value a drag moves, for buttons with
   an on/off value a press holds, for switches with one a click flips, for meters with one value and
   nothing that moves it; and the value's look must read it as travel (normalized, bipolar or its
   printed text), because a binding that reads the number maps it through a fixed input range and a
   copy carrying a knob of another range would turn past its end. A copy keeps the knob's id and
   name, place and size, layer; its value takes the knob's range, start and format; its device
   bindings move to the value; its plug-in parameter keeps the id the knob exported under; an export
   list entry is pointed at the value; its caption goes to the first published text no binding
   writes; and a script's `Cutoff.value` reaches it (panelRuntime's `value` shorthand names the
   placed channel). `Designer.setPlacement` records the knob. Applying a set that names no component
   for the family, or another one, puts the knob back from that record with what the copy has now
   (name, place, size, range, bindings back on the knob's own value, the live value). A copy's
   range, caption and placement record are classed as its own, as its position is
   (`customComponentSourceLink.setPlacementPaths`), so they are not design edits and an update keeps
   them. Knobs with a script of their own, two handles or bindings to other controls stay, as do
   meters taking another control's value or reading decibels; the Apply window names each. A set
   file carries the packages it names, and importing it adds those the library lacks.
   The Control Sets page draws the component too: its live preview runs its sample through the same
   plan (`controlsWithSetComponents`), and a set's card draws its one control as a copy
   (`drawnWithSetComponent`), its colour roles resolved for the set. A copy is fitted at the
   component's proportions into the control's box, centred, its layers scaled to it
   (`contentScaleMode: 'scaleInternals'`); the placement records both boxes, so the control comes
   back at its own size, following the copy if it was moved or resized. A control pinned to the
   set being applied takes its component as well.

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

**Built, first slice** (`utils/renderedLook.js`): a knob plate (housing, skirt, cap, insert) whose
`look` is `rendered` is drawn from `renderProfile` (smooth, knurled, fluted), `renderCount`,
`renderDepth`, `renderTaper`, `renderHeight` (percentages of its radius), `renderTop` (flat, insert,
dome), `renderMaterial` and `renderTopMaterial` (spun or brushed metal, gloss or satin plastic,
rubber) and `renderTopColour`, its fill colour the body's, lit by the set's lamp. The prototype's
shader, its painted indicator switched off: the pointer stays a part. Images are made one a frame,
cached by spec, size and turn; a grooved plate that turns needs eight, through one groove's repeat,
so the light stays put. Until one is ready, or without WebGL2, the plate draws its plain fill.
Export bakes them (`bakeRenderedLooks` in `preparePanelForExport`), each distinct image once, into
the document's `renderedLookImages`; the player loads them and draws them, no WebGL needed. Three
knobs: three images, about 120 KB each. The Knob tab edits it (approved mock-up): each plate's
**Look**, Flat or Rendered, and a rendered plate shows only what the render draws (size, turns,
profile, ridges and their depth, taper, height, top, the two materials and colours). A knob
with a rendered plate is refused as layers by name.

Fader caps and button parts are rendered too: a block (a rounded box the part's size, its top flat,
with an insert, ridged across the travel, a dome or a dish), or a turned body for a round cap or a
circular key. The shader, the specs and the drawing are in `utils/renderedLookCore.js`, which imports
nothing; `renderedLookJobs` lists the images a control needs, and the bake runs it over each control
as its set draws it (roles resolved), so the keys are the ones the plug-in's parts ask for. The export
tools that start from a saved file (`prepare-export-panel.mjs`, `export-panel-vst3.mjs`,
`export-panel-template.mjs`) bake in headless Chromium with that same file
(`tools/scripts/lib/bakeRenderedLooks.mjs`); without a browser they say so and those parts draw flat.
The Slider tab edits a cap's look (**Cap Look**, its fields going to all three handles) and the
Button and Switch tabs a part's (**Look** in its Appearance), as the approved mock-up showed.

A meter's housing and clip lamp render the same way (`renderedMeterPartSpec`): the housing a low
block in the meter's 160 by 100 frame (a bezel, 12 % of its narrower side high where a key is 30, the
face and scale drawn over it), a round lamp a turned body, and a lamp needs a second image in its lit
colour. A part the meter's zones colour keeps its flat drawing, since its colour moves with the
reading and no fixed set of images covers it. A meter with a rendered part is refused as layers by
name. The Meter tab edits it (approved mock-up): **Look** in the Housing's and the Clip Lamp's
Appearance, with the Button tab's fields; the housing's Height starts at 12, and a part with Zone
Colours on says it is drawn flat while they are.

### F. Filmstrips as their own category (small)

Image controls (imported strips, KnobMan or Blender renders, vendor packs) in a category of their
own in the Library, marked for what they cannot do. They use the filmstrip support that exists. A
tint per part (hue, brightness) is the one cheap kind of change they can take.

**Built** (the owner approved the mock-up): `isImageStripComponent` (`utils/componentLibraryModel.js`)
finds a component drawn from frames, by an enabled frames generator or a layer whose Image shows
frames. The Library tab's cards mark it **Image strip**; once the library holds one, a row above the
cards filters **All**, **Made of parts**, **Image strips**; and the detail column says what a strip
cannot do and that it tints per layer through Effects › Filters (brightness and hue rotation, which
parts already had).

### G. A knob's text as Labels of its own (medium)

A knob or a slider drew its name, its value and the ends of its range itself, from a Label section
of its own that took only part of the Text properties, so most of them did nothing on a set's knob.
The owner asked for the text to be separate: a knob is a knob, as a Label is a Label.

**Built** in three steps (the owner chose option B, then: placement by rule, Alt+click, convert):

- **Shows** (`utils/labelShows.js`, the words in `utils/labelText.js`). A Label shows its own
  words, or the name, value, min, max, unit, start or end of a control: the one it names, else the
  one it is attached to. The words are the control's own printing (its value format, a meter's
  prefix and suffix); the canvas reads the control as authored, Preview, the player and the plug-in
  its live value. A set letters a shown Label as it letters that part of a knob, where the author
  has not. The words are apart from the model because they read the interaction runtime, and the
  set resolution that reads the model must load in the plain-Node export tools.
- **Attached to** (`utils/attachedLabels.js`). A Label attached to a control moves with it however
  it is moved (every store write that moves a control goes through `withAttachedFollowing`), is
  copied with it and attached to the copy, goes into a container with it, and is deleted with it.
  Alt+click selects a control with its Labels; the tree lists them under it. The knob's **Labels**
  tab lists them and adds them (`utils/attachedLabelFactory.js`): the name above, the value below
  (in the middle when the knob reads it there), min and max beside the ends of the arc or under the
  ends of the track.
- **The knob draws no text.** Its track keeps no room for any; only the labels riding the handles
  are still the control's. The circle a knob is drawn round is worked out once
  (`utils/knobTrack.js`, from the control as drawn, its set applied), and the renderer, Preview's
  and the Test Bench's hit tests, the riding labels and Create Component from Selection all ask it.
  A value Label selected with its knob comes in as a text layer bound to the knob's channel.

The starters were re-exported with value Labels and attached titles; a panel generated from a
profile attaches each caption to its control and gives a knob a value Label. The example panels in
`CE/panels` have no knob of this kind, so there was nothing to convert.

**Meters and keys** (the owner chose: meters as the knobs; for buttons, the captions of keys drawn as
devices only). A meter draws no reading and no caption: its Meter tab's Labels section adds them
(+ Value printed with its precision, prefix and suffix, + Caption in the author's words). A Label can
show a control's own **text** (`Text.shows` 'text'), and a control whose text a Label shows prints
none itself (`textShownOwners`): a key drawn from its parts then gives the caption's room to the
device, and a flat key its face. The text stays the button's, so scripts and states still set it.
A flat button's face legend stays its own unless the author asks for a Label; illustrated sets and
the classic forms print theirs as part of the drawing.

**What the old text left behind is gone** (the owner: CEditor is in beta, existing panels need not
carry over). The settings for text a knob or a meter no longer draws are out of the model, the set
recipes and the shipped sets and starters: a knob's show readout, show min/max and the placement,
gap and offset of its title, value and ends; a meter's show value, label and label position. What
was left of the readout's placement is `Behavior.valueLabelPlacement`, 'below' or 'center': where
the Labels tab puts a value Label. `ce.components.meter` lost `label()`, `labelPosition()` and
`showValue()`; a script reaches a meter's reading and caption as the Labels they are.

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
  from its pixels (`drop-shadow()`), not its box. A mask may be unlinked (`linked: false`): its
  rect is then in % of the artboard and it is drawn on a wrapper the artboard's size, so the layer
  moves under it. The Component Designer edits masks as the owner approved in the mock-up: each
  masked layer shows its mask beside its thumbnail in the Layers list (click: edit, Shift-click:
  off and on, the link: linked or not), and the dock's Mask tab (`components/MaskTab.svelte`) has
  Enabled, Invert, Linked to Layer, the mask's place and size, Fit to Layer, Add Mask, Load Image
  (an opaque picture's brightness becomes its alpha), Mask With Layer (another layer's outline,
  `utils/layerMaskOutline.js`) and Delete Mask.
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

Built: SVG and Photoshop as layered components, and the Blender add-on writing a layered PSD
(`tools/blender/ceditor_layers.py`; docs/panel-artwork-import.md says what it writes). Next: .ai
through its PDF part if Illustrator files are wanted directly; a Figma plugin if Figma is; Level 3
with piece E; Level 2 when somebody needs a shape only Blender can make.

What building the add-on found, against Level 1 as written above:

- **Seams where parts meet.** Rendered each with the others held out, two parts meeting along an
  edge each cover part of its pixels, and laid over each other the pixels show through by a quarter.
  Each part's opacity is now its coverage of what the parts above it leave, so the part under an
  edge fills it.
- **Light layers at a part's edge.** A multiply or an add on a pixel the part only partly covers
  reaches what is beside it in the pixel too. There the part's whole look is in its colour layer,
  and the light layers come in over the next three pixels: switching at one stroke showed as a light
  ring once CEditor scaled the layers, which it always does (zoom, panel size, a screen of two pixels
  to the point). The add-on's test now draws the layers twice the size and holds them to the picture
  scaled.
- **A turning part's reflection.** A metal cap mirrors the pointer's end; rendered without the
  pointer, the cap lacked it. The shadow catcher's ratio over 1 is that light, written as a layer
  that turns with the pointer.
- **The panel.** CEditor lays a component's layers straight onto the panel (measured: a part's blend
  mode reaches the panel surface, no element between composites the component on its own), so a
  layer of light brightens the panel. The scene's panel is taken to be the one the control goes on
  ("For this panel", on by default), and three things that depend on it are made for it: the outline
  mixed as Cycles mixes it, in linear light; a lit lamp's outermost pixels, lit as on it; and the
  light the parts and the lamps throw on it, as layers (the lamps' shown when they are lit). On that
  panel the layers give Blender's whole render back within a few levels, in the test and in the
  editor itself (a 320 px knob on a panel of the scene's colour: mean 0.9, 99th percentile 4, at
  rest and turned with the wheel). Off, or with no panel object, they are made for no panel in
  particular.
- **Cycles' shadow catcher** gives the shadow for what a part leaves of a pixel, not the pixel as a
  whole. Taken for the whole, the shadow under a part's outline came out black, 40 levels off on the
  panel.
- **A turning part's shadow** turned about the axis swung round with the part and, at half a turn,
  fell on the side towards the light. Shadows now turn about a point of their own, half their reach
  from the axis towards where they fall (the light that lights the part most, and the part's height):
  the import reads a pivot named after a layer ("pointer shadow pivot") as that layer's own. Exact on
  a flat surface under one light; on a metal cap the shadow is partly its shine blocked, and how dark
  it is changes as the part turns, which a layer made at rest does not; the part's reflection in the
  cap is made at rest as well.
- In a dial, a lamp's lit layer and its light on the panel are not wired to anything (only switches
  and buttons light theirs).

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

Taken by the owner, 2026-11-03:

4. **Rendered looks (E): live in the editor, baked into the plug-in at export**, as recommended. The
   plug-in needs no WebGL, and Linux, whose webview has no GPU, needs no JUCE patch.
5. **A set that names a library component (D4): later.** Taken up the same day and built as the
   approved mock-up showed: chosen in the family's row, placed and put back by the Apply window.

Taken by the owner, 2026-11-05:

6. **A knob's text is Labels of its own (G).** "A label is a label as a slider is a slider." Option
   B: a Label shows a control's name, value or range, and can be attached to it; a knob inserted
   new comes with none. The Labels tab places a new one by rule; Alt+click selects a control with
   its Labels; the example panels are converted once by a script (there turned out to be nothing
   in them to convert).

Taken by the owner, 2026-11-05 (after the mock-up of meters and keys):

7. **A meter's reading and caption are Labels too, as the knobs'.**
8. **A key's caption is a Label where the key is drawn as a device; a flat button keeps the text on
   its face.** It lights up and moves with the key there, and already takes every text setting.
