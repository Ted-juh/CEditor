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
import went from 290 to 293 of 316 (pattern fills drawn).

## Left, and why

- **An SVG filter that is lighting, turbulence or displacement**, or colours in SVG's default
  linearRGB, is a picture of its element, drawn right, edited as one.
- **CMYK through the file's own profile**: colours go through a fit of the default press profile,
  so a file made for another press differs a little. A Lab file is converted plainly; a Multichannel
  file is not read.
- **Hue/Saturation's colour ranges** and the current Brightness/Contrast are close, not exact: Photoshop
  publishes neither formula, and both were fitted to its pictures.
- **Layer styles' exact contours** (a shadow's or bevel's), and Dissolve's random grain, are close.
- **Photoshop's other remaining differences** against its own pictures are in blend modes it draws
  its own way at the edges (Hard Mix, Vivid Light), masks whose parameters ag-psd reads in part
  (feather), and blending options CEditor does not read (Blend If).
