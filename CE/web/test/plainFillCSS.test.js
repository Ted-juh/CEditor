import test from 'node:test';
import assert from 'node:assert/strict';

import { fillShapeCSS, plainFillCSS, whyFillNotPlainCSS } from '../src/CE_Application/utils/plainFillCSS.js';

const bg = (fill, corners = null, mode) => ({
  ...(mode === undefined ? {} : { mode }),
  _children: { Fill: { _type: 'Fill', ...fill }, ...(corners ? { Corners: corners } : {}) },
});
const solid = (over = {}) => bg({ colour: 'FF3A3A3A', solidEnabled: true, ...over });
const css = (background, w = 100, h = 60) => plainFillCSS(background, w, h);
const decl = (style, prop) => {
  const found = String(style).split(';').map((s) => s.trim()).find((s) => s.startsWith(`${prop}:`));
  return found ? found.slice(prop.length + 1).trim() : null;
};

/* ------------------------------------------------------------------ accepted */

test('a flat colour becomes one background declaration', () => {
  assert.equal(decl(css(solid()), 'background'), '#3A3A3AFF');
  assert.equal(whyFillNotPlainCSS(solid()), null);
});

test('alpha rides in the colour, never in opacity', () => {
  // The renderer writes a translucent solid as `background:#RRGGBB; opacity:0.4` on a div of its
  // own. On the wrapper, `opacity` would fade the control's text, parts and border along with it.
  const style = css(solid({ colour: '663A3A3A' }));
  assert.equal(decl(style, 'background'), '#3A3A3A66');
  assert.equal(decl(style, 'opacity'), null);
});

test('a six-digit colour is taken as opaque', () => {
  assert.equal(decl(css(solid({ colour: '3A3A3A' })), 'background'), '#3A3A3A');
});

test('rounded corners come through as a border-radius', () => {
  const corners = { linked: true, radius: 6, style: 'rounded', direction: 'outward' };
  const style = css(bg({ colour: 'FF3A3A3A', solidEnabled: true }, corners));
  assert.equal(decl(style, 'border-radius'), '6px 6px 6px 6px');
});

test('a single gradient layer is one background too', () => {
  const gradient = { type: 'linear', angle: 90, stops: [{ color: 'FF0000', position: 0 }, { color: '0000FF', position: 100 }] };
  const style = css(bg({ solidEnabled: false, gradientEnabled: true, gradient }));
  assert.match(decl(style, 'background') ?? '', /gradient/);
});

test('the legacy spelling is read the way the renderer reads it', () => {
  // No `solidEnabled` anywhere: `Background.mode` decides, and `mode: 'none'` means the OVERLAY
  // layer, not "nothing". Guessing here paints an opaque rectangle over a transparent control.
  assert.equal(whyFillNotPlainCSS(bg({ colour: 'FF3A3A3A' }, null, 'solid')), null);
  assert.equal(whyFillNotPlainCSS(bg({ colour: 'FF3A3A3A' }, null, 'none')), 'overlay fill layer');
  assert.equal(whyFillNotPlainCSS(bg({ colour: 'FF3A3A3A' }, null, 'gradient')), 'gradient layer with no gradient');
});

/* ------------------------------------------------------------------ refused */

test('refusals name what one declaration cannot say', () => {
  const gradient = { type: 'linear', angle: 90, stops: [{ color: 'FF0000', position: 0 }] };
  const cases = [
    [bg({ solidEnabled: false }), 'nothing painting'],
    [bg({ solidEnabled: true, gradientEnabled: true, gradient }), '2 fill layers'],
    [bg({ solidEnabled: false, imageEnabled: true, imageSrc: 'x.png' }), 'image fill layer'],
    [bg({ solidEnabled: false, overlayEnabled: true, overlaySrc: 'x.png' }), 'overlay fill layer'],
    [solid({ solidBlend: 'multiply' }), 'solid blend mode "multiply"'],
    [solid({ solidClipMode: 'border-inner' }), 'solid clip mode "border-inner"'],
    [solid({ colour: 'nonsense' }), 'unreadable fill colour'],
    [bg({ solidEnabled: false, gradientEnabled: true, gradient, gradientOpacity: 50 }), 'gradient opacity'],
  ];
  for (const [background, why] of cases) {
    assert.equal(whyFillNotPlainCSS(background), why);
    assert.equal(plainFillCSS(background, 100, 60), null, why);
  }
});

test('a muted or unsoloed layer counts as not painting', () => {
  assert.equal(whyFillNotPlainCSS(solid({ solidMuted: true })), 'nothing painting');
  assert.equal(whyFillNotPlainCSS(solid({ soloLayer: 'gradient' })), 'nothing painting');
});

test('solo picks the one layer out of two', () => {
  // Two layers enabled but one soloed is a SINGLE visible layer, and refusing it would leave the
  // commonest way to preview a gradient paying for a div.
  const gradient = { type: 'linear', angle: 0, stops: [{ color: 'FF0000', position: 0 }, { color: '00FF00', position: 100 }] };
  const background = bg({ colour: 'FF3A3A3A', solidEnabled: true, gradientEnabled: true, gradient, soloLayer: 'solid' });
  assert.equal(whyFillNotPlainCSS(background), null);
  assert.equal(decl(css(background), 'background'), '#3A3A3AFF');
});

test('a corner that needs a clip-path keeps its own element', () => {
  // A border-radius reshapes only an overflow clip; a clip-path clips the CHILDREN too — the
  // control's text, its parts, its border. So the shape is still emitted for the layered path,
  // and the absorbed path refuses it.
  for (const style of ['chamfer', 'notch']) {
    const corners = { linked: true, radius: 8, style, direction: 'outward' };
    assert.match(fillShapeCSS(corners, 100, 60), /clip-path/, style);
    assert.equal(whyFillNotPlainCSS(bg({ colour: 'FF3A3A3A', solidEnabled: true }, corners)), 'corners need a clip-path');
  }
  const inward = { linked: true, radius: 8, style: 'rounded', direction: 'inward' };
  assert.equal(whyFillNotPlainCSS(bg({ colour: 'FF3A3A3A', solidEnabled: true }, inward)), 'corners need a clip-path');
});

test('a zero-sized box gets nothing', () => {
  assert.equal(plainFillCSS(solid(), 0, 60), null);
  assert.equal(plainFillCSS(solid(), 100, 0), null);
});

/* ------------------------------------------------------------ shape agreement */

test('fillShapeCSS leaves overflowing radii to CSS, as the layered path does', () => {
  // NOT clamped on purpose. CSS clamps overflowing radii itself, and clamping early would make an
  // absorbed fill disagree with a layered one on the same panel — the exact drift this function
  // is shared to prevent.
  const corners = { linked: true, radius: 999, style: 'rounded', direction: 'outward' };
  assert.equal(fillShapeCSS(corners, 40, 20), 'border-radius: 999px 999px 999px 999px;');
});

test('square corners produce no shape at all', () => {
  assert.equal(fillShapeCSS({ linked: true, radius: 0 }, 100, 60), '');
  assert.equal(fillShapeCSS(null, 100, 60), '');
});
