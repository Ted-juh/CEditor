import test from 'node:test';
import assert from 'node:assert/strict';

import { plainBorderCSS, whyBorderNotPlainCSS } from '../src/CE_Application/utils/plainBorderCSS.js';
import { buildBorderSegments } from '../src/CE_Application/utils/borderSegments.js';

const solid = (over = {}) => ({
  enabled: true, linked: true, style: 'solid', thickness: 2, colour: 'FFFFFFFF', ...over,
});
const square = { linked: true, radius: 0, style: 'rounded', direction: 'outward', borderEnabled: true };
const round = (radius, over = {}) => ({ ...square, radius, ...over });

const css = (border, corners, w = 100, h = 60) => plainBorderCSS(border, corners, w, h);
const decl = (style, prop) => {
  const found = String(style).split(';').map((s) => s.trim()).find((s) => s.startsWith(`${prop}:`));
  return found ? found.slice(prop.length + 1).trim() : null;
};

/* ------------------------------------------------------------------ accepted */

test('a uniform solid border becomes one CSS declaration', () => {
  const style = css(solid({ thickness: 3, colour: 'FF556677' }), square);
  assert.equal(decl(style, 'border'), '3px solid #556677FF');
  assert.equal(decl(style, 'box-sizing'), 'border-box');
  assert.equal(decl(style, 'position'), 'absolute');
  // Never eat clicks: the SVG it replaces is pointer-events:none too.
  assert.equal(decl(style, 'pointer-events'), 'none');
  assert.equal(decl(style, 'border-radius'), null);
});

test('alpha survives, because border colours are stored alpha-first', () => {
  // The bug this guards: `66FFFFFF` is a 40% white hairline. Read as plain RGB it paints solid
  // white, which reads as every control outlined in marker pen.
  assert.equal(decl(css(solid({ colour: '66FFFFFF' }), square), 'border'), '2px solid #FFFFFF66');
});

test('a six-digit colour is taken as opaque', () => {
  assert.equal(decl(css(solid({ colour: '112233' }), square), 'border'), '2px solid #112233');
});

test('rounded corners become border-radius, in tl tr br bl order', () => {
  const corners = {
    linked: false,
    topLeft: round(4), topRight: round(8), bottomRight: round(12), bottomLeft: round(0),
  };
  assert.equal(decl(css(solid(), corners), 'border-radius'), '4px 8px 12px 0px');
});

test('radius clamps to half the shorter side, as both renderers do', () => {
  // Round shapes store radius: 999 to mean "fully round". On 40x100 that is 20, not 999.
  assert.equal(decl(css(solid(), round(999), 40, 100), 'border-radius'), '20px 20px 20px 20px');
});

test('thickness 0 on an enabled border still draws 2px, matching the SVG', () => {
  // Not a rounding-up choice here: getSideStrokes reads `thickness || 2`, so the canvas genuinely
  // paints a 2px line for a border stored at 0. Honouring the 0 would erase a visible outline.
  const segments = buildBorderSegments(100, 60, solid({ thickness: 0 }), square);
  assert.equal(segments.find((s) => s.kind === 'side')?.thick, 2);
  assert.equal(decl(css(solid({ thickness: 0 }), square), 'border'), '2px solid #FFFFFFFF');
});

test('a fill under the border is irrelevant — only the outline is asked about', () => {
  // The whole reason this is a border test and not a background test: a gradient-filled box with a
  // hairline outline still gets the cheap path.
  assert.ok(css(solid(), square));
  assert.equal(whyBorderNotPlainCSS(solid(), square), null);
});

/* ------------------------------------------------------------------ refused */

test('refusals name what CSS cannot draw', () => {
  const cases = [
    [solid({ enabled: false }), square, 'no border'],
    [solid({ linked: false, top: { style: 'solid', thickness: 2 } }), square, 'per-side border'],
    [solid({ style: 'dashed' }), square, 'border style "dashed"'],
    [solid({ style: 'dotted' }), square, 'border style "dotted"'],
    [solid({ style: 'double' }), square, 'border style "double"'],
    [solid({ style: 'groove' }), square, 'border style "groove"'],
    [solid({ style: 'ridge' }), square, 'border style "ridge"'],
    [solid({ style: 'inset' }), square, 'border style "inset"'],
    [solid({ style: 'outset' }), square, 'border style "outset"'],
    [solid({ fillGradient: true }), square, 'gradient border fill'],
    [solid({ fillImage: true }), square, 'image border fill'],
    [solid({ fillOverlay: true }), square, 'overlay border fill'],
    [solid({ fillSolid: false }), square, 'solid border fill switched off'],
    [solid(), round(6, { style: 'chamfer' }), 'corner style "chamfer"'],
    [solid(), round(6, { style: 'notch' }), 'corner style "notch"'],
    [solid(), round(6, { direction: 'inward' }), 'inward corners'],
  ];
  for (const [border, corners, why] of cases) {
    assert.equal(whyBorderNotPlainCSS(border, corners), why);
    assert.equal(plainBorderCSS(border, corners, 100, 60), null, why);
  }
});

test('a corner with its border switched off is a gap CSS cannot open', () => {
  // borderSegments omits that arc entirely, leaving four detached sides.
  const corners = {
    linked: false,
    topLeft: round(6, { borderEnabled: false }), topRight: round(6),
    bottomRight: round(6), bottomLeft: round(6),
  };
  assert.equal(whyBorderNotPlainCSS(solid(), corners), 'corner border off (tl)');
});

test('a square corner still refuses a non-rounded STYLE only when it has a radius', () => {
  // radius 0 means the style is inert — chamfering nothing is nothing.
  assert.equal(whyBorderNotPlainCSS(solid(), round(0, { style: 'chamfer' })), null);
});

test('a zero-sized box gets no CSS, so nothing paints on a collapsed control', () => {
  assert.equal(plainBorderCSS(solid(), square, 0, 60), null);
  assert.equal(plainBorderCSS(solid(), square, 100, 0), null);
});

/* ------------------------------------------------- the geometry claim, in numbers */

test('the SVG corner arc is a radius too fat, and this is the pin for it', () => {
  // A KNOWN, MEASURED DISAGREEMENT, recorded here rather than left to be rediscovered.
  //
  // cornerPaths.buildCornerPath draws a rounded outward corner as an arc of radius `R + tBase - i`
  // — which with the solid-stroke inset `i = tBase = thickness / 2` comes to R, centred at
  // (R + t, R + t). Its painted band therefore runs out to radius R + thickness/2, so the OUTER
  // curve is half a border thickness rounder than the radius anybody authored.
  //
  // Three things say that is the bug and not the baseline:
  //   - the fill underneath is clipped at `border-radius: R` (BackgroundRenderer.fillCornerCSS),
  //     so the stroke overhangs its own fill at every rounded corner;
  //   - partsToSvg.boxElement already draws the same box with `strokeRadius = radius - inset`,
  //     the correct reading, so a baked control and a live one differ today;
  //   - CSS, which is what this file emits, narrows a radius under a border the same way.
  //
  // Fixing borderSegments means reworking sideInset and the 1px anti-aliasing overlap along with
  // it, so it is deliberately NOT bundled into a performance change. Until it is fixed, a solid
  // border and a dashed one on the same panel round their corners differently by thickness/2 —
  // 0.5px on the GAIA panel's hairlines. When someone does fix it, this test fails and says where.
  const border = solid({ thickness: 8 });
  const corners = round(20);
  const arc = buildBorderSegments(80, 60, border, corners).find((s) => s.kind === 'corner' && s.pos === 'tl');
  const [, sweepRadius] = String(arc.d).match(/A\s+(\S+)\s+(\S+)/).map(Number);

  const svgOuterRadius = sweepRadius + arc.thick / 2;
  const cssOuterRadius = parseFloat(decl(css(border, corners, 80, 60), 'border-radius'));

  assert.equal(cssOuterRadius, 20, 'CSS rounds at the authored radius');
  assert.equal(svgOuterRadius, 24, 'the SVG rounds at radius + thickness/2');
  assert.equal(svgOuterRadius - cssOuterRadius, border.thickness / 2);
});

test('the CSS band covers exactly the pixels the SVG stroke covers', () => {
  // The safety argument in one assertion. buildBorderSegments strokes the top side along a
  // centreline at thickness/2 with stroke-width thickness, so its paint runs from y=0 to
  // y=thickness — which is where box-sizing:border-box puts a CSS border of the same width.
  for (const thickness of [1, 2, 3, 4, 8]) {
    const segments = buildBorderSegments(100, 60, solid({ thickness }), square);
    const top = segments.find((s) => s.kind === 'side' && s.key === 'top');
    const centreline = parseFloat(String(top.d).match(/M\s+\S+\s+(\S+)/)[1]);
    assert.equal(top.thick, thickness);
    assert.equal(centreline - top.thick / 2, 0, `outer edge at thickness ${thickness}`);
    assert.equal(centreline + top.thick / 2, thickness, `inner edge at thickness ${thickness}`);
    assert.equal(decl(css(solid({ thickness }), square), 'border'), `${thickness}px solid #FFFFFFFF`);
  }
});
