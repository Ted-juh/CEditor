# The Assets tab

Status: **built**, 2026-09-10. The properties panel is untouched — see [What was built](#what-was-built).

Candidate 3 from [`display-panel-candidates.md`](display-panel-candidates.md), after
[Effects](effects-tab-design.md) and [Typography](typography-tab-design.md). Drawn in
[`assets-tab-mockups.html`](assets-tab-mockups.html).

## Scope

**1,073px** in `CustomAssetsEditor`, of a 1,195px section.

| Section | Cells | Height |
|---|---:|---:|
| Images | 12 | 347px |
| Generate Filmstrip | 12 | 302px |
| Filmstrips | 7 | 212px |
| Filmstrip Setup | 8 | 212px |
| Packaging | 4 | 122px |

## Two findings

### 1. A media library rendered as two dropdowns

`Assets` stores `images` and `filmstrips` as name-keyed maps. The editor picks one of each with a
`<select>` over `Object.keys(...)`, so a component with eight images is eight names in a list and
one preview at a time. There is no way to see what you have.

That is the triage rule's central case: images are chosen by looking at them, and the panel is a
four-column portrait grid with no room to look.

### 2. The frame count can be wrong and nothing says so

This is the one worth building for. `InteractivePartRenderer` slices a filmstrip with CSS
background positioning:

```
background-size: 100% ${frameCount * 100}%
background-position: 0% ${(frameIndex / (frameCount - 1)) * 100}%
```

That is proportional, not pixel-snapped. So if the strip's height does not divide evenly by
`frameCount` the frames drift, and at the extremes a frame shows a sliver of its neighbour. A
128-frame strip baked at 127, or imported with the wrong count typed in, is broken in a way that
looks like a rendering bug.

**The check is arithmetic the app already has everything for and has never done.** The asset stores
`source`, and the natural dimensions are one `Image()` away — `imageDimensions()` in the editor
already measures them on import. `height % frameCount === 0` is the whole test.

The current preview cannot answer it either: it draws the strip as one image in a box capped at
178px, so 128 frames are a grey smear with no frame boundaries on it.

## Layout

One view — images and filmstrips are one library and splitting them would be two dropdowns again in
a nicer coat.

```
  LIBRARY                  THE ASSET                          SETTINGS
  ~250px                   ~480px                             ~280px

  ┌────┐┌────┐┌────┐       ┌──────────────────────────┐       Name    knobStrip
  │img ││img ││film│       │  ▓▓▓▓ │ ▓▓▓▓ │ ▓▓▓▓ │▓▓▓ │       Frames  128
  └────┘└────┘└────┘       │  ─────┼──────┼──────┼─── │       Axis    vert / horz
  ┌────┐┌────┐             │       frame boundaries    │       Interp  nearest
  │film││img │             └──────────────────────────┘       Value   mainValue
  └────┘└────┘             frame 41 / 128   ◂ ▮ ▸               Package ✓
                           ⚠ 900px ÷ 128 = 7.03 — not whole     ─────────
  + import   + bake                                            Bake…
```

**Library** — every image and filmstrip as a thumbnail with a kind badge and its size. Import and
bake are buttons under it rather than a separate 302px section.

**The asset** — an image at size; a filmstrip **laid out as separate frames**, a frame readout, step
controls, and the divisibility check under it. This is where the tab earns its place.

**Settings** — the asset's own fields, and the bake panel when baking.

## The three things worth calling innovative

1. **Frame boundaries on the strip.** Every frame is drawn as its own box, so the gap between boxes
   *is* the boundary — nothing to draw and nothing that can fall out of step with the arithmetic.
   An off-by-one becomes visible rather than inferred. Cheap: the count and the orientation are
   already stored.
2. **The divisibility check.** `height % frameCount` with the natural dimensions measured from the
   asset — a defect the app can detect and currently ships silently.
3. **Stepping the frames.** Seeing frame 41 of 128 in isolation is what a filmstrip is for, and no
   surface in the editor shows it today.

## No sliders

Same rule as the other two tabs: `NumberCell` for numbers, chips for choices, the library grid as
the picker. The frame readout is the open question below.

## What stays in the properties panel

Nothing is removed, as with Effects and Typography. Stripping is a later change.

## Cost

- `assetsModel.js` — pure: asset descriptors, the frame geometry, the divisibility check, and the
  bake option shape. Reuses `customComponentFilmstripBaker.js` for the estimate rather than
  restating its limits.
- `AssetsTab.svelte` plus a library, an asset view and a settings column.
- Reuse: `EffectPreview` does not apply here — these are images, not controls. An image is a plain
  `<img>`; a filmstrip is a row of boxes each carrying the same proportional background CSS
  `InteractivePartRenderer` emits, which is what makes the preview evidence about the renderer
  rather than a second opinion.
- Tests: a unit suite over the frame maths and a browser check driving the tab.

## The three open questions, and how they were decided

1. **How much of Assets?** Images, filmstrips and `packagePolicy`. The `fonts` and `thumbnails`
   maps are excluded: a grep for them returns the two places that create them empty and nothing
   else. They have no editor, no reader and no export path, so a tab for them would be a tab for a
   field that does nothing.
2. **The frame readout versus the no-sliders rule.** No scrub track. There are three ways to move
   between frames — the two step buttons, a typed frame number, and clicking a frame on the strip —
   and none of them is a slider. The strip doubling as the picker is the one that makes the rule
   cost nothing.
3. **What to do when the count does not divide.** Warn *and* repair. The bar names the arithmetic
   and offers the nearest counts that do divide, each labelled with what a frame becomes
   ("use 150 (6px)"). One click applies it.

## What was built

| Piece | File |
|---|---|
| The model — descriptors, frame geometry, the divisibility check, the repair, import shapes | `utils/assetsModel.js` |
| The tab | `components/AssetsTab.svelte` |
| Columns | `components/assets/AssetLibrary · AssetStage · AssetSettings · AssetBake` |
| Registration | `stores/editorTarget.js`, `panels/DisplayPanel.svelte`, `utils/displayDock.js` |
| Tests | `test/assetsModel.test.js` (46), `browser-checks/assetsTab.mjs` (20) |

**The properties panel is untouched**, as with Effects and Typography. `CustomAssetsEditor.svelte`
still draws all five of its sections and still edits every field. Nothing is relocated, so the
1,073px is not yet recovered; `allAssetFieldLabels()` is in place for when it is.

### Four things found while building

- **The exporter reads a size nothing writes.** `customComponentPackage.js` copies `width` and
  `height` off a filmstrip into the package summary, and no code path in the application has ever
  set them — every exported strip reports 0×0. The tab measures the strip anyway for the frame
  check, so applying a frame-count repair now records the size as well.
- **An image's recorded size goes stale and nothing notices.** `width`/`height` are written once at
  import. Replace the source by hand and the package summary describes the old picture. The image
  half of the tab runs the same measure-and-compare and offers to record what is actually there.
- **The measurement is never written on its own.** Opening a tab must not dirty the document, so
  recording a measured size is a button, not a side effect. The check bar can say "measured 96×48,
  recorded 64×64" without touching anything.
- **A descriptor key that differs from the stored key renders blank.** The settings column reads
  `descriptor[field.key]`, so calling the flag `packaged` while the property is `package` produced
  an empty control. A test now walks every field of every kind and asserts the descriptor answers
  for it.

### One thing deliberately not built

**Renaming an asset.** The map key is the name, and `Generators.*.assetName` refers to it, as do
parts that copied the source. A rename is a move with references to follow. The name is shown and
not editable rather than pretending otherwise and breaking links quietly.

## Still open

1. **Nothing is relocated yet**, and the panel needs its search index extended before anything is.
2. **Wide frames leave the stage half empty.** Frame boxes keep the frame's real shape, so a strip
   of 34×7 frames draws a thin row in a 148px box. Real filmstrips are square-framed and fill it;
   a variable-height stage was rejected because the dock jumping between assets is worse.
3. **The import frame count is a guess.** A strip is measured and the count taken as the axis
   divided by the cross length, rounded. That is right for square frames and visibly wrong for
   anything else — which is the point: the check bar and its repair buttons are directly underneath.

## Notes

- 2026-09-10: Written. Nothing built.
- 2026-09-10: Built. Three open questions decided as above; the properties panel left alone.
