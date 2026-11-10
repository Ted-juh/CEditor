/**
 * The Modal profiles: generated from the MIDI CC implementation chart of each manual by
 * tools/profiles/modal/, and checked here that what is committed is what the generator makes, that
 * the app's validator finds nothing wrong, and that every parameter is the controller its row prints.
 *
 * The charts are read by the Nord reader (the newer four-column charts) and the Behringer
 * anchored-row reader (the older ones, a value cell over several lines); both are checked in their
 * own suites. What is new here is the reading of a value cell.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { groupOfName, readValues } from '../../../tools/profiles/modal/build-modal-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/modal/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

test('a value cell: ranges, offsets, named values both ways round, bands; a sweep is not a choice', () => {
  assert.deepEqual(readValues('0 - 127'), { lo: 0, hi: 127 });
  assert.deepEqual(readValues('0 - 48 (-24 OFFSET)'), { lo: 0, hi: 48, shownFrom: -24 });
  assert.deepEqual(readValues('0 - 55 (0 - 63 in PW)'), { lo: 0, hi: 63, text: '0 - 55 (0 - 63 in PW)' });
  assert.deepEqual(readValues('OFF = 0 - ON = 127').choices, [{ value: 0, label: 'OFF' }, { value: 127, label: 'ON' }]);
  assert.deepEqual(readValues('0 = LINEAR - 1 = EXPO').choices, [{ value: 0, label: 'LINEAR' }, { value: 1, label: 'EXPO' }]);
  assert.deepEqual(readValues('0 - 42 = Mono; 43 - 85 = Duo; 86 - 127 = Poly;').choices.map((c) => [c.label, c.value]), [['Mono', 0], ['Duo', 43], ['Poly', 86]]);
  assert.ok(readValues('0-32 Sine to Triangle / 33-64 - Triangle to Sawtooth / 65-96 - Sawtooth to Square / 97-127 - Square to Sample and Hold').text);
  assert.ok(readValues('0 - 21 Sine / 22-42 Tri / 43-63 Saw / 64-127 PWM duty 50% - 5%').text);
  assert.ok(readValues('Dry - Wet').text);
  assert.deepEqual(readValues('-'), {});
  assert.deepEqual(['OSC1 - Wave', 'VCF-EG - Attack', 'FEG Decay', 'LFO2 Rate', 'ModSlot 3 Dest', 'Mod Slot 3 Dest', 'Arp Gate', 'Patch Gain'].map(groupOfName), ['OSC1', 'VCF-EG', 'Filter Env', 'LFO 2', 'Mod Matrix', 'Mod Matrix', 'Arp', 'Global']);
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/modal/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its controller at both ends of its range, a controller twice only where said, every row laid out or named`, () => {
    const ccs = new Set();
    for (const p of profile.parameters) {
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      assert.ok(!ccs.has(r.controller) || profile.authoringNotes.some((n) => n.includes(`CC ${r.controller}: `)), `CC ${r.controller} twice, and not said`);
      ccs.add(r.controller);
      const values = p.type === 'choice' ? p.choices.map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of values) assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value })), hex([0xb0, r.controller, wire]), `${p.id} = ${value}`);
    }
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
    for (const row of data.rows) {
      const cc = Number(row.cc);
      assert.ok(ccs.has(cc) || profile.authoringNotes.some((n) => n.includes(`CC ${cc} ${row.name}`) || (/^-*$/.test(row.name) && /unused/.test(n) && new RegExp(`\\b${cc}\\b`).test(n))), `CC ${cc} ${row.name}`);
    }
  });

  test(`${profile.id}: the source is Modal's manual, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Modal');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

const builtProfile = (id) => BUILT.find((b) => b.profile.id === id)?.profile;
const param = (profile, group, name) => profile.parameters.find((p) => p.group === group && p.name === name);
const cc = (profile, p) => profile.messageRecipes.find((r) => r.id === p.messageRecipe).controller;

test('the Argon8 and its X and M: one chart, the joystick and pedals left out', () => {
  const a8 = builtProfile('modal-argon8');
  for (const id of ['modal-argon8x', 'modal-argon8m']) assert.deepEqual(builtProfile(id).parameters.map((p) => [p.id, p.messageRecipe]), a8.parameters.map((p) => [p.id, p.messageRecipe]));
  assert.equal(cc(a8, param(a8, 'Filter', 'Cutoff')), 34);
  assert.equal(cc(a8, param(a8, 'Mod Matrix', 'ModSlot 8 Dest')), 115);
  assert.equal(a8.parameters.some((p) => /^Joystick|Mod Wheel|Sustain Pedal/.test(p.name)), false);
});

test('the Carbon8: its MPE text kept out of the chart beside it', () => {
  const c8 = builtProfile('modal-carbon8');
  assert.equal(c8.parameters.some((p) => /MPE|CARBON8/.test(p.name)), false);
  assert.equal(cc(c8, param(c8, 'Mod Matrix', 'ModSlot 4 Source')), 103);
});

test('the 002 and SKULPTsynth SE: the values their charts print', () => {
  const m2 = builtProfile('modal-002');
  const note = param(m2, 'OSC1', 'OSC1 - Note');
  assert.deepEqual([note.range, note.display.min, note.display.max], [{ min: 0, max: 48 }, -24, 24]);
  assert.match(note.description, /Joystick index 23, Sequence index 24, Animator index 23/);
  assert.deepEqual(param(m2, 'OSC1', 'OSC1 - PW').choices.map((c) => [c.label, c.value]), [['OFF', 0], ['ON', 127]]);
  const sk = builtProfile('modal-skulptsynth-se');
  assert.deepEqual(param(sk, 'Global', 'Voice Mode').choices.map((c) => [c.label, c.value]), [['Mono', 0], ['Duo', 43], ['Poly', 86]]);
  assert.equal(param(sk, 'LFO 1', 'LFO1 Shape').type, 'integer');
  assert.match(param(sk, 'LFO 1', 'LFO1 Shape').description, /Sine to Triangle/);
});
