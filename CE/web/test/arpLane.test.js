// The arpeggiator lane's editing rules: rows in use stay the lane's length, untouched rows
// stay empty (the engine reads empty as "plain"), and the written patterns only use values
// the engine accepts (ArpEngine / applyArpFields clamp to these same ranges).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROWS, RATE_CHOICES, ARP_PATTERNS, ARP_MODES, laneLength, resizeLane, setLaneCell,
  nextRepeats, nextOctave, nextChance, clearLane,
} from '../src/CE_Application/utils/arpLane.js';
import { normalizeMidiSlot } from '../src/CE_Application/stores/instrumentHost.js';

const plain = () => normalizeMidiSlot({ type: 'arp' }).arp;

test('a fresh arp has an empty lane of sixteen plain steps', () => {
  const arp = plain();
  assert.equal(laneLength(arp), 16);
  for (const { field } of Object.values(ROWS)) assert.deepEqual(arp[field], [], field);
  assert.equal(arp.feel, 'straight');
});

test('setting one cell starts that row at the lane length and leaves the others empty', () => {
  const arp = { ...plain(), velocityPattern: Array(8).fill(100) };
  const fields = setLaneCell(arp, 'repeats', 3, 2);
  assert.deepEqual(fields, { ratchetPattern: [1, 1, 1, 2, 1, 1, 1, 1] });
  assert.equal(Object.keys(fields).length, 1);
});

test('resizing stretches the rows in use with plain steps and cuts them back', () => {
  const arp = { ...plain(), velocityPattern: [120, 0], tiePattern: [1, 0, 1, 0] };
  assert.deepEqual(resizeLane(arp, 6), {
    velocityPattern: [120, 0, 100, 100, 100, 100], tiePattern: [1, 0, 1, 0, 0, 0],
  });
  assert.deepEqual(resizeLane(arp, 2), { velocityPattern: [120, 0], tiePattern: [1, 0] });
  assert.deepEqual(clearLane().ratchetPattern, []);
});

test('clicks cycle each row through the values the engine plays', () => {
  assert.deepEqual([1, 2, 3, 4].map(nextRepeats), [2, 3, 4, 1]);
  assert.deepEqual([0, 1, 2, -2, -1].map(nextOctave), [1, 2, -2, -1, 0]);
  assert.deepEqual([100, 75, 50, 25].map(nextChance), [75, 50, 25, 100]);
});

test('the written patterns stay inside what the engine accepts', () => {
  const modes = new Set(ARP_MODES.map((m) => m.value));
  const rates = new Set(RATE_CHOICES.map(([n]) => n));
  const ids = new Set();
  for (const p of ARP_PATTERNS) {
    assert.ok(!ids.has(p.id), `${p.id} is unique`); ids.add(p.id);
    const f = p.fields;
    if (f.mode) assert.ok(modes.has(f.mode), `${p.id} mode`);
    if (f.stepsPerBeat) assert.ok(rates.has(f.stepsPerBeat), `${p.id} rate`);
    assert.ok(['straight', 'triplet', 'dotted'].includes(f.feel), `${p.id} feel`);
    (f.velocityPattern ?? []).forEach((v) => assert.ok(v >= 0 && v <= 127));
    (f.ratchetPattern ?? []).forEach((v) => assert.ok(v >= 1 && v <= 4));
    (f.tiePattern ?? []).forEach((v) => assert.ok(v === 0 || v === 1));
    (f.octavePattern ?? []).forEach((v) => assert.ok(v >= -2 && v <= 2));
    (f.chancePattern ?? []).forEach((v) => assert.ok(v >= 0 && v <= 100));
    (f.degreePattern ?? []).forEach((v) => assert.ok(v >= -1 && v <= 63));
    for (const { field } of Object.values(ROWS)) assert.ok(field in f, `${p.id} sets ${field}, so no old row lingers`);
  }
});

test('the lane rows normalize and clamp like the native side', () => {
  const arp = normalizeMidiSlot({ type: 'arp', arp: {
    ratchetPattern: [0, 9], tiePattern: [2], octavePattern: [-5, 5], chancePattern: [150], feel: 'swung',
  } }).arp;
  assert.deepEqual(arp.ratchetPattern, [1, 4]);
  assert.deepEqual(arp.tiePattern, [1]);
  assert.deepEqual(arp.octavePattern, [-2, 2]);
  assert.deepEqual(arp.chancePattern, [100]);
  assert.equal(arp.feel, 'straight', 'an unknown feel reads as straight');
});
