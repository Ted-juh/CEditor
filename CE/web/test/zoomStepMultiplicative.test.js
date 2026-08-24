// zoomStepMultiplicative.test.js — one notch means the same thing everywhere in the range.
//
// Review finding A12, last clause: "Zoom step is additive (10%→20% doubles; 390%→400% is
// nothing)." Only the WHEEL had been made multiplicative; the buttons and Ctrl+= / Ctrl+-
// still did `base + direction * increment` with a fixed increment of 10, so the same press
// doubled the view at the bottom of the range and moved it by a fortieth at the top.
//
// The increment setting is respected rather than dropped: it now reads as a PERCENTAGE of the
// current zoom (10 → ×1.1, the wheel's factor), which is why the value people already have
// still lands on 110% from 100% and nobody's configuration silently changed meaning.

import test from 'node:test';
import assert from 'node:assert/strict';

import { tidyZoomStep } from '../src/CE_Application/utils/canvasInteractions.js';

const ladder = (from, direction, steps, inc = 10) => {
  const out = [];
  let z = from;
  for (let i = 0; i < steps; i++) { z = tidyZoomStep(z, direction, inc); out.push(z); }
  return out;
};

test('a step is a ratio, so the same press means the same thing at both ends of the range', () => {
  // The complaint, in numbers: additively, +10 from 10% was +100% of the view and +10 from
  // 390% was +2.5%. Multiplicatively both are the same fraction of what is on screen.
  const low = tidyZoomStep(10, 1) / 10;
  const high = tidyZoomStep(390, 1) / 390;
  assert.ok(Math.abs(low - high) < 0.08, `steps should be comparable ratios, got ${low} and ${high}`);
  assert.ok(tidyZoomStep(10, 1) < 20, 'a single press out of 10% must not double the view');
});

test('the configured increment is a percentage, and 100% still steps to the familiar number', () => {
  assert.equal(tidyZoomStep(100, 1, 10), 110);
  assert.equal(tidyZoomStep(100, 1, 20), 120);
  assert.equal(tidyZoomStep(100, 1, 50), 150);
  assert.equal(tidyZoomStep(100, -1, 20), Math.round(100 / 1.2 / 5) * 5);
});

test('every step lands on a tidy number', () => {
  const tidy = (z) => (z < 20 ? true : z < 100 ? z % 5 === 0 : z < 200 ? z % 10 === 0 : z % 25 === 0);
  for (const z of [...ladder(100, 1, 14), ...ladder(100, -1, 18)]) {
    assert.ok(Number.isInteger(z), `${z} should be a whole number`);
    assert.ok(tidy(z), `${z} is not a tidy landing`);
  }
});

test('a step never stalls or reverses — rounding must not eat the press', () => {
  let z = 400;
  for (let i = 0; i < 40; i++) {
    const next = tidyZoomStep(z, -1);
    assert.ok(next < z || next === 10, `zoom out stalled at ${z}`);
    z = next;
  }
  assert.equal(z, 10, 'zooming out all the way reaches the floor');

  for (let i = 0; i < 40; i++) {
    const next = tidyZoomStep(z, 1);
    assert.ok(next > z || next === 400, `zoom in stalled at ${z}`);
    z = next;
  }
  assert.equal(z, 400, 'zooming in all the way reaches the ceiling');
});

test('the range is clamped at both ends', () => {
  assert.equal(tidyZoomStep(10, -1), 10);
  assert.equal(tidyZoomStep(400, 1), 400);
});

test('a nonsense increment falls back rather than freezing the buttons', () => {
  assert.ok(tidyZoomStep(100, 1, 0) > 100);
  assert.ok(tidyZoomStep(100, 1, NaN) > 100);
  assert.ok(tidyZoomStep(100, 1, undefined) > 100);
});
