# Image and texture layers: not a tab

Status: **rejected**, 2026-09-10. Nothing was built. This is candidate 7 from
[`display-panel-candidates.md`](display-panel-candidates.md), worked through and turned down.

The list ranked it *medium* and gave the reason it might not qualify: *"The individual sections are
small; the win is consolidating four owners rather than recovering height from any one."* Worked
through, that is exactly right — and the consolidation it hoped for has already happened.

## What is actually there

`LayerEffectsSection.svelte` is a shared, parameterised editor over `bg{Image,Texture}*` properties.
It serves **four call sites**: a control's Background image and overlay (through `BackgroundEditor`,
which adapts the control's `Background.Fill.image*` into that vocabulary and back), and a panel's
background image and texture (through `PanelCardContent`).

Measured, one expanded layer is **510px**: the header with its file picker 73px, Geometry 185px,
Colour Effects 174px, Clipping 78px. Two layers expanded on one control is 1,020px, and the
sections collapse.

It draws every property `buildLayerStyle` in `utils/backgroundCSS.js` reads: fit, alignment, offset,
flip, angle, tile scale, blend, opacity, blur, tint, saturation, brightness, contrast, greyscale and
clip mode. Sixteen properties, one editor, four owners.

## The finding I thought I had, and why it was wrong

This is recorded because it nearly went into a design record as fact.

A grep for `PropertyCell label=` in `LayerEffectsSection` returns *Fit, Offset X, Offset Y, Flip H,
Flip V, Angle, Scale, Blend, Opacity, Blur, Tint, Mode* — no saturation, brightness, contrast or
greyscale. Those four are in `sectionDefaults`, in `presetScopes.js`, in `BackgroundEditor`'s reset
and layer-clipboard lists, and `buildLayerStyle` emits `saturate()`, `brightness()`, `contrast()`
and `grayscale(100%)` from them. That reads like four properties that render, are carried by
presets, and have no editor anywhere — the same shape as the findings behind the first six tabs.

It is not true. They are drawn, as three `PropertyScrub` controls labelled Sat, Bri and Con and a
B/W toggle, inside a cell that carries no `label` of its own. The grep missed them; the source did
not hide them.

The claim was written into a test first — a test that reads `LayerEffectsSection.svelte` and asserts
the four are absent — and the test failed immediately. That is the only reason it is in this
document as an error rather than in a commit message as a discovery.

## Why the text fills are narrower, and correctly so

`Text` has its own Image Geometry, Image Colour, Texture Geometry and Texture Colour sections rather
than using the shared editor, and they offer far less: fit, offsets, opacity, tint and order for an
image; tile scale, offsets, opacity, tint and order for a texture.

That looks like the fifth owner failing to share. It is not. `buildTextFillLayerStyle` in
`editor/canvasControlStyles.js` reads **only** `imageTint`, `imageOpacity`, `imageFit` and the image
offsets — and for a texture, `textureTint`, `textureOpacity`, `textureTileScale` and its offsets.
There is no flip, angle, blur, blend or clipping in the text fill path at all. Handing Text the
shared sixteen-property editor would draw eleven controls that do nothing, which is precisely the
complaint the [Typography tab](typography-tab-design.md) was built to answer.

## The verdict

No defect, no missing editor, no duplicated implementation worth removing. What is left is 510px per
layer of a shared editor that already works, and the observation that fit, tint and blur are judged
by looking — which is true and is not on its own enough to earn a tab in a strip that already has
six.

**Not built.** If it is revisited, the case would have to be the preview rather than the properties:
a layer shown at a size you can judge, with the sixteen controls unchanged. That is a smaller and
more honest proposal than "consolidate four owners", which is already done.

## Notes

- 2026-09-10: Researched and rejected. The measurement and the two source checks are above; the
  mistaken finding is recorded rather than quietly dropped.
