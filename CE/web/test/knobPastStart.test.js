// A knob dragged a little past its start went straight to its end; past its end it stopped at the
// end. The pointer's angle was measured from the start in the turning direction, so a pointer just
// short of the start read as nearly a full turn and the clamp took it to 1. Now the gap between the
// end and the start splits at its middle, and the nearer end wins (as a custom component's dial did).

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCircularCenter, resolveSliderNormalizedFromPoint } from '../src/CE_Application/utils/sliderGeometry.js';
import { getSliderStartAngle, getSliderSweepAngle } from '../src/CE_Application/utils/sliderBehavior.js';

const rect = { left: 0, top: 0, width: 120, height: 120 };

function at(behavior, angleDegrees) {
  const center = resolveCircularCenter(rect.width, rect.height, { hasReadout: behavior.showValueReadout !== false });
  const radians = (angleDegrees * Math.PI) / 180;
  return resolveSliderNormalizedFromPoint(behavior, rect, center.x + Math.cos(radians) * 40, center.y + Math.sin(radians) * 40);
}

for (const direction of ['cw', 'ccw']) {
  test(`a ${direction} knob: past its start stays at the start, past its end at the end`, () => {
    const behavior = { geometry: 'circular', direction, min: 0, max: 1 };
    const start = getSliderStartAngle(behavior);
    const sweep = getSliderSweepAngle(behavior);
    const sign = direction === 'ccw' ? -1 : 1;
    assert.ok(sweep < 360, 'a knob has a gap between its end and its start');
    assert.ok(Math.abs(at(behavior, start + sign * 1)) < 0.02, 'just after the start: near 0');
    assert.equal(at(behavior, start - sign * 5), 0, 'a little before the start: the start, not the end');
    assert.equal(at(behavior, start + sign * (sweep + 5)), 1, 'a little past the end: the end');
    const gap = 360 - sweep;
    assert.equal(at(behavior, start - sign * (gap / 2 - 2)), 0, 'nearer the start half of the gap');
    assert.equal(at(behavior, start + sign * (sweep + gap / 2 - 2)), 1, 'nearer the end half of the gap');
  });
}
