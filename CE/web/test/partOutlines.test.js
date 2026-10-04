// partOutlines.test.js — every part kind as exact geometry (utils/partOutlines.js), checked against
// the area the renderer's own rules give, plus the border bands (utils/outlineBorder.js), the SVG
// path scaler, and the parts refused because nothing fixed draws them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { boxPathData, loadGeometry, partOutline, paintsBox, whyNoOutline } from '../src/CE_Application/utils/partOutlines.js';
import { outlineBorderBands, outlineBorderDepth, outlineInsetDepths } from '../src/CE_Application/utils/outlineBorder.js';
import { scalePathData } from '../src/CE_Application/utils/svgPathScale.js';

const L = (x, y, width, height, extra = {}) => ({ Layout: { x, y, width, height, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', ...extra } });
const corners = (style, extra = {}) => ({ Background: { _children: { Corners: { linked: true, radius: 10, style, ...extra } } } });
const PI = Math.PI;

async function area(part, parent = 400) {
  const geo = await loadGeometry();
  const item = await partOutline(geo, part, parent, parent);
  return item ? Math.abs(item.area) : 0;
}
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} against ${expected}`);

test('every corner style, one radius or four, as the fill is clipped', async () => {
  near(await area({ kind: 'rectangle', _children: { ...L(0, 0, 100, 50) } }), 5000, 0.01, 'square');
  near(await area({ kind: 'rectangle', _children: { ...L(0, 0, 100, 50), ...corners('chamfer') } }), 5000 - 4 * 50, 0.01, 'chamfer');
  near(await area({ kind: 'rectangle', _children: { ...L(0, 0, 100, 50), ...corners('notch') } }), 5000 - 4 * 100, 0.01, 'notch');
  near(await area({ kind: 'rectangle', _children: { ...L(0, 0, 100, 50), ...corners('rounded', { direction: 'inward' }) } }), 5000 - PI * 100, 0.5, 'inward round');
  near(await area({ kind: 'rectangle', _children: { ...L(0, 0, 100, 50), ...corners('rounded', { radius: 999 }) } }), 2500 + PI * 625, 1, 'radii scaled down together, as CSS does');
  const mixed = { Background: { _children: { Corners: { linked: false, topLeft: { radius: 10, style: 'chamfer' }, topRight: { radius: 10, style: 'notch' }, bottomRight: { radius: 10, style: 'rounded' }, bottomLeft: { radius: 0 } } } } };
  near(await area({ kind: 'rectangle', _children: { ...L(0, 0, 100, 50), ...mixed } }), 5000 - 50 - 100 - (100 - PI * 25), 0.5, 'a style per corner');
  assert.match(boxPathData(null, 10, 10), /^M 0 0/);
});

test('stadiums, lines, arcs and open paths as the renderer paints them', async () => {
  near(await area({ kind: 'circle', _children: { ...L(0, 0, 50, 50) } }), PI * 625, 1, 'circle');
  near(await area({ kind: 'capsule', _children: { ...L(0, 0, 100, 40) } }), 60 * 40 + PI * 400, 1, 'capsule');
  near(await area({ kind: 'line', _children: { ...L(0, 0, 100, 10), Background: { _children: { Border: { enabled: true, thickness: 4 } } } } }), 400 + PI * 4, 0.5, 'line with round caps');
  const arc = (extra) => ({ kind: 'arcTrack', meta: { arcTrack: { thickness: 10, sweepAngle: 180, startAngle: -90, ...extra } }, _children: { ...L(0, 0, 100, 100) } });
  near(await area(arc({})), PI * 900 / 2, 1, 'arc, butt ends');
  near(await area(arc({ cap: 'round' })), PI * 900 / 2 + PI * 25, 1, 'arc, round ends');
  near(await area(arc({ sweepAngle: 360 })), PI * 900, 1, 'a full ring');
  near(await area({ kind: 'path', meta: { closed: false, vectorPoints: [[0, 0], [1, 0], [1, 1]] }, _children: { ...L(0, 0, 100, 100) } }), 196 * 2 + PI, 1, 'open path stroke');
  const ray = Math.hypot(50, 50);
  near(await area({ kind: 'valueArc', meta: { valueArc: { thickness: 10, value: 1, sweepAngle: 360 } }, _children: { ...L(0, 0, 100, 100) } }),
    PI * ((ray / 2 + 1) ** 2 - (ray / 2 - 10) ** 2), 2, 'value arc, sized as its CSS mask is');
});

test('turned and scaled about the pivot', async () => {
  const geo = await loadGeometry();
  const item = await partOutline(geo, { kind: 'rectangle', _children: { ...L(0, 0, 100, 50, { rotation: 90, scale: 0.5 }) } }, 400, 400);
  near(Math.abs(item.area), 1250, 0.01, 'area scaled');
  near(item.bounds.width, 25, 0.01, 'turned a quarter');
  near(item.bounds.height, 50, 0.01, 'turned a quarter');
  near(item.bounds.center.x, 50, 0.01, 'about the centre');
});

test('text is its glyphs, and the box only when the box is painted', async () => {
  const text = (background) => ({ kind: 'rectangle', _children: { ...L(0, 0, 200, 40), ...(background ? { Background: background } : {}), Text: { content: 'Hi', _children: { Font: { family: 'Rubik', size: 20 } } } } });
  const glyphs = await area(text(null));
  assert.ok(glyphs > 20 && glyphs < 400, `glyph area ${glyphs}`);
  assert.equal(paintsBox(text({ _children: { Fill: { colour: '00000000' } } })), false, 'a transparent fill paints nothing');
  const boxed = await area(text({ _children: { Fill: { colour: 'FF101010' } } }));
  near(boxed, 8000, 0.5, 'a painted box already covers its text');
});

test('refused by name: parts drawn live by their own renderer', () => {
  assert.match(whyNoOutline({ kind: 'sliderControl' }), /slider/);
  assert.match(whyNoOutline({ kind: 'envelopePath' }), /envelope/);
  assert.match(whyNoOutline({ kind: 'rectangle', meta: { renderer: 'waveformIcon' } }), /waveform/);
  assert.equal(whyNoOutline({ kind: 'rectangle' }), '');
});

test('borders along an outline: bands inward, by the box border arithmetic', () => {
  const border = (style, extra = {}) => ({ enabled: true, linked: true, thickness: 4, colour: 'FF808080', style, ...extra });
  assert.deepEqual(outlineBorderBands(border('solid')).map(({ from, to }) => [from, to]), [[0, 4]]);
  assert.deepEqual(outlineBorderBands(border('groove')).map(({ from, to }) => [from, to]), [[0, 2], [2, 4]], 'two half bands');
  const [outer, inner] = outlineBorderBands(border('ridge'));
  assert.notEqual(outer.colour, inner.colour);
  assert.deepEqual(outlineBorderBands(border('double', { doubleGap: 6 })).map(({ from, to }) => [from, to]), [[0, 4], [6, 10]], 'the inner ring a gap further in');
  assert.deepEqual(outlineBorderBands(border('inset')).map((band) => band.facing), ['upLeft', 'downRight']);
  const dotted = outlineBorderBands(border('dotted', { dotRadius: 3 }))[0];
  assert.deepEqual(dotted.dots, { radius: 3, depth: 3 }, 'dots centred one radius in');
  assert.deepEqual(outlineInsetDepths({ _children: { Border: border('dotted', { dotRadius: 3 }) } }), [3]);
  assert.equal(outlineBorderDepth(border('double', { doubleGap: 6 })), 10);
  assert.deepEqual(outlineInsetDepths({ _children: { Border: border('solid'), Fill: { imageClipMode: 'border-inner' } } }), [4], 'a fill kept inside the border');
  const perSide = { enabled: true, linked: false, top: { thickness: 2, style: 'solid' }, left: { thickness: 5, style: 'dashed' } };
  assert.equal(outlineBorderBands(perSide)[0].to, 5, 'per side: the thickest side, since an outline has no sides');
  assert.deepEqual(outlineBorderBands({ enabled: false }), []);
});

test('SVG path data scales exactly, relative and shorthand commands included', () => {
  assert.equal(scalePathData('M0,0h1v1h-1z', 100, 50), 'M 0 0 h 100 v 50 h -100 z');
  assert.equal(scalePathData('M0.5 0 c0 0.25 0.5 0.5 0.5 1 A0.5 0.5 0 0 1 0 0.5', 10, 20), 'M 5 0 c 0 5 5 10 5 20 A 5 10 0 0 1 0 10');
  assert.equal(scalePathData('M0 0 1 1 2 0', 2, 2), 'M 0 0 2 2 4 0', 'implicit linetos after a moveto');
});
