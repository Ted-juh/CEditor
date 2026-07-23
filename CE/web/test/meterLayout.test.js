import test from 'node:test';
import assert from 'node:assert/strict';
import {
  meterLinearFraction, meterPosition, meterZones, meterZoneColourAt,
  meterSegmentsLit, meterSegmentCenter, meterPeak, meterTicks, meterArcAngle,
} from '../src/CE_Application/utils/meterLayout.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('linear fraction clamps within min/max', () => {
  assert.equal(meterLinearFraction(5, 0, 10), 0.5);
  assert.equal(meterLinearFraction(-3, 0, 10), 0);   // below → 0
  assert.equal(meterLinearFraction(99, 0, 10), 1);   // above → 1
  assert.equal(meterLinearFraction(5, 10, 10), 0);   // degenerate range
});

test('linear vs dB position', () => {
  assert.equal(meterPosition(0.5, { valueMin: 0, valueMax: 1 }), 0.5); // linear
  // dB scale: full-scale fraction (1.0) maps to 0 dB → near the ceil end.
  const full = meterPosition(1, { scale: 'db', valueMin: 0, valueMax: 1, dbFloor: -60, dbCeil: 0 });
  assert.ok(near(full, 1)); // 20*log10(1) = 0 dB = ceil
  const half = meterPosition(0.5, { scale: 'db', valueMin: 0, valueMax: 1, dbFloor: -60, dbCeil: 0 });
  // 20*log10(0.5) ≈ -6.02 dB → (-6.02 - -60)/60 ≈ 0.9
  assert.ok(half > 0.88 && half < 0.92);
});

test('zones normalize, backfill from 0, and resolve by position', () => {
  const cfg = { zones: [{ from: 0.9, colour: 'RED' }, { from: 0.7, colour: 'YEL' }, { from: 0.0, colour: 'GRN' }] };
  const z = meterZones(cfg);
  assert.deepEqual(z.map((x) => x.from), [0, 0.7, 0.9]); // sorted low→high
  assert.equal(meterZoneColourAt(0.1, cfg), 'GRN');
  assert.equal(meterZoneColourAt(0.75, cfg), 'YEL');
  assert.equal(meterZoneColourAt(0.95, cfg), 'RED');
  // No zones → single fallback zone from fillColour.
  assert.equal(meterZones({ fillColour: 'BLU' })[0].colour, 'BLU');
});

test('segment lit-count rounds at the tip midpoint', () => {
  assert.equal(meterSegmentsLit(0, 10), 0);
  assert.equal(meterSegmentsLit(1, 10), 10);
  assert.equal(meterSegmentsLit(0.54, 10), 5);
  assert.equal(meterSegmentsLit(0.55, 10), 6);   // past the 5.5 midpoint
  assert.equal(meterSegmentsLit(0.5, 0), 0);     // no segments
  assert.ok(near(meterSegmentCenter(0, 10), 0.05));
  assert.ok(near(meterSegmentCenter(9, 10), 0.95));
});

test('peak-hold jumps up instantly, holds, then decays', () => {
  // Rise to a new max.
  let s = meterPeak({ prevPeak: 0.3, prevPeakAt: 0, pos: 0.8, now: 1000, holdMs: 500, decayPerSec: 0.5 });
  assert.deepEqual(s, { peak: 0.8, peakAt: 1000 });
  // Within the hold window → unchanged.
  s = meterPeak({ prevPeak: 0.8, prevPeakAt: 1000, pos: 0.2, now: 1400, holdMs: 500, decayPerSec: 0.5 });
  assert.equal(s.peak, 0.8);
  assert.equal(s.peakAt, 1000);
  // After hold → falls at decayPerSec (0.5/s). 700ms past the 500ms hold = 200ms decay = 0.1 drop.
  s = meterPeak({ prevPeak: 0.8, prevPeakAt: 1000, pos: 0.2, now: 1700, holdMs: 500, decayPerSec: 0.5 });
  assert.ok(near(s.peak, 0.7));
  assert.equal(s.peakAt, 1000);
  // Never falls below the live position.
  s = meterPeak({ prevPeak: 0.8, prevPeakAt: 1000, pos: 0.6, now: 9000, holdMs: 500, decayPerSec: 0.5 });
  assert.equal(s.peak, 0.6);
});

test('ticks span the scale with count+1 marks', () => {
  const lin = meterTicks({ valueMin: 0, valueMax: 100 }, 4);
  assert.equal(lin.length, 5);
  assert.deepEqual(lin.map((t) => t.pos), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(lin.map((t) => t.value), [0, 25, 50, 75, 100]);
  const db = meterTicks({ scale: 'db', dbFloor: -60, dbCeil: 0 }, 3);
  assert.deepEqual(db.map((t) => t.value), [-60, -40, -20, 0]);
});

test('arc angle maps position across the sweep', () => {
  assert.equal(meterArcAngle(0, 135, 270), 135);
  assert.equal(meterArcAngle(1, 135, 270), 405);
  assert.equal(meterArcAngle(0.5, 135, 270), 270);
});
