// surfaceTransforms.test.js — the design surface's aids for turned and scaled parts
// (utils/surfaceTransforms.js), and hit zones that follow a turned part.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  arcEnds, arcHandleStyle, arcPointerAngle, followDrawn, moveSnapped, pivotPlacement, screenBounds,
} from '../src/CE_Application/utils/surfaceTransforms.js';
import { partTransform } from '../src/CE_Application/utils/bezierPath.js';
import { resolveCustomHitZoneAtPoint, customHitZoneRect } from '../src/CE_Application/utils/customComponentInteraction.js';

const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} against ${b}`);
const part = (layout = {}) => ({ kind: 'rectangle', _children: { Layout: { x: 100, y: 100, width: 80, height: 40, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', ...layout } } });
const frameOf = (p) => ({ left: p._children.Layout.x, top: p._children.Layout.y, width: p._children.Layout.width, height: p._children.Layout.height });

test('drawn bounds: the layout box upright, the turned and scaled box otherwise', () => {
  const upright = part();
  assert.deepEqual(screenBounds(upright, frameOf(upright), 400, 400), frameOf(upright));
  const turned = part({ rotation: 90, scale: 1.5 });
  const b = screenBounds(turned, frameOf(turned), 400, 400);
  near(b.width, 60, 1e-9, 'a quarter turn swaps the sides, scaled');
  near(b.height, 120, 1e-9, 'and the height');
  near(b.left + b.width / 2, 140, 1e-9, 'about the centre pivot');
});

test('a move snaps what is drawn and moves the box by as much', () => {
  const turned = part({ rotation: 45 });
  const raw = { ...frameOf(turned), left: 103 };
  const snapped = moveSnapped(turned, raw, 400, 400, (drawn) => ({ frame: { ...drawn, left: 100 }, guides: ['g'] }));
  const drawnAfter = screenBounds(turned, snapped.frame, 400, 400);
  near(drawnAfter.left, 100, 1e-9, 'the drawn edge is on the guide');
  assert.equal(snapped.frame.width, raw.width, 'the box keeps its size');
  assert.deepEqual(snapped.guides, ['g']);
  assert.deepEqual(followDrawn({ left: 1, top: 2, width: 3, height: 4 }, { left: 10, top: 10 }, { left: 15, top: 8 }), { left: 6, top: 0, width: 3, height: 4 });
});

test('moving the pivot leaves the part where it is drawn', () => {
  const turned = part({ rotation: 30, scale: 1.4, pivotX: 50, pivotY: 50 });
  const frame = frameOf(turned);
  const before = partTransform(turned, 400, 400);
  const corners = [[frame.left, frame.top], [frame.left + frame.width, frame.top + frame.height]].map(([x, y]) => before.toScreen({ x, y }));
  const target = { x: 150, y: 90 };
  const placed = pivotPlacement(turned, frame, target, 400, 400);
  const moved = part({ rotation: 30, scale: 1.4, x: placed.frame.left, y: placed.frame.top, pivotX: placed.pivotX, pivotY: placed.pivotY });
  const after = partTransform(moved, 400, 400);
  const cornersAfter = [[placed.frame.left, placed.frame.top], [placed.frame.left + frame.width, placed.frame.top + frame.height]].map(([x, y]) => after.toScreen({ x, y }));
  cornersAfter.forEach((p, i) => { near(p.x, corners[i].x, 1e-6, `corner ${i} x`); near(p.y, corners[i].y, 1e-6, `corner ${i} y`); });
  near(after.pivot.x, target.x, 1e-6, 'the pivot is where it was put');
  near(after.pivot.y, target.y, 1e-6, 'the pivot is where it was put');
});

test('arc handles use the renderer\'s compass angles, on the arc\'s centre line', () => {
  const frame = { left: 0, top: 0, width: 100, height: 100 };
  const arc = { startAngle: 0, sweepAngle: 90, thickness: 10 };
  assert.equal(arcHandleStyle(frame, arc, null, 'start'), 'left:42px;top:-3px;', '0° is straight up, on radius 45');
  assert.equal(arcHandleStyle(frame, arc, null, 'end'), 'left:87px;top:42px;', '90° is to the right');
  assert.equal(arcEnds({ startAngle: 0, sweepAngle: 90, direction: 'ccw' }).end, -90, 'a counter-clockwise arc ends the other way');
  const upright = part({ x: 0, y: 0, width: 100, height: 100 });
  near(arcPointerAngle(upright, frame, { x: 50, y: 0 }, 400, 400), 0, 1e-9, 'above the centre is 0°');
  const turned = part({ x: 0, y: 0, width: 100, height: 100, rotation: 90 });
  near(arcPointerAngle(turned, frame, { x: 100, y: 50 }, 400, 400), 0, 1e-9, 'a quarter-turned arc\'s 0° is drawn to the right');
});

test('a hit zone that follows a turned part is turned with it, at run time too', () => {
  const control = {
    _children: {
      Parts: { _children: { knob: part({ x: 100, y: 100, width: 100, height: 20, rotation: 90 }) } },
      HitZones: { _children: { grab: { name: 'grab', enabled: true, source: 'part:knob', shape: 'rectangle' } } },
    },
  };
  const rect = { left: 0, top: 0, width: 400, height: 400 };
  // The bar is drawn vertical, centred on (150, 110): x 140..160, y 60..160.
  assert.equal(resolveCustomHitZoneAtPoint(control, rect, 150, 65)?.name, 'grab', 'the drawn end of the turned bar');
  assert.equal(resolveCustomHitZoneAtPoint(control, rect, 105, 110), null, 'the layout box\'s end, where nothing is drawn');
  const zoneRect = customHitZoneRect(control._children.HitZones._children.grab, rect, control._children.Parts._children);
  assert.deepEqual(zoneRect.turn, { rotation: 90, scale: 1, originX: 150, originY: 110 });
});
