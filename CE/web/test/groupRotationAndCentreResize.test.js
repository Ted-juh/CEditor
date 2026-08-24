// Group rotation and resize-from-centre — the two gestures the multi-selection
// bounding box was missing.
//
// Rotation was finished for a SINGLE control (rotated resize, rotated
// hit-testing, the angle HUD) and then stopped there: CanvasControl suppresses
// its handles and its rotate zones the moment a second control is selected, and
// the group box only ever had 8 resize handles. So a multi-selection could not
// be rotated at all, by any gesture. Resize-from-centre did not exist for
// either the group box or a single control — the resize maths anchored the
// opposite edge and nothing read Alt.
//
// The gesture handlers cannot be driven here (no DOM in the node suite), so the
// arithmetic they call is tested directly and the wiring is checked through the
// server-rendered markup.

import test from 'node:test';
import assert from 'node:assert/strict';

import { render } from 'svelte/server';

import Overlay from '../src/CE_Application/editor/SelectionBoundsOverlay.svelte';
import { selectedComponentIds, multiDragDelta } from '../src/CE_Application/stores/panels.js';
import { groupRotationPatches } from '../src/CE_Application/utils/groupTransform.js';
import {
  computeOrbitedTransform,
  computeResizedRect,
  computeRotatedResizedRect,
  orbitPointAround,
  rotatedRectBounds,
} from '../src/CE_Application/utils/transformMath.js';

const OPTS = { aspectLock: false, aspectRatio: 1, minW: 4, minH: 4, maxW: 0, maxH: 0 };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// --- Orbit maths -----------------------------------------------------------

test('a point orbits its centre clockwise, in the same sense as Transform.rotation', () => {
  // Panel space grows y downward, so +90° takes a point on the +x axis of the
  // centre to a point below it. Get this sense wrong and a group rotation
  // scatters the selection the opposite way from the box it is following.
  const p = orbitPointAround(10, 0, 0, 0, 90);
  assert.ok(near(p.x, 0, 1e-9), `x ${p.x}`);
  assert.ok(near(p.y, 10, 1e-9), `y ${p.y}`);
});

test('orbiting by zero is the identity, and a full turn comes home', () => {
  assert.deepEqual(orbitPointAround(7, -3, 1, 1, 0), { x: 7, y: -3 });
  const round = orbitPointAround(7, -3, 1, 1, 360);
  assert.ok(near(round.x, 7, 1e-9) && near(round.y, -3, 1e-9));
});

test('a group member both turns on its own axis and orbits the group centre', () => {
  // 20x10 box centred at (60, 50); group centre at (50, 50). A quarter turn
  // clockwise must put its centre at (50, 60) — directly below the group
  // centre — and advance its own rotation from 30° to 120°.
  const out = computeOrbitedTransform({ x: 50, y: 45, w: 20, h: 10 }, 30, 50, 50, 90);
  assert.ok(near(out.x + 10, 50, 1e-9), `centre x ${out.x + 10}`);
  assert.ok(near(out.y + 5, 60, 1e-9), `centre y ${out.y + 5}`);
  assert.equal(out.rotation, 120);
});

test('a member sitting on the group centre only spins — it does not travel', () => {
  const out = computeOrbitedTransform({ x: 40, y: 40, w: 20, h: 20 }, 0, 50, 50, 37);
  assert.ok(near(out.x, 40, 1e-9) && near(out.y, 40, 1e-9), 'the centre moved');
  assert.equal(out.rotation, 37);
});

test('the member keeps its size and its rotation normalises past the wrap', () => {
  const out = computeOrbitedTransform({ x: 0, y: 0, w: 30, h: 12 }, 350, 100, 100, 20);
  assert.equal(out.rotation, 10, '350 + 20 must come back as 10, not 370');
  // Width/height are never touched: rotating a selection does not resize it.
  const back = computeOrbitedTransform({ x: out.x, y: out.y, w: 30, h: 12 }, out.rotation, 100, 100, -20);
  assert.ok(near(back.x, 0, 1e-9) && near(back.y, 0, 1e-9), 'the orbit is not reversible');
});

// --- Group rotation patches ------------------------------------------------

const member = (id, local, rotation = 0, parentOffset = { x: 0, y: 0 }) =>
  ({ id, kind: 'root', local, rotation, parentOffset });

test('every selected root gets both halves of the rotation in one patch', () => {
  const members = [
    member('a', { x: 0, y: 0, w: 20, h: 20 }),
    member('b', { x: 80, y: 0, w: 20, h: 20 }),
  ];
  // Bounding box (0,0)-(100,20) → centre (50, 10). A 180° turn swaps them.
  const patches = groupRotationPatches(members, 50, 10, 180);
  assert.deepEqual(patches.get('a'), {
    'Transform.x': 80, 'Transform.y': 0, 'Transform.rotation': 180,
  });
  assert.deepEqual(patches.get('b'), {
    'Transform.x': 0, 'Transform.y': 0, 'Transform.rotation': 180,
  });
});

test('a nested root is orbited in panel space and written back parent-relative', () => {
  // Local (10, 10) inside a container at (100, 100) → panel (110, 110).
  const members = [member('kid', { x: 10, y: 10, w: 20, h: 20 }, 0, { x: 100, y: 100 })];
  // Centre of the member itself is (120, 120); orbiting about (100, 120) by
  // 90° clockwise puts it at (100, 140) → panel top-left (90, 130) → local
  // (-10, 30).
  const patch = groupRotationPatches(members, 100, 120, 90).get('kid');
  assert.equal(patch['Transform.x'], -10);
  assert.equal(patch['Transform.y'], 30);
  assert.equal(patch['Transform.rotation'], 90);
});

test("a selected container's descendants are left alone — they turn with it", () => {
  const members = [
    member('box', { x: 0, y: 0, w: 40, h: 40 }),
    { id: 'inner', kind: 'descendant', local: { x: 5, y: 5, w: 10, h: 10 } },
  ];
  const patches = groupRotationPatches(members, 20, 20, 45);
  assert.ok(patches.has('box'));
  assert.equal(patches.has('inner'), false,
    'patching a descendant too would double its angle and fling it out of the box');
});

test('a member already at an angle stays that far ahead of its neighbours', () => {
  const members = [
    member('flat', { x: 0, y: 0, w: 10, h: 10 }, 0),
    member('tilted', { x: 20, y: 0, w: 10, h: 10 }, 30),
  ];
  const patches = groupRotationPatches(members, 15, 5, 15);
  assert.equal(patches.get('flat')['Transform.rotation'], 15);
  assert.equal(patches.get('tilted')['Transform.rotation'], 45);
});

test('the delta is absolute, so replaying a drag frame by frame lands in one place', () => {
  // The handler recomputes from the mousedown snapshot every frame. Feeding
  // the same members three growing deltas must end exactly where one 90° call
  // ends — if the maths ever accumulated, the rounded x/y would drift.
  const members = [member('a', { x: 0, y: 0, w: 20, h: 10 })];
  let last = null;
  for (const delta of [30, 60, 90]) last = groupRotationPatches(members, 50, 50, delta).get('a');
  assert.deepEqual(last, groupRotationPatches(members, 50, 50, 90).get('a'));
});

// --- Resize from centre ----------------------------------------------------

test('without the flag the opposite edge still anchors (the old behaviour)', () => {
  const start = { x: 10, y: 20, w: 100, h: 50 };
  const out = computeResizedRect(start, 'br', 20, 10, OPTS);
  assert.deepEqual(out, { x: 10, y: 20, w: 120, h: 60 });
  const left = computeResizedRect(start, 'l', -10, 0, OPTS);
  assert.deepEqual(left, { x: 0, y: 20, w: 110, h: 50 });
});

test('the anchored path is unchanged where the aspect lock and the clamp meet', () => {
  // computeResizedRect was restructured to size-then-position so a second
  // anchor could exist at all. These two are the awkward corners of the old
  // arithmetic — a top-left drag with the lock on, once shrinking into the
  // minimum and once clamping against a max — and their answers must not have
  // moved a unit.
  const start = { x: 10, y: 20, w: 100, h: 50 };
  const locked = { aspectLock: true, aspectRatio: 2, minW: 8, minH: 8, maxW: 120, maxH: 0 };
  assert.deepEqual(computeResizedRect(start, 'tl', 40, 5, locked), { x: 50, y: 40, w: 60, h: 30 });
  assert.deepEqual(computeResizedRect(start, 'tl', -500, -10, locked), { x: -10, y: -230, w: 120, h: 300 });
});

test('from-centre grows both ways: the centre holds and the size doubles the drag', () => {
  const start = { x: 10, y: 20, w: 100, h: 50 };
  const out = computeResizedRect(start, 'br', 20, 10, { ...OPTS, fromCenter: true });
  assert.deepEqual(out, { x: -10, y: 10, w: 140, h: 70 });
  assert.equal(out.x + out.w / 2, start.x + start.w / 2, 'centre x moved');
  assert.equal(out.y + out.h / 2, start.y + start.h / 2, 'centre y moved');
});

test('from-centre works the same off a left or top edge, sign included', () => {
  const start = { x: 100, y: 100, w: 40, h: 40 };
  const out = computeResizedRect(start, 'tl', -5, -5, { ...OPTS, fromCenter: true });
  assert.deepEqual(out, { x: 95, y: 95, w: 50, h: 50 });
  const shrunk = computeResizedRect(start, 't', 5, 5, { ...OPTS, fromCenter: true });
  assert.deepEqual(shrunk, { x: 100, y: 105, w: 40, h: 30 });
});

test('from-centre composes with the aspect lock instead of fighting it', () => {
  const start = { x: 0, y: 0, w: 100, h: 50 };   // 2:1
  const out = computeResizedRect(start, 'br', 30, 2, { ...OPTS, aspectLock: true, aspectRatio: 2, fromCenter: true });
  assert.equal(out.w, 160, 'width follows the dominant axis, doubled');
  assert.equal(out.h, 80, 'height follows the ratio');
  assert.equal(out.x + out.w / 2, 50, 'the aspect fix-up must not slide the centre');
  assert.equal(out.y + out.h / 2, 25);
});

test('from-centre stays centred when the size clamps', () => {
  const start = { x: 0, y: 0, w: 100, h: 100 };
  const out = computeResizedRect(start, 'br', -400, -400, { ...OPTS, minW: 8, minH: 8, fromCenter: true });
  assert.deepEqual(out, { x: 46, y: 46, w: 8, h: 8 });
  const capped = computeResizedRect(start, 'br', 400, 400, { ...OPTS, maxW: 200, maxH: 120, fromCenter: true });
  assert.deepEqual(capped, { x: -50, y: -10, w: 200, h: 120 });
});

test('a rotated control resized from centre keeps its centre pinned in panel space', () => {
  const start = { x: 40, y: 40, w: 80, h: 40 };
  const out = computeRotatedResizedRect(start, 'br', 25, -8, 33, { ...OPTS, fromCenter: true });
  assert.ok(near(out.x + out.w / 2, start.x + start.w / 2, 1e-9), 'centre x drifted');
  assert.ok(near(out.y + out.h / 2, start.y + start.h / 2, 1e-9), 'centre y drifted');
  assert.ok(out.w > start.w, 'the drag should still have resized it');
});

// --- Rotated bounds --------------------------------------------------------

test('the bounds of a rotated rect wrap what is drawn, not what is stored', () => {
  // Tolerance is 1e-6 because the helper quantises to a micro-unit — the
  // deliberate cure for cos(90°) = 6.1e-17 turning up in a style string.
  const square = rotatedRectBounds({ x: 0, y: 0, w: 10, h: 10 }, 45);
  const diagonal = Math.sqrt(200);
  assert.ok(near(square.w, diagonal, 1e-6) && near(square.h, diagonal, 1e-6));
  assert.ok(near(square.x + square.w / 2, 5, 1e-6), 'the centre must not move');
  // Centre (20, 20), so a quarter turn puts the drawn top edge exactly on 0.
  assert.equal(rotatedRectBounds({ x: 0, y: 15, w: 40, h: 10 }, 90).y, 0,
    'a quarter turn must land on a clean 0, not -3.06e-16');
  // A quarter turn swaps the axes of a non-square box.
  const bar = rotatedRectBounds({ x: 0, y: 45, w: 40, h: 10 }, 90);
  assert.ok(near(bar.w, 10, 1e-9) && near(bar.h, 40, 1e-9));
  // Unrotated is returned untouched, so nothing pays for the common case.
  assert.deepEqual(rotatedRectBounds({ x: 3, y: 4, w: 5, h: 6 }, 0), { x: 3, y: 4, w: 5, h: 6 });
});

// --- The overlay's own markup ----------------------------------------------

const ctrl = (id, transform) => ({ _children: { Core: { id }, Transform: transform } });

function renderOverlay(controls, ids, props = {}) {
  selectedComponentIds.set(new Set(ids));
  multiDragDelta.set({ x: 0, y: 0, active: false });
  return render(Overlay, {
    props: { panel: { controls }, scale: 1, panelLocked: false, ...props },
  }).body;
}

const PAIR = [
  ctrl('a', { x: 0, y: 0, width: 20, height: 20 }),
  ctrl('b', { x: 80, y: 60, width: 20, height: 20 }),
];

test('the group box offers a rotate zone at every corner', () => {
  const html = renderOverlay(PAIR, ['a', 'b']);
  for (const corner of ['tl', 'tr', 'bl', 'br']) {
    assert.match(html, new RegExp(`rotate-zone rotate-${corner}`),
      `no ${corner} rotate zone — a multi-selection has no rotate affordance`);
  }
  assert.equal((html.match(/group-handle/g) ?? []).length, 8, 'the 8 resize handles are still there');
});

test('a locked panel and a single selection get no group chrome at all', () => {
  assert.equal(renderOverlay(PAIR, ['a', 'b'], { panelLocked: true }).includes('rotate-zone'), false);
  assert.equal(renderOverlay(PAIR, ['a']).includes('selection-bounds'), false,
    'one control is CanvasControl\'s business, not the group box\'s');
});

test('the chrome disappears while the selection is being dragged', () => {
  selectedComponentIds.set(new Set(['a', 'b']));
  multiDragDelta.set({ x: 5, y: 5, active: true });
  const html = render(Overlay, { props: { panel: { controls: PAIR }, scale: 1, panelLocked: false } }).body;
  assert.equal(html.includes('rotate-zone'), false, 'rotate zones must follow the same rule as the handles');
  assert.equal(html.includes('group-handle'), false);
  multiDragDelta.set({ x: 0, y: 0, active: false });
});

test('the box wraps a rotated member instead of cutting the corner off it', () => {
  // A 40x10 bar at 90° is drawn as a 10x40 vertical bar. The stored AABB would
  // report a 40x10 box and leave the drawn bar hanging out of it.
  const html = renderOverlay([
    ctrl('bar', { x: 0, y: 15, width: 40, height: 10, rotation: 90 }),
    ctrl('dot', { x: 100, y: 100, width: 10, height: 10 }),
  ], ['bar', 'dot']);
  const style = html.match(/class="selection-bounds[^"]*" style="([^"]+)"/)?.[1] ?? '';
  assert.match(style, /left:15px/, 'the rotated bar\'s drawn left edge is x=15');
  assert.match(style, /top:0px/, 'and its drawn top edge is y=0');
  assert.match(style, /height:110px/);
});

test('the rotate zones scale with the zoom like the rest of the selection chrome', () => {
  const html = renderOverlay(PAIR, ['a', 'b'], { scale: 0.25 });
  const style = html.match(/class="selection-bounds[^"]*" style="([^"]+)"/)?.[1] ?? '';
  assert.match(style, /--inv-scale:4/, 'the zones size themselves off --inv-scale');
});

// --- Wiring the handlers cannot show through SSR ---------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'CE_Application', 'editor', 'SelectionBoundsOverlay.svelte'),
  'utf8',
);

test('Alt is what puts the group resize into from-centre mode', () => {
  assert.match(source, /fromCenter:\s*e\.altKey === true/,
    'nothing reads altKey — the group box cannot resize about its centre');
});

test('Shift snaps the group turn through the same convention as a single control', () => {
  // startRotation 0 → computeRotation hands back the delta, snapped to 15°.
  assert.match(source, /computeRotation\(rotateStartAngle,\s*angle,\s*0,\s*e\.shiftKey\)/);
});

test('one rotation gesture is one undo step, and a zero-degree click is none', () => {
  const end = source.slice(source.indexOf('function handleRotateEnd'));
  const body = end.slice(0, end.indexOf('\n  }'));
  assert.equal((body.match(/pushSnapshot\(\)/g) ?? []).length, 1,
    'the snapshot belongs at the gesture boundary, once');
  assert.match(body, /if \(turned\) pushSnapshot\(\)/);
  const move = source.slice(source.indexOf('function handleRotateMove'));
  assert.equal(move.slice(0, move.indexOf('\n  }')).includes('pushSnapshot'), false,
    'a per-frame snapshot would make one drag 60 undo steps');
});

test('the angle readout is on screen while the group turns', () => {
  assert.match(source, /\{#if isRotating\}[\s\S]*group-angle[\s\S]*normalizeRotation\(rotateDelta\)/);
});
