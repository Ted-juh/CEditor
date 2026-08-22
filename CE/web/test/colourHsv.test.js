// HSB, not HSL. The colour chooser's "B" band was HSL lightness — black →
// colour → WHITE — while every label and every user's muscle memory said HSB
// brightness, black → colour. These tests pin the distinction at the exact
// place the bug lived: the conversion, and the band gradients built from it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { rgbToHsl, hslToRgb } from '../src/CE_Application/utils/colorMath.js';
import {
  rgbToHsv, hsvToRgb, hsvToHex, hsvToHsl, hslToHsv, hsvToHslaString, hexToHsvPreserving,
} from '../src/CE_Application/utils/hsvMath.js';
import {
  hueBand, saturationBand, brightnessBand, alphaBand, svSquareBackground,
} from '../src/CE_Application/utils/bandGradients.js';

const round = (values) => values.map((v) => Math.round(v));

test('a fully saturated colour is B = 100 in HSB and L = 50 in HSL', () => {
  // This IS the bug: the old band read 50 for a pure red and put the thumb in
  // the middle of a track whose top half was pastel.
  assert.deepEqual(round(rgbToHsv(255, 0, 0)), [0, 100, 100]);
  assert.deepEqual(round(rgbToHsl(255, 0, 0)), [0, 100, 50]);
});

test('the brightness axis tops out at the colour, never at white', () => {
  assert.equal(hsvToHex(0, 100, 100), 'FF0000');   // B = 100 is the pure hue
  assert.equal(hsvToHex(0, 100, 0), '000000');     // B = 0 is black
  // HSL's lightness axis does the other thing, which is what made the band wrong.
  assert.deepEqual(hslToRgb(0, 100, 100), [255, 255, 255]);
});

test('white and black sit where HSB says they do', () => {
  assert.deepEqual(round(rgbToHsv(255, 255, 255)), [0, 0, 100]);
  assert.deepEqual(round(rgbToHsv(0, 0, 0)), [0, 0, 0]);
  assert.equal(hsvToHex(210, 0, 100), 'FFFFFF');
});

test('hsvToRgb round-trips across the hue wheel', () => {
  for (let h = 0; h < 360; h += 15) {
    for (const [s, v] of [[100, 100], [60, 80], [25, 40]]) {
      const [r, g, b] = hsvToRgb(h, s, v);
      const back = rgbToHsv(r, g, b);
      assert.ok(Math.abs(back[0] - h) < 1.5, `hue ${h} -> ${back[0]}`);
      assert.ok(Math.abs(back[1] - s) < 1.5, `sat ${s} -> ${back[1]}`);
      assert.ok(Math.abs(back[2] - v) < 1.5, `val ${v} -> ${back[2]}`);
    }
  }
});

test('hsvToHsl and hslToHsv are inverses', () => {
  for (const [h, s, v] of [[0, 100, 100], [210, 65, 85], [40, 10, 20], [300, 0, 50]]) {
    const [hh, sl, l] = hsvToHsl(h, s, v);
    const back = hslToHsv(hh, sl, l);
    assert.ok(Math.abs(back[1] - s) < 0.001 && Math.abs(back[2] - v) < 0.001,
      `${[h, s, v]} -> ${[hh, sl, l]} -> ${back}`);
  }
});

test('hsvToHslaString translates for CSS, which has no hsb() notation', () => {
  assert.equal(hsvToHslaString(0, 100, 100, 1), 'hsla(0, 100%, 50%, 1)');
  assert.equal(hsvToHslaString(0, 0, 0, 0.5), 'hsla(0, 0%, 0%, 0.5)');
});

test('hexToHsvPreserving keeps the axes a colour cannot pin down', () => {
  const previous = { h: 210, s: 65, v: 85 };

  // Black: hue AND saturation are unknowable, so the thumb stays put.
  const black = hexToHsvPreserving('000000', previous);
  assert.deepEqual([black.h, black.s, black.v], [210, 65, 0]);

  // Grey: hue is unknowable, saturation genuinely is zero.
  const grey = hexToHsvPreserving('808080', previous);
  assert.equal(grey.h, 210);
  assert.equal(grey.s, 0);
  assert.ok(Math.abs(grey.v - 50.2) < 0.5);

  // A real colour overrides everything.
  const red = hexToHsvPreserving('FF0000', previous);
  assert.deepEqual(round([red.h, red.s, red.v]), [0, 100, 100]);
});

test('hexToHsvPreserving accepts a leading hash and needs no previous value', () => {
  const parsed = hexToHsvPreserving('#00FF00');
  assert.deepEqual(round([parsed.h, parsed.s, parsed.v]), [120, 100, 100]);
});

test('the brightness band runs black -> colour, with no white in it', () => {
  const band = brightnessBand(0, 100);
  assert.equal(band, 'linear-gradient(to right, #000000, #FF0000)');
  assert.ok(!band.includes('FFFFFF'), 'a brightness band that reaches white is an HSL lightness band');
});

test('the saturation band holds brightness fixed', () => {
  // At B = 50 the desaturated end is mid grey, not white — the HSL version
  // produced hsl(h, 0%, 50%) too, but only because the axes happened to agree
  // at that one value. Check a value where they do not: B = 100.
  assert.equal(saturationBand(0, 100), 'linear-gradient(to right, #FF0000, #FFFFFF)');
  assert.equal(saturationBand(0, 50), 'linear-gradient(to right, #800000, #808080)');
});

test('the hue band walks the wheel at the current saturation and brightness', () => {
  const band = hueBand(100, 100);
  assert.ok(band.startsWith('linear-gradient(to right, #FF0000'), band.slice(0, 60));
  assert.ok(band.endsWith('#FF0000)'), 'the wheel closes on itself');
  assert.equal(band.split('#').length - 1, 13, '13 stops, 30° apart');

  // Dimmed, every stop dims with it — the old HSL band lightened instead.
  assert.ok(hueBand(100, 50).includes('#800000'));
});

test('the alpha band fades the current colour to nothing', () => {
  assert.equal(
    alphaBand(0, 100, 100),
    'linear-gradient(to right, hsla(0, 100%, 50%, 1), hsla(0, 100%, 50%, 0))',
  );
});

test('the SV square layers white across and black up over the pure hue', () => {
  const bg = svSquareBackground(210);
  const layers = bg.split('), ');
  assert.match(layers[0], /to top, #000000/, 'black rises from the bottom');
  assert.match(layers[1], /to right, #FFFFFF/, 'white washes in from the left');
  assert.equal(bg.slice(bg.lastIndexOf(' ') + 1), hsvToHex(210, 100, 100).replace(/^/, '#'));
});
