// backgroundLayerClipAndBlend.test.js — a rotated, flipped or offset image layer stays clipped to
// the component's shape.
//
// Reported as "Background, clipping: changing the geometry to 90 degrees doesn't clip". An image
// layer was ONE element carrying both its clip (a border-radius or clip-path) and its transform,
// and CSS transforms an element after clipping it: the clip turned with the picture. At 90° on a
// 300×150 component the cover scale doubles the layer to 300×600 on screen, its rounded corners
// land outside the component, and the component's own overflow clip cuts what is left square.
//
// The fix draws a transformed layer as two elements: the clip, opacity and blend on an outer one
// in the component's frame, the picture and its transform on an inner one. These tests hold the
// builder's pieces and the rendered structure to that; the picture itself was checked in the
// editor (rounded and chamfered corners at 90°).

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import BackgroundRenderer from '../src/CE_Panel/components/BackgroundRenderer.svelte';
import { buildLayerStyle, buildLayerStyleParts } from '../src/CE_Application/utils/backgroundCSS.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';

const IMAGE = 'data:image/svg+xml,%3Csvg/%3E';

const pseudo = (extra = {}) => ({ width: 300, height: 150, bgImageEnabled: true, bgImage: IMAGE, ...extra });

test('buildLayerStyle is still exactly its parts put together', () => {
  for (const extra of [{}, { bgImageRotation: 90 }, { bgImageBlur: 3, bgImageTint: 'FF0000', bgImageBlend: 'multiply' }]) {
    const parts = buildLayerStyleParts(pseudo(extra), 'Image', IMAGE);
    assert.equal(buildLayerStyle(pseudo(extra), 'Image', IMAGE), `${parts.head} ${parts.compositing}${parts.tail}`);
  }
});

test('a layer is "transformed" when it is rotated, flipped or offset, and only then', () => {
  const transformed = (extra) => buildLayerStyleParts(pseudo(extra), 'Image', IMAGE).transformed;
  assert.equal(transformed({}), false);
  assert.equal(transformed({ bgImageRotation: 90 }), true);
  assert.equal(transformed({ bgImageFlipH: true }), true);
  assert.equal(transformed({ bgImageOffsetX: 12 }), true);
});

test('the transform belongs to the picture; opacity and blend do not', () => {
  const parts = buildLayerStyleParts(pseudo({ bgImageRotation: 90, bgImageOpacity: 50, bgImageBlend: 'screen' }), 'Image', IMAGE);
  assert.match(parts.paint, /transform: rotate\(90deg\)/);
  assert.doesNotMatch(parts.paint, /opacity|mix-blend-mode/);
  assert.equal(parts.compositing, 'opacity: 0.5; mix-blend-mode: screen;');
});

// --- the rendered layer -------------------------------------------------------------------------

function background({ rotation = 0, flipH = false, cornerStyle = 'rounded', clipMode = 'shape' } = {}) {
  const bg = structuredClone(SECTION_DEFAULTS.Background);
  Object.assign(bg._children.Fill, {
    imageEnabled: true, imageSrc: IMAGE, imageRotation: rotation, imageFlipH: flipH, imageClipMode: clipMode,
  });
  Object.assign(bg._children.Corners, { radius: 40, style: cornerStyle });
  return bg;
}

/** The image layer's outer element and, if it has one, its inner picture, as their style strings. */
function imageLayer(bg) {
  const html = render(BackgroundRenderer, { props: { background: bg, width: 300, height: 150 } }).body;
  const layers = [...html.matchAll(/<div class="bg-fill-layer[^"]*"[^>]*style="([^"]*)"[^>]*>(.*?)<\/div>/gs)];
  const image = layers.find((m) => /background-image/.test(m[1]) || /bg-fill-paint/.test(m[2]));
  assert.ok(image, 'the image layer is drawn');
  const inner = image[2].match(/class="bg-fill-paint[^"]*"[^>]*style="([^"]*)"/);
  return { outer: image[1], inner: inner?.[1] ?? null };
}

test('at 0° the image layer is one element, clipped as it always was', () => {
  const { outer, inner } = imageLayer(background());
  assert.equal(inner, null);
  assert.match(outer, /background-image/);
  assert.match(outer, /border-radius: 40px/);
});

test('at 90° the rounded clip stays on an unrotated outer element and the picture turns inside it', () => {
  const { outer, inner } = imageLayer(background({ rotation: 90 }));
  assert.match(outer, /border-radius: 40px/);
  assert.match(outer, /overflow: hidden/);
  assert.match(outer, /opacity: 1; mix-blend-mode: normal;/);
  assert.doesNotMatch(outer, /transform|background-image/);
  assert.ok(inner, 'the picture is an element of its own');
  assert.match(inner, /background-image/);
  assert.match(inner, /transform: rotate\(90deg\) scale\(2(\.0+)?\)/);
});

test('a chamfered clip-path stays outside the rotation too', () => {
  const { outer, inner } = imageLayer(background({ rotation: 90, cornerStyle: 'chamfer' }));
  assert.match(outer, /clip-path: path\(/);
  assert.doesNotMatch(outer, /transform/);
  assert.match(inner, /rotate\(90deg\)/);
});

test('a flip mirrors the picture, not the clip', () => {
  const { outer, inner } = imageLayer(background({ flipH: true }));
  assert.match(outer, /border-radius: 40px/);
  assert.doesNotMatch(outer, /transform/);
  assert.match(inner, /transform: scaleX\(-1\)/);
});

test('clip mode "none" still holds a rotated picture to the component box', () => {
  const { outer } = imageLayer(background({ rotation: 90, clipMode: 'none' }));
  assert.doesNotMatch(outer, /border-radius|clip-path/);
  assert.match(outer, /overflow: hidden/);
});

// --- a layer's blend mode when the layer has effects of its own ---------------------------------
//
// "The blend modes also do nothing." Plain, they do. But a fill layer that has effects of its own
// (the Effects tab, aimed at "Image fill" and the like) is wrapped in an element carrying a CSS
// filter, which makes an isolated group: inside it the layer's blend has nothing beneath it, so an
// image set to Multiply drew as Normal the moment it gained a shadow or a filter. The wrapper now
// carries the layer's blend, unless the surface's own Effects › Blend says something.

function blendedImage({ effectsFilter = false, effectsBlend = 'normal' } = {}) {
  const bg = background();
  bg._children.Fill.imageBlend = 'multiply';
  if (effectsFilter || effectsBlend !== 'normal') {
    const effects = structuredClone(SECTION_DEFAULTS.Effects);
    if (effectsFilter) effects._children.Filters.brightness = 110;
    effects._children.Blend.mode = effectsBlend;
    bg._children.Fill._children = { ...(bg._children.Fill._children ?? {}), ImageEffects: effects };
  }
  return render(BackgroundRenderer, { props: { background: bg, width: 300, height: 150 } }).body;
}

const imageWrapperStyle = (html) => html.match(/<div class="effect-surface[^"]*" data-effect-surface="image"[^>]*style="([^"]*)"/)?.[1] ?? null;

test('with no effects the image layer carries its own blend and has no wrapper', () => {
  const html = blendedImage();
  assert.equal(imageWrapperStyle(html), null);
  assert.match(html, /background-image[^"]*mix-blend-mode: multiply/);
});

test('with an effect on the layer, the wrapper carries the layer\'s blend', () => {
  const style = imageWrapperStyle(blendedImage({ effectsFilter: true }));
  assert.ok(style, 'the layer is wrapped');
  assert.match(style, /filter: brightness\(110%\)/);
  assert.match(style, /mix-blend-mode: multiply/);
});

test('the surface\'s own Effects blend wins over the layer\'s', () => {
  const style = imageWrapperStyle(blendedImage({ effectsFilter: true, effectsBlend: 'screen' }));
  assert.match(style, /mix-blend-mode: screen/);
  assert.doesNotMatch(style, /multiply/);
});
