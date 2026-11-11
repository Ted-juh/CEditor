/**
 * The Jomox profiles: generated from the MIDI implementation of sixteen operating manuals by
 * tools/profiles/jomox/, and checked here that what is committed is what the generator makes, that
 * the app's validator finds nothing wrong, and that every row is the controller it prints, on the
 * channel its section names, at both ends of its range.
 *
 * The reader is checked on lines made by hand, in the manuals' shapes: a header naming its section
 * and channel, a section on a line of its own, a name and an internal range that go on below, values
 * named by the internal range, a channel stated for the sections after it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readControllerTables } from '../../../tools/profiles/jomox/read-jomox-cc.mjs';
import { channelsOf, namesOf, rangeOf } from '../../../tools/profiles/jomox/build-jomox-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/jomox/make-profiles.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

test('the tables: sections and channels, rows, a name and an internal range going on, a stated channel', () => {
  const text = [
    ' KICK DRUM CH1          Controller No.   Value range',
    ' Tune                   100              0-127',
    ' Select Instrument      64               0-127',
    ' for Multi Kit',
    'BASS DRUM      CONTROLLER    VALUE        INTERNAL',
    '               NO.           RANGE        RANGE',
    'HH Source      62            32-34        Nor, Fil, Noi',
    'SNARE DRUM',
    'Bass->Filter   93            13,14        Off, On',
    'LFO 1 Wave              119             0..15        Sup/Sdo/Sin/Si-/tri/tri-/r',
    '                                                         Ct/rC-/PL1-PL8',
    'Global Controllers on Channel 16',
    ' FX Reverb              Controller No.   Value range',
    ' Reverb Level           90               0-127',
  ].join('\n');
  const { rows } = readControllerTables(text);
  assert.deepEqual(rows.map((r) => [r.section, r.channel ?? null, r.name, r.cc, r.range, r.internal ?? null]), [
    ['KICK DRUM', 1, 'Tune', 100, '0-127', null],
    ['KICK DRUM', 1, 'Select Instrument for Multi Kit', 64, '0-127', null],
    ['BASS DRUM', null, 'HH Source', 62, '32-34', 'Nor, Fil, Noi'],
    ['SNARE DRUM', null, 'Bass->Filter', 93, '13,14', 'Off, On'],
    ['SNARE DRUM', null, 'LFO 1 Wave', 119, '0..15', 'Sup/Sdo/Sin/Si-/tri/tri-/rCt/rC-/PL1-PL8'],
    ['FX Reverb', 16, 'Reverb Level', 90, '0-127', null],
  ]);
});

test('ranges, names and channels as the builder reads them', () => {
  assert.deepEqual(rangeOf('0..3 MSB'), { min: 0, max: 3 });
  assert.deepEqual(rangeOf('0/32/64/96'), { values: [0, 32, 64, 96] });
  assert.deepEqual(rangeOf('13,14'), { values: [13, 14] });
  assert.deepEqual(namesOf('Off/M1/M2/M12'), ['Off', 'M1', 'M2', 'M12']);
  assert.equal(namesOf('256'), null);
  assert.equal(namesOf('0-127 64=Center'), null);
  assert.deepEqual(channelsOf({ section: 'SAMPLE CH3-CH10' }), [3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(channelsOf({ section: 'KICK DRUM', channel: 1 }), [1]);
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const sent = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');

for (const { name, profile, text, out, data } of BUILT) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/jomox/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every row is its controller on its channel at both ends of its range, or named`, () => {
    const notes = profile.authoringNotes.join('\n');
    let expected = 0;
    for (const row of data.rows) {
      const channels = channelsOf(row);
      const lsbFor = /MSB\*?$/.test(row.name) && /LSB$/.test(data.rows[data.rows.indexOf(row) + 1]?.name ?? '');
      if (/LSB$/.test(row.name) && /MSB\*?$/.test(data.rows[data.rows.indexOf(row) - 1]?.name ?? '')) continue;
      const params = profile.parameters.filter((p) => new RegExp(`^CC ${row.cc}\\b`).test(p.description) && p.description.includes(`(page ${row.page})`) && (lsbFor || p.name === row.name));
      if (!params.length) { assert.ok(notes.includes(row.name), `${row.cc} ${row.name} is neither laid out nor named`); continue; }
      expected += channels.length;
      for (const p of params) {
        const r = profile.messageRecipes.find((x) => x.id === p.messageRecipe);
        const status = 0xb0 + ((r.channel === '$channel' ? 1 : r.channel) - 1);
        if (channels[0] != null) assert.ok(channels.includes(r.channel), `${p.id}: channel ${r.channel}`);
        const ends = p.type === 'choice' ? [p.choices[0], p.choices.at(-1)].map((c) => [c.id, c.value]) : [[p.range.min, p.range.min], [p.range.max, p.range.max]];
        for (const [value, wire] of ends) {
          const want = r.lsbController != null ? [[r.controller, wire >> 7], [r.lsbController, wire & 127]] : [[row.cc, wire]];
          assert.equal(sent(localCompileParameter(profile, { parameterId: p.id, value })), want.map(([c, v]) => hex([status, c, v])).join('\n'), `${p.id} = ${value}`);
        }
      }
    }
    assert.equal(profile.parameters.length, expected, 'a parameter for each row on each of its channels');
    for (const t of profile.tests) assert.equal(sent(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
  });

  test(`${profile.id}: the source is Jomox's manual, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Jomox');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    assert.ok(profile.sources[0].notes.includes(`sha256 ${data.source.sha256}`));
  });
}

test('the XBASE 999: one controller, several rows, each its own values', () => {
  const x = BUILT.find((b) => b.name === 'xbase-999').profile;
  const modes = x.parameters.filter((p) => p.name === 'Filter Mode');
  assert.deepEqual(modes.map((p) => p.choices.map((c) => `${c.label}=${c.value}`).join(' ')), ['LP=0 HP=1 BP=2 NT=3', 'LP=4 HP=5 BP=6 NT=7']);
  const source = x.parameters.find((p) => p.name === 'HH Source');
  assert.equal(sent(localCompileParameter(x, { parameterId: source.id, value: 'noi' })), 'B0 3E 22');
});
