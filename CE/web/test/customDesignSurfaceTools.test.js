import test from 'node:test';
import assert from 'node:assert/strict';

import {
  alignFramesWithinSelection,
  applySmartSnap,
  distributeFramesWithinSelection,
  measurementLinesBetween,
  smartSnapTargets,
} from '../src/CE_Application/utils/customDesignSurfaceGeometry.js';
import {
  buildPastePatch,
  clearPartClipboard,
  getPartClipboard,
  hasPartClipboard,
  setPartClipboard,
} from '../src/CE_Application/utils/customComponentClipboard.js';

test('smartSnapTargets collects part edges/centers plus artboard lines', () => {
  const targets = smartSnapTargets([{ left: 10, top: 20, width: 40, height: 20 }], 200, 100);
  assert.ok(targets.xs.includes(0));
  assert.ok(targets.xs.includes(100)); // artboard center
  assert.ok(targets.xs.includes(200));
  assert.ok(targets.xs.includes(10)); // part left
  assert.ok(targets.xs.includes(30)); // part center
  assert.ok(targets.xs.includes(50)); // part right
  assert.ok(targets.ys.includes(20));
  assert.ok(targets.ys.includes(30));
  assert.ok(targets.ys.includes(40));
});

test('applySmartSnap snaps an edge to the nearest object line within threshold', () => {
  const targets = { xs: [50], ys: [] };
  const raw = { left: 47, top: 33, width: 20, height: 10 };
  const fallback = { left: 40, top: 30, width: 20, height: 10 }; // grid-snapped
  const { frame, guides } = applySmartSnap(raw, fallback, targets, 6);
  // left edge 47 is 3px from the 50 line -> snap x to 50; y falls back to grid.
  assert.equal(frame.left, 50);
  assert.equal(frame.top, 30);
  assert.deepEqual(guides, [{ axis: 'x', value: 50 }]);
});

test('applySmartSnap prefers the closest of edge/center/right matches', () => {
  const targets = { xs: [100], ys: [] };
  // center = 99 (1px away), left = 89 (11px), right = 109 (9px, within threshold 10)
  const raw = { left: 89, top: 0, width: 20, height: 10 };
  const { frame } = applySmartSnap(raw, raw, targets, 10);
  assert.equal(frame.left, 90); // center pulled to 100
});

test('applySmartSnap falls back to the grid frame when nothing is in range', () => {
  const targets = { xs: [500], ys: [400] };
  const raw = { left: 13, top: 27, width: 10, height: 10 };
  const fallback = { left: 10, top: 30, width: 10, height: 10 };
  const { frame, guides } = applySmartSnap(raw, fallback, targets, 6);
  assert.deepEqual(frame, fallback);
  assert.equal(guides.length, 0);
});

test('alignFramesWithinSelection aligns layers inside the selection bounds', () => {
  const entries = [
    ['a', { left: 10, top: 10, width: 20, height: 10 }],
    ['b', { left: 50, top: 40, width: 10, height: 30 }],
  ];
  const left = alignFramesWithinSelection(entries, 'left');
  assert.equal(left.get('a').left, 10);
  assert.equal(left.get('b').left, 10);

  const right = alignFramesWithinSelection(entries, 'right');
  assert.equal(right.get('a').left, 40); // bounds right = 60
  assert.equal(right.get('b').left, 50);

  const centerY = alignFramesWithinSelection(entries, 'centerY');
  // bounds top=10 height=60 -> center 40
  assert.equal(centerY.get('a').top, 35);
  assert.equal(centerY.get('b').top, 25);
});

test('distributeFramesWithinSelection spaces layers with equal gaps', () => {
  const entries = [
    ['a', { left: 0, top: 0, width: 10, height: 10 }],
    ['c', { left: 90, top: 0, width: 10, height: 10 }],
    ['b', { left: 20, top: 0, width: 10, height: 10 }],
  ];
  const result = distributeFramesWithinSelection(entries, 'x');
  assert.equal(result.get('a').left, 0);
  assert.equal(result.get('b').left, 45); // 10 size + 35 gap
  assert.equal(result.get('c').left, 90);
});

test('distributeFramesWithinSelection needs at least three frames', () => {
  const result = distributeFramesWithinSelection([
    ['a', { left: 0, top: 0, width: 10, height: 10 }],
    ['b', { left: 50, top: 0, width: 10, height: 10 }],
  ], 'x');
  assert.equal(result.size, 0);
});

test('measurementLinesBetween reports horizontal and vertical pixel gaps', () => {
  const a = { left: 0, top: 0, width: 20, height: 20 };
  const b = { left: 50, top: 0, width: 20, height: 20 };
  const lines = measurementLinesBetween(a, b);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].axis, 'x');
  assert.equal(lines[0].left, 20);
  assert.equal(lines[0].length, 30);
  assert.equal(lines[0].label, '30px');

  const c = { left: 0, top: 60, width: 20, height: 10 };
  const vertical = measurementLinesBetween(a, c);
  assert.equal(vertical.length, 1);
  assert.equal(vertical[0].axis, 'y');
  assert.equal(vertical[0].top, 20);
  assert.equal(vertical[0].length, 40);
});

test('measurementLinesBetween emits nothing for overlapping frames', () => {
  const a = { left: 0, top: 0, width: 40, height: 40 };
  const b = { left: 20, top: 20, width: 40, height: 40 };
  assert.equal(measurementLinesBetween(a, b).length, 0);
});

test('clipboard stores deep clones and reports state', () => {
  clearPartClipboard();
  assert.equal(hasPartClipboard(), false);
  const part = { name: 'knob', _children: { Layout: { offsetX: 0, offsetY: 0 } } };
  setPartClipboard([part], []);
  part.name = 'mutated';
  assert.equal(hasPartClipboard(), true);
  assert.equal(getPartClipboard().parts[0].name, 'knob');
  clearPartClipboard();
  assert.equal(hasPartClipboard(), false);
});

test('buildPastePatch renames, offsets, stacks, and rewires following zones', () => {
  const payload = {
    parts: [
      { name: 'handle', zIndex: 2, locked: true, _children: { Layout: { offsetX: 4, offsetY: 4 } } },
    ],
    hitZones: [
      { name: 'grab', source: 'part:handle', bounds: { x: 0, y: 0, width: 10, height: 10 } },
      { name: 'face', source: 'face' },
    ],
  };
  const result = buildPastePatch(payload, ['handle'], ['grab'], 7);
  assert.deepEqual(result.partNames, ['handle_copy']);
  const pastedPart = result.patch['Parts.handle_copy'];
  assert.equal(pastedPart.zIndex, 8);
  assert.equal(pastedPart.locked, false);
  assert.equal(pastedPart._children.Layout.offsetX, 16);
  const pastedZone = result.patch['HitZones.grab_copy'];
  assert.equal(pastedZone.source, 'part:handle_copy');
  assert.equal(result.patch['HitZones.face_copy'].source, 'face');
});

test('buildPastePatch avoids name collisions against existing names', () => {
  const payload = { parts: [{ name: 'dot', _children: {} }], hitZones: [] };
  const result = buildPastePatch(payload, ['dot', 'dot_copy'], [], 0);
  assert.deepEqual(result.partNames, ['dot_copy_2']);
});

test('buildPastePatch returns null for an empty clipboard payload', () => {
  assert.equal(buildPastePatch({ parts: [] }, [], [], 0), null);
  assert.equal(buildPastePatch(null, [], [], 0), null);
});
