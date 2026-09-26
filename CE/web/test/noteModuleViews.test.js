// The pictures of Strum and Humanize must draw what the engines play. These pin the JS mirror to
// the rules in CE/src/Performance/NoteModules.h (StrumEngine::makeOrder / strokePosition,
// HumanizeEngine's delay-only timing).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  strokePosition, strumOrder, strumNotes, HUMANIZE_FEELS, humanizeFeelOf, beatsToMs, humanizeExample, guitarVoicing,
} from '../src/CE_Application/utils/noteModuleViews.js';

test('stroke order follows the engine for every pattern', () => {
  assert.deepEqual(strumOrder('ascending', 5), [0, 1, 2, 3, 4]);
  assert.deepEqual(strumOrder('descending', 5), [4, 3, 2, 1, 0]);
  assert.deepEqual(strumOrder('outside in', 5), [0, 4, 1, 3, 2]);
  assert.deepEqual(strumOrder('inside out', 5), [2, 1, 3, 0, 4]);
  assert.deepEqual(strumOrder('inside out', 4), [1, 2, 0, 3]);
  assert.deepEqual(strumOrder('alternate', 3), [0, 1, 2], 'the first stroke of alternate is up');
  assert.deepEqual(strumOrder('alternate', 3, true), [2, 1, 0], 'and the next is down');
  assert.deepEqual([...strumOrder('random', 6)].sort(), [0, 1, 2, 3, 4, 5], 'random still plays every note once');
});

test('stroke position is the engine curve', () => {
  assert.equal(strokePosition(0, 4, 0), 0);
  assert.equal(strokePosition(3, 4, 0), 1);
  assert.ok(Math.abs(strokePosition(1, 3, 0) - 0.5) < 1e-9, 'even feel is linear');
  assert.ok(Math.abs(strokePosition(1, 3, 1) - Math.pow(0.5, 4)) < 1e-9, 'feel +1 is t^4: the first notes bunch up');
  assert.ok(Math.abs(strokePosition(1, 3, -1) - Math.pow(0.5, 0.25)) < 1e-9, 'feel -1 is t^(1/4)');
  assert.equal(strokePosition(0, 1, 0.5), 0, 'a single note is not delayed');
});

test('a strummed chord: times and velocities', () => {
  const played = strumNotes({ pattern: 'descending', spreadBeats: 0.125, feel: 0, velocityRamp: -20 }, [40, 52, 47], 100);
  assert.deepEqual(played.map((n) => n.note), [52, 47, 40], 'high to low, from the sorted chord');
  assert.deepEqual(played.map((n) => n.atBeats), [0, 0.0625, 0.125]);
  assert.deepEqual(played.map((n) => n.velocity), [100, 90, 80], 'the ramp reaches its full amount on the last note');
});

test('humanize feels name their amounts, and hand-set amounts are custom', () => {
  for (const feel of HUMANIZE_FEELS) {
    assert.ok(feel.timing <= 0.25 && feel.velocity <= 64 && feel.gate <= 100, `${feel.id} is inside the engine limits`);
    assert.equal(humanizeFeelOf(feel), feel.id);
  }
  assert.equal(humanizeFeelOf({ timing: 0.03, velocity: 13, gate: 15 }), '');
  assert.equal(beatsToMs(0.03, 120), 15);
  assert.equal(beatsToMs(0.25, 60), 250);
});

test('the example bar only delays, stays in range, repeats, and respects protected beats', () => {
  const bar = humanizeExample({ timing: 0.05, velocity: 20 }, 11);
  assert.equal(bar.length, 16);
  assert.ok(bar.every((n) => n.lateBeats >= 0 && n.lateBeats <= 0.05), 'late only, never early, never past the amount');
  assert.ok(bar.every((n) => n.velocity >= 76 && n.velocity <= 116));
  assert.deepEqual(humanizeExample({ timing: 0.05, velocity: 20 }, 11), bar, 'same seed, same bar');
  const guarded = humanizeExample({ timing: 0.05, velocity: 20, protectBeats: true }, 11);
  assert.ok([0, 4, 8, 12].every((i) => guarded[i].lateBeats === 0), 'notes on the beat stay put');
});

test('guitar mode frets chords the way StrumEngine::guitarVoicing does', () => {
  const notes = (chord) => guitarVoicing(chord).map((v) => v.note);
  assert.deepEqual(notes([60, 64, 67]), [48, 52, 55, 60, 64], 'C: x32010');
  assert.deepEqual(notes([55, 59, 62]), [43, 47, 50, 55, 59, 67], 'G: 320003');
  assert.deepEqual(notes([57, 60, 64]), [45, 52, 57, 60, 64], 'Am: x02210');
  assert.deepEqual(notes([62, 66, 69]), [50, 57, 62, 66], 'D: xx0232');
  assert.deepEqual(guitarVoicing([60, 64, 67]).map((v) => v.string), [1, 2, 3, 4, 5],
    'and says which string each note is on');
});
