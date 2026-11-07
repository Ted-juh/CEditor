// psdLayerStyles.test.js — Photoshop's layer styles as measured on its own pictures, the readers that
// feed them, and a CMYK file's own colour profile.
//
// The shapes of the shadows, glows, bevels and satins were fitted to psd-tools' layer_effects.psd (a
// Gaussian whose deviation is 0.42 of the Size, cut off at the Size); these tests pin the readings
// that fit, on shapes small enough to work out on paper.
import test from 'node:test';
import assert from 'node:assert/strict';

import { castShadows, drawLayerStyles, LAYER_STYLES, stylesExtent } from '../src/CE_Application/utils/psdLayerStyles.js';
import { blendChannel, blendIf, blendStylePixel, compositePsd, neutralOf, styleGeometry } from '../src/CE_Application/utils/psdComposite.js';
import { contourTable, gradientRamp } from '../src/CE_Application/utils/psdAdjustments.js';
import { patternSampler } from '../src/CE_Application/utils/psdVectors.js';
import { effectsFromDescriptor } from '../src/CE_Application/utils/psdEffects.js';
import { iccCmykToRgb } from '../src/CE_Application/utils/iccProfile.js';
import { eightBit, unmatteLinear } from '../src/CE_Application/utils/psdRead.js';

/** A w × h shape: 1 inside the box [x0, x1) × [y0, y1), 0 elsewhere. */
function square(w, h, x0, y0, x1, y1) {
  const shape = new Float32Array(w * h);
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) shape[y * w + x] = 1;
  return shape;
}
const px = (value) => ({ units: 'Pixels', value });

test('a drop shadow is the shape blurred over its Size and no further: half on the edge, nothing past it', () => {
  const w = 80; const h = 80;
  const shape = square(w, h, 30, 30, 50, 50);
  const [cast] = castShadows(shape, w, h, { dropShadow: [{ enabled: true, opacity: 1, distance: px(0), size: px(10), choke: px(0), angle: 90, layerConceals: false }] });
  const alpha = (x, y) => cast.alpha[(y - cast.y) * cast.width + (x - cast.x)];
  // The edge runs between 49 and 50: the pixels either side of it hold about half.
  assert.ok(Math.abs((alpha(49, 40) + alpha(50, 40)) / 2 - 0.5) < 0.05, `${alpha(49, 40)} ${alpha(50, 40)}`);
  // One deviation (4.2 px) out, a sixth; past the Size, nothing at all.
  assert.ok(Math.abs(alpha(54, 40) - 0.15) < 0.04, `${alpha(54, 40)}`);
  assert.equal(alpha(61, 40), 0);
  assert.equal(stylesExtent({ dropShadow: [{ enabled: true, size: px(10), distance: px(5) }] }), 17);
});

test('an outer glow is full on the edge at the default Range of 50%, and half at 100%', () => {
  const w = 80; const h = 80;
  const shape = square(w, h, 20, 20, 60, 60);
  const glow = (range) => {
    const [cast] = castShadows(shape, w, h, { outerGlow: { enabled: true, opacity: 1, size: px(10), choke: px(0), range, color: { r: 255, g: 255, b: 255 } } });
    return cast.alpha[(40 - cast.y) * cast.width + (60 - cast.x)];
  };
  // (60 is the first pixel outside; a blur gives a little under half there.)
  assert.ok(glow(0.5) > 0.8, `${glow(0.5)}`);
  assert.ok(Math.abs(glow(1) - glow(0.5) / 2) < 0.03, `${glow(1)} ${glow(0.5)}`);
});

test('an inner glow lights the inside of the edge and fades by the Size; an inner shadow falls from the offset side', () => {
  const w = 60; const h = 60;
  const shape = square(w, h, 10, 10, 50, 50);
  const draw = (effects) => {
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < shape.length; i += 1) if (shape[i]) pixels.set([0, 0, 0, 255], i * 4);
    drawLayerStyles(pixels, shape, w, h, effects);
    return (x, y) => pixels[(y * w + x) * 4];
  };
  const glow = draw({ innerGlow: { enabled: true, opacity: 1, blendMode: 'normal', size: px(8), choke: px(0), range: 0.5, color: { r: 255, g: 255, b: 255 }, source: 'edge' } });
  assert.ok(glow(10, 30) > 200, `edge ${glow(10, 30)}`);
  assert.equal(glow(30, 30), 0);
  // Light from above (90°), the shadow 6 px down from the top edge: dark at the top, none at the bottom.
  const shadow = draw({ innerShadow: [{ enabled: true, opacity: 1, blendMode: 'normal', size: px(4), choke: px(0), distance: px(6), angle: 90, color: { r: 255, g: 255, b: 255 } }] });
  assert.ok(shadow(30, 12) > 200, `top ${shadow(30, 12)}`);
  assert.equal(shadow(30, 47), 0);
});

test('Bevel and Emboss: lit from its angle, the highlight on the side toward the light; an outer bevel lies outside the shape', () => {
  const w = 60; const h = 60;
  const shape = square(w, h, 15, 15, 45, 45);
  const bevel = { enabled: true, style: 'inner bevel', technique: 'smooth', strength: 1, size: px(8), angle: 90, altitude: 30, direction: 'up',
    highlightColor: { r: 255, g: 255, b: 255 }, highlightOpacity: 1, highlightBlendMode: 'normal',
    shadowColor: { r: 0, g: 0, b: 0 }, shadowOpacity: 1, shadowBlendMode: 'normal' };
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < shape.length; i += 1) if (shape[i]) pixels.set([128, 128, 128, 255], i * 4);
  assert.deepEqual(drawLayerStyles(pixels, shape, w, h, { bevel }), ['Bevel & Emboss']);
  const at = (x, y) => pixels[(y * w + x) * 4];
  assert.ok(at(30, 16) > 160, `top edge ${at(30, 16)}`);
  assert.ok(at(30, 43) < 96, `bottom edge ${at(30, 43)}`);
  assert.equal(at(30, 30), 128);
  // An Outer Bevel: nothing drawn inside; its light and shade cast around the shape.
  const outer = { ...bevel, style: 'outer bevel' };
  const inside = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < shape.length; i += 1) if (shape[i]) inside.set([128, 128, 128, 255], i * 4);
  drawLayerStyles(inside, shape, w, h, { bevel: outer });
  assert.equal(inside[(16 * w + 30) * 4], 128);
  const casts = castShadows(shape, w, h, { bevel: outer });
  assert.deepEqual(casts.map((c) => c.name), ['Bevel & Emboss', 'Bevel & Emboss']);
  const [lo, hi] = casts;
  const a = (cast, x, y) => cast.alpha[(y - cast.y) * cast.width + (x - cast.x)];
  // Outside, the ground rises to the shape: above it, it faces the light; below, away.
  assert.ok(a(hi, 30, 12) > 0.3 && a(lo, 30, 47) > 0.3, `${a(hi, 30, 12)} ${a(lo, 30, 47)}`);
  assert.equal(a(hi, 30, 47) + a(lo, 30, 12), 0);
  assert.equal(a(hi, 30, 30) + a(lo, 30, 30), 0);
});

test('Satin, inverted, is full where the two moved copies agree, in the middle of a broad shape', () => {
  const w = 80; const h = 80;
  const shape = square(w, h, 10, 10, 70, 70);
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < shape.length; i += 1) if (shape[i]) pixels.set([255, 255, 255, 255], i * 4);
  drawLayerStyles(pixels, shape, w, h, { satin: { enabled: true, opacity: 1, blendMode: 'normal', invert: true, angle: 19, distance: px(5), size: px(5), color: { r: 0, g: 0, b: 0 } } });
  assert.equal(pixels[(40 * w + 40) * 4], 0);
});

test('a stroke outside a see-through edge goes under the layer: the layer\'s own colour stays on top', () => {
  // An opaque red square with a column at 40% to its right, an outside green stroke of 1 px, on white.
  const w = 10; const h = 10;
  const data = new Uint8ClampedArray(5 * 4 * 4);
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < 5; x += 1) data.set([255, 0, 0, x === 4 ? 102 : 255], (y * 5 + x) * 4);
  const background = { name: 'bg', left: 0, top: 0, imageData: { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) } };
  const layer = { name: 'red', left: 2, top: 2, imageData: { width: 5, height: 4, data }, effects: { stroke: [{ enabled: true, position: 'outside', fillType: 'color', size: px(1), opacity: 1, blendMode: 'normal', color: { r: 0, g: 255, b: 0 } }] } };
  const { pixels } = compositePsd([background, layer], w, h, { styles: { cast: castShadows, draw: drawLayerStyles, reach: () => 3 } });
  const at = (x, y) => [...pixels.slice((y * w + x) * 4, (y * w + x) * 4 + 4)];
  // 0.4 of red over the band, which fills the 0.6 left beside it: 102 red, 153 green.
  const [r, g, b, a] = at(6, 3);
  assert.ok(Math.abs(r - 102) <= 2 && Math.abs(g - 153) <= 2 && b === 0 && a === 255, `${[r, g, b, a]}`);
  // Drawn into the layer's own pixels (a component's picture), the same once it is laid on the white.
  const own = compositePsd([{ ...layer, effects: undefined }], w, h).pixels;
  const shape = Float32Array.from({ length: w * h }, (_, i) => own[i * 4 + 3] / 255);
  drawLayerStyles(own, shape, w, h, layer.effects);
  const p = (3 * w + 6) * 4;
  const onWhite = [0, 1, 2].map((k) => (own[p + k] * own[p + 3]) / 255 + 255 - own[p + 3]);
  assert.ok(Math.abs(onWhite[0] - 102) <= 2 && Math.abs(onWhite[1] - 153) <= 2 && onWhite[2] <= 2, `${onWhite}`);
});

test('a contour is drawn through the spline Curves uses; Linear leaves the style alone', () => {
  assert.equal(contourTable({ curve: [{ x: 0, y: 0 }, { x: 255, y: 255 }] }), null);
  const gaussian = contourTable({ curve: [{ x: 0, y: 0 }, { x: 32, y: 7 }, { x: 64, y: 38 }, { x: 96, y: 101 }, { x: 128, y: 166 }, { x: 159, y: 209 }, { x: 191, y: 235 }, { x: 223, y: 248 }, { x: 255, y: 255 }] });
  assert.ok(Math.abs(gaussian[128] - 166) < 0.5 && gaussian[0] === 0 && gaussian[255] === 255);
});

test('the style reader keeps a bevel\'s style, technique and Depth (a fraction), and a gradient\'s offset as a fraction', () => {
  const effects = effectsFromDescriptor({
    ebbl: { enab: true, bvlS: { value: 'OtrB' }, bvlT: { value: 'PrBL' }, srgR: { units: '#Prc', value: 250 }, blur: { units: '#Pxl', value: 7 }, Sftn: { units: '#Pxl', value: 2 },
      TrnS: { Nm: 'Linear', Crv: [{ Hrzn: 0, Vrtc: 0 }, { Hrzn: 255, Vrtc: 255 }] } },
    GrFl: { enab: true, Md: { value: 'Nrml' }, Opct: { units: '#Prc', value: 100 }, Type: { value: 'Lnr' }, Angl: { units: '#Ang', value: 90 },
      Ofst: { Hrzn: { units: '#Prc', value: 10 }, Vrtc: { units: '#Prc', value: -20 } } },
    OrGl: { enab: true, GlwT: { value: 'PrBL' }, Inpr: { units: '#Prc', value: 43 }, Nose: { units: '#Prc', value: 0 } },
  });
  assert.equal(effects.bevel.style, 'outer bevel');
  assert.equal(effects.bevel.technique, 'chisel hard');
  assert.equal(effects.bevel.strength, 2.5);
  assert.equal(effects.bevel.soften.value, 2);
  assert.equal(effects.bevel.contour.curve.length, 2);
  assert.deepEqual(effects.gradientOverlay[0].offset, { x: 0.1, y: -0.2 });
  assert.equal(effects.outerGlow.technique, 'precise');
  assert.equal(effects.outerGlow.range, 0.43);
});

test('Advanced Blending: a channel left out keeps what was below; Blend If lets through by ranges', () => {
  const white = { name: 'bg', left: 0, top: 0, imageData: { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) } };
  const black = { name: 'k', left: 0, top: 0, imageData: { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) } };
  const pixel = (layers) => [...compositePsd(layers, 1, 1).pixels.slice(0, 4)];
  assert.deepEqual(pixel([white, { ...black, channelBlendingRestrictions: [2] }]), [0, 0, 255, 255]);
  // Underlying Layer's grey 0..100 shows it, 100..150 fades it out, above 150 nothing.
  const ranges = { compositeGrayBlendSource: [0, 0, 255, 255], compositeGraphBlendDestinationRange: [0, 0, 100, 150], ranges: [] };
  const weigh = blendIf({ blendingRanges: ranges });
  assert.equal(weigh(0, 0, 0, 50 / 255, 50 / 255, 50 / 255), 1);
  assert.ok(Math.abs(weigh(0, 0, 0, 125 / 255, 125 / 255, 125 / 255) - 0.5) < 1e-6);
  assert.equal(weigh(0, 0, 0, 1, 1, 1), 0);
  assert.equal(blendIf({ blendingRanges: { compositeGrayBlendSource: [0, 0, 255, 255], compositeGraphBlendDestinationRange: [0, 0, 255, 255], ranges: [] } }), null);
  assert.deepEqual(pixel([white, { ...black, blendingRanges: ranges }]), [255, 255, 255, 255]);
});

test('a backdrop within half a level of black stays black under Divide and Color Dodge', () => {
  assert.equal(blendChannel('divide', 1e-6, 0), 0);
  assert.equal(blendChannel('color dodge', 1e-6, 0.5), 0);
  assert.equal(blendChannel('divide', 0.5, 0), 1);
});

test('an artboard lays its background colour under its layers, Pass Through as Photoshop makes it', () => {
  const board = { name: 'Artboard', blendMode: 'pass through', artboard: { rect: { left: 0, top: 0, right: 2, bottom: 1 }, color: { r: 18, g: 108, b: 200 }, backgroundType: 4 }, children: [] };
  const { pixels } = compositePsd([board], 3, 1);
  assert.deepEqual([...pixels.slice(0, 4)], [18, 108, 200, 255]);
  assert.equal(pixels[11], 0);
});

test('masks: a shape\'s vector mask below full Density shows its fill past the path; a user mask kept apart from the path multiplies it', () => {
  const corner = (x, y) => ({ points: [x, y, x, y, x, y] });
  const half = { paths: [{ open: false, operation: 'combine', knots: [corner(2, 0), corner(4, 0), corner(4, 1), corner(2, 1)] }] };
  // A red shape over the right half, its vector mask at 75%: a quarter of it on the left.
  const shape = { name: 'shape', blendMode: 'normal', opacity: 1, vectorFill: { type: 'color', color: { r: 255, g: 0, b: 0 } }, vectorMask: half,
    mask: { vectorMaskDensity: 0.75, fromVectorData: true, defaultColor: 0 }, left: 2, top: 0, imageData: { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]) } };
  const soft = compositePsd([shape], 4, 1).pixels;
  assert.equal(soft[3], 64);
  assert.equal(soft[15], 255);
  // Pixels with both masks, the user mask (hiding all) at 50% and the path at 50%.
  const solid = { width: 4, height: 1, data: new Uint8ClampedArray(16).fill(255) };
  const both = { name: 'both', blendMode: 'normal', opacity: 1, left: 0, top: 0, imageData: solid, vectorMask: half,
    mask: { fromVectorData: true, userMaskDensity: 0.5, vectorMaskDensity: 0.5, defaultColor: 0, left: 2, top: 0, imageData: { width: 2, height: 1, data: new Uint8ClampedArray(8).fill(255) } },
    realMask: { defaultColor: 0, left: 0, top: 0, imageData: { width: 4, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]) } } };
  const masked = compositePsd([both], 4, 1).pixels;
  assert.equal(masked[3], 64);
  assert.equal(masked[15], 128);
  // A shape layer keeps its user mask apart the same way (layer_mask_data.psb): the shape over all four
  // pixels, the user mask hiding the right two; turned off, it hides nothing.
  const all = { paths: [{ open: false, operation: 'combine', knots: [corner(0, 0), corner(4, 0), corner(4, 1), corner(0, 1)] }] };
  const user = { defaultColor: 0, left: 0, top: 0, imageData: { width: 4, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]) } };
  const shaped = (realMask) => ({ name: 'shape', blendMode: 'normal', opacity: 1, vectorFill: { type: 'color', color: { r: 255, g: 0, b: 0 } }, vectorMask: all,
    mask: { fromVectorData: true, defaultColor: 0, left: 0, top: 0, imageData: { width: 4, height: 1, data: new Uint8ClampedArray(16).fill(255) } }, realMask,
    left: 0, top: 0, imageData: solid });
  const cut = compositePsd([shaped(user)], 4, 1).pixels;
  assert.deepEqual([cut[3], cut[7], cut[11], cut[15]], [255, 255, 0, 0]);
  const off = compositePsd([shaped({ ...user, disabled: true })], 4, 1).pixels;
  assert.deepEqual([off[3], off[15]], [255, 255]);
});

test('a style in a mode with a neutral colour moves toward it by its strength, then blends', () => {
  // A black Linear Burn at 70% over mid grey: the black moved 70% of the way from white (0.3), burnt in:
  // 0.5 + 0.3 − 1, below black. Mixing the full blend by 70% would leave 0.15 (layer_comps.psd's bevel).
  const dst = new Float32Array([0.5, 0.5, 0.5, 1]);
  blendStylePixel(dst, 0, 0, 0, 0, 0.7, 'linear burn', (b, s) => blendChannel('linear burn', b, s));
  assert.deepEqual([...dst].map((v) => Math.round(v * 1000) / 1000), [0, 0, 0, 1]);
  // Multiply is the same either way: b·(1 − k + k·s).
  const twice = new Float32Array([0.5, 0.5, 0.5, 1]);
  blendStylePixel(twice, 0, 0.2, 0.2, 0.2, 0.5, 'multiply', (b, s) => blendChannel('multiply', b, s));
  assert.ok(Math.abs(twice[0] - (0.5 * 0.5 + 0.5 * 0.5 * 0.2)) < 1e-6);
  assert.equal(neutralOf('normal'), undefined);
  assert.equal(neutralOf('overlay'), 0.5);
  // As a Color Overlay draws it on the layer's own pixels.
  const pixels = new Uint8ClampedArray([128, 128, 128, 255]);
  drawLayerStyles(pixels, new Float32Array([1]), 1, 1, { solidFill: [{ enabled: true, opacity: 0.7, blendMode: 'linear burn', color: { r: 0, g: 0, b: 0 } }] });
  assert.deepEqual([...pixels], [0, 0, 0, 255]);
});

test('a layer\'s styles see its pixels past the canvas: an edge where they stop, none where they run on', () => {
  const red = (left, width) => {
    const data = new Uint8ClampedArray(width * 4 * 4);
    for (let i = 0; i < width * 4; i += 1) data.set([255, 0, 0, 255], i * 4);
    return { name: 'red', left, top: 0, right: left + width, bottom: 4, blendMode: 'normal', opacity: 1, imageData: { width, height: 4, data } };
  };
  const stroke = { stroke: [{ enabled: true, position: 'inside', fillType: 'color', size: px(1), opacity: 1, blendMode: 'normal', color: { r: 0, g: 255, b: 0 } }] };
  const styles = LAYER_STYLES;
  const green = (pixels, x, y) => pixels[(y * 4 + x) * 4 + 1] === 255 && pixels[(y * 4 + x) * 4] === 0;
  // The size of the canvas: the stroke borders it.
  const framed = compositePsd([{ ...red(0, 4), effects: stroke }], 4, 4, { styles }).pixels;
  assert.ok([0, 1, 2, 3].every((x) => green(framed, x, 0) && green(framed, x, 3)) && green(framed, 0, 1) && !green(framed, 1, 1));
  // Two pixels of it off the left: no edge on that side. A group sees its layers' pixels the same way.
  const shifted = compositePsd([{ ...red(-2, 4), effects: stroke }], 4, 4, { styles }).pixels;
  assert.ok(!green(shifted, 0, 1) && green(shifted, 1, 1));
  const grouped = compositePsd([{ name: 'g', blendMode: 'normal', opacity: 1, children: [red(-2, 4)], effects: stroke }], 4, 4, { styles }).pixels;
  assert.ok(!green(grouped, 0, 1) && green(grouped, 1, 1));
});

test('gradients: Smoothness is a spline through the stops, flat at an inner stop between two of one colour', () => {
  const stops = (...list) => list.map(([location, r, g, b]) => ({ location, color: { r, g, b }, midpoint: 0.5 }));
  const opaque = [{ location: 0, opacity: 1, midpoint: 0.5 }, { location: 1, opacity: 1, midpoint: 0.5 }];
  // Two stops: the S Photoshop's two-stop fills follow, u − 0.583·u(1 − u)(1 − 2u).
  const two = gradientRamp({ smoothness: 1, colorStops: stops([0, 0, 0, 0], [1, 255, 255, 255]), opacityStops: opaque });
  const s = (u) => 255 * (u - 0.583 * u * (1 - u) * (1 - 2 * u));
  for (const u of [0.1, 0.25, 0.5, 0.8]) assert.ok(Math.abs(two(u)[0] - s(u)) < 1e-6, `${u}`);
  // Blue, Yellow, Blue: level at the yellow, where straight lines would turn sharply.
  const byb = gradientRamp({ smoothness: 1, colorStops: stops([0, 0, 0, 255], [0.5, 255, 255, 0], [1, 0, 0, 255]), opacityStops: opaque });
  assert.ok(255 - byb(0.49)[0] < 0.5, `${byb(0.49)[0]}`);
  // Reflected, mirrored about its start: level there too.
  const reflected = gradientRamp({ smoothness: 1, colorStops: stops([0, 0, 0, 0], [1, 255, 255, 255]), opacityStops: opaque }, { mirrored: true });
  assert.ok(reflected(0.02)[0] < 0.5 && two(0.02)[0] > 2, `${reflected(0.02)[0]} ${two(0.02)[0]}`);
  // In a 32-bit file the stops mix in linear light: half way between black and white is 188, not 128.
  const light = gradientRamp({ smoothness: 0, linearLight: true, colorStops: stops([0, 0, 0, 0], [1, 255, 255, 255]), opacityStops: opaque });
  assert.equal(Math.round(light(0.5)[0]), 188);
});

test('a pattern is tiled from its origin: each texel a pixel at 100%, interpolated when scaled', () => {
  const picture = { width: 2, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]) };
  const plain = patternSampler(picture, { ox: 1 });
  assert.deepEqual([plain(1, 0)[0], plain(2, 0)[0], plain(3, 0)[0], plain(0, 0)[0]], [0, 255, 0, 255]);
  const doubled = patternSampler(picture, { scale: 2 });
  assert.deepEqual([0, 1, 2, 3].map((x) => doubled(x, 0)[0]), [0, 127.5, 255, 127.5]);
  assert.equal(doubled(1, 0)[3], 1);
  // Where a layer's styles are laid (the flattening and a component alike): a linked pattern from its
  // reference point, an aligned gradient across its record's box; a group's across its pixels.
  assert.deepEqual(styleGeometry({ left: 3, top: 4, right: 9, bottom: 6, referencePoint: { x: 5.4, y: 2 } }),
    { anchor: { x: 5, y: 2 }, bounds: { x: 3, y: 4, width: 6, height: 2 } });
  assert.deepEqual(styleGeometry({ left: 3, top: 4, children: [] }), { anchor: { x: 3, y: 4 }, bounds: null });
});

test('a gradient fill with no path lies across its layer mask\'s rectangle; an open path closes straight', () => {
  const opaque = [{ location: 0, opacity: 1, midpoint: 0.5 }, { location: 1, opacity: 1, midpoint: 0.5 }];
  const fill = { type: 'solid', style: 'linear', angle: 0, smoothness: 0, colorStops: [{ location: 0, color: { r: 0, g: 0, b: 0 }, midpoint: 0.5 }, { location: 1, color: { r: 255, g: 255, b: 255 }, midpoint: 0.5 }], opacityStops: opaque };
  const masked = { name: 'gradient', blendMode: 'normal', opacity: 1, vectorFill: fill, left: 0, top: 0, right: 4, bottom: 1,
    mask: { left: 0, top: 0, right: 2, bottom: 1, defaultColor: 0, imageData: { width: 2, height: 1, data: new Uint8ClampedArray(8).fill(255) } } };
  const { pixels } = compositePsd([masked], 4, 1);
  // Across the mask's two pixels, the second half way; across the document it would be a quarter.
  assert.deepEqual([pixels[0], pixels[4], pixels[11]], [0, 128, 0]);
  // An open path whose last knot leaves on a long handle: filled as if closed by a straight line.
  const knot = (x, y, out = [x, y]) => ({ points: [x, y, x, y, ...out] });
  const shape = (open) => ({ name: 'pen', blendMode: 'normal', opacity: 1, vectorFill: { type: 'color', color: { r: 0, g: 0, b: 0 } },
    vectorMask: { paths: [{ open, operation: 'combine', knots: [knot(0, 0), knot(4, 0), knot(4, 4, [0, 12])] }] } });
  const alpha = (open) => [...compositePsd([shape(open)], 4, 4).pixels].filter((_, i) => i % 4 === 3).reduce((sum, v) => sum + v, 0) / 255;
  assert.ok(Math.abs(alpha(true) - 8) < 0.5, `${alpha(true)}`);
  assert.ok(alpha(false) > alpha(true) + 0.5, `${alpha(false)}`);
});

test('a stroke outside a square\'s corner is measured from the corner pixel, as Photoshop measures it', () => {
  const w = 12; const h = 12;
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 16; i += 1) data.set([0, 0, 255, 255], i * 4);
  const layer = { name: 'square', left: 4, top: 4, right: 8, bottom: 8, blendMode: 'normal', opacity: 1, imageData: { width: 4, height: 4, data },
    effects: { stroke: [{ enabled: true, position: 'outside', fillType: 'color', size: px(3), opacity: 1, blendMode: 'normal', color: { r: 255, g: 0, b: 0 } }] } };
  const { pixels } = compositePsd([layer], w, h, { styles: LAYER_STYLES });
  // Diagonally off the corner, its centre 2.1 px from the corner pixel's edge: all stroke (outside-stroke.psd).
  const at = (x, y) => [...pixels.slice((y * w + x) * 4, (y * w + x) * 4 + 4)];
  assert.deepEqual(at(2, 2), [255, 0, 0, 255]);
  assert.deepEqual(at(5, 1), [255, 0, 0, 255]);
});

test('a bevel\'s light outside the shape shades the stroke there; a shape\'s own stroke stays over what is clipped to it', () => {
  const w = 20; const h = 20;
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < 64; i += 1) data.set([128, 128, 128, 255], i * 4);
  const stroke = { enabled: true, position: 'outside', fillType: 'color', size: px(3), opacity: 1, blendMode: 'normal', color: { r: 200, g: 0, b: 0 } };
  const bevel = { enabled: true, style: 'outer bevel', technique: 'smooth', size: px(4), strength: 1, angle: 135, altitude: 30, direction: 'up',
    highlightBlendMode: 'screen', highlightColor: { r: 255, g: 255, b: 255 }, highlightOpacity: 1, shadowBlendMode: 'multiply', shadowColor: { r: 0, g: 0, b: 0 }, shadowOpacity: 1 };
  const layer = (effects) => ({ name: 'tile', left: 6, top: 6, right: 14, bottom: 14, blendMode: 'normal', opacity: 1, imageData: { width: 8, height: 8, data }, effects });
  const plain = compositePsd([layer({ stroke: [stroke] })], w, h, { styles: LAYER_STYLES }).pixels;
  const lit = compositePsd([layer({ stroke: [stroke], bevel })], w, h, { styles: LAYER_STYLES }).pixels;
  const red = (pixels, x, y) => pixels[(y * w + x) * 4];
  // In the stroke's band on the lit side (up and left) and on the other: lighter, and darker (layer_params.psd).
  assert.equal(red(plain, 4, 10), 200);
  assert.ok(red(lit, 4, 10) > 200, `${red(lit, 4, 10)}`);
  assert.ok(red(lit, 15, 10) < 200, `${red(lit, 15, 10)}`);
  // A grey shape with its own red stroke, a pixel wide inside, and a blue layer clipped to it: blue
  // within, the stroke still red over it (stroke-composite.psd).
  const box = new Uint8ClampedArray(6 * 6 * 4);
  for (let y = 0; y < 6; y += 1) for (let x = 0; x < 6; x += 1) box.set(x === 0 || y === 0 || x === 5 || y === 5 ? [255, 0, 0, 255] : [204, 204, 204, 255], (y * 6 + x) * 4);
  const shape = { name: 'frame', left: 0, top: 0, right: 6, bottom: 6, blendMode: 'normal', opacity: 1, imageData: { width: 6, height: 6, data: box },
    vectorFill: { type: 'color', color: { r: 204, g: 204, b: 204 } }, vectorStroke: { strokeEnabled: true, lineAlignment: 'inside', content: { type: 'color', color: { r: 255, g: 0, b: 0 } } } };
  const blue = { name: 'picture', clipping: true, left: 0, top: 0, right: 6, bottom: 6, blendMode: 'normal', opacity: 1, imageData: { width: 6, height: 6, data: new Uint8ClampedArray(144).map((_, i) => [0, 0, 255, 255][i % 4]) } };
  const framed = compositePsd([shape, blue], 6, 6).pixels;
  assert.deepEqual([...framed.slice(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual([...framed.slice((2 * 6 + 2) * 4, (2 * 6 + 2) * 4 + 4)], [0, 0, 255, 255]);
});

test('deep files: Posterize on the colours\' full precision; a 32-bit file put together in linear light', () => {
  // A 16-bit file's picture keeps its own values beside the 8 bits, a 32-bit one's through sRGB's curve.
  const sixteen = eightBit({ width: 1, height: 1, data: new Uint16Array([49164, 0, 65535, 65535]) });
  assert.deepEqual([...sixteen.data], [191, 0, 255, 255]);
  assert.equal(sixteen.precise[0], 49164);
  const thirtyTwo = eightBit({ width: 1, height: 1, data: new Float32Array([0.5, 0, 1, 1]) });
  assert.deepEqual([...thirtyTwo.data], [188, 0, 255, 255]);
  assert.equal(Math.round((thirtyTwo.precise[0] / 65535) * 255), 188);
  // 191 of 255 is band 2 of 4 to the 8-bit rule; its 16-bit value, 0.7502, is band 3 (posterize_16bits_rgb.psd).
  const posterize = { name: 'Posterize', adjustment: { type: 'posterize', levels: 4 } };
  assert.equal(compositePsd([{ name: 'p', left: 0, top: 0, imageData: sixteen }, posterize], 1, 1).pixels[0], 255);
  assert.equal(compositePsd([{ name: 'p', left: 0, top: 0, imageData: { ...sixteen, precise: undefined } }, posterize], 1, 1).pixels[0], 170);
  // Black at half over white: 187 in linear light (a 32-bit file), 127 in sRGB (gradient-fill.psd's edges).
  const white = { name: 'w', left: 0, top: 0, imageData: { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) } };
  const half = { name: 'k', left: 0, top: 0, imageData: { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 128]) } };
  assert.equal(compositePsd([white, half], 1, 1, { linear: true }).pixels[0], 187);
  assert.equal(compositePsd([white, half], 1, 1).pixels[0], 127);
  // A 32-bit file's own picture, matted against white in linear light, taken back (transparentbg.psd).
  const matted = new Float32Array([0.694, 0.694, 0.694, 0.306]);
  unmatteLinear(matted);
  assert.ok(matted[0] < 0.01, `${matted[0]}`);
});

test('type blends at Photoshop\'s text gamma, 1.45; a 32-bit file\'s adjustments work on its linear values', () => {
  const white = { name: 'w', left: 0, top: 0, imageData: { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) } };
  const edge = (text) => ({ name: 'type', left: 0, top: 0, imageData: { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 51]) }, ...(text ? { text: { text: 'A' } } : {}) });
  // Black type at a fifth over white: 221 in Photoshop's pictures (PhotoCraft's 50 type files), where
  // a layer of pixels gives 204.
  assert.equal(compositePsd([white, edge(true)], 1, 1).pixels[0], 221);
  assert.equal(compositePsd([white, edge(false)], 1, 1).pixels[0], 204);
  // Exposure +1 doubles a 32-bit file's linear value (0.2 to 0.4), where an 8-bit file goes through 2.2.
  const grey = { name: 'g', left: 0, top: 0, imageData: { width: 1, height: 1, data: new Uint8ClampedArray([124, 124, 124, 255]) } };
  const up = { name: 'Exposure', adjustment: { type: 'exposure', exposure: 1, offset: 0, gamma: 1 } };
  const enc = (c) => Math.round(255 * (1.055 * c ** (1 / 2.4) - 0.055));
  const lin = ((124 / 255 + 0.055) / 1.055) ** 2.4;
  assert.ok(Math.abs(compositePsd([grey, up], 1, 1, { linear: true }).pixels[0] - enc(2 * lin)) <= 1);
});

test('Stroke Emboss lights the stroke alone; a Chisel bevel is straight facets', () => {
  const w = 30; const h = 30;
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < 256; i += 1) data.set([90, 120, 170, 255], i * 4);
  const stroke = { enabled: true, position: 'outside', fillType: 'color', size: px(4), opacity: 1, blendMode: 'normal', color: { r: 200, g: 60, b: 40 } };
  const bevel = (style, technique = 'smooth') => ({ enabled: true, style, technique, size: px(6), strength: 1, angle: 120, altitude: 30, direction: 'up',
    highlightBlendMode: 'screen', highlightColor: { r: 255, g: 255, b: 255 }, highlightOpacity: 0.75, shadowBlendMode: 'multiply', shadowColor: { r: 0, g: 0, b: 0 }, shadowOpacity: 0.75 });
  const layer = (effects) => ({ name: 'tile', left: 7, top: 7, right: 23, bottom: 23, blendMode: 'normal', opacity: 1, imageData: { width: 16, height: 16, data }, effects });
  const out = compositePsd([layer({ stroke: [stroke], bevel: bevel('stroke emboss') })], w, h, { styles: LAYER_STYLES }).pixels;
  const at = (x, y) => [...out.slice((y * w + x) * 4, (y * w + x) * 4 + 3)];
  // The layer inside keeps its colour; the stroke along the lit (upper) side is lighter than its colour.
  assert.deepEqual(at(15, 15), [90, 120, 170]);
  assert.ok(at(15, 4)[1] > 60, `${at(15, 4)}`);
  // An Inner Chisel Hard: a facet of one slope, so along the top edge its light is the same a pixel
  // in and two in (PhotoCraft's measured ramp, one step of 1 / (Size + 1) a pixel).
  const chisel = compositePsd([layer({ bevel: bevel('inner bevel', 'chisel hard') })], w, h, { styles: LAYER_STYLES }).pixels;
  const g = (x, y) => chisel[(y * w + x) * 4 + 1];
  assert.ok(g(15, 8) > 120 && Math.abs(g(15, 8) - g(15, 9)) <= 2, `${g(15, 8)} ${g(15, 9)}`);
});

test('a bevel\'s Gloss Contour and Contour; a Stroke Emboss bevels the shape as the stroke sits on it; a gradient glow fades out', () => {
  const w = 40; const h = 40; const S = 24; const off = 8;
  const data = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i += 1) data.set([90, 120, 170, 255], i * 4);
  const layer = (effects) => ({ name: 'tile', left: off, top: off, right: off + S, bottom: off + S, blendMode: 'normal', opacity: 1, imageData: { width: S, height: S, data }, effects });
  const bevel = (more) => ({ enabled: true, style: 'inner bevel', technique: 'smooth', size: px(8), strength: 1, angle: 120, altitude: 30, direction: 'up',
    highlightBlendMode: 'screen', highlightColor: { r: 255, g: 255, b: 255 }, highlightOpacity: 0.75, shadowBlendMode: 'multiply', shadowColor: { r: 0, g: 0, b: 0 }, shadowOpacity: 0.75, ...more });
  const peak = { curve: [{ x: 0, y: 0 }, { x: 128, y: 255 }, { x: 255, y: 0 }] };
  const draw = (effects, below = []) => {
    const out = compositePsd([...below, layer(effects)], w, h, { styles: LAYER_STYLES }).pixels;
    return (x, y) => [...out.slice((y * w + x) * 4, (y * w + x) * 4 + 3)];
  };
  // A Gloss Contour that peaks where the light falls on the flat face lights the flat face in full: the
  // highlight is measured from the flat face's own light, not from the contour's value there
  // (PhotoCraft's bevel-inner-gloss-ramp-peak.psd).
  assert.deepEqual(draw({ bevel: bevel({ contour: peak }) })(20, 20), [214, 221, 234]);
  assert.deepEqual(draw({ bevel: bevel({}) })(20, 20), [90, 120, 170], 'no light on the flat face without it');
  // A Contour runs over the bevel's own half of the edge: a ramp-peak one rises to its top a few pixels
  // in and falls again, so the top edge is lit and the band inside it in shadow (where a Linear one
  // is lit all the way, less and less).
  const contoured = draw({ bevel: bevel({ useShape: true, shapeContour: peak, range: 0.5 }) });
  const linear = draw({ bevel: bevel({}) });
  assert.ok(contoured(20, 8)[2] > 200 && contoured(20, 12)[2] < 80, `${contoured(20, 8)} ${contoured(20, 12)}`);
  for (let y = 9; y < 15; y += 1) assert.ok(linear(20, y)[2] <= linear(20, y - 1)[2], `linear at ${y}`);
  // Stroke Emboss over an outside stroke is an Outer Bevel of the shape, lit on the stroke alone: along
  // the lit top side the stroke grows lighter towards the shape (PhotoCraft's bevel-stroke-smooth.psd).
  const stroke = { enabled: true, position: 'outside', fillType: 'color', size: px(5), opacity: 1, blendMode: 'normal', color: { r: 200, g: 60, b: 40 } };
  const embossed = draw({ stroke: [stroke], bevel: bevel({ style: 'stroke emboss' }) });
  for (let y = 4; y < 8; y += 1) assert.ok(embossed(20, y)[1] > embossed(20, y - 1)[1], `${y}: ${embossed(20, y)} after ${embossed(20, y - 1)}`);
  assert.deepEqual(embossed(20, 20), [90, 120, 170], 'the layer itself untouched');
  // An Outer Glow along a gradient fades out where its blurred shape falls below 0.11: its far end shows
  // the white under it (PhotoCraft's outer-glow-gradient.psd).
  const white = { name: 'white', left: 0, top: 0, right: w, bottom: h, blendMode: 'normal', opacity: 1, imageData: { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) } };
  const glow = { enabled: true, blendMode: 'normal', opacity: 1, technique: 'softer', size: px(12), choke: px(0), range: 0.5,
    gradient: { colorStops: [{ location: 0, color: { r: 255, g: 0, b: 0 } }, { location: 1, color: { r: 0, g: 0, b: 255 } }], opacityStops: [{ location: 0, opacity: 1 }, { location: 1, opacity: 1 }], smoothness: 1 } };
  const glowing = draw({ outerGlow: glow }, [white]);
  assert.ok(glowing(0, 20)[1] > 60 && glowing(2, 20)[1] < 10, `${glowing(0, 20)} ${glowing(2, 20)}`);
});

/** A tiny ICC version 2 CMYK profile: A2B1 (mft2) from inks to Lab, B2A0 (mft1) from Lab to inks. */
function cmykProfile({ darkest = 0 } = {}) {
  const writer = () => {
    const bytes = [];
    const w = {
      bytes,
      u8: (v) => bytes.push(v & 255),
      u16: (v) => { w.u8(v >> 8); w.u8(v); },
      u32: (v) => { w.u16(v >>> 16); w.u16(v & 0xffff); },
      ascii: (s) => [...s].forEach((c) => w.u8(c.charCodeAt(0))),
      zeros: (n) => { for (let i = 0; i < n; i += 1) w.u8(0); },
    };
    return w;
  };
  // A2B1: four inks, three outputs, a 2-point grid; L* falls 25 for each ink, to `darkest` at full.
  const a2b = writer();
  a2b.ascii('mft2'); a2b.zeros(4); a2b.u8(4); a2b.u8(3); a2b.u8(2); a2b.u8(0);
  for (let i = 0; i < 9; i += 1) a2b.u32(i % 4 === 0 ? 65536 : 0);
  a2b.u16(2); a2b.u16(2);
  for (let c = 0; c < 4; c += 1) { a2b.u16(0); a2b.u16(65535); }
  for (let i = 0; i < 16; i += 1) {
    const inks = [(i >> 3) & 1, (i >> 2) & 1, (i >> 1) & 1, i & 1];
    const L = inks.every(Boolean) ? darkest : 100 - 25 * inks.reduce((sum, v) => sum + v, 0);
    a2b.u16(Math.round((L / 100) * 65280)); a2b.u16(0x8000); a2b.u16(0x8000);
  }
  for (let c = 0; c < 3; c += 1) { a2b.u16(0); a2b.u16(65535); }
  // B2A0: Lab to inks, full ink at L* 0, none at 100.
  const b2a = writer();
  b2a.ascii('mft1'); b2a.zeros(4); b2a.u8(3); b2a.u8(4); b2a.u8(2); b2a.u8(0);
  for (let i = 0; i < 9; i += 1) b2a.u32(i % 4 === 0 ? 65536 : 0);
  for (let c = 0; c < 3; c += 1) for (let v = 0; v < 256; v += 1) b2a.u8(v);
  for (let i = 0; i < 8; i += 1) { const v = (i >> 2) & 1 ? 0 : 255; for (let k = 0; k < 4; k += 1) b2a.u8(v); }
  for (let c = 0; c < 4; c += 1) for (let v = 0; v < 256; v += 1) b2a.u8(v);
  // Header and tag table, then the two tables.
  const out = writer();
  const start = 128 + 4 + 2 * 12;
  out.u32(start + a2b.bytes.length + b2a.bytes.length); out.zeros(4); out.u32(0x02100000);
  out.ascii('prtr'); out.ascii('CMYK'); out.ascii('Lab ');
  out.zeros(128 - out.bytes.length);
  out.u32(2);
  out.ascii('A2B1'); out.u32(start); out.u32(a2b.bytes.length);
  out.ascii('B2A0'); out.u32(start + a2b.bytes.length); out.u32(b2a.bytes.length);
  return new Uint8Array([...out.bytes, ...a2b.bytes, ...b2a.bytes]);
}

test('a CMYK profile: inks through its A2B1 table to Lab, its black point to sRGB\'s black, paper to white', () => {
  const plain = iccCmykToRgb(cmykProfile());
  assert.ok(plain);
  assert.deepEqual(plain(0, 0, 0, 0).map(Math.round), [255, 255, 255]);
  // Black ink alone: L* 75, neutral; sRGB's grey of that lightness.
  const Y = ((75 + 16) / 116) ** 3;
  const grey = 255 * (1.055 * Y ** (1 / 2.4) - 0.055);
  plain(0, 0, 0, 1).forEach((v) => assert.ok(Math.abs(v - grey) < 1, `${v} vs ${grey}`));
  // A profile whose darkest is L* 20: compensated, full ink is sRGB's black, and a mid ink lighter than
  // it would be without.
  const deep = iccCmykToRgb(cmykProfile({ darkest: 20 }));
  deep(1, 1, 1, 1).forEach((v) => assert.ok(v < 1, `${v}`));
  assert.ok(deep(0, 0, 0, 1)[0] < grey);
  assert.equal(iccCmykToRgb(new Uint8Array(200)), null);
});

test('what is drawn as measured is not reported; what is only close says why', () => {
  const layer = (effects) => ({ name: 'l', left: 2, top: 2, imageData: { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(255) }, effects });
  const styles = { cast: castShadows, draw: drawLayerStyles, reach: () => 3 };
  const plain = compositePsd([layer({ outerGlow: { enabled: true, size: px(3), technique: 'softer' }, bevel: { enabled: true, size: px(2) } })], 8, 8, { styles });
  assert.deepEqual(plain.closeTo.styles, []);
  assert.deepEqual(plain.styles.sort(), ['Bevel & Emboss', 'Outer Glow']);
  const close = compositePsd([layer({ outerGlow: { enabled: true, size: px(3), technique: 'precise', noise: 0.2 }, bevel: { enabled: true, size: px(2), technique: 'chisel hard' } })], 8, 8, { styles });
  // (A Chisel bevel is drawn as measured now: PhotoCraft's corpus.)
  assert.deepEqual(close.closeTo.styles.sort(), ['Outer Glow (Precise, its Noise not drawn)']);
});
