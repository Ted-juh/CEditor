// svgFillEffects.test.js — a slider fill's material, shadows and bevel as SVG filters on groups
// (utils/svgFillEffects.js): the fill plain, its effects innermost first, and what a group cannot say.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fillEffectsAsSvg } from '../src/CE_Application/utils/svgFillEffects.js';

const material = { _type: 'Material', enabled: true, kind: 'blast' };
const shadow = { enabled: true, type: 'drop', offsetX: 0, offsetY: 3, blur: 4, spread: 0, colour: 'AA000000' };
const effects = ({ mat = false, shadows = [], blend, filters } = {}) => ({
  _type: 'Effects',
  _children: {
    ...(mat ? { Material: material } : {}),
    ...(shadows.length ? { Shadows: { items: shadows } } : {}),
    ...(blend ? { Blend: { mode: blend } } : {}),
    ...(filters ? { Filters: filters } : {}),
  },
});
const background = ({ fill = {}, own = null, layer = null, gradient = false } = {}) => ({
  _children: {
    ...(own ? { Effects: own } : {}),
    Fill: {
      _type: 'Fill', colour: 'FF2A2C30', solidEnabled: true,
      ...(gradient ? { gradientEnabled: true, gradientOpacity: 100, gradient: { type: 'linear', angle: 90, stops: [{ color: 'FFFFFF', position: 0 }, { color: '000000', position: 100 }] } } : {}),
      ...fill,
      _children: { ...(layer ? { SolidEffects: layer } : {}) },
    },
  },
});

test('a lit cap: the fill a plain colour, its material one level', () => {
  const out = fillEffectsAsSvg(background({ own: effects({ mat: true }) }), 74, 74);
  assert.match(out.paint, /^background: #2A2C30FF;/);
  assert.equal(out.levels.length, 1);
  assert.equal(out.levels[0].material.kind, 'blast');
  assert.deepEqual(out.levels[0].shadows, []);
});

test("the layer's effects inside the background's, as BackgroundRenderer nests them", () => {
  const out = fillEffectsAsSvg(background({ own: effects({ shadows: [shadow] }), layer: effects({ mat: true }) }), 74, 74);
  assert.equal(out.levels.length, 2);
  assert.ok(out.levels[0].material, "the layer's material, innermost");
  assert.equal(out.levels[1].shadows.length, 1, "then the background's shadow");
});

test('a colour under a gradient takes its effects too', () => {
  const out = fillEffectsAsSvg(background({ gradient: true, own: effects({ mat: true, shadows: [shadow] }) }), 74, 74);
  assert.equal(out.both, true);
  assert.match(out.paint, /background-color: #2A2C30FF/);
  assert.equal(out.levels.length, 1);
  assert.ok(out.levels[0].material && out.levels[0].shadows.length === 1);
});

test('what a group cannot say is left to BackgroundRenderer', () => {
  assert.equal(fillEffectsAsSvg(background(), 74, 74), null, 'no effects: the plain path');
  assert.equal(fillEffectsAsSvg(background({ own: effects({ mat: true, blend: 'multiply' }) }), 74, 74), null, 'a blend');
  assert.equal(fillEffectsAsSvg(background({ own: effects({ mat: true, filters: { brightness: 120 } }) }), 74, 74), null, 'a CSS filter function');
  assert.equal(fillEffectsAsSvg(background({ gradient: true, layer: effects({ mat: true }) }), 74, 74), null, 'an effect on one layer of two');
  assert.equal(fillEffectsAsSvg(background({ fill: { solidBlend: 'screen' }, own: effects({ mat: true }) }), 74, 74), null, 'a fill that is not plain');
});
