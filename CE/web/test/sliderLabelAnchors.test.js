// sliderLabelAnchors.test.js — where a slider's generated labels are placed.
//
// `buildSliderLabelAnchors` is pure, and the two Gap settings in the Slider editor resolve through
// it, so the contract they depend on is cheap to pin here rather than only in the browser suite.
//
// The contract that needed pinning: BOTH GAPS APPLY UNDER `auto`. Each `auto` branch used to carry
// its distance as a literal — 22 below a horizontal track, 18 beside a vertical one, 14 for the
// readout — so the Gap cells moved nothing at all until the Position dropdown beside them was
// taken off `auto`. Two of those literals were the declared defaults of the very fields they were
// standing in for, which is what made the cells look live.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSliderLabelAnchors } from '../src/CE_Application/utils/sliderGeometry.js';

const anchorsFor = (behavior) => buildSliderLabelAnchors(
  { min: 0, max: 100, ...behavior },
  300,
  90,
  { start: 0, current: 0.5, end: 1 },
  { trackThickness: 10, pointerSize: 20, hasReadout: true },
);

test('the min/max gap applies while the placement is auto', () => {
  const base = anchorsFor({});
  const wider = anchorsFor({ labelMinMaxGap: 44 });
  assert.equal(wider.min.y - base.min.y, 22, 'a gap of 44 sits 22px further out than the default 22');
  assert.equal(wider.max.y - base.max.y, 22);
});

test('an untouched horizontal slider is placed exactly where it always was', () => {
  // The literal the auto branch used to carry was 22, and `labelMinMaxGap` defaults to 22, so
  // naming the default instead of inlining it moved nothing on any existing panel.
  const anchors = anchorsFor({});
  const explicit = anchorsFor({ labelMinMaxGap: 22 });
  assert.deepEqual(anchors.min, explicit.min);
  assert.deepEqual(anchors.max, explicit.max);
});

test('the readout gap applies while its placement is auto, and moves the readout alone', () => {
  const base = anchorsFor({});
  const moved = anchorsFor({ labelReadoutGap: 40 });
  assert.equal(base.value.y, 14, 'the default readout gap is the literal the auto branch used to carry');
  assert.equal(moved.value.y, 40);
  assert.deepEqual(moved.min, base.min, 'and the end labels do not follow it');
});

test('the two gaps stay independent of each other', () => {
  const anchors = anchorsFor({ labelMinMaxGap: 50, labelReadoutGap: 6 });
  assert.equal(anchors.value.y, 6);
  assert.equal(anchors.min.y - anchorsFor({ labelReadoutGap: 6 }).min.y, 28);
});

test('an explicit placement still wins over the gap alone', () => {
  const below = anchorsFor({ labelMinMaxPlacement: 'below', labelMinMaxGap: 30 });
  const above = anchorsFor({ labelMinMaxPlacement: 'above', labelMinMaxGap: 30 });
  assert.ok(above.min.y < below.min.y, 'above is on the other side of the track from below');
  assert.equal(below.min.y - above.min.y, 60, 'and the gap is spent in opposite directions, so they are two gaps apart');
});

test('the offsets ride on top of whatever the gap and the placement produced', () => {
  const plain = anchorsFor({ labelMinMaxGap: 30 });
  const nudged = anchorsFor({ labelMinMaxGap: 30, labelMinMaxOffsetX: 7, labelMinMaxOffsetY: -3 });
  assert.equal(nudged.min.x - plain.min.x, 7);
  assert.equal(nudged.min.y - plain.min.y, -3);
});

test('a vertical slider takes the same gap, on its own axis', () => {
  const base = buildSliderLabelAnchors(
    { min: 0, max: 100, orientation: 'vertical' },
    90, 300, { start: 0, current: 0.5, end: 1 },
    { trackThickness: 10, pointerSize: 20, hasReadout: true },
  );
  const wider = buildSliderLabelAnchors(
    { min: 0, max: 100, orientation: 'vertical', labelMinMaxGap: 42 },
    90, 300, { start: 0, current: 0.5, end: 1 },
    { trackThickness: 10, pointerSize: 20, hasReadout: true },
  );
  assert.equal(wider.min.x - base.min.x, 20, 'a gap of 42 against the default 22 is twenty further out');
});

test('a corner placement hangs the label from the track\'s end, and says which end', () => {
  const base = anchorsFor({});
  assert.equal(base.title.align, undefined, 'auto is centred, as it always was');
  assert.equal(base.value.align, undefined);

  const board = anchorsFor({ labelTitlePlacement: 'topLeft', labelReadoutPlacement: 'topRight' });
  assert.equal(board.title.align, 'start');
  assert.equal(board.value.align, 'end');
  assert.ok(board.title.x < 150 && board.value.x > 150, 'the title starts at the left of the track, the value ends at its right');
  assert.equal(board.title.y, board.value.y, 'one row above the track');
  assert.equal(board.value.y, 14, 'at the readout gap');
  assert.equal(anchorsFor({ labelTitlePlacement: 'topLeft', labelReadoutPlacement: 'topRight', labelReadoutGap: 20 }).title.y, 20, 'the title shares the readout gap');

  const below = anchorsFor({ labelReadoutPlacement: 'bottomRight' });
  assert.equal(below.value.align, 'end');
  assert.equal(below.value.y, 90 - 14);

  // The readout offsets still apply on top of a corner.
  const nudged = anchorsFor({ labelReadoutPlacement: 'topRight', labelReadoutOffsetX: -6 });
  assert.equal(nudged.value.x, board.value.x - 6);
  assert.equal(nudged.value.align, 'end');

  // A knob's corners are the arc's extent.
  const knob = buildSliderLabelAnchors({ min: 0, max: 100, geometry: 'circular', labelTitlePlacement: 'topLeft', labelReadoutPlacement: 'topRight' }, 120, 120, { current: 0.5 }, { trackThickness: 6, pointerSize: 14, hasReadout: true });
  assert.ok(knob.title.x < 60 && knob.value.x > 60);
  assert.equal(knob.title.align, 'start');
});
