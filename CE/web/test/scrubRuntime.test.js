// scrubRuntime.test.js — the dragScrub migration, checked for feel-parity.
//
// The migration's contract was "the value matches the old feel at default
// sensitivity": each widget type's old pointer maths was replaced by a
// DragScrub built in utils/scrubRuntime.js (or directly by a widget), and
// these tests pin the equivalences the commits claimed — the spinner's
// 18px-per-step scrub, the slider track's direction flags, and the combine
// modes' documented measured behaviour — so a regression in the wiring shows
// up here rather than as a control that suddenly feels different.

import test from 'node:test';
import assert from 'node:assert/strict';

import { DragScrub, presets } from '../src/CE_Application/scrub/dragScrub';
import {
  createRangeScrub,
  createRangeTrackScrub,
  createSliderTrackScrub,
  isLinearSliderGeometry,
} from '../src/CE_Application/utils/scrubRuntime.js';
import { resolveSliderNormalizedFromPoint } from '../src/CE_Application/utils/sliderGeometry.js';
import { normalizedRangePointerValue } from '../src/CE_Application/utils/rangeBehavior.js';

const RECT = { left: 100, top: 50, width: 200, height: 120 };

function drag(scrub, from, to, opts = {}) {
  scrub.begin({ x: from.x, y: from.y }, opts);
  return scrub.move({ x: to.x, y: to.y, ...opts.sample });
}

// --- Number/spinbox scrub: one step per 18 px, anchored at pointer-down ----

test('range scrub moves one step per 18px, in the drag direction', () => {
  const behavior = { family: 'range', min: 0, max: 100, step: 1 };
  const scrub = createRangeScrub(behavior, 50);
  scrub.begin({ x: 0, y: 0 });
  // 18px right = +1 step (engaged past the boundary with hysteresis).
  const after18 = scrub.move({ x: 18, y: 0 });
  assert.equal(after18, 51);
  // A further 36px = +2 more.
  const after54 = scrub.move({ x: 54, y: 0 });
  assert.equal(after54, 53);
});

test('vertical range scrub treats up as increase, and ttb/reverse flip it', () => {
  const up = createRangeScrub({ family: 'range', min: 0, max: 100, step: 1, orientation: 'vertical' }, 50);
  up.begin({ x: 0, y: 100 });
  assert.ok(up.move({ x: 0, y: 100 - 54 }) > 50, 'up should increase');

  const ttb = createRangeScrub({ family: 'range', min: 0, max: 100, step: 1, orientation: 'vertical', direction: 'ttb' }, 50);
  ttb.begin({ x: 0, y: 100 });
  assert.ok(ttb.move({ x: 0, y: 100 - 54 }) < 50, 'ttb flips the axis');

  const reversed = createRangeScrub({ family: 'range', min: 0, max: 100, step: 1, orientation: 'vertical', reverseMouseDirection: true }, 50);
  reversed.begin({ x: 0, y: 100 });
  assert.ok(reversed.move({ x: 0, y: 100 - 54 }) < 50, 'reverseMouseDirection flips the axis');
});

test('range scrub: shift is fine, ctrl is coarse', () => {
  const behavior = { family: 'range', min: 0, max: 1000, step: 1 };
  const plain = createRangeScrub(behavior, 500);
  plain.begin({ x: 0, y: 0 });
  const plainMoved = plain.move({ x: 180, y: 0 });

  const fine = createRangeScrub(behavior, 500);
  fine.begin({ x: 0, y: 0 });
  const fineMoved = fine.move({ x: 180, y: 0, shiftKey: true });

  const coarse = createRangeScrub(behavior, 500);
  coarse.begin({ x: 0, y: 0 });
  const coarseMoved = coarse.move({ x: 180, y: 0, ctrlKey: true });

  assert.ok(fineMoved - 500 < plainMoved - 500, 'shift moves less than plain');
  assert.ok(coarseMoved - 500 > plainMoved - 500, 'ctrl moves more than plain');
});

// --- Linear slider track: absolute mapping equals the old geometry mapping --

const SLIDER_CASES = [
  { name: 'horizontal ltr', behavior: { family: 'range', role: 'slider' } },
  { name: 'horizontal rtl', behavior: { family: 'range', role: 'slider', direction: 'rtl' } },
  { name: 'vertical btt', behavior: { family: 'range', role: 'slider', orientation: 'vertical' } },
  { name: 'vertical ttb', behavior: { family: 'range', role: 'slider', orientation: 'vertical', direction: 'ttb' } },
];

for (const { name, behavior } of SLIDER_CASES) {
  test(`slider track scrub matches resolveSliderNormalizedFromPoint (${name})`, () => {
    const points = [
      { x: RECT.left, y: RECT.top },
      { x: RECT.left + 50, y: RECT.top + 90 },
      { x: RECT.left + RECT.width, y: RECT.top + RECT.height },
      { x: RECT.left + 137, y: RECT.top + 33 },
    ];
    for (const point of points) {
      const scrub = createSliderTrackScrub(behavior);
      scrub.begin({ x: RECT.left + 1, y: RECT.top + 1 }, { bounds: RECT, jumpToPointer: true });
      const viaScrub = scrub.move({ x: point.x, y: point.y }) ?? scrub.value;
      const viaGeometry = resolveSliderNormalizedFromPoint(behavior, RECT, point.x, point.y);
      assert.ok(Math.abs(viaScrub - viaGeometry) < 1e-9, `${name} at ${point.x},${point.y}: ${viaScrub} vs ${viaGeometry}`);
    }
  });
}

test('range track scrub matches normalizedRangePointerValue', () => {
  const behavior = { family: 'range', role: 'slider', orientation: 'vertical' };
  const scrub = createRangeTrackScrub(behavior);
  scrub.begin({ x: RECT.left, y: RECT.top }, { bounds: RECT, jumpToPointer: true });
  const point = { x: RECT.left + 60, y: RECT.top + 30 };
  const viaScrub = scrub.move(point) ?? scrub.value;
  const viaGeometry = normalizedRangePointerValue(behavior, RECT, point.x, point.y);
  assert.ok(Math.abs(viaScrub - viaGeometry) < 1e-9);
});

test('circular geometry is excluded from linear track scrubbing', () => {
  assert.equal(isLinearSliderGeometry({ geometry: 'circular' }), false);
  assert.equal(isLinearSliderGeometry({ geometry: 'linear' }), true);
  assert.equal(isLinearSliderGeometry({}), true);
});

// --- Combine modes: the README's measured-behaviour table -------------------
// 100px of travel with sensitivity 1/200 (200px covers the full range),
// starting from 0 on an unclamped-enough range so the numbers are visible.

function combineResult(combine, dxPixels, upPixels) {
  const scrub = new DragScrub({
    axis: 'both',
    combine,
    tracking: 'relative',
    sensitivity: 1 / 200,
    deadZone: 0,
    min: -1,
    max: 1,
  }, 0);
  scrub.begin({ x: 0, y: 0 });
  return scrub.move({ x: dxPixels, y: -upPixels }) ?? 0;
}

const DIAG = 100 / Math.SQRT2;

test('combine sum: full rate on each axis, 1.41x on the diagonal, dead on the opposing diagonal', () => {
  assert.ok(Math.abs(combineResult('sum', 100, 0) - 0.5) < 1e-9);
  assert.ok(Math.abs(combineResult('sum', 0, 100) - 0.5) < 1e-9);
  assert.ok(Math.abs(combineResult('sum', DIAG, DIAG) - 0.707) < 1e-3);
  assert.ok(Math.abs(combineResult('sum', -DIAG, DIAG) - 0) < 1e-9);
});

test('combine projected: never exceeds the pixels travelled', () => {
  assert.ok(Math.abs(combineResult('projected', 100, 0) - 0.354) < 1e-3);
  assert.ok(Math.abs(combineResult('projected', 0, 100) - 0.354) < 1e-3);
  assert.ok(Math.abs(combineResult('projected', DIAG, DIAG) - 0.5) < 1e-9);
  assert.ok(Math.abs(combineResult('projected', -DIAG, DIAG) - 0) < 1e-9);
});

test('combine magnitude: same rate in every direction, only the sign flips', () => {
  assert.ok(Math.abs(combineResult('magnitude', 100, 0) - 0.5) < 1e-9);
  assert.ok(Math.abs(combineResult('magnitude', 0, 100) - 0.5) < 1e-9);
  assert.ok(Math.abs(combineResult('magnitude', DIAG, DIAG) - 0.5) < 1e-9);
  assert.ok(Math.abs(combineResult('magnitude', -DIAG, DIAG) - (-0.5)) < 1e-9);
});

// --- The action-reset regression: options must not leak non-option keys -----
// DragScrub's constructor spreads its argument into options; the action must
// therefore never hand it value/onChange, or a re-render reads as a config
// change and resets a drag in progress (the bug found by the browser smoke).

test('a DragScrub built from filtered options carries no widget params', () => {
  const scrub = new DragScrub({ ...presets.linearHorizontal, min: 0, max: 200 }, 100);
  assert.equal('value' in scrub.options, false);
  assert.equal('onChange' in scrub.options, false);
});

// --- Splitter mapping -------------------------------------------------------

test('splitter preset: absolute track with no dead zone', () => {
  assert.equal(presets.splitterHorizontal.tracking, 'absolute');
  assert.equal(presets.splitterHorizontal.deadZone, 0);
});

test('a relative splitter scrub moves 1px per px and clamps at its bounds', () => {
  const scrub = new DragScrub({ axis: 'x', tracking: 'relative', sensitivity: 1, deadZone: 0, invertX: true, min: 120, max: 400 }, 200);
  scrub.begin({ x: 500, y: 0 });
  assert.equal(scrub.move({ x: 440, y: 0 }), 260);
  assert.equal(scrub.move({ x: 0, y: 0 }), 400);
});
