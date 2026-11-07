// psdComposite.test.js — Photoshop's layers flattened as Photoshop flattens them.
//
// Layers here are the shape ag-psd reads (`imageData`, `left`/`top`, `blendMode`, `mask`, `clipping`,
// `children`), built by hand so every expected pixel can be worked out from Photoshop's formulas on
// paper. psdPanelImport.test.js runs the same through files ag-psd wrote.
import test from 'node:test';
import assert from 'node:assert/strict';

import { blendChannel, compositePsd, SUPPORTED_BLEND_MODES } from '../src/CE_Application/utils/psdComposite.js';
import { LAYER_STYLES } from '../src/CE_Application/utils/psdLayerStyles.js';

/** A solid layer: `rgba` over a w × h box at (left, top). */
function solid(name, left, top, w, h, rgba, extra = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { name, left, top, imageData: { width: w, height: h, data }, ...extra };
}

function flatten(layers, width = 4, height = 1, options) {
  const { pixels, painted, notDrawn, closeTo, styles, dissolve } = compositePsd(layers, width, height, options);
  return { at: (x, y = 0) => [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)], pixels, painted, notDrawn, closeTo, styles, dissolve };
}

const grey = (v) => [v, v, v, 255];
const near = (actual, expected, message) =>
  assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) <= 1), `${message}: ${actual} vs ${expected}`);

test('each separable mode follows its formula over an opaque backdrop', () => {
  const cases = {
    multiply: [0.5, 0.5, 0.25],
    screen: [0.5, 0.5, 0.75],
    darken: [0.25, 0.75, 0.25],
    lighten: [0.25, 0.75, 0.75],
    'color burn': [0.75, 0.5, 0.5],
    'color dodge': [0.25, 0.5, 0.5],
    'linear burn': [0.5, 0.75, 0.25],
    'linear dodge': [0.25, 0.5, 0.75],
    overlay: [0.25, 0.5, 0.25],
    'hard light': [0.5, 0.25, 0.25],
    // Photoshop's soft light: 2bs + b²(1 − 2s) when s ≤ ½.
    'soft light': [0.5, 0.25, 0.375],
    difference: [0.75, 0.25, 0.5],
    exclusion: [0.5, 0.5, 0.5],
    subtract: [0.75, 0.25, 0.5],
    divide: [0.25, 0.5, 0.5],
    'pin light': [0.75, 0.25, 0.5],
    'linear light': [0.25, 0.5, 0.25],
    'hard mix': [0.75, 0.5, 1],
  };
  for (const [mode, [b, s, expected]] of Object.entries(cases)) {
    assert.ok(Math.abs(blendChannel(mode, b, s) - expected) < 1e-9, `${mode}(${b}, ${s}) = ${blendChannel(mode, b, s)}`);
    const out = flatten([solid('under', 0, 0, 1, 1, grey(b * 255)), solid('over', 0, 0, 1, 1, grey(s * 255), { blendMode: mode })], 1);
    near(out.at(0), grey(Math.round(expected * 255)), `${mode} drawn`);
  }
});

test('the non-separable modes keep the backdrop\'s luminance where Photoshop does', () => {
  // Color: the source's hue and saturation at the backdrop's luminance. Red on mid grey is
  // SetLum((1, 0, 0), 0.5) = (1.2, 0.2, 0.2), clipped back into range = (1, 0.2857, 0.2857).
  near(flatten([solid('grey', 0, 0, 1, 1, grey(127.5)), solid('red', 0, 0, 1, 1, [255, 0, 0, 255], { blendMode: 'color' })], 1).at(0),
    [255, 73, 73, 255], 'color');
  // Luminosity: grey source on a red backdrop takes the red's hue at the grey's luminance.
  const lumOut = flatten([solid('red', 0, 0, 1, 1, [255, 0, 0, 255]), solid('dark', 0, 0, 1, 1, grey(51), { blendMode: 'luminosity' })], 1).at(0);
  near([Math.round(0.3 * lumOut[0] + 0.59 * lumOut[1] + 0.11 * lumOut[2])], [51], 'luminosity sets the luminance');
  // Saturation from grey (zero) takes all colour out of the backdrop.
  const desat = flatten([solid('red', 0, 0, 1, 1, [255, 0, 0, 255]), solid('grey', 0, 0, 1, 1, grey(128), { blendMode: 'saturation' })], 1).at(0);
  assert.ok(desat[0] === desat[1] && desat[1] === desat[2], `saturation from grey: ${desat}`);
  assert.ok(SUPPORTED_BLEND_MODES.includes('hue') && SUPPORTED_BLEND_MODES.includes('darker color'));
});

test('a blend mode only blends where there is a backdrop, and opacity scales it', () => {
  // Multiply over nothing is just the colour (Cs' = (1 − ab)·Cs + ab·B with ab = 0).
  near(flatten([solid('red', 0, 0, 1, 1, [255, 0, 0, 255], { blendMode: 'multiply' })], 1).at(0), [255, 0, 0, 255], 'over nothing');
  // Half-opacity multiply of black over white: halfway to black.
  near(flatten([solid('white', 0, 0, 1, 1, grey(255)), solid('black', 0, 0, 1, 1, grey(0), { blendMode: 'multiply', opacity: 0.5 })], 1).at(0),
    grey(128), 'half opacity');
  // Fill opacity scales the pixels too (there are no effects for it to spare).
  near(flatten([solid('white', 0, 0, 1, 1, grey(255)), solid('black', 0, 0, 1, 1, grey(0), { fillOpacity: 0.25 })], 1).at(0),
    grey(191), 'fill opacity');
});

test('a layer mask hides by its own pixels, with its default colour outside its rectangle', () => {
  const mask = (values, extra = {}) => {
    const data = new Uint8ClampedArray(values.length * 4);
    values.forEach((v, i) => data.set([v, v, v, 255], i * 4));
    return { left: 1, top: 0, imageData: { width: values.length, height: 1, data }, defaultColor: 0, ...extra };
  };
  const layers = (m) => [solid('black', 0, 0, 4, 1, grey(0)), solid('white', 0, 0, 4, 1, grey(255), { mask: m })];

  const out = flatten(layers(mask([255, 128])));
  near(out.at(0), grey(0), 'outside the mask, default black: hidden');
  near(out.at(1), grey(255), 'mask white: shown');
  near(out.at(2), grey(128), 'mask grey: half');
  near(out.at(3), grey(0), 'outside again');

  near(flatten(layers(mask([0, 0], { defaultColor: 255 }))).at(3), grey(255), 'a white default shows the rest');
  near(flatten(layers(mask([0, 0], { disabled: true }))).at(1), grey(255), 'a disabled mask is ignored');
  near(flatten(layers(mask([0, 0], { userMaskDensity: 0.5 }))).at(1), grey(128), 'density 50%: hidden half-way');
});

test('a clipped layer draws only inside its base, blended with the base and not what lies under it', () => {
  const out = flatten([
    solid('backdrop', 0, 0, 4, 1, [0, 0, 255, 255]),
    solid('base', 0, 0, 2, 1, grey(255)),
    // Multiply by red: inside the base, white × red = red. Outside it there is no base, so nothing.
    solid('tint', 0, 0, 4, 1, [255, 0, 0, 255], { clipping: true, blendMode: 'multiply' }),
  ]);
  near(out.at(1), [255, 0, 0, 255], 'inside the base');
  near(out.at(3), [0, 0, 255, 255], 'outside the base: the backdrop untouched');

  // Clipped to a hidden layer: hidden with it, not re-attached to the layer underneath.
  const hiddenBase = flatten([
    solid('backdrop', 0, 0, 4, 1, grey(0)),
    solid('base', 0, 0, 4, 1, grey(255), { hidden: true }),
    solid('tint', 0, 0, 4, 1, [255, 0, 0, 255], { clipping: true }),
  ]);
  near(hiddenBase.at(0), grey(0), 'nothing from a layer clipped to a hidden one');
});

test('pass-through groups paint straight through; any other group is composited on its own first', () => {
  const backdrop = solid('red', 0, 0, 1, 1, [255, 0, 0, 255]);
  const grey50 = solid('grey', 0, 0, 1, 1, grey(128), { blendMode: 'multiply' });
  // Pass through: the multiply inside reaches the red below. 0.5 × red = dark red.
  near(flatten([backdrop, { name: 'g', blendMode: 'pass through', children: [grey50] }], 1).at(0), [128, 0, 0, 255], 'pass through');
  // Normal (isolated): inside the group the multiply has nothing under it, so the group is plain
  // grey, and that grey is laid over the red.
  near(flatten([backdrop, { name: 'g', blendMode: 'normal', children: [grey50] }], 1).at(0), grey(128), 'isolated');
  // An isolated group blended as a whole: white × red = red.
  near(flatten([backdrop, { name: 'g', blendMode: 'multiply', children: [solid('white', 0, 0, 1, 1, grey(255))] }], 1).at(0),
    [255, 0, 0, 255], 'group multiply');
  // Group opacity reaches everything inside, either way.
  near(flatten([solid('black', 0, 0, 1, 1, grey(0)), { name: 'g', opacity: 0.5, blendMode: 'pass through', children: [solid('w', 0, 0, 1, 1, grey(255))] }], 1).at(0),
    grey(128), 'group opacity');
});

test('what cannot be drawn is named, and the rest of the layer still is', () => {
  const out = flatten([
    solid('shadowed', 0, 0, 1, 1, grey(200), { effects: { dropShadow: [{ enabled: true }] } }),
    solid('off effects', 1, 0, 1, 1, grey(200), { effects: { dropShadow: [{ enabled: false }] } }),
    { name: 'Curves 1', adjustment: { type: 'curves' } },
    { name: 'Lookup', adjustment: { type: 'color lookup', lookupType: 'abstractProfile' } },
    solid('pathed', 3, 0, 1, 1, grey(40), { vectorMask: { paths: [], fillStartsWithAllPixels: true } }),
    { name: 'components', children: [solid('knob', 0, 0, 1, 1, grey(255))] },
  ], 4, 1, { skip: (layer) => layer.name === 'components' });
  // Without the styles to draw them with, a layer's styles are left out and named; an adjustment
  // with no formula is named with what it is; a vector mask with no paths that reveals all hides nothing.
  assert.deepEqual(out.notDrawn, { effects: ['shadowed'], adjustment: ['Lookup (Color Lookup through an ICC profile)'] });
  near(out.at(0), grey(200), 'the shadowed layer\'s own pixels are drawn');
  near(out.at(3), grey(40), 'Reveal All hides nothing');
  near(out.at(0), grey(200), 'and the skipped group is not painted over it');
});

test('an adjustment layer changes what is under it in its group, by its opacity and masks', () => {
  const invert = (extra = {}) => ({ name: 'Invert', adjustment: { type: 'invert' }, ...extra });
  // Everything under it, not what is above.
  const plain = flatten([solid('a', 0, 0, 2, 1, grey(200)), invert(), solid('b', 1, 0, 1, 1, grey(30))], 2);
  near(plain.at(0), grey(55), 'inverted');
  near(plain.at(1), grey(30), 'the layer above it untouched');
  assert.deepEqual(plain.notDrawn.adjustment, []);
  // Half its opacity: halfway to the inverted colour.
  near(flatten([solid('a', 0, 0, 1, 1, grey(200)), invert({ opacity: 0.5 })], 1).at(0), grey(128), 'half opacity');
  // Its layer mask: black hides it.
  const masked = invert({ mask: { left: 0, top: 0, imageData: { width: 2, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]) } } });
  const out = flatten([solid('a', 0, 0, 2, 1, grey(200)), masked], 2);
  near(out.at(0), grey(55), 'where the mask is white');
  near(out.at(1), grey(200), 'where it is black');
  // Clipped to a layer: that layer alone.
  const clipped = flatten([solid('under', 0, 0, 2, 1, grey(100)), solid('base', 1, 0, 1, 1, grey(200)), invert({ clipping: true })], 2);
  near(clipped.at(0), grey(100), 'not the layer under its base');
  near(clipped.at(1), grey(55), 'its base');
  // In an isolated group, only the group's own layers.
  const grouped = flatten([solid('under', 0, 0, 2, 1, grey(100)),
    { name: 'g', blendMode: 'normal', children: [solid('in', 1, 0, 1, 1, grey(200)), invert()] }], 2);
  near(grouped.at(0), grey(100), 'not under the group');
  near(grouped.at(1), grey(55), 'inside it');
  // In a Pass Through group, everything below.
  near(flatten([solid('under', 0, 0, 1, 1, grey(100)), { name: 'g', blendMode: 'pass through', children: [invert()] }], 1).at(0),
    grey(155), 'through a pass-through group');
  // In its own blend mode: Darken keeps the darker of the two.
  near(flatten([solid('a', 0, 0, 1, 1, grey(200)), invert({ blendMode: 'darken' })], 1).at(0), grey(55), 'darken');
  near(flatten([solid('a', 0, 0, 1, 1, grey(40)), invert({ blendMode: 'darken' })], 1).at(0), grey(40), 'darken keeps the darker');
  // Approximated ones are said to be (a raised Vibrance's boost is a fit).
  assert.deepEqual(flatten([solid('a', 0, 0, 1, 1, grey(100)), { name: 'V', adjustment: { type: 'vibrance', vibrance: 20 } }], 1).closeTo.adjustments,
    ['Vibrance']);
});

test('a vector mask on a layer of pixels hides what its paths leave out', () => {
  // A path over the left half of a 4 × 1 strip.
  const knot = (x, y) => ({ linked: false, points: [x, y, x, y, x, y] });
  const half = { paths: [{ open: false, knots: [knot(0, 0), knot(2, 0), knot(2, 1), knot(0, 1)] }] };
  const out = flatten([solid('a', 0, 0, 4, 1, grey(200), { vectorMask: half })]);
  near(out.at(0), grey(200), 'inside the path');
  assert.equal(out.at(3)[3], 0, 'outside it');
  // Switched off, it hides nothing; inverted, the other half.
  near(flatten([solid('a', 0, 0, 4, 1, grey(200), { vectorMask: { ...half, disable: true } })]).at(3), grey(200), 'disabled');
  assert.equal(flatten([solid('a', 0, 0, 4, 1, grey(200), { vectorMask: { ...half, invert: true } })]).at(0)[3], 0, 'inverted');
  // A shape's pixels are its shape already: its vector mask is not applied over them again.
  const shape = solid('shape', 0, 0, 4, 1, grey(200), { vectorMask: half, vectorFill: { type: 'color', color: { r: 200, g: 200, b: 200 } } });
  near(flatten([shape]).at(3), grey(200), 'a shape layer');
  // No paths at all: Photoshop's Hide All, unless it starts with all pixels (Reveal All).
  assert.equal(flatten([solid('a', 0, 0, 4, 1, grey(200), { vectorMask: { paths: [] } })]).at(0)[3], 0, 'hide all');
  // Starting with all pixels does not matter once there are paths: the first one still draws the shape.
  assert.equal(flatten([solid('a', 0, 0, 4, 1, grey(200), { vectorMask: { ...half, fillStartsWithAllPixels: true } })]).at(3)[3], 0, 'starts full, one path');
  // A path with no operation of its own is part of the shape before it: a hole in it, even-odd.
  const ring = { paths: [
    { open: false, operation: 'combine', fillRule: 'even-odd', knots: [knot(0, 0), knot(4, 0), knot(4, 1), knot(0, 1)] },
    { open: false, fillRule: 'even-odd', knots: [knot(1, 0), knot(3, 0), knot(3, 1), knot(1, 1)] },
  ] };
  const holed = flatten([solid('a', 0, 0, 4, 1, grey(200), { vectorMask: ring })]);
  near(holed.at(0), grey(200), 'the ring');
  assert.equal(holed.at(2)[3], 0, 'its hole');
  // Its density lets what it hides show by the rest.
  assert.equal(flatten([solid('a', 0, 0, 4, 1, grey(200), { vectorMask: half, mask: { fromVectorData: true, vectorMaskDensity: 0.75 } })]).at(3)[3], 64, 'density');
  // On a group, over everything in it.
  assert.equal(flatten([{ name: 'g', blendMode: 'pass through', vectorMask: half, children: [solid('a', 0, 0, 4, 1, grey(200))] }]).at(3)[3], 0, 'a group');
});

test('Dissolve draws whole pixels, as many as its opacity, the same every time', () => {
  const layer = solid('noise', 0, 0, 64, 64, grey(90), { blendMode: 'dissolve', opacity: 0.25 });
  const a = flatten([solid('white', 0, 0, 64, 64, grey(255)), layer], 64, 64);
  const b = flatten([solid('white', 0, 0, 64, 64, grey(255)), layer], 64, 64);
  assert.deepEqual(a.pixels, b.pixels, 'the same grain each time');
  let dark = 0;
  for (let i = 0; i < a.pixels.length; i += 4) {
    assert.ok(a.pixels[i] === 90 || a.pixels[i] === 255, 'each pixel all one or all the other');
    if (a.pixels[i] === 90) dark += 1;
  }
  assert.ok(Math.abs(dark / 4096 - 0.25) < 0.03, `a quarter of the pixels: ${dark / 4096}`);
  assert.deepEqual(a.dissolve, ['noise']);
});

test('given the styles, a drop shadow is cast under the layer and a stroke drawn around it', () => {
  // A 4 × 4 white square on white; a black shadow 4 px down and right, no softening.
  const square = solid('sq', 4, 4, 4, 4, grey(255), {
    effects: { dropShadow: [{ enabled: true, angle: 135, distance: { units: 'Pixels', value: Math.SQRT2 * 4 }, size: { units: 'Pixels', value: 0 }, opacity: 1, color: { r: 0, g: 0, b: 0 }, blendMode: 'normal' }] },
  });
  const out = flatten([solid('bg', 0, 0, 16, 16, grey(255)), square], 16, 16, { styles: LAYER_STYLES });
  near(out.at(5, 5), grey(255), 'the layer over its own shadow');
  near(out.at(10, 10), grey(0), 'the shadow beside it');
  near(out.at(1, 1), grey(255), 'nothing where it does not fall');
  assert.deepEqual(out.notDrawn.effects, []);
  assert.ok(out.styles.includes('Drop Shadow'));
  assert.deepEqual(out.closeTo.styles, [], 'drawn as Photoshop draws it, so not reported');
  // At Fill 0 the layer is gone and its shadow is still hidden under it (Layer Knocks Out Drop Shadow).
  const empty = flatten([solid('bg', 0, 0, 16, 16, grey(255)), { ...square, fillOpacity: 0 }], 16, 16, { styles: LAYER_STYLES });
  near(empty.at(5, 5), grey(255), 'knocked out under the layer');
  near(empty.at(10, 10), grey(0), 'still cast beside it');
  // An outside stroke of 2 px around it.
  const stroked = solid('sq', 4, 4, 4, 4, grey(255), { effects: { stroke: [{ enabled: true, size: { units: 'Pixels', value: 2 }, position: 'outside', color: { r: 255, g: 0, b: 0 }, opacity: 1 }] } });
  const ring = flatten([stroked], 16, 16, { styles: LAYER_STYLES });
  near(ring.at(3, 5), [255, 0, 0, 255], 'stroke outside its edge');
  near(ring.at(5, 5), grey(255), 'its pixels inside');
  assert.equal(ring.at(0, 0)[3], 0, 'nothing beyond the stroke');
});

test('a pattern fill is tiled from the document corner, and a pattern overlay from the layer', () => {
  // A 2 × 1 pattern: red then blue.
  const picture = { width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]) };
  const fill = { name: 'Pattern Fill', vectorFill: { type: 'pattern', id: 'p', name: 'p', picture } };
  const out = flatten([fill], 4, 1);
  near(out.at(0), [255, 0, 0, 255], 'first tile');
  near(out.at(1), [0, 0, 255, 255], 'second');
  near(out.at(2), [255, 0, 0, 255], 'and again');
  // An overlay linked with the layer starts at its corner (here x = 1).
  const overlaid = solid('o', 1, 0, 3, 1, grey(255), { effects: { patternOverlay: { enabled: true, opacity: 1, align: true, scale: 1, pattern: { id: 'p' }, picture } } });
  const over = flatten([overlaid], 4, 1, { styles: LAYER_STYLES });
  near(over.at(1), [255, 0, 0, 255], 'starts at the layer');
  near(over.at(2), [0, 0, 255, 255], 'then the next');
});

test('a clipped layer shows in full over a base at Fill 0%, and clips to its shape', () => {
  // The base: a 2 × 1 layer at x 1..2, Fill 0; clipped to it, white across the whole strip.
  const base = solid('base', 1, 0, 2, 1, grey(0), { fillOpacity: 0 });
  const white = solid('white', 0, 0, 4, 1, grey(255), { clipping: true });
  const out = flatten([base, white]);
  near(out.at(1), grey(255), 'inside the base, in full');
  assert.equal(out.at(0)[3], 0, 'outside it, nothing');
  // At Fill 50% the base shows under it as far as its Fill: a half-transparent clipped layer over it.
  const half = flatten([solid('base', 0, 0, 1, 1, grey(0), { fillOpacity: 0.5 }), solid('w', 0, 0, 1, 1, [255, 255, 255, 128], { clipping: true })], 1);
  near(half.at(0), [170, 170, 170, 191], 'blended with the base by its Fill, covering as both do');
});

test('"Blend Interior Effects as Group" puts a Color Overlay under the layer\'s Fill', () => {
  const red = { r: 255, g: 0, b: 0 };
  const layer = (extra) => solid('l', 0, 0, 1, 1, grey(255), { fillOpacity: 0.5, effects: { solidFill: [{ enabled: true, opacity: 1, color: red, blendMode: 'normal' }] }, ...extra });
  const plain = flatten([layer({})], 1, 1, { styles: LAYER_STYLES });
  near(plain.at(0), [255, 0, 0, 255], 'drawn over the Fill: in full');
  const grouped = flatten([layer({ blendInteriorElements: true })], 1, 1, { styles: LAYER_STYLES });
  assert.equal(grouped.at(0)[3], 128, 'under the Fill: by it');
});

test('an adjustment clipped to an adjustment layer applies where that one does', () => {
  const invert = { type: 'invert' };
  const out = flatten([solid('a', 0, 0, 1, 1, grey(200)), { name: 'Levels', adjustment: { type: 'levels' } }, { name: 'Invert', clipping: true, adjustment: invert }], 1);
  near(out.at(0), grey(55), 'the clipped invert is applied');
});

test('a CMYK file is flattened on its inks: an Invert inverts each ink, Black has its own curve', async () => {
  const { compositeInks } = await import('../src/CE_Application/utils/psdComposite.js');
  const { cmykToRgb } = await import('../src/CE_Application/utils/psdAdjustments.js');
  // One pixel of 20% cyan and nothing else, stored as Photoshop stores ink (255 none); its RGB
  // picture is what the reader made of it.
  const ink = (cmy, k) => ({ cmy: new Uint8ClampedArray([...cmy, 255]), k: new Uint8ClampedArray([k, k, k, 255]) });
  const layer = { name: 'a', left: 0, top: 0, imageData: { width: 1, height: 1, data: new Uint8ClampedArray([...cmykToRgb(0.2, 0, 0, 0).map(Math.round), 255]) }, inkPlanes: ink([204, 255, 255], 255) };
  const rgbOf = (inks) => cmykToRgb(...inks).map(Math.round);
  // Inverted on inks: 80% cyan, and full magenta, yellow and black, as Photoshop inverts a CMYK file.
  const inverted = compositeInks([layer, { name: 'Invert', adjustment: { type: 'invert' } }], 1, 1);
  near([...inverted.pixels], [...rgbOf([0.8, 1, 1, 1]), 255], 'inverted inks');
  // A Curves that lightens black only (its fifth channel, read from the file beside ag-psd's four).
  const dark = { ...layer, inkPlanes: ink([255, 255, 255], 0) };
  const lighter = compositeInks([dark, { name: 'Curves', adjustment: { type: 'curves', black: [{ input: 0, output: 128 }, { input: 255, output: 255 }] } }], 1, 1);
  near([...lighter.pixels], [...rgbOf([0, 0, 0, 1 - 128 / 255]), 255], 'black lightened, nothing else');
  // Colorize is worked on the inks' plain complement and separated plainly again, black first: 20%
  // cyan is 204, 255, 255, a lightness of 0.9; at 30° and 50% that is 0.95, 0.9, 0.85, which is no
  // cyan, 5.3% magenta, 10.5% yellow and 5% black (PhotoCraft's cmyk hue-saturation-colorize.psd).
  const colorized = compositeInks([layer, { name: 'Colorize', adjustment: { type: 'hue/saturation', master: { a: 1 << 8, b: 30, c: 50, d: 0 } } }], 1, 1);
  near([...colorized.pixels], [...rgbOf([0, 0.05 / 0.95, 0.1 / 0.95, 0.05]), 255], 'colorized and separated');
  // One that works on whole colours and has no rule on inks still goes to the RGB flattening.
  assert.equal(compositeInks([layer, { name: 'Photo Filter', adjustment: { type: 'photo filter', color: { r: 236, g: 138, b: 0 }, density: 0.25 } }], 1, 1), null);
  // Hue/Saturation works on cyan, magenta and yellow as an RGB colour's complement, black kept: black
  // ink alone does not move when the hue turns (PhotoCraft's cmyk hue-saturation.psd), while 20% cyan
  // turns to another ink.
  const turned = (base) => [...compositeInks([base, { name: 'Hue/Saturation', adjustment: { type: 'hue/saturation', master: { hue: 120, saturation: 0, lightness: 0 } } }], 1, 1).pixels];
  near(turned(dark), [...rgbOf([0, 0, 0, 1]), 255], 'black ink left alone');
  const before = rgbOf([0.2, 0, 0, 0]);
  assert.ok(Math.abs(turned(layer)[0] - before[0]) > 20, `${turned(layer)} from ${before}`);
  // A Threshold judges each pixel by its inks' plain RGB, 255·(1 − ink)(1 − black): 20% cyan is
  // 204, 255, 255, a luminance of 245; white (no ink) at 240, black ink alone at 250.
  const at = (level) => [...compositeInks([layer, { name: 'Threshold', adjustment: { type: 'threshold', level } }], 1, 1).pixels];
  near(at(240), [255, 255, 255, 255], 'white: no ink');
  near(at(250), [...rgbOf([0, 0, 0, 1]), 255], 'black ink alone');
});

test('a Lab file is flattened on its stored L, a and b: Normal mixes them, adjustments work on them', async () => {
  const { compositeLab } = await import('../src/CE_Application/utils/psdComposite.js');
  const { labToRgb } = await import('../src/CE_Application/utils/psdAdjustments.js');
  // Stored as Photoshop stores Lab (L 0..255, a and b offset by 128); the reader keeps them beside the
  // colours as `labPlanes`.
  const lab = (name, l, a, b, extra = {}) => ({ name, left: 0, top: 0, imageData: { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255]) },
    labPlanes: { lab: new Uint8ClampedArray([l, a, b, 255]) }, ...extra });
  const rgbOf = (l, a, b) => labToRgb((l * 100) / 255, a - 128, b - 128).map(Math.round);
  // Inverted on L, a and b: a saturated colour, which its RGB would clip, keeps its own inverse.
  const inverted = compositeLab([lab('red', 138, 209, 198), { name: 'Invert', adjustment: { type: 'invert' } }], 1, 1);
  near([...inverted.pixels], [...rgbOf(117, 46, 57), 255], 'inverted');
  // Normal at half opacity mixes the stored values: half way between two greys is the grey between.
  const mixed = compositeLab([lab('dark', 50, 128, 128), lab('light', 150, 128, 128, { opacity: 0.5 })], 1, 1);
  near([...mixed.pixels], [...rgbOf(100, 128, 128), 255], 'mixed on L');
  // Another blend mode, or an adjustment Photoshop works on RGB there, goes to the RGB flattening.
  assert.equal(compositeLab([lab('dark', 50, 128, 128), lab('top', 150, 128, 128, { blendMode: 'multiply' })], 1, 1), null);
  assert.equal(compositeLab([lab('dark', 50, 128, 128), { name: 'Mixer', adjustment: { type: 'channel mixer' } }], 1, 1), null);
});

test('a CMYK file of fills alone is flattened on its inks too: a gradient mixes its stops as inks', async () => {
  const { compositeInks } = await import('../src/CE_Application/utils/psdComposite.js');
  const { cmykToRgb } = await import('../src/CE_Application/utils/psdAdjustments.js');
  // psd-tools' 4x4_16bit_cmyk.psd: a Gradient Fill with no pixels. Half way between full cyan and full
  // magenta is half of each, as Photoshop mixes them, not the RGB half way between their colours.
  const fill = { name: 'Gradient Fill', left: 0, top: 0, right: 0, bottom: 0, blendMode: 'normal', opacity: 1, vectorFill: { type: 'solid', style: 'linear', angle: 0, smoothness: 0,
    colorStops: [{ location: 0, color: { c: 100, m: 0, y: 0, k: 0 } }, { location: 1, color: { c: 0, m: 100, y: 0, k: 0 } }], opacityStops: [{ location: 0, opacity: 1 }, { location: 1, opacity: 1 }] } };
  const flat = compositeInks([fill], 2, 1);
  assert.ok(flat, 'drawn on the inks');
  // Fills are worked at whole pixel coordinates: the second pixel is half way across.
  near([...flat.pixels.slice(0, 4)], [...cmykToRgb(1, 0, 0, 0).map(Math.round), 255], 'the first stop');
  near([...flat.pixels.slice(4, 8)], [...cmykToRgb(0.5, 0.5, 0, 0).map(Math.round), 255], 'half of each ink');
});

test('type in another blend mode: the blend worked as ever, mixed in at its edge in type\'s space', () => {
  // Grey 200 under a Multiply type pixel of grey 100 at half coverage: Multiply gives 78.4, mixed half
  // way with 200 in linear light at a 1.45 gamma (PhotoCraft's text-on-gradient-blend-multiply.psd).
  const toLight = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const fromLight = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const space = (v) => toLight(v / 255) ** (1 / 1.45);
  const back = (t) => 255 * fromLight(t ** 1.45);
  const multiplied = (200 * 100) / 255;
  const want = back(space(200) + (space(multiplied) - space(200)) * (128 / 255));
  const { at } = flatten([solid('under', 0, 0, 1, 1, grey(200)), solid('type', 0, 0, 1, 1, [100, 100, 100, 128], { text: { text: 'A' }, blendMode: 'multiply' })], 1, 1);
  assert.ok(Math.abs(at(0)[0] - want) <= 1, `${at(0)} vs ${want}`);
});
