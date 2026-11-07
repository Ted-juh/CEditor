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

## Left, and why

- **An SVG element with a filter, or a group with a blend mode, is a picture**, not shapes to edit:
  drawn right, edited as one. A drop shadow could become the layer's own shadow instead; it does not
  scale with a component the way a picture does, so it is not.
- **A Photoshop knockout through layers outside a group** cannot cut layers that come in as layers of
  their own; said. A panel's flattened background draws it.
- **Hue/Saturation's colour ranges** are close, not exact (above).
- **A PDF mesh used as a fill's pattern**, as against painted on its own, is one colour; a pattern
  used as a stroke's paint is drawn on a panel and not in a component.
- **LibreOffice's PDFs** keep the shaded parts of a drawing as small pictures at 96 pixels an inch,
  marked not to be smoothed: poppler draws them blocky, a browser smooth. Neither is wrong.
- **CMYK and Lab Photoshop files** are not read (ag-psd does not); the notice says how to convert.
- **Building here**: the production build needs more than this container's default 2.2 GB of
  JavaScript heap (`NODE_OPTIONS=--max-old-space-size=4096`), the commit before this pass as much as
  this one. CI's runners have more memory, and their default is larger.
