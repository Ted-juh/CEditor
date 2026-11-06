# Blender knobs in CEditor: where it stands

Status, 2026-11-06: **built and measured; the three defects found in review are fixed**, the two
interface ones as approved from their mock-ups ([`blender-knob-fixes-design.md`](blender-knob-fixes-design.md),
its *As built* section first; [`blender-knob-fixes-mockups.html`](blender-knob-fixes-mockups.html)). Read this first in a fresh
session, then `CLAUDE.md`. The design record is
[`changeable-control-sets.md`](changeable-control-sets.md) (section *Bringing designs in*); the user
documentation is [`../panel-artwork-import.md`](../panel-artwork-import.md) (section *A knob modelled
in Blender*).

## What it is

A Blender add-on, `tools/blender/ceditor_layers.py`, renders a knob, fader or switch modelled in
Blender with Cycles and writes it as a layered Photoshop file. CEditor's **File › New Component from
Photoshop Artwork** reads that file into a component whose parts move by their names (pointer turns,
fader slides, lamp lights) and whose colours stay changeable while the light stays as Blender
rendered it. The goal throughout has been that the component in CEditor looks like Blender's own
render, on any panel and at any angle, measured rather than judged by eye.

## Branch and state

- Work continues on branch `claude/new-session-ofvsj0`, which carries all of
  `ccr-4944badf-4smz0y` (below) and, on top, the import notice's fix, the design and mock-ups for
  defects 1 and 3, and their build.
- Branch `ccr-4944badf-4smz0y`. `main` is at `87d0eedc` (the merge of changeable control sets);
  the branch carries, on top of it, `20a7382b` (the add-on), `bad257ce` (ignore `__pycache__`),
  `f1380d80` (made for the scene's panel; a turning part's shadow keeps its side), `a5fcc1cc` (the
  reflection rendered per angle), `aa902a74` (the five below) and this file. **Not merged to main**:
  merge only when the owner asks, and run `npm run build` with
  `NODE_OPTIONS=--max-old-space-size=6144` first.
- CI on this branch is started by hand (Actions › CI › Run workflow on the branch). Runs 525, 526
  and 527 were green; 528, on `aa902a74`, was running when this was written. Run 529, on
  `claude/new-session-ofvsj0` at `418c630` (the fixes, on/off Value From and the baker's blend
  modes), was green in all four jobs, the Windows build and its C++ tests included. Run 530, at
  `986c9ce` (the light and gloss written, a part worked out again in its new colour), and run 531,
  at `1cdb635` (the light a part throws on what is beside it), were green in all four jobs too.
- Everything checked locally on `aa902a74`: the web suite 7574 of 7579 (none failing, 5 skipped),
  the 40 browser checks, lint, the add-on's test 50 of 50 (160 px) and 48 of 48 (the fixture's
  96 px), Blender 4.0.2. Since the fixes: the add-on's test 61 of 61 and 59 of 59, the browser
  checks 41 (with `pictureColour`).

## What works, and how close it is

The add-on's test (`tools/blender/test_ceditor_layers.py`) builds a knob (a pale skirt, a metal cap,
a rounded orange pointer, a red lamp beside it, a sun), writes it, has Blender render it, and holds
the layers, laid as CEditor lays them, to the render. In levels of 255, at 160 px:

| What | Now | Before the last round |
|---|---|---|
| The knob itself, edges where parts meet included | mean 0.6, 99th percentile 1 | |
| On the panel it was modelled on, the whole picture | mean 0.8, p99 5 | |
| On a dark, a light and a red panel (Blender rendering each) | mean 0.9 to 1.4, p99 5 to 6 | |
| The light on those panels (cap glare, lamp light) | p99 2 to 6 | 15 to 17 |
| The knob's outline on those panels | mean 1.4 to 4.4 | 5.7 to 11.1 |
| Turned 120°: the pointer's own light | mean 11 | 63 |
| Turned 120°: its reflection in the cap | p99 6 | 10 |
| Turned 120°: the cap round it, its shadow included | mean 0.9 | 1.4 |
| Turned 120°: the shadow's place | 0.2 px off | 5.9 px turned about the axis |

In the editor itself (a 320 px knob, screenshots against Blender's renders): mean 1.0, p99 4 at rest
and turned 118.8° with the wheel; on a plate of a dark panel's colour mean 1.1, p99 6, its outline
1.8 (8.7 with the outline mixing switched off).

The pieces, and where they live:

- **A turning part at each angle.** The pointer, its shadow, its reflection, its shading and
  highlights are rendered every 27°, written turned back to rest ("pointer at 54", "pointer shadow
  at 54", ...). The import makes each set one **part of frames** (`utils/imageFrames.js`, a mode of
  a part's `Image` section): its frame follows the value, the two either side are added inside the
  part (plus-lighter in an isolated group), which is their exact mix, and the part is then laid on the
  panel in its own blend mode. Separate layers faded against each other would have let shadows and
  multiplies through by a quarter between angles. Drawn by `editor/InteractivePartRenderer.svelte`
  (editor, Player, plug-ins) and `utils/customComponentFilmstripBaker.js`. Built in
  `utils/artworkComponent.js` (`framesFromAngles`); an angle with nothing drawn, and the ends of the
  dial's travel, are frames of nothing.
- **The step** stays 27°: 13.5° and 9° measured the same to a tenth of a level at two and three times
  the export time. What remained was the picture turned twice (back to rest in the add-on, on again
  in the browser); the add-on turns it back through a Lanczos window (`turned(..., sharp=True)`).
- **Light on the panel** is colour dodge (a multiple of whatever panel is under it, written at full
  opacity, the only way colour dodge multiplies on a light panel) plus an added "shine" layer for what
  the panel's gloss reflects; both measured from the panel's own render passes.
- **The outline** is mixed in CEditor: the add-on writes the parts that stay put with their true edge
  coverage and names them in the file's XMP (`<ceditor:linearEdges>`); the import marks them
  (`Background.Fill.imageEdges: 'linear'`); `utils/linearEdges.js`, called from
  `editor/CanvasControl.svelte`, sets their edge pixels' opacity for the colour under the control
  (the panel's, from `panelSolidColour` in `utils/backgroundCSS.js`, or a filled plate under it) and
  the component's own layers under the part. `editor/PanelPreviewSurface.svelte` gives its panel
  through `PANEL_SURFACE_CONTEXT_KEY`; the editor canvas uses the active panel.
- **A lamp on a dial** lights with a value of its own, `lamp` (bool, "Lamp"), on or off as the file
  shows it, for the panel to set.
- **A part under another's edge** (a skirt under the cap's rim) keeps its whole look in its colour
  layer: inside means the part covers the pixel whole by itself.

## Defects found in review

1. **Fixed:** a colour per picture (`Fill.imageColour`, `Image.colour`) worked out on its pixels;
   a part's shading and highlights, and a turning part's reflection in a metal, go with it; the look bar and the Colors dock edit it, light layers point to the layer they light, the
   Layers list says Picture, Frames or Light. The add-on writes the light on each part and its gloss,
   and CEditor works its colour, shading and highlights out again in the new colour: against Blender
   with the material changed, where the part covers the pixel, the skirt red a mean 1.45 levels, the
   metal cap brass 1.1, its glint included; and what each lights beside it with it, the panel by the
   red skirt 1.8, the skirt by the brass cap 1.5. The review's description: The manual says "change a part's colour
   with its tint". A picture layer's tint (`Background.Fill.imageTint`) is drawn by `buildLayerStyle`
   (`utils/backgroundCSS.js`) as an inset box-shadow wash at 30 %, over the layer's whole box: set
   red on the skirt, it painted a red rectangle over the knob and the panel corners round it
   (checked in the browser). And the Colors tab, with a picture layer selected, edits the fill colour
   (`Editing: skirt › Fill`), which a picture layer does not draw, so nothing visible happens. Parts of
   frames have no Background at all, so no tint either; only Effects › Filters (with **Apply to** set
   to the layer) recolours them, and filters cannot pick a colour. This predates the Blender work (it
   is the SVG and Photoshop import's) but it is that work's main promise. It needs a design and, as
   a UI change, a mock-up for the owner first. Things to settle: a real recolour of a picture inside
   its own shape (multiply by a colour masked by the picture's alpha, or a colour matrix), what it
   means for a colour layer whose edge band holds the lit look, how it reaches a part of frames, and
   that the Colors dock edits it (the owner's rule: colours go through the Colors dock).
2. **Fixed.** `buildArtworkComponent` returns the number of parts it made and both importers report
   it; the test knob reads "A dial of 19 layers" (its file holds 49), checked in
   `test/blenderLayersImport.test.js`. The review's description: **The import notice counts the
   file's layers, not the component's.** "A dial of 71 layers" for a
   component the designer shows as 21: `planPsdComponentImport` returns `layers: layers.length`
   before `framesFromAngles` folds each angle set into one part. Count the parts. Small; fix with a
   test (`test/blenderLayersImport.test.js` matches `A dial of \d+ layers`).
3. **Fixed:** the Interact card lists such a value under "Set by the panel", with the layers it
   shows and how it starts (Value From for a number). The review's description: **The dial's Lamp value is listed under "NOT WIRED UP"** in the Interact card ("no behavior drives
   it (fine for output-only values)"). True, since the panel sets it, but it reads as a fault. Wording
   or presentation; UI, so a mock-up first.

## What stays approximate (documented)

- A lit lamp's outermost pixels are lit as on the scene's own panel ("For this panel" in the export).
- Between two rendered angles a turning part is the two mixed, where Blender renders one of its own.
- The outline is mixed for a solid colour: under a gradient, a picture or a texture on the panel it is
  mixed for the panel's colour; only top-level controls are looked at for a plate (a control inside a
  container is not looked into); the layers under the part are taken as stored, so a lamp's light
  switched by its value does not change the mix.
- The Component Designer draws parts directly, not through CanvasControl, so its canvas does not mix
  outlines (it is a dark canvas, not a panel).
- In Photoshop's own view of the file, with no panel under it, the colour dodge layers show as dark
  patches.
- The frames of a part of frames cannot be edited one by one in the UI.
- A sliding part (a fader) is rendered at rest only: its own light, shadow and reflection do not
  change along its travel (the same frames idea would apply per position).
- An SVG drawn at several angles ("needle at 27" as vectors) still fades separate layers, which is
  inexact for shadows and multiplies.
- The filmstrip baker (Assets › bake) draws a part's blend mode and its colour since the fixes, but
  not the outline mixing (a filmstrip has no panel under it).
- A part in another colour: a turning part (the pointer) keeps its drawn colour in the light it
  throws on the rest and in its reflection in the cap (what a part that stays put throws on what is
  beside it, the panel's `bounce` and the skirt by a brass cap, is worked out again since the third
  round: 1.8 and 1.5 levels at the mean just beside the test knob's skirt and cap, 4.6 and 10.4
  before); a picture of several colours changes as a whole; a glowing part's glow at its very edge is
  not worked out again.

## Not verified

- **Windows**: the app (WebView2) and exported plug-ins run the same JavaScript, so frames and outline
  mixing should behave as they do in Chromium here, but no Blender knob has been opened on Windows or
  in an exported plug-in.
- **Blender versions** other than 4.0.2 (the add-on says 3.0 and later).
- **A real model**: several turning parts, a fader, a switch with lamps, a world lit by an HDRI.
- **Export time** at the add-on's defaults (512 px, 128 samples): not measured. At 160 px and 96
  samples it is about 30 seconds here (28 renders); expect minutes at full size.
- The add-on's sidebar panel since these changes (the export was run through `bpy.ops`).

## Checking it

```bash
cd CE/web && npm ci
npm test                                   # about 4 minutes
npx eslint <changed files>
NODE_OPTIONS=--max-old-space-size=6144 npm run build
CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:browser   # 40 checks, about 10 minutes
```

Blender (`apt-get install -y blender python3-numpy` gives 4.0.2 if a fresh container has none; Ubuntu's Blender runs on the system Python and finds no numpy without the second package):

```bash
blender -b --factory-startup --python tools/blender/test_ceditor_layers.py -- /tmp/out             # 160 px, about 1.5 minutes
blender -b --factory-startup --python tools/blender/test_ceditor_layers.py -- /tmp/out --fixture   # rewrites CE/web/test/fixtures/blender-knob.psd (96 px)
```

- **Read the output for "All passed".** Blender exits 0 even when the script has a Python syntax
  error, so the exit code proves nothing.
- `CEDITOR_LAYERS_SIZE=64 CEDITOR_LAYERS_SAMPLES=16` makes a quick run (its thresholds are for 160 px,
  so some checks fail at that size); `CEDITOR_LAYERS_DEBUG=1` saves the compared pictures as `.npy`.
- The Blender test is not in CI. Adding a job is the owner's call (CLAUDE.md, rule 6); it would have
  to look for "All passed" rather than the exit code.
- After editing `CE/web/scripts/editor-manual.template.md`: `npm run docs:editor && npm run docs:help`.

**Editor against Blender** (how the numbers above were made; the scripts were scratch files): have
Blender render the test knob at 320 px on its panel at rest and turned (exec the test's
`material`/`knob_scene`/`reference` functions in a script), and once with the panel recoloured, noting
each bare panel's median colour. Serve `CE/web` with Vite on a copy of the tree (so edits do not
restart it mid-run), and with Playwright: `planPsdComponentImport` the PSD, put the components on a
panel of that colour (or on a filled Container for the second colour), switch on preview, turn one
with the mouse wheel, screenshot each control's box, and compare with the renders (mean and 99th
percentile of the largest channel difference; rings round the outline and the pointer on their own).
`openArtworkComponent` (`stores/artworkComponentActions.js`) opens it in the Component Designer as the
menu does.

## What next

From the design record's order: Illustrator `.ai` through its PDF part (pdf.js) if Illustrator files are wanted
directly; a Figma plugin if Figma is; Level 3 (CEditor's own 3D parts, with piece E); Level 2 (glTF)
when a shape only Blender can make is needed. Smaller, if wanted: frames per position for faders; a
lamp edge that holds on any panel; a CI job for the Blender test.

## The owner's working rules, beyond CLAUDE.md

- Layout or UI changes: a mock-up first, built only on approval.
- Colours are edited through the Colors dock.
- Professional, plain wording in the product and the docs.
- Verify locally, then push; batch commits; `[skip ci]` only on docs-only commits.
- Commit trailers: `Co-authored-by: Claude <noreply@anthropic.com>` and the session line; no model
  name in commits, code or PR text. No pull request unless asked; merge to main only when asked.
- Never commit the owner's photos.
