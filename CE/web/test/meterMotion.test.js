// meterMotion.test.js — what moves a meter by itself (utils/meterMotion.js): a test signal in
// Preview, and a needle's ballistics, which move the drawing and never the reading. The Meter,
// phase 2 (docs/design/component-presets.md).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  METER_TEST_SIGNALS, meterBallistics, meterTestLevel, meterValueAt, needleSettled, stepNeedle, effectNeedleStep,
} from '../src/CE_Application/utils/meterMotion.js';
import { meterDrawnPosition, meterPosition } from '../src/CE_Application/utils/meterLayout.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { FIELD_SETS } from '../src/CE_Application/models/inspectorFieldSets.js';

const over = (kind, from, to, every = 10) => {
  const out = [];
  for (let t = from; t <= to; t += every) out.push(meterTestLevel(kind, t));
  return out;
};

test('a meter is made still: no test signal and no ballistics until asked for', () => {
  const meter = createControl('Meter')._children.Meter;
  assert.equal(meter.testSignal, '');
  assert.equal(meterBallistics(meter), null, 'it jumps to each level, as it always did');
  assert.equal(meterTestLevel('', 1000), null);
  assert.deepEqual(METER_TEST_SIGNALS, ['', 'program', 'sweep', 'bursts']);
  const keys = FIELD_SETS.Meter.map((field) => field.key).filter(Boolean);
  for (const key of ['riseTime', 'fallTime', 'overshoot', 'testSignal']) assert.ok(keys.includes(key), `${key} has a place in the inspector`);
});

test('each test signal stays on the scale and moves the way it says', () => {
  for (const kind of ['program', 'sweep', 'bursts']) {
    const levels = over(kind, 0, 20000);
    assert.ok(levels.every((v) => v >= 0 && v <= 1), `${kind} stays on the scale`);
    assert.ok(Math.max(...levels) - Math.min(...levels) > 0.4, `${kind} moves`);
  }
  // The sweep: from nothing up to full in three seconds and back in three.
  assert.equal(meterTestLevel('sweep', 0), 0);
  assert.equal(meterTestLevel('sweep', 3000), 1);
  assert.ok(Math.abs(meterTestLevel('sweep', 1500) - 0.5) < 1e-9);
  // Bursts: quiet between, at the top as each burst lands, every 2.4 s.
  const bursts = over('bursts', 0, 9600, 5);
  const tops = bursts.map((v, i) => [v, i * 5]).filter(([v]) => v > 0.97).map(([, t]) => Math.floor(t / 2400));
  assert.deepEqual([...new Set(tops)], [0, 1, 2, 3], 'a burst in each 2.4 s');
  assert.ok(meterTestLevel('bursts', 1800) < 0.25, 'quiet between');
  // Above the clip point long enough to be seen at ten frames a second: a burst that fell away at
  // once was there for 24 ms, and a slow machine missed most of them.
  const over90 = over('bursts', 0, 2399, 1).filter((v) => v >= 0.9).length;
  assert.ok(over90 >= 150, `${over90} ms over 90%`);
  // The programme reaches the top in its loud phrase, and its beats kick.
  assert.ok(Math.max(...over('program', 0, 8000, 5)) > 0.9, 'a loud phrase clips');
  assert.ok(Math.min(...over('program', 0, 8000, 5)) < 0.55, 'and it is not always loud');
});

test('every meter on one test signal moves as one, so needles can be compared on the same input', () => {
  for (const kind of ['program', 'sweep', 'bursts']) assert.equal(meterTestLevel(kind, 1234), meterTestLevel(kind, 1234));
  assert.match(readFileSync(new URL('../src/CE_Application/editor/PanelPreviewSurface.svelte', import.meta.url), 'utf8'),
    /testKind \? meterValueAt\(meterTestLevel\(testKind, Date\.now\(\)\), meter\)/, 'the level from the clock alone');
});

test('a test signal reads in the meter\'s own units: the inverse of where a reading stands', () => {
  const linear = { valueMin: -48, valueMax: 0 };
  for (const pos of [0, 0.25, 0.5, 1]) assert.ok(Math.abs(meterPosition(meterValueAt(pos, linear), linear) - pos) < 1e-9);
  assert.equal(meterValueAt(0.5, linear), -24);
  const db = { scale: 'db', dbFloor: -60, dbCeil: 0, valueMin: 0, valueMax: 1 };
  for (const pos of [0.1, 0.5, 0.9, 1]) assert.ok(Math.abs(meterPosition(meterValueAt(pos, db), db) - pos) < 1e-9, `decibels at ${pos}`);
});

// Runs a needle to a level from rest at another, in 16 ms frames; the positions, each frame.
const run = (ballistics, from, to, ms) => {
  let state = { pos: from, vel: 0 };
  const out = [];
  for (let t = 16; t <= ms; t += 16) { state = stepNeedle(state, to, 16, ballistics); out.push({ t, ...state }); }
  return out;
};

test('ballistics: a needle reaches a new level in about its rise time, and overshoots as much as it says', () => {
  const vu = meterBallistics({ riseTime: 300, fallTime: 300, overshoot: 0.015 });
  const up = run(vu, 0, 0.8, 1200);
  const at99 = up.find((frame) => frame.pos >= 0.8 * 0.99)?.t;
  assert.ok(at99 >= 150 && at99 <= 360, `99% of the way in ${at99} ms`);
  assert.ok(up.at(-1).pos > 0.79 && up.at(-1).pos < 0.81, 'and it settles on the level');
  assert.ok(needleSettled(up.at(-1), 0.8));
  const swing = Math.max(...up.map((frame) => frame.pos)) - 0.8;
  assert.ok(swing > 0.002 && swing < 0.03, `past it by ${swing.toFixed(4)} (1.5% of 0.8 is 0.012)`);
  // None asked for, none given: critically damped, it never passes the level.
  const plain = run(meterBallistics({ riseTime: 300 }), 0, 0.8, 1200);
  assert.ok(Math.max(...plain.map((frame) => frame.pos)) <= 0.8 + 1e-6);
  assert.deepEqual(meterBallistics({ riseTime: 300 }), { rise: 300, fall: 300, overshoot: 0 }, 'a fall not given takes the rise');
});

test('ballistics: a PPM leaps up and sinks back slowly; with none, the needle jumps', () => {
  const ppm = meterBallistics({ riseTime: 20, fallTime: 1500 });
  const up = run(ppm, 0, 0.9, 64);
  assert.ok(up.at(-1).pos > 0.85, `up in a few frames (${up.at(-1).pos.toFixed(3)})`);
  const down = run(ppm, 0.9, 0.1, 500);
  assert.ok(down.at(-1).pos > 0.3, `half a second on it is still on its way down (${down.at(-1).pos.toFixed(3)})`);
  assert.deepEqual(stepNeedle({ pos: 0.2, vel: 0 }, 0.7, 16, null), { pos: 0.7, vel: 0 });
  // A hidden tab hands it a long gap: taken as a quarter of a second, and it stays on the scale.
  const later = stepNeedle({ pos: 0, vel: 0 }, 1, 60000, meterBallistics({ riseTime: 30, overshoot: 0.5 }));
  assert.ok(later.pos >= 0 && later.pos <= 1.06);
});

test('the drawing follows the needle; the reading stays the level', () => {
  const cfg = { valueMin: 0, valueMax: 1, __value: 0.8 };
  assert.equal(meterDrawnPosition(cfg), 0.8, 'no needle on its way: the level');
  assert.equal(meterDrawnPosition({ ...cfg, __drawn: 0.35 }), 0.35, 'on its way: where it is');
  assert.equal(meterDrawnPosition({ ...cfg, __drawn: 1.04 }), 1, 'past the pin, drawn at the pin');
  assert.equal(meterDrawnPosition({ value: 0.4 }), 0.4, 'nothing arriving: its own value');
});

// A value effect on a meter with ballistics (editor/CanvasControl.svelte): the effect says where the
// needle is going, the spring how it gets there. Left open by phase 2 ("a Self-test on a Lazy needle
// sweeps as fast as on any other") and done since.
test('a value effect moves a needle through its ballistics, and hands back to the level without a jump', () => {
  const live = 0.3;
  // A sweep from the level to the top and back over 600 ms, as Self-test draws.
  const sweep = (t) => (t > 600 ? null : t < 300 ? live + (1 - live) * (t / 300) : 1 - (1 - live) * ((t - 300) / 300));
  const run = (ballistics) => {
    let state = null;
    const drawn = [];
    for (let t = 0; t <= 4000; t += 16) {
      state = effectNeedleStep(state, { effect: sweep(t), live, now: t, ballistics });
      drawn.push(state ? state.pos : live);
      if (!state && t > 600) break;
    }
    return drawn;
  };
  const lazy = run(meterBallistics({ riseTime: 900, fallTime: 1400 }));
  const vu = run(meterBallistics({ riseTime: 300, fallTime: 300, overshoot: 0.015 }));
  const peak = (list) => Math.max(...list);
  assert.ok(peak(lazy) < 0.8, `the lazy needle never catches the sweep: ${peak(lazy).toFixed(2)}`);
  assert.ok(peak(vu) > peak(lazy) + 0.1, `a VU follows it closer: ${peak(vu).toFixed(2)} against ${peak(lazy).toFixed(2)}`);
  for (const list of [lazy, vu]) {
    const steps = list.slice(1).map((pos, i) => Math.abs(pos - list[i]));
    assert.ok(Math.max(...steps) < 0.06, `no jump, at most ${Math.max(...steps).toFixed(3)} a frame`);
    assert.ok(Math.abs(list.at(-1) - live) < 1e-3, 'handed back on the level');
  }
  assert.ok(lazy.length * 16 > 600, 'still on its way after the sweep, then handed back');
  // Started where it is drawn, at rest.
  assert.deepEqual(effectNeedleStep(null, { effect: 0.9, live: 0.4, now: 1000, ballistics: meterBallistics({ riseTime: 300 }) }).at, 1000);
  assert.match(readFileSync(new URL('../src/CE_Application/editor/CanvasControl.svelte', import.meta.url), 'utf8'),
    /effectNeedle = effectNeedleStep\(effectNeedle, \{ effect: effectValue, live: liveNormalized, now: nowMs\(\), ballistics: effectBallistics \}\);/);
});
