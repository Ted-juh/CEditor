# Four more ways in: Illustrator, Figma, 3D parts and glTF

*Decided 2026-11-06; #1 and #2 built.* The routes for bringing designs in that
[changeable-control-sets.md](changeable-control-sets.md) ("Native files" and "Order") lists as next:
Illustrator files read directly, Figma, CEditor's own 3D parts (Level 3, with piece E) and glTF models
(Level 2). The mock-ups the owner approved are [import-formats-mockups.html](import-formats-mockups.html).

## Decisions

Taken by the owner, 2026-11-06, each the recommended answer of the mock-ups:

1. **D1 · The File menu.** The three SVG artwork items are renamed **Vector Artwork** (New Panel,
   Update Panel, New Component), each opening SVG, PDF and `.ai`. No new items.
2. **D2 · An Illustrator file's names** come from its top-level layers only: what the PDF part keeps.
   Illustrator's private data (sublayers, object names) is not read.
3. **D3 · Figma** comes in through a plugin that runs in Figma, checks the names and saves an SVG with
   them. CEditor itself is unchanged; no token, no network.
4. **D4 · 3D parts and glTF models** are rendered by three.js (MIT), in the editor only, loaded when a
   3D part is open; never in the plug-in.
5. **D5 · A 3D part is kept as layers**, rendered into the layers the Blender add-on writes: colour and
   value changes are instant and the plug-in, the Player and the filmstrip baker draw it with what they
   have. A change of shape is a render.
6. **D6 · The sets' rendered knobs (piece E)** keep their own shader and look for now.
7. **D7 · Order:** Illustrator and PDF; the Figma plugin; the 3D part with built shapes; glTF objects in
   the same part. Each finished, documented and pushed before the next.

## 1. Illustrator and PDF — built

An Illustrator file saved with Create PDF Compatible File (Illustrator's default) carries a PDF copy of
the artwork. `utils/pdfArtwork.js` reads it, or any PDF, with pdf.js (pdfjs-dist 6.4.299, Apache 2.0)
and turns a page's drawing operations into SVG text in the page's units, y down; the SVG panel and
component importers read that as they read any SVG.

- **Layers.** Each top-level layer is a PDF optional content group marked round its content; it becomes
  a `<g>` with the layer's name as `id` and `data-name` (which `objectName` reads). A layer switched off
  is `display:none` with `data-ceditor-hidden`, which the SVG component import now keeps as hidden parts
  (as the Photoshop import keeps a hidden layer) instead of dropping.
- **Shapes.** The current transform is applied to each path's points. A closed run of four lines along
  the axes is written as a `<rect>`, four Béziers through the ends of the axes (with handles near 0.552
  of the radius) as an `<ellipse>` or `<circle>`: the panel import measures only those, and a PDF has
  paths alone, so without this no placeholder of a PDF panel was found.
- **Gradients.** Illustrator writes a gradient fill as the shape set as a clip, then the shading painted.
  The shading becomes the innermost clip's shape filled with the gradient, so a gradient-filled shape is
  one vector layer. A shading pattern used as a fill likewise. pdf.js samples the colour stops; a
  gradient that does not extend gets clear end stops, written as the neighbouring colour at no opacity.
  A mesh or freeform gradient is drawn in its mean colour.
- **The rest.** Strokes with width, caps, joins, dashes; even-odd fills; clip paths round what they
  clip; opacity and blend modes; transparency groups as a `<g>` with the group's opacity and mode (the
  alpha and mode reset inside, as PDF says); forms placed by their matrix and clipped to their box;
  images as `<image>` with their pixels as PNG (`pngEncode.js`); text as `<text>` in the family the
  font's PostScript name gives (`ABCDEF+MyriadPro-Bold` → Myriad Pro, bold), its size and colour.
  Opacity masks, tiling patterns and image masks are not drawn, and are reported.
- **pdf.js in the editor.** Loaded on first use, its worker module imported on the page itself rather
  than started as a worker: the editor runs from disk in the app's webview, and there is no worker file
  to serve. `isEvalSupported: false`. The Player and the plug-in never load it.
- **The commands.** `chooseVectorArtwork` (`stores/svgPanelImportActions.js`) offers `.svg`, `.pdf` and
  `.ai` (the app's dialog with `*.svg;*.pdf;*.ai`, which the bridge's pattern check allows; the
  browser's otherwise), reads a PDF or `.ai` as bytes, asks which artboard in the app's list dialog when
  there are several (Cancel stops without a complaint), and hands the SVG text on with where it came
  from. The panel notice adds "read from Synth front.pdf" and, when the placeholders had no names, that
  they were typed by colour and shape; the component notice adds "Read from the PDF part of Knob.ai;
  named from its top-level layers: skirt, cap, pointer."; what could not be drawn goes to the Console.
  An `.ai` without a PDF part is refused with how to save it.

Tested: `test/pdfArtwork.test.js` (PDFs written in Illustrator's layout by `test/support/pdfFixture.js`:
layers, paths, shapes, gradients, opacity and groups, text, images, refusals, artboards, an `.ai` knob as
a dial, a hidden layer as a switch's lit look, a PDF panel's placeholders), `test/pdfArtworkImport.test.js`
(the commands: notices, the artboard question, Cancel, the refusal, the menu), and
`browser-checks/vectorArtwork.mjs` (pdf.js as the editor loads it, in Chromium). Not tested: a file from
Illustrator itself; the fixtures follow its layout, and a real one is the check that matters.

## 2. Figma — built

`tools/figma-plugin/` (`manifest.json`, `code.js`, `ui.html`), shipped by the installer beside the
Blender add-on. The manifest declares `documentAccess: dynamic-page` (required of new plugins) and no
network. `code.js` runs in Figma's sandbox: no object spread, and UTF-8 by hand, since the sandbox has
no TextDecoder.

- **The window** (`ui.html`, Figma's own colours through `themeColors`) is sent what
  `describeSelection` makes of the selection: each top-level layer and what it will do, by a copy of
  the importer's words that `test/figmaPlugin.test.js` holds to `artworkComponent.js`; Figma's own
  names (`Ellipse 12`) flagged; effects noted.
- **Whole** (the default): `exportAsync({ format: 'SVG', svgIdAttribute: true })`, layer names as ids,
  text as text unless the option is off.
- **Variants as states**: `stateVariants` reads each variant's properties (Figma's, or its name
  `State=On, Size=Large`) and keeps the default and the variants that differ from it only in their
  state; each is exported and stacked in a `<g id="on">`, `off`, `pressed`, or under the set's name for
  the one at rest. Definitions are prefixed per variant so that two exports in one SVG cannot collide;
  ids that say a state (a lamp, `State=Off`) are dropped inside a state's group, since the importer
  takes a layer's own name before its group's, but an id a definition is referred to by is kept: the
  first version dropped a gradient called `…_Off` and its look with it, which the test caught.
- **Flatten effects into pictures**: `layerByLayer` exports each visible layer on its own, placed by
  its render bounds (effects included) against the frame's box; a layer with a visible effect as a PNG
  at twice the size. Not with a mask layer among them: that frame is exported whole.
- **Saving**: the SVG is handed to the window as bytes, which saves it through a download link named
  after the frame (`Knob / Vintage` → `Knob - Vintage.svg`).

Tested: `test/figmaPlugin.test.js` runs `code.js` in a sandbox with a stand-in for `figma` (the words,
the manifest, the window's rows and notes, a frame as a dial, on and off variants as a switch, a pressed
variant as a button, flattening, the messages, UTF-8), its SVG read by `planSvgComponentImport`; the
window was driven once in Chromium (rows, notes, options, Save, the download). Not run in Figma itself.

## 3 and 4. 3D parts and glTF — after

A 3D part in the Component Designer: objects with a shape (piece E's turned bodies, knurled or fluted,
tops, blocks; a pointer of its own) or a mesh from a glTF file, a material, a motion; rendered by
three.js from straight above, lit by the set's lamp, into the layers the Blender add-on writes.
