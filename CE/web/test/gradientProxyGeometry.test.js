// The gradient editor's proxy used to be a hand-picked toggle row that
// defaulted to 'rectangle' and never asked the target what it looked like —
// so the box you designed on and the control you painted were different
// shapes. These tests pin the derivation that replaced it.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FALLBACK_GEOMETRY, deriveProxyGeometry, fitProxyBox, scaleCorners,
  proxyShapeCSS, proxyShapeKind,
} from '../src/CE_Application/utils/gradientProxyGeometry.js';

function control(id, name, width, height, corners = null) {
  return {
    _children: {
      Core: { id, name, controlType: 'Fader' },
      Transform: { x: 10, y: 20, width, height },
      Background: { _children: { Corners: corners } },
    },
  };
}

const panel = {
  name: 'Main', width: 800, height: 480,
  controls: [
    control('c1', 'Fader 1', 120, 48, { radius: 6 }),
    {
      _children: {
        Core: { id: 'box', name: 'Group' },
        Transform: { x: 0, y: 0, width: 300, height: 200 },
        Children: { padding: 4, _children: { kid: control('c2', 'Knob 3', 64, 64, { radius: 32 }) } },
      },
    },
  ],
};

test('a control target gives its own width, height and corners', () => {
  const geometry = deriveProxyGeometry({ type: 'control', controlId: 'c1' }, panel);
  assert.equal(geometry.width, 120);
  assert.equal(geometry.height, 48);
  assert.deepEqual(geometry.corners, { radius: 6 });
  assert.equal(geometry.source, 'control');
  assert.equal(geometry.label, 'Fader 1 — 120 × 48');
});

test('a nested control is found too — the target may be inside a container', () => {
  const geometry = deriveProxyGeometry({ type: 'control', controlId: 'c2' }, panel);
  assert.equal(geometry.label, 'Knob 3 — 64 × 64');
  assert.equal(geometry.width, 64);
});

test('no target means the panel — which is what an untargeted gradient paints', () => {
  const geometry = deriveProxyGeometry(null, panel);
  assert.deepEqual([geometry.width, geometry.height, geometry.source], [800, 480, 'panel']);
  assert.equal(geometry.label, 'Main — 800 × 480');

  assert.equal(deriveProxyGeometry({ type: 'panel' }, panel).source, 'panel');
});

test('a target pointing at a control that is gone falls back to the panel', () => {
  const geometry = deriveProxyGeometry({ type: 'control', controlId: 'deleted' }, panel);
  assert.equal(geometry.source, 'panel');
});

test('with no panel at all there is still a generic proxy', () => {
  const geometry = deriveProxyGeometry(null, null);
  assert.deepEqual(geometry, { ...FALLBACK_GEOMETRY });
  assert.equal(geometry.source, 'none');
});

test('a zero or missing size falls back rather than collapsing the preview', () => {
  const broken = { controls: [control('c9', 'Broken', 0, undefined)], width: 0, height: 0 };
  const geometry = deriveProxyGeometry({ type: 'control', controlId: 'c9' }, broken);
  assert.equal(geometry.width, FALLBACK_GEOMETRY.width);
  assert.equal(geometry.height, FALLBACK_GEOMETRY.height);
});

test('fitProxyBox preserves the aspect ratio and reports the scale', () => {
  const box = fitProxyBox({ width: 120, height: 48 }, 400, 300);
  assert.ok(Math.abs(box.width / box.height - 120 / 48) < 0.05, `${box.width}x${box.height}`);
  assert.ok(box.width <= 400 * 0.86 + 1 && box.height <= 300 * 0.86 + 1, 'it fits inside the inset');
  assert.ok(Math.abs(box.scale - box.width / 120) < 0.02);

  // Height-limited rather than width-limited.
  const tall = fitProxyBox({ width: 100, height: 400 }, 400, 200);
  assert.ok(tall.height <= 200 * 0.86 + 1);
  assert.ok(Math.abs(tall.width / tall.height - 0.25) < 0.05);
});

test('fitProxyBox returns nothing to draw before the editor has been measured', () => {
  assert.deepEqual(fitProxyBox({ width: 120, height: 48 }, 0, 0), { width: 0, height: 0, scale: 0 });
});

test('corner radii scale with the preview — a 24px radius is not 24px at quarter size', () => {
  assert.equal(scaleCorners({ radius: 24 }, 0.25).radius, 6);

  const unlinked = scaleCorners({
    linked: false,
    topLeft: { radius: 12, style: 'rounded' },
    bottomRight: { radius: 4, style: 'chamfer' },
  }, 0.5);
  assert.equal(unlinked.topLeft.radius, 6);
  assert.equal(unlinked.bottomRight.radius, 2);
  assert.equal(unlinked.bottomRight.style, 'chamfer', 'everything but the radius is carried through');
  assert.equal(scaleCorners(null, 0.5), null);
});

test('proxyShapeCSS gives the preview the target\'s real outline, scaled', () => {
  const geometry = { width: 240, height: 80, corners: { radius: 12 } };
  const css = proxyShapeCSS(geometry, 120, 40);
  assert.match(css, /border-radius: 6px 6px 6px 6px;/, css);

  // A chamfer cannot be said with border-radius, so the same fillShapeCSS the
  // canvas uses hands back a clip-path instead.
  const chamfered = proxyShapeCSS({ width: 100, height: 100, corners: { radius: 10, style: 'chamfer' } }, 100, 100);
  assert.match(chamfered, /^clip-path: path\(/);

  assert.equal(proxyShapeCSS({ width: 100, height: 100, corners: null }, 100, 100), '');
  assert.equal(proxyShapeCSS(geometry, 0, 0), '');
});

test('proxyShapeKind names the nearest legacy shape for the code that still speaks them', () => {
  const kind = (w, h, corners) => proxyShapeKind({ width: w, height: h, corners });

  assert.equal(kind(120, 48, null), 'rectangle');
  assert.equal(kind(120, 48, { radius: 4 }), 'rectangle');
  // A pill is not an ellipse: its flanks are straight, and calling it one
  // would hand the axis maths the wrong length.
  assert.equal(kind(120, 48, { radius: 24 }), 'rectangle');
  assert.equal(kind(80, 80, { radius: 40 }), 'circle');
  assert.equal(kind(120, 60, { radius: 60 }), 'ellipse');
  // Inward and chamfered corners are not roundness at all.
  assert.equal(kind(80, 80, { radius: 40, direction: 'inward' }), 'rectangle');
  assert.equal(kind(80, 80, { radius: 40, style: 'chamfer' }), 'rectangle');
});

test('an unlinked corner set only counts as round when all four are', () => {
  const corners = {
    linked: false,
    topLeft: { radius: 40 }, topRight: { radius: 40 },
    bottomRight: { radius: 40 }, bottomLeft: { radius: 0 },
  };
  assert.equal(proxyShapeKind({ width: 80, height: 80, corners }), 'rectangle');

  corners.bottomLeft.radius = 40;
  assert.equal(proxyShapeKind({ width: 80, height: 80, corners }), 'circle');
});
