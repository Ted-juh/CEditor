// psdComposite.test.js — Photoshop's layers flattened as Photoshop flattens them.
//
// Layers here are the shape ag-psd reads (`imageData`, `left`/`top`, `blendMode`, `mask`, `clipping`,
// `children`), built by hand so every expected pixel can be worked out from Photoshop's formulas on
// paper. psdPanelImport.test.js runs the same through files ag-psd wrote.
import test from 'node:test';
import assert from 'node:assert/strict';

import { blendChannel, compositePsd, SUPPORTED_BLEND_MODES } from '../src/CE_Application/utils/psdComposite.js';

/** A solid layer: `rgba` over a w × h box at (left, top). */
function solid(name, left, top, w, h, rgba, extra = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { name, left, top, imageData: { width: w, height: h, data }, ...extra };
}

function flatten(layers, width = 4, height = 1, options) {
  const { pixels, painted, notDrawn } = compositePsd(layers, width, height, options);
  return { at: (x, y = 0) => [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)], painted, notDrawn };
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
    solid('noise', 2, 0, 1, 1, grey(90), { blendMode: 'dissolve' }),
    solid('pathed', 3, 0, 1, 1, grey(40), { vectorMask: { paths: [] } }),
    { name: 'components', children: [solid('knob', 0, 0, 1, 1, grey(255))] },
  ], 4, 1, { skip: (layer) => layer.name === 'components' });
  assert.deepEqual(out.notDrawn, { effects: ['shadowed'], vectorMask: ['pathed'], adjustment: ['Curves 1'], dissolve: ['noise'] });
  near(out.at(0), grey(200), 'the shadowed layer\'s own pixels are drawn');
  near(out.at(2), grey(90), 'dissolve drawn as normal');
  near(out.at(0), grey(200), 'and the skipped group is not painted over it');
});
