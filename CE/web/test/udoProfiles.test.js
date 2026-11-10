/**
 * The UDO profiles: generated from the MIDI specifications of the Super 6's and the Super Gemini's
 * and Super 8's manuals by tools/profiles/udo/, and checked here that what is committed is what the
 * generator makes, that the app's validator finds nothing wrong, and that every parameter is the
 * NRPN or controller its row prints. The tables are read by the Behringer anchored-row reader,
 * checked in its own suite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readValues } from '../../../tools/profiles/udo/build-udo-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/udo/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

test('a value cell: a range, the values printed, and a list that prints its two ends', () => {
  assert.deepEqual(readValues('0-16383'), { lo: 0, hi: 16383 });
  assert.deepEqual(readValues('0 = Triangle 21 = Square 43 = Random 64 = Saw 85 = HF 107 = HF TRK').choices.map((c) => c.value), [0, 21, 43, 64, 85, 107]);
  assert.deepEqual(readValues('0 = MIDI Channel 1 15 = MIDI Channel 16'), { lo: 0, hi: 15, shown: [1, 16] });
  assert.deepEqual(readValues('0 = Off 1 = On').choices, [{ value: 0, label: 'Off' }, { value: 1, label: 'On' }]);
  assert.deepEqual(readValues('-'), {});
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data, layout } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/udo/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every parameter is its NRPN or controller at both ends of its range, each message once, every row laid out or named`, () => {
    const sent = new Set();
    for (const p of profile.parameters) {
      const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
      assert.ok(!sent.has(r.id), `${r.id} twice`);
      sent.add(r.id);
      const status = 0xb0 + profile.variables[r.channel.slice(1)] - 1;
      const values = p.type === 'choice' ? p.choices.map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
      for (const [value, wire] of values) {
        const want = r.kind === 'cc' ? hex([status, r.controller, wire]) : [[0x63, r.parameterMsb], [0x62, r.parameterLsb], [0x06, wire >> 7], [0x26, wire & 127]].map(([c, v]) => hex([status, c, v])).join('\n');
        assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value })), want, `${p.id} = ${value}`);
      }
    }
    for (const t of profile.tests) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
    const named = (n) => profile.parameters.some((p) => p.name === n) || profile.authoringNotes.some((x) => x.includes(n));
    for (const row of [...data.cc, ...data.nrpn]) if (row.name && row.name !== '-') assert.ok(named(layout.rename?.[row.name] ?? row.name), `${row.cc ?? row.nrpn} ${row.name}`);
  });

  test(`${profile.id}: the source is UDO's manual, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'UDO');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
  });
}

const builtProfile = (id) => BUILT.find((b) => b.profile.id === id)?.profile;
const param = (profile, group, name) => profile.parameters.find((p) => p.group === group && p.name === name);
const recipeOf = (profile, p) => profile.messageRecipes.find((r) => r.id === p.messageRecipe);

test('the Super 6: a parameter both tables give is its 14-bit NRPN; a switch its controller and values', () => {
  const s6 = builtProfile('udo-super-6');
  const cutoff = param(s6, 'Filter', 'VCF Cutoff Frequency');
  assert.deepEqual([recipeOf(s6, cutoff).parameterMsb, recipeOf(s6, cutoff).parameterLsb, cutoff.range.max], [8, 0x4a, 16383]);
  assert.equal(lines(localCompileParameter(s6, { parameterId: cutoff.id, value: 8192 })), 'B0 63 08\nB0 62 4A\nB0 06 40\nB0 26 00');
  assert.match(cutoff.description, /also CC 74/);
  const wave = param(s6, 'LFO 1', 'LFO 1 Waveform/HF Mode');
  assert.deepEqual([recipeOf(s6, wave).controller, wave.choices.map((c) => c.value)], [16, [0, 21, 43, 64, 85, 107]]);
  assert.deepEqual(param(s6, 'Global Settings', 'MIDI Channel').display, { mode: 'number', unit: '', shortLabel: 'midiChannel', min: 1, max: 16 });
});

test('the Super Gemini: every parameter for each layer, the lower on the channel above the base', () => {
  const sg = builtProfile('udo-super-gemini');
  const s8 = builtProfile('udo-super-8');
  assert.equal(sg.parameters.length, 2 * s8.parameters.length - 2, 'all of the Super 8\'s, twice, less its receive-only detune');
  const lower = param(sg, 'Lower Filter', 'VCF Cutoff Frequency');
  assert.equal(recipeOf(sg, lower).channel, '$lowerChannel');
  assert.equal(lines(localCompileParameter(sg, { parameterId: lower.id, value: 0 })).split('\n')[0], 'B1 63 08');
  assert.ok(param(sg, 'Upper Global', 'Lower Layer Detune'));
  assert.ok(param(s8, 'Global', 'Layer Detune'));
});
