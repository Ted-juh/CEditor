# Import corpus run

*Run 2026-11-06 and 07, on branch `claude/new-session-ofvsj0`.* Every artwork and model import run
over files made by other programs, thousands of them, to find what breaks before a user does. What it
found, what was fixed, and what is left.

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

## After the fixes

| Route | Imports | Hung | Threw | Bad output | Refused, with a reason |
|---|---|---|---|---|---|
| SVG panel, component | 6,213 | 0 | 0 | 0 | as designed (no placeholder layer; empty drawings) |
| PDF and `.ai` | 1,130 | 0 | 0 | 0 | passwords, damaged files, empty pages, over 2,000 shapes |
| Photoshop panel, component | 948 | 0 | 0 | 0 | colour modes; panel without placeholders |
| glTF | 174 | 0 | 0 | 0 | 20: Draco (16) and KTX2 (4), named |

All 9 Illustrator files import. Two pdf.js stress files (`bug2086012`, `issue_cmap12`) exhaust memory
inside pdf.js itself, before CEditor reads anything.

Drawn and compared (share of files under 1 % / 1-5 % / 5-20 % / over 20 % of pixels visibly off):
desktop icons 67 / 47 / 33 / 3; resvg's tests 65 / 107 / 51 / 77 (filters, which are not drawn, most
of the last); pdf.js's 4 / 55 / 22 / 15; Illustrator 2 / 1 / 3 / 3; Photoshop 44 / 9 / 19 / 67 on a
white panel, where most of the last are psd-tools' tests of blend modes with nothing under them
(CEditor lays a component's layers on the panel, by design, where Photoshop's own picture lays them on
nothing) and of knockout and advanced blending.

## Left, and why

- **Draco meshes and KTX2 textures; JBIG2 and JPEG 2000 pictures in PDFs.** Each needs a WebAssembly
  decoder carried with the editor (Draco's and Basis's from three.js, pdf.js's `jbig2.wasm` and
  `openjpeg.wasm`, together about 1 MB, loaded only when a file needs one). A decision on what the
  editor carries; until then each is named when it is met.
- **SVG filters** (blur, drop shadow, lighting) are not drawn; said. A drop shadow could become the
  layer's shadow.
- **PDF soft masks** (opacity masks) are not applied; what they mask shows unmasked (black boxes in
  one Illustrator file). Listed in the Console.
- **Hue/Saturation's colour ranges** (Reds, Yellows, ...): the master range only, said.
- **A group's Fill opacity and knockout** in Photoshop are not applied.
- **A gradient outline on a path** (Inkscape's highlights) draws as a broad band where it is thin. In
  the renderer, not the import.
- **CMYK and Lab Photoshop files** are not read (ag-psd does not); the notice says how to convert.
