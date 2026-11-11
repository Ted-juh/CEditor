/**
 * The Vermona profiles: generated from the control change tables of two user guides (Mono Lancet '15,
 * Kick Lancet) by tools/profiles/vermona/, and checked here that what is committed is what the
 * generator makes, that the app's validator finds nothing wrong, and that every row of the guide is
 * its controller at every value it gives.
 *
 * The reader is checked on text made by hand, in each guide's shape as pdftotext -layout prints it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readSwitchTable, readValueTables } from '../../../tools/profiles/vermona/read-vermona.mjs';
import { bandsOf } from '../../../tools/profiles/vermona/build-vermona-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/vermona/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

test('the Mono Lancet\'s form: the sentence, rows whose name and description go on below', () => {
  const table = readSwitchTable([
    'For all MIDI control changes, a value of 0..63 means OFF; 64..127 means ON.',
    '',
    '  Function           CC#     Description                                     Factory',
    '                                                                              Setting',
    '  Pitch Bender       84      You can change the pitch of both               ON',
    '                             oscillators.',
    '  Modulation         85      The pulse-width can be adjusted.               ON',
    '      Wheel                  This is an effective way of sound shaping.',
    '  Legato             90      Glide only between overlapping notes.          OFF',
    '                                                                              16',
  ].join('\n'));
  assert.equal(table.meaning, '0..63 means OFF; 64..127 means ON');
  assert.deepEqual(table.rows.map((r) => [r.name, r.cc, r.factory]), [['Pitch Bender', 84, 'ON'], ['Modulation Wheel', 85, 'ON'], ['Legato', 90, 'OFF']]);
  assert.equal(table.rows[1].description, 'The pulse-width can be adjusted. This is an effective way of sound shaping.');
  assert.deepEqual(bandsOf(table.meaning), [{ value: 0, label: 'OFF' }, { value: 64, label: 'ON' }]);
});

test('the Kick Lancet\'s form: the jack and its controller, a value a line', () => {
  const tables = readValueTables([
    'The function of the GATE jack can be specified by MIDI control command #84. You need to send a',
    'corresponding value (0, 1, 2 or 3) on the set MIDI-channel to KICK LANCET:',
    '',
    '     CC# 84 Value       Description',
    '     0                  standard 5V (factory default)',
    '                        An incoming voltage of approx. 0.5 volts will trigger',
    '                        KICK LANCET at a fixed volume.',
    '     3                  dynamic',
    '                        KICK LANCET will be dynamically triggered.',
  ].join('\n'));
  assert.deepEqual(tables.map((t) => [t.jack, t.cc, t.values.map((v) => [v.value, v.label])]), [['GATE', 84, [[0, 'standard 5V (factory default)'], [3, 'dynamic']]]]);
  assert.equal(tables[0].values[0].description, 'An incoming voltage of approx. 0.5 volts will trigger KICK LANCET at a fixed volume.');
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/vermona/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every row is its controller at every value the guide gives, its default as printed`, () => {
    const rows = data.switches
      ? data.switches.rows.map((r) => ({ cc: r.cc, values: bandsOf(data.switches.meaning).map((b) => b.value), def: r.factory }))
      : data.values.map((t) => ({ cc: t.cc, values: t.values.map((v) => v.value), def: t.values.find((v) => /\(factory default\)/.test(v.label))?.value }));
    assert.equal(profile.parameters.length, rows.length);
    for (const [k, row] of rows.entries()) {
      const p = profile.parameters[k];
      assert.deepEqual(p.choices.map((c) => c.value), row.values, p.id);
      for (const c of p.choices) assert.equal(hex(localCompileParameter(profile, { parameterId: p.id, value: c.id }).transaction.messages[0].bytes), hex([0xb0, row.cc, c.value]), `${p.id} = ${c.id}`);
      const def = p.choices.find((c) => c.id === p.default);
      assert.equal(data.switches ? def.label : def.value, row.def, `${p.id} default`);
    }
    for (const t of profile.tests) assert.equal(hex(localCompileParameter(profile, { parameterId: t.parameter, value: t.value }).transaction.messages[0].bytes), t.expectedHex, t.name);
  });

  test(`${profile.id}: the source is Vermona's own, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Vermona');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.ok(profile.sources[0].notes.includes(`sha256 ${data.source.sha256}`));
    assert.match(data.source.url, /^https:\/\/www\.vermona\.com\//);
  });
}
