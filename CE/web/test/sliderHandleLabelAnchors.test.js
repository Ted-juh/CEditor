// sliderHandleLabelAnchors.test.js — where the labels riding a knob's or slider's handles hang.
//
// They are the only text a knob or slider still draws itself (Behavior.showHandleLabels): its name,
// value and range ends are Labels of their own beside it (utils/labelShows.js), and its track keeps
// no room for them (utils/sliderGeometry.js). `buildSliderHandleLabelAnchors` is pure, so where the
// renderer and Create Component from Selection put them is cheap to pin here.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSliderHandleLabelAnchors,
  resolveCircularPoint,
  resolveCircularTrackMetrics,
  resolveLinearPointerPoint,
  sliderHandleLabelRoom,
  sliderNormalizedToAngle,
} from '../src/CE_Application/utils/sliderGeometry.js';

const values = { start: 0.2, current: 0.5, end: 0.9 };
const sizes = { trackThickness: 10, pointerSize: 20 };

test('a horizontal slider\'s labels ride 18 px above each handle', () => {
  const behavior = { min: 0, max: 100 };
  const anchors = buildSliderHandleLabelAnchors(behavior, 300, 90, values, sizes);
  assert.deepEqual(Object.keys(anchors), ['start', 'current', 'end'], 'its handles\' labels and nothing else');
  for (const role of ['start', 'current', 'end']) {
    const handle = resolveLinearPointerPoint(behavior, 300, 90, values[role], 10, 20);
    assert.deepEqual(anchors[role], { x: handle.x, y: handle.y - 18 }, role);
  }
});

test('a vertical slider\'s labels ride 22 px beside each handle, either way up', () => {
  for (const direction of ['btt', 'ttb']) {
    const behavior = { min: 0, max: 100, orientation: 'vertical', direction };
    const anchors = buildSliderHandleLabelAnchors(behavior, 90, 300, values, sizes);
    const handle = resolveLinearPointerPoint(behavior, 90, 300, values.current, 10, 20);
    assert.deepEqual(anchors.current, { x: handle.x + 22, y: handle.y + 4 }, direction);
  }
});

test('a knob\'s labels ride 22 px out from its track, and only they keep room round it', () => {
  const behavior = { min: 0, max: 100, geometry: 'circular' };
  const plain = buildSliderHandleLabelAnchors(behavior, 120, 120, values, sizes);
  const metrics = resolveCircularTrackMetrics(120, 120, { ...sizes, majorTickLength: 12, hasTicks: true });
  const expected = resolveCircularPoint(120, 120, sliderNormalizedToAngle(behavior, 0.5), metrics.radius + 22, { x: metrics.centerX, y: metrics.centerY });
  assert.deepEqual(plain.current, expected);
  // Shown, they keep room for their size: the track draws in a little and they follow it.
  assert.equal(sliderHandleLabelRoom(behavior, 11), 0, 'not shown: no room');
  const shown = { ...behavior, showHandleLabels: true };
  assert.equal(sliderHandleLabelRoom(shown, 11), 11);
  const riding = buildSliderHandleLabelAnchors(shown, 120, 120, values, { ...sizes, handleLabelSize: 11 });
  assert.ok(riding.current.y > plain.current.y, 'the track is smaller, so the label at the top hangs lower');
});
