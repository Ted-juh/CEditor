import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENVELOPE_BOX, envelopeBendFromDrag, envelopeDragFields, envelopeGeometry, envelopeTimeFromPosition,
  envelopeTimePosition, formatEnvelopeTime, lfoPath, lfoShapeAt, shapeEnvelopeProgress, STEP_ROWS,
  stepRateHz, stepRowHeight, stepRowsFor, stepRowValue,
} from '../src/CE_Application/utils/modulatorShapes.js';

const envelope = (fields = {}) => ({
  attackMs: 10, decayMs: 200, sustain: 0.6, releaseMs: 400, curve: 0, stage: 'idle', stageProgress: 0, value: 0,
  ...fields,
});

test('envelope stages bend exactly as the engine bends them', () => {
  assert.equal(shapeEnvelopeProgress(0.5, 0, false), 0.5, 'curve 0 is a straight line');
  assert.equal(shapeEnvelopeProgress(0.5, 1, false), 0.5 ** 4, 'curve +1 rises late (p^4)');
  assert.equal(shapeEnvelopeProgress(0.5, -1, false), 0.5 ** 0.25);
  assert.equal(shapeEnvelopeProgress(0.5, 1, true), 1 - 0.5 ** 4, 'falling stages mirror it');
  assert.equal(shapeEnvelopeProgress(2, 0, false), 1, 'progress is clamped');
});

test('envelope times round-trip through the log scale', () => {
  assert.equal(envelopeTimeFromPosition(0), 0);
  assert.equal(envelopeTimeFromPosition(1), 60000);
  for (const ms of [0, 5, 100, 1500, 60000])
    assert.ok(Math.abs(envelopeTimeFromPosition(envelopeTimePosition(ms)) - ms) <= 5, `${ms} ms`);
  assert.equal(formatEnvelopeTime(250), '250 ms');
  assert.equal(formatEnvelopeTime(1500), '1.50 s');
  assert.equal(formatEnvelopeTime(20000), '20 s');
});

test('the envelope picture puts each handle where its stage ends', () => {
  const g = envelopeGeometry(envelope());
  assert.equal(g.attack.y, ENVELOPE_BOX.top, 'the attack peaks at the top');
  assert.ok(g.attack.x > ENVELOPE_BOX.left && g.decay.x > g.attack.x && g.release.x > g.hold.x);
  assert.equal(g.release.y, ENVELOPE_BOX.bottom);
  const sustainY = ENVELOPE_BOX.bottom - 0.6 * (ENVELOPE_BOX.bottom - ENVELOPE_BOX.top);
  assert.ok(Math.abs(g.decay.y - sustainY) < 1e-9, 'the decay corner sits at the sustain level');
  assert.equal(g.hold.x - g.decay.x, ENVELOPE_BOX.hold);
  assert.match(g.path, /^M10\.00,112\.00 L/);
  const zero = envelopeGeometry(envelope({ attackMs: 0 }));
  assert.equal(zero.attack.x, ENVELOPE_BOX.left, 'no attack draws a vertical rise');
});

test('dragging a handle gives back the time it points at', () => {
  const g = envelopeGeometry(envelope());
  const attack = envelopeDragFields('attack', { x: g.attack.x, y: 0 }, g);
  assert.ok(Math.abs(attack.attackMs - 10) <= 5, 'dragging the attack peak to itself changes nothing');
  const decay = envelopeDragFields('decay', { x: g.decay.x, y: g.decay.y }, g);
  assert.ok(Math.abs(decay.decayMs - 200) <= 5);
  assert.equal(decay.sustain, 0.6);
  const released = envelopeDragFields('release', { x: g.hold.x + ENVELOPE_BOX.segment, y: 0 }, g);
  assert.equal(released.releaseMs, 60000, 'the full segment width is sixty seconds');
  assert.deepEqual(envelopeDragFields('decay', { x: 0, y: 999 }, g), { decayMs: 0, sustain: 0 }, 'dragged past the edges it clamps');
  assert.equal(envelopeBendFromDrag(0, 30), 0.5);
  assert.equal(envelopeBendFromDrag(0.8, 60), 1);
});

test('the envelope marker follows the stage it is in', () => {
  const g = envelopeGeometry(envelope({ stage: 'release', stageProgress: 0.5, value: 0.3 }));
  assert.equal(g.marker.x, (g.hold.x + g.release.x) / 2);
  assert.ok(Math.abs(g.marker.y - (ENVELOPE_BOX.bottom - 0.3 * (ENVELOPE_BOX.bottom - ENVELOPE_BOX.top))) < 1e-9);
});

test('LFO shapes are the engine formulas, and the path honours range and phase', () => {
  assert.equal(lfoShapeAt('sine', 0), 0);
  assert.equal(lfoShapeAt('sine', 0.5), 1);
  assert.equal(lfoShapeAt('triangle', 0.25), 0.5);
  assert.equal(lfoShapeAt('sawDown', 0.25), 0.75);
  assert.equal(lfoShapeAt('square', 0.49), 0);
  assert.equal(lfoShapeAt('square', 0.5), 1);
  assert.equal(lfoShapeAt('sawUp', 1.25), 0.25, 'phase wraps');
  const narrow = lfoPath({ shape: 'square', minimum: 0.25, maximum: 0.75, phaseOffset: 0 }, 100, 104, { cycles: 1, pad: 2 });
  const ys = [...narrow.matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
  assert.equal(Math.min(...ys), 2 + 0.25 * 100, 'the maximum is the top of the wave');
  assert.equal(Math.max(...ys), 2 + 0.75 * 100);
  const shifted = lfoPath({ shape: 'sawUp', minimum: 0, maximum: 1, phaseOffset: 0.5 }, 100, 104, { cycles: 1, pad: 2 });
  assert.match(shifted, /^M0\.00,52\.00/, 'a half-cycle offset starts the saw halfway up');
});

test('a free rate steps by ratio and keeps sensible digits', () => {
  assert.equal(stepRateHz(1, 1), 1.06);
  assert.equal(stepRateHz(1, -1, true), 0.99);
  assert.equal(stepRateHz(0.01, -5), 0.01, 'clamped at the bottom');
  assert.equal(stepRateHz(40, 3), 40, 'and at the top');
  assert.equal(stepRateHz(20, 1), 21.2);
});

test('step rows map a bar height to the stored value and back', () => {
  assert.deepEqual(stepRowsFor('note'), ['velocity', 'gate', 'probability', 'microtiming', 'ratchets']);
  assert.deepEqual(stepRowsFor('cc'), ['probability', 'microtiming']);
  assert.equal(stepRowValue('velocity', 1), 127);
  assert.equal(stepRowValue('velocity', 0), 1, 'a drawn note is never silent');
  assert.equal(stepRowValue('gate', 0.5), 1, 'half height is exactly one step');
  assert.equal(stepRowValue('gate', 1), 4);
  assert.equal(stepRowValue('gate', 0), 0.05);
  assert.equal(stepRowValue('probability', 0.52), 50, 'chance snaps to fives');
  assert.equal(stepRowValue('microtiming', 0.5), 0, 'the middle is on time');
  assert.equal(stepRowValue('microtiming', 0), -0.5);
  assert.equal(stepRowValue('ratchets', 1), 8);
  for (const [row, value] of [['velocity', 100], ['gate', 0.5], ['gate', 2], ['probability', 75], ['microtiming', 0.2], ['ratchets', 3]])
    assert.ok(Math.abs(stepRowValue(row, stepRowHeight(row, value)) - value) < 0.051, `${row} ${value}`);
  assert.equal(STEP_ROWS.gate.format(1), '1 step');
  assert.equal(STEP_ROWS.microtiming.format(-0.25), 'early 25%');
});
