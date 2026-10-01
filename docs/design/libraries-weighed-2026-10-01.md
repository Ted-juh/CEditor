# Sixteen more libraries, weighed: five measured against the tree, one for Tier 3, one reference, nine dropped

> Status: **review, 2026-10-01. Nothing here is built or vendored.** The third pass of the kind
> [`storage-validation-libraries-2026-09-30.md`](storage-validation-libraries-2026-09-30.md) and the
> 21-project review before it made: candidates judged against what the program needs today, each
> one run against the real tree where that was possible, with the numbers written down. Where a
> number is missing it says why. Every licence and version below was read from the npm registry on
> the day; the GitHub API was not reachable from this container, so star counts and commit dates are
> not claimed.

## How these were chosen

Not from a list this time. The question was: which gaps does the program have *now* that somebody
has already written the answer to? The gaps came from `known-issues.md`, `product-ideas.md`,
`tier-3-moonshots.md`, the absence of a third-party notices file, and the shape of the web tree
(1,340 inspector cells, 94 Markdown documents, a 21 MB `dist`). Everything already named in
[`open-source-landscape.md`](open-source-landscape.md) or the two earlier reviews was left out
unless the earlier verdict had become wrong.

## Measured, and worth taking

### knip — dead exports, found by the tool rather than by reading

`knip` 6.39.0, ISC, released 2026-09-30, 13 dependencies, development only.

Run over `CE/web` with the test suite, the browser checks, `scripts/` and `tools/scripts/` declared
as entry points (so an export used only by a test is not called unused):

| What | Count | Notes |
| --- | --- | --- |
| Unused files | 0 | |
| Unused dependencies | 0 | Shipped and development alike. |
| Unused exports | 453 | `utils/` 248, `stores/` 125, `scripting/` 31, `models/` 17, `editor/` 16 |
| "Unresolved" imports | 219 | All of them the browser checks' `/src/...` paths, which Vite serves and knip does not know. Configuration, not a defect. |

Five of the 453 were checked by hand (`isSelected` in `stores/panels.js`; `costKeysFor`,
`extensionCost`, `requiresDeviceHost`, `MODULE_GATE_MESSAGE` in `scripting/panelApi.js`): none is
imported anywhere, in source, tests, checks or tools. Each is a function that is still called inside
its own module, so the *export* is dead, not the code. That is the useful kind of finding: it is
how a module's public surface drifts from what the program uses, and it is what makes a later
reader think a function is load-bearing when it is not.

**Verdict: take it**, as a local command (`npm run deadcode`, a `knip.json` with the entries
above), and prune the 453 in a pass of its own with the full suite green after it. Not a CI job
without asking, per `CLAUDE.md`; the first run is the one that matters, and after it the number
should stay near zero.

### license-checker-rseidelsohn — the notices file the installer does not ship

`license-checker-rseidelsohn` 5.0.1, BSD-3-Clause, 2026-05-27, development only.

`tools/installer/CEditor.iss` names no licence text and no notices, and the repository has no
third-party notices file. For an AGPLv3 program that ships an installer this is a gap, not a
problem: every shipped web dependency is permissive. Measured over `CE/web`'s production tree,
54 packages:

| Licence | Packages |
| --- | --- |
| MIT | 44 |
| Apache-2.0 | 5 |
| ISC | 2 |
| 0BSD | 1 |
| MIT AND Zlib | 1 |

(The one `UNLICENSED` entry the summary prints is `CE/web` itself.) Nothing copyleft, nothing
unknown. Apache 2.0 asks for its NOTICE to travel with the code, and nothing carries it today.

**Verdict: take it**, as the npm half of a `tools/scripts/gen-third-party-notices.mjs` that the
installer stages. The other half is not npm and has to be written by hand once: JUCE (AGPLv3 with
the four patches in `JUCE/VENDORED.md`), SQLite (public domain), Lua and sol2 (MIT, fetched at
configure time), clap-juce-extensions (MIT, vendored), the Liberation fonts (OFL 1.1, named in
`editor-geometry-libraries-2026-09-30.md`), and the WebView2 loader. The output belongs in the
installer and in Help › About.

## Measured, and nothing to take yet

### markdown-link-check — ninety-four documents, no broken link

`markdown-link-check` 3.15.0, ISC. Run over every `.md` under `docs/` plus `README.md` and
`CLAUDE.md`, relative links only (the 429 external links need the network and were skipped):

| Files | Relative links | Broken |
| --- | --- | --- |
| 94 | 237 | 0 |

**Verdict: not now.** There is nothing to fix, and a tool that reports zero is a tool nobody runs.
Keep the command in this record; run it after a documentation reorganisation, which is the only
time it has something to say.

### rollup-plugin-visualizer — what the 21 MB of `dist` is made of

Run through `vite-bundle-visualizer` 1.2.1 (MIT), which adds the plugin to the project's own
build. Pre-minification sizes, by chunk, from the raw data:

| Chunk | Rendered | Of which | Loaded when |
| --- | --- | --- | --- |
| `typescript` | 9.3 MB | all `typescript` | A TypeScript script is edited. Lazy. |
| `main` (editor) | 6.0 MB | own code 4.4 MB, `lucide-svelte` 1.27 MB, `acorn` 227 KB, `luaparse` 85 KB | Editor start |
| `playerStartup` | 5.7 MB | own code 5.6 MB, `dexie` 95 KB, `svelte` 23 KB, `rbush` 15 KB | Every exported plug-in |
| `InstrumentHostView` | 1.7 MB | own code 1.5 MB, `lucide-svelte` 211 KB | Hostage opens |
| `woff2-encoder` | 1.0 MB | the decoder | A WOFF2 font takes part in a shape. Lazy. |
| `psdPanelImport` | 831 KB | `ag-psd` 718 KB, `fflate` 88 KB | A PSD is imported. Lazy. |

The one number that looked like a defect was not. `lucide-svelte` at 1.27 MB of the editor chunk
read as a whole icon set pulled in by a bare `import { X } from 'lucide-svelte'`; it is 290
distinct icons each imported from its own `lucide-svelte/icons/<name>` path, which is the
tree-shaken form, at about 4 KB of Svelte component each before minification. The player chunk,
the one that ships inside every export, is 97% the program's own code; there is no dependency to
remove from it.

**Verdict: keep as a measurement, not a dependency.** `npx vite-bundle-visualizer` from `CE/web`
answers "what did that change cost the player" in two minutes, and that question comes up each
time a library is added. It joins `tools/scripts/lib/exportSizeReport.mjs` as the other half of
knowing what an export weighs.

### imagetracerjs — a raster faceplate as vector parts

`imagetracerjs` 1.2.6, Unlicense (public domain), last release 2020-05, no dependencies, 3.1 MB
unpacked of which the library is one file; `@image-tracer-ts/core` 1.0.2, MIT, 2023-04, is a
TypeScript port of the same algorithm. Both take an `ImageData` and return SVG or the traced path
data, so neither needs a canvas and either runs in the WebView or in Node.

The program imports SVG artwork into parts (`svgPanelImportActions.js`) and Photoshop artwork into
layers; it has no way in for a flat PNG or JPG of a faceplate, which is what a manufacturer's
product page or a scan gives you. Tracing turns that into the SVG the importer already understands.
Measured on two images in the tree, with the library's own presets:

| Image | Preset | SVG | Paths | Time |
| --- | --- | --- | --- | --- |
| `hostage-logo.png`, 2087×754, 431 KB | default (16 colours) | 373 KB | 1,522 | 1.6 s |
| | posterized2 | 191 KB | 401 | 2.3 s |
| | detailed | 2,584 KB | 12,813 | 6.4 s |
| `component-timbre.png`, 520×522, 203 KB | default | 185 KB | 686 | 0.2 s |
| | posterized2 | 57 KB | 176 | 0.3 s |
| | detailed | 2,239 KB | 9,635 | 1.2 s |

Rendered side by side in Chromium, the default trace of the logo is the logo: the knob faces, the
pointers and the lettering are closed shapes with the right colours. `posterized2` keeps the shapes
and loses the second colour (orange and black become one brown), so a two-colour panel wants the
default preset or `numberofcolors: 4`. `detailed` is for photographs and produces path counts no
inspector should be asked to hold. A photograph of a synth, with its gradients and reflections,
goes the same way under any preset; that is the "panel from a photo" idea in `product-ideas.md`,
which needs control *detection*, not tracing, and is a different project.

**Verdict: prototype**, as *File › New Panel from Raster Artwork*: trace with the default preset,
hand the SVG to the existing importer, and let the user pick the colour count on a preview. Its
limits are the importer's: a traced panel is one part per colour region, so a knob's face and its
pointer arrive as two parts the way an SVG's would. Nothing to ship until a real faceplate image has
been through it; the two in the tree are a logo and a screenshot.

## Not measured, and why

### pdf.js — the manual as text, for Tier 3

`pdfjs-dist` 6.3.289, Apache-2.0, 2026-08-29, no dependencies, 34 MB unpacked.

`tier-3-moonshots.md` §1 proposes a device profile read out of the manual's MIDI implementation
chart, and spends its length on the hard case, a photographed chart, where the answer is OCR
(`tesseract.js`, already in the landscape). Most manuals from this century are text PDFs, and for
those the chart is a table whose cells have coordinates. pdf.js gives every text run its position
on the page; a chart's columns are then the x-positions that repeat, which is a smaller job than
OCR and exact where OCR is approximate. It is the right first stage for the text case, with OCR
as the fallback when a page has no text layer.

Not measured: there is no manual in the tree, and the manufacturers' sites are outside this
container's network. **Verdict: the enabler for Tier 3 §1, on the tool side only** (`tools/dpd/`,
beside `import-ins.mjs`), never in the WebView. Nothing until that work starts.

## Reference, recorded elsewhere

### iPlug2 — how another webview plug-in framework keeps the DAW's keys alive

iPlug2 (zlib-like licence; CLAP, VST2, VST3, AUv2, AUv3, AAX, WAM; WebView2 on Windows, WKWebView
on macOS) is the other C++ framework that puts a web page in a plug-in window, and it has met the
focus problem `known-issues.md` scopes under *Keyboard shortcuts in a DAW*. Its answer, in
`IPlug/Extras/WebView/IPlugWebView_win.cpp`, is on the page side: a `keydown` and a `keyup`
listener on the document that forward the key to C++ through the bridge whenever the active
element is not a text input. No `AcceleratorKeyPressed` handler, no JUCE-style focus patch. That
is the second half of the fix the known issue sketches (the page saying what it has claimed), done
without the first. Recorded there as the reference beside wxp.

## Looked at and dropped

| Project | Why not |
| --- | --- |
| `simplex-noise` 4.0.3 (MIT) | Proposed for procedural knob and panel textures. `utils/materialFilter.js` already makes brushed metal, leather and the rest from SVG `feTurbulence`, with the Material section's `grain` as its frequency. A noise function in JavaScript would redo in pixels what the filter does on the GPU. |
| CodeMirror 6 (`@codemirror/view` 6.43.13, MIT) | Decided twice already (`open-source-landscape.md`, `mining-external-corpora.md`), and the reasons hold: `editor/CodeEditor.svelte` has completions, hover, go-to-definition, rename, folds, column editing and breakpoints wired to the program's own language service, and swapping the surface would cost that integration to gain nothing the scripts need. |
| An NKS (`.nksf`) reader (`@msgpack/msgpack` 3.1.3, ISC, for its three MessagePack chunks) | The instrument host already has one: `vendor-preset-discovery.md` describes the NKS adapters and the sound browser lists `.nksf` by name. The format is RIFF with `NISI`, `NICA`, `PLID` and `PCHK` chunks; nothing new to add. |
| JZZ (MIDI 2.0 UMP in JavaScript) | Already in the landscape. The program's MIDI goes through JUCE, not the page. |
| `uplot` 1.6.32 (MIT) | A fast time-series chart. `mixer-metering.md` asks for meters and a scope the program draws itself; no table or history chart is asked for anywhere. |
| `cropperjs` 2.2.0 (MIT) | Cropping on asset import. Nobody has asked; the Assets tab's replace flow shipped this week and a crop step belongs on a report, not a guess. |
| `@neplex/vectorizer` 0.1.0 (MIT) | VTracer behind a native Node binding. Faster than imagetracerjs and unusable in the WebView, which is where the import runs. |
| `potrace` 2.1.8 (GPL-2.0) | Monochrome only, and the npm port is from 2020. The licence is fine for an AGPL program; the single colour is not fine for a faceplate. |
| `clang-tidy` | Installed here, and there is no compile database to point it at: the Linux build does not export one. `CMAKE_EXPORT_COMPILE_COMMANDS=ON` is a one-line configure flag when somebody wants a static-analysis pass over `CE/src/`; it is not a library and not this review's to add. |

## What this pass could not check

The GitHub API was not reachable from the container, so activity and maintainer counts come from
the npm registry's release dates alone. `community.native-instruments.com` is blocked, so the NKS
chunk layout above is from secondary sources and the program's own adapter, not the forum thread.
Nothing in the verdicts rests on either.
