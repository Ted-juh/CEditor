# Blender knob fixes: a picture layer's colour, and a value the panel sets

Status, 2026-11-06: **built.** The owner approved the recommendation on each question (keep the wash
and add the colour beside it; a metal's reflections change with it; tag the layers; colour-set roles;
option A, "Set by the panel"). The mock-ups are
[`blender-knob-fixes-mockups.html`](blender-knob-fixes-mockups.html) (its pictures in
`blender-knob-fixes/`). This answers defects 1 and 3 of the review in
[`blender-layers-handoff.md`](blender-layers-handoff.md); defect 2 (the import notice counted the
file's layers) is fixed: `buildArtworkComponent` returns the number of parts it made, and the test
knob reads "A dial of 19 layers" (its file holds 62, the 13 colour shares among them).

## As built

Where it differs from the design below, and what was measured.

- **Where it lives.** `utils/pictureRecolour.js` (the pixels, the parts, what a layer is);
  `CanvasControl.svelte` recolours before the outline mixing and the static baking, and passes the
  outline-mixed picture on with its colour cleared (`withEdgeSources`); `InteractivePartRenderer`
  recolours a part that reaches it unrecoloured (the Component Designer, its state sheets); the
  filmstrip baker recolours before it draws. `withColourFollows` gives a follower its leader's colour
  wherever parts are drawn. The decode is `linearEdges.js`'s, shared (`picturePixels`).
- **A picture layer** is what `partMask.js` calls one: a picture with no fill under it. A shape with
  a picture over its fill keeps its Fill.
- **A picture with no drawn colour** (not imported from Photoshop) has it measured when it is drawn,
  and for the dock's Drawn swatch; nothing is written until Pick from the picture.
- **The light, not a share** (second round, closing the two gaps the first left). A share per pixel
  could not carry how a part's look changes with its colour: Blender adds the gloss in linear light
  and a browser in sRGB, so a darker colour's weak channels came out a few levels short (the red
  skirt a mean 6.8), and a metal's glint, many times white, more than a layer holds (the brass cap's
  blue 52 short there). The add-on now writes beside each colour layer the light on the part without
  its colour and its gloss (`<name> lighting`, `<name> gloss`, hidden; linear light in 8 bits over
  1/256 to 256, `light_code`), and CEditor works the colour, shading and highlights layers out again
  in the new colour as the add-on does (`recolourGroupPixels`): the new colour times the light plus
  the gloss, split as the add-on splits it. Highlights now cover the whole inside (adding nothing
  where there is no light) so light can come where there was none. The gloss is past the colour
  CEditor takes there (the colour layer's own inside, the drawn colour elsewhere), so the part
  worked out again in its own colour is as written (within 3 levels). Two traps on the way: Cycles'
  light passes are per covered sample and must not be divided by coverage (at a part's edge that made
  the light sixty times too bright), and a gloss made to absorb the light's 8-bit rounding carries it
  onto a new colour's weak channels as noise.
- **The light it throws** (third round). A part's colour lights what is beside it, and the layers
  kept that light as rendered: just beside the red skirt the panel was 4.6 levels off Blender at the
  mean, just beside the brass cap the skirt 10.4 (its blue). The add-on now renders each part of a
  group again colourless (`colourless`: the Principled base colour, or a Diffuse colour, black and
  unlinked; the gloss kept) and writes the difference: on each other part, the light and the gloss
  off that part's colour (`<name> lighting from <part>`, `<name> gloss from <part>`, hidden, in
  `light_code`); on the panel, the share of the panel's diffuse light off it, σ = (lit − lit
  without its colour) / lit, carried in under the parts' rims, and what it adds to the shine
  (`bounce from <part>`, `bounce shine from <part>`, hidden, in `bounce_code`, sixteen times finer),
  with the panel's look under them (`bounce base`). CEditor scales each by the part's change of
  colour, r = lin(new) / lin(drawn) per channel: a part it lights gets (r − 1)·Δ added to its light
  and gloss and is split again in its own colour (`recolourGroupPixels`, `bounce`); the panel's
  light is scaled by 1 + Σ(r − 1)σ and the shadow, the bounce and its shine worked out again for it
  (`recolourBouncePixels`): black at an opacity is a multiply by black at that opacity, so the
  shadow becomes a multiply that darkens where the panel must, and the colour dodge brightens where
  it must. Over the reach of such light the add-on writes the bounce at full opacity and the shine
  at least one step, adding nothing where there is none, so CEditor has a pixel to write to.
  The import keys the maps to the parts they come from (`imageColourBounce`), and the panel's shine
  and the shadow follow the bounce (`imageColourFollows`, roles `shine` and `shadow`); a group with
  no colour of its own is worked out again when a part beside it changes colour. A part that turns
  (the pointer) is not among them: it is rendered at each angle, and its light on the rest is its
  reflection in the parts under it. Since the fourth round that is worked out again too: rendered
  colourless at each angle, the share of it off the pointer's colour and the look under it are
  written beside each frame (`pointer reflection from pointer at 27`, `... base at 27`), and CEditor
  scales the share (`rethrownPixels`) before changing the frame with the metal it is in. In the same
  round the light beside each colour layer took in Blender's own colour at each pixel (a little under
  the base colour towards a glossy part's edge), which had stayed in the gloss as a few percent of
  the old colour: an orange pointer made blue was 18 levels off, now 1.4.
  Three things on the way: a stays-part's edge mixed with one opacity for all three channels cannot
  reach a saturated colour over a grey panel, so each channel is now exact (`linearEdgeMix`,
  `edge_mix`: the opacity the coverage, raised only as far as a channel needs to stay within 0 and
  1); a shine fainter than a step of opacity, written at that step at full strength, added a level
  where there was less than half of one, so its colour is what it adds over that step; and in the
  Component Designer a recoloured part took its picture from the recoloured part but its effects
  from the original (`InteractivePartRenderer`), so the panel's shadow, now a multiply, was drawn
  plain and turned the artboard pale beside the knob (`pictureColour.mjs` caught it).
- **The XMP** names each colour layer's shading and highlights (`<ceditor:colourOf>`,
  `skirt shading=skirt`), a turning part's reflection that falls mostly in a metal part
  (`pointer reflection=cap`, changed in proportion by the metal's colour), and the metal parts
  (`<ceditor:metal>`, whose highlights keep light past white). A metal is a part whose covered
  pixels are mostly metal by its passes.
- **The Lamp.** An on/off value had no Value From (the flat list offered it for numbers only, and a
  followed fraction read as off). It now follows too, on once its source is past half way
  (`sourcedCustomValues`), and the card and the flat list offer it; its row says what it shows, how it
  starts while it is its own (Off / On) and what it follows. The card's other rows use its words
  (value, behaviour, grab area) and the full width.
- **The filmstrip baker** laid every part on as plain paint, its blend mode ignored: a Blender knob
  baked nearly black (12 levels where the canvas shows 204). A part with a blend mode is now drawn on
  its own and laid on in that mode, as CSS lays it (`plus-lighter` as the canvas's `lighter`), and a
  baked frame matches the canvas inside the knob within 10 levels.
- **The dock** names a light layer in its header ("skirt_shading › light, no colour of its own") and
  shows **Now** from the layer's stored colour, so a colour set by a script or a role shows too.

**Measured** (`tools/blender/test_ceditor_layers.py`, against Blender rendering the knob with the
material changed, at 160 px, where the part covers the pixel; the web suite holds CEditor's own
JavaScript to Blender's renders in `test/fixtures/blender-knob-recoloured.json` the same way, at 96 px):

| Recoloured | Mean | 99th percentile | Changed in proportion instead | First round (share) |
|---|---|---|---|---|
| The skirt, pale grey to red | 1.45 | 4 | 8.1, 15 | 6.8, 12 |
| The metal cap, silver to brass, glint included | 1.1 | 5 | 8.1, 105 | 5.5, 52 at the glint |

Just beside the part, where nothing of it is drawn, what it lights, against Blender in the new colour:

| Lit by the recoloured part | Mean just beside | At its edge | Its light kept as rendered |
|---|---|---|---|
| The panel by the red skirt | 1.8 | 2.6 | 4.6 |
| The skirt by the brass cap | 1.5 | 1.2 | 10.4 |

The web suite's own JavaScript, at 96 px: 2.2 and 1.5 (each pixel's largest channel difference; its
average per channel, signed, is under 0.8).

Checked: the web suite, `browser-checks/pictureColour.mjs` (the Interact card; the skirt selected,
its colour changed in the designer and on a panel, nothing beside it painted, back to as drawn; a
light layer; a baked filmstrip), the add-on's test 61 of 61 at 160 px and 59 of 59 at the fixture's
96 px.

## 1. A picture layer's colour

### What is wrong today

Checked in the editor on this branch, with `CE/web/test/fixtures/blender-knob.psd` imported:

- The look bar offers Fill, Gradient, Stroke and Corners for a picture layer
  (`sections/SurfaceLookBar.svelte`), none of which it draws.
- Selecting a layer arms the Colors dock on `Parts.<layer>.Background.Fill.colour`, labelled
  "<layer> › Fill", whatever the layer is (`stores/designerColourTarget.js`, `designerFillTarget`).
  A picture layer has its solid off, so the colour changes nothing. A part of frames has no
  Background, and the write goes nowhere.
- The Component Designer mounts no Background editor for a part, so a picture layer's
  `Fill.imageTint` has no control. Set from a script, it is the 30 % wash `buildLayerStyle`
  (`utils/backgroundCSS.js`) draws as an inset box-shadow over the layer's whole box.
- Effects › Filters acts on the whole control, and none of its filters takes a colour.
- The manual (`editor-manual.template.md`, the Blender section) says "change a part's colour with its
  tint" and "Recolour such a layer with its Effects › Filters". Neither works. The sentences change
  when this is built.

### The recolour

Per pixel and per channel, alpha untouched, on the picture's straight (not premultiplied) sRGB
values:

```
new = old + (colour − drawn) × share
```

- `drawn` is the colour the picture was drawn in. Measured on import as the median of the pixels the
  layer covers whole (for a thin layer with none, those within two levels of its highest alpha);
  **Pick from the picture** sets it from a pixel.
- `colour` is the colour chosen, or a colour-set role. Empty means as drawn.
- `share` is, by default, `old / drawn` (a channel of `drawn` under 8 levels takes 1): the drawn
  colour becomes `colour` exactly and every other pixel keeps its proportion to it. It is the right
  answer wherever a picture's shading is multiplied into its colour, which is what a flattened render
  or a painted knob is.

**Exact for Blender's colour layers.** The add-on writes a part's colour layer `V` so that
`V × (1 − d + d·S) + d·H = L` (its look as rendered): `d` how far inside the part the pixel is
(1 inside, 0 at its edge), `S` its shading, `H` its highlights. Inside, `V` is the surface colour `C`;
at the edge it is the whole lit look. Changing `C` changes `V` by `(C' − C) × W` with
`W = S / (1 − d + d·S)`: 1 inside, `S` at the edge. So the formula is exact everywhere when `share`
is `W`. The add-on knows `S` and `d` and writes `W` as a hidden layer, `<name> colour share` (an RGB
picture, `W` per channel; `<name> colour share at <angle>` for a part written at angles). The import
attaches it to its colour layer and makes no part of it. Without it (an older file), `old / drawn`
is used: the same inside, and at the edge a pixel or two scaled with the rest, its white glints
tinted.

Measured on the test knob (96 px) with the default share: the skirt taken to red, blue and near
black, the pointer (a part of frames) to white, the cap to brass, and the knob on a dark panel. The
pictures are in the mock-ups.

### Where it lives

| Part | Property | Its drawn colour | Its share |
|---|---|---|---|
| A picture layer | `Background.Fill.imageColour` | `Background.Fill.imageColourDrawn` | `Background.Fill.imageColourShare` (a data URL, optional) |
| A part of frames | `Image.colour` | `Image.colourDrawn` (measured on the frame at rest) | `frames[i].share` (optional) |

`imageColour` and `Image.colour` hold an AARRGGBB colour or a role token (`{control.body}`),
resolved as a fill's colour is (`resolveColourValue`); empty is as drawn. Named so that
`isColourKey` (`models/controlSets.js`: `colour`, or a name ending in `Colour`) already takes them,
and the Colors dock's role chips with it; the drawn colour's name does not end in `Colour`, so a set
leaves it alone.

`Fill.imageTint` stays the wash it is, for panel backgrounds and textures (question 1).

### How it is drawn

Worked out on the picture's pixels once per (picture, colour, share), cached, as
`utils/linearEdges.js` works out a picture's edge for the panel under it: decode, apply, encode a
blob URL. The recolour runs first and the outline mixing on its result, since the edge's colour
depends on it. Then everything that draws a picture draws the recoloured one: the editor and the
Player through `editor/InteractivePartRenderer.svelte`, exported plug-ins (the same JavaScript), and
`utils/customComponentFilmstripBaker.js`. Nothing new in CSS, no SVG filter. A colour driven by a
value changes the cache key; a ten-frame part recoloured costs ten decodes the first time.

Pure functions in a new `utils/pictureRecolour.js`, tested in node on pixels:
`recolourPixels(pixels, { colour, drawn, share })` and `drawnColour(pixels)`.

### The interface (plates A to C)

- **Look bar.** For a picture layer or a part of frames (`isPictureLayer` in `utils/partMask.js`,
  and a frames Image): **Colour** (a swatch that opens the Colors dock) and Opacity. Fill, Gradient,
  Stroke and Corners go. For a light layer (a picture in multiply, plus-lighter, colour dodge or
  screen, or a name ending in shading, highlights, shadow, reflection, shine, glow, bounce):
  **Edit <layer>'s colour**, which selects the colour layer it lights (by name: `skirt_shading`
  lights `skirt`), and Opacity.
- **Colors dock.** `designerFillTarget` returns, for a picture, the target
  `Parts.<layer>.Background.Fill.imageColour` (or `Parts.<layer>.Image.colour`) labelled
  "<layer> › Colour", and for several, "N layers › Colour". A strip under the header shows Drawn and
  Now, **Pick from the picture** and **Back to as drawn** (clears the colour). For a light layer the
  dock says what the layer is and offers **Edit <layer>'s colour**.
- **Layers list** (question 3). The tag says PICTURE, FRAMES or LIGHT instead of RECT, and the
  footer "picture layer" instead of "rectangle layer".

### What stays approximate

- The light a part throws on the panel (`bounce`) keeps the drawn colour's tint. (Closed in the
  third round, under As built.)
- A picture of several colours changes as a whole, in proportion.
- A metal's reflections stay as rendered unless question 2 is answered yes.

### Tests

- `pictureRecolour.test.js`: the drawn colour maps to the colour exactly; proportions kept; alpha
  untouched; a dark channel takes share 1; with Blender's `W` the edge equals a look composed from
  `C'`, `S` and `H` (synthetic pixels).
- `blenderLayersImport.test.js`: the shares are attached and not parts; the skirt recoloured,
  composited with `compositePsd`, against the add-on's render of the same knob with the skirt's
  material changed (the add-on's test renders that reference, as it renders the panel recoloured).
- A browser check: select the skirt, the dock reads "skirt › Colour", a colour picked changes the
  canvas pixels inside the skirt and not outside its outline.
- The add-on's test: the share layers present, hidden, named; the recolour within its thresholds.

## 3. A value the panel sets

### What is wrong today

`deriveInteractClusters` (`utils/customComponentClusters.js`) calls every value with no behaviour an
orphan, and the Interact card (`sections/CustomInteractEditor.svelte`) lists it under **Not wired
up** with "no behavior drives it (fine for output-only values)". An imported dial's Lamp is set by
the panel and is fine. The row's text is also squeezed into a column a word wide.

### Option A (recommended)

The derivation sorts values with no behaviour in two:

- **Set by the panel**: something on the component uses it (a binding's or a state's source names
  `channel.<name>`), or it follows a control (`valueSource`). The card shows a section of that name:
  the value's label and name, its type (On/Off, Number, Choice), what it changes ("Lights lamp_lit,
  lamp_glow and lamp_glow_shine", from the bindings' targets), how it starts, and the Value From
  picker the flat list has (`CustomValueChannelsEditor.svelte`).
- **Not wired up**: nothing uses it and nothing sets it ("Nothing sets it and nothing uses it"), with
  behaviours whose value is missing and grab areas that reach nothing, as now. The card's words
  (value, behaviour, grab area), the text on the full width.

### Option B

One list, titled "Values without a grab area", the Lamp row reading "Set by the panel. Lights
lamp_lit, lamp_glow and lamp_glow_shine." in a neutral colour. Smaller; a real fault would sit in
the same list.

### Tests

`customComponentClusters` tests for the split (a value read by a binding, one with a `valueSource`,
one unused), and the Blender import test: the Lamp is set by the panel, nothing is not wired up.

## Questions for the owner

1. **The old Tint.** Keep `imageTint` as the wash, add the recolour beside it (recommended), or
   make the tint the recolour everywhere, which changes existing panels?
2. **Metal.** Should a metal part's highlights change with its colour? The add-on can mark metal
   parts in the file's XMP (`<ceditor:metal>`), and the import then applies the same recolour to the
   part's highlights. Recommended: yes.
3. **Layer tags** PICTURE, FRAMES and LIGHT in the Layers list: now (recommended) or later?
4. **Colour-set roles** for a picture's colour: yes (recommended)? A later step could link them on
   import by name (a skirt or body to Body, a cap to Knob / fader cap, a pointer to Marker).
5. **The Lamp:** Option A (recommended) or B; the section's name; Value From inline in Simple mode.

## Order of work (as planned)

1. `utils/pictureRecolour.js` and its tests; the properties; the draw path and the baker.
2. The Colors dock target, the look bar, the light layers' link; a browser check.
3. The add-on: the colour share layers (and the metal mark, if question 2 is yes); its test; the
   fixture rewritten.
4. The Interact card.
5. The manual's Blender section, then `npm run docs:editor && npm run docs:help`.
