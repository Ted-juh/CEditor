// bezierPath.test.js — editing a flattened / smoothed path anchor by anchor (utils/bezierPath.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  insertAnchor, isSmooth, modelBounds, modelFromPart, moveAnchor, moveHandle, nearestOnOutline,
  parsePathData, partTransform, patchFromModel, removeAnchor, serializePathData, toggleAnchor,
} from '../src/CE_Application/utils/bezierPath.js';
import { loadGeometry } from '../src/CE_Application/utils/partOutlines.js';
import { applyPartPatch } from '../src/CE_Application/utils/partBooleans.js';

const area = async (data) => {
  const { scope } = await loadGeometry();
  const item = new scope.CompoundPath({ pathData: data, insert: false });
  item.fillRule = 'evenodd';
  return Math.abs(item.area);
};
const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} against ${b}`);
const part = (pathData, layout = {}) => ({
  kind: 'path',
  meta: { pathData, closed: true },
  _children: { Layout: { x: 10, y: 20, width: 100, height: 50, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', ...layout } },
});

// What Paper.js writes for a plate with a round hole (relative, shorthand, curves back to the start).
const PLATE = 'M0,0h1v1h-1zM0.25,0.5c0,0.13807 0.11193,0.25 0.25,0.25c0.13807,0 0.25,-0.11193 0.25,-0.25c0,-0.13807 -0.11193,-0.25 -0.25,-0.25c-0.13807,0 -0.25,0.11193 -0.25,0.25z';

test('parses what Paper.js writes, and writes it back as the same outline', async () => {
  const model = parsePathData(PLATE);
  assert.equal(model.length, 2, 'an outline and a hole');
  assert.deepEqual(model.map((s) => [s.closed, s.nodes.length]), [[true, 4], [true, 4]], 'the closing curve merges into the first anchor');
  assert.ok(model[1].nodes.every(isSmooth), 'a circle is smooth all round');
  near(await area(serializePathData(model)), await area(PLATE), 1e-4, 'same area');
});

test('every command: relative, shorthand, quadratic and arc', async () => {
  const s = parsePathData('M0 0 H10 V10 h-10 z m20 0 q5 10 10 0 t10 0 s5 -10 10 0 Z M50 0 A5 5 0 0 1 60 0 L60 5 Z');
  assert.equal(s.length, 3);
  const q = parsePathData('M0 0 Q5 10 10 0');
  const cubic = q[0].nodes;
  near(cubic[0].out.y, 20 / 3, 1e-9, 'a quadratic raised to a cubic exactly');
  const arc = parsePathData('M0 0 A10 10 0 0 1 20 0 Z');
  near(await area(serializePathData(arc)), Math.PI * 50, 0.05, 'a half disc from an arc');
});

test('bounds are the curves\' own, not the handles\'', () => {
  const b = modelBounds(parsePathData('M0 0 C0 10 10 10 10 0'));
  near(b.height, 7.5, 1e-9, 'the curve peaks at 3/4 of its handles');
  assert.equal(b.width, 10);
});

test('inserting an anchor splits the curve without changing it', async () => {
  const model = parsePathData(PLATE);
  const before = await area(serializePathData(model));
  // Between two of the circle's anchors, not on one.
  const hit = nearestOnOutline(model, { x: 0.68, y: 0.68 });
  assert.equal(hit.subpath, 1);
  const next = insertAnchor(model, hit.subpath, hit.segment, hit.t);
  assert.equal(next[1].nodes.length, 5);
  near(await area(serializePathData(next)), before, 1e-4, 'same outline');
  assert.ok(isSmooth(next[1].nodes[hit.segment + 1]), 'the new anchor is smooth on a curve');
  const straight = insertAnchor(model, 0, 0, 0.5);
  assert.deepEqual([straight[0].nodes[1].x, straight[0].nodes[1].in], [0.5, null], 'and sharp on a straight side');
});

test('moving: anchors carry their handles; a smooth handle turns its partner, Alt breaks it', () => {
  const model = parsePathData(PLATE);
  const moved = moveAnchor(model, 1, 0, { x: 0.3, y: 0.5 });
  assert.deepEqual([moved[1].nodes[0].in.x - moved[1].nodes[0].x, moved[1].nodes[0].out.x - moved[1].nodes[0].x],
    [model[1].nodes[0].in.x - model[1].nodes[0].x, model[1].nodes[0].out.x - model[1].nodes[0].x]);
  const node = model[1].nodes[0];
  const turned = moveHandle(model, 1, 0, 'out', { x: node.x + 0.1, y: node.y + 0.1 });
  assert.ok(isSmooth(turned[1].nodes[0]), 'still smooth');
  const lengthBefore = Math.hypot(node.in.x - node.x, node.in.y - node.y);
  const n = turned[1].nodes[0];
  near(Math.hypot(n.in.x - n.x, n.in.y - n.y), lengthBefore, 1e-9, 'the partner keeps its length');
  const broken = moveHandle(model, 1, 0, 'out', { x: node.x + 0.1, y: node.y + 0.1 }, { independent: true });
  assert.equal(isSmooth(broken[1].nodes[0]), false);
  assert.deepEqual(broken[1].nodes[0].in, node.in, 'the partner stays put');
  assert.equal(parsePathData(PLATE) === model, false);
  assert.deepEqual(model, parsePathData(PLATE), 'edits never write into the model given');
});

test('removing anchors; the last ones of a hole remove the hole; toggling corner and smooth', () => {
  const model = parsePathData(PLATE);
  assert.equal(removeAnchor(model, 1, 0)[1].nodes.length, 3);
  const twoLeft = removeAnchor(removeAnchor(model, 1, 0), 1, 0);
  assert.equal(twoLeft[1].nodes.length, 2);
  assert.equal(removeAnchor(twoLeft, 1, 0).length, 1, 'the hole is gone');
  const lone = removeAnchor(removeAnchor([model[0]], 0, 0), 0, 0);
  assert.equal(lone[0].nodes.length, 2);
  assert.equal(removeAnchor(lone, 0, 0), lone, 'the only outline is never removed');
  const sharp = toggleAnchor(model, 1, 0);
  assert.deepEqual([sharp[1].nodes[0].in, sharp[1].nodes[0].out], [null, null]);
  const round = toggleAnchor(sharp, 1, 0);
  assert.ok(isSmooth(round[1].nodes[0]));
});

test('patching the part: the box fits the outline, the path is re-expressed in it', async () => {
  const p = part(PLATE);
  const model = modelFromPart(p, 400, 400);
  assert.deepEqual([model[0].nodes[2].x, model[0].nodes[2].y], [110, 70], 'artboard coordinates');
  const grown = moveAnchor(model, 0, 2, { x: 130, y: 90 });
  const patch = patchFromModel(p, grown, 400, 400);
  assert.deepEqual([patch['Layout.x'], patch['Layout.y'], patch['Layout.width'], patch['Layout.height']], [10, 20, 120, 70]);
  const next = applyPartPatch(p, patch);
  const again = modelFromPart(next, 400, 400);
  assert.deepEqual([again[0].nodes[2].x, again[0].nodes[2].y], [130, 90], 'the anchor is where it was dragged');
  near(again[1].nodes[0].x, model[1].nodes[0].x, 1e-3, 'the hole did not move');
  assert.equal(patch['Layout.pivotX'], undefined, 'an unturned part keeps its pivot as it is');
});

test('a turned part keeps its pivot on the same spot, so nothing else swings', () => {
  const p = part(PLATE, { rotation: 30, scale: 1.5 });
  const { toScreen } = partTransform(p, 400, 400);
  const model = modelFromPart(p, 400, 400);
  const holeBefore = toScreen(model[1].nodes[1]);
  const next = applyPartPatch(p, patchFromModel(p, moveAnchor(model, 0, 2, { x: 150, y: 110 }), 400, 400));
  const after = modelFromPart(next, 400, 400);
  const holeAfter = partTransform(next, 400, 400).toScreen(after[1].nodes[1]);
  near(holeAfter.x, holeBefore.x, 0.05, 'x on screen');
  near(holeAfter.y, holeBefore.y, 0.05, 'y on screen');
  const { fromScreen } = partTransform(p, 400, 400);
  const round = fromScreen(toScreen({ x: 33, y: 44 }));
  near(round.x, 33, 1e-9, 'fromScreen undoes toScreen');
});

test('the Pen\'s point form, turned: moving one point leaves the others where they are drawn', async () => {
  const { movePathPoint, pathPointsInArtboard } = await import('../src/CE_Application/utils/penPath.js');
  const { withPivotKept } = await import('../src/CE_Application/utils/bezierPath.js');
  const pen = {
    kind: 'path',
    meta: { vectorPoints: [[0, 1], [0.5, 0], [1, 1]], closed: true },
    _children: { Layout: { x: 20, y: 20, width: 60, height: 40, xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', rotation: 40, scale: 1.25 } },
  };
  const onScreen = (part) => pathPointsInArtboard(part, 400, 400).map(([x, y]) => partTransform(part, 400, 400).toScreen({ x, y }));
  const before = onScreen(pen);
  const patch = withPivotKept(pen, movePathPoint(pen, 1, { x: 50, y: 5 }, 400, 400), 400, 400);
  assert.ok(patch['Layout.pivotX'] !== undefined, 'the pivot is moved with the box');
  const after = onScreen(applyPartPatch(pen, patch));
  for (const index of [0, 2]) {
    near(after[index].x, before[index].x, 0.05, `point ${index} x`);
    near(after[index].y, before[index].y, 0.05, `point ${index} y`);
  }
  assert.equal(withPivotKept({ ...pen, _children: { Layout: { ...pen._children.Layout, rotation: 0, scale: 1 } } }, { 'Layout.x': 1, 'Layout.y': 1, 'Layout.width': 5, 'Layout.height': 5 }, 400, 400)['Layout.pivotX'], undefined, 'an unturned part is left alone');
});
