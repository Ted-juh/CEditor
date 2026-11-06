# Panels and components from drawn artwork, and components that stay linked

Two editor workflows for building panels quickly and keeping them consistent. Both are in the web
editor and need nothing from the native build.

## New Panel from Vector Artwork

**File › New Panel from Vector Artwork…** turns an SVG drawn in Inkscape, Illustrator, Affinity or any
other vector editor into a new panel; a PDF, or an Illustrator file, comes in the same way (see
[From a PDF or an Illustrator file](#from-a-pdf-or-an-illustrator-file)). The drawing becomes the background, and the placeholders
you drew become real controls on exactly the spots you drew them.

### Drawing the placeholders

The convention follows VCV Rack's, which has built thousands of module panels this way.

1. Draw the panel artwork as usual: faceplate, legends, scales and screws.
2. Add a layer named **`components`**. `controls`, `placeholders` and `ceditor` also work. Inkscape
   layer names, Illustrator layer names and plain group ids all count.
3. In that layer, draw one **rectangle, circle or ellipse** per control, covering the area the control
   should occupy. Hiding the layer is fine; it is read either way and is never drawn on the panel.
4. Say what each placeholder is, **either by name or by colour**:

| Name contains | Becomes | Colour, if unnamed |
|---|---|---|
| `knob`, `pot`, `rotary`, `encoder`, `dial` | Knob | red circle |
| `slider`, `fader` | Slider (vertical if taller than wide) | red long rectangle |
| `button`, `btn`, `momentary`, `trigger`, `pad` | Button | red square-ish rectangle, or green |
| `toggle`, `switch`, `latch` | Toggle button | — |
| `led`, `lamp`, `light`, `indicator` | LED (see below) | magenta |
| `label`, `text`, `caption`, `title`, `legend` | Label | blue |
| `display`, `lcd`, `screen`, `readout` | LCD display | yellow |
| `meter`, `vu` | Meter | — |
| `menu`, `combo`, `dropdown`, `select` | Combobox | — |

The keyword can sit anywhere in the name, and the other words become the control's name:
`knob-cutoff`, `Cutoff knob` and `knob cutoff` all produce a knob called `cutoff`. Names are read
from the Inkscape object label, then its Title, then the Illustrator layer name, then the id.
Names editors assign automatically (`rect12`, `circle4`) are ignored.

Colours can be approximate, since a hand-picked red is rarely exactly `#FF0000`. Fills set through
CSS classes, as Illustrator writes them, count.

### What you get

- A new panel sized to the drawing. Millimetres, inches and points are converted at 96 px per inch,
  so a 128.5 mm tall drawing makes a 486 px tall panel.
- The drawing, minus the placeholder layer, as the panel's background image (fit: fill). It is
  embedded in the panel, so it survives Save and Share Panel.
- One control per placeholder, positioned and sized on its bounding box after every group transform
  (translate, scale, rotate, matrix). Labels get a transparent background and type sized to the box.
  Buttons get no legend of their own, because the artwork prints it.
- A report in the Console. It lists every placeholder whose type came from its colour or shape
  rather than its name, and every one that could not be placed, with the reason.
- **Text in the artwork keeps its font.** A browser draws an SVG background without the page's
  fonts, so the fonts the artwork's text names are carried inside it: the panel fonts and any font
  you imported under Settings → Fonts, each cut down to the characters the artwork uses. The
  background is replaced with that copy a moment after the panel opens. Text in a font CEditor
  cannot supply draws in a fallback font and is reported. Import the font and import again, or
  convert the text to outlines in the drawing program.

### Limits

- **Only rectangles, circles and ellipses are measured.** A path, line, polygon, text or `<use>` in
  the placeholder layer is reported and skipped; convert it to a rectangle or circle.
- **LEDs** are placed as display-only lamps: a toggle showing only its lamp, dark red when off and
  glowing when on. A click doesn't light one; bind its `state` port to a synth parameter and the synth
  does. They export no host parameter, as an indicator shouldn't.
- **New Panel** always makes a new panel. To bring a revised drawing into a panel you have already
  worked on, use **Update Panel** (below).
- To discard an import, close its tab without saving. It is a new, unsaved panel until you save it.

### From a PDF or an Illustrator file

The three Vector Artwork commands (New Panel, Update Panel, New Component) open a `.pdf` or an `.ai`
as well as an `.svg`. An Illustrator file saved with **Create PDF Compatible File** (Illustrator's
default) carries a PDF copy of its artwork; CEditor reads that copy with pdf.js (Mozilla, Apache 2.0)
and turns it into an SVG in memory (`utils/pdfArtwork.js`), which the SVG import then reads as it reads
any other. A PDF from Affinity, Inkscape or anywhere else comes in the same way.

| In the file | In CEditor |
|---|---|
| Top-level layers | Groups named after them: `components` for a panel's placeholders, `pointer`, `cap`, `lamp on` for a component's parts. A layer switched off comes into a component hidden (as a hidden Photoshop layer does: a switch's lit look), and stays out of a panel's background |
| Paths, fills, strokes | Vector layers, with their widths, caps, joins, dashes and fill rule. A closed run of four lines along the axes is a rectangle, and four curves through the ends of the axes an ellipse or a circle, so a panel's placeholders are measured |
| Gradients | Linear and radial: the shape filled with the gradient (Illustrator writes the shape as a clip and paints the gradient inside it). A mesh or freeform gradient is drawn in its mean colour |
| Clipping masks | The layer's mask, as for SVG |
| Opacity, blend modes, transparency groups | Kept |
| Placed and embedded images | Picture layers |
| Text | Text in the font the file names, its size and colour |
| CMYK colour | Converted as pdf.js shows it, as Acrobat does without colour management |
| Sublayers and object names | Not read: Illustrator keeps them only in its own private data, which is undocumented. Name a moving part as a top-level layer, or export SVG |
| Artboards, pages | One is read; with several the import asks which |

So a panel's placeholders, which a PDF keeps no names for, are typed by their colour and shape (red
circles knobs, long red rectangles sliders, and so on, as above), and the notice says so; rename the
controls after. Opacity masks, pattern fills and image masks are not drawn, and the Console lists
any the file had. An `.ai` saved without PDF compatibility holds only Illustrator's own format, and
is refused with what to do: save it again with Create PDF Compatible File ticked, or use Export As ›
SVG.

## New Panel from Photoshop Artwork

**File › New Panel from Photoshop Artwork...** does the same from a `.psd`:

- A **layer group** named `components` (or `controls`, `placeholders`, `ceditor`) holds the
  placeholders, one layer per control, at any depth. The group may be hidden.
- Each layer is placed on its bounds, the box Photoshop keeps around the layer's pixels. Its
  **name** says what it is, exactly as for SVG (`knob-cutoff`, `slider volume`). With no keyword, its
  **colour** decides: red is a control (a long layer a slider, otherwise a knob), green a button,
  blue a label, magenta an LED, yellow a display.
- Every other visible layer is flattened into the background, with each layer's opacity and its
  group's.

The flattening follows Photoshop's own rules. It draws every blend mode, Opacity and Fill,
layer masks, clipping masks, and groups the way Photoshop does: a Pass Through group paints its
layers straight onto what is below, and a group in any other mode is put together first and then
blended in as one layer.

It cannot draw four things:

- layer styles (effects), such as shadows, glows and strokes;
- vector masks;
- adjustment layers;
- Dissolve's noise. A Dissolve layer is drawn as Normal.

Each affected layer is named in the Console. The fix is to merge or rasterize that layer in
Photoshop before importing.

**File › Update Panel from Photoshop Artwork...** brings a revised file into the panel you already
worked on, by the same rules as the SVG update below. Controls are matched to their layers by
**layer name**, so keep the names stable between revisions.

## New Component from Vector Artwork, and from Photoshop Artwork

Where the panel importers make a panel with the drawing as its picture, these make the drawing the
control: a custom component, every shape (SVG, PDF, Illustrator) or layer (Photoshop) one of its
layers, opened in the Component Designer to change and save (`utils/svgComponentImport.js`,
`utils/psdComponentImport.js`). A PDF or an `.ai` is read as an SVG first, as for a panel above; its
parts are named by its top-level layers, and the notice lists them.

- **SVG**: each `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon` and `path` is a vector
  layer with its transforms applied, its fill (a colour, a linear or radial gradient, a pattern drawn
  as its picture), its stroke as the layer's outline (a gradient stroke as the outline's gradient),
  and its opacity; Illustrator's class rules are read. `<text>` is a text layer, an `<image>` a
  picture layer (a linked one read from beside the SVG, in the desktop app), `<use>` the shape it
  uses. A plain filled shape under a clip path is cut to it and stays one vector; a `<mask>`, or a
  clip on text, a picture, an outlined shape or several clips, becomes the layer's mask: an SVG
  picture of the mask, made from the file's own definitions, drawn with CSS masking.
- **Photoshop**: each pixel layer is a picture layer cropped to its pixels, the layers clipped to it
  blended in, its opacity, blend mode and visibility as the layer's. Each shape layer is a vector
  layer: its paths combined by their operations, its fill colour or gradient, its stroke. A layer
  mask and a vector mask are the layer's own mask, kept off if Photoshop had them off. Drop Shadow
  and Outer Glow are the layer's shadows (a picture casts them from its pixels); on a shape layer,
  Color and Gradient Overlay, Stroke, Inner Shadow, Inner Glow and Bevel become its own settings; on a
  picture they are drawn into it, with Satin, close to Photoshop's. Adjustment layers (Levels, Curves,
  Exposure, Invert, Posterize, Threshold, Channel Mixer, Gradient Map exactly; Brightness/Contrast,
  Hue/Saturation, Vibrance, Color Balance, Black & White, Photo Filter, Selective Color closely; Color
  Lookup from the .cube, .3dl or .look table the layer carries) are applied to every layer under
  them, pictures and colours alike. A Color Lookup through an ICC profile is not. Pass Through groups are unfolded; a group with its
  own mode or mask is one layer. Text layers stay text where the file says their size and colour.

**A picture's colour** (`utils/pictureRecolour.js`). A picture layer (`Background.Fill.imageColour`)
and a part of frames (`Image.colour`) have a colour of their own: a colour or a control set's role,
empty for the picture as drawn. Beside it the colour it was drawn in (`…Drawn`: measured on import
as the median of the pixels the layer covers most; measured when drawn for a picture that came in
another way). A picture with the light on it written beside it (`…Lighting`, `…Gloss`, from the
Blender add-on, below) is worked out again in the new colour together with its shading and
highlights (`…Follows` it with `…Role`), as the add-on works them out, so it is lit as Blender would
light it; so is what it lights beside it, another part or the panel, with the light the add-on wrote
of it there (`…Bounce`). Any other picture is changed in proportion, each pixel, each channel, alpha untouched:
`new = old × colour / drawn`, so the drawn colour becomes the new one and the rest keep their
proportion to it; so too a layer that only follows another's colour (a turning part's reflection in
a metal). Worked out on the pixels once per colour, before the outline mixing and the baking of
parts that never change, so the editor, the Player, an exported plug-in and the filmstrip baker all
draw the same picture. The Component Designer's look bar and the Colors dock edit it;
light (a picture that multiplies, adds or dodges, or is named shading, highlights, shadow,
reflection, shine or bounce) has none, and points to the layer it lights. `Fill.imageTint` stays the
30 % wash it is for panel backgrounds and textures.

**What moves comes from the names**, anywhere in a layer's name or its group's, as whole words:

| Name | Does |
|---|---|
| `pointer`, `indicator`, `needle`, `rotor`, `marker`, `turns` | turns with the value, -135° to 135°, the drawn angle in the middle |
| `pivot`, `centre`, `axis` | where those turn; without it, the middle of the knob they sit on. Named after a turning layer as well (`pointer shadow pivot`), where that one layer turns |
| `... at <angle>` | a turning layer drawn as it looks turned that far (`pointer reflection at -27`, `at 27`, `at 54`): pictures of one name become one part of frames that turns with the value, its frame following it and the two either side mixed; other layers fade from one to the next |
| `fader`, `thumb`, `handle`, `slide` | slides along the `track` (`slot`, `rail`), the value 0 at the bottom or left |
| `lamp`, `led`, `light`, `on` / `off` | shown when the value is on / off; on a dial, with a value of their own, **Lamp** |
| `pressed`, `down` | shown while it is held |

The control is wired from what was found: a dial, a fader, a switch, or a button when the file or a
layer is called button. With nothing named to move it is layers only. Not `cap`: a cap's highlight
would swing round with it; name a cap that should turn `rotor`.

Listed in the Console: what was drawn close to rather than exactly (Photoshop's Bevel, Satin and the
approximate adjustments), Color Lookup through an ICC profile (not applied), adjustment
layers inside groups with their own blend mode, and references to anything not in the file.

## New Component from 3D Model (glTF)

**File › New Component from 3D Model…** opens a glTF file, the exchange format Blender writes with
File › Export › glTF 2.0 (a `.glb`, or a `.gltf` and the files it names beside it, which the desktop
app reads from there; the browser cannot, and asks for a `.glb`). It makes a component whose 3D part
(the Component Designer's, rendered by CEditor with three.js) is the model's objects
(`utils/scene3dGltf.js`):

- Each top-level object is an object of the 3D part, moving by the words of its name, as the other
  importers read them: `pointer` turns, `lamp` lights with a value of its own, everything else stays
  put. One named `pivot`, `axis` or `centre` is where the knob turns; without one, a turning object's
  origin; without that, the middle.
- Its material: the base colour (in sRGB), metalness and roughness, which the 3D tab can change. Its
  shape is the file's.
- An object named `panel` (`ground`, `floor`, `backdrop`) is the surface it stands on and is not drawn:
  the panel the control is placed on stands in for it, its shadow and all.
- The model is turned from glTF's y up to look down on it, and fitted to the 3D part's square about the
  knob's axis. Its camera, lights and textures are not used, and the notice says so.

The model is kept in the component (as the file's bytes), so it renders again when a setting changes.
It draws as a real-time renderer does: soft shadows and a studio's reflections, but no light bouncing
from one part onto another, so it is close to Blender's Eevee, not to Cycles. For a knob that must look
as Cycles draws it, the add-on below writes Cycles' light into the file.

## A control drawn in Figma: the CEditor Export plugin

Figma's own file format is undocumented and changes without notice, so CEditor does not read it.
`tools/figma-plugin` is a Figma plugin (Figma's supported way out), imported once in Figma from its
`manifest.json` (Plugins › Development › Import plugin from manifest). It needs no account, token or
network, and says so in its manifest. It does for Figma what the Blender add-on below does for
Blender:

- Its window lists each layer of the selected frame, component or component set and what it will do
  in CEditor, by the words above (it keeps a copy, which `test/figmaPlugin.test.js` holds to the
  importer's), and warns about a layer with Figma's own name (`Ellipse 12`: it stays put) and about
  effects.
- **Save SVG for CEditor** saves the selection as Figma writes SVG, each layer's name its `id`, which
  the importer reads as the name; File › New Component (or New Panel) from Vector Artwork opens it.
- **Variants as states** (on by default): a component set's variant whose property says on
  (`State=On`, `On=true`, `Lit`) is drawn as a group named `on`, shown when on; off as `off`; pressed
  or down as `pressed`, shown while held; the variant at rest as it is. Inside a state's group, names
  that say a state of their own (a `lamp` in the off look, the variant's own `State=Off`) are dropped,
  so the group's state is the one that counts. Variants that differ in anything else (`Size=Large`)
  are left out; the default's are used.
- **Flatten effects into pictures** (off by default): the importer does not draw SVG filters, so a
  drop shadow, an inner shadow or a blur would be lost. With this on, each layer is saved on its own,
  and one with an effect as a picture of how Figma renders it, effect and all, where Figma draws it. A
  frame with a mask layer is saved whole, since a mask between layers would be lost.
- **Keep text as text** (on by default): text as SVG text, else as outlines.

It is tested here against a stand-in for Figma's plugin API and its window in Chromium; it has not run
in Figma itself.

## A knob modelled in Blender: the CEditor Layers add-on

`tools/blender/ceditor_layers.py`, installed in Blender (Edit › Preferences › Add-ons › Install),
writes the objects of a Blender scene as a layered Photoshop file for New Component from Photoshop
Artwork: File › Export › CEditor Layers (.psd), or the CEditor tab of the 3D Viewport's sidebar,
which lists what each object will do before it is written. The names are the ones above; the
add-on keeps a copy of the words, which `test/blenderLayersImport.test.js` holds to the importer's.

Each object is rendered by Cycles on its own, from straight above, with the others of its group
held out, and written as the layers its look adds up from:

| Layer | Blend | What it is |
|---|---|---|
| `<name>` | normal | its own colour, unlit (a metal's is what it reflects) |
| `<name> lighting`, `<name> gloss` | normal, hidden | the light on it without its colour, and the light it reflects whatever its colour, in linear light (8 bits over 1/256 to 256, a step of 4 %); read with it on import, not layers of their own |
| `<name> lighting from <part>`, `<name> gloss from <part>` | normal, hidden | the light another part throws on it by way of that part's colour, and what it adds to its gloss, in the same 8 bits; read with it on import |
| `<name> shading` | multiply | what the lights and the room do to that colour |
| `<name> highlights` | linear dodge | its reflections, and light brighter than its colour |
| `<name> lit` | linear dodge | a lamp's glow, shown when the lamp is on |
| `shadow` | normal | the shadow on the panel: black, its darkness as opacity |
| `bounce`, `bounce shine` | colour dodge, linear dodge | light the parts throw on the panel (a metal cap's glare): what the panel's colour scatters, and what its shine reflects |
| `bounce from <part>`, `bounce shine from <part>`, `bounce base` | normal, hidden | the share of the panel's light that comes off that part's colour, and what it adds to the shine (8 bits over 1/4096 to 16); the panel's look under them; read with the bounce on import |
| `<lamp> glow`, `<lamp> glow shine` | colour dodge, linear dodge | a lamp's light on the panel, the same two ways, shown when the lamp is on |
| `<name> shadow`, `<name> reflection` | normal, linear dodge | a sliding part's shadow and reflection on the panel and the parts under it, which move with it |
| `<name> at <angle>`, `<name> shading at <angle>`, ... | as above | a part that turns whole, its shadow and its reflection, rendered with it turned that far: one each 27 degrees, those away from rest hidden |
| `pivot` | normal, hidden | where turning parts turn |
| `<name> shadow pivot` | normal, hidden | where a turning part's shadow turns |

A part named `rotor` (a round, knurled or fluted cap) has its colour turn and its light stay; a
lamp's body keeps a name without its role word (`lens`), so only its glow lights. On a dial the lamp
lights with a value of its own, **Lamp**, on or off (on as the file shows it), for the panel to set
with a binding, a script or the device. The pointer is modelled pointing up, the middle of its
travel; the camera looks straight down (the scene's own when it is orthographic, else one is made);
without a panel object, a plane is put under the control to catch its shadow. The renders run in a
scene of their own, and the author's is left as it was.

**The panel.** CEditor lays a component's layers straight onto the panel it is on (a layer's blend
mode reaches the panel, nothing composites the component on its own first), so what depends on the
panel is worked out for whatever panel the control is on:

- *The light on it* brightens it in proportion, as light on a surface does. What the panel's colour
  scatters is written as colour dodge, a multiple of what is there: on a dark panel it brightens it
  a little, on a light one a lot. What its shine reflects is added, the same on any panel. The add-on
  measures both from the panel's own render passes, with the parts there unseen and without them.
  (Colour dodge is written at full opacity, the only way it multiplies on a light panel too; laid
  over nothing, as in Photoshop's own view of the file, it shows as a dark patch.)
- *The outline.* Where a part covers only some of a pixel, Cycles mixes it with what is behind in
  linear light, a browser in sRGB, so a pale part's edge on a dark panel came out too dark. The parts
  that stay put are written as they cover each pixel and named in the file's XMP, and CEditor mixes
  their edge for the colour under the control (the panel's, or a plate filled with a colour under
  it; under a gradient or a picture, the panel's colour) and the component's own layers under the
  part (`utils/linearEdges.js`).
- *A lit lamp's outermost pixels*, which Cycles shows lit out to where the lamp covers a quarter of a
  pixel while the panel still shows through, are lit as on the scene's panel (**For this panel** in
  the export, on by default; off, or without a panel object, as on black).

**A part's colour.** Cycles adds a part's gloss to its colour in linear light, and a browser lays
layers on in sRGB, so layers split for one colour do not add up for another: changed in proportion,
a darker colour's weak channels came out a few levels short of Blender where the part is glossy, and
a metal's glint, many times white, went dark. So the add-on writes beside each colour layer the light
on the part without its colour (Cycles' diffuse light passes, a metal's glossy ones) and its gloss,
in linear light, past white too; and CEditor, given a new colour, works out the part's colour,
shading and highlights layers again as the add-on works them out: each pixel the new colour times
that light plus the gloss, split as the add-on splits it, with its highlights over the whole inside
so that light can come where there was none. The colour there is the colour layer's own where the
part covers the pixel whole, else the colour it was drawn in, and the add-on writes the gloss past
exactly that, so that worked out again in the colour it was drawn in, the part is as written. The
file's XMP names each colour layer's shading and highlights (`<ceditor:colourOf>`,
`skirt highlights=skirt`), and a turning part's reflection that falls mostly in a metal part, which
changes with the metal's colour in proportion; `<ceditor:metal>` names the metal parts, whose light
past white is kept in their highlights. Cycles' light passes are per sample the part covers, unlike
its colour passes, and are not divided by its coverage.

**The light it throws.** A part's colour lights what is beside it too: a red skirt casts red on the
panel by it, a brass cap a warm light on the skirt under its rim. So the add-on renders each part
that stays put again colourless (its base colour black, its gloss kept), and writes the difference:
on each other part, the light and gloss that come off that part's colour
(`skirt lighting from cap`); on the panel, the share of its light there that comes off it and what
it adds to the shine (`bounce from skirt`), with the panel's look under them (`bounce base`). Given
a new colour, CEditor scales each by the change of colour, in linear light, channel by channel: a
part it lights is worked out again with that light added, in its own colour; on the panel, the light
there is scaled and the shadow, the bounce and its shine are worked out again for it: the shadow a
multiply where the panel must darken (black at an opacity is a multiply by black at that opacity),
the bounce where it must brighten. The bounce and its shine cover every pixel such light reaches,
adding nothing where there is none. A part that turns keeps its drawn colour in the light it throws.

**A turning part.** The light stays put while the part turns, so what it does with the light
changes: its own light (the side towards the sun lit, the sun's glint on it), its shadow on the
panel and the cap, its reflection in a metal cap. Each is rendered with the part turned every 27
degrees, a tenth of a dial's travel, and written turned back to rest, `... at <angle>`. CEditor's
import makes each set one part of frames, which turns with the value and whose frame follows it,
the two frames either side mixed by how near each is (`utils/imageFrames.js`: mixed inside the part,
so that two shadows or two multiplies half way between are their mix, not a quarter lighter). Its
shadow turns about a point of its own (`<name> shadow pivot`), half its reach from the axis towards
where it falls, so it stays on the side away from the light. A finer step measured no nearer to
Blender (13.5 and 9 degrees: the same to a tenth of a level, at twice and three times the export
time); what is left is the picture turned twice, back to rest in the add-on and on again in the
browser, which softens a narrow part's glint, and the add-on turns it back through a Lanczos window
for that.

**How exact.** `tools/blender/test_ceditor_layers.py` (run with `blender -b --factory-startup
--python tools/blender/test_ceditor_layers.py`) builds a knob (a pale skirt, a metal cap, a rounded
orange pointer, a lamp beside it), writes it, renders Blender's own images of it and checks the
layers against them, laid as CEditor lays them:

- the knob itself, the edges where its parts meet included: a mean 0.6, the 99th percentile 1 level
  in 255;
- on the panel it was modelled on, the whole picture, outline, shadow, lit lamp and its light on the
  panel included: a mean 0.8, the 99th percentile 5;
- on a dark, a light and a red panel, Blender rendering the knob on each: the whole picture within a
  mean 0.9 to 1.4, the 99th percentile 6; the light on the panel within 2 to 6 levels at the 99th
  percentile (made for the scene's panel and added, as the add-on wrote it before, 15 to 17); the
  outline mixed for the panel within a mean 1.4 to 4.4 (in sRGB, 5.7 to 11.1);
- drawn twice the size, as a browser scales each layer before it blends them;
- in another colour, against Blender rendering the knob with that material changed, where the part
  covers the pixel: the skirt red within a mean 1.45 levels, the 99th percentile 4, and the metal cap
  brass within 1.1 and 5, its glint included (changed in proportion with their light as rendered,
  8.1 and 15, and 8.1 and 105); worked out again in the colour each was drawn in, within 3 levels of
  the file. Just beside each, what it lights (the panel by the skirt, the skirt by the cap) is lit in
  the new colour as Blender lights it: within a mean 1.8 and 1.5 levels (with the light it throws
  kept as rendered, 4.6 and 10.4), the part's edge 2.6 and 1.2;
- turned 120 degrees: the pointer's shadow where Blender casts it (0.2 px off at 160 px; the shadow
  at rest turned about the axis is 6 px off, on the side towards the light); the pointer's own light
  within a mean 11 levels (its light at rest, turned, 63); its reflection in the cap beside it at
  the 99th percentile 6 (10); the cap round it, its shadow on it included, a mean 0.9 (1.4).

Where a part covers only some of a pixel by itself (at its edge, or under another's) its whole look
is in its colour layer (a multiply there would reach what is beside it); the light layers come in
over the next three pixels, and a layer under a part goes two pixels on under its edge, so that the
layers still add up when the browser scales them or turns them. Cycles' shadow catcher gives the
shadow for what a part leaves of a pixel, not the pixel as a whole; the shadow layer, under the
parts, darkens just that. `--fixture` writes the small file the web suite reads
(`test/fixtures/blender-knob.psd`), checked by `test/blenderLayersImport.test.js` for what turns,
about where (the shadow about its own point), in which modes, which frame shows as the pointer
turns, the parts whose outline CEditor mixes, the lamp's value, each colour layer's drawn colour,
light, gloss and light layers, the light each part throws on the others and on the panel, and for
CEditor's compositor drawing it as the add-on composed it. `--fixture` also writes Blender's renders
of the knob with the skirt red and the cap brass (`test/fixtures/blender-knob-recoloured.json`), to
which the suite holds CEditor's own recolour (within a mean 1.4 and 1.1, the 99th percentile 4 and 5)
and what each lights beside it (the panel by the skirt, the skirt by the cap: a mean 2.2 and 1.5 levels);
`browser-checks/pictureColour.mjs` changes the skirt's colour in the editor and on a panel.

## Update Panel from Vector Artwork

Artwork gets revised, and by then the panel has bindings, scripts and links. **File › Update Panel
from Vector Artwork…** brings the open panel up to date with a new version of its drawing, and keeps
that work. Before changing anything it shows what it will do and asks.

What it changes:

- **The background** is replaced with the new drawing, and the panel is resized if the drawing was.
- **A control moves only if its placeholder moved in the drawing.** A control you nudged in CEditor
  keeps your position while the drawing leaves it alone. If both moved, the drawing wins and the
  summary names the control.
- **A new placeholder becomes a new control.**

What it never does:

- **Delete a control.** A control whose placeholder is gone is kept, bindings and all, and listed so
  you can decide.
- **Re-add a control you deleted** from the panel while its placeholder is still in the drawing.
- **Change a control's type**, or anything about it except position and size. If a placeholder now
  says `slider` over a knob, the knob is moved and the mismatch is reported.

How controls are matched to placeholders:

1. **By the placeholder's name**, or its id if it has none. Renaming a control in CEditor does not
   break the match. Renaming the *placeholder* in the drawing does: it becomes a new placeholder, so
   the old control is kept and a new one is added.
2. **Unnamed placeholders** (common in Illustrator) are matched by overlap with where they were.
3. **A panel that was not made by an import** (built by hand, or imported before this existed)
   adopts controls whose names are the placeholders' names, and remembers the match from then on.

**Undo** puts the controls and the panel size back, but **not the previous background image**. Panel
background images are kept out of the undo history everywhere in the editor. The confirmation says
so before you commit. To go back fully, run Update again with the previous drawing.

## Linked components

A custom component placed from the library remembers which package and version it came from. The
**Source** card in its Public API properties now compares it with the library and acts on the result.

| Card says | Meaning | Offered |
|---|---|---|
| Up to date | Same design as the library version it came from | Detach |
| Update available | The library has a newer version, and this copy has no design edits | **Update**, Reset, Detach |
| Edited on this copy | This copy's design was changed; the library has nothing newer | **Save to library** as the next version, Reset, Detach |
| Library changed · copy edited | Both | Update (asks first), Reset, Detach |
| Not in this library | The package it came from is not saved here | Detach |

**What an update keeps:** position and size, name, layer, device bindings, panel routes to other
controls, the chosen variant, and every **published value** set on this copy (a published input or
editable property such as a label or accent colour). A published value this copy never changed takes
the library's new default.

**What an update refuses to do:** discard design edits made on this copy. It says how many there
are and needs a second click to go ahead.

**Update N copies on panel** updates every copy of the same package on the panel that can be
updated without losing anything, as one undo step. It leaves the others alone and says how many.

**Save to library as X.Y.Z** writes this copy's design edits back as the package's next version
(1.0.0 → 1.1.0; an existing version is never overwritten), then links the copy to it. Its position,
name, bindings and published values (its legend, say) stay its own, not the new default. Other
copies on the panel are then offered the update. It's only offered while the library hasn't moved on
since the copy was placed; otherwise update or reset first, so the library's newer changes aren't
saved over.

**Reset to library** returns a copy to the library version exactly, keeping only placement and wiring.
**Detach** keeps the component as it is and stops it tracking the library.

The comparison finds the exact version a copy was placed from by its fingerprint, so it can tell a
library change from an edit on the copy. If that version is no longer in the library, it can only
compare with the latest one. Differences are then marked `?`, and a plain update is refused for the
same reason.

## Create Component from Selection

Select some artwork on a panel (a plate, its legends, a scale, a logo), with or without the knobs and
sliders on it, and choose **Edit › Create Component from Selection…** or the same item on the canvas right-click menu. You're asked for a name
(the first label's text is suggested). The selection is saved to the library as a component, and
the panel gets a **linked copy** in its place, so the Source card and "Update N copies" above work on
it from then on.

Every label's text is published, so each copy can carry its own legend: place the plate three times
and label it CUTOFF, RESONANCE and DRIVE, and an update to the plate keeps all three.

### Faithful or refused

The command replaces what you selected, so the copy must look exactly like it. Each control either
converts through a path that draws the same way, or the command is refused, naming the control and
the reason. Nothing is converted partly.

| Converts | How |
|---|---|
| Background, Image | Its background (fill, gradient, image, border, corners) is carried as-is, and drawn by the same renderer. |
| Shape | The exact SVG the panel draws for it, as an image. |
| Label | Its plate, plus its text over the same padded box. Font, size, weight, style, case, colour and spacing are carried. |
| Knob, Slider | The knob itself, drawn and driven by the panel's own knob code, with its value as a channel of the component. Its device bindings and its host parameter id go with it. See [Knobs and sliders](#knobs-and-sliders). |

| Refused, with the reason given | Why |
|---|---|
| Buttons, and every other control with a value that is not a knob or slider | Not supported yet. A momentary button in particular has no equivalent: a component's hit zone can toggle or cycle a value, not release one. |
| A control a script mentions | The component can't keep the name the script uses. The script and line are named. |
| A knob anything else addresses | A route, a meter, LCD or envelope source, a link (anything that stores its id), a script's target, an LCD soft key, a setlist capture. The place is named. |
| A knob with two handles, a control form, a background plate, a caption, an icon or lamp, extra parts, rotation, a script of its own, its device bindings switched off, or a binding on a port other than its value | The part draws what the panel's knob renderer draws and nothing else, and holds one value. |
| A knob that is read-only, disabled, hidden, or kept out of host automation | It would behave differently as one part of a larger control. |
| Text wider than its box, or on more than one line | The panel wraps it; a component would not. |
| Underline, strikethrough, text aligned to the top or bottom, an icon, a lamp, effects, scaling | The component would draw them differently. |
| Controls inside a container, or across layers | Select the container's contents, or one layer at a time. |
| An unselected control painted *between* the selected ones and overlapping them | No single depth keeps it where it is. It is named; select it too, or move it. |

Measured on the QA panels: 1,984 of 1,985 labels pass the settings rules, and the width check then
refuses the ones whose text overflows its box. On the Roland Gaia sheet that leaves 909 of 924
labels converting; on the scripting sheet, 490 of 553. Browser checks draw those panels before and
after with the editor's own renderer and compare them pixel by pixel.

Undo puts the controls back. The saved component stays in the library, where you can remove it from
the Library tab.

### Knobs and sliders

Converting knobs and sliders was first scoped on 2026-09-28 and paused, for four reasons written
here at the time. It was built on 2026-09-29, and each of them is answered by what was built rather
than by a trade-off:

- **DAW automation.** A host parameter's id came from the control: knob `cutoff` exported as
  `cutoff.value`, and a channel `cutoff` of component `Filter` would export as `Filter.cutoff`. The
  plug-in names its parameters by that id, and a DAW saves automation lanes and the plug-in's state
  against it, so every saved session would have lost the knob. **Now the placed copy keeps the id**:
  it records `Core.hostParameters[channel] = { id: 'cutoff.value', label: 'cutoff' }`, and the export
  publishes the channel under the knob's own id and label, with its range, unit and device wire
  unchanged. Only the path the player uses to find the value is new. Snapshots are keyed by the same
  id, so they keep working too. A kept id is dropped rather than duplicated: if the copy is
  duplicated, or a new knob takes the old name, the later one exports under its own id.
- **The look.** Parts could only approximate a knob. So a knob is not rebuilt from parts: it becomes
  one part that carries the knob, drawn by the panel's own knob renderer through the panel's own
  state machine, fed what the panel would feed it: the value, and whether the knob is hovered,
  pressed or focused. The same knob code handles the drag, the wheel, the arrow keys and the
  double-click reset.
- **Momentary buttons** still have no equivalent, and buttons are still refused.
- **References.** Anything that addresses a knob by id or by name is found and named, and the
  command is refused. An explicit export list is pointed at the channel instead (same id), and
  snapshots need nothing.

The knob's device bindings move to the placed copy, onto the knob's channel, and its current value
comes along, so nothing moves on screen. The copy gets a name no other control has, because the
channel is addressed through it.

**How it is proved.** `browser-checks/knobsFromSelection.mjs` builds a panel of knobs and sliders,
and takes a cluster of the Roland GAIA sheet with its legends. It converts a copy of each and does
the same things to both in preview, the surface the exported plug-in mounts:
- the picture at rest and hovered;
- an absolute knob and a relative dial dragged past their ends and back;
- two sliders;
- the wheel;
- a double-click reset;
- a click, the wheel and arrow keys to move focus.

The pictures are identical to the pixel and the values identical to the last digit. A knob bound
to a raw CC sends the synth the same messages, one for one. The export publishes the same host
parameters.

That last comparison found a fault that predates the conversion. Every component's patch carries all
its channels, and raw CC bindings were sent from every patch. So moving one knob of a multi-knob
component re-sent every other knob's CC, and pressing one sent its value twice. Now a channel sends
when it changes, or when it is the one being driven, as a panel knob does. Profile-parameter
bindings follow the same rule. On the QA sheets, 772 of 774 top-level knobs and sliders pass the
rules. The two refused have a script of their own, and device bindings switched off.

**Two differences remain, both stated rather than hidden:**

- **The editor canvas, outside preview.** There a panel knob is drawn without a runtime, so its
  pointer sits at the minimum while its readout shows the default. A converted knob draws its
  default. Preview and the exported plug-in are identical.
- **Keyboard.** A component is one Tab stop where the panel had one per knob. Tab reaches the first
  knob, and the keys move the knob last pressed. The focus ring, and each knob's focus look, are
  drawn where the panel drew them.

A module that includes a button is still made the old way: an artwork component, with the button
placed beside it (and Duplicate for the whole group).
