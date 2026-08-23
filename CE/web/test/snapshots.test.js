// snapshots.test.js — capture, morph, diff and randomise.
//
// One test file for four features because they are one capability: every consumer the design doc
// lists — Macro/Snapshot-Morph, the Vector Joystick's four corners, the Crossfader's A/B, a Pad Grid
// launching scenes, Patch Diff, the Randomizer — is "blend or recall full device states", and the
// interesting failures are shared between them.
//
// THE FAILURES BEING DESIGNED AGAINST, in the order they would bite:
//
//   A midpoint that does not exist. A five-way waveform selector halfway between Saw and Square is
//   not 1.5 — there is no such waveform, and the byte either rounds somewhere arbitrary or is not a
//   waveform at all. Every parameter needs an explicit policy, and `valueKind` already carries it.
//
//   A capture full of zeroes. A control nobody has touched has no value; recording 0 for it makes
//   "recall" a reset wearing a snapshot's clothes.
//
//   A flooded cable. DIN MIDI is 31,250 baud — about 1,000 three-byte messages a second with
//   nothing else on the wire. A 200-parameter morph at 60fps wants 12,000.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MORPH_POLICY, captureValues, diffSnapshots, makeSnapshot, morphPolicyFor,
  morphSendPlan, morphSnapshots, morphValue, morphWeighted,
} from '../src/CE_Application/utils/snapshotModel.js';
import {
  RANDOMIZE_MODE, isRandomizable, randomValueFor, randomizeValues, seededRandom,
} from '../src/CE_Application/utils/randomizer.js';
import {
  clampToParameter, parameterDoor, readParameterValue, writeParameterPatch,
} from '../src/CE_Application/utils/panelValueAccess.js';
import { createPanel, deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';

const cutoff = { id: 'k.value', path: 'k.value', min: 0, max: 127, valueKind: 'float' };
const wave = { id: 'w.value', path: 'w.value', min: 0, max: 4, valueKind: 'choice' };
const name = { id: 't.text', path: 't.text', min: 0, max: 1, valueKind: 'text' };
const rate = { id: 'a.rate', path: 'a.rate', min: 0.1, max: 32, valueKind: 'float', section: 'Arp', field: 'rate' };
const PARAMS = [cutoff, wave, name, rate];

const snap = (values, extra = {}) => makeSnapshot({ name: 'x', values, now: 'fixed', ...extra });

// --- where a value lives -------------------------------------------------------------------------

test('each export door is read and written in its own place', () => {
  // Three doors, genuinely different. Four private copies of this routing would be four chances to
  // disagree about where a value is.
  assert.equal(parameterDoor(cutoff), 'behavior');
  assert.equal(parameterDoor(rate), 'section');
  assert.equal(parameterDoor({ id: 'c.mainValue', path: 'c.mainValue' }), 'channel');

  assert.equal(readParameterValue({ valueOverrideEnabled: true, valueOverride: 64 }, cutoff), 64);
  assert.equal(readParameterValue({ sectionValues: { Arp: { rate: 12 } } }, rate), 12);
  assert.equal(readParameterValue({ customValues: { mainValue: 0.4 } }, { id: 'c.mainValue', path: 'c.mainValue' }), 0.4);

  assert.deepEqual(writeParameterPatch(cutoff, 20), { valueOverrideEnabled: true, valueOverride: 20 });
  assert.deepEqual(writeParameterPatch(rate, 8, { sectionValues: { Arp: { gate: 0.5 } } }),
    { sectionValues: { Arp: { gate: 0.5, rate: 8 } } }, 'writing one field must not clear the others');
});

test('an untouched control has no value, not zero', () => {
  // The difference between a capture and a reset.
  assert.equal(readParameterValue({}, cutoff), undefined);
  assert.equal(readParameterValue(null, cutoff), undefined);
  assert.equal(readParameterValue({ valueOverrideEnabled: false }, cutoff), undefined);
});

test('a written value is clamped into the parameter it belongs to', () => {
  assert.equal(clampToParameter(cutoff, 500), 127);
  assert.equal(clampToParameter(cutoff, -3), 0);
  assert.equal(clampToParameter(cutoff, 'nonsense'), 0);
});

// --- capture ---------------------------------------------------------------------------------------

test('capture records what has a value and omits what does not', () => {
  const values = captureValues(PARAMS, (p) => (p.id === 'k.value' ? 64 : undefined));
  assert.deepEqual(values, { 'k.value': 64 });
});

test('a scope is a predicate, so "just the filter" and "just this group" are one mechanism', () => {
  const values = captureValues(PARAMS, () => 1, (p) => p.id.startsWith('k.'));
  assert.deepEqual(Object.keys(values), ['k.value']);
});

// --- morph -------------------------------------------------------------------------------------

test('a continuous parameter blends; a choice does not', () => {
  assert.equal(morphPolicyFor(cutoff), MORPH_POLICY.lerp);
  assert.equal(morphPolicyFor(wave), MORPH_POLICY.nearest);
  assert.equal(morphPolicyFor(name), MORPH_POLICY.hold);
  assert.equal(morphPolicyFor(undefined), MORPH_POLICY.lerp, 'an unknown parameter is treated as continuous');

  assert.equal(morphValue(0, 100, 0.25), 25);
  // There is no waveform 1.5. Halfway lands on one end.
  assert.equal(morphValue(0, 4, 0.4, MORPH_POLICY.nearest), 0);
  assert.equal(morphValue(0, 4, 0.6, MORPH_POLICY.nearest), 4);
  assert.equal(morphValue(0, 4, 0.5, MORPH_POLICY.nearest), 4, 'exactly half is symmetric on the way back');
  assert.equal(morphValue('a', 'b', 0.9, MORPH_POLICY.hold), 'a');
  assert.equal(morphValue('a', 'b', 1, MORPH_POLICY.hold), 'b');
});

test('t is clamped, so an overshooting corner weight cannot leave the range', () => {
  assert.equal(morphValue(0, 100, 1.4), 100);
  assert.equal(morphValue(0, 100, -0.3), 0);
});

test('a parameter only one snapshot carries is left alone, not dragged toward nothing', () => {
  // What makes a partial snapshot — "just the filter" — composable with a whole-panel one.
  const out = morphSnapshots(snap({ 'k.value': 20 }), snap({ 'w.value': 3 }), 0.5, PARAMS);
  assert.equal(out['k.value'], 20);
  assert.equal(out['w.value'], 3);
});

test('weighted morph normalises over the snapshots that actually carry the parameter', () => {
  // Otherwise a parameter present in one of four corners is dragged three-quarters toward nothing.
  const out = morphWeighted([
    { snapshot: snap({ 'k.value': 0 }), weight: 1 },
    { snapshot: snap({ 'k.value': 100 }), weight: 3 },
    { snapshot: snap({}), weight: 4 },
  ], PARAMS);
  assert.equal(out['k.value'], 75);
});

test('a stepped parameter takes the heaviest snapshot, never an average', () => {
  const out = morphWeighted([
    { snapshot: snap({ 'w.value': 0 }), weight: 1 },
    { snapshot: snap({ 'w.value': 4 }), weight: 9 },
  ], PARAMS);
  assert.equal(out['w.value'], 4);
});

test('a stepped parameter the heaviest snapshot lacks falls to the next heaviest that has it', () => {
  const out = morphWeighted([
    { snapshot: snap({}), weight: 9 },
    { snapshot: snap({ 'w.value': 2 }), weight: 5 },
    { snapshot: snap({ 'w.value': 1 }), weight: 1 },
  ], PARAMS);
  assert.equal(out['w.value'], 2);
});

test('weights that are zero or nonsense contribute nothing', () => {
  assert.deepEqual(morphWeighted([], PARAMS), {});
  assert.deepEqual(morphWeighted([{ snapshot: snap({ 'k.value': 5 }), weight: 0 }], PARAMS), {});
  assert.deepEqual(morphWeighted([{ snapshot: snap({ 'k.value': 5 }), weight: NaN }], PARAMS), {});
});

// --- the send budget ------------------------------------------------------------------------------

test('a morph tick sends the parameters that moved most, and counts what it could not', () => {
  // A 200-parameter morph at 60fps wants 12,000 messages a second; a DIN cable carries about 1,000.
  const previous = { a: 0, b: 0, c: 0 };
  const next = { a: 1, b: 50, c: 10 };
  const plan = morphSendPlan(previous, next, { budget: 2 });
  assert.deepEqual(plan.send.map((s) => s.id), ['b', 'c'], 'biggest movers first');
  assert.equal(plan.deferred, 1, 'and what was dropped is counted, not silent');
});

test('a parameter that has not moved is not sent again', () => {
  assert.deepEqual(morphSendPlan({ a: 5 }, { a: 5 }, { budget: 10 }).send, []);
});

test('a parameter seen for the first time always goes out', () => {
  const plan = morphSendPlan({}, { a: 1, b: 2 }, { budget: 10 });
  assert.equal(plan.send.length, 2);
});

// --- diff -----------------------------------------------------------------------------------------

test('a diff separates changed from present-on-one-side-only', () => {
  // Different questions to a user: the first is an edit, the second is a parameter one side never
  // captured.
  const result = diffSnapshots(
    snap({ 'k.value': 20, 'w.value': 1, 'a.rate': 6 }),
    snap({ 'k.value': 90, 'w.value': 1, 't.text': 0 }),
    PARAMS);

  assert.deepEqual(result.changed.map((c) => c.id), ['k.value']);
  assert.deepEqual(result.onlyInA.map((c) => c.id), ['a.rate']);
  assert.deepEqual(result.onlyInB.map((c) => c.id), ['t.text']);
  assert.equal(result.same, 1);
});

test('changes sort by how far they moved through their own range, not by raw delta', () => {
  // A cutoff moving 40 of 127 and a resonance moving 0.9 of 1 have to sort against each other
  // honestly; raw delta would put every wide-range parameter on top.
  const wide = { id: 'wide', min: 0, max: 1000, valueKind: 'float' };
  const narrow = { id: 'narrow', min: 0, max: 1, valueKind: 'float' };
  const result = diffSnapshots(snap({ wide: 0, narrow: 0 }), snap({ wide: 100, narrow: 0.9 }), [wide, narrow]);
  assert.deepEqual(result.changed.map((c) => c.id), ['narrow', 'wide']);
});

test('a diff of a snapshot with itself is all-same', () => {
  const a = snap({ 'k.value': 20, 'w.value': 1 });
  const result = diffSnapshots(a, a, PARAMS);
  assert.equal(result.changed.length, 0);
  assert.equal(result.same, 2);
});

// --- randomiser -------------------------------------------------------------------------------------

test('a text parameter and a one-value parameter cannot be randomised', () => {
  // A random patch name is a random string, which is vandalism rather than randomisation.
  assert.equal(isRandomizable(cutoff), true);
  assert.equal(isRandomizable(name), false);
  assert.equal(isRandomizable({ min: 5, max: 5, valueKind: 'float' }), false);
});

test('a stepped parameter always lands on a whole step', () => {
  // Handing a synth 2.4 for a five-way selector is the class of thing the constraint exists for.
  for (const r of [0, 0.1, 0.37, 0.5, 0.99]) {
    const value = randomValueFor(wave, () => r);
    assert.equal(value, Math.round(value), `r=${r} produced ${value}`);
    assert.ok(value >= 0 && value <= 4);
  }
});

test('every generated value is inside the profile\'s own range', () => {
  const random = seededRandom(7);
  const { values } = randomizeValues(PARAMS, { random });
  for (const [id, value] of Object.entries(values)) {
    const parameter = PARAMS.find((p) => p.id === id);
    assert.ok(value >= parameter.min && value <= parameter.max, `${id} = ${value}`);
  }
});

test('humanize moves a value a little, from where it already is', () => {
  // The mode people actually reach for: the patch you have, slightly different.
  const current = { 'k.value': 64 };
  const { values } = randomizeValues([cutoff], {
    mode: RANDOMIZE_MODE.humanize, current, random: () => 1,
  });
  assert.ok(values['k.value'] > 64 && values['k.value'] <= 64 + 0.08 * 127 + 0.001);

  const down = randomizeValues([cutoff], { mode: RANDOMIZE_MODE.humanize, current, random: () => 0 });
  assert.ok(down.values['k.value'] < 64);
});

test('a locked parameter is never written', () => {
  const { values, skipped } = randomizeValues(PARAMS, { locked: new Set(['k.value']) });
  assert.ok(!('k.value' in values));
  assert.deepEqual(skipped.locked, ['k.value']);
});

test('a scoped run only touches its groups', () => {
  const grouped = [{ ...cutoff, group: 'Filter' }, { ...wave, group: 'OSC' }];
  const { values } = randomizeValues(grouped, { mode: RANDOMIZE_MODE.scoped, groups: ['Filter'] });
  assert.deepEqual(Object.keys(values), ['k.value']);
});

test('a run that changes nothing says why, rather than shrugging', () => {
  // A randomiser that appears to do nothing is indistinguishable from a broken one.
  assert.match(randomizeValues([], {}).reason, /no parameters/i);
  assert.match(randomizeValues([cutoff], { locked: ['k.value'] }).reason, /locked/i);
  assert.match(randomizeValues([name], {}).reason, /nothing to draw from/i);
  assert.equal(randomizeValues([cutoff], {}).reason, '', 'a run that did something explains nothing');
});

test('the same seed produces the same patch, twice', () => {
  // So a randomisation can be written down and handed to somebody else.
  const a = randomizeValues(PARAMS, { random: seededRandom(42) }).values;
  const b = randomizeValues(PARAMS, { random: seededRandom(42) }).values;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, randomizeValues(PARAMS, { random: seededRandom(43) }).values);
});

// --- the document ----------------------------------------------------------------------------------

test('snapshots travel with the panel', () => {
  // So a shared panel carries the scenes somebody built, not just the controls.
  const panel = createPanel('x');
  panel.snapshots = [snap({ 'k.value': 1 }, { id: 's1', name: 'Bright' })];
  const reopened = deserializePanel(serializePanel(panel), null, 'x');
  assert.equal(reopened.snapshots.length, 1);
  assert.equal(reopened.snapshots[0].name, 'Bright');
});

test('a panel with no snapshots writes no key', () => {
  const document = JSON.parse(serializePanel(createPanel('x')));
  assert.ok(!('snapshots' in document), 'an empty array on every panel would be noise in every fixture');
});
