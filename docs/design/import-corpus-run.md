# Import corpus run

*Run 2026-11-06 and 07, on branch `claude/new-session-ofvsj0`, and a second pass on 07.* Every
artwork and model import run over files made by other programs, thousands of them, to find what breaks
before a user does. What it found, what was fixed, what the second pass drew of what the first left,
and what is left.

## What was run

| Corpus | Files | Made by |
|---|---|---|
| resvg's SVG test suite (`linebender/resvg`, `crates/resvg/tests`) | 1,780 SVGs | written by hand to test every SVG feature, edge cases included |
| Desktop icons (`/usr/share/icons`, every 14th over 600 bytes) | 291 SVGs | Inkscape, mostly |
| pdf.js's test suite (`mozilla/pdf.js`, `test/pdfs`, those under 3 MB) | 1,081 PDFs | Acrobat, TeX, Word, LibreOffice, InDesign, Illustrator, cairo, Typst, fuzzers |
| Illustrator files among them, saved as `.ai` | 9 | Illustrator CS5 to CC 23 |
| LibreOffice Draw drawings (icons converted) | 40 PDFs | LibreOffice |
| psd-tools' test files (`psd-tools/psd-tools`, `tests/psd_files`) | 316 PSDs and PSBs | Photoshop |
| Khronos glTF sample models (`KhronosGroup/glTF-Sample-Assets`, under 15 MB) and the add-on's knob | 174 | many exporters; binary, embedded, Draco, meshopt, KTX2, quantized |

Each file went through every route it has, as the menu commands call them: SVG as a panel (and with
a placeholder layer added, so the whole panel path runs), as a component; PDF and `.ai` read by pdf.js
into SVG, then both; Photoshop as a panel (and with a `components` group written in), as a component;
glTF in the editor in Chromium, read, made a recipe and its meshes, every sixth rendered. Each import
had a time limit and its output was checked: no NaN or Infinity, a JSON round trip, parts with a size.
Then 749 of them were drawn in the editor (a component on a white panel, scaled with its box) and
compared pixel by pixel with the original as its own software draws it: the browser for SVG,
pdftocairo for PDF, the composite the Photoshop file carries.

## What it found, and what was fixed

| Found | Fixed |
|---|---|
| An SVG whose `<use>` refers to what holds it hung the import (resvg `indirect-recursive-3`) | A `<use>` of an element being drawn is not drawn, as SVG does not; the walk is capped |
| A filled path not closed with a `Z` lost its fill; a PDF closes none, so Illustrator drawings came in as nothing (2 of the 9) | Filled as SVG and PDF fill it; filled and stroked, two layers |
| Every mask picture carried every definition in the file: 7,144 clip paths times thousands of masks ran out of memory or never finished (5 PDFs) | Each picture carries the definitions it refers to |
| Documents of tens of thousands of shapes made components of tens of thousands of layers | Past 2,000 shapes the import stops and says to use the panel import or simplify |
| Shapes in a CSS named colour outside 20 basic ones, `hsl()`, `#rgba`, `currentColor` were dropped or black; `rgba()` lost its alpha | The CSS colour syntax, alpha into the opacity |
| Gradient stops out of order or without an offset | Placed as SVG places them |
| Text of font size 0 or less made a layer of size 0 or negative | 0 draws nothing; negative is the default size |
| `<svg:svg>` (a prefixed namespace) refused by both SVG imports | Read as plain SVG |
| SVG filters and a group's blend mode dropped silently | Said in the Console; a shape's own blend mode kept |
| 16- and 32-bit Photoshop files: pixels read as 8-bit, near white or transparent ("no layers with pixels") | Made 8-bit, 32-bit colour from linear light |
| A Photoshop file of one Background layer (no layers, only its picture) refused | Comes in as that picture |
| CMYK, Lab, Duotone, Multichannel, Indexed: "Color mode not supported: 9" | Named, with Image › Mode › RGB Color |
| Hue/Saturation's Colorize not applied (87.6 % of the test file off) | Applied (0 %) |
| PDF pictures read before pdf.js had decoded them were dropped (78 files) | Waited for, 8 s at most |
| A 151-megapixel picture drawn 40 times was copied and encoded 40 times | Encoded once, no finer than twice its drawn size |
| A damaged PDF page threw instead of saying it could not be read (2 fuzzed files) | Says so |
| glTF with meshopt meshes failed | Read (three.js's decoder, 26 kB, loaded with the 3D import) |
| glTF with Draco meshes or required KTX2 textures: "No DRACOLoader instance provided" | Named, with how to export it again |

Each is a case in `CE/web/test/importCorpus.test.js`.

## After the first pass

| Route | Imports | Hung | Threw | Bad output | Refused, with a reason |
|---|---|---|---|---|---|
| SVG panel, component | 6,213 | 0 | 0 | 0 | as designed (no placeholder layer; empty drawings) |
| PDF and `.ai` | 1,130 | 0 | 0 | 0 | passwords, damaged files, empty pages, over 2,000 shapes |
| Photoshop panel, component | 948 | 0 | 0 | 0 | colour modes; panel without placeholders |
| glTF | 174 | 0 | 0 | 0 | 20: Draco (16) and KTX2 (4), named |

All 9 Illustrator files import. Two pdf.js stress files (`bug2086012`, `issue_cmap12`) exhaust memory
inside pdf.js itself, before CEditor reads anything. CI run 536 (commit `8eea77d`) passed in all four
jobs.

Drawn and compared then, in the browser of the time (share of files under 1 % / 1-5 % / 5-20 % / over
20 % of pixels visibly off): desktop icons 67 / 47 / 33 / 3; resvg's tests 65 / 107 / 51 / 77 (filters,
not drawn then, most of the last); pdf.js's 4 / 55 / 22 / 15; Illustrator 2 / 1 / 3 / 3; Photoshop 44 /
9 / 19 / 67 on a white panel. The second pass measured again, in another browser and more strictly
(below); the two sets of numbers are not to be compared with each other.

## The second pass: what was left, drawn

| Left after the first pass | Now |
|---|---|
| Draco meshes and KTX2 textures (20 Khronos models named and refused) | Draco decoded: three.js's decoder for glTF (192 kB of WebAssembly, 58 kB of wrapper), fetched for a model that needs it, run in Web Workers. A model that requires KTX2 is read with its textures left out, as every model's are, rather than a transcoder carried to decode pictures that are thrown away |
| JBIG2 and JPEG 2000 pictures in PDFs (122 pdf.js test files came in short of a picture) | pdf.js's own decoders (104 kB and 251 kB), fetched for a file that needs one: 3 files are short of one now |
| SVG filters and a group's blend mode, said and not drawn | The element a picture of itself, as SVG draws it, over the filter's region. Of the 84 resvg filter and blend tests in the sample, those more than a fifth off went from 51 to 7 |
| PDF soft masks: black boxes in an Illustrator file | SVG masks: luminosity over the mask's backdrop, or alpha, through its transfer function; on a transparency group, on the group whole with its opacity and blend mode, as PDF has it |
| A PDF gradient mesh in one mean colour (read at the wrong stride, too) | A picture, its colours blended across each triangle |
| PDF tiling patterns grey; image masks dropped; a page turned in the file unturned | Patterns drawn as SVG patterns, the cell read as a page is; image masks in the fill colour; the page turned as a viewer shows it |
| Hue/Saturation's colour ranges | Applied. Photoshop publishes no formula; of the orders tried, the one kept matches its own pictures of psd-tools' three test files at 8, 1 and 12 % of pixels visibly off, from 24, 11 and 18 % with the master range alone |
| A Photoshop group's Fill opacity, and knockout | Drawn: psd-tools' knockout files, 13 of them wholly off, match Photoshop's pictures. ag-psd keeps only whether a layer knocks out; the level (shallow, deep) is read from the layer's record, and agrees with ag-psd in every layer of the 293 files it reads |
| A gradient outline drawn as a broad band | Drawn radial, with its stops' opacity |
| Found on the way | an outline's colour drawn without its own opacity (a `stroke-opacity` lost); a gradient of one stop read as no paint, and `fill-opacity` on a gradient ignored; an embedded picture whose base64 is wrapped over lines lost; an `<image>` stretched where `preserveAspectRatio` places it; a turned shape's clip in `objectBoundingBox` units left unturned; style rules by element and id not read |

Each is a case in `CE/web/test/importCorpus.test.js`.

## After the second pass

| Route | Imports | Hung | Threw | Bad output | Refused, with a reason |
|---|---|---|---|---|---|
| SVG panel, component | 6,213 | 0 | 0 | 0 | as before |
| PDF and `.ai` | 1,128 | 0 | 0 | 0 | passwords (11), damaged files (6), not a PDF (1); as a component, an empty page (68) or over 2,000 shapes (18) |
| Photoshop panel, component | 948 | 0 | 0 | 0 | as before |
| glTF | 174 | 0 | 0 | 0 | none: the 20 Draco and KTX2 models read too, in the editor in Chromium |

CI run 537 (commit `bc703ce`) passed in all four jobs.

What PDFs still say they leave out: a mesh used as a fill's pattern rather than painted on its own,
in its mean colour (7 files); patterns nested past three deep or failing (3); a picture pdf.js could
not decode (3). The two pdf.js stress files exhaust memory in pdf.js on its own, as before: in this
pass's run, given a larger heap, one took the whole process with it, so they were run apart.

**Drawn and compared again.** The browser in this container changed between the passes (Chromium
build 1194 to 1243), and it draws a thin line or a glyph a pixel differently: files no code touched
moved by two to four percent. So both commits were measured again in the same browser, and the
comparison now forgives a pixel's misregistration, starts the panel on a whole pixel, and draws a PDF
page at most 340 px tall so it stays on the panel. Share of files under 1 % / 1-5 % / 5-20 % / over
20 % of pixels visibly off, before this pass and after:

| Corpus | Before | After |
|---|---|---|
| resvg's tests (300) | 3 / 142 / 69 / 86 | 3 / 210 / 59 / 28 |
| Desktop icons (150) | 102 / 25 / 22 / 1 | 108 / 29 / 12 / 1 |
| Photoshop, as a component on a white panel (139) | 52 / 8 / 13 / 66 | 56 / 8 / 14 / 61 |
| pdf.js's tests (96) | 35 / 27 / 25 / 9 | 36 / 30 / 26 / 4 |
| Illustrator (9) | 4 / 0 / 3 / 2 | 5 / 1 / 3 / 0 |
| LibreOffice drawings (40) | 6 / 12 / 22 / 0 | 6 / 12 / 22 / 0 |

No file came out worse.

What is still over a fifth: of resvg's, single tests of features a control's artwork does not use
(`<switch>` and `systemLanguage`, CSS selectors that look past the element, a skewed stroke, SVG 2's
`transform-origin`) and a few where Chrome, which draws the reference, and the SVG specification
disagree; of Photoshop's, psd-tools' tests of blend modes with nothing under them (CEditor lays a
component's layers on the panel, by design) and of knockout and effects across separate layers.
Of the Illustrator files, `S2.ai` (JPEG 2000 pictures) went from 45 % to 2 %, the soft-masked
`issue13520.ai` from 91 % to 15 % (its mesh shading is close, not exact), `personwithdog.ai` from 11 %
to under 1 %.

## The third pass: what was left, done

| Left after the second pass | Now |
|---|---|
| An SVG element with a filter is a picture, not shapes to edit | A filter that is a blur or a drop shadow (Inkscape's, Illustrator's, `feDropShadow`) on a shape is the layer's own blur or shadows, which the Component Designer edits; only one its effects cannot be (lighting, turbulence, a colour matrix), or one whose region cuts the effect off, is a picture. A layer's shadows, blur and bevel now scale with a component set to *Scale internals*, as a picture would: they kept their pixel sizes. A group of one shape with a blend mode is that shape with it |
| A Photoshop knockout through layers outside a group, said | Cut: each layer it reaches (to its group's start, or deep to the Background) gets a hole of its shape, as deep as its opacity, in its pixels or its mask. psd-tools' deep knockout files, wholly off as components, match. A Normal group whose layers blend is one picture, as Photoshop blends them within it (it was unfolded, its Multiply layers darkening what was under the group) |
| CMYK and Lab Photoshop files refused | Read, through ag-psd: a copy of the file said to be RGB (or Grayscale), so everything else is read as ever, its colours made RGB here; CMYK's black read in a second pass, its channel given the first colour's id. Duotone comes in grey, Indexed Color (where ag-psd fails on it) through its palette; the composite is decoded here. Lab colours in shapes and styles were grey: Lab to sRGB through D50 |
| A PDF mesh used as a fill's pattern in one colour; a pattern stroke not in a component | The mesh's picture cut to the shape (and nothing at all for a mesh with no area, as pdf.js draws it, where it was its mean colour over the page); a stencil painted with a pattern or a gradient, that paint through it; a stroke painted with an SVG pattern, a picture of the stroke over the shape |
| LibreOffice's small pictures blocky against smooth | Not a difference after all: poppler draws them smooth at full resolution; the harness had drawn its reference at 288 dpi and scaled it up. References are drawn at 1,024 pixels now |
| The production build out of heap here | `npm run build` asks node for 4 GB: the build peaks at 3.7 GB resident, past the 2.2 GB some machines give node by default |
| Found on the way | Every Photoshop gradient read with its stops at 0: ag-psd gives stop locations 0..1, three places read them as 0..4096 (shape fills, Gradient Map, gradient overlays), so each drew its last colour. A fill layer saved without pixels (shape layers, Color and Gradient Fills; 51 layers in 30 test files) is drawn from its fill and vector mask in a panel's flattening, with Photoshop's gradient styles and angle, and whole-document fills come into a component. A shape or text layer's Fill opacity was ignored |

Hue/Saturation's colour ranges were tried further (saturation toward luma or the mid grey, a smooth
fade at a range's edges, the strongest range alone): none came closer over the three test files than
the order kept, so it stays.

**Measured.** The files this pass touches, drawn by the commit before it and by this one, in the same
browser, PDF references now drawn at 1,024 pixels (under 1 % / 1-5 % / 5-20 % / over 20 % of pixels
visibly off):

| Corpus | Before | After |
|---|---|---|
| Photoshop, as a component on a white panel (139) | 60 / 8 / 16 / 55 | 68 / 9 / 18 / 44 |
| pdf.js's tests (96) | 37 / 29 / 25 / 5 | 37 / 30 / 25 / 4 |
| Illustrator (9) | 5 / 0 / 3 / 1 | 5 / 1 / 3 / 0 |
| LibreOffice drawings (40) | 6 / 25 / 9 / 0 | 6 / 25 / 9 / 0 |
| resvg's filter and blend tests (84) | 0 / 75 / 4 / 5 | 0 / 75 / 4 / 5 |
| Desktop icons with filters (7) | 1 / 5 / 1 / 0 | 1 / 5 / 1 / 0 |

Eighteen Photoshop files came closer. Two moved the other way, and both are files whose own picture
of themselves is blank (saved without Maximize Compatibility): their shapes, saved without pixels,
are drawn now, and the blank reference counts them as off. The filter tests hold where they were
with seven of their shapes now editable shapes with effects, two desktop icons' shadows among them.
With its reference drawn sharp, LibreOffice's set has no file a fifth off, and none worse than
before.

No import hangs, throws or makes bad output: the SVG and Photoshop files' 7,161 imports, the PDFs'
1,128 (the two stress files apart, as before). Photoshop components that import went from 260 to
290 of 316: the rest are files with nothing to draw (an adjustment layer alone) and one Multichannel
file. PDFs note only the 4 pictures pdf.js cannot decode. CI run 538 (commit `174da91`) passed in all four jobs.

## The fourth pass: what was left, done

| Left after the third pass | Now |
|---|---|
| A panel's flattening cannot draw layer styles, vector masks on pixel layers, adjustment layers, Dissolve; pattern fills without pixels | All drawn. Adjustment layers change what is under them in their group (or the layer they are clipped to, or wherever the adjustment they are clipped to applies), by opacity, masks and blend mode. Layer styles: Drop Shadow and Outer Glow cast under the layer (moved, spread, blurred, hidden under it as "Layer Knocks Out Drop Shadow" says), the overlays, Satin, Inner Glow, Inner Shadow, Bevel and Stroke drawn into it from its shape, Pattern Overlay from the file's patterns; "Blend Interior Effects as Group" honoured. Vector masks with their density, Reveal All and Hide All. Pattern Fill layers tiled from the file's patterns. Dissolve with a fixed grain as dense as Photoshop's |
| CMYK adjustments act on RGB; no colour profile | A panel's CMYK file is flattened on its inks, as Photoshop flattens it: cyan, magenta and yellow, and black, each flattened on its own, then made RGB. Curves' and Levels' Black channel, which ag-psd does not read, is read from the file. Colours go through a polynomial fitted to U.S. Web Coated (SWOP), Photoshop's default CMYK (pdf.js's), where they were multiplied out plainly. A file with an adjustment that works on whole colours (Hue/Saturation, Threshold) is flattened in RGB |
| An SVG filter other than a blur or drop shadow is a picture | Its colour primitives (saturate, hueRotate, grayscale, sepia, brightness and invert matrices, component transfers that are brightness, contrast or invert) are the layer's own Filters where the filter works in sRGB and they come in the order the layer draws them; CSS's filter functions (`filter: blur(2px) saturate(50%)`), which were ignored, the same, and a picture where they cannot be |
| The two pdf.js stress files exhaust memory | Refused with what is wrong before pdf.js reads them: a PostScript function that is not a program, a font whose format 12 map claims more codes than Unicode has. Over the 1,130 PDFs, those two and no others |
| Found on the way | Levels and Curves applied the RGB channel before each colour's own; Photoshop does the reverse (exact now on psd-tools' files, as is Posterize, which Photoshop cuts into bands rounded down). Legacy Brightness/Contrast is exact; the current one, which Photoshop publishes no formula for, is a curve fitted to its pictures, 7 levels off on average where the old guess was 30. Every gradient and pattern Scale was read as a percent of a fraction, so a scaled gradient was drawn at a hundredth of its size. A vector mask's paths with no operation of their own belong to the shape before them (one outline, so a hole stays a hole), and "starts with all pixels" only counts with no paths. A clipped layer clips to its base's shape, not its Fill: over a base at Fill 0% it shows in full. A Pass Through group below 100% Fill is drawn as a Normal one, and one below 100% opacity, or masked, mixes what is below toward itself rather than thinning each layer. An artboard draws its background. Files saved without Maximize Compatibility carry a blank picture of themselves and are left out of the measuring |

**Measured: the panel flattening against Photoshop's own picture of the file**, every psd-tools file
that carries one (281), share of pixels off by more than 16 levels:

| | Third pass | Fourth pass |
|---|---|---|
| Under 1 % | 174 | 212 |
| Over 5 % | 97 | 60 |
| Over 20 % | 78 | 34 |

Sixty-two files came closer, four moved the other way, by 2 to 7 points: three whose shadows
are close and not exact (the means came down), and one Pass Through group at 47 % Fill with a
Lighter Color layer in it, which Photoshop draws between the two readings; the one that fits its
adjustments exactly is kept. psd-tools' CMYK adjustment tests, on inks: Curves from 85 % to 0,
Levels 63 to 0, Invert 50 to 0, Posterize 37 to 0, legacy Brightness/Contrast 9 to 0, the CMYK blend
modes 34 to 0.1.

**Measured: as components in the editor**, the commit before and this one in the same browser, as the
third pass measured them (under 1 % / 1-5 % / 5-20 % / over 20 % of pixels visibly off):

| Corpus | Before | After |
|---|---|---|
| Photoshop, as a component on a white panel (139) | 68 / 9 / 19 / 43 | 75 / 8 / 17 / 39 |
| resvg's filter and blend tests (84) | 0 / 75 / 4 / 5 | 0 / 79 / 1 / 4 |

None worse by more than 2 points. The largest moves: Levels, Curves and Brightness/Contrast files
from 13-42 % to under 1 %, a Pass Through group with Fill and an adjustment from wholly off to exact,
resvg's `hue-rotate()` and colour-function tests from 16-67 % to 4 % (now the layer's own Filters).

No import hangs, throws or makes bad output: the SVG and Photoshop files' 7,161 imports, and the PDFs'
1,130, the two stress files now among them and refused with what is wrong. Photoshop components that
import went from 290 to 293 of 316 (pattern fills drawn). CI run 539 (commit `3d5c837`) passed in all
four jobs.

## The fifth pass: the "close" made exact where Photoshop's pictures say how

Each item was fitted to, or checked against, Photoshop's own picture of psd-tools' test files (the
composite a file carries), one setting at a time where a file isolates it; psd-tools (MIT) supplied
the readings it has already pinned against Photoshop, credited where they are used.

| Left after the fourth pass | Now |
|---|---|
| Hue/Saturation's colour ranges and the current Brightness/Contrast, fitted | psd-tools' models: Hue/Saturation through its measured saturation table, ranges weighted and lightness worked as Photoshop does; Brightness/Contrast as an S through Curves' spline with a fitted bend. Their files from 3-17 % off to under 1 % |
| Layer styles' contours close | Measured on layer_effects.psd, one style a layer on a flat ground: a Drop Shadow, an Inner Shadow and both Glows are the shape blurred by a Gaussian whose deviation is 0.42 of the Size, cut off at the Size (a glow's faint far end stops there, layer_params.psd), at 8 bits; a glow's Range divides it, so at 50 % it is full on the edge; Satin is two copies moved the Distance each way, blurred alike, their difference; Bevel and Emboss are that blur as a height, the Size times the Depth high, lit Lambert-fashion, highlight and shadow measured from the flat's light (an Emboss at half the Size, both sides). Contours through Curves' spline, Spread and Choke, Use Global Light, a gradient glow's opacity from its gradient. A Stroke as psd-tools splits it: its part inside the layer over it, its part outside under it in its own mode. Styles see a layer's pixels past the canvas. layer_effects.psd from 11 % off to 0.2 %, every style under 2 % |
| Hard Mix and Vivid Light at the edges | psd-tools' readings of Photoshop's extremes and ties: both exact |
| Mask feather; mask parameters ag-psd reads in part | A Feather is a Gaussian of that deviation (layer_mask_data.psd). Density and Feather read from the layer record where ag-psd leaves them out (mask-parameters-no-real-channel.psd, 84 % off to 0); a shape's vector mask below full Density or feathered shows its fill faintly over the whole canvas; a user mask kept apart from the vector mask multiplies the path, each at its own Density (mask-density-layervectormask.psd, 17 % to 0) |
| Blend If not read | Drawn from Photoshop's description (no file in the corpora uses it, so it is pinned by a test, not a picture); Advanced Blending's Channels read and drawn (ag-psd drops a lone restricted channel) |
| CMYK through a fit of the default profile; Multichannel not read | Through the file's own ICC profile (version 2 lookup tables, as Photoshop's CMYK profiles are), Relative Colorimetric with Black Point Compensation as LittleCMS finds a CMYK profile's black point: against the pictures Photoshop exported beside psd-tools' CMYK files, 0.1-0.15 of a level off on average, where the fit was 4-5. A Threshold's black in CMYK is the black ink alone (threshold_cmyk.psd, 64 % to 6). A Multichannel file is read as its channels' inks overprinted, which no picture in the corpora checks |
| Found on the way | ag-psd drops a style block it cannot read (string enums in lfx2), so those files had no styles at all: read here. A Bevel's style (Outer, Emboss, Pillow) and technique were not read, and its Depth was a hundredth (also in components). Gradient offsets were a hundredth of their size. A Divide or Color Dodge over a backdrop left at 1e-6 by float arithmetic dodged to white. A 32-bit file's setting colours are in linear light (vector-mask.psd, 29 % to 0.8). A flattened file's extra channel is its transparency only where Photoshop says so (an "Alpha 1" selection made a file wholly transparent). Artboards that are Pass Through drew no background (45 % to 0). A pattern linked with its layer starts at the layer's reference point (Pattern Overlay 23 % to 0.1). Interior styles took a layer's edge coverage twice |

**Measured: the panel flattening against Photoshop's own picture of the file**, as before (281 files):

| | Fourth pass | Fifth pass |
|---|---|---|
| Under 1 % | 212 | 245 |
| Over 5 % | 60 | 17 |
| Over 20 % | 34 | 9 |

Fifty-five files came closer and three moved the other way: the 4 by 4 pixel 16-bit files whose
Reflected gradient, with no pixels saved, Photoshop snaps to the pixel grid at that size.

**Measured: as components in the editor**, the fourth pass's commit and this one in the same browser
at the same size (under 1 % / 1-5 % / 5-20 % / over 20 % of pixels visibly off):

| Corpus | Fourth pass | Fifth pass |
|---|---|---|
| Photoshop, as a component on a white panel (139) | 75 / 8 / 16 / 40 | 81 / 11 / 12 / 35 |

None worse by more than 2 points. The largest moves: a grayscale Curves file and a file of gradient
styles from wholly off to exact, strokes from 15-23 % to under 1 %, a vector mask from 22 % to 3 %.
(A component's own vector layers draw gradients and strokes with the editor's renderer, so the
flattening's styles reach a component only where they are drawn into a picture.)

No import hangs, throws or makes bad output: the Photoshop files' 948 imports, the Multichannel file
now among those that import. CI run 540 (commit `25acb94`) passed in all four jobs.

## The sixth pass: what the fifth left, where a picture pins it

As before, each item fitted to, or checked against, Photoshop's own picture of the file that shows
it.

| Left after the fifth pass, or found on the way | Now |
|---|---|
| A group's stroke reaching past the canvas | A group may keep its styles in an older block ('lfxs') that ag-psd does not read: read here. A group's styles see the union of its layers' pixels past the canvas (group-stroke-off-canvas.psd, 15 % to 0.2). And a layer's styles are now always worked on a frame reaching past the canvas, so a layer whose pixels stop at the canvas has an edge there: an inside stroke on a layer the size of the canvas borders the picture, as Photoshop draws it (no file in the corpora has one; pinned by a test) |
| Type layers' gradient stroke laid over a box of its own | An outside stroke's gradient lies across the layer's box grown by the Size less a pixel, read back row by row from Photoshop's colours (stroke-effects.psd: 4 px on 24 spans 30; effect-stroke-gradient.psd: 3 px on 36 spans 40). Smoothness is a cubic spline through the stops: an end stop's slope 1 − 0.583 of its segment's (the two-stop S unchanged), an inner one's Catmull-Rom, so a Blue, Yellow, Blue stroke is level at its yellow, to a hundredth; a Reflected gradient is level at its middle. stroke-effects.psd 3.3 % to 1.6; effect-stroke-gradient.psd 17 % to 14, what is left there a Noise gradient |
| A Color Lookup without its table (fill_adjustments.psd) | One with nothing chosen leaves colours alone, as a freshly added one does. A Photo Filter's colour, which ag-psd reads in fractions (Lab, HSB), is put in its units: a warming filter's orange had read as black, and its Density as a fraction is read as one. The file 41.6 % to 41.0, its mean difference 8.8 to 8.1 levels; the rest is Photo Filter, Vibrance and Color Balance stacked, which no file isolates |
| Styles in a mode with a neutral colour | A style below full opacity in such a mode (Multiply's white, Screen's black, Overlay's grey) moves its colour that far toward the neutral one, then blends: B(b, n + k(s − n)), not the full blend mixed in by k. The two agree for Multiply and Screen and part for the rest: layer_comps.psd, a bevel's Linear Burn shadow, 19 % to 1.5; effects/blend-modes.psd, a shadow and a Color Overlay in every mode, 3.3 % to 0.1 |
| Masks | A layer mask kept beside the vector mask cuts a shape layer's fill too, and one turned off does not (layer_mask_data.psb 75 % to 0, masks2.psd 3.9 to 0.5) |
| Gradients and patterns | A 32-bit file's gradients mix their stops in linear light (gradient-fill.psd 9.4 % to 2.1). A gradient fill with no path lies across its layer mask's rectangle. A scaled pattern is interpolated, texel k at (x − origin) / scale (patterns.psd's 200 % lines, 6 % to 0); a pattern stroke linked with its layer starts at the layer's reference point, at its own scale and phase |
| A CMYK file's Threshold | A Threshold over the whole file is judged on the inks: what is under it flattened on the inks, each pixel then white, or the black ink alone, by its inks' plain RGB, 255·(1 − ink)(1 − black), weighed 0.3, 0.59, 0.11 (threshold_cmyk.psd, 7.2 % to 0.08, where any profile's colours put 6-8 % of its pixels on the wrong side) |
| Open paths | Filled as if closed by a straight line, with no curve of their own back to the start (pen-text.psd 2.9 % to 2.0) |
| A component's pictures | Found by the fidelity pass. A picture's styles were drawn without the layer's box or reference point, which the flattening has: its aligned gradients lay across its pixels' box and its linked patterns started at the document's corner. And the part of a stroke outside a half-covered edge pixel, drawn into the picture, was laid at its share of the whole pixel rather than of what the layer leaves uncovered, as the flattening lays it beside the layer: effect-stroke-gradient.psd's Transparent Rainbow stroke, as a component's picture, 23 % off to 2 |

Tried and not kept: measuring a stroke from the side of a pixel on its edge rather than its centre, so
that a square's corner rounds from the corner itself. Seven stroke files came out worse
(outside-stroke.psd 1.2 % to 1.6, center-stroke-sizes.psd 0.5 to 0.7) and two a little better
(feathered-stroke.psd 0.54 to 0.45); put back.

**Measured: the panel flattening against Photoshop's own picture of the file** (281 files):

| | Fifth pass | Sixth pass |
|---|---|---|
| Under 1 % | 245 | 253 |
| Over 5 % | 17 | 9 |
| Over 20 % | 9 | 8 |

Nineteen files came closer, and none moved the other way by more than 0.04 points (layer_params.psd,
2.16 % to 2.20).

**Measured: as components in the editor**, the fifth pass's commit and this one in the same browser
at the same size (under 1 % / 1-5 % / 5-20 % / over 20 % of pixels visibly off):

| Corpus | Fifth pass | Sixth pass |
|---|---|---|
| Photoshop, as a component on a white panel (139) | 81 / 11 / 12 / 35 | 81 / 11 / 12 / 35 |

Two files moved, both closer: effect-stroke-gradient.psd 13.5 % to 11.3 and fill_adjustments.psd
51.5 % to 50.5. Most of this pass is in the panel flattening: a component draws its shapes,
gradients and strokes with the editor's own renderer, and only its pictures take the styles' fixes.
(Before the component fixes above, effect-stroke-gradient.psd went the other way, to 16.9 %: that is
how they were found.)

No import hangs, throws or makes bad output: the Photoshop files' 948 imports, as in the fifth pass.
CI run 541 (commit `53d6bb2`) passed in all four jobs.

## The seventh pass: what the sixth left

| Left after the sixth pass, or found on the way | Now |
|---|---|
| A 16-bit file's Posterize (1-3.4 %) | A 16- or 32-bit file's pixels keep their full precision beside the 8 bits they are read as (16 bits a value: a 16-bit file's own array kept, so nothing new is allocated for one), and the flattening works from them. Posterize, in such a file, cuts the value at k / levels and draws each band on Photoshop's 15-bit scale: posterize_16bits_rgb.psd, grayscale.psd and cmyk.psd (its inks kept the same way) all three from 1-3.4 % to none. The rest of the adjustments keep the 8-bit colours they were fitted on |
| A 32-bit file's antialiased edges (gradient-fill.psd, 2.1 %) | A 32-bit file is put together in linear light, as Photoshop works one: its pixels taken there as they are drawn in, its styles' and adjustments' colours with them, the whole taken back to sRGB at the end. gradient-fill.psd 2.1 % to 0, vector-mask.psd 0.8 to 0.03, and pen-text.psd 2 % to 0.06: what the sixth pass put down to "Blend Text Colors Using Gamma" was this |
| Found on the way: a 32-bit file's own picture | Where it is partly transparent it is matted against white, as an 8-bit file's is, but in linear light; it was read without taking the white back off (transparentbg.psd, a black shape's edge read as grey; 1.15 % to 0.1). It is the picture an import uses where a file has no layers |
| Strokes at a square's corner (outside-stroke.psd, 1.2 %) | A pixel outside the shape is measured from the nearest edge pixel that is not itself outside, one inside from the nearest that is not inside; at a corner, from the corner pixel itself, where the nearest edge pixel of either side had been one outside it, a pixel further off. Read off Photoshop's picture of a 3 px stroke round a 16 px square, and then: outside-stroke.psd 1.2 % to 0.8, center-stroke-sizes.psd 0.5 to 0.2, double-stroke-effects.psd 0.4 to 0, feathered-stroke.psd 0.5 to 0.2, group-clips-child-stroke.psd 1.2 to 0.5, stroke-effects.psd 1.6 to 1.4; none worse |
| Found on the way: a shape's own Stroke | A shape's stroke setting (not a layer style) stays over the layers clipped to it, as a frame round a clipped picture, and over its overlays, under a Stroke style: stroke-composite.psd 1.9 % to 0.07. Its pixels hold the stroke drawn over the fill; where both are one colour, each pixel's share of it is how far its colour has gone from the fill's toward the stroke's, Photoshop's own antialiasing, and that much of the stroke is laid back on top |
| A Pillow Emboss over a stroke (layer_params.psd, 2.2 %) | An Outer Bevel's, an Emboss's or a Pillow Emboss's light outside the shape goes over the part of a Stroke beside the layer, which it shades in Photoshop's picture: the file's caption from 19 % of its pixels off to 14, the file 2.2 % to 1.7. What is left is the Pillow Emboss's own shape, which no file isolates |

Tried and not kept: fitting Photo Filter, Vibrance and Color Balance to fill_adjustments.psd. Its eight
adjustments are stacked over the whole canvas (Brightness/Contrast, Levels, Curves, Exposure, Vibrance,
Hue/Saturation, Color Balance, Photo Filter), and each of its 11,693 colours maps to one in Photoshop's
picture, so the chain is a clean function; but no candidate for the three unpublished formulas (GIMP's
two Color Balances, Photo Filter as Multiply, Soft Light or Overlay, kept by Rec. 601, Rec. 709, Lab
or HSL lightness, in sRGB or in linear light) fits it closer than 8.5 levels RMS. The Photo Filter's
colour alone, fitted freely, comes out with red above 255 and the density halved: the earlier stages
are part of it (Brightness/Contrast's model is within 3 levels, and Levels' gamma of 0.72 steepens
that), so a fit to this one picture would be a fit to its errors. Nor was a rule found for the
Lighter Color edges of passthrough_fill_blendmode.psd: Photoshop moves those pixels about 7 % toward
the layer's colour where, by luminance or by sum, the backdrop is the lighter.

**Measured: the panel flattening against Photoshop's own picture of the file** (281 files):

| | Sixth pass | Seventh pass |
|---|---|---|
| Under 1 % | 253 | 264 |
| Over 5 % | 9 | 9 |
| Over 20 % | 8 | 8 |

Twenty-two files came closer and none moved the other way by 0.05 points or more. The eight over
20 % are six 4 by 4 pixel 16- and 32-bit files, Dissolve's grain, and fill_adjustments.psd.

**As components in the editor**, against the sixth pass in the same browser: 81 / 11 / 12 / 35, as
before; group-clips-child-stroke.psd from 0.8 % to 0, nothing else moved. No import hangs, throws or
makes bad output (the 948 imports, as before). CI run 542 (commit `a704d17`) passed in all four jobs.

## The eighth pass: a second corpus, made in Photoshop to test against

PhotoCraft (storytold/photocraft, an open-source photo editor in Rust, MIT OR Apache-2.0) has
measured many of Photoshop's adjustments and styles against Photoshop itself with scripted runs, and
keeps the files it made for that in storytold/photocraft-corpus: 258 PSDs authored in Photoshop 2026
by a script (MIT OR Apache-2.0), each with Photoshop's picture of itself. They test one setting at a
time, in every colour mode and depth: what psd-tools' corpus could not isolate. Their models are
ported here where they are measured (credited in the code), and the corpus measured as psd-tools' is.

| Left, or found by the new corpus | Now |
|---|---|
| Photo Filter, Vibrance and Color Balance stacked (fill_adjustments.psd, 41 %) | PhotoCraft's measured models. Photo Filter multiplies the pixel's D50 XYZ, relative to white, by the filter colour's, in linear light; Preserve Luminosity puts the luminosity back as the Luminosity blend mode does. Color Balance folds the three tones into one Levels per channel (black and white points, a midtone gamma 2^(m/100)). Vibrance works in linear light: its Saturation toward the grey 0.288 R + 0.712 G, its Vibrance an HSV change. With PhotoCraft's current Brightness/Contrast too (within half a level of psd-tools' four settings, where psd-tools' model was 3 off), fill_adjustments.psd 41 % to 0, mean 8.1 levels to 1.0 |
| Black & White with a tint (98 %) | The smallest channel, plus the secondary and primary parts by their sliders; a tint at the grey's luminosity, as the Color mode does. 98 % to 0 |
| Exposure (10.8 %) | Through a plain 2.2 power in an RGB file, not sRGB's curve: 10.8 % to 0, and psd-tools' exposure_rgb.psd 0.5 to 0 |
| A Grayscale file's Gradient Map (99.8 %) | Its stops, from the binary block, held a grey's ink over 0..255 where descriptors give a percent: read so, 0.6-0.9 levels off |
| A 32-bit file's adjustments (26-63 %) | They work on its linear values, as Photoshop works them: Levels unclipped with a mirrored power, Photo Filter keeping luminance Y, Channel Mixer's percentages cut to 1/1024, Hue/Saturation scaling chroma about lightness by Photoshop's stepped factor; Selective Color alone on the encoded colours, as Photoshop's picture shows. All twenty RGB and grey 32-bit files under 1 % |
| Type (56 files, 1-8 %) | Photoshop blends type at its "Blend Text Colors Using Gamma: 1.45", on by default: both colours to linear light, then to a 1.45 gamma, blended, and back. Fitted on 96,000 edge pixels of 50 files, 0.05 of a level RMS, where a plain blend is 30 and every simple power 2 or more. 2 to 54 of 56 type files under 1 %. (psd-tools' text.psd, made with the setting off, from 0 to 0.28 %: a setting of the application, not kept in the file) |
| Chisel bevels (11-20 %) | PhotoCraft's measured ramps: straight facets, one step of 1 / (Size + 1) a pixel, each style and Hard or Soft its own (Inner, Outer, Emboss, Pillow). Inner 14 % to 0.4, Outer 12.5 to 1, Emboss and Pillow 15 to 3 |
| Stroke Emboss (13-20 %) | An inner bevel of the stroke's outline, its light and shade laid on the stroke's own colour; and it no longer casts the outside half an Emboss does. Inside stroke 13 % to 0.2, Chisel Hard 20 to 1.3; a Smooth one over an outside stroke 16 to 7.7 (below) |
| A CMYK file's Hue/Saturation and Color Balance (59 %, 8 %) | On the inks, cyan, magenta and yellow as an RGB colour's complement, black left alone (PhotoCraft's finding): both under half a level |

Tried and not kept: PhotoCraft's Gloss Contour divisor (the flat face's sine rather than the contour's
value there: the two gloss files from 26-31 % to 30-31); a gradient's ends rounded outward to whole
pixels (the 4 by 4 files' 45° falls out of it, but 146 gradient layers whose pixels Photoshop kept go
from 1.5 % off to 11 when redrawn so); psd-tools' gradient length (width and height mixed by angle:
46 %); the box measured between pixel centres (11 %).

**Measured: the panel flattening against Photoshop's own picture of the file.**

| | Before | Now |
|---|---|---|
| PhotoCraft's corpus (258): under 1 % | 114 | 199 |
| over 5 % | 104 | 44 |
| over 20 % | 60 | 31 |
| psd-tools' corpus (281): under 1 % | 264 | 265 |
| over 5 % | 9 | 8 |
| over 20 % | 8 | 7 |

In PhotoCraft's corpus 110 files came closer and none moved the other way; every RGB and grey
adjustment file at 8, 16 and 32 bits is under 1 %. In psd-tools' 17 came closer, and two by 0.1-0.3
points the other way (text.psd, above; masks.psb). As components: 81 / 11 / 12 / 35, as before. No
import hangs, throws or makes bad output: psd-tools' 948 imports as before, and all 258 of the new
corpus's files import as components. CI run 543 (commit `d201a0f`) passed in all four jobs.

## The ninth pass: what the eighth left

| Left | Now |
|---|---|
| A Lab file's adjustments (lab8 and lab16, 11 of 12 files each over 10 %) | Flattened on the stored L, a and b where every layer allows it (Normal layers, these adjustments), as Photoshop works a Lab file: Invert, Posterize, Levels and Curves each channel (Levels' and Curves' first channel record is L's); Threshold, Brightness/Contrast and Gradient Map on L (the map's stops mixed on their stored values); Photo Filter multiplying the XYZ taken from L, a and b with no RGB between, Preserve Luminosity keeping L; Hue/Saturation turning a and b round a square, the larger of \|a\| and \|b\| its chroma and each side 45°, Saturation scaling that chroma by 1 / (1 − s) up to 127, Lightness on L alone; Colorize setting a and b at its Saturation, at its Hue measured from the corner where a and b are equal, rounded down to whole levels. Read pixel by pixel from the files: the square's turn is 40° to a twentieth of a degree for every colour, its scale 1.33. A 16-bit file's own picture read at full precision (a and b over 0..65280). All 24 files under 1 %, each at 0 % off, 0 to 1.1 levels on average |
| A CMYK file's Channel Mixer, Gradient Map, Selective Color and Colorize (8-100 %) | Worked on the four inks together at the top of the file. Channel Mixer: each ink its percentages of the four and its constant, in ink, its records read in full (ag-psd drops each one's black source and the black output). Gradient Map: along the inks' plain Rec. 601 luma (PhotoCraft's measure for CMYK Threshold), the stops' four inks mixed as stored (the binary block keeps a CMYK stop as stored, 255 no ink). Selective Color: each range weighed on the plain complement as in RGB, its four percentages moving the four inks. Colorize: on the plain complement, separated plainly again, black first, cyan, magenta and yellow held together to 2.18 × (1 − K) under heavy black, as Photoshop's do past 75 % black. All eight files to 0 % |
| A bevel's Gloss Contour (26-31 %) | The contour remaps the light's cosine as before, but the highlight and shadow are measured from the flat face's own cosine (the sine of the altitude), not the contour's value there: a contour that peaks there lights the flat face in full, as Photoshop's picture does. Ramp-peak 31 % to 0.3, double-ring 26 to 3.9 |
| A bevel's Contour (13-15 %) | Over the bevel's own half of the blurred edge (an Inner Bevel's from the edge up), the whole depth high, by its Range, measured down from the top (ag-psd drops the Range: read from the descriptor). Ramp-peak 15 % to 2.9, double-ring at 70 % 13 to 6.1 |
| An Outer Glow with a gradient (18 %) | Its colour along the gradient as before, and faded where the blurred shape, before Range and Contour, falls below 0.11: full to there and then in proportion, read pixel by pixel. 18 % to 1.8 |
| A Smooth Stroke Emboss over an outside stroke (7.7 %), a centred Chisel one (8.7 %) | The shape bevelled as the stroke sits on it, lit on the stroke alone: an Outer Bevel under an outside stroke (its light grows towards the shape, as Photoshop's does), an Emboss under a centred one, an Inner Bevel under an inside one. 7.7 % to 0.3, 8.7 to 3.2; the Chisel outside ones 4.1 to 1.4 and 1.3 to 0.7 |
| Smart filters with a filter mask (25-41 %) | The layer's pixels are the filters' result everywhere; Photoshop's picture mixes them with the smart object's own pixels, which it keeps in the file's 'FEid' cache, through the filter mask kept there too. A hard mask 39 % to 0, a stack 25 to 0, a gradient mask 41 to 3.2 |
| Type in Multiply (6.3 %) | Blended as ever, then mixed in at its edge at the type gamma: 6.3 % to 0 |
| Gradient Map's Smoothness | Never past either stop of a segment: every Gradient Map file a third closer (0.42 levels to 0.29 in RGB, 1.8 to 1.1 in Lab) |
| psd-tools' 4 by 4 files (62-94 %) | Their colours: a CMYK or Lab file of fills alone now mixes its gradient's stops as inks or in Lab, and a 32-bit Grayscale file's stops, kept as ink, are linear light like its pixels (4x4_32bit_grayscale.psd 87.5 % to 56). Their angle stays (below) |

Tried and not kept: the gradient's ends taken out to whole pixels, again: it draws all six 4 by 4
files to 0 %, and the 146 gradient layers whose pixels Photoshop kept go from 0.84 % off to 17.8 when
redrawn so (a Reflected 30° on 34 pixels among them), so it is not Photoshop's rule. For a CMYK Photo
Filter: the RGB filter on the stored inks (7.9 levels), any filter colour fitted freely (6), the Lab
filter through the profile (8); a multiply of the stored values with their luminosity kept fits the
black-free colours to 0.2 of a level and not the rest. For the Lighter Color edges in a Pass Through
group at 47 % Fill: two regimes, read pixel by pixel. Where the layer is the lighter, it goes in at
its coverage times the Fill, as drawn. Where the backdrop is, Photoshop still moves the pixel about
(0.55 − 0.45 α) of that way, which no reading of the group found here gives.

**Measured: the panel flattening against Photoshop's own picture of the file.**

| | Before | Now |
|---|---|---|
| PhotoCraft's corpus (258): under 1 % | 199 | 236 |
| over 5 % | 44 | 3 |
| over 20 % | 31 | 0 |
| psd-tools' corpus (281): under 1 % | 265 | 265 |
| over 5 % | 8 | 8 |
| over 20 % | 7 | 7 |

In PhotoCraft's corpus 46 files came closer and one moved the other way (a Chisel Pillow Emboss with
both contours, 2.5 levels to 3.2 on average, its pixels off unchanged). In psd-tools' three came
closer and three the other way: layer_params.psd and .psb, 0.06 of a level on average (their
gradient glow), and 4x4_16bit_lab.psd by one pixel of sixteen (its stops now mixed in Lab, its angle
still not Photoshop's).

## Left, and why

- **An SVG filter that is lighting, turbulence or displacement**, or colours in SVG's default
  linearRGB, is a picture of its element, drawn right, edited as one.
- **A Lab file** is converted plainly, and a CMYK file with a version 4 profile (or none) through the
  fit of the default press profile. A Multichannel file's display is Photoshop's model of inks, not
  checked against a picture of one. A Lab file with another blend mode, a layer style or an
  adjustment Photoshop does not work on L, a and b is flattened in RGB.
- **Parts of layer styles not measured**: Soften, a Precise glow, a Contour on a Chisel bevel or an
  Emboss, and a Noise gradient (its average colour) are drawn by the same readings and named in the
  Console; a style's Noise and Jitter and a bevel's Texture are not drawn. A bevel far larger than its
  shape (layer_comps.psd, Size 100 on a face 160 px across) shades a little differently from the
  fitted one (1.5 % of pixels).
- **Random in Photoshop**: Dissolve's grain (its density is matched) and a Noise gradient
  (effect-stroke-gradient.psd, 14 %), each from Photoshop's own random numbers. PhotoCraft draws its
  own too; neither can match Photoshop's pixels without its generator.
- **A CMYK Photo Filter** (16.6 %): on the inks in Photoshop, black kept exactly, by a rule not
  found (above); drawn in RGB here.
- **The rest of the flattening's differences**, each measured and none with a file that pins a
  rule for it: a Lighter Color layer's half-transparent edge pixels in a Pass Through group below
  full Fill (4 %, above); a Reflected gradient stroke (effect-enums.psd, 1.4 %), which Photoshop
  draws black for 6 pixels each side of its middle and then near straight to its ends, which neither
  spline here fits closer than 11 levels; a Pillow Emboss's shading (layer_params.psd, 1.7 %); a
  stroke along a polygon's slanting edge (shape-fx2.psd, 1.7 %); a smart filter's gradient mask
  (3.2 %), where Photoshop's cache is transparent under part of the layer; the double-ring Contour
  (6.1 %) and Gloss Contour (3.9 %); and gradients on very small boxes, whose angle Photoshop moves
  off what the file says (at 4 by 4 pixels, 30° drawn as 45°: psd-tools' six 16- and 32-bit 4x4
  files, 56-94 %, which carry no pixels of their gradient), by a rule not found: taking its ends to
  whole pixels gives those and breaks 146 others.
